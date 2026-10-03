import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import {
  accrueAllowance,
  createInvite,
  createSession,
  deleteSession,
  getSessionUser,
  getUser,
  joinAsAdmin,
  listInvites,
  POINTS,
  redeemInvite,
  slash,
  upsertXUser,
} from '../app/.server/accounts';

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
const db = env.DB;

let nextXId = 1;
async function xUser(handle = `user${nextXId}`) {
  return upsertXUser(db, { userId: String(1_000_000 + nextXId++), handle }, 0);
}

async function member() {
  const admin = await xUser();
  await joinAsAdmin(db, admin.id, 0);
  const code = await createInvite(db, (await getUser(db, admin.id))!, 0, true);
  const user = await xUser();
  await redeemInvite(db, user.id, code, 0);
  return (await getUser(db, user.id))!;
}

describe('X users', () => {
  it('creates an account with no points, then refreshes the handle on later sign-ins', async () => {
    const first = await upsertXUser(db, { userId: '42', handle: 'old_name' }, 0);
    expect(first.balance).toBe(0n);
    expect(first.joinedAt).toBeNull();
    const again = await upsertXUser(db, { userId: '42', handle: 'new_name' }, DAY);
    expect(again.id).toBe(first.id);
    expect(again.handle).toBe('new_name');
  });

  it('lets a new user take a handle someone renamed away from', async () => {
    const a = await upsertXUser(db, { userId: '100', handle: 'popular' }, 0);
    const b = await upsertXUser(db, { userId: '200', handle: 'popular' }, DAY);
    expect(b.handle).toBe('popular');
    expect((await getUser(db, a.id))!.handle).toBe('x-100');
  });
});

describe('invites and joining', () => {
  it('grants the joining points and invites, and records the inviter', async () => {
    const admin = await xUser();
    await joinAsAdmin(db, admin.id, 0);
    const code = await createInvite(db, (await getUser(db, admin.id))!, 0, true);
    const user = await xUser();
    await redeemInvite(db, user.id, code.toLowerCase(), DAY);
    const joined = (await getUser(db, user.id))!;
    expect(joined.balance).toBe(POINTS.joinGrant);
    expect(joined.invitesLeft).toBe(POINTS.invitesPerMember);
    expect(joined.invitedBy).toBe(admin.id);
    expect(joined.joinedAt).toBe(DAY);
    expect(await listInvites(db, admin.id)).toEqual([
      { code, createdAt: 0, redeemedBy: joined.handle },
    ]);
  });

  it('gives members a limited number of invites', async () => {
    const user = await member();
    for (let i = 0; i < POINTS.invitesPerMember; i++) await createInvite(db, user, 0);
    await expect(createInvite(db, user, 0)).rejects.toMatchObject({ code: 'no-invites' });
  });

  it('refuses unknown codes, reused codes, own codes and joining twice', async () => {
    const inviter = await member();
    const code = await createInvite(db, inviter, 0);
    await expect(redeemInvite(db, (await xUser()).id, 'NOPE', 0)).rejects.toMatchObject({
      code: 'invalid-invite',
    });
    await expect(redeemInvite(db, inviter.id, code, 0)).rejects.toMatchObject({
      code: 'invalid-invite',
    });
    const user = await xUser();
    await redeemInvite(db, user.id, code, 0);
    await expect(redeemInvite(db, (await xUser()).id, code, 0)).rejects.toMatchObject({
      code: 'invalid-invite',
    });
    const second = await createInvite(db, inviter, 0);
    await expect(redeemInvite(db, user.id, second, 0)).rejects.toMatchObject({
      code: 'already-joined',
    });
    expect((await getUser(db, user.id))!.balance).toBe(POINTS.joinGrant);
  });

  it('lets only one of two people racing for the same invite join', async () => {
    const inviter = await member();
    const code = await createInvite(db, inviter, 0);
    const [a, b] = [await xUser(), await xUser()];
    const results = await Promise.allSettled([
      redeemInvite(db, a.id, code, 0),
      redeemInvite(db, b.id, code, 0),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const balances = [(await getUser(db, a.id))!.balance, (await getUser(db, b.id))!.balance];
    expect(balances.toSorted()).toEqual([0n, POINTS.joinGrant]);
  });
});

describe('weekly allowance', () => {
  it('credits each whole week, up to the cap', async () => {
    const user = await member();
    expect(await accrueAllowance(db, user, 3 * WEEK + DAY)).toBe(true);
    const after = (await getUser(db, user.id))!;
    expect(after.balance).toBe(POINTS.joinGrant + 3n * POINTS.weeklyAllowance);
    expect(after.allowanceUntil).toBe(3 * WEEK);

    // Fifty years later, the balance stops at the cap.
    await accrueAllowance(db, after, 2600 * WEEK);
    expect((await getUser(db, user.id))!.balance).toBe(POINTS.allowanceCap);
  });

  it('credits a period once, even when two requests race', async () => {
    const user = await member();
    await Promise.all([
      accrueAllowance(db, user, 2 * WEEK),
      accrueAllowance(db, user, 2 * WEEK),
      accrueAllowance(db, user, 2 * WEEK),
    ]);
    expect((await getUser(db, user.id))!.balance).toBe(
      POINTS.joinGrant + 2n * POINTS.weeklyAllowance,
    );
  });

  it('does nothing for users who have not joined', async () => {
    const user = await xUser();
    expect(await accrueAllowance(db, user, 10 * WEEK)).toBe(false);
  });
});

describe('sessions', () => {
  it('signs in with the token, expires, and signs out', async () => {
    const user = await member();
    const { token } = await createSession(db, user.id, 0);
    expect((await getSessionUser(db, token, DAY))?.id).toBe(user.id);
    expect(await getSessionUser(db, `${token}x`, DAY)).toBeNull();
    expect(await getSessionUser(db, token, 31 * DAY)).toBeNull();
    await deleteSession(db, token);
    expect(await getSessionUser(db, token, DAY)).toBeNull();
  });

  it('stores only a hash of the token', async () => {
    const user = await member();
    const { token } = await createSession(db, user.id, 0);
    const row = await db
      .prepare('SELECT count(*) AS n FROM sessions WHERE token_hash = ?')
      .bind(token)
      .first<{ n: number }>();
    expect(row!.n).toBe(0);
  });

  it('credits the allowance when a session is used', async () => {
    const user = await member();
    const { token } = await createSession(db, user.id, 0);
    const later = await getSessionUser(db, token, WEEK + 1);
    expect(later!.balance).toBe(POINTS.joinGrant + POINTS.weeklyAllowance);
  });
});

describe('slashing', () => {
  it('removes up to the requested amount and records why', async () => {
    const user = await member();
    expect(await slash(db, user.id, 400n, 'Sock puppet', DAY)).toBe(400n);
    expect(await slash(db, user.id, 5_000n, 'Sock puppet', DAY)).toBe(600n);
    expect((await getUser(db, user.id))!.balance).toBe(0n);
    const { results } = await db
      .prepare("SELECT amount, reason FROM ledger WHERE user_id = ? AND kind = 'slash'")
      .bind(user.id)
      .all<{ amount: number; reason: string }>();
    expect(results.map(r => r.amount).toSorted((a, b) => a - b)).toEqual([-600, -400]);
    expect(results.every(r => r.reason === 'Sock puppet')).toBe(true);
  });
});
