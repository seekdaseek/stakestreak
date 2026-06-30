const Database = require('better-sqlite3');
const db = new Database('stakestreak.db');

// Base schema (fresh installs get v2 columns directly)
const schema = [
"CREATE TABLE IF NOT EXISTS pots (id TEXT PRIMARY KEY, creator TEXT NOT NULL, stake_lamports INTEGER NOT NULL, duration_days INTEGER NOT NULL, start_ts INTEGER, status TEXT DEFAULT 'open', rake_bps INTEGER DEFAULT 300, rule_text TEXT, checkin_start_min INTEGER, checkin_end_min INTEGER, max_members INTEGER, proof_type TEXT DEFAULT 'onchain')",
"CREATE TABLE IF NOT EXISTS members (pot_id TEXT NOT NULL, wallet TEXT NOT NULL, deposit_sig TEXT, status TEXT DEFAULT 'pending', freezes_used INTEGER DEFAULT 0, PRIMARY KEY (pot_id, wallet))",
"CREATE TABLE IF NOT EXISTS checkins (pot_id TEXT NOT NULL, wallet TEXT NOT NULL, day INTEGER NOT NULL, ts INTEGER NOT NULL, sig TEXT, PRIMARY KEY (pot_id, wallet, day))",
"CREATE TABLE IF NOT EXISTS payouts (pot_id TEXT NOT NULL, wallet TEXT NOT NULL, lamports INTEGER NOT NULL, sig TEXT)"
];
schema.forEach(s => db.exec(s));

// Idempotent migrations for EXISTING databases (safe if column already exists)
const migrations = [
  "ALTER TABLE pots ADD COLUMN rule_text TEXT",
  "ALTER TABLE pots ADD COLUMN checkin_start_min INTEGER",
  "ALTER TABLE pots ADD COLUMN checkin_end_min INTEGER",
  "ALTER TABLE pots ADD COLUMN max_members INTEGER",
  "ALTER TABLE pots ADD COLUMN proof_type TEXT DEFAULT 'onchain'",
  "ALTER TABLE checkins ADD COLUMN sig TEXT"
];
for (const m of migrations) {
  try { db.exec(m); } catch (e) {
    if (!String(e.message).includes('duplicate column')) throw e;
  }
}

// Unique index on checkin sig (prevents replaying one tx for multiple days)
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_checkin_sig ON checkins(sig) WHERE sig IS NOT NULL");

module.exports = db;
if (require.main === module) console.log('db ok');
