# Mechanism

**Status:** draft, version 2 (October 2026). This replaces the original 2020 Verifact protocol. Values marked _TBD_ will be set by simulation before launch.

## Summary

- A claim has two or more outcomes. A constant-product market maker sells shares in each outcome, and never buys them back.
- An outcome's price shows the market's current consensus. Buying an outcome raises its price.
- A claim settles when one outcome's price holds at or above a threshold $\theta$ (theta, proposed: 90%) on a **leaky clock**:
  - the clock fills while that outcome's price is at or above $\theta$
  - it drains while its price is below $\theta$
  - the claim settles when the clock reaches $T$ (proposed: 7 days)
- At settlement, each winning share pays 1 point, and the rest of the pool goes to the claim's funders.
- All accounting uses exact integers, and rounding always favours the pool.

## Design goals

1. **Persuasion is the incentive.** Shares can't be sold back, so the way to profit is to convince others, with evidence.
2. **No backstop.** No admin, jury or oracle decides outcomes. A claim stays open until a consensus holds.
3. **A public record.** Every claim keeps its trades, evidence, settlement, and how contested it was.
4. **Exactness.** Every quantity is an integer, so nobody can profit from rounding errors, floating point or overflow.

## Terms

| Term             | Meaning                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| Claim            | A statement with a list of outcomes and an evidence standard.                                  |
| Outcome          | One possible answer, such as True or False.                                                    |
| Share            | Pays 1 point if its outcome wins, and nothing otherwise.                                       |
| Funder           | Someone who puts points into a claim's pool, its bounty. The creator is the first funder.      |
| Liquidity shares | A funder's share of whatever is left in the pool at settlement.                                |
| Price            | What the next share of an outcome costs, between 0 and 1. The prices of all outcomes sum to 1. |

## Market maker

### State

For a claim with outcomes $1$ to $N$:

- $c$ is the total points paid into the pool, excluding fees.
- $q_i$ is the number of shares issued in outcome $i$.
- $L$ is the number of liquidity shares issued to funders.

The pool's **reserve** in outcome $i$ is $x_i = c - q_i$, which is what the pool would have left if $i$ won. The market maker keeps every reserve positive and maintains the invariant

$$
\prod_{i=1}^{N} x_i \;\ge\; L^N
$$

Because every $x_i > 0$, the pool can always pay every winning share.

### Prices

$$
p_i = \frac{\partial c}{\partial q_i} = \frac{1/x_i}{\sum_j 1/x_j}
$$

An outcome's price is the marginal cost of issuing one more share of it, with $L$ fixed. The prices of all outcomes sum to 1. An outcome nobody has bought has a large reserve and a low price.

To compare a price with a threshold $\theta = n/d$ without dividing:

$$
p_\ell \ge \tfrac{n}{d} \iff d \prod_{j \ne \ell} x_j \;\ge\; n \sum_{k} \prod_{j \ne k} x_j
$$

### Publishing a claim

The creator funds the claim with $F$ points (minimum _TBD_). This sets $c = F$, every $q_i = 0$ and $L = F$. Every reserve starts at $F$, every price starts at $1/N$, and the creator receives $F$ liquidity shares.

### Buying

To buy outcome $i$ with $A$ points:

1. Take the fee: $A' = A - \mathrm{fee}(A)$ (see [Fees](#fees)).
2. Add $A'$ to the pool: $c' = c + A'$. Every other outcome's reserve grows by $A'$.
3. Lower outcome $i$'s reserve as far as the invariant allows, rounding up:

   $$x_i' = \left\lceil \frac{L^N}{\prod_{j \ne i} x_j'} \right\rceil$$

4. The buyer receives $x_i + A' - x_i'$ shares of outcome $i$.

A buyer can set a minimum number of shares, and the trade fails if it would give fewer.

### No selling back

Shares can't be sold back to the market maker. A full set of shares (one in every outcome) also can't be exchanged for points before settlement, since buying the missing outcomes and redeeming the set would be a sale in disguise.

This is deliberate. Moving the price costs something you can't take back, so the way to profit is to bring others round to your view. While Fountain runs on points, shares can't be transferred between accounts either, so every stake is held until the claim settles.

### Adding funding

Anyone can add funding $A$ to an open claim without moving its prices (except by rounding). Let $m$ be the largest reserve. Every reserve grows by the same factor, $1 + A/m$:

- The pool keeps $\lceil A x_j / m \rceil$ of the new points in outcome $j$'s reserve.
- The funder receives the remaining $A - \lceil A x_j / m \rceil$ shares of each outcome $j$. For the cheapest outcome, this is zero.
- The funder also receives $\lfloor A L / m \rfloor$ liquidity shares.

Funding stays in the pool until the claim settles.

### Fees

Each purchase pays a trading fee (rate _TBD_). Fees are held in a separate pool, so they don't move prices. At settlement they're paid to funders in proportion to their liquidity shares.

A small part of each fee (_TBD_) is a protocol fee. While Fountain runs on points, protocol fees are removed from circulation.

## Settlement: the leaky clock

### Parameters

| Parameter | Meaning                                                                    | Proposed             |
| --------- | -------------------------------------------------------------------------- | -------------------- |
| $\theta$  | Threshold price. Must be above $1/2$.                                      | 0.9                  |
| $T$       | How long the clock must run to settle the claim.                           | 7 days               |
| $\alpha$  | How fast the clock drains below $\theta$, compared with how fast it fills. | _TBD_, by simulation |

Because $\theta$ is above $1/2$, at most one outcome can be at or above $\theta$ at a time. Because $\theta$ is above $1/N$, a claim that nobody trades never settles.

### State

- $\ell$ is the outcome the clock is tracking. Initially there's none.
- $\tau$ is the clock's progress, between 0 and $T$.
- $t_0$ is when the clock was last updated.

