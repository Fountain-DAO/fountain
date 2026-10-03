-- Points, claims and trades. See MECHANISM.md for the model.
--
-- Every amount of points is a whole number stored as INTEGER. The app converts to and from
-- bigint at the database boundary and refuses values outside JavaScript's safe integer range
-- (±2^53), so nothing is ever silently rounded. Times are milliseconds since the Unix epoch.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  -- Spendable points. The CHECK makes overspending fail the whole write.
  balance INTEGER NOT NULL CHECK (balance >= 0)
);

CREATE TABLE claims (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users (id),
  statement TEXT NOT NULL,
  evidence_standard TEXT NOT NULL,
  topic TEXT NOT NULL,
  created_at INTEGER NOT NULL,

  -- Parameters, fixed when the claim is published.
  threshold_num INTEGER NOT NULL,
  threshold_den INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  drain_num INTEGER NOT NULL,
  drain_den INTEGER NOT NULL,
  fee_ppm INTEGER NOT NULL,
  protocol_share_ppm INTEGER NOT NULL,

  -- Pool state. Shares issued per outcome live in claim_outcomes.
  pool_c INTEGER NOT NULL CHECK (pool_c > 0),
  liquidity INTEGER NOT NULL CHECK (liquidity > 0),
  fee_pool INTEGER NOT NULL CHECK (fee_pool >= 0),
  protocol_fees INTEGER NOT NULL CHECK (protocol_fees >= 0),

  -- Settlement clock.
  clock_tracked INTEGER,
  clock_progress_ms INTEGER NOT NULL,
  clock_updated_at INTEGER NOT NULL,
  -- When the claim will settle if nothing else trades; indexed for the settlement job.
  settles_at INTEGER,
  settled_at INTEGER,
  winner INTEGER,

  -- Sequence number of the latest trade. Each trade inserts seq + 1 into trades, whose primary
  -- key rejects a second writer that read the same state.
  seq INTEGER NOT NULL
);

CREATE INDEX claims_settles_at ON claims (settles_at) WHERE settled_at IS NULL;
CREATE INDEX claims_created_at ON claims (created_at);

CREATE TABLE claim_outcomes (
  claim_id TEXT NOT NULL REFERENCES claims (id),
  outcome INTEGER NOT NULL,
  label TEXT NOT NULL,
  shares_issued INTEGER NOT NULL CHECK (shares_issued >= 0),
  PRIMARY KEY (claim_id, outcome)
);

-- Every change to a claim's pool, in order.
CREATE TABLE trades (
  claim_id TEXT NOT NULL REFERENCES claims (id),
  seq INTEGER NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id),
  kind TEXT NOT NULL CHECK (kind IN ('publish', 'buy', 'fund')),
  -- The outcome bought, for kind = 'buy'.
  outcome INTEGER,
  amount INTEGER NOT NULL CHECK (amount > 0),
  -- Shares received, for kind = 'buy'.
  shares INTEGER,
  fee INTEGER NOT NULL DEFAULT 0,
  -- Liquidity shares received, for kind = 'publish' and 'fund'.
  liquidity INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (claim_id, seq)
);

CREATE INDEX trades_user ON trades (user_id, created_at);

-- Outcome shares held, per user, claim and outcome.
CREATE TABLE positions (
  user_id TEXT NOT NULL REFERENCES users (id),
  claim_id TEXT NOT NULL REFERENCES claims (id),
  outcome INTEGER NOT NULL,
  shares INTEGER NOT NULL CHECK (shares >= 0),
  PRIMARY KEY (user_id, claim_id, outcome)
);

-- Liquidity shares held by each funder of a claim.
CREATE TABLE funders (
  user_id TEXT NOT NULL REFERENCES users (id),
  claim_id TEXT NOT NULL REFERENCES claims (id),
  liquidity INTEGER NOT NULL CHECK (liquidity > 0),
  PRIMARY KEY (user_id, claim_id)
);
