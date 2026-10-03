import { fromDb, toDb } from './points';
import type { XIdentity } from './x-oauth';

/** Points policy. See VISION.md, "Why points, for now". */
export const POINTS = {
  /** Granted once, when a user joins by redeeming an invite. */
  joinGrant: 1_000n,
  /** Credited every week... */
  weeklyAllowance: 100n,
  /** ...while the spendable balance is below this. */
  allowanceCap: 2_000n,
  /** Invites each member can give out. */
  invitesPerMember: 3,
};

const WEEK = 7 * 24 * 60 * 60 * 1000;
const SESSION_LIFETIME = 30 * 24 * 60 * 60 * 1000;

export class AccountError extends Error {
  override name = 'AccountError';
  constructor(
    readonly code: 'invalid-invite' | 'already-joined' | 'no-invites' | 'not-joined',
    message: string,
  ) {
    super(message);
  }
}

export interface User {
  readonly id: string;
  readonly handle: string;
  readonly xUserId: string | null;
  readonly balance: bigint;
  readonly joinedAt: number | null;
  readonly invitedBy: string | null;
  readonly invitesLeft: number;
  readonly allowanceUntil: number | null;
}

interface UserRow {
  id: string;
  handle: string;
  x_user_id: string | null;
  balance: number;
  joined_at: number | null;
  invited_by: string | null;
  invites_left: number;
  allowance_until: number | null;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    handle: row.handle,
    xUserId: row.x_user_id,
    balance: fromDb(row.balance),
    joinedAt: row.joined_at,
    invitedBy: row.invited_by,
    invitesLeft: row.invites_left,
    allowanceUntil: row.allowance_until,
  };
}

export async function getUser(db: D1Database, userId: string): Promise<User | null> {
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<UserRow>();
  return row ? toUser(row) : null;
}

/**
 * Finds or creates the user for an X identity, refreshing their handle. If someone else in the
 * database still holds that handle (they renamed on X and this person took it), the stale holder
 * gets a placeholder until they next sign in.
 */
export async function upsertXUser(db: D1Database, x: XIdentity, now: number): Promise<User> {
  await db.batch([
    db
      .prepare(
        `UPDATE users SET handle = 'x-' || coalesce(x_user_id, id)
         WHERE handle = ? AND (x_user_id IS NULL OR x_user_id != ?)`,
      )
      .bind(x.handle, x.userId),
    db
      .prepare(
        `INSERT INTO users (id, handle, x_user_id, created_at, balance) VALUES (?, ?, ?, ?, 0)
         ON CONFLICT (x_user_id) DO UPDATE SET handle = excluded.handle`,
      )
      .bind(crypto.randomUUID(), x.handle, x.userId, now),
  ]);
  const row = await db
    .prepare('SELECT * FROM users WHERE x_user_id = ?')
    .bind(x.userId)
    .first<UserRow>();
  return toUser(row!);
}

// ---- Sessions ----

function randomToken(bytes: number): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Creates a session and returns the token to put in the cookie. */
export async function createSession(db: D1Database, userId: string, now: number) {
  const token = randomToken(32);
  await db
    .prepare(
      'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    )
    .bind(await sha256(token), userId, now, now + SESSION_LIFETIME)
    .run();
  return { token, maxAgeSeconds: SESSION_LIFETIME / 1000 };
}

/** The signed-in user for a session token, with any allowance due credited first. */
export async function getSessionUser(
  db: D1Database,
  token: string,
  now: number,
): Promise<User | null> {
  const row = await db
    .prepare(
      `SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
    )
    .bind(await sha256(token), now)
    .first<UserRow>();
  if (!row) return null;
  const user = toUser(row);
  return (await accrueAllowance(db, user, now)) ? getUser(db, user.id) : user;
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db
    .prepare('DELETE FROM sessions WHERE token_hash = ?')
    .bind(await sha256(token))
    .run();
}

// ---- Points ----

/**
 * Credits the weekly allowance for every whole week since it was last credited, without taking
 * the balance above the cap. Returns whether anything was written. The ledger's unique
 * (user, kind, ref) key, inserted first, means two concurrent requests can't both credit it.
 */
export async function accrueAllowance(db: D1Database, user: User, now: number): Promise<boolean> {
  if (user.joinedAt === null || user.allowanceUntil === null) return false;
  const weeks = Math.floor((now - user.allowanceUntil) / WEEK);
  if (weeks < 1) return false;
  const until = user.allowanceUntil + weeks * WEEK;
  const room = POINTS.allowanceCap - user.balance;
  const due = BigInt(weeks) * POINTS.weeklyAllowance;
  const credit = room <= 0n ? 0n : due < room ? due : room;

  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO ledger (user_id, kind, amount, reason, ref, created_at)
           VALUES (?, 'allowance', ?, ?, ?, ?)`,
        )
        .bind(user.id, toDb(credit), `${weeks} week(s) of allowance`, String(until), now),
      db
        .prepare(
          'UPDATE users SET balance = balance + ?, allowance_until = ? WHERE id = ? AND allowance_until = ?',
        )
        .bind(toDb(credit), until, user.id, user.allowanceUntil),
    ]);
  } catch (e) {
    if (e instanceof Error && /UNIQUE constraint failed: ledger\./.test(e.message)) return false;
    throw e;
  }
  return true;
}

