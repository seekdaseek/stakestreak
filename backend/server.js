const express = require('express');
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const bs58 = require('bs58').default;
const fs = require('fs');
const crypto = require('crypto');
const db = require('./db');

const app = express();
app.use(express.json());

const RPC = process.env.RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');
const secret = fs.readFileSync('treasury.txt','utf8').match(/SECRET: (.+)/)[1].trim();
const treasury = Keypair.fromSecretKey(bs58.decode(secret));
const RAKE_BPS = 300;
const FREEZE_LAMPORTS = 15000000;
const DAY_MS = 86400000;
const CHECKIN_LAMPORTS = 5000;
const LATE_JOIN_MS = 86400000;
function dayFromBlockTime(pot, blockTimeSec){ if(!pot.start_ts) return -1; const diff = blockTimeSec*1000 - pot.start_ts; const GRACE = 120000; if (diff < -GRACE) return -1; if (diff < 0) return 0; return Math.floor(diff/DAY_MS); }
function inWindow(pot, blockTimeSec){ if(pot.checkin_start_min==null||pot.checkin_end_min==null) return true; const d=new Date(blockTimeSec*1000); const min=d.getUTCHours()*60+d.getUTCMinutes(); const a=pot.checkin_start_min,b=pot.checkin_end_min; return a<=b ? (min>=a&&min<=b) : (min>=a||min<=b); }

function potDay(pot) {
  return Math.floor((Date.now() - pot.start_ts) / DAY_MS);
}