### Rules

Prices only change when someone trades, so they're constant in between. Each time the claim is updated at time $t$ (a trade or a scheduled check), let $\Delta t = t - t_0$:

1. **Fill.** If $\ell$'s price has been at or above $\theta$ since $t_0$, then $\tau \gets \tau + \Delta t$. If this reaches $T$, the claim settled at $t_0 + (T - \tau_{\text{old}})$, the moment the clock filled.
2. **Drain.** Otherwise, $\tau \gets \max(0,\, \tau - \alpha\,\Delta t)$.
3. **Switch.** Apply the trade, if there is one. If a different outcome $j$ is now at or above $\theta$, the clock switches to it: $\ell \gets j$ and $\tau \gets 0$.

Settlement doesn't wait for a trade. While the tracked outcome is at or above $\theta$, a check is scheduled for the moment the clock would fill.

### Why a leaky clock

The 2020 Verifact protocol settled once one outcome had led for seven days straight, and any change of leader restarted the clock. With a threshold, that rule has a cheap attack:

1. A griefer waits until the clock is nearly full.
2. They buy just enough of another outcome to dip the price below $\theta$.
3. Each dip restarts the clock, buying a full $T$ of delay. A defender buying back doesn't undo the restart.

However high defenders push the price, one restart on a two-outcome claim costs the griefer at most $L\sqrt{(1-\theta)/\theta}$ points. At $\theta = 0.9$, that's a third of the liquidity for every week of delay.

On a leaky clock, a dip that's quickly bought back only loses $(1 + \alpha)$ times its own length. To stall a claim, a griefer has to hold the price down, and pay again every time defenders buy it back.

The threshold also guarantees real stake behind every settlement. Moving a new two-outcome claim from 50% to $\theta$ costs $L\left(\sqrt{\theta/(1-\theta)} - 1\right)$ points, which is twice its liquidity at $\theta = 0.9$.

## Payout

When a claim settles on outcome $w$:

- Each share of $w$ pays 1 point, and shares of other outcomes pay nothing.
- Funders share what's left in the pool, $x_w = c - q_w$, plus the fee pool, in proportion to their liquidity shares.

## Resolution strength

Each settlement records what readers need to judge it:

- the total stake and number of distinct stakers on each outcome
- the highest price any losing outcome reached, and how often the clock switched outcomes
- how long the claim was open, and how much evidence was posted

A claim where nobody staked against the winner is shown as uncontested. How this is displayed is _TBD_.

## Claims and evidence

- **A claim** has:
  - a statement
  - its outcomes
  - an evidence standard: what would count as settling it
  - a topic
  - its creator and funders
- **Evidence posts** are attached to a claim. Each shows its author's position at the time of posting.
- **Proposed: commit and reveal.** An author can publish a hash of their evidence, take a position, and reveal the evidence later, which proves they had it first.
- **Scope.** Science, maths and technology to start. Claims about private individuals aren't allowed.

## Points

- **Allowance.** Each account receives an allowance of points (amount and schedule _TBD_).
- **No value.** Points can't be bought, sold or transferred. They have no monetary value, and there is no plan to convert them into money or tokens.
- **Movement.** Points move only through the mechanism: funding, buying, fees and payouts.
- **Score.** A person's score is their net points from settled claims. Their profile also records the claims they got right, the evidence they contributed and the bounties they funded.
- **One account per person.** How this is enforced is _TBD_.

## Open questions

1. **$\alpha$, $\theta$ and $T$.** These will be chosen by simulating informed traders, whales defending false claims, griefers and inactive claims.
2. **The fee rate and protocol share.**
3. **Minimum funding and minimum trade size.**
4. **Bounty claims with a deadline.** These are one-sided claims such as "X is proven by date E": only YES can settle early, and NO settles at E. This would let funders recover an unclaimed bounty. It would also handle open problems whose answer most people already believe, which a plain True/False claim would settle on belief alone.
5. **Withdrawing funding** before settlement.
6. **A secondary market for shares.** This would let people exit without selling back.
7. **Random settlement timing.** Once the clock reaches a minimum, the claim would settle at a random moment, so there's no predictable deadline to attack.
8. **The pricing curve.** CPMM is used for now. LMSR may be worth it if conditional claims ("if A, then B") are added, because Hanson showed it keeps linked probabilities consistent.

## Changes from the 2020 Verifact protocol

- **Settlement.** "Led for seven days" became "above $\theta$ on a leaky clock". The old rule settled a claim nobody traded on its first outcome, and made last-minute restarts cheap.
- **Funding.** Later funders join at current prices.
- **Prices.** The 2020 interface displayed LMSR prices. The CPMM formula above is now used everywhere.

## Related work

Systems and papers that tackle similar problems, and how Fountain differs from each:

- **Robin Hanson's logarithmic market scoring rule (LMSR)** is the standard automated market maker for prediction markets. Fountain uses a constant-product curve instead, though LMSR may return for conditional claims.
- **Gnosis conditional tokens and its fixed-product market maker.** Fountain's rule for adding funding at current prices follows the fixed-product market maker's.
- **UMA's optimistic oracle.** A proposed answer stands unless someone disputes it, and disputes go to a vote of UMA token holders. Fountain has no final vote.
- **Community Notes on X.** A note is shown when raters who usually disagree both rate it helpful. Raters have nothing at stake, whereas Fountain's stakers do.
- **Srinivasan, Karger and Chen, _Self-Resolving Prediction Markets for Unverifiable Outcomes_** ([arXiv:2306.04305](https://arxiv.org/abs/2306.04305)). Their market ends at a random time and scores traders against the final trader's prediction. Fountain settles once a consensus has held, and pays winning shares in full.