/**
 * Slashes up to `amount` points from a user's balance for abuse, recorded publicly with a reason.
 * Points already staked in claims are untouched. Returns the amount actually removed.
 */
export async function slash(
  db: D1Database,
  userId: string,
  amount: bigint,
  reason: string,
  now: number,
): Promise<bigint> {
  const ref = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `INSERT INTO ledger (user_id, kind, amount, reason, ref, created_at)
         SELECT id, 'slash', -min(balance, ?), ?, ?, ? FROM users WHERE id = ?`,
      )
      .bind(toDb(amount), reason, ref, now, userId),
    db
      .prepare('UPDATE users SET balance = balance - min(balance, ?) WHERE id = ?')
      .bind(toDb(amount), userId),
  ]);
  const row = await db
    .prepare("SELECT amount FROM ledger WHERE user_id = ? AND kind = 'slash' AND ref = ?")
    .bind(userId, ref)
    .first<{ amount: number }>();
  if (!row) throw new AccountError('not-joined', 'No such user to slash');
  return -fromDb(row.amount);
}

// ---- Invites ----

function inviteCode(): string {
  // 10 characters from an alphabet without look-alikes (no 0/O, 1/I/L).
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map(b => alphabet[b % alphabet.length]).join('');
}

/** Creates an invite, spending one of the user's invites. Admins have unlimited invites. */
export async function createInvite(
  db: D1Database,
  user: User,
  now: number,
  isAdmin = false,
): Promise<string> {
  if (user.joinedAt === null) throw new AccountError('not-joined', 'Join first to invite others');
  const code = inviteCode();
  try {
    await db.batch([
      ...(isAdmin
        ? []
        : [
            db
              .prepare('UPDATE users SET invites_left = invites_left - 1 WHERE id = ?')
              .bind(user.id),
          ]),
      db
        .prepare('INSERT INTO invites (code, inviter_id, created_at) VALUES (?, ?, ?)')
        .bind(code, user.id, now),
    ]);
  } catch (e) {
    if (e instanceof Error && /CHECK constraint failed/.test(e.message)) {
      throw new AccountError('no-invites', 'You have no invites left');
    }
    throw e;
  }
  return code;
}

/**
 * Joins Fountain with an invite: grants the joining points and the user's own invites, and records
 * who invited them. Each invite works once, and each user joins once; both are enforced by keys,
 * so racing requests can't double up.
 */
export async function redeemInvite(
  db: D1Database,
  userId: string,
  code: string,
  now: number,
): Promise<void> {
  const invite = await db
    .prepare('SELECT inviter_id FROM invites WHERE code = ?')
    .bind(code.trim().toUpperCase())
    .first<{ inviter_id: string | null }>();
  if (!invite) throw new AccountError('invalid-invite', 'That invite code is not valid');
  if (invite.inviter_id === userId) {
    throw new AccountError('invalid-invite', "You can't redeem your own invite");
  }
  await join(db, userId, now, code.trim().toUpperCase(), invite.inviter_id);
}

/** Admins join without an invite. */
export async function joinAsAdmin(db: D1Database, userId: string, now: number): Promise<void> {
  await join(db, userId, now, null, null);
}

async function join(
  db: D1Database,
  userId: string,
  now: number,
  code: string | null,
  inviterId: string | null,
) {
  try {
    await db.batch([
      // The grant first: its unique key fails the whole batch if this user has already joined.
      db
        .prepare(
          `INSERT INTO ledger (user_id, kind, amount, reason, ref, created_at)
           VALUES (?, 'grant', ?, 'Joined Fountain', 'join', ?)`,
        )
        .bind(userId, toDb(POINTS.joinGrant), now),
      ...(code === null
        ? []
        : [
            db
              .prepare(
                'INSERT INTO invite_redemptions (code, user_id, redeemed_at) VALUES (?, ?, ?)',
              )
              .bind(code, userId, now),
          ]),
      db
        .prepare(
          `UPDATE users SET balance = balance + ?, joined_at = ?, invited_by = ?, invites_left = ?,
             allowance_until = ?
           WHERE id = ?`,
        )
        .bind(toDb(POINTS.joinGrant), now, inviterId, POINTS.invitesPerMember, now, userId),
    ]);
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (/UNIQUE constraint failed: ledger\./.test(message)) {
      throw new AccountError('already-joined', "You've already joined");
    }
    if (/UNIQUE constraint failed: invite_redemptions\.code|PRIMARY KEY/.test(message)) {
      throw new AccountError('invalid-invite', 'That invite has already been used');
    }
    throw e;
  }
}

export interface InviteStatus {
  readonly code: string;
  readonly createdAt: number;
  readonly redeemedBy: string | null;
}

export async function listInvites(db: D1Database, userId: string): Promise<InviteStatus[]> {
  const { results } = await db
    .prepare(
      `SELECT invites.code, invites.created_at, users.handle AS redeemed_by
       FROM invites
       LEFT JOIN invite_redemptions r ON r.code = invites.code
       LEFT JOIN users ON users.id = r.user_id
       WHERE invites.inviter_id = ? ORDER BY invites.created_at DESC`,
    )
    .bind(userId)
    .all<{ code: string; created_at: number; redeemed_by: string | null }>();
  return results.map(r => ({ code: r.code, createdAt: r.created_at, redeemedBy: r.redeemed_by }));
}
