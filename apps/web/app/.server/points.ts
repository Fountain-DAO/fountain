// D1 returns INTEGER columns as JavaScript numbers, which silently lose precision above 2^53.
// Points are bigints everywhere else, so every value crossing the database boundary goes
// through these two functions, which refuse anything that isn't an exact safe integer.

const MAX = BigInt(Number.MAX_SAFE_INTEGER);

export function toDb(value: bigint): number {
  if (value > MAX || value < -MAX) {
    throw new RangeError(`${value} is outside the safe integer range`);
  }
  return Number(value);
}

export function fromDb(value: unknown): bigint {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new RangeError(`Expected a safe integer from the database, got ${String(value)}`);
  }
  return BigInt(value);
}
