import { describe, expect, it } from 'vitest';
import {
  addFunding,
  assertInvariant,
  buy,
  createPool,
  funderPayout,
  funderPayoutTotal,
  MarketError,
  price,
  priceAtLeast,
  ratio,
  ratioToNumber,
  reserves,
  type FeeSchedule,
  type Pool,
} from '../src/index.ts';

const NINETY_PERCENT = ratio(9n, 10n);

/** Small deterministic PRNG so failures are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBigInt(next: () => number, max: bigint): bigint {
  return (BigInt(Math.floor(next() * 2 ** 32)) * max) / 2n ** 32n + 1n;
}

describe('createPool', () => {
  it('starts every outcome at 1/N', () => {
    const pool = createPool(3, 1_000n);
    for (let i = 0; i < 3; i++) expect(price(pool, i)).toEqual(ratio(1_000_000n, 3_000_000n));
    expect(reserves(pool)).toEqual([1_000n, 1_000n, 1_000n]);
  });

  it('rejects fewer than two outcomes and non-positive funding', () => {
    expect(() => createPool(1, 100n)).toThrow(MarketError);
    expect(() => createPool(2, 0n)).toThrow(MarketError);
  });
});

describe('buy', () => {
  it('moves a fresh two-outcome claim from 50% to exactly 90% for twice its liquidity', () => {
    const L = 3_000_000n;
    const { pool, shares } = buy(createPool(2, L), 0, 2n * L);
    expect(price(pool, 0)).toSatisfy(p => p.num * 10n === p.den * 9n);
    // The buyer paid 2L for 8L/3 shares, so profits L·2/3 if right.
    expect(shares).toBe((8n * L) / 3n);
    assertInvariant(pool);
  });

  it('raises the price of the outcome bought and lowers the others', () => {
    const before = createPool(3, 10_000n);
    const { pool } = buy(before, 1, 2_500n);
    expect(ratioToNumber(price(pool, 1))).toBeGreaterThan(1 / 3);
    expect(ratioToNumber(price(pool, 0))).toBeLessThan(1 / 3);
    expect(ratioToNumber(price(pool, 2))).toBeLessThan(1 / 3);
  });

  it('takes the fee before pricing and splits it between funders and the protocol', () => {
    const fees: FeeSchedule = { feePpm: 20_000n, protocolSharePpm: 100_000n };
    const { pool, fee, protocolFee } = buy(createPool(2, 10_000n), 0, 1_000n, fees);
    expect(fee).toBe(20n);
    expect(protocolFee).toBe(2n);
    expect(pool.c).toBe(10_980n);
    expect(pool.feePool).toBe(18n);
    expect(pool.protocolFees).toBe(2n);
  });

  it('rejects non-positive amounts, unknown outcomes and trades below the minimum', () => {
    const pool = createPool(2, 1_000n);
    expect(() => buy(pool, 0, 0n)).toThrow(MarketError);
    expect(() => buy(pool, 2, 10n)).toThrow(MarketError);
    expect(() => buy(pool, 0, 10n, undefined, 1_000n)).toThrow(MarketError);
  });

  it('restarting the old clock costs at most L·√((1−θ)/θ): a third of liquidity at 90%', () => {
    const L = 1_000_000_000n;
    let pool = buy(createPool(2, L), 0, 1_000n * L).pool;
    expect(ratioToNumber(price(pool, 0))).toBeGreaterThan(0.999);

    // Smallest purchase of the other outcome that takes outcome 0 below 90%.
    let lo = 1n;
    let hi = L;
    while (lo < hi) {
      const mid = (lo + hi) / 2n;
      if (priceAtLeast(buy(pool, 1, mid).pool, 0, NINETY_PERCENT)) lo = mid + 1n;
      else hi = mid;
    }
    expect(Number(lo) / Number(L)).toBeLessThan(1 / 3);
    expect(Number(lo) / Number(L)).toBeGreaterThan(0.33);
    pool = buy(pool, 1, lo).pool;
    expect(priceAtLeast(pool, 0, NINETY_PERCENT)).toBe(false);
  });
});

describe('addFunding', () => {
  it('keeps prices and issues no shares of the cheapest outcome', () => {
    const traded = buy(createPool(3, 50_000n), 0, 40_000n).pool;
    const { pool, shares, liquidity } = addFunding(traded, 25_000n);
    for (let i = 0; i < 3; i++) {
      expect(ratioToNumber(price(pool, i))).toBeCloseTo(ratioToNumber(price(traded, i)), 4);
    }
    const x = reserves(traded);
    const cheapest = x.indexOf(x.reduce((a, b) => (b > a ? b : a)));
    expect(shares[cheapest]).toBe(0n);
    expect(liquidity).toBeGreaterThan(0n);
    assertInvariant(pool);
  });
});

describe('payouts', () => {
  it('pays funders the winning reserve plus fees, pro rata', () => {
    const fees: FeeSchedule = { feePpm: 10_000n, protocolSharePpm: 0n };
    const funded = addFunding(createPool(2, 1_000n), 1_000n);
    const { pool } = buy(funded.pool, 0, 500n, fees);
    const total = funderPayoutTotal(pool, 1);
    expect(total).toBe(pool.c - pool.q[1]! + pool.feePool);
    expect(funderPayout(pool, 1, 1_000n)).toBe(total / 2n);
    expect(funderPayout(pool, 1, funded.liquidity)).toBe(total / 2n);
  });
});

describe('random trade sequences', () => {
  it('keep the invariant and stay solvent for every possible winner', () => {
    const fees: FeeSchedule = { feePpm: 15_000n, protocolSharePpm: 200_000n };
    for (let seed = 1; seed <= 300; seed++) {
      const next = rng(seed);
      const outcomes = 2 + Math.floor(next() * 4);
      const funding = randomBigInt(next, 10n ** 12n);
      let pool: Pool = createPool(outcomes, funding);
      let paidIn = funding;

      for (let step = 0; step < 40; step++) {
        const amount = randomBigInt(next, funding * 3n);
        if (next() < 0.85) {
          const outcome = Math.floor(next() * outcomes);
          try {
            pool = buy(pool, outcome, amount, fees).pool;
            paidIn += amount;
          } catch (e) {
            if (!(e instanceof MarketError)) throw e;
          }
        } else {
          try {
            pool = addFunding(pool, amount).pool;
            paidIn += amount;
          } catch (e) {
            if (!(e instanceof MarketError)) throw e;
          }
        }

        assertInvariant(pool);
        expect(pool.c + pool.feePool + pool.protocolFees).toBe(paidIn);
        for (let w = 0; w < outcomes; w++) {
          // Winners are paid in full and funders get the rest: never more than came in.
          expect(pool.q[w]! + funderPayoutTotal(pool, w)).toBe(pool.c + pool.feePool);
          expect(funderPayoutTotal(pool, w)).toBeGreaterThan(0n);
        }
      }
    }
  });
});
