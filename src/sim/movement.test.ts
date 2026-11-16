import { describe, expect, it } from "vitest";
import type { Vec2 } from "./types";
import { normalize, scale, sub } from "./geometry";
import {
  BOUNDS,
  COUCH,
  IDLE,
  OPEN_WEST,
  TEST_SETTINGS,
  WALL,
  inputs,
  quietGame,
  run,
  stepTest,
  withCat,
} from "./testFixtures";

const DT = 0.1;
const PRECISION_DIGITS = 6;
/** Contact is found by bisection, so a stopped cat sits within this of the obstacle edge. */
const CONTACT_TOLERANCE = 0.01;
const STEPS_TO_CROSS_ROOM = 100;
const STEPS_TO_SLIDE = 10;

const EAST: Vec2 = { x: 1, z: 0 };
const WEST: Vec2 = { x: -1, z: 0 };
const NORTH: Vec2 = { x: 0, z: 1 };
const NORTH_EAST: Vec2 = { x: 1, z: 1 };
const OVERLONG_MOVE: Vec2 = { x: 3, z: 4 };
const HEADING_EAST = Math.atan2(EAST.x, EAST.z);

/** Just west of the wall, below its top end. */
const BESIDE_WALL: Vec2 = { x: 5.4, z: 3 };
/** Just south of the couch, in line with it. */
const BELOW_COUCH: Vec2 = { x: 2, z: 6.5 };
/** Same spot as BESIDE_WALL but pressed against the wall for the brother. */
const AGAINST_WALL: Vec2 = { x: WALL.minX - TEST_SETTINGS.cats.brother.radius, z: 3 };

const { brother: BROTHER, sister: SISTER } = TEST_SETTINGS.cats;

describe("movement", () => {
  it("move_clamped_to_unit_length", () => {
    const start = withCat(quietGame(), "sister", { pos: OPEN_WEST });
    const next = stepTest(start, inputs({ sister: { move: OVERLONG_MOVE } }), DT);
    const expected = scale(normalize(OVERLONG_MOVE), SISTER.speed * DT);
    const moved = sub(next.cats.sister.pos, OPEN_WEST);
    expect(moved.x).toBeCloseTo(expected.x, PRECISION_DIGITS);
    expect(moved.z).toBeCloseTo(expected.z, PRECISION_DIGITS);
  });

  it("facing_follows_movement_and_holds_when_still", () => {
    const moved = stepTest(quietGame(), inputs({ brother: { move: EAST } }), DT);
    expect(moved.cats.brother.facing).toBeCloseTo(HEADING_EAST, PRECISION_DIGITS);
    expect(moved.cats.brother.moving).toBe(true);
    const still = stepTest(moved, IDLE, DT);
    expect(still.cats.brother.facing).toBeCloseTo(HEADING_EAST, PRECISION_DIGITS);
    expect(still.cats.brother.moving).toBe(false);
  });

  it("cat_stops_at_bounds", () => {
    const { state } = run(
      quietGame(),
      inputs({ brother: { move: WEST } }),
      DT,
      STEPS_TO_CROSS_ROOM,
    );
    expect(state.cats.brother.pos.x).toBeCloseTo(BOUNDS.minX + BROTHER.radius, PRECISION_DIGITS);
  });

  it("cat_slides_along_wall", () => {
    const start = withCat(quietGame(), "brother", { pos: BESIDE_WALL });
    const push = inputs({ brother: { move: NORTH_EAST } });
    const { state } = run(start, push, DT, STEPS_TO_SLIDE);
    const pos = state.cats.brother.pos;
    expect(pos.x).toBeLessThanOrEqual(WALL.minX - BROTHER.radius);
    expect(pos.x).toBeGreaterThan(WALL.minX - BROTHER.radius - CONTACT_TOLERANCE);
    const climb = STEPS_TO_SLIDE * BROTHER.speed * DT * normalize(NORTH_EAST).z;
    expect(pos.z - BESIDE_WALL.z).toBeCloseTo(climb, PRECISION_DIGITS);
  });

  it("pushing_into_wall_is_not_moving", () => {
    const start = withCat(quietGame(), "brother", { pos: AGAINST_WALL, facing: 0 });
    const next = stepTest(start, inputs({ brother: { move: EAST } }), DT);
    expect(next.cats.brother.pos).toEqual(AGAINST_WALL);
    expect(next.cats.brother.moving).toBe(false);
    expect(next.cats.brother.facing).toBe(0);
  });

  it("both_obstacle_stops_sister", () => {
    const start = withCat(quietGame(), "sister", { pos: BESIDE_WALL });
    const { state } = run(start, inputs({ sister: { move: EAST } }), DT, STEPS_TO_SLIDE);
    expect(state.cats.sister.pos.x).toBeLessThanOrEqual(WALL.minX - SISTER.radius);
  });

  it("sister_passes_under_brother_only_obstacle", () => {
    const start = withCat(quietGame(), "sister", { pos: BELOW_COUCH });
    const { state } = run(start, inputs({ sister: { move: NORTH } }), DT, STEPS_TO_SLIDE);
    expect(state.cats.sister.pos.z).toBeGreaterThan(COUCH.maxZ);
  });

  it("brother_blocked_by_brother_only_obstacle", () => {
    const start = withCat(quietGame(), "brother", { pos: BELOW_COUCH });
    const { state } = run(start, inputs({ brother: { move: NORTH } }), DT, STEPS_TO_SLIDE);
    expect(state.cats.brother.pos.z).toBeLessThanOrEqual(COUCH.minZ - BROTHER.radius);
    expect(state.cats.brother.pos.z).toBeGreaterThan(
      COUCH.minZ - BROTHER.radius - CONTACT_TOLERANCE,
    );
  });

  it("cats_pass_through_each_other", () => {
    const start = withCat(withCat(quietGame(), "brother", { pos: OPEN_WEST }), "sister", {
      pos: sub(OPEN_WEST, EAST),
    });
    const next = stepTest(start, inputs({ sister: { move: EAST } }), DT);
    expect(next.cats.sister.pos.x).toBeCloseTo(
      OPEN_WEST.x - EAST.x + SISTER.speed * DT,
      PRECISION_DIGITS,
    );
  });

  it("non_finite_input_is_ignored", () => {
    const bad: Vec2 = { x: Number.NaN, z: Number.POSITIVE_INFINITY };
    const next = stepTest(quietGame(), inputs({ brother: { move: bad } }), DT);
    expect(next.cats.brother.pos).toEqual(OPEN_WEST);
    expect(next.cats.brother.moving).toBe(false);
  });
});
