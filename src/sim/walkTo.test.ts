import { describe, expect, it } from "vitest";
import type { Vec2 } from "./types";
import { buildNavGrid } from "./nav";
import { step } from "./step";
import { WALK_ARRIVE_METRES, planWalk, walkInput } from "./walkTo";
import { IDLE_INPUT } from "./stateOps";
import { distance, pointInRect } from "./geometry";
import {
  OPEN_EAST,
  OPEN_WEST,
  TABLE,
  TEST_SETTINGS,
  TEST_WORLD,
  WALL,
  quietGame,
  withCat,
} from "./testFixtures";

const STEPS_PER_SECOND = 30;
const DT = 1 / STEPS_PER_SECOND;
const MAX_SECONDS = 20;
const INSIDE_TABLE: Vec2 = { x: 9, z: 2.5 };
const OUTSIDE_HOUSE: Vec2 = { x: -5, z: 3 };
const NUDGE = 0.01;

const nav = buildNavGrid(TEST_WORLD, "brother", TEST_SETTINGS);

/** Walks the brother toward `to` until he stops; returns where he ended and whether he hit the wall. */
function walk(from: Vec2, to: Vec2): { readonly end: Vec2; readonly enteredWall: boolean } {
  const goal = planWalk(nav, to);
  if (goal === undefined) throw new Error("no walkable cell in the test world");
  let state = withCat(quietGame(), "brother", { pos: from });
  let enteredWall = false;
  for (let i = 0; i < MAX_SECONDS * STEPS_PER_SECOND; i += 1) {
    const move = walkInput(nav, goal, state.cats.brother.pos);
    if (move.x === 0 && move.z === 0) break;
    const inputs = { brother: { ...IDLE_INPUT, move }, sister: IDLE_INPUT };
    state = step(state, inputs, DT, TEST_WORLD, TEST_SETTINGS);
    enteredWall ||= pointInRect(state.cats.brother.pos, WALL);
  }
  return { end: state.cats.brother.pos, enteredWall };
}

describe("walking to a tapped spot", () => {
  it("cat_walks_around_the_wall_to_the_far_side", () => {
    const { end, enteredWall } = walk(OPEN_WEST, OPEN_EAST);
    expect(distance(end, OPEN_EAST)).toBeLessThanOrEqual(WALK_ARRIVE_METRES);
    expect(enteredWall).toBe(false);
  });

  it("tap_inside_furniture_goes_to_the_nearest_standable_spot", () => {
    const goal = planWalk(nav, INSIDE_TABLE);
    expect(goal).toBeDefined();
    expect(pointInRect(goal?.target ?? INSIDE_TABLE, TABLE)).toBe(false);
    const { end } = walk(OPEN_EAST, INSIDE_TABLE);
    expect(distance(end, goal?.target ?? INSIDE_TABLE)).toBeLessThanOrEqual(WALK_ARRIVE_METRES);
  });

  it("tap_outside_the_house_stays_inside", () => {
    const goal = planWalk(nav, OUTSIDE_HOUSE);
    expect(goal?.target.x).toBeGreaterThan(0);
  });

  it("no_movement_once_within_arrival_distance", () => {
    const goal = planWalk(nav, OPEN_EAST);
    if (goal === undefined) throw new Error("no walkable cell in the test world");
    const justInside = { x: OPEN_EAST.x + WALK_ARRIVE_METRES, z: OPEN_EAST.z };
    const justOutside = { x: OPEN_EAST.x + WALK_ARRIVE_METRES + NUDGE, z: OPEN_EAST.z };
    expect(walkInput(nav, goal, justInside)).toEqual({ x: 0, z: 0 });
    expect(walkInput(nav, goal, justOutside)).not.toEqual({ x: 0, z: 0 });
  });
});
