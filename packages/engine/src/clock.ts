import { priceAtLeast, type Pool } from './market.ts';
import { ratioAtLeast, type Ratio } from './ratio.ts';

/** Parameters for the leaky settlement clock. Times are in milliseconds. */
export interface ClockParams {
  /** Price an outcome must hold. Must be above 1/2, so only one outcome can hold it at a time. */
  readonly threshold: Ratio;
  /** How long the clock must run to settle the claim. */
  readonly duration: number;
  /** How fast the clock drains below the threshold, relative to how fast it fills. */
  readonly drainRate: Ratio;
}

export interface Clock {
  /** The outcome being tracked, or `null` if no outcome has reached the threshold yet. */
  readonly tracked: number | null;
  /** Progress towards `duration`, in milliseconds. */
  readonly progress: number;
  /** When the clock was last brought up to date. */
  readonly updatedAt: number;
  /** When the claim settled on `tracked`, or `null` while it's open. */
  readonly settledAt: number | null;
}

const HALF: Ratio = { num: 1n, den: 2n };

export function checkClockParams(params: ClockParams): void {
  if (ratioAtLeast(HALF, params.threshold)) throw new RangeError('Threshold must be above 1/2');
  if (ratioAtLeast(params.threshold, { num: 1n, den: 1n })) {
    throw new RangeError('Threshold must be below 1');
  }
  if (!(params.duration > 0)) throw new RangeError('Duration must be positive');
}

export function startClock(now: number): Clock {
  return { tracked: null, progress: 0, updatedAt: now, settledAt: null };
}

/**
 * Brings the clock up to `now`, assuming `pool` (and so every price) was unchanged since
 * `clock.updatedAt`. Call it before applying each trade, and on scheduled checks.
 */
export function advanceClock(clock: Clock, pool: Pool, now: number, params: ClockParams): Clock {
  if (clock.settledAt !== null) return clock;
  if (now < clock.updatedAt) throw new RangeError('Time went backwards');
  const elapsed = now - clock.updatedAt;

  if (clock.tracked !== null && priceAtLeast(pool, clock.tracked, params.threshold)) {
    const remaining = params.duration - clock.progress;
    if (elapsed >= remaining) {
      return {
        ...clock,
        progress: params.duration,
        updatedAt: now,
        settledAt: clock.updatedAt + remaining,
      };
    }
    return { ...clock, progress: clock.progress + elapsed, updatedAt: now };
  }

  const drained = Number((BigInt(elapsed) * params.drainRate.num) / params.drainRate.den);
  return { ...clock, progress: Math.max(0, clock.progress - drained), updatedAt: now };
}

/**
 * Applies the switch rule after a trade: if an outcome other than the tracked one is now at or
 * above the threshold, the clock tracks it from zero. `clock` must already be advanced to the
 * time of the trade.
 */
export function afterTrade(clock: Clock, pool: Pool, params: ClockParams): Clock {
  if (clock.settledAt !== null) return clock;
  for (let i = 0; i < pool.q.length; i++) {
    if (i !== clock.tracked && priceAtLeast(pool, i, params.threshold)) {
      return { ...clock, tracked: i, progress: 0 };
    }
  }
  return clock;
}

/**
 * When the claim will settle if nothing else trades, or `null` if the clock isn't filling.
 * Use it to schedule the next check.
 */
export function settlesAt(clock: Clock, pool: Pool, params: ClockParams): number | null {
  if (clock.settledAt !== null) return clock.settledAt;
  if (clock.tracked === null || !priceAtLeast(pool, clock.tracked, params.threshold)) return null;
  return clock.updatedAt + (params.duration - clock.progress);
}
