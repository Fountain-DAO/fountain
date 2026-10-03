import {
  advanceClock,
  afterTrade,
  buy,
  checkClockParams,
  createPool,
  priceAtLeast,
  ratio,
  settlesAt,
  startClock,
  type Clock,
  type ClockParams,
  type Pool,
  type Ratio,
} from '@fountain/engine';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Outcome 0 is the true answer in every scenario; outcome 1 is false. */
export const TRUE = 0;
export const FALSE = 1;

/**
 * Buys `side` back up to `target` whenever its price has been below the threshold for `latency`.
 * The informed trader defends the truth this way; a whale does the same for the false outcome.
 */
export interface Defender {
  readonly name: string;
  readonly side: number;
  readonly enterAt: number;
  readonly latency: number;
  readonly target: Ratio;
  readonly budget: bigint;
}

/** Waits until the claim is about to settle on the other side, then dips it just below θ. */
export interface Griefer {
  readonly side: number;
  readonly budget: bigint;
  /** How long before settlement the griefer acts. */
  readonly lead: number;
}

/** Uninformed traders who buy a random side at random times. */
export interface Noise {
  readonly tradesPerDay: number;
  readonly meanAmount: bigint;
}

export interface RunConfig {
  readonly clock: ClockParams;
  readonly liquidity: bigint;
  readonly horizon: number;
  readonly tick: number;
  readonly seed: number;
  readonly defenders?: readonly Defender[];
  readonly griefer?: Griefer;
  readonly noise?: Noise;
}

export interface Account {
  spent: bigint;
  shares: bigint[];
  trades: number;
}

export interface RunResult {
  readonly settledAt: number | null;
  readonly winner: number | null;
  readonly accounts: ReadonlyMap<string, Account>;
  readonly pool: Pool;
}

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smallest purchase of `outcome` that makes `test(newPool)` true, or `null` above `max`. */
function smallestBuy(pool: Pool, outcome: number, max: bigint, test: (p: Pool) => boolean) {
  if (!test(buy(pool, outcome, max, undefined, 0n).pool)) return null;
  let lo = 1n;
  let hi = max;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if (test(buy(pool, outcome, mid, undefined, 0n).pool)) hi = mid;
    else lo = mid + 1n;
  }
  return lo;
}

export function run(config: RunConfig): RunResult {
  const random = rng(config.seed);
  const { clock: params, liquidity } = config;
  checkClockParams(params);
  let pool = createPool(2, liquidity);
  let clock: Clock = startClock(0);
  const accounts = new Map<string, Account>();
  const belowSince = new Map<string, number | null>();

  const account = (name: string): Account => {
    let a = accounts.get(name);
    if (!a) accounts.set(name, (a = { spent: 0n, shares: [0n, 0n], trades: 0 }));
    return a;
  };

  const trade = (name: string, outcome: number, amount: bigint) => {
    const result = buy(pool, outcome, amount, undefined, 0n);
    pool = result.pool;
    clock = afterTrade(clock, pool, params);
    const a = account(name);
    a.spent += amount;
    a.shares[outcome]! += result.shares;
    a.trades++;
  };

  for (let now = 0; now <= config.horizon; now += config.tick) {
    clock = advanceClock(clock, pool, now, params);
    if (clock.settledAt !== null) break;

    if (config.noise && random() < (config.noise.tradesPerDay * config.tick) / DAY) {
      const amount = BigInt(
        Math.max(1, Math.round(-Math.log(random()) * Number(config.noise.meanAmount))),
      );
      trade('noise', random() < 0.5 ? TRUE : FALSE, amount);
    }

    const g = config.griefer;
    if (g) {
      const due = settlesAt(clock, pool, params);
      if (due !== null && clock.tracked !== g.side && due - now <= g.lead) {
        const left = g.budget - account('griefer').spent;
        const tracked = clock.tracked!;
        const amount =
          left > 0n
            ? smallestBuy(pool, g.side, left, p => !priceAtLeast(p, tracked, params.threshold))
            : null;
        if (amount !== null) trade('griefer', g.side, amount);
      }
    }

    for (const d of config.defenders ?? []) {
      if (now < d.enterAt) continue;
      const below = !priceAtLeast(pool, d.side, params.threshold);
      const first = account(d.name).trades === 0;
      if (!below && !first) {
        belowSince.set(d.name, null);
        continue;
      }
      const since = belowSince.get(d.name) ?? now;
      belowSince.set(d.name, since);
      if (!first && now - since < d.latency) continue;
      const left = d.budget - account(d.name).spent;
      if (left <= 0n) continue;
      const amount = smallestBuy(pool, d.side, left, p => priceAtLeast(p, d.side, d.target));
      // Out of budget for the full move: spend what's left anyway, as a real defender would.
      trade(d.name, d.side, amount ?? left);
      belowSince.set(d.name, null);
    }
  }

  return {
    settledAt: clock.settledAt,
    winner: clock.settledAt === null ? null : clock.tracked,
    accounts,
    pool,
  };
}

/** Net result for an account if the claim settles on `winner` (shares of the winner pay 1). */
export function profit(account: Account | undefined, winner: number | null): bigint {
  if (!account) return 0n;
  return (winner === null ? 0n : account.shares[winner]!) - account.spent;
}

export function threshold(percent: number): Ratio {
  return ratio(BigInt(Math.round(percent * 10_000)), 10_000n);
}

/** A defender's buy-back target: halfway between the threshold and certainty. */
export function targetAbove(t: Ratio): Ratio {
  return ratio(t.num + t.den, 2n * t.den);
}
