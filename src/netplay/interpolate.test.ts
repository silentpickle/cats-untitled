import { describe, expect, it } from "vitest";
import { loadSettings } from "../config";
import { MAIN_FLOOR } from "../house/mainFloor";
import { toWorld } from "../house/toWorld";
import { createGame } from "../sim";
import type { GameState, Vec2 } from "../sim/types";
import { withCat } from "../sim/testFixtures";
import { interpolateState, lerpAngle } from "./interpolate";

const PRECISION_DIGITS = 9;
const MIDWAY = 0.5;
const QUARTER = 0.25;
const BEFORE_START = -0.5;
const PAST_END = 1.5;

const BROTHER_FROM: Vec2 = { x: 2, z: 4 };
const BROTHER_TO: Vec2 = { x: 4, z: 8 };
const SISTER_FROM: Vec2 = { x: 10, z: 2 };
const SISTER_TO: Vec2 = { x: 9, z: 6 };
const FACING_NEAR_PI = 3.0;
const FACING_NEAR_MINUS_PI = -3.0;
const FACING_FROM = 0.2;
const FACING_TO = 1.0;
const TIME_FROM = 100;
const TIME_TO = 99;
const PROGRESS_FROM = 0.2;
const PROGRESS_TO = 0.6;
const STUN_FROM = 1.2;
const STUN_TO = 0.4;
const SCORE_TO = 7;

const world = toWorld(MAIN_FLOOR);
const sim = loadSettings().sim;

function firstPointId(state: GameState): string {
  const point = state.points[0];
  if (point === undefined) throw new Error("the house has no nap points");
  return point.id;
}

function withProgress(state: GameState, owner: "brother" | null, progress: number): GameState {
  const id = firstPointId(state);
  const points = state.points.map((p) =>
    p.id === id ? { ...p, owner, capturer: "sister" as const, progress } : p,
  );
  return { ...state, points };
}

/** Two snapshots a step apart: both cats moved and turned, the clock ran, a meter filled. */
function snapshots(): { readonly from: GameState; readonly to: GameState } {
  const base = createGame(world, sim);
  let from = withCat(base, "brother", { pos: BROTHER_FROM, facing: FACING_FROM });
  from = withCat(from, "sister", {
    pos: SISTER_FROM,
    facing: FACING_NEAR_PI,
    stunnedFor: STUN_FROM,
  });
  from = withProgress({ ...from, timeLeft: TIME_FROM }, null, PROGRESS_FROM);
  let to = withCat(base, "brother", { pos: BROTHER_TO, facing: FACING_TO, score: SCORE_TO });
  to = withCat(to, "sister", {
    pos: SISTER_TO,
    facing: FACING_NEAR_MINUS_PI,
    stunnedFor: STUN_TO,
    moving: true,
  });
  to = withProgress({ ...to, timeLeft: TIME_TO }, null, PROGRESS_TO);
  to = { ...to, events: [{ kind: "stealth", by: "sister" }] };
  return { from, to };
}

function pointProgress(state: GameState): number | undefined {
  return state.points.find((p) => p.id === firstPointId(state))?.progress;
}

describe("interpolateState", () => {
  it("midpoint_blends_positions", () => {
    const { from, to } = snapshots();
    const mid = interpolateState(from, to, MIDWAY);
    expect(mid.cats.brother.pos.x).toBeCloseTo((BROTHER_FROM.x + BROTHER_TO.x) * MIDWAY);
    expect(mid.cats.brother.pos.z).toBeCloseTo((BROTHER_FROM.z + BROTHER_TO.z) * MIDWAY);
    expect(mid.timeLeft).toBeCloseTo((TIME_FROM + TIME_TO) * MIDWAY, PRECISION_DIGITS);
    expect(pointProgress(mid)).toBeCloseTo((PROGRESS_FROM + PROGRESS_TO) * MIDWAY);
  });

  it("each_cat_blended_independently", () => {
    const { from, to } = snapshots();
    const q = interpolateState(from, to, QUARTER);
    const along = (a: number, b: number): number => a + (b - a) * QUARTER;
    expect(q.cats.brother.pos.x).toBeCloseTo(along(BROTHER_FROM.x, BROTHER_TO.x), PRECISION_DIGITS);
    expect(q.cats.brother.pos.z).toBeCloseTo(along(BROTHER_FROM.z, BROTHER_TO.z), PRECISION_DIGITS);
    expect(q.cats.sister.pos.x).toBeCloseTo(along(SISTER_FROM.x, SISTER_TO.x), PRECISION_DIGITS);
    expect(q.cats.sister.pos.z).toBeCloseTo(along(SISTER_FROM.z, SISTER_TO.z), PRECISION_DIGITS);
    expect(q.cats.brother.facing).toBeCloseTo(along(FACING_FROM, FACING_TO), PRECISION_DIGITS);
  });

  it("facing_wraps_through_pi", () => {
    const { from, to } = snapshots();
    const mid = interpolateState(from, to, MIDWAY);
    expect(Math.abs(mid.cats.sister.facing)).toBeCloseTo(Math.PI, PRECISION_DIGITS);
    const quarter = lerpAngle(FACING_NEAR_PI, FACING_NEAR_MINUS_PI, QUARTER);
    expect(quarter).toBeGreaterThan(FACING_NEAR_PI);
    const threeQuarters = lerpAngle(FACING_NEAR_PI, FACING_NEAR_MINUS_PI, 1 - QUARTER);
    expect(threeQuarters).toBeLessThan(FACING_NEAR_MINUS_PI);
  });

  it("discrete_fields_from_to", () => {
    const { from, to } = snapshots();
    const mid = interpolateState(from, to, MIDWAY);
    expect(mid.cats.sister.stunnedFor).toBe(STUN_TO);
    expect(mid.cats.sister.moving).toBe(true);
    expect(mid.cats.brother.score).toBe(SCORE_TO);
    expect(mid.phase).toBe(to.phase);
    expect(mid.treats).toBe(to.treats);
    expect(mid.knockables).toBe(to.knockables);
    expect(mid.mischief).toBe(to.mischief);
  });

  it("events_always_empty", () => {
    const { from, to } = snapshots();
    for (const t of [0, QUARTER, 1]) {
      expect(interpolateState(from, to, t).events).toEqual([]);
    }
  });

  it("meter_jumps_when_owner_changes", () => {
    const { from, to } = snapshots();
    const taken = withProgress(to, "brother", PROGRESS_TO);
    expect(pointProgress(interpolateState(from, taken, MIDWAY))).toBe(PROGRESS_TO);
  });

  it("meter_jumps_when_capturer_changes", () => {
    const { from, to } = snapshots();
    const points = to.points.map((p) => ({ ...p, capturer: "brother" as const }));
    expect(pointProgress(interpolateState(from, { ...to, points }, MIDWAY))).toBe(PROGRESS_TO);
  });

  it("ends_equal_snapshots", () => {
    const { from, to } = snapshots();
    expect(interpolateState(from, to, 0)).toEqual({ ...from, events: [] });
    expect(interpolateState(from, to, 1)).toEqual({ ...to, events: [] });
  });

  it("t_clamped_to_unit_range", () => {
    const { from, to } = snapshots();
    expect(interpolateState(from, to, BEFORE_START)).toEqual({ ...from, events: [] });
    expect(interpolateState(from, to, PAST_END)).toEqual({ ...to, events: [] });
    expect(interpolateState(from, to, Number.NaN)).toEqual({ ...from, events: [] });
  });
});
