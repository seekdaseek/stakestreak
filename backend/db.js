const Database = require('better-sqlite3');
const db = new Database('stakestreak.db');
const schema = [
"CREATE TABLE IF NOT EXISTS pots (id TEXT PRIMARY KEY, creator TEXT NOT NULL, stake_lamports INTEGER NOT NULL, duration_days INTEGER NOT NULL, start_ts INTEGER, status TEXT DEFAULT 'open', rake_bps INTEGER DEFAULT 300)",
"CREATE TABLE IF NOT EXISTS members (pot_id TEXT NOT NULL, wallet TEXT NOT NULL, deposit_sig TEXT, status TEXT DEFAULT 'pending', freezes_used INTEGER DEFAULT 0, PRIMARY KEY (pot_id, wallet))",
"CREATE TABLE IF NOT EXISTS checkins (pot_id TEXT NOT NULL, wallet TEXT NOT NULL, day INTEGER NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (pot_id, wallet, day))",
"CREATE TABLE IF NOT EXISTS payouts (pot_id TEXT NOT NULL, wallet TEXT NOT NULL, lamports INTEGER NOT NULL, sig TEXT)"
];
schema.forEach(s => db.exec(s));
module.exports = db;
if (require.main === module) console.log('db ok');
