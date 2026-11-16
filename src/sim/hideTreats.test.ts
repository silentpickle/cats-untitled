import { describe, expect, it } from "vitest";
import type { Vec2 } from "./types";
import { HALF } from "./geometry";
import {
  FISH,
  IDLE,
  OPEN_EAST,
  TEST_SETTINGS,
  quietGame,
  stepTest,
  treatById,
  withCat,
  withTreat,
} from "./testFixtures";

const DT = 0.1;
const PRECISION_DIGITS = 9;
const { hide: HIDE, treats: TREATS } = TEST_SETTINGS;

const UNDER_COUCH: Vec2 = { x: 2, z: 7.5 };
/** In front of the couch, within tease range of UNDER_COUCH. */
const NEAR_COUCH: Vec2 = { x: 2, z: 6 };
const QUARTER = 0.25;
const RESPAWN_STEPS = 1.5;
/** Two spots in pickup range of the fish, one nearer than the other. */
const FISH_CLOSE: Vec2 = { x: FISH.x, z: FISH.z - TREATS.pickupRadius * QUARTER };
const FISH_FAR: Vec2 = { x: FISH.x, z: FISH.z + TREATS.pickupRadius * HALF };
/** Same distance from the fish as FISH_CLOSE, on the other side. */
const FISH_EVEN: Vec2 = { x: FISH.x, z: FISH.z + TREATS.pickupRadius * QUARTER };
const RESPAWN_SOON = DT * RESPAWN_STEPS;

describe("hiding", () => {
  it("sister_hidden_inside_hide_spot", () => {
    const next = stepTest(withCat(quietGame(), "sister", { pos: UNDER_COUCH }), IDLE, DT);
    expect(next.cats.sister.hidden).toBe(true);
  });

  it("brother_never_hidden", () => {
    const next = stepTest(withCat(quietGame(), "brother", { pos: UNDER_COUCH }), IDLE, DT);
    expect(next.cats.brother.hidden).toBe(false);
  });

  it("hidden_sister_scores_near_brother", () => {
    const hidden = withCat(quietGame(), "sister", { pos: UNDER_COUCH });
    const next = stepTest(withCat(hidden, "brother", { pos: NEAR_COUCH }), IDLE, DT);
    expect(next.cats.sister.score).toBeCloseTo(HIDE.pointsPerSecond * DT, PRECISION_DIGITS);
  });

  it("hidden_sister_no_score_out_of_tease_range", () => {
    const next = stepTest(withCat(quietGame(), "sister", { pos: UNDER_COUCH }), IDLE, DT);
    expect(next.cats.sister.score).toBe(0);
  });

  it("visible_sister_no_tease_score", () => {
    const visible = withCat(quietGame(), "sister", { pos: NEAR_COUCH });
    const next = stepTest(withCat(visible, "brother", { pos: NEAR_COUCH }), IDLE, DT);
    expect(next.cats.sister.score).toBe(0);
  });
});

describe("treats", () => {
  it("treat_pickup_scores_and_starts_respawn", () => {
    const next = stepTest(withCat(quietGame(), "sister", { pos: FISH }), IDLE, DT);
    expect(next.cats.sister.score).toBe(TREATS.points);
    expect(treatById(next, "fish")).toEqual({
      id: "fish",
      available: false,
      respawnIn: TREATS.respawnSeconds,
    });
    expect(next.events).toEqual([{ kind: "treat", treatId: "fish", by: "sister" }]);
  });

  it("treat_tie_goes_to_nearer_cat", () => {
    const sisterNear = withCat(quietGame(), "sister", { pos: FISH_CLOSE });
    const next = stepTest(withCat(sisterNear, "brother", { pos: FISH_FAR }), IDLE, DT);
    expect(next.events).toEqual([{ kind: "treat", treatId: "fish", by: "sister" }]);
    expect(next.cats.brother.score).toBe(0);
    const brotherNear = withCat(quietGame(), "brother", { pos: FISH_CLOSE });
    const swapped = stepTest(withCat(brotherNear, "sister", { pos: FISH_FAR }), IDLE, DT);
    expect(swapped.events).toEqual([{ kind: "treat", treatId: "fish", by: "brother" }]);
  });

  it("treat_exact_tie_goes_to_brother", () => {
    const even = withCat(quietGame(), "sister", { pos: FISH_EVEN });
    const next = stepTest(withCat(even, "brother", { pos: FISH_EVEN }), IDLE, DT);
    expect(next.events).toEqual([{ kind: "treat", treatId: "fish", by: "brother" }]);
  });

  it("stunned_cat_cannot_take_treat", () => {
    const stunned = withCat(quietGame(), "sister", { pos: FISH, stunnedFor: 1 });
    const next = stepTest(stunned, IDLE, DT);
    expect(next.events).toEqual([]);
    expect(treatById(next, "fish")?.available).toBe(true);
  });

  it("treat_respawns_after_countdown", () => {
    const taken = withTreat(quietGame(), "fish", { available: false, respawnIn: RESPAWN_SOON });
    const once = stepTest(taken, IDLE, DT);
    expect(treatById(once, "fish")?.available).toBe(false);
    expect(treatById(once, "fish")?.respawnIn).toBeCloseTo(RESPAWN_SOON - DT, PRECISION_DIGITS);
    const twice = stepTest(once, IDLE, DT);
    expect(treatById(twice, "fish")).toEqual({ id: "fish", available: true, respawnIn: 0 });
    expect(twice.cats.sister.pos).toEqual(OPEN_EAST);
  });
});
