// R20 (24 Oct 2026): this backend's Solana Connection goes through rpc-failover.cjs, so a Helius key that is out of credits (429) is passed over to the free public RPC.
// Run: node --test rpc-failover.test.cjs   (loopback servers only; nothing leaves the machine)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const FO = require('./rpc-failover.cjs');

const KEY = 'SECRET-HELIUS-KEY-0123456789';
function serve(handler) {
  const calls = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; });
    req.on('end', () => { let j = null; try { j = JSON.parse(b); } catch { /* none */ } calls.push(j && j.method); const r = handler(j); res.writeHead(r.status || 200, { 'content-type': 'application/json' }); res.end(JSON.stringify(r.body)); });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${srv.address().port}`, calls, close: () => srv.close() })));
}
const ok = (j, result) => ({ body: { jsonrpc: '2.0', id: j.id, result } });
const refuse = (status) => () => ({ status, body: { jsonrpc: '2.0', id: null, error: { code: status, message: 'max usage reached' } } });

test('R20: a primary at 429 (out of credits) is passed over, the primary rests, and the key is in no log line', async () => {
  const primary = await serve(refuse(429)); const fb = await serve((j) => ok(j, { value: 'from-fallback' }));
  const logs = [];
  const ep = FO.create({ name: 'backend', primary: `${primary.url}/?api-key=${KEY}`, fallbacks: [fb.url], log: (l) => logs.push(l) });
  try {
    assert.deepEqual(await ep.call('getLatestBlockhash', []), { value: 'from-fallback' });
    assert.deepEqual(await ep.call('getLatestBlockhash', []), { value: 'from-fallback' });
    assert.equal(primary.calls.length, 1, 'the primary was asked once, then left alone');
    ep.logUsage((l) => logs.push(l));
    assert.ok(logs.some((l) => /rpc_failover/.test(l)) && logs.some((l) => /rpc_usage/.test(l)));
    assert.ok(!logs.join('\n').includes(KEY));
  } finally { primary.close(); fb.close(); }
});

test('R20: a web3.js Connection built the way server.js builds it (fetch: endpoints.fetch) is answered by the fallback while the primary says 429', async (t) => {
  let web3; try { web3 = require('@solana/web3.js'); } catch { t.skip('@solana/web3.js is not installed here (it is on the box)'); return; }
  const primary = await serve(refuse(429)); const fb = await serve((j) => ok(j, { context: { slot: 7 }, value: { blockhash: '4NCYB3kRT8sCNodPNuCZo8VUh4xqpBQxsxed2wd9xaD4', lastValidBlockHeight: 99 } }));
  const ep = FO.create({ name: 'backend', primary: `${primary.url}/?api-key=${KEY}`, fallbacks: [fb.url] });
  try {
    const conn = new web3.Connection(`${primary.url}/?api-key=${KEY}`, { commitment: 'confirmed', fetch: ep.fetch });
    const r = await conn.getLatestBlockhash();
    assert.equal(r.lastValidBlockHeight, 99);
    assert.deepEqual(fb.calls, ['getLatestBlockhash']); assert.equal(primary.calls.length, 1);
  } finally { primary.close(); fb.close(); }
});

test('R20: a devnet primary (the default of an unset RPC) never fails over to the mainnet public RPC', () => {
  const ep = FO.create({ name: 'backend', primary: 'https://api.devnet.solana.com', fallbacks: FO.parseFallbacks(undefined), fetch: () => {} });
  assert.deepEqual(ep.urls, ['https://api.devnet.solana.com']);
});

test('R20 wiring: server.js builds its Connection through the failover (source check; server.js listens on import, so it is read, not run)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert.match(src, /require\('\.\/rpc-failover\.cjs'\)/);
  assert.match(src, /new Connection\(RPC, \{ commitment: 'confirmed', fetch: rpcEndpoints\.fetch \}\)/);
  assert.doesNotMatch(src, /new Connection\(RPC, 'confirmed'\)/, 'no Connection is left that bypasses the failover');
});

test('R20 helper pin: rpc-failover.cjs is byte-identical to AgentFeed lib/rpc-failover.cjs and the copies in seeker-rpc and the other backend', () => {
  const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'rpc-failover.cjs'))).digest('hex');
  assert.equal(sha, 'd5fc1443848c865c9215a7ec2ccdccd0b7350836570cee2c55739baec5ac7666', 'if you changed the helper, change it in all four places and update the four pins');
});
