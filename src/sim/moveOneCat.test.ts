import { describe, expect, it } from "vitest";
import type { CatId, GameState, Vec2 } from "./types";
import type { StepContext } from "./context";
import { applyMovement, moveOneCat } from "./movement";
import {
  BOUNDS,
  COUCH,
  TEST_SETTINGS,
  TEST_WORLD,
  WALL,
  inputs,
  quietGame,
  withCat,
} from "./testFixtures";

const DT = 0.1;
const LONG_DT = 1;
const FRAMES = 12;

const EAST: Vec2 = { x: 1, z: 0 };
const WEST: Vec2 = { x: -1, z: 0 };
const NORTH: Vec2 = { x: 0, z: 1 };
const NORTH_EAST: Vec2 = { x: 1, z: 1 };
const OVERLONG_MOVE: Vec2 = { x: 3, z: 4 };

/** Just west of the wall, below its top end. */
const BESIDE_WALL: Vec2 = { x: 5.4, z: 3 };
/** Just south of the couch, in line with it. */
const BELOW_COUCH: Vec2 = { x: 2, z: 6.5 };
const AGAINST_WALL: Vec2 = { x: WALL.minX - TEST_SETTINGS.cats.brother.radius, z: 3 };
const NEAR_WEST_EDGE: Vec2 = { x: BOUNDS.minX + 1, z: 3 };

interface Case {
  readonly name: string;
  readonly cat: CatId;
  readonly start: Vec2;
  readonly move: Vec2;
  readonly dt: number;
}

const CASES: readonly Case[] = [
  { name: "walks_into_wall", cat: "brother", start: AGAINST_WALL, move: EAST, dt: DT },
  { name: "slides_along_wall", cat: "brother", start: BESIDE_WALL, move: NORTH_EAST, dt: DT },
  { name: "sister_under_couch", cat: "sister", start: BELOW_COUCH, move: NORTH, dt: DT },
  { name: "brother_stopped_by_couch", cat: "brother", start: BELOW_COUCH, move: NORTH, dt: DT },
  { name: "overlong_move_clamped", cat: "sister", start: BESIDE_WALL, move: OVERLONG_MOVE, dt: DT },
  { name: "long_step_to_bounds", cat: "brother", start: NEAR_WEST_EDGE, move: WEST, dt: LONG_DT },
];

function contextFor(id: CatId, move: Vec2, dt: number): StepContext {
  return { world: TEST_WORLD, settings: TEST_SETTINGS, dt, inputs: inputs({ [id]: { move } }) };
}

/** Runs the rule and the single-cat move side by side for several frames; they must never differ. */
function compareFrames(c: Case): void {
  let state: GameState = withCat(quietGame(), c.cat, { pos: c.start });
  let alone = state.cats[c.cat];
  for (let i = 0; i < FRAMES; i++) {
    state = applyMovement(state, contextFor(c.cat, c.move, c.dt));
    alone = moveOneCat(alone, c.move, c.dt, TEST_WORLD, TEST_SETTINGS);
    expect(alone).toEqual(state.cats[c.cat]);
  }
}

describe("moveOneCat", () => {
  it.each(CASES.map((c) => [c.name, c] as const))("matches_apply_movement %s", (_name, c) => {
    compareFrames(c);
  });

  it("sister_ends_past_couch", () => {
    let sister = withCat(quietGame(), "sister", { pos: BELOW_COUCH }).cats.sister;
    for (let i = 0; i < FRAMES; i++) {
      sister = moveOneCat(sister, NORTH, DT, TEST_WORLD, TEST_SETTINGS);
    }
    expect(sister.pos.z).toBeGreaterThan(COUCH.maxZ);
  });
});
