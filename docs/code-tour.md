# Code tour

How the game is put together, and where to go to change something. For what the game does, see
`how-to-play.md`; for what is planned, see `plan.md`.

## The shape of it

```
config.toml ──► src/config.ts ──┐
                                ▼
src/house/ (layout data) ──► src/sim/ (rules, no drawing) ──► src/main.ts (the loop)
                                                                   │
                         src/input/ ──────────────────────────────►│
                                                                   ▼
                              src/render/   src/ui/   src/audio/   (what you see and hear)
```

The one rule that holds it together: **`src/sim/` knows nothing about drawing, sound or the browser.** It
takes a state and the two cats' inputs and returns the next state. Everything else reads that state.

| Folder        | Job                                                                                    |
| ------------- | -------------------------------------------------------------------------------------- |
| `src/sim/`    | The rules and the computer opponent. Pure functions, fully unit tested.                |
| `src/house/`  | The house as data, and `toWorld.ts`, which turns it into what the rules need.          |
| `src/render/` | Three.js: the stage, the house, the cats, the rings, the knockable things, the camera. |
| `src/input/`  | Keyboard, tap-to-move, and the on-screen ability button.                               |
| `src/ui/`     | The HTML overlay: scoreboard, mischief list, ability pill, select and result screens.  |
| `src/audio/`  | Sounds synthesized with Web Audio. No audio files.                                     |
| `src/main.ts` | Loads everything and runs the frame loop.                                              |

## One frame

1. `main.ts` reads the player's input and asks `aiInput` for the other cat's.
2. `step` (in `src/sim/step.ts`) advances the rules by 1/60 of a second and returns a new state, with a list
   of `events` for what just happened (a capture, a swat, a treat).
3. `feedback.ts` turns each event into a message and sounds.
4. The views in `src/render/` and `src/ui/` are updated from the state and the frame is drawn.

`step` runs a fixed list of small rules in order (`RULES` in `step.ts`): movement, timers, hiding, stealth,
swat, napping, capture, scoring, treats, knocking, mischief, and the round clock. Each rule is one function in
its own file.

## Common changes

| To change                                     | Edit                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| A speed, time, range or score                 | `config.toml`                                                            |
| Furniture, walls, nap spots, treats           | `src/house/mainFloor.ts`                                                 |
| A mischief-list item                          | The `mischief` list in `src/house/mainFloor.ts`                          |
| A new kind of mischief goal                   | `MischiefGoal` in `src/sim/types.ts`, a checker in `src/sim/mischief.ts` |
| A new rule                                    | A new file in `src/sim/`, added to `RULES` in `step.ts`, with tests      |
| How the computer cat plays                    | The constants at the top of `src/sim/ai.ts`                              |
| What a sound is                               | Its recipe in `src/audio/recipes.ts`                                     |
| What is said or played when something happens | `src/feedback.ts`                                                        |
| The cats' names                               | `CAT_NAMES` in `src/ui/screens.ts`, and the labels in `index.html`       |
| Colours of the couch, rugs, counters          | `COLORS` in `src/house/mainFloor.ts`                                     |

## The house as data

`mainFloor.ts` describes one floor in metres, with x running east and z running south toward the camera.

- **Walls** are straight segments. `cutaway` walls are drawn as a low curb so the camera sees over them.
- **Furniture** has a position, a size, and which way it faces. A piece is either a Kenney kit model (by
  name) stretched to fit that size, or a plain coloured box.
  - `blocks: "both"` stops both cats; `blocks: "brother"` lets Arwen under it.
  - `hide: true` makes that footprint a hiding place.
  - `platformHeight` lets cats stand on it (a couch seat, the counter).
- **Nap points, treats and knockables** are positions with a name.

`toWorld.test.ts` checks that every nap point, treat and spawn is reachable, which catches most layout
mistakes.

## The cats on screen

Both cats are the same stock model (`public/assets/cat.glb`). `catTexture.ts` repaints its colour swatches
black with yellow eyes at load time; `catView.ts` scales each cat, adds Arwen's chest fleck, picks the
animation for what the cat is doing, and handles the swat lunge and the stealth fade.

## Checks

```bash
pnpm check
```

This runs the type checker, ESLint, shellcheck, Prettier and the tests. The pre-commit hook runs the same
thing, so a commit that fails any of them is refused.

- **Lint is strict on purpose:** functions stay under complexity 15, nesting stays within two levels, and
  numbers get names. The house layout file is the one exception for numbers, because it is a table of
  coordinates.
- **`src/balance.test.ts`** plays a whole round of computer against computer on the real house and fails if
  one cat is shut out. Run it after changing speeds or capture rates.

## Play-testing by script

In the browser console, `window.catsGame` exposes two helpers:

- `catsGame.snapshot()` returns the current player and rules state.
- `catsGame.fastForward(seconds, input)` runs the rules ahead with a fixed input, for example
  `catsGame.fastForward(5, { move: { x: 1, z: 0 }, swat: false, stealth: false })`.
