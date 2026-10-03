-- Settlement. A settlement is recorded in the trades log, so it takes the next sequence number
-- like any other change and can't race a trade. Payouts are recorded per user, and their primary
-- key makes paying a claim twice impossible.
--
-- SQLite can't change a CHECK constraint in place, so trades is rebuilt: settlements have no user,
-- and their amount is the total paid out, which can be zero.

CREATE TABLE trades_new (
  claim_id TEXT NOT NULL REFERENCES claims (id),
  seq INTEGER NOT NULL,
  user_id TEXT REFERENCES users (id),
  kind TEXT NOT NULL CHECK (kind IN ('publish', 'buy', 'fund', 'settle')),
  -- The outcome bought for 'buy', or the winning outcome for 'settle'.
  outcome INTEGER,
  -- Points paid in, or for 'settle', points paid out.
  amount INTEGER NOT NULL CHECK (amount >= 0),
  -- Shares received, for 'buy'.
  shares INTEGER,
  fee INTEGER NOT NULL DEFAULT 0,
  -- Liquidity shares received, for 'publish' and 'fund'.
  liquidity INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (claim_id, seq),
  CHECK ((kind = 'settle') = (user_id IS NULL))
);

INSERT INTO trades_new (claim_id, seq, user_id, kind, outcome, amount, shares, fee, liquidity, created_at)
SELECT claim_id, seq, user_id, kind, outcome, amount, shares, fee, liquidity, created_at FROM trades;

DROP TABLE trades;
ALTER TABLE trades_new RENAME TO trades;
CREATE INDEX trades_user ON trades (user_id, created_at);

CREATE TABLE payouts (
  claim_id TEXT NOT NULL REFERENCES claims (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  -- 'shares': winning shares at one point each. 'funding': a funder's share of the pool.
  kind TEXT NOT NULL CHECK (kind IN ('shares', 'funding')),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (claim_id, user_id, kind)
);

CREATE INDEX payouts_user ON payouts (user_id, created_at);
