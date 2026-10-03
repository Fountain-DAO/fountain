import { describe, expect, it } from 'vitest';
import {
  advanceClock,
  afterTrade,
  buy,
  checkClockParams,
  createPool,
  ratio,
  settlesAt,
  startClock,
  type Clock,
  type ClockParams,
  type Pool,
} from '../src/index.ts';

const DAY = 24 * 60 * 60 * 1000;
const PARAMS: ClockParams = {
  threshold: ratio(9n, 10n),
  duration: 7 * DAY,
  drainRate: ratio(1n, 1n),
};
const L = 3_000_000n;

/** Applies a trade at `time`, the way the server will: advance, trade, then switch. */
function trade(
  state: { pool: Pool; clock: Clock },
  time: number,
  outcome: number,
  amount: bigint,
): { pool: Pool; clock: Clock } {
  const advanced = advanceClock(state.clock, state.pool, time, PARAMS);
  const pool = buy(state.pool, outcome, amount).pool;
  return { pool, clock: afterTrade(advanced, pool, PARAMS) };
}

describe('leaky clock', () => {
  it('never settles a claim nobody trades', () => {
    const pool = createPool(2, L);
    const clock = advanceClock(startClock(0), pool, 365 * DAY, PARAMS);
    expect(clock.tracked).toBeNull();
    expect(clock.settledAt).toBeNull();
    expect(settlesAt(clock, pool, PARAMS)).toBeNull();
  });

  it('starts tracking an outcome when it reaches the threshold, and settles T later', () => {
    let state = { pool: createPool(2, L), clock: startClock(0) };
    state = trade(state, DAY, 0, 2n * L); // exactly 90%
    expect(state.clock.tracked).toBe(0);
    expect(settlesAt(state.clock, state.pool, PARAMS)).toBe(8 * DAY);

    const before = advanceClock(state.clock, state.pool, 8 * DAY - 1, PARAMS);
    expect(before.settledAt).toBeNull();
    const after = advanceClock(state.clock, state.pool, 30 * DAY, PARAMS);
    expect(after.settledAt).toBe(8 * DAY);
    expect(after.tracked).toBe(0);
  });

  it('drains while the price is below the threshold, then resumes from where it was', () => {
    let state = { pool: createPool(2, L), clock: startClock(0) };
    state = trade(state, 0, 0, 3n * L); // above 90%
    state = trade(state, 5 * DAY, 1, L); // dip below 90% after 5 days of progress
    expect(state.clock.progress).toBe(5 * DAY);

    state = trade(state, 6 * DAY, 0, 3n * L); // back above after 1 day below
    expect(state.clock.tracked).toBe(0);
    expect(state.clock.progress).toBe(4 * DAY); // drained one day at α = 1
    expect(settlesAt(state.clock, state.pool, PARAMS)).toBe(9 * DAY);
  });

  it('starts from zero when a different outcome reaches the threshold', () => {
    let state = { pool: createPool(2, L), clock: startClock(0) };
    state = trade(state, 0, 0, 3n * L);
    state = trade(state, 6 * DAY, 1, 40n * L);
    expect(state.clock.tracked).toBe(1);
    expect(state.clock.progress).toBe(0);
    expect(settlesAt(state.clock, state.pool, PARAMS)).toBe(13 * DAY);
  });

  it('drains α times as fast as it fills, instead of restarting', () => {
    const params: ClockParams = { ...PARAMS, drainRate: ratio(2n, 1n) };
    const pool = buy(createPool(2, L), 0, 3n * L).pool;
    const dipped = buy(pool, 1, L).pool;
    let clock = afterTrade(startClock(0), pool, params);
    clock = advanceClock(clock, pool, 6 * DAY, params);
    clock = advanceClock(clock, dipped, 6 * DAY + 60_000, params); // one minute below, α = 2
    expect(clock.progress).toBe(6 * DAY - 120_000);
  });

  it('rejects thresholds at or below one half', () => {
    expect(() => checkClockParams({ ...PARAMS, threshold: ratio(1n, 2n) })).toThrow(RangeError);
    expect(() => checkClockParams(PARAMS)).not.toThrow();
  });
});
