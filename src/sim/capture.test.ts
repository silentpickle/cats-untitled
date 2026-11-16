import { describe, expect, it } from "vitest";
import type { GameState } from "./types";
import {
  BED,
  IDLE,
  SUN,
  TEST_SETTINGS,
  inputs,
  pointById,
  quietGame,
  run,
  stepTest,
  withCat,
  withPoint,
} from "./testFixtures";

/** A power-of-two step so the sister's meter adds up to exactly 1 with no rounding. */
const EXACT_DT = 0.25;
const DT = 0.1;
const PRECISION_DIGITS = 9;
const { capture: CAPTURE, cats: CATS } = TEST_SETTINGS;
const SISTER_FILL_PER_STEP = (EXACT_DT * CATS.sister.captureMultiplier) / CAPTURE.secondsToCapture;
const STEPS_TO_FILL = Math.round(1 / SISTER_FILL_PER_STEP);
const HALF_FULL = 0.5;
const LOW_PROGRESS = 0.1;
const DECAY_PER_EXACT_STEP = EXACT_DT / CAPTURE.secondsToCapture;
const OWNED_POINTS = 2;
const EAST = { x: 1, z: 0 };

function sisterOnSun(): GameState {
  return withCat(quietGame(), "sister", { pos: SUN });
}

describe("capture", () => {
  it("capture_reaches_exactly_one", () => {
    const { state: almost, events } = run(sisterOnSun(), IDLE, EXACT_DT, STEPS_TO_FILL - 1);
    expect(events).toEqual([]);
    expect(pointById(almost, "sun")).toEqual({
      id: "sun",
      owner: null,
      capturer: "sister",
      progress: (STEPS_TO_FILL - 1) * SISTER_FILL_PER_STEP,
    });
    const full = stepTest(almost, IDLE, EXACT_DT);
    expect(pointById(full, "sun")).toEqual({
      id: "sun",
      owner: "sister",
      capturer: null,
      progress: 0,
    });
    expect(full.events).toEqual([{ kind: "captured", pointId: "sun", by: "sister" }]);
  });

  it("brother_fills_by_his_multiplier", () => {
    const start = withCat(quietGame(), "brother", { pos: SUN });
    const next = stepTest(start, IDLE, DT);
    expect(pointById(next, "sun")?.progress).toBeCloseTo(
      (DT * CATS.brother.captureMultiplier) / CAPTURE.secondsToCapture,
      PRECISION_DIGITS,
    );
    expect(next.cats.brother.napping).toBe(true);
  });

  it("contested_point_holds_progress", () => {
    const both = withCat(sisterOnSun(), "brother", { pos: SUN });
    const start = withPoint(both, "sun", { capturer: "sister", progress: HALF_FULL });
    const next = stepTest(start, IDLE, DT);
    expect(pointById(next, "sun")).toEqual({
      id: "sun",
      owner: null,
      capturer: "sister",
      progress: HALF_FULL,
    });
  });

  it("capturer_switch_restarts_progress", () => {
    const start = withPoint(sisterOnSun(), "sun", { capturer: "brother", progress: HALF_FULL });
    const next = stepTest(start, IDLE, EXACT_DT);
    expect(pointById(next, "sun")?.capturer).toBe("sister");
    expect(pointById(next, "sun")?.progress).toBe(SISTER_FILL_PER_STEP);
  });

  it("empty_point_decays_then_clears_capturer", () => {
    const start = withPoint(quietGame(), "sun", { capturer: "sister", progress: LOW_PROGRESS });
    const once = stepTest(start, IDLE, EXACT_DT);
    expect(pointById(once, "sun")?.progress).toBeCloseTo(
      LOW_PROGRESS - DECAY_PER_EXACT_STEP,
      PRECISION_DIGITS,
    );
    expect(pointById(once, "sun")?.capturer).toBe("sister");
    const twice = stepTest(once, IDLE, EXACT_DT);
    expect(pointById(twice, "sun")).toEqual({
      id: "sun",
      owner: null,
      capturer: null,
      progress: 0,
    });
  });

  it("owner_napping_decays_rival_progress", () => {
    const start = withPoint(sisterOnSun(), "sun", {
      owner: "sister",
      capturer: "brother",
      progress: HALF_FULL,
    });
    const next = stepTest(start, IDLE, EXACT_DT);
    expect(pointById(next, "sun")?.progress).toBe(HALF_FULL - DECAY_PER_EXACT_STEP);
    expect(pointById(next, "sun")?.owner).toBe("sister");
  });

  it("moving_cat_does_not_nap", () => {
    const next = stepTest(sisterOnSun(), inputs({ sister: { move: EAST } }), DT);
    expect(next.cats.sister.napping).toBe(false);
    expect(pointById(next, "sun")?.progress).toBe(0);
  });

  it("stunned_or_fleeing_cat_does_not_nap", () => {
    const stunned = stepTest(withCat(sisterOnSun(), "sister", { stunnedFor: 1 }), IDLE, DT);
    expect(stunned.cats.sister.napping).toBe(false);
    expect(pointById(stunned, "sun")?.progress).toBe(0);
    const bothOnSun = withCat(sisterOnSun(), "brother", { pos: SUN });
    const fleeing = withCat(bothOnSun, "brother", { fleeFor: 1 });
    const next = stepTest(fleeing, IDLE, DT);
    expect(next.cats.brother.napping).toBe(false);
  });
});

describe("scoring", () => {
  it("owned_points_score_without_owner_present", () => {
    const owned = withPoint(withPoint(quietGame(), "sun", { owner: "sister" }), "bed", {
      owner: "sister",
    });
    const next = stepTest(owned, IDLE, DT);
    expect(next.cats.sister.score).toBeCloseTo(
      OWNED_POINTS * CAPTURE.pointsPerSecond * DT,
      PRECISION_DIGITS,
    );
    expect(next.cats.brother.score).toBe(0);
    expect(next.cats.sister.pos).not.toEqual(BED);
  });
});
