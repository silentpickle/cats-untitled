# Cats Untitled: build plan

A browser game for a kid who misses his cats: play as one of two black cats in their old house, napping on contested spots to score.
First pass goal: get close with what we have (ten old photos, a stock cat), built so better photos and a floor
plan sketch can be dropped in later without rewriting code.

## What we have

**Photos** (`cats_untitled_house/`, ten images) cover the main floor's open area only:

| Area        | What the photos show                                                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foyer       | Front door with sidelight, closet door, round shag rug, bench, hall mirror, green floor cushions                                                   |
| Living room | Vaulted ceiling with fan, corner fireplace wall with two shuttered windows, TV stand, two green couches in an L, glass coffee table, patterned rug |
| Dining nook | White table and four chairs, pendant lamp, baker's rack, sliding door with vertical blinds                                                         |
| Kitchen     | U-shape with oak cabinets and white appliances, angled peninsula with two stools, door (garage or laundry), a pet bed on the counter               |
| Exterior    | Brick ranch-style condo, two-car garage, a window in the gable above it                                                                            |

**Not in the photos:** bedrooms, bathrooms, stairs, and the other floor. Those are placeholders in the first pass.

**Cat model:** Quaternius has two CC0 rigged, animated cats on poly.pizza (`/m/qKICY6xla2` and `/m/2f54vbV0In`),
both in glTF. One model serves both cats: tinted black, scaled up and slowed for the brother, a white chest
fleck for the sister. Not yet downloaded or inspected, so the animation list is unconfirmed.

