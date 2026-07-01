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
async function getTxWithRetry(sig, tries = 5, delayMs = 2000) {
  for (let i = 0; i < tries; i++) {
    const tx = await conn.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
    if (tx) return tx;
    if (i < tries - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  return null;
}
const secret = fs.readFileSync('treasury.txt','utf8').match(/SECRET: (.+)/)[1].trim();
const treasury = Keypair.fromSecretKey(bs58.decode(secret));
const RAKE_BPS = 300;
const REVENUE_WALLET = '4a8o45skRPcyjAdyR8yES215Swvh8uTpZD6KLarhxCJ7'; // cj7 - rake destination
const FREEZE_LAMPORTS = 15000000;
const DAY_MS = 86400000;
const CHECKIN_LAMPORTS = 5000;
const LATE_JOIN_MS = 86400000;
function dayFromBlockTime(pot, blockTimeSec){ if(!pot.start_ts) return -1; const diff = blockTimeSec*1000 - pot.start_ts; const GRACE = 120000; if (diff < -GRACE) return -1; if (diff < 0) return 0; return Math.floor(diff/DAY_MS); }
const SLOT_GRACE_MIN = 10; // fixed 10-min grace per slot
// parse a pot's slots: JSON array of minutes-into-local-day, e.g. [600,900] = 10:00 & 15:00. null/empty = anytime.
function potSlots(pot){ try { const a = pot.checkin_slots ? JSON.parse(pot.checkin_slots) : null; return Array.isArray(a) && a.length ? a : null; } catch { return null; } }
// given a tx blockTime (sec) and a member tz_offset (minutes, JS getTimezoneOffset convention: UTC = local + offset... we store -getTimezoneOffset so local = UTC + tz),
// return which slot index it satisfies, or -1. If pot has no slots, returns 0 (anytime counts as slot 0).
function matchSlot(pot, blockTimeSec, tzOffsetMin){
  const slots = potSlots(pot);
  if (!slots) return 0; // anytime pot: single implicit slot 0
  const utcMin = Math.floor((blockTimeSec*1000) / 60000); // total minutes UTC
  const localMin = utcMin + (tzOffsetMin || 0); // shift to member local
  const minOfDay = ((localMin % 1440) + 1440) % 1440; // 0..1439 local minute-of-day
  for (let i=0;i<slots.length;i++){
    const target = slots[i];
    let diff = minOfDay - target;
    // handle wrap near midnight
    if (diff > 720) diff -= 1440; if (diff < -720) diff += 1440;
    if (Math.abs(diff) <= SLOT_GRACE_MIN) return i;
  }
  return -1;
}

function potDay(pot) {
  const d = Math.floor((Date.now() - pot.start_ts) / DAY_MS);
  return Math.min(d, pot.duration_days);
}

// create pot
app.post('/pot', (req, res) => {
  const { creator, stakeSol, durationDays, ruleText, checkinStartMin, checkinEndMin, maxMembers } = req.body;
  if (!creator || !stakeSol || !durationDays) return res.status(400).json({ error: 'missing fields' });
  if (durationDays < 2 || durationDays > 90) return res.status(400).json({ error: 'duration 2-90 days' });
  if (stakeSol < 0.01) return res.status(400).json({ error: 'min stake 0.01 SOL' });
  const win = (checkinStartMin != null || checkinEndMin != null);
  if (win) {
    if (checkinStartMin == null || checkinEndMin == null) return res.status(400).json({ error: 'both window bounds required' });
    if (checkinStartMin < 0 || checkinStartMin > 1439 || checkinEndMin < 0 || checkinEndMin > 1439) return res.status(400).json({ error: 'window minutes 0-1439' });
  }
  if (maxMembers != null && (maxMembers < 3 || maxMembers > 100)) return res.status(400).json({ error: 'maxMembers 3-100' });
  const rule = ruleText ? String(ruleText).slice(0,120) : null;
  const id = crypto.randomBytes(6).toString('hex');
  let slotsJson = null;
  if (Array.isArray(req.body.checkinSlots) && req.body.checkinSlots.length) {
    const cleaned = req.body.checkinSlots.map(n=>parseInt(n)).filter(n=>!isNaN(n)&&n>=0&&n<=1439).slice(0,4);
    if (cleaned.length) slotsJson = JSON.stringify(cleaned);
  }
  db.prepare('INSERT INTO pots (id, creator, stake_lamports, duration_days, rule_text, max_members, created_at, checkin_slots) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, creator, Math.round(stakeSol * 1e9), durationDays, rule, maxMembers||null, Date.now(), slotsJson);
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
    const tx = await getTxWithRetry(sig);
    if (!tx || tx.meta.err) return res.status(400).json({ error: 'tx not found/failed' });
    const ix = tx.transaction.message.instructions.find(i =>
      i.parsed && i.parsed.type === 'transfer' &&
      i.parsed.info.destination === treasury.publicKey.toBase58() &&
      i.parsed.info.source === wallet &&
      i.parsed.info.lamports >= pot.stake_lamports
    );
    if (!ix) {
      // AUTO-REFUND SAFETY NET: if a real deposit landed in the treasury but the join
      // could not be completed (e.g. wallet field mismatch), send it back to the actual payer.
      const depositToTreasury = tx.transaction.message.instructions.find(i =>
        i.parsed && i.parsed.type === 'transfer' &&
        i.parsed.info.destination === treasury.publicKey.toBase58() &&
        i.parsed.info.lamports > 0
      );
      if (depositToTreasury) {
        const refundTo = depositToTreasury.parsed.info.source;
        const refundLamports = depositToTreasury.parsed.info.lamports;
        // guard: never refund the same sig twice
        const already = db.prepare('SELECT 1 FROM members WHERE deposit_sig=?').get(sig) || db.prepare('SELECT 1 FROM payouts WHERE sig=?').get(sig);
        if (already) return res.status(400).json({ error: 'deposit already processed' });
        try {
          const { blockhash } = await conn.getLatestBlockhash();
          const rtx = new Transaction({ recentBlockhash: blockhash, feePayer: treasury.publicKey });
          rtx.add(SystemProgram.transfer({ fromPubkey: treasury.publicKey, toPubkey: new PublicKey(refundTo), lamports: refundLamports }));
          const rsig = await conn.sendTransaction(rtx, [treasury]);
          await conn.confirmTransaction(rsig, 'confirmed');
          db.prepare('INSERT INTO payouts (pot_id, wallet, lamports, sig) VALUES (?,?,?,?)').run(pot.id, refundTo, refundLamports, rsig);
          console.log('AUTO-REFUND:', refundLamports/1e9, 'SOL to', refundTo, 'sig', rsig);
          return res.status(400).json({ error: 'deposit could not be credited (wallet mismatch) — auto-refunded to payer', refunded: refundLamports/1e9, refundSig: rsig });
        } catch (re) {
          console.log('AUTO-REFUND FAILED:', re.message);
          return res.status(500).json({ error: 'deposit not credited and auto-refund failed — contact support', detail: re.message });
        }
      }
      return res.status(400).json({ error: 'no deposit found in transaction' });
    }
    db.prepare('INSERT INTO members (pot_id, wallet, deposit_sig, status, tz_offset) VALUES (?,?,?,?,?)')
      .run(pot.id, wallet, sig, 'active', (typeof req.body.tzOffset === 'number' ? req.body.tzOffset : 0));
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
    const tx = await getTxWithRetry(sig);
    if (!tx || tx.meta.err) return res.status(400).json({ error: 'tx not found/failed' });
    const ix = tx.transaction.message.instructions.find(i => i.parsed && i.parsed.type === 'transfer' && i.parsed.info.destination === treasury.publicKey.toBase58() && i.parsed.info.source === wallet && i.parsed.info.lamports >= CHECKIN_LAMPORTS);
    if (!ix) return res.status(400).json({ error: 'checkin payment not verified' });
    const bt = tx.blockTime;
    if (!bt) return res.status(400).json({ error: 'no blockTime yet, retry shortly' });
    const day = dayFromBlockTime(pot, bt);
    if (day < 0) return res.status(400).json({ error: 'pot not started' });
    if (day >= pot.duration_days) return res.status(400).json({ error: 'pot ended' });
    const slot = matchSlot(pot, bt, m.tz_offset);
    if (slot < 0) return res.status(400).json({ error: 'not within any check-in time slot (10 min grace)' });
    db.prepare('INSERT INTO checkins (pot_id, wallet, day, ts, sig, slot) VALUES (?,?,?,?,?,?)').run(pot.id, wallet, day, Date.now(), sig, slot);
    const slots = potSlots(pot);
    const doneToday = db.prepare('SELECT COUNT(DISTINCT slot) c FROM checkins WHERE pot_id=? AND wallet=? AND day=?').get(pot.id, wallet, day).c;
    const needed = slots ? slots.length : 1;
    res.json({ ok: true, day, slot, slotsDone: doneToday, slotsNeeded: needed, verified: true });
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
  const slots = potSlots(pot);
  const needed = slots ? slots.length : 1;
  let eliminated = [];
  // for each COMPLETED day, a member must have satisfied ALL required slots (distinct slot count >= needed)
  for (let d = 0; d < Math.min(day, pot.duration_days); d++) {
    const actives = db.prepare("SELECT wallet FROM members WHERE pot_id=? AND status='active'").all(pot.id);
    for (const a of actives) {
      const done = db.prepare("SELECT COUNT(DISTINCT slot) c FROM checkins WHERE pot_id=? AND wallet=? AND day=?").get(pot.id, a.wallet, d).c;
      if (done < needed) {
        db.prepare("UPDATE members SET status='eliminated' WHERE pot_id=? AND wallet=?").run(pot.id, a.wallet);
        eliminated.push(a.wallet);
      }
    }
  }
  res.json({ eliminated, slotsRequired: needed });
});

// settle: rake ALREADY taken at lock. Split full pot among survivors.
// No survivors -> sweep leftover pot to REVENUE (cj7) so nothing is stuck.
app.post('/pot/:id/settle', async (req, res) => {
  const pot = db.prepare("SELECT * FROM pots WHERE id=? AND status='running'").get(req.params.id);
  if (!pot) return res.status(404).json({ error: 'no running pot' });
  if (potDay(pot) < pot.duration_days) return res.status(400).json({ error: 'not ended yet' });
  const all = db.prepare('SELECT * FROM members WHERE pot_id=? AND deposit_sig IS NOT NULL').all(pot.id);
  const survivors = all.filter(m => m.status === 'active');
  const totalPot = all.length * pot.stake_lamports;
  const rakeAtLock = pot.rake_taken ? Math.floor(totalPot * RAKE_BPS / 10000) : 0;
  const pool = totalPot - rakeAtLock; // rake already left treasury at lock
  const sigs = [];
  try {
    if (!survivors.length) {
      // edge case: everyone eliminated. Sweep remaining pool to revenue wallet.
      const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: treasury.publicKey, toPubkey: new PublicKey(REVENUE_WALLET), lamports: pool }));
      const sig = await sendAndConfirmTransaction(conn, tx, [treasury]);
      db.prepare('INSERT INTO payouts (pot_id, wallet, lamports, sig) VALUES (?,?,?,?)').run(pot.id, REVENUE_WALLET, pool, sig);
      db.prepare("UPDATE pots SET status='settled' WHERE id=?").run(pot.id);
      return res.json({ ok: true, survivors: 0, noSurvivorsSweptToRevenue: pool / 1e9, sigs: [sig] });
    }
    const share = Math.floor(pool / survivors.length);
    for (const s of survivors) {
      const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: treasury.publicKey, toPubkey: new PublicKey(s.wallet), lamports: share }));
      const sig = await sendAndConfirmTransaction(conn, tx, [treasury]);
      db.prepare('INSERT INTO payouts (pot_id, wallet, lamports, sig) VALUES (?,?,?,?)').run(pot.id, s.wallet, share, sig);
      sigs.push(sig);
    }
    db.prepare("UPDATE pots SET status='settled' WHERE id=?").run(pot.id);
    res.json({ ok: true, survivors: survivors.length, sharePerSurvivor: share / 1e9, sigs });
  } catch (e) { res.status(500).json({ error: e.message, paidSoFar: sigs }); }
});

