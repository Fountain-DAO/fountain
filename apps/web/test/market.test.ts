import { buy, createPool, MarketError, price, ratio, ratioAtLeast } from '@fountain/engine';
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import {
  createClaim,
  createUser,
  getBalance,
  loadClaim,
  placeTrade,
  TradeError,
} from '../app/.server/market';
import { fromDb, toDb } from '../app/.server/points';

const DAY = 24 * 60 * 60 * 1000;
const db = env.DB;

async function setup(balance = 1_000_000n, funding = 100_000n) {
  const creator = await createUser(db, `creator-${crypto.randomUUID()}`, balance, 0);
  const claimId = await createClaim(
    db,
    {
      creatorId: creator,
      statement: 'This paper replicates',
      evidenceStandard: 'An independent replication is published',
      topic: 'science',
      outcomes: ['True', 'False'],
      funding,
    },
    0,
  );
  return { creator, claimId };
}

async function count(sql: string, ...params: unknown[]) {
  const row = await db
    .prepare(sql)
    .bind(...params)
    .first<{ n: number }>();
  return row!.n;
}

describe('points at the database boundary', () => {
  it('round-trips safe integers and refuses anything that would lose precision', () => {
    expect(fromDb(toDb(9_007_199_254_740_991n))).toBe(9_007_199_254_740_991n);
    expect(() => toDb(9_007_199_254_740_992n)).toThrow(RangeError);
    expect(() => fromDb(1.5)).toThrow(RangeError);
    expect(() => fromDb('12')).toThrow(RangeError);
  });
});

describe('createClaim', () => {
  it('debits the funding and opens the pool at even prices', async () => {
    const { creator, claimId } = await setup(1_000_000n, 100_000n);
    expect(await getBalance(db, creator)).toBe(900_000n);
    const claim = await loadClaim(db, claimId);
    expect(claim.pool).toEqual(createPool(2, 100_000n));
    expect(claim.seq).toBe(1);
  });

  it('writes nothing if the creator cannot afford the funding', async () => {
    const creator = await createUser(db, 'poor-creator', 50n, 0);
    await expect(
      createClaim(
        db,
        {
          creatorId: creator,
          statement: 'x',
          evidenceStandard: 'y',
          topic: 'science',
          outcomes: ['True', 'False'],
          funding: 100n,
        },
        0,
      ),
    ).rejects.toMatchObject({ code: 'insufficient-points' });
    expect(await getBalance(db, creator)).toBe(50n);
    expect(await count('SELECT count(*) AS n FROM claims WHERE creator_id = ?', creator)).toBe(0);
  });
});

describe('placeTrade', () => {
  it('applies exactly what the engine computes', async () => {
    const { claimId } = await setup();
    const trader = await createUser(db, 'trader-a', 10_000n, 0);
    const before = await loadClaim(db, claimId);
    const expected = buy(before.pool, 0, 5_000n, before.fees);

    const result = await placeTrade(
      db,
      { claimId, userId: trader, outcome: 0, amount: 5_000n, minShares: 1n },
      DAY,
    );
    expect(result.shares).toBe(expected.shares);
    expect(result.fee).toBe(expected.fee);
    expect((await loadClaim(db, claimId)).pool).toEqual(expected.pool);
    expect(await getBalance(db, trader)).toBe(5_000n);
    const position = await db
      .prepare('SELECT shares FROM positions WHERE user_id = ? AND claim_id = ? AND outcome = 0')
      .bind(trader, claimId)
      .first<{ shares: number }>();
    expect(fromDb(position!.shares)).toBe(expected.shares);
  });

  it('rejects overspending and leaves everything unchanged', async () => {
    const { claimId } = await setup();
    const trader = await createUser(db, 'trader-b', 100n, 0);
    const before = await loadClaim(db, claimId);
    await expect(
      placeTrade(db, { claimId, userId: trader, outcome: 1, amount: 101n, minShares: 1n }, DAY),
    ).rejects.toMatchObject({ code: 'insufficient-points' });
    expect(await getBalance(db, trader)).toBe(100n);
    expect(await loadClaim(db, claimId)).toEqual(before);
    expect(await count('SELECT count(*) AS n FROM trades WHERE user_id = ?', trader)).toBe(0);
  });

  it('rejects unknown users without writing anything', async () => {
    const { claimId } = await setup();
    const before = await loadClaim(db, claimId);
    await expect(
      placeTrade(db, { claimId, userId: 'nobody', outcome: 0, amount: 10n, minShares: 1n }, DAY),
    ).rejects.toBeInstanceOf(TradeError);
    expect(await loadClaim(db, claimId)).toEqual(before);
  });

  it('fails rather than give fewer shares than the minimum', async () => {
    const { claimId } = await setup();
    const trader = await createUser(db, 'trader-c', 10_000n, 0);
    await expect(
      placeTrade(
        db,
        { claimId, userId: trader, outcome: 0, amount: 1_000n, minShares: 10_000n },
        DAY,
      ),
    ).rejects.toBeInstanceOf(MarketError);
    expect(await getBalance(db, trader)).toBe(10_000n);
  });

  it('serialises concurrent trades: each applies to the state left by the previous one', async () => {
    const { claimId } = await setup();
    const traders = await Promise.all(
      Array.from({ length: 8 }, (_, i) => createUser(db, `racer-${i}`, 50_000n, 0)),
    );
    const results = await Promise.all(
      traders.map((userId, i) =>
        placeTrade(
          db,
          { claimId, userId, outcome: i % 2, amount: BigInt(1_000 * (i + 1)), minShares: 1n },
          DAY,
        ),
      ),
    );
    expect(results.map(r => r.seq).toSorted((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);

    // Replaying the recorded trades in sequence order through the engine gives the stored pool.
    const { results: rows } = await db
      .prepare(
        "SELECT outcome, amount, shares FROM trades WHERE claim_id = ? AND kind = 'buy' ORDER BY seq",
      )
      .bind(claimId)
      .all<{ outcome: number; amount: number; shares: number }>();
    const claim = await loadClaim(db, claimId);
    let pool = createPool(2, 100_000n);
    for (const row of rows) {
      const step = buy(pool, row.outcome, fromDb(row.amount), claim.fees);
      expect(step.shares).toBe(fromDb(row.shares));
      pool = step.pool;
    }
    expect(claim.pool).toEqual(pool);
  });

  it('rejects trades once the clock has filled, even before settlement is recorded', async () => {
    const { claimId } = await setup();
    const trader = await createUser(db, 'trader-d', 1_000_000n, 0);
    // Push True well above 90% at day 1. The clock fills at day 8.
    await placeTrade(
      db,
      { claimId, userId: trader, outcome: 0, amount: 300_000n, minShares: 1n },
      DAY,
    );
    const claim = await loadClaim(db, claimId);
    expect(ratioAtLeast(price(claim.pool, 0), ratio(9n, 10n))).toBe(true);
    expect(claim.clock.tracked).toBe(0);

    await placeTrade(
      db,
      { claimId, userId: trader, outcome: 0, amount: 10n, minShares: 1n },
      7 * DAY,
    );
    await expect(
      placeTrade(
        db,
        { claimId, userId: trader, outcome: 1, amount: 10n, minShares: 1n },
        8 * DAY + 1,
      ),
    ).rejects.toMatchObject({ code: 'settled' });
  });
});
