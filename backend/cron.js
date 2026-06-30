// StakeStreak v3 cron — runs hourly. Orchestrates the pot lifecycle:
//  - Pots past 24h fill window: LOCK+rake (>=3 members) or REFUND+kill (<3)
//  - Running locked pots: SWEEP (eliminate missers) then SETTLE if past duration
const db = require('./db');
const DAY_MS = 86400000;
const FILL_MS = 86400000; // 24h fill window from created_at

async function post(path) {
  const r = await fetch('http://localhost:3002' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
  });
  let j; try { j = await r.json(); } catch { j = { status: r.status }; }
  return j;
}

(async () => {
  const now = Date.now();

  // 1) FILL-WINDOW RESOLUTION: pots past 24h from creation, not yet locked/dead/settled
  const filling = db.prepare(
    "SELECT * FROM pots WHERE status IN ('open','running') AND locked=0 AND created_at IS NOT NULL"
  ).all();
  for (const p of filling) {
    if (now - p.created_at < FILL_MS) continue; // still within 24h fill window
    const active = db.prepare(
      "SELECT COUNT(*) c FROM members WHERE pot_id=? AND status='active' AND deposit_sig IS NOT NULL"
    ).get(p.id).c;
    if (active >= 3) {
      const r = await post('/pot/' + p.id + '/lock');
      console.log(p.id, 'LOCK+rake:', JSON.stringify(r));
    } else {
      const r = await post('/pot/' + p.id + '/killunfilled');
      console.log(p.id, 'REFUND+kill (under 3):', JSON.stringify(r));
    }
  }

  // 2) RUNNING pots: sweep missers, then settle if past duration
  const running = db.prepare("SELECT * FROM pots WHERE status='running'").all();
  for (const p of running) {
    if (!p.start_ts) continue;
    const sweep = await post('/pot/' + p.id + '/sweep');
    if (sweep.eliminated?.length) console.log(p.id, 'eliminated:', sweep.eliminated);
    const day = Math.floor((now - p.start_ts) / DAY_MS);
    if (day >= p.duration_days) {
      const s = await post('/pot/' + p.id + '/settle');
      console.log(p.id, 'SETTLE:', JSON.stringify(s));
    }
  }
})();
