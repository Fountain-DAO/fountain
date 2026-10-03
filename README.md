# Fountain

Fountain is a market for open questions in science, maths and technology.

Anyone can publish a claim and put points behind it. Others stake on what they believe is true and argue their case with evidence. A claim settles itself once one answer has held a strong consensus for long enough. No judge, jury or oracle decides. What's left behind is a public record of the arguments, who made them, and what they had at stake.

**Status:** early development. The landing page is live at [fountain.markets](https://fountain.markets).

## Read more

- [VISION.md](VISION.md): why Fountain exists, what it's for, and where it's going.
- [MECHANISM.md](MECHANISM.md): how claims are priced, staked and settled.
- [CONTRIBUTING.md](CONTRIBUTING.md): how to get involved.

## Repository layout

| Path              | What it is                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `apps/web`        | The website at fountain.markets (React Router 8 on Cloudflare Workers).                                     |
| `packages/engine` | The market maths: pricing, funding, the leaky settlement clock and payouts, in exact integers.              |
| `packages/sim`    | Simulates informed traders, noise, griefers and whales against the engine, to choose settlement parameters. |

## Development

You need Node 24 or later and pnpm 12.

```sh
pnpm install
pnpm dev         # runs the site locally
pnpm build
pnpm lint        # oxlint
pnpm format      # oxfmt
pnpm typecheck
pnpm test        # Vitest
pnpm sim         # settlement simulation, printed as Markdown tables
```

The site is built with Vite and styled with plain CSS (`apps/web/app/app.css`). Deploying (`pnpm run deploy` in `apps/web`) needs access to the Cloudflare account.

## License

Fountain is licensed under the [GNU Affero General Public License v3.0](LICENSE). If you run a modified version as a service, you must make its source available to the people who use it.
