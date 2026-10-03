/** An exact non-negative rational number. `den` is always positive. */
export interface Ratio {
  readonly num: bigint;
  readonly den: bigint;
}

export function ratio(num: bigint, den: bigint): Ratio {
  if (den <= 0n) throw new RangeError('Ratio denominator must be positive');
  if (num < 0n) throw new RangeError('Ratio must be non-negative');
  return { num, den };
}

/** `a ≥ b`, compared exactly. */
export function ratioAtLeast(a: Ratio, b: Ratio): boolean {
  return a.num * b.den >= b.num * a.den;
}

/** Approximate value for display only. Never use it in accounting. */
export function ratioToNumber(r: Ratio, digits = 6): number {
  const scale = 10n ** BigInt(digits);
  return Number((r.num * scale) / r.den) / Number(scale);
}

/** `⌈a / b⌉` for `a ≥ 0`, `b > 0`. */
export function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

export function product(values: readonly bigint[]): bigint {
  let p = 1n;
  for (const v of values) p *= v;
  return p;
}
