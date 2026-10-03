# Contributing

Fountain is in early development, and help is welcome.

## Where to start

- **Discussion** happens in the open on X, at [@FountainMarkets](https://x.com/FountainMarkets).
- **Issues** are for concrete bugs and proposals. Search before opening a new one.
- **Pull requests** should be small and focused. For anything bigger than a fix, open an issue first so we can agree on the approach.

## Code

### Setup

You need Node 24 or later and pnpm 12.

```sh
pnpm install
pnpm dev
```

### Conventions

- **Before you commit,** run `pnpm format` (oxfmt), `pnpm lint` (oxlint) and `pnpm typecheck`. Lint and typecheck should pass cleanly, and `pnpm format:check` should report nothing to change.
- **Styling** is plain CSS in `apps/web/app/app.css`, with colours as custom properties at the top. Name classes after what they are (`.site-header`, `.faq-item`), not how they look.
- **Market maths uses exact integers (`bigint`), never floating point.** Round in the pool's favour: costs up, shares paid out down. Any change to the maths needs tests, including edge cases at the threshold and with very large and very small amounts.
- **Keep the mechanism separate from the interface.** Pricing and settlement logic belongs in the engine package, not in UI components.

### Commits

Write commit messages that say what changed and why. One logical change per commit.

## Reporting a security issue

Please don't open a public issue. Report it privately through GitHub's **Report a vulnerability** button on the repository's Security tab.

## Conduct

The project's principles apply here too: respect for open and civil debate, and a commitment to seeking objective truth, through evidence. Argue with ideas, not people.

## License

By contributing, you agree that your contributions are licensed under this repository's [license](LICENSE).