// pot status

app.get('/pots/feed', (req, res) => {
  const now = Date.now();
  const FILL_MS = 24 * 3600 * 1000;
  const rows = db.prepare("SELECT * FROM pots WHERE status IN ('open','running','settled','dead') ORDER BY created_at DESC").all();
  const shape = (p) => {
    const members = db.prepare("SELECT wallet, status FROM members WHERE pot_id=?").all(p.id);
    const activeCount = members.filter(m => m.status === 'active').length;
    const fillEndsAt = p.created_at ? p.created_at + FILL_MS : null;
    let slots = null; try { const a = p.checkin_slots ? JSON.parse(p.checkin_slots) : null; slots = Array.isArray(a) && a.length ? a : null; } catch {}
    return {
      id: p.id, rule_text: p.rule_text, stake_lamports: p.stake_lamports,
      duration_days: p.duration_days, status: p.status, locked: p.locked,
      day: p.start_ts ? Math.max(0, Math.floor((now - p.start_ts) / 86400000)) : null,
      memberCount: members.length, activeCount, fillEndsAt, slots,
      rakeBps: RAKE_BPS,
    };
  };
  const joinable = [], active = [], finished = [];
  for (const p of rows) {
    const o = shape(p);
    const canJoin = p.status === 'open' && !p.locked && o.fillEndsAt && o.fillEndsAt > now;
    if (canJoin) joinable.push(o);
    else if (p.status === 'running') active.push(o);
    else finished.push(o);
  }
  res.json({ joinable, active, finished: finished.slice(0, 20) });
});

