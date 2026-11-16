// Boundary cases: each rule's range is inclusive, so a cat exactly on the limit counts and a cat a
// hair beyond it does not. Ranges are chosen so the distances are exact in floating point.
import { describe, expect, it } from "vitest";
import type { GameState, Inputs, Settings, Vec2 } from "./types";
import { step } from "./step";
import {
  COUCH,
  FISH,
  IDLE,
  OPEN_WEST,
  SUN,
  TEST_SETTINGS,
  TEST_WORLD,
  inputs,
  pointById,
  quietGame,
  withCat,
} from "./testFixtures";

const DT = 0.1;
const PRECISION_DIGITS = 9;
const EXACT_RANGE = 0.5;
const JUST_PAST = 0.001;
const EDGE_SETTINGS: Settings = {
  ...TEST_SETTINGS,
  swat: { ...TEST_SETTINGS.swat, range: EXACT_RANGE },
  capture: { ...TEST_SETTINGS.capture, radius: EXACT_RANGE },
  treats: { ...TEST_SETTINGS.treats, pickupRadius: EXACT_RANGE },
};
const TEASE = TEST_SETTINGS.hide.teaseRange;
const UNDER_COUCH: Vec2 = { x: 2, z: 7.5 };

function stepEdge(state: GameState, input: Inputs): GameState {
  return step(state, input, DT, TEST_WORLD, EDGE_SETTINGS);
}

function sisterAt(pos: Vec2): GameState {
  return withCat(quietGame(), "sister", { pos });
}

function offsetX(p: Vec2, dx: number): Vec2 {
  return { x: p.x + dx, z: p.z };
}

function offsetZ(p: Vec2, dz: number): Vec2 {
  return { x: p.x, z: p.z + dz };
}

describe("edges", () => {
  it("swat_hits_at_exact_range", () => {
    const swat = inputs({ brother: { swat: true } });
    const atEdge = stepEdge(sisterAt(offsetX(OPEN_WEST, EXACT_RANGE)), swat);
    expect(atEdge.events).toEqual([{ kind: "swatted", by: "brother", target: "sister" }]);
    const beyond = stepEdge(sisterAt(offsetX(OPEN_WEST, EXACT_RANGE + JUST_PAST)), swat);
    expect(beyond.events).toEqual([{ kind: "swat_missed", by: "brother" }]);
  });

  it("swat_ready_when_cooldown_ends_this_step", () => {
    const start = withCat(sisterAt(offsetX(OPEN_WEST, EXACT_RANGE)), "brother", {
      swatCooldown: DT,
    });
    const next = stepEdge(start, inputs({ brother: { swat: true } }));
    expect(next.events).toHaveLength(1);
  });

  it("nap_counts_at_exact_capture_radius", () => {
    const atEdge = stepEdge(sisterAt(offsetX(SUN, EXACT_RANGE)), IDLE);
    expect(atEdge.cats.sister.napping).toBe(true);
    expect(pointById(atEdge, "sun")?.capturer).toBe("sister");
    const beyond = stepEdge(sisterAt(offsetX(SUN, EXACT_RANGE + JUST_PAST)), IDLE);
    expect(beyond.cats.sister.napping).toBe(false);
    expect(pointById(beyond, "sun")?.capturer).toBeNull();
  });

  it("treat_taken_at_exact_pickup_radius", () => {
    const atEdge = stepEdge(sisterAt(offsetZ(FISH, EXACT_RANGE)), IDLE);
    expect(atEdge.events).toEqual([{ kind: "treat", treatId: "fish", by: "sister" }]);
    const beyond = stepEdge(sisterAt(offsetZ(FISH, EXACT_RANGE + JUST_PAST)), IDLE);
    expect(beyond.events).toEqual([]);
  });

  it("tease_scores_at_exact_range", () => {
    const hidden = sisterAt(UNDER_COUCH);
    const atEdge = stepEdge(
      withCat(hidden, "brother", { pos: offsetZ(UNDER_COUCH, -TEASE) }),
      IDLE,
    );
    expect(atEdge.cats.sister.score).toBeCloseTo(
      TEST_SETTINGS.hide.pointsPerSecond * DT,
      PRECISION_DIGITS,
    );
    const far = offsetZ(UNDER_COUCH, -TEASE - JUST_PAST);
    const beyond = stepEdge(withCat(hidden, "brother", { pos: far }), IDLE);
    expect(beyond.cats.sister.score).toBe(0);
  });

  it("hidden_on_hide_spot_edge", () => {
    const edge: Vec2 = { x: UNDER_COUCH.x, z: COUCH.minZ };
    expect(stepEdge(sisterAt(edge), IDLE).cats.sister.hidden).toBe(true);
    const outside = offsetZ(edge, -JUST_PAST);
    expect(stepEdge(sisterAt(outside), IDLE).cats.sister.hidden).toBe(false);
  });

  it("round_ends_when_time_exactly_used", () => {
    const exact = stepEdge({ ...quietGame(), timeLeft: DT }, IDLE);
    expect(exact.phase).toBe("finished");
    const spare = stepEdge({ ...quietGame(), timeLeft: DT + JUST_PAST }, IDLE);
    expect(spare.phase).toBe("playing");
    expect(spare.timeLeft).toBeCloseTo(JUST_PAST, PRECISION_DIGITS);
  });
});
