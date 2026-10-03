import { ratio, type ClockParams, type Ratio } from '@fountain/engine';
import {
  DAY,
  FALSE,
  HOUR,
  MINUTE,
  TRUE,
  profit,
  run,
  targetAbove,
  threshold,
  type RunConfig,
} from './run.ts';

const L = 1_000_000n;
const TICK = 10 * MINUTE;
const HORIZON = 365 * DAY;
const SEEDS = 20;

const RULES: { name: string; drainRate: Ratio }[] = [
  { name: 'restart (α = ∞)', drainRate: ratio(10n ** 12n, 1n) },
  { name: 'leaky α = 2', drainRate: ratio(2n, 1n) },
  { name: 'leaky α = 1', drainRate: ratio(1n, 1n) },
  { name: 'leaky α = ½', drainRate: ratio(1n, 2n) },
];
const THRESHOLDS = [0.8, 0.9, 0.95];

const inL = (x: bigint) => (Number(x) / Number(L)).toFixed(2);
const days = (ms: number | null) => (ms === null ? 'never' : (ms / DAY).toFixed(1));
const median = (xs: number[]) => {
  const s = xs.toSorted((a, b) => a - b);
  return s.length === 0 ? null : s[Math.floor(s.length / 2)]!;
};

function table(headers: string[], rows: string[][]) {
  console.log(`| ${headers.join(' | ')} |`);
  console.log(`| ${headers.map(() => '---').join(' | ')} |`);
  for (const r of rows) console.log(`| ${r.join(' | ')} |`);
  console.log();
}

function clockParams(t: number, drainRate: Ratio): ClockParams {
  return { threshold: threshold(t), duration: 7 * DAY, drainRate };
}

function informed(t: number, latency: number, budget = 100n * L) {
  return {
    name: 'informed',
    side: TRUE,
    enterAt: DAY,
    latency,
    target: targetAbove(threshold(t)),
    budget,
  };
}

console.log('# Fountain settlement simulation\n');
console.log(`Two-outcome claims with liquidity L = ${L} points. Amounts are in multiples of L.`);
console.log(
  `Settlement duration T = 7 days. Time step ${TICK / MINUTE} minutes. Outcome 0 is true.\n`,
);

// 1. Honest claims with noise: how long does settlement take, and does noise ever settle it wrong?
console.log('## 1. Honest claim with noise traders\n');
console.log(
  'An informed trader buys the truth up to halfway between θ and 1 on day 1, and buys it back',
);
console.log(
  'within 6 hours whenever it falls below θ. Noise traders make 8 trades a day on random sides,',
);
console.log(`averaging 0.05 L. ${SEEDS} runs each.\n`);
{
  const rows: string[][] = [];
  for (const t of THRESHOLDS) {
    for (const rule of RULES) {
      const settle: number[] = [];
      let correct = 0;
      let informedProfit = 0n;
      let settledRuns = 0n;
      for (let seed = 1; seed <= SEEDS; seed++) {
        const r = run({
          clock: clockParams(t, rule.drainRate),
          liquidity: L,
          horizon: HORIZON,
          tick: TICK,
          seed,
          defenders: [informed(t, 6 * HOUR)],
          noise: { tradesPerDay: 8, meanAmount: L / 20n },
        });
        if (r.settledAt !== null) settle.push(r.settledAt);
        if (r.winner === TRUE) correct++;
        if (r.winner !== null) {
          informedProfit += profit(r.accounts.get('informed'), r.winner);
          settledRuns++;
        }
      }
      rows.push([
        `${t * 100}%`,
        rule.name,
        days(median(settle)),
        `${settle.length}/${SEEDS}`,
        `${correct}/${SEEDS}`,
        settledRuns > 0n ? inL(informedProfit / settledRuns) : 'open',
      ]);
    }
  }
  table(
    [
      'θ',
      'rule',
      'median days to settle',
      'settled',
      'settled true',
      'informed profit (avg, settled runs)',
    ],
    rows,
  );
}

// 2. Griefing: how much delay does a griefer buy per point spent?
console.log('## 2. Griefer delaying a true claim\n');
console.log(
  'The informed trader defends as above, responding within λ. A griefer with 2 L waits until the',
);
console.log(
  'claim is 10 minutes from settling, then buys just enough of the false outcome to dip the true',
);
console.log(
  'outcome below θ. No noise. Delay is measured against the same run without the griefer.\n',
);
{
  const rows: string[][] = [];
  for (const t of THRESHOLDS) {
    for (const latency of [1 * HOUR, 6 * HOUR, 24 * HOUR]) {
      for (const rule of RULES) {
        const base: RunConfig = {
          clock: clockParams(t, rule.drainRate),
          liquidity: L,
          horizon: HORIZON,
          tick: TICK,
          seed: 1,
          defenders: [informed(t, latency)],
        };
        const honest = run(base);
        const griefed = run({ ...base, griefer: { side: FALSE, budget: 2n * L, lead: TICK } });
        const g = griefed.accounts.get('griefer');
        const spent = g?.spent ?? 0n;
        const delay =
          griefed.settledAt === null
            ? HORIZON - honest.settledAt!
            : griefed.settledAt - honest.settledAt!;
        const perDay = delay > 0 ? (Number(spent) / Number(L) / (delay / DAY)).toFixed(3) : '–';
        rows.push([
          `${t * 100}%`,
          `${latency / HOUR} h`,
          rule.name,
          `${griefed.settledAt === null ? '≥ ' : ''}${days(delay)}`,
          String(g?.trades ?? 0),
          inL(spent),
          perDay,
          griefed.winner === TRUE ? 'true' : String(griefed.winner),
        ]);
      }
    }
  }
  table(
    [
      'θ',
      'defender λ',
      'rule',
      'delay (days)',
      'griefer trades',
      'griefer spent',
      'cost per day of delay',
      'settled',
    ],
    rows,
  );
}

// 3. A whale defending the false outcome: no backstop means a war of budgets.
console.log('## 3. Whale defending the false outcome\n');
console.log(
  'The informed trader (budget 20 L) and a whale on the false side (from day 3) each buy their',
);
console.log(
  'side back to their target within 6 hours of it falling below θ = 90%. Leaky clock, α = 1.\n',
);
{
  const rows: string[][] = [];
  for (const whaleBudget of [5n, 10n, 19n, 21n, 40n]) {
    const r = run({
      clock: clockParams(0.9, ratio(1n, 1n)),
      liquidity: L,
      horizon: HORIZON,
      tick: TICK,
      seed: 1,
      defenders: [
        informed(0.9, 6 * HOUR, 20n * L),
        {
          name: 'whale',
          side: FALSE,
          enterAt: 3 * DAY,
          latency: 6 * HOUR,
          target: targetAbove(threshold(0.9)),
          budget: whaleBudget * L,
        },
      ],
    });
    const w = r.accounts.get('whale');
    const i = r.accounts.get('informed');
    rows.push([
      `${whaleBudget}`,
      r.winner === null ? 'unsettled' : r.winner === TRUE ? 'true' : 'false',
      days(r.settledAt),
      inL(i?.spent ?? 0n),
      inL(w?.spent ?? 0n),
      r.winner === null ? 'open' : inL(profit(i, r.winner)),
      r.winner === null ? 'open' : inL(profit(w, r.winner)),
    ]);
  }
  table(
    [
      'whale budget',
      'settled',
      'day',
      'informed spent',
      'whale spent',
      'informed profit',
      'whale profit',
    ],
    rows,
  );
}