// create pot
app.post('/pot', (req, res) => {
  const { creator, stakeSol, durationDays, ruleText, checkinStartMin, checkinEndMin, maxMembers } = req.body;
  if (!creator || !stakeSol || !durationDays) return res.status(400).json({ error: 'missing fields' });
  if (durationDays < 3 || durationDays > 90) return res.status(400).json({ error: 'duration 3-90 days' });
  if (stakeSol < 0.01) return res.status(400).json({ error: 'min stake 0.01 SOL' });
  const win = (checkinStartMin != null || checkinEndMin != null);
  if (win) {
    if (checkinStartMin == null || checkinEndMin == null) return res.status(400).json({ error: 'both window bounds required' });
    if (checkinStartMin < 0 || checkinStartMin > 1439 || checkinEndMin < 0 || checkinEndMin > 1439) return res.status(400).json({ error: 'window minutes 0-1439' });
  }
  if (maxMembers != null && (maxMembers < 3 || maxMembers > 100)) return res.status(400).json({ error: 'maxMembers 3-100' });
  const rule = ruleText ? String(ruleText).slice(0,120) : null;
  const id = crypto.randomBytes(6).toString('hex');
  db.prepare('INSERT INTO pots (id, creator, stake_lamports, duration_days, rule_text, checkin_start_min, checkin_end_min, max_members) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, creator, Math.round(stakeSol * 1e9), durationDays, rule, win?checkinStartMin:null, win?checkinEndMin:null, maxMembers||null);
  res.json({ potId: id, depositTo: treasury.publicKey.toBase58() });
});

// join pot: client sends tx signature of their deposit to treasury
app.post('/pot/:id/join', async (req, res) => {
  const { wallet, sig } = req.body;
  const pot = db.prepare('SELECT * FROM pots WHERE id=?').get(req.params.id);
  if (!pot) return res.status(404).json({ error: 'no pot' });
  if (pot.status === 'settled') return res.status(400).json({ error: 'pot settled' });
  if (pot.status === 'running' && (Date.now() - pot.start_ts) > LATE_JOIN_MS) return res.status(400).json({ error: 'join window closed' });
  if (pot.max_members) { const cnt = db.prepare("SELECT COUNT(*) c FROM members WHERE pot_id=? AND status='active'").get(pot.id).c; if (cnt >= pot.max_members) return res.status(400).json({ error: 'pot full' }); }
  const dup = db.prepare('SELECT 1 FROM members WHERE deposit_sig=?').get(sig);
  if (dup) return res.status(400).json({ error: 'sig reused' });
  try {
    const tx = await conn.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
    if (!tx || tx.meta.err) return res.status(400).json({ error: 'tx not found/failed' });
    const ix = tx.transaction.message.instructions.find(i =>
      i.parsed && i.parsed.type === 'transfer' &&
      i.parsed.info.destination === treasury.publicKey.toBase58() &&
      i.parsed.info.source === wallet &&
      i.parsed.info.lamports >= pot.stake_lamports
    );
    if (!ix) return res.status(400).json({ error: 'deposit not verified' });
    db.prepare('INSERT INTO members (pot_id, wallet, deposit_sig, status) VALUES (?,?,?,?)')
      .run(pot.id, wallet, sig, 'active');
    let autoStarted = false;
    if (pot.status === 'open') {
      const active = db.prepare("SELECT COUNT(*) c FROM members WHERE pot_id=? AND status='active'").get(pot.id).c;
      if (active >= 3) { db.prepare("UPDATE pots SET status='running', start_ts=? WHERE id=?").run(Date.now(), pot.id); autoStarted = true; }
    }
    res.json({ ok: true, autoStarted });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// start pot (creator only)
app.post('/pot/:id/start', (req, res) => {
  const pot = db.prepare('SELECT * FROM pots WHERE id=?').get(req.params.id);
  if (!pot) return res.status(404).json({ error: 'no pot' });
  if (req.body.wallet !== pot.creator) return res.status(403).json({ error: 'not creator' });
  const n = db.prepare("SELECT COUNT(*) c FROM members WHERE pot_id=? AND status='active'").get(pot.id).c;
  if (n < 2) return res.status(400).json({ error: 'need 2+ members' });
  db.prepare("UPDATE pots SET status='running', start_ts=? WHERE id=?").run(Date.now(), pot.id);
  res.json({ ok: true, members: n });
});

// daily checkin
app.post('/pot/:id/checkin', async (req, res) => {
  const { wallet, sig } = req.body;
  if (!wallet || !sig) return res.status(400).json({ error: 'wallet and sig required' });
  const pot = db.prepare("SELECT * FROM pots WHERE id=? AND status='running'").get(req.params.id);
  if (!pot) return res.status(404).json({ error: 'no running pot' });
  const m = db.prepare("SELECT * FROM members WHERE pot_id=? AND wallet=? AND status='active'").get(pot.id, wallet);
  if (!m) return res.status(400).json({ error: 'not active member' });
  const reused = db.prepare('SELECT 1 FROM checkins WHERE sig=?').get(sig) || db.prepare('SELECT 1 FROM members WHERE deposit_sig=?').get(sig) || db.prepare('SELECT 1 FROM payouts WHERE sig=?').get(sig);
  if (reused) return res.status(400).json({ error: 'sig reused' });
  try {
    const tx = await conn.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
    if (!tx || tx.meta.err) return res.status(400).json({ error: 'tx not found/failed' });
    const ix = tx.transaction.message.instructions.find(i => i.parsed && i.parsed.type === 'transfer' && i.parsed.info.destination === treasury.publicKey.toBase58() && i.parsed.info.source === wallet && i.parsed.info.lamports >= CHECKIN_LAMPORTS);
    if (!ix) return res.status(400).json({ error: 'checkin payment not verified' });
    const bt = tx.blockTime;
    if (!bt) return res.status(400).json({ error: 'no blockTime yet, retry shortly' });
    const day = dayFromBlockTime(pot, bt);
    if (day < 0) return res.status(400).json({ error: 'pot not started' });
    if (day >= pot.duration_days) return res.status(400).json({ error: 'pot ended' });
    if (!inWindow(pot, bt)) return res.status(400).json({ error: 'outside check-in window' });
    db.prepare('INSERT INTO checkins (pot_id, wallet, day, ts, sig) VALUES (?,?,?,?,?)').run(pot.id, wallet, day, Date.now(), sig);
    res.json({ ok: true, day, verified: true });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(400).json({ error: 'already checked in / sig used' });
    res.status(500).json({ error: e.message });
  }
});

// eliminate members who missed yesterday (cron calls this)
app.post('/pot/:id/sweep', (req, res) => {
  const pot = db.prepare("SELECT * FROM pots WHERE id=? AND status='running'").get(req.params.id);
  if (!pot) return res.status(404).json({ error: 'no running pot' });
  const day = potDay(pot);
  let eliminated = [];
  for (let d = 0; d < Math.min(day, pot.duration_days); d++) {
    const missed = db.prepare(
      "SELECT m.wallet FROM members m WHERE m.pot_id=? AND m.status='active' AND NOT EXISTS (SELECT 1 FROM checkins c WHERE c.pot_id=m.pot_id AND c.wallet=m.wallet AND c.day=?)"
    ).all(pot.id, d);
    for (const r of missed) {
      db.prepare("UPDATE members SET status='eliminated' WHERE pot_id=? AND wallet=?").run(pot.id, r.wallet);
      eliminated.push(r.wallet);
    }
  }
  res.json({ eliminated });
});

// settle: pay survivors, take rake
app.post('/pot/:id/settle', async (req, res) => {
  const pot = db.prepare("SELECT * FROM pots WHERE id=? AND status='running'").get(req.params.id);
  if (!pot) return res.status(404).json({ error: 'no running pot' });
  if (potDay(pot) < pot.duration_days) return res.status(400).json({ error: 'not ended yet' });
  const all = db.prepare('SELECT * FROM members WHERE pot_id=? AND deposit_sig IS NOT NULL').all(pot.id);
  const survivors = all.filter(m => m.status === 'active');
  if (!survivors.length) return res.status(400).json({ error: 'no survivors, rake takes all... kidding, manual review' });
  const totalPot = all.length * pot.stake_lamports;
  const rake = Math.floor(totalPot * RAKE_BPS / 10000);
  const share = Math.floor((totalPot - rake) / survivors.length);
  const sigs = [];
  try {
    for (const s of survivors) {
      const tx = new Transaction().add(SystemProgram.transfer({
        fromPubkey: treasury.publicKey,
        toPubkey: new PublicKey(s.wallet),
        lamports: share
      }));
      const sig = await sendAndConfirmTransaction(conn, tx, [treasury]);
      db.prepare('INSERT INTO payouts (pot_id, wallet, lamports, sig) VALUES (?,?,?,?)').run(pot.id, s.wallet, share, sig);
      sigs.push(sig);
    }
    db.prepare("UPDATE pots SET status='settled' WHERE id=?").run(pot.id);
    res.json({ ok: true, survivors: survivors.length, sharePerSurvivor: share / 1e9, rakeSol: rake / 1e9, sigs });
  } catch (e) { res.status(500).json({ error: e.message, paidSoFar: sigs }); }
});

// pot status
app.get('/pot/:id', (req, res) => {
  const pot = db.prepare('SELECT * FROM pots WHERE id=?').get(req.params.id);
  if (!pot) return res.status(404).json({ error: 'no pot' });
  const members = db.prepare('SELECT wallet, status FROM members WHERE pot_id=?').all(pot.id);
  res.json({ ...pot, day: pot.start_ts ? potDay(pot) : null, members, depositTo: treasury.publicKey.toBase58(), checkinLamports: CHECKIN_LAMPORTS });
});


// buy streak freeze: verify 0.015 SOL payment, retroactively cover yesterday
app.post('/pot/:id/freeze', async (req, res) => {
  const { wallet, sig } = req.body;
  const pot = db.prepare("SELECT * FROM pots WHERE id=? AND status='running'").get(req.params.id);
  if (!pot) return res.status(404).json({ error: 'no running pot' });
  const m = db.prepare('SELECT * FROM members WHERE pot_id=? AND wallet=?').get(pot.id, wallet);
  if (!m) return res.status(400).json({ error: 'not member' });
  if (m.freezes_used >= 2) return res.status(400).json({ error: 'max 2 freezes per pot' });
  const dup = db.prepare('SELECT 1 FROM members WHERE deposit_sig=? UNION SELECT 1 FROM checkins WHERE 0').get(sig);
  const dupF = db.prepare("SELECT 1 FROM payouts WHERE sig=?").get(sig);
  if (dup || dupF) return res.status(400).json({ error: 'sig reused' });
  try {
    const tx = await conn.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
    if (!tx || tx.meta.err) return res.status(400).json({ error: 'tx not found' });
    const ix = tx.transaction.message.instructions.find(i =>
      i.parsed && i.parsed.type === 'transfer' &&
      i.parsed.info.destination === treasury.publicKey.toBase58() &&
      i.parsed.info.source === wallet &&
      i.parsed.info.lamports >= FREEZE_LAMPORTS
    );
    if (!ix) return res.status(400).json({ error: 'payment not verified' });
    const day = potDay(pot) - 1;
    if (day < 0) return res.status(400).json({ error: 'nothing to freeze' });
    db.prepare('INSERT OR IGNORE INTO checkins (pot_id, wallet, day, ts) VALUES (?,?,?,?)').run(pot.id, wallet, day, Date.now());
    db.prepare("UPDATE members SET status='active', freezes_used=freezes_used+1 WHERE pot_id=? AND wallet=?").run(pot.id, wallet);
    db.prepare('INSERT INTO payouts (pot_id, wallet, lamports, sig) VALUES (?,?,?,?)').run(pot.id, wallet, -FREEZE_LAMPORTS, sig);
    res.json({ ok: true, coveredDay: day, freezesUsed: m.freezes_used + 1 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/dbg',(req,res)=>{console.log('PHONE:',req.query.m);res.json({ok:1})});

// refund deposit if pot never started
app.post('/pot/:id/refund', async (req, res) => {
  const { wallet } = req.body;
  const pot = db.prepare("SELECT * FROM pots WHERE id=? AND status='open'").get(req.params.id);
  if (!pot) return res.status(400).json({ error: 'pot not refundable (already started or settled)' });
  const m = db.prepare("SELECT * FROM members WHERE pot_id=? AND wallet=? AND status='active' AND deposit_sig IS NOT NULL").get(pot.id, wallet);
  if (!m) return res.status(400).json({ error: 'no refundable deposit' });
  try {
    const tx = new Transaction().add(SystemProgram.transfer({
      fromPubkey: treasury.publicKey,
      toPubkey: new PublicKey(wallet),
      lamports: pot.stake_lamports
    }));
    const sig = await sendAndConfirmTransaction(conn, tx, [treasury]);
    db.prepare("UPDATE members SET status='refunded' WHERE pot_id=? AND wallet=?").run(pot.id, wallet);
    db.prepare('INSERT INTO payouts (pot_id, wallet, lamports, sig) VALUES (?,?,?,?)').run(pot.id, wallet, pot.stake_lamports, sig);
    res.json({ ok: true, refunded: pot.stake_lamports / 1e9, sig });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// delete account: remove user data where not in active pots
app.post('/account/delete', (req, res) => {
  const { wallet } = req.body;
  if (!wallet) return res.status(400).json({ error: 'wallet required' });
  const active = db.prepare("SELECT COUNT(*) c FROM members m JOIN pots p ON p.id=m.pot_id WHERE m.wallet=? AND m.status='active' AND p.status='running'").get(wallet).c;
  if (active > 0) return res.status(400).json({ error: 'You are in ' + active + ' running pot(s). Finish or get eliminated first - stakes cannot be abandoned mid-game.' });
  db.prepare("DELETE FROM members WHERE wallet=? AND pot_id IN (SELECT id FROM pots WHERE status IN ('settled'))").run(wallet);
  db.prepare("DELETE FROM checkins WHERE wallet=?").run(wallet);
  res.json({ ok: true, note: 'Off-chain records deleted. On-chain transactions are permanent by nature of the blockchain. Settlement records retained for accounting as permitted by law.' });
});

app.listen(3001, () => console.log('stakestreak on 3001, treasury:', treasury.publicKey.toBase58()));