app.get('/pot/:id', (req, res) => {
  const pot = db.prepare('SELECT * FROM pots WHERE id=?').get(req.params.id);
  if (!pot) return res.status(404).json({ error: 'no pot' });
  const members = db.prepare('SELECT wallet, status FROM members WHERE pot_id=?').all(pot.id);
  const activeCount = members.filter(m => m.status === 'active').length;
  const fillEndsAt = pot.created_at ? pot.created_at + LATE_JOIN_MS : null;
  res.json({ ...pot, day: pot.start_ts ? potDay(pot) : null, members, activeCount, fillEndsAt, slots: potSlots(pot), graceMin: SLOT_GRACE_MIN, depositTo: treasury.publicKey.toBase58(), checkinLamports: CHECKIN_LAMPORTS, rakeBps: RAKE_BPS });
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
    const tx = await getTxWithRetry(sig);
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

// LOCK pot + take 3% rake to revenue wallet (cron calls this at 24h-from-creation if >=3 members)
app.post('/pot/:id/lock', async (req, res) => {
  const pot = db.prepare("SELECT * FROM pots WHERE id=?").get(req.params.id);
  if (!pot) return res.status(404).json({ error: 'no pot' });
  if (pot.locked) return res.status(400).json({ error: 'already locked' });
  if (pot.status === 'dead' || pot.status === 'settled') return res.status(400).json({ error: 'pot finished' });
  const active = db.prepare("SELECT * FROM members WHERE pot_id=? AND status='active' AND deposit_sig IS NOT NULL").all(pot.id);
  if (active.length < 3) return res.status(400).json({ error: 'under 3 members, should be refunded not locked' });
  try {
    // ensure running
    if (pot.status === 'open' && !pot.start_ts) {
      db.prepare("UPDATE pots SET status='running', start_ts=? WHERE id=?").run(Date.now(), pot.id);
    }
    let rakeSig = null;
    if (!pot.rake_taken) {
      const totalPot = active.length * pot.stake_lamports;
      const rake = Math.floor(totalPot * RAKE_BPS / 10000);
      if (rake > 0) {
        const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: treasury.publicKey, toPubkey: new PublicKey(REVENUE_WALLET), lamports: rake }));
        rakeSig = await sendAndConfirmTransaction(conn, tx, [treasury]);
        db.prepare('INSERT INTO payouts (pot_id, wallet, lamports, sig) VALUES (?,?,?,?)').run(pot.id, REVENUE_WALLET, rake, rakeSig);
      }
      db.prepare("UPDATE pots SET rake_taken=1, rake_sig=? WHERE id=?").run(rakeSig, pot.id);
    }
    db.prepare("UPDATE pots SET locked=1 WHERE id=?").run(pot.id);
    res.json({ ok: true, locked: true, members: active.length, rakeSig });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// REFUND all members of an unfilled pot, mark dead (cron calls at 24h if <3 members)
app.post('/pot/:id/killunfilled', async (req, res) => {
  const pot = db.prepare("SELECT * FROM pots WHERE id=?").get(req.params.id);
  if (!pot) return res.status(404).json({ error: 'no pot' });
  if (pot.status === 'dead' || pot.status === 'settled') return res.status(400).json({ error: 'already finished' });
  const active = db.prepare("SELECT * FROM members WHERE pot_id=? AND status='active' AND deposit_sig IS NOT NULL").all(pot.id);
  if (active.length >= 3) return res.status(400).json({ error: 'has 3+ members, should lock not kill' });
  const sigs = [];
  try {
    for (const m of active) {
      const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: treasury.publicKey, toPubkey: new PublicKey(m.wallet), lamports: pot.stake_lamports }));
      const sig = await sendAndConfirmTransaction(conn, tx, [treasury]);
      db.prepare('INSERT INTO payouts (pot_id, wallet, lamports, sig) VALUES (?,?,?,?)').run(pot.id, m.wallet, pot.stake_lamports, sig);
      db.prepare("UPDATE members SET status='refunded' WHERE pot_id=? AND wallet=?").run(pot.id, m.wallet);
      sigs.push(sig);
    }
    db.prepare("UPDATE pots SET status='dead' WHERE id=?").run(pot.id);
    res.json({ ok: true, refunded: active.length, sigs });
  } catch (e) { res.status(500).json({ error: e.message, paidSoFar: sigs }); }
});

app.listen(3002, () => console.log('stakestreak on 3002, treasury:', treasury.publicKey.toBase58()));
