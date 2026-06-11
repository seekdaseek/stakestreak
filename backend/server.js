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

function potDay(pot) {
  return Math.floor((Date.now() - pot.start_ts) / DAY_MS);
}

// create pot
app.post('/pot', (req, res) => {
  const { creator, stakeSol, durationDays } = req.body;
  if (!creator || !stakeSol || !durationDays) return res.status(400).json({ error: 'missing fields' });
  if (durationDays < 3 || durationDays > 90) return res.status(400).json({ error: 'duration 3-90 days' });
  const id = crypto.randomBytes(6).toString('hex');
  db.prepare('INSERT INTO pots (id, creator, stake_lamports, duration_days) VALUES (?,?,?,?)')
    .run(id, creator, Math.round(stakeSol * 1e9), durationDays);
  res.json({ potId: id, depositTo: treasury.publicKey.toBase58() });
});

// join pot: client sends tx signature of their deposit to treasury
app.post('/pot/:id/join', async (req, res) => {
  const { wallet, sig } = req.body;
  const pot = db.prepare('SELECT * FROM pots WHERE id=?').get(req.params.id);
  if (!pot) return res.status(404).json({ error: 'no pot' });
  if (pot.status !== 'open') return res.status(400).json({ error: 'pot not open' });
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
    res.json({ ok: true });
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
app.post('/pot/:id/checkin', (req, res) => {
  const { wallet } = req.body;
  const pot = db.prepare("SELECT * FROM pots WHERE id=? AND status='running'").get(req.params.id);
  if (!pot) return res.status(404).json({ error: 'no running pot' });
  const m = db.prepare("SELECT * FROM members WHERE pot_id=? AND wallet=? AND status='active'").get(pot.id, wallet);
  if (!m) return res.status(400).json({ error: 'not active member' });
  const day = potDay(pot);
  if (day >= pot.duration_days) return res.status(400).json({ error: 'pot ended' });
  try {
    db.prepare('INSERT INTO checkins (pot_id, wallet, day, ts) VALUES (?,?,?,?)').run(pot.id, wallet, day, Date.now());
    res.json({ ok: true, day });
  } catch (e) { res.status(400).json({ error: 'already checked in' }); }
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
  res.json({ ...pot, day: pot.start_ts ? potDay(pot) : null, members });
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

app.listen(3001, () => console.log('stakestreak on 3001, treasury:', treasury.publicKey.toBase58()));
