import {
  addFunding,
  advanceClock,
  afterTrade,
  assertInvariant,
  buy,
  createPool,
  funderPayoutTotal,
  ratio,
  settlesAt,
  type Clock,
  type ClockParams,
  type FeeSchedule,
  type Pool,
} from '@fountain/engine';
import { fromDb, toDb } from './points';

/** Parameters for new claims. Provisional until the simulator settles them (see MECHANISM.md). */
export const CLAIM_DEFAULTS = {
  clock: { threshold: ratio(9n, 10n), duration: 7 * 24 * 60 * 60 * 1000, drainRate: ratio(1n, 1n) },
  fees: { feePpm: 10_000n, protocolSharePpm: 0n },
} satisfies { clock: ClockParams; fees: FeeSchedule };

/** How many times a trade is retried after losing a race with another trade on the same claim. */
const MAX_ATTEMPTS = 10;

/** Waits a random, growing delay before a retry, so racing trades don't retry in lockstep. */
function backoff(attempt: number) {
  const ms = Math.random() * 5 * 2 ** Math.min(attempt, 6);
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class TradeError extends Error {
  override name = 'TradeError';
  constructor(
    readonly code: 'not-found' | 'settled' | 'insufficient-points' | 'contention',
    message: string,
  ) {
    super(message);
  }
}

export interface ClaimState {
  readonly id: string;
  readonly pool: Pool;
  readonly clock: Clock;
  readonly clockParams: ClockParams;
  readonly fees: FeeSchedule;
  readonly seq: number;
}

interface ClaimRow {
  id: string;
  threshold_num: number;
  threshold_den: number;
  duration_ms: number;
  drain_num: number;
  drain_den: number;
  fee_ppm: number;
  protocol_share_ppm: number;
  pool_c: number;
  liquidity: number;
  fee_pool: number;
  protocol_fees: number;
  clock_tracked: number | null;
  clock_progress_ms: number;
  clock_updated_at: number;
  settled_at: number | null;
  seq: number;
}

export async function createUser(db: D1Database, handle: string, balance: bigint, now: number) {
  const id = crypto.randomUUID();
  await db
    .prepare('INSERT INTO users (id, handle, created_at, balance) VALUES (?, ?, ?, ?)')
    .bind(id, handle, now, toDb(balance))
    .run();
  return id;
}

export async function getBalance(db: D1Database, userId: string): Promise<bigint> {
  const row = await db.prepare('SELECT balance FROM users WHERE id = ?').bind(userId).first();
  if (!row) throw new TradeError('not-found', 'No such user');
  return fromDb(row.balance);
}

export interface NewClaim {
  readonly creatorId: string;
  readonly statement: string;
  readonly evidenceStandard: string;
  readonly topic: string;
  readonly outcomes: readonly string[];
  readonly funding: bigint;
}

/** Publishes a claim, debiting the creator's funding. Returns the claim's id. */
export async function createClaim(db: D1Database, claim: NewClaim, now: number): Promise<string> {
  const id = crypto.randomUUID();
  const pool = createPool(claim.outcomes.length, claim.funding);
  const { clock, fees } = CLAIM_DEFAULTS;
  try {
    await db.batch([
      db
        .prepare('UPDATE users SET balance = balance - ? WHERE id = ?')
        .bind(toDb(claim.funding), claim.creatorId),
      db
        .prepare(
          `INSERT INTO claims (id, creator_id, statement, evidence_standard, topic, created_at,
             threshold_num, threshold_den, duration_ms, drain_num, drain_den, fee_ppm,
             protocol_share_ppm, pool_c, liquidity, fee_pool, protocol_fees, clock_tracked,
             clock_progress_ms, clock_updated_at, settles_at, settled_at, winner, seq)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, 0, ?, NULL, NULL, NULL, 1)`,
        )
        .bind(
          id,
          claim.creatorId,
          claim.statement,
          claim.evidenceStandard,
          claim.topic,
          now,
          toDb(clock.threshold.num),
          toDb(clock.threshold.den),
          clock.duration,
          toDb(clock.drainRate.num),
          toDb(clock.drainRate.den),
          toDb(fees.feePpm),
          toDb(fees.protocolSharePpm),
          toDb(pool.c),
          toDb(pool.liquidity),
          now,
        ),
      ...claim.outcomes.map((label, i) =>
        db
          .prepare(
            'INSERT INTO claim_outcomes (claim_id, outcome, label, shares_issued) VALUES (?, ?, ?, 0)',
          )
          .bind(id, i, label),
      ),
      db
        .prepare(
          `INSERT INTO trades (claim_id, seq, user_id, kind, amount, liquidity, created_at)
           VALUES (?, 1, ?, 'publish', ?, ?, ?)`,
        )
        .bind(id, claim.creatorId, toDb(claim.funding), toDb(pool.liquidity), now),
      db
        .prepare('INSERT INTO funders (user_id, claim_id, liquidity) VALUES (?, ?, ?)')
        .bind(claim.creatorId, id, toDb(pool.liquidity)),
    ]);
  } catch (e) {
    throw translate(e);
  }
  return id;
}

export async function loadClaim(db: D1Database, claimId: string): Promise<ClaimState> {
  const [claims, outcomes] = await db.batch([
    db.prepare('SELECT * FROM claims WHERE id = ?').bind(claimId),
    db
      .prepare('SELECT shares_issued FROM claim_outcomes WHERE claim_id = ? ORDER BY outcome')
      .bind(claimId),
  ]);
  const row = claims?.results[0] as ClaimRow | undefined;
  if (!row) throw new TradeError('not-found', 'No such claim');
  return {
    id: row.id,
    pool: {
      c: fromDb(row.pool_c),
      q: outcomes!.results.map(o => fromDb((o as { shares_issued: number }).shares_issued)),
      liquidity: fromDb(row.liquidity),
      feePool: fromDb(row.fee_pool),
      protocolFees: fromDb(row.protocol_fees),
    },
    clock: {
      tracked: row.clock_tracked,
      progress: row.clock_progress_ms,
      updatedAt: row.clock_updated_at,
      settledAt: row.settled_at,
    },
    clockParams: {
      threshold: ratio(fromDb(row.threshold_num), fromDb(row.threshold_den)),
      duration: row.duration_ms,
      drainRate: ratio(fromDb(row.drain_num), fromDb(row.drain_den)),
    },
    fees: { feePpm: fromDb(row.fee_ppm), protocolSharePpm: fromDb(row.protocol_share_ppm) },
    seq: row.seq,
  };
}

interface TradeRow {
  readonly userId: string | null;
  readonly kind: 'buy' | 'fund' | 'settle';
  readonly outcome?: number;
  readonly amount: bigint;
  readonly shares?: bigint;
  readonly fee?: bigint;
  readonly liquidity?: bigint;
}

interface Mutation<T> {
  readonly trade: TradeRow;
  /** Further writes, applied in the same batch after the trade row. */
  readonly statements: D1PreparedStatement[];
  readonly result: T;
}

/**
 * Reads a claim, computes a change with the engine, and writes it in one atomic batch. The batch
 * starts by inserting the next trade sequence number, so if anything else changed the claim in the
 * meantime the whole batch fails on the primary key and this retries against the new state.
 * `compute` returns `null` to write nothing.
 */
async function mutateClaim<T>(
  db: D1Database,
  claimId: string,
  now: number,
  compute: (claim: ClaimState, clock: Clock, seq: number) => Promise<Mutation<T> | null>,
): Promise<T | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const claim = await loadClaim(db, claimId);
    const at = Math.max(now, claim.clock.updatedAt);
    const clock = advanceClock(claim.clock, claim.pool, at, claim.clockParams);
    const seq = claim.seq + 1;
    const mutation = await compute(claim, clock, seq);
    if (mutation === null) return null;
    const t = mutation.trade;

    try {
      await db.batch([
        db
          .prepare(
            `INSERT INTO trades (claim_id, seq, user_id, kind, outcome, amount, shares, fee, liquidity, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            claimId,
            seq,
            t.userId,
            t.kind,
            t.outcome ?? null,
            toDb(t.amount),
            t.shares === undefined ? null : toDb(t.shares),
            toDb(t.fee ?? 0n),
            t.liquidity === undefined ? null : toDb(t.liquidity),
            at,
          ),
        ...mutation.statements,
        db
          .prepare('UPDATE claims SET seq = ? WHERE id = ? AND seq = ?')
          .bind(seq, claimId, claim.seq),
      ]);
    } catch (e) {
      const error = translate(e);
      if (error instanceof TradeError && error.code === 'contention') {
        await backoff(attempt);
        continue;
      }
      throw error;
    }
    return mutation.result;
  }
  throw new TradeError('contention', 'The claim is busy; try again');
}

/** Writes a claim's pool and clock. */
function saveState(
  db: D1Database,
  claimId: string,
  pool: Pool,
  clock: Clock,
  params: ClockParams,
): D1PreparedStatement[] {
  const settled = clock.settledAt !== null;
  return [
    db
      .prepare(
        `UPDATE claims SET pool_c = ?, liquidity = ?, fee_pool = ?, protocol_fees = ?,
           clock_tracked = ?, clock_progress_ms = ?, clock_updated_at = ?, settles_at = ?,
           settled_at = ?, winner = ?
         WHERE id = ?`,
      )
      .bind(
        toDb(pool.c),
        toDb(pool.liquidity),
        toDb(pool.feePool),
        toDb(pool.protocolFees),
        clock.tracked,
        clock.progress,
        clock.updatedAt,
        settled ? null : settlesAt(clock, pool, params),
        clock.settledAt,
        settled ? clock.tracked : null,
        claimId,
      ),
    ...pool.q.map((shares, outcome) =>
      db
        .prepare('UPDATE claim_outcomes SET shares_issued = ? WHERE claim_id = ? AND outcome = ?')
        .bind(toDb(shares), claimId, outcome),
    ),
  ];
}

function addPosition(
  db: D1Database,
  userId: string,
  claimId: string,
  outcome: number,
  shares: bigint,
) {
  return db
    .prepare(
      `INSERT INTO positions (user_id, claim_id, outcome, shares) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, claim_id, outcome) DO UPDATE SET shares = shares + excluded.shares`,
    )
    .bind(userId, claimId, outcome, toDb(shares));
}

function debit(db: D1Database, userId: string, amount: bigint) {
  return db
    .prepare('UPDATE users SET balance = balance - ? WHERE id = ?')
    .bind(toDb(amount), userId);
}

export interface PlaceTrade {
  readonly claimId: string;
  readonly userId: string;
  readonly outcome: number;
  readonly amount: bigint;
  /** The trade fails rather than give fewer shares than this, e.g. if the price moved. */
  readonly minShares: bigint;
}

export interface TradeResult {
  readonly shares: bigint;
  readonly fee: bigint;
  readonly seq: number;
  readonly state: ClaimState;
}

/** Buys shares in a claim. Overspending fails on the users balance CHECK. */
export async function placeTrade(
  db: D1Database,
  trade: PlaceTrade,
  now: number,
): Promise<TradeResult> {
  const result = await mutateClaim(db, trade.claimId, now, async (claim, clock, seq) => {
    if (clock.settledAt !== null) throw new TradeError('settled', 'This claim has settled');
    const bought = buy(claim.pool, trade.outcome, trade.amount, claim.fees, trade.minShares);
    assertInvariant(bought.pool);
    const nextClock = afterTrade(clock, bought.pool, claim.clockParams);
    return {
      trade: {
        userId: trade.userId,
        kind: 'buy',
        outcome: trade.outcome,
        amount: trade.amount,
        shares: bought.shares,
        fee: bought.fee,
      },
      statements: [
        debit(db, trade.userId, trade.amount),
        ...saveState(db, trade.claimId, bought.pool, nextClock, claim.clockParams),
        addPosition(db, trade.userId, trade.claimId, trade.outcome, bought.shares),
      ],
      result: {
        shares: bought.shares,
        fee: bought.fee,
        seq,
        state: { ...claim, pool: bought.pool, clock: nextClock, seq },
      },
    };
  });
  return result!;
}

export interface FundClaim {
  readonly claimId: string;
  readonly userId: string;
  readonly amount: bigint;
}

export interface FundResult {
  readonly liquidity: bigint;
  readonly shares: readonly bigint[];
  readonly seq: number;
}

/**
 * Adds to a claim's bounty at current prices. The funder receives liquidity shares, plus outcome
 * shares for whatever the pool doesn't keep (see MECHANISM.md, "Adding funding").
 */
export async function fundClaim(db: D1Database, fund: FundClaim, now: number): Promise<FundResult> {
  const result = await mutateClaim(db, fund.claimId, now, async (claim, clock, seq) => {
    if (clock.settledAt !== null) throw new TradeError('settled', 'This claim has settled');
    const funded = addFunding(claim.pool, fund.amount);
    assertInvariant(funded.pool);
    const nextClock = afterTrade(clock, funded.pool, claim.clockParams);
    return {
      trade: {
        userId: fund.userId,
        kind: 'fund',
        amount: fund.amount,
        liquidity: funded.liquidity,
      },
      statements: [
        debit(db, fund.userId, fund.amount),
        ...saveState(db, fund.claimId, funded.pool, nextClock, claim.clockParams),
        db
          .prepare(
            `INSERT INTO funders (user_id, claim_id, liquidity) VALUES (?, ?, ?)
             ON CONFLICT (user_id, claim_id) DO UPDATE SET liquidity = liquidity + excluded.liquidity`,
          )
          .bind(fund.userId, fund.claimId, toDb(funded.liquidity)),
        ...funded.shares.flatMap((shares, outcome) =>
          shares > 0n ? [addPosition(db, fund.userId, fund.claimId, outcome, shares)] : [],
        ),
      ],
      result: { liquidity: funded.liquidity, shares: funded.shares, seq },
    };
  });
  return result!;
}

export interface Settlement {
  readonly claimId: string;
  readonly winner: number;
  readonly settledAt: number;
  /** Points paid to holders of winning shares (one per share). */
  readonly toWinners: bigint;
  /** Points paid to funders: the winning reserve plus fees, pro rata to liquidity. */
  readonly toFunders: bigint;
  /** Rounding left over from the pro-rata split, removed from circulation. */
  readonly dust: bigint;
}

/**
 * Records a claim's settlement and pays out, if its clock has filled by `now`. Returns `null` if
 * it hasn't. Each payout row has a primary key, so a claim can never be paid twice.
 */
export async function settleClaim(
  db: D1Database,
  claimId: string,
  now: number,
): Promise<Settlement | null> {
  return mutateClaim(db, claimId, now, async (claim, clock) => {
    if (claim.clock.settledAt !== null) return null; // already recorded
    if (clock.settledAt === null) return null;
    const winner = clock.tracked!;
    const settledAt = clock.settledAt;

    const { results: funders } = await db
      .prepare('SELECT user_id, liquidity FROM funders WHERE claim_id = ? ORDER BY user_id')
      .bind(claimId)
      .all<{ user_id: string; liquidity: number }>();
    const total = funderPayoutTotal(claim.pool, winner);
    const payouts = funders.map(f => ({
      userId: f.user_id,
      amount: (total * fromDb(f.liquidity)) / claim.pool.liquidity,
    }));
    const toFunders = payouts.reduce((sum, p) => sum + p.amount, 0n);
    const dust = total - toFunders;
    const toWinners = claim.pool.q[winner]!;
    const pool = { ...claim.pool, protocolFees: claim.pool.protocolFees + dust };

    return {
      trade: { userId: null, kind: 'settle', outcome: winner, amount: toWinners + toFunders },
      statements: [
        ...saveState(db, claimId, pool, clock, claim.clockParams),
        // Winning shares pay one point each.
        db
          .prepare(
            `INSERT INTO payouts (claim_id, user_id, kind, amount, created_at)
             SELECT claim_id, user_id, 'shares', shares, ? FROM positions
             WHERE claim_id = ? AND outcome = ? AND shares > 0`,
          )
          .bind(settledAt, claimId, winner),
        db
          .prepare(
            `UPDATE users SET balance = balance + (
               SELECT shares FROM positions p
               WHERE p.user_id = users.id AND p.claim_id = ? AND p.outcome = ?)
             WHERE id IN (
               SELECT user_id FROM positions WHERE claim_id = ? AND outcome = ? AND shares > 0)`,
          )
          .bind(claimId, winner, claimId, winner),
        // Funders' shares are computed in bigint: the product overflows SQLite's 64-bit integers.
        ...payouts.flatMap(p => [
          db
            .prepare(
              `INSERT INTO payouts (claim_id, user_id, kind, amount, created_at)
               VALUES (?, ?, 'funding', ?, ?)`,
            )
            .bind(claimId, p.userId, toDb(p.amount), settledAt),
          db
            .prepare('UPDATE users SET balance = balance + ? WHERE id = ?')
            .bind(toDb(p.amount), p.userId),
        ]),
      ],
      result: { claimId, winner, settledAt, toWinners, toFunders, dust },
    };
  });
}

/** Settles every claim whose clock has filled by `now`. Run on a schedule. */
export async function settleDue(db: D1Database, now: number, limit = 50): Promise<Settlement[]> {
  const { results } = await db
    .prepare(
      `SELECT id FROM claims WHERE settled_at IS NULL AND settles_at <= ?
       ORDER BY settles_at LIMIT ?`,
    )
    .bind(now, limit)
    .all<{ id: string }>();
  const settled: Settlement[] = [];
  for (const { id } of results) {
    try {
      const s = await settleClaim(db, id, now);
      if (s) settled.push(s);
    } catch (e) {
      // One bad claim shouldn't stop the others; it will be retried on the next run.
      console.error(`Failed to settle claim ${id}`, e);
    }
  }
  return settled;
}

/** Turns D1 constraint failures into TradeErrors. */
function translate(e: unknown): unknown {
  const message = e instanceof Error ? e.message : String(e);
  if (/UNIQUE constraint failed: trades\./.test(message)) {
    return new TradeError('contention', 'Another change to this claim landed first');
  }
  if (/CHECK constraint failed/.test(message) && /balance/.test(message)) {
    return new TradeError('insufficient-points', 'Not enough points');
  }
  if (/FOREIGN KEY constraint failed/.test(message)) {
    return new TradeError('not-found', 'No such user or claim');
  }
  return e;
}
