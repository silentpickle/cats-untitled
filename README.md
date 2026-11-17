# Cats Untitled

A browser game: play as Aragorn or Arwen, two black cats in their old house, and nap on contested spots to
score. Play the computer, or send a friend a room code and play each other. Nothing to install to play; it runs from a web page:
**<https://silentpickle.github.io/cats-untitled/>**

```bash
pnpm install
pnpm dev      # play locally
pnpm check    # types, lint, format, tests
pnpm build    # static site in dist/
```

## Documentation

- [How to play](docs/how-to-play.md): the cats, controls, scoring, abilities and mischief lists.
- [Code tour](docs/code-tour.md): how the code is organised and where to make common changes.
- [Multiplayer](docs/multiplayer.md): room-code play with a friend, no server; how it works and how to reuse
  it in another project.
- [Plan](docs/plan.md): milestones, what is built and what is not.
- [Asset credits](docs/credits.md): where the models came from.

Every tunable number (speeds, round length, scores, cooldowns) is in `config.toml`. The house layout is in
`src/house/mainFloor.ts`.
