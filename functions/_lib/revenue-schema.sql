-- D1 database memecheck-revenue (binding REV). Users / sessions / Pro / API keys / watchlist / project profiles / boosts.
-- No KV is used for any of this (KV free-tier write budget is reserved for the scan cache).
CREATE TABLE IF NOT EXISTS users (wallet TEXT PRIMARY KEY, created INTEGER NOT NULL, pro_until INTEGER NOT NULL DEFAULT 0, tg_chat TEXT);
CREATE TABLE IF NOT EXISTS sessions (h TEXT PRIMARY KEY, wallet TEXT NOT NULL, nonce TEXT NOT NULL UNIQUE, exp INTEGER NOT NULL, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_wallet ON sessions(wallet);
CREATE TABLE IF NOT EXISTS payments (tx TEXT PRIMARY KEY, wallet TEXT NOT NULL, kind TEXT NOT NULL, ref TEXT, usdc REAL NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS api_keys (h TEXT PRIMARY KEY, prefix TEXT NOT NULL UNIQUE, wallet TEXT NOT NULL, tier TEXT NOT NULL DEFAULT 'free', until INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS api_keys_wallet ON api_keys(wallet);
CREATE TABLE IF NOT EXISTS watchlist (wallet TEXT NOT NULL, ca TEXT NOT NULL, chain TEXT NOT NULL, sym TEXT, added INTEGER NOT NULL, PRIMARY KEY (wallet, ca));
CREATE TABLE IF NOT EXISTS projects (ca TEXT PRIMARY KEY, chain TEXT NOT NULL, owner TEXT NOT NULL, name TEXT, website TEXT, twitter TEXT, telegram TEXT, descr TEXT, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS boosts (tx TEXT PRIMARY KEY, ca TEXT NOT NULL, chain TEXT NOT NULL, wallet TEXT NOT NULL, start INTEGER NOT NULL, until INTEGER NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS boosts_until ON boosts(until);

-- Exact KV write counter (all KV writers reserve 1 row-increment per write; see functions/_lib/shared.js)
CREATE TABLE IF NOT EXISTS kv_writes (day TEXT NOT NULL, src TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, src)) WITHOUT ROWID;
