-- Accounts: Sign in with X, sessions, invites and the points ledger.

-- X identity. The X user id never changes; the handle is refreshed on every sign-in.
ALTER TABLE users ADD COLUMN x_user_id TEXT;
CREATE UNIQUE INDEX users_x_user_id ON users (x_user_id);

-- Who invited this user. NULL for admins and for users who haven't joined.
ALTER TABLE users ADD COLUMN invited_by TEXT REFERENCES users (id);
-- When the user redeemed an invite and received points. NULL means signed in but not joined.
ALTER TABLE users ADD COLUMN joined_at INTEGER;
-- Invites the user can still create.
ALTER TABLE users ADD COLUMN invites_left INTEGER NOT NULL DEFAULT 0 CHECK (invites_left >= 0);
-- The weekly allowance has been credited up to this time.
ALTER TABLE users ADD COLUMN allowance_until INTEGER;

-- Sessions. Only a SHA-256 hash of the cookie's token is stored, so a leaked database can't be
-- used to sign in.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE invites (
  code TEXT PRIMARY KEY,
  -- NULL for invites created by an admin outside the invite tree.
  inviter_id TEXT REFERENCES users (id),
  created_at INTEGER NOT NULL
);

CREATE INDEX invites_inviter ON invites (inviter_id);

-- One row per redeemed invite. The primary key makes each invite single-use, and the unique
-- user_id means nobody joins twice.
CREATE TABLE invite_redemptions (
  code TEXT PRIMARY KEY REFERENCES invites (code),
  user_id TEXT NOT NULL UNIQUE REFERENCES users (id),
  redeemed_at INTEGER NOT NULL
);

-- Every change to a balance that isn't a trade, payout or claim funding: the joining grant, the
-- weekly allowance, and slashing. Public, like trades.
CREATE TABLE ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users (id),
  kind TEXT NOT NULL CHECK (kind IN ('grant', 'allowance', 'slash')),
  -- Positive for credits, negative for slashes.
  amount INTEGER NOT NULL,
  reason TEXT,
  -- Identifies the event, so the same grant or allowance period can't be credited twice.
  ref TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, kind, ref)
);

CREATE INDEX ledger_user ON ledger (user_id, created_at);
