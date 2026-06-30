const Database = require('better-sqlite3');
const db = new Database('stakestreak.db');

// Base schema (fresh installs get v2 columns directly)
const schema = [
"CREATE TABLE IF NOT EXISTS pots (id TEXT PRIMARY KEY, creator TEXT NOT NULL, stake_lamports INTEGER NOT NULL, duration_days INTEGER NOT NULL, start_ts INTEGER, status TEXT DEFAULT 'open', rake_bps INTEGER DEFAULT 300, rule_text TEXT, checkin_start_min INTEGER, checkin_end_min INTEGER, max_members INTEGER, proof_type TEXT DEFAULT 'onchain', created_at INTEGER, locked INTEGER DEFAULT 0, rake_taken INTEGER DEFAULT 0, rake_sig TEXT, checkin_slots TEXT)",
"CREATE TABLE IF NOT EXISTS members (pot_id TEXT NOT NULL, wallet TEXT NOT NULL, deposit_sig TEXT, status TEXT DEFAULT 'pending', freezes_used INTEGER DEFAULT 0, tz_offset INTEGER, PRIMARY KEY (pot_id, wallet))",
"CREATE TABLE IF NOT EXISTS checkins (pot_id TEXT NOT NULL, wallet TEXT NOT NULL, day INTEGER NOT NULL, ts INTEGER NOT NULL, sig TEXT, slot INTEGER DEFAULT 0, PRIMARY KEY (pot_id, wallet, day, slot))",
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
  "ALTER TABLE checkins ADD COLUMN sig TEXT",
  "ALTER TABLE pots ADD COLUMN created_at INTEGER",
  "ALTER TABLE pots ADD COLUMN locked INTEGER DEFAULT 0",
  "ALTER TABLE pots ADD COLUMN rake_taken INTEGER DEFAULT 0",
  "ALTER TABLE pots ADD COLUMN rake_sig TEXT",
  "ALTER TABLE pots ADD COLUMN checkin_slots TEXT",
  "ALTER TABLE members ADD COLUMN tz_offset INTEGER",
  "ALTER TABLE checkins ADD COLUMN slot INTEGER DEFAULT 0"
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
