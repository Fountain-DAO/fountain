import { price, ratioToNumber } from '@fountain/engine';
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import {
  createClaim,
  createUser,
  fundClaim,
  getBalance,
  loadClaim,
  placeTrade,
  settleClaim,
  settleDue,
} from '../app/.server/market';
import { fromDb } from '../app/.server/points';

const DAY = 24 * 60 * 60 * 1000;
const db = env.DB;

async function users(start: bigint, ...names: string[]) {
  return Promise.all(names.map(n => createUser(db, `${n}-${crypto.randomUUID()}`, start, 0)));
}

async function claim(creatorId: string, funding = 100_000n) {
  return createClaim(
    db,
    {
      creatorId,
      statement: 'This result replicates',
      evidenceStandard: 'An independent replication is published',
      topic: 'science',
      outcomes: ['True', 'False'],
      funding,
    },
    0,
  );
}

async function totalBalance(ids: string[]) {
  let sum = 0n;
  for (const id of ids) sum += await getBalance(db, id);
  return sum;
}

describe('fundClaim', () => {
  it('adds liquidity at current prices and records the funder', async () => {
    const [creator, trader, funder] = await users(1_000_000n, 'creator', 'trader', 'funder');
    const claimId = await claim(creator!);
    await placeTrade(
      db,
      { claimId, userId: trader!, outcome: 0, amount: 60_000n, minShares: 1n },
      DAY,
    );
    const before = await loadClaim(db, claimId);

    const funded = await fundClaim(db, { claimId, userId: funder!, amount: 50_000n }, 2 * DAY);
    const after = await loadClaim(db, claimId);
    expect(ratioToNumber(price(after.pool, 0))).toBeCloseTo(
      ratioToNumber(price(before.pool, 0)),
      4,
    );
    expect(after.pool.liquidity).toBe(before.pool.liquidity + funded.liquidity);
    expect(await getBalance(db, funder!)).toBe(950_000n);
    // True is the expensive outcome, so the funder gets True shares back and no False shares.
    expect(funded.shares[0]).toBeGreaterThan(0n);
    expect(funded.shares[1]).toBe(0n);
  });
});

describe('settlement', () => {
  it('does nothing before the clock fills', async () => {
    const [creator, trader] = await users(1_000_000n, 'creator', 'trader');
    const claimId = await claim(creator!);
    await placeTrade(
      db,
      { claimId, userId: trader!, outcome: 0, amount: 300_000n, minShares: 1n },
      DAY,
    );
    expect(await settleClaim(db, claimId, 7 * DAY)).toBeNull();
    expect((await loadClaim(db, claimId)).clock.settledAt).toBeNull();
  });

  it('pays winners one point per share and funders the rest, accounting for every point', async () => {
    const start = 1_000_000n;
    const people = await users(start, 'creator', 'right', 'wrong', 'funder');
    const [creator, right, wrong, funder] = people as [string, string, string, string];
    const claimId = await claim(creator);

    await placeTrade(
      db,
      { claimId, userId: wrong, outcome: 1, amount: 40_000n, minShares: 1n },
      DAY,
    );
    await fundClaim(db, { claimId, userId: funder, amount: 30_000n }, DAY + 1);
    await placeTrade(
      db,
      { claimId, userId: right, outcome: 0, amount: 400_000n, minShares: 1n },
      2 * DAY,
    );
    const final = await loadClaim(db, claimId);
    expect(final.clock.tracked).toBe(0);

    // Positions on each outcome add up to the shares the pool issued.
    for (const outcome of [0, 1]) {
      const row = await db
        .prepare(
          'SELECT coalesce(sum(shares), 0) AS n FROM positions WHERE claim_id = ? AND outcome = ?',
        )
        .bind(claimId, outcome)
        .first<{ n: number }>();
      expect(fromDb(row!.n)).toBe(final.pool.q[outcome]);
    }

    // Other tests' claims may also be due; this one must be among those settled.
    const settlement = (await settleDue(db, 30 * DAY)).find(s => s.claimId === claimId);
    expect(settlement).toMatchObject({ claimId, winner: 0, settledAt: 9 * DAY });
    expect(settlement!.toWinners).toBe(final.pool.q[0]);

    // Every point that went in came out, except rounding dust removed from circulation.
    const settled = await loadClaim(db, claimId);
    expect(await totalBalance(people)).toBe(4n * start - settled.pool.protocolFees);
    expect(settled.pool.protocolFees).toBe(settlement!.dust);
    expect(settlement!.dust).toBeLessThan(2n); // at most one point per funder

    // The wrong side lost its stake; the right side profited.
    expect(await getBalance(db, wrong)).toBe(start - 40_000n);
    expect(await getBalance(db, right)).toBeGreaterThan(start);
  });

  it('pays out exactly once, even when settlement runs race', async () => {
    const [creator, trader] = await users(1_000_000n, 'creator', 'trader');
    const claimId = await claim(creator!);
    await placeTrade(
      db,
      { claimId, userId: trader!, outcome: 0, amount: 300_000n, minShares: 1n },
      DAY,
    );

    const results = await Promise.all([
      settleClaim(db, claimId, 30 * DAY),
      settleClaim(db, claimId, 30 * DAY),
      settleClaim(db, claimId, 30 * DAY),
    ]);
    expect(results.filter(r => r !== null)).toHaveLength(1);
    const balance = await getBalance(db, trader!);

    expect((await settleDue(db, 31 * DAY)).some(s => s.claimId === claimId)).toBe(false);
    expect(await settleClaim(db, claimId, 31 * DAY)).toBeNull();
    expect(await getBalance(db, trader!)).toBe(balance);
    const payouts = await db
      .prepare('SELECT count(*) AS n FROM payouts WHERE claim_id = ? AND user_id = ?')
      .bind(claimId, trader)
      .first<{ n: number }>();
    expect(payouts!.n).toBe(1);
  });

  it('refuses trades and funding once settled', async () => {
    const [creator, trader] = await users(1_000_000n, 'creator', 'trader');
    const claimId = await claim(creator!);
    await placeTrade(
      db,
      { claimId, userId: trader!, outcome: 0, amount: 300_000n, minShares: 1n },
      DAY,
    );
    await settleDue(db, 30 * DAY);
    await expect(
      placeTrade(
        db,
        { claimId, userId: trader!, outcome: 1, amount: 10n, minShares: 1n },
        31 * DAY,
      ),
    ).rejects.toMatchObject({ code: 'settled' });
    await expect(
      fundClaim(db, { claimId, userId: trader!, amount: 10n }, 31 * DAY),
    ).rejects.toMatchObject({ code: 'settled' });
  });
});
