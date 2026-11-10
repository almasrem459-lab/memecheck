-- RugDNA v1 (D1: memecheck-rugdna). Open data: CC-BY 4.0. Code: MIT.
CREATE TABLE IF NOT EXISTS wallets (
  addr TEXT PRIMARY KEY,
  funder TEXT,                 -- first incoming SOL source (>= 0.005 SOL), NULL until resolved
  funded_at INTEGER,           -- ms, block time of that transfer
  funded_lamports INTEGER,
  state TEXT NOT NULL DEFAULT 'pending',   -- pending | resolved | failed
  why TEXT,                    -- failure reason (busy, no_funder, rpc ...)
  tries INTEGER NOT NULL DEFAULT 0,
  pri INTEGER NOT NULL DEFAULT 0,          -- 2 = user scan / dev lookup, 1 = new launch, 0 = backfill
  first_seen INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_wallets_funder ON wallets(funder);
CREATE INDEX IF NOT EXISTS idx_wallets_pending ON wallets(pri, first_seen) WHERE state = 'pending';

CREATE TABLE IF NOT EXISTS launches (
  mint TEXT PRIMARY KEY,
  creator TEXT NOT NULL,
  created_at INTEGER,          -- ms
  first_seen INTEGER NOT NULL,
  symbol TEXT, name TEXT,
  src TEXT,                    -- cron | scan | dev | tracker
  launchpad TEXT,
  status TEXT NOT NULL DEFAULT 'new',      -- new (<6h, not judged) | live | dead
  rugged INTEGER NOT NULL DEFAULT 0,       -- subset of dead: peak >= $50K and now < 10% of it (or gone)
  grad INTEGER NOT NULL DEFAULT 0,
  dead_at INTEGER,
  peak_mc REAL NOT NULL DEFAULT 0,
  last_mc REAL,
  peak_liq REAL NOT NULL DEFAULT 0,
  last_checked INTEGER
);
CREATE INDEX IF NOT EXISTS idx_launches_creator ON launches(creator);
CREATE INDEX IF NOT EXISTS idx_launches_new ON launches(created_at) WHERE status = 'new';
CREATE INDEX IF NOT EXISTS idx_launches_live ON launches(last_checked) WHERE status = 'live';

CREATE TABLE IF NOT EXISTS funders (
  addr TEXT PRIMARY KEY,
  kind TEXT NOT NULL,          -- ok | cex | service | hub
  label TEXT,
  checked_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS clusters (   -- only funders with >= 2 resolved dev wallets
  funder TEXT PRIMARY KEY,
  wallets INTEGER NOT NULL,
  launches INTEGER NOT NULL,
  dead INTEGER NOT NULL,
  rugged INTEGER NOT NULL,
  grad INTEGER NOT NULL,
  first_seen INTEGER,
  last_seen INTEGER,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clusters_dead ON clusters(dead DESC);

CREATE TABLE IF NOT EXISTS flags (       -- "flagged before rug" ledger
  mint TEXT PRIMARY KEY,
  funder TEXT NOT NULL,
  creator TEXT NOT NULL,
  flagged_at INTEGER NOT NULL,
  token_age_min INTEGER,
  level TEXT NOT NULL,         -- warn | fail
  wallets_n INTEGER, dead_n INTEGER, launches_n INTEGER,
  liq_usd REAL,
  src TEXT,                    -- cron | scan
  shown INTEGER NOT NULL DEFAULT 0,        -- times the warning was served by the mint API
  outcome TEXT NOT NULL DEFAULT 'pending', -- pending | dead | live
  outcome_at INTEGER,
  peak_liq REAL
);
CREATE INDEX IF NOT EXISTS idx_flags_outcome ON flags(outcome);

CREATE TABLE IF NOT EXISTS stats_daily (day TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