**Blender:** 5.0.1 is installed. The Blender MCP is not reachable from this project yet (see "Blender MCP
status"). The first pass does not need it: headless Blender handles any format conversion.

## Decisions

| Decision  | Choice                                                              | Why                                                                             |
| --------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Engine    | Three.js, TypeScript, Vite                                          | Loads from a link with no install; testable in the browser pane                 |
| Camera    | Fixed high angle that follows the cat, no ceilings, near walls fade | Reads like a dollhouse, avoids third-person camera clipping in small rooms      |
| Movement  | 2D collision on a floor plan, no physics engine                     | Cats walk and hop onto furniture via marked "perch" spots; far less to go wrong |
| House     | Described as data (rooms, walls, furniture, points), not code       | New photos or a sketch change one data file                                     |
| Furniture | Kenney Furniture Kit (CC0), boxes where the kit has no match        | One consistent style, quick to place                                            |
| Opponent  | AI sibling, or a friend by room code                                | Online play is peer-to-peer with no server of ours; see `multiplayer.md`        |
| Floors    | Main floor from photos; second floor is an invented bedroom level   | Stairs are a trigger that swaps floors                                          |
| Hosting   | GitHub Pages, deployed from `main` by `.github/workflows/pages.yml` | Free, one link, no account needed to play; deploys itself on every merge        |

## Game rules (first pass)

- A round lasts three minutes. Nap points are spread around the house: sunbeam, couch, pet bed, food bowl,
  fireplace rug, a lap.
- Sitting on a free point fills its meter; a full point scores every second it is held.
- **Brother:** slow, captures faster, can swat his sister off a point (short stun, she bolts).
- **Sister:** fast, fits into hiding spots (under the couch, behind the TV stand, in the baker's rack basket),
  scores extra for treats and for time spent hidden near the brother.
- The round ends at night with both cats asleep on the bed, then the score screen.

## Code layout

```
config.toml            every tunable: round length, speeds, capture rates, scores
src/sim/               game rules, pure TypeScript, no Three.js, fully unit tested
src/house/             house data plus the loader that turns it into walls, furniture, points
src/render/            Three.js scene, cat models, animation, camera
src/input/             keyboard and touch joystick
src/ui/                HUD, cat select, score screen
assets/                glTF models, kept with their licence files
docs/                  this plan, asset credits, ADRs
```

Keeping `src/sim/` free of rendering is the main structural rule: the rules can be tested without a browser,
and the renderer only draws what the sim reports.

Tooling from the first commit: `tsc` strict with `noUncheckedIndexedAccess`, ESLint `strict-type-checked` with
complexity 15, max depth 2 and no magic numbers, Prettier, Vitest, and a pre-commit hook running all four.

## Milestones

| #   | Milestone               | Done when                                                                                               |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| M0  | Scaffold                | Empty scene runs locally; lint, types, tests and pre-commit hook pass                                   |
| M1  | Walkable main floor     | One cat walks the greybox main floor from the photos, collides with walls and furniture, camera follows |
| M2  | Nap points              | Points capture and score, round timer and HUD work, round ends on a score screen                        |
| M3  | Two cats                | Cat select screen; AI sibling contests points; swat, hide and bolt work                                 |
| M4  | Dressed house           | Kit furniture replaces boxes; lighting, sunbeams, fireplace glow                                        |
| M5  | Second floor and people | Stairs swap floors; wandering humans with laps and treats; night finale on the bed                      |
| M6  | Mischief and sound      | Goose-style to-do list, purrs, meows, knocked-over cups                                                 |
| M7  | Publish                 | Touch controls, load time checked, live on GitHub Pages                                                 |

**"Close on what we have" is M0 to M4.** M5 onward waits on the floor plan sketch and newer photos.

## Orchestration

One integrator (the main session) owns the repo, the milestone gates, and all commits. Work that touches
separate folders runs in parallel as subagents; work that shares files runs in sequence.

| Stage | Runs                                                                                                                                                                                             | Owns                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| 1     | M0 scaffold, alone                                                                                                                                                                               | whole repo                                 |
| 2     | Three in parallel: **assets** (download, inspect, convert, tint the cat; fetch furniture kit), **house data** (main floor layout from the photos), **sim** (capture, scoring, timer, with tests) | `assets/`, `src/house/`, `src/sim/`        |
| 3     | Integrator wires render, input and camera to those three (M1, M2)                                                                                                                                | `src/render/`, `src/input/`, `src/ui/`     |
| 4     | Two in parallel: **cat AI and abilities** (sim side), **furniture dressing and lighting** (render side) (M3, M4)                                                                                 | `src/sim/ai/`, `src/render/`, `src/house/` |
| 5     | Independent review of the whole diff, then a play-through                                                                                                                                        | none (read-only)                           |

Gate at every milestone, run by the integrator, not by the agent that did the work:

1. Lint, type check and tests pass.
2. The game is opened in the browser pane and the milestone's "done when" is checked by playing it, with a
   screenshot kept.
3. One commit per milestone.

## Blender MCP status

Not usable from this project as of 2026-11-16:

- The `blender` server is registered only for the parent folder `~/test_qwen`, so sessions opened in
  `cats_untitled` do not load it. Re-registering with `--scope user` fixes that.
- No add-on is installed in Blender 5.0's user folder, Blender is not running, and nothing is listening on
  the add-on's port (9876).

It becomes worth fixing at M4 if the stock cat needs reshaping (long fur for the brother).

## Still needed

| Item                                                            | Blocks             | Default until then                |
| --------------------------------------------------------------- | ------------------ | --------------------------------- |
| Go-ahead to download the cat model and furniture kit            | M1 with a real cat | Capsule stand-in                  |
| The cats' names                                                 | Cat select screen  | "Brother" and "Sister"            |
| What the player plays on (keyboard, tablet, phone)              | M7 controls        | Keyboard first, touch added at M7 |
| Floor plan sketch, including what "top" and "bottom" floors are | M5                 | Invented bedroom level            |
| Newer photos, especially the kid's room and the bed             | M5 finale          | Generic bedroom                   |

## Status (2026-11-16)

Built for the main floor: both cats (Aragorn the brother, Arwen the sister), the computer sibling, nap
points, treats, swat, hiding, scoring, the round clock, cat select and score screens, kit furniture tinted
to match the photos, keyboard and touch controls, a mischief list per cat, knockable things (cup, remote,
toy mouse), synthesized sound, and two-player online play by room code (`multiplayer.md`). Published at <https://silentpickle.github.io/cats-untitled/>, redeployed on every push to `main`. Not
started: the second floor, people, the bedtime ending.

Known rough edges:

- Cats walk through couch backs and pop onto seats and the counter; there is no jump animation yet.
- Kitchen appliances on the cut-away south wall are seen from behind.
- The brother's "long hair" is only a wider body; the stock model has no fur.
- Balance between the two computer cats swings a lot with small setting changes (`src/balance.test.ts`
  only guards against a shutout).
- Arwen's stealth (Space) lasts 3 seconds with a 9 second cooldown; Aragorn's swat hits anywhere in range
  and can be retried 0.7 seconds after a miss. Both are set in `config.toml`.
- The computer cat does not go after its mischief list; it only ticks items off by accident.
- Sounds are synthesized and have not been tuned by ear.
- Online play has been tested in two tabs on one machine, not yet across two devices or networks, and not
  through a round ending into "Play again". The host's page must stay in front: browsers throttle background
  tabs, which nearly stops the game for both players.
