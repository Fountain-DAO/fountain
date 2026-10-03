import { ceilDiv, product, ratio, ratioAtLeast, type Ratio } from './ratio.ts';

/**
 * A claim's pool, as described in MECHANISM.md. All amounts are whole points.
 *
 * - `c`: points paid into the pool, excluding fees.
 * - `q[i]`: shares issued in outcome i.
 * - `liquidity`: liquidity shares issued to funders (`L` in the spec).
 * - `feePool`: trading fees owed to funders at settlement.
 * - `protocolFees`: protocol fees taken out of circulation.
 *
 * The pool keeps `∏ (c − q[i]) ≥ L^N` with every reserve `c − q[i]` positive.
 */
export interface Pool {
  readonly c: bigint;
  readonly q: readonly bigint[];
  readonly liquidity: bigint;
  readonly feePool: bigint;
  readonly protocolFees: bigint;
}

export interface FeeSchedule {
  /** Trading fee, in parts per million of each purchase. Rounded up. */
  readonly feePpm: bigint;
  /** Share of each fee kept as a protocol fee, in parts per million. Rounded down. */
  readonly protocolSharePpm: bigint;
}

export const NO_FEES: FeeSchedule = { feePpm: 0n, protocolSharePpm: 0n };

const PPM = 1_000_000n;

export class MarketError extends Error {
  override name = 'MarketError';
}

/** Opens a pool with `funding` points spread evenly, so every outcome starts at `1/N`. */
export function createPool(outcomes: number, funding: bigint): Pool {
  if (!Number.isInteger(outcomes) || outcomes < 2) {
    throw new MarketError('A claim needs at least two outcomes');
  }
  if (funding <= 0n) throw new MarketError('Funding must be positive');
  return {
    c: funding,
    q: Array.from({ length: outcomes }, () => 0n),
    liquidity: funding,
    feePool: 0n,
    protocolFees: 0n,
  };
}

/** `x[i] = c − q[i]`: what the pool would have left over if outcome i won. */
export function reserves(pool: Pool): bigint[] {
  return pool.q.map(qi => pool.c - qi);
}

/** Exact price of outcome i: `(1/x[i]) / Σ (1/x[j])`. */
export function price(pool: Pool, outcome: number): Ratio {
  const x = reserves(pool);
  checkOutcome(pool, outcome);
  // Multiplying through by ∏ x avoids fractions: p_i = ∏_{j≠i} x_j / Σ_k ∏_{j≠k} x_j.
  const products = x.map((_, k) => product(x.filter((_xj, j) => j !== k)));
  const den = products.reduce((a, b) => a + b, 0n);
  return ratio(products[outcome]!, den);
}

export function prices(pool: Pool): Ratio[] {
  return pool.q.map((_, i) => price(pool, i));
}

/** Whether outcome i is priced at or above `threshold`, compared exactly. */
export function priceAtLeast(pool: Pool, outcome: number, threshold: Ratio): boolean {
  return ratioAtLeast(price(pool, outcome), threshold);
}

export interface BuyResult {
  readonly pool: Pool;
  /** Shares of the outcome the buyer receives. */
  readonly shares: bigint;
  /** Total fee paid, including the protocol fee. */
  readonly fee: bigint;
  readonly protocolFee: bigint;
}

/**
 * Buys outcome `outcome` with `amount` points (fee included). Pure: returns the new pool and
 * what the buyer receives. Use the same call to quote a trade.
 */
export function buy(
  pool: Pool,
  outcome: number,
  amount: bigint,
  fees: FeeSchedule = NO_FEES,
  minShares = 1n,
): BuyResult {
  checkOutcome(pool, outcome);
  if (amount <= 0n) throw new MarketError('Amount must be positive');

  const fee = ceilDiv(amount * fees.feePpm, PPM);
  const protocolFee = (fee * fees.protocolSharePpm) / PPM;
  const net = amount - fee;
  if (net <= 0n) throw new MarketError('Amount is too small to cover the fee');

  const x = reserves(pool);
  const n = BigInt(x.length);
  const others = product(x.filter((_, j) => j !== outcome).map(xj => xj + net));
  const newReserve = ceilDiv(pool.liquidity ** n, others);
  const shares = x[outcome]! + net - newReserve;
  if (shares < minShares) throw new MarketError('Trade would give fewer shares than the minimum');

  return {
    pool: {
      c: pool.c + net,
      q: pool.q.map((qi, i) => (i === outcome ? qi + shares : qi)),
      liquidity: pool.liquidity,
      feePool: pool.feePool + fee - protocolFee,
      protocolFees: pool.protocolFees + protocolFee,
    },
    shares,
    fee,
    protocolFee,
  };
}

export interface FundingResult {
  readonly pool: Pool;
  /** Liquidity shares issued to the funder. */
  readonly liquidity: bigint;
  /** Outcome shares returned to the funder, one entry per outcome. */
  readonly shares: readonly bigint[];
}

/**
 * Adds `amount` points of funding without moving prices (beyond rounding). Every reserve grows by
 * the factor `1 + amount/m`, where `m` is the largest reserve; the funder receives the remaining
 * points as outcome shares, plus liquidity shares.
 */
export function addFunding(pool: Pool, amount: bigint): FundingResult {
  if (amount <= 0n) throw new MarketError('Funding must be positive');
  const x = reserves(pool);
  const m = x.reduce((a, b) => (b > a ? b : a));
  const shares = x.map(xj => amount - ceilDiv(amount * xj, m));
  const liquidity = (amount * pool.liquidity) / m;
  if (liquidity <= 0n) throw new MarketError('Funding is too small to issue liquidity');

  return {
    pool: {
      ...pool,
      c: pool.c + amount,
      q: pool.q.map((qi, j) => qi + shares[j]!),
      liquidity: pool.liquidity + liquidity,
    },
    liquidity,
    shares,
  };
}

/** Points left for funders when the claim settles on `winner`: the winner's reserve plus fees. */
export function funderPayoutTotal(pool: Pool, winner: number): bigint {
  checkOutcome(pool, winner);
  return pool.c - pool.q[winner]! + pool.feePool;
}

/** One funder's payout at settlement, pro rata to liquidity shares. Rounded down. */
export function funderPayout(pool: Pool, winner: number, liquidityShares: bigint): bigint {
  return (funderPayoutTotal(pool, winner) * liquidityShares) / pool.liquidity;
}

/** Throws if the pool breaks its invariant. Cheap enough to call after every change. */
export function assertInvariant(pool: Pool): void {
  const x = reserves(pool);
  if (x.some(xi => xi <= 0n)) throw new MarketError('A reserve is not positive');
  if (product(x) < pool.liquidity ** BigInt(x.length)) {
    throw new MarketError('Reserve product fell below L^N');
  }
}

function checkOutcome(pool: Pool, outcome: number): void {
  if (!Number.isInteger(outcome) || outcome < 0 || outcome >= pool.q.length) {
    throw new MarketError(`No outcome ${outcome}`);
  }
}
