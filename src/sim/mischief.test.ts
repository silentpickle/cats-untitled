import { describe, expect, it } from "vitest";
import type { CatId, GameState, MischiefDef, Vec2, WorldDef } from "./types";
import { createGame } from "./create";
import { step } from "./step";
import {
  FISH,
  IDLE,
  OPEN_EAST,
  OPEN_WEST,
  SUN,
  TEST_SETTINGS,
  TEST_WORLD,
  inputs,
  withCat,
  withPoint,
} from "./testFixtures";

const DT = 0.1;
const CUP: Vec2 = { x: 9, z: 6 };
const KNOCK_RADIUS = TEST_SETTINGS.mischief.knockRadius;
const KNOCK_POINTS = TEST_SETTINGS.mischief.knockPoints;
const BONUS = TEST_SETTINGS.mischief.points;
const RESET_SECONDS = TEST_SETTINGS.mischief.resetSeconds;
const JUST_OUTSIDE = 0.01;
const NEARER = 0.1;
const FARTHER = 0.3;
// The fixture radius (0.5) and the cup position are exact in binary, so the edge case lands on the limit.
const TEASE_SECONDS = 1;
const OWN_TARGET = 2;
const ALMOST_CAPTURED = 0.99;
const UNDER_COUCH: Vec2 = { x: 2, z: 7.5 };
const BESIDE_COUCH: Vec2 = { x: 2, z: 6 };
const STUNNED = 1;
/** A step length that binary floats hold exactly, for tests that land on a limit. */
const EXACT_DT = 0.5;

const LIST: readonly MischiefDef[] = [
  { id: "bro_knock", label: "", cat: "brother", goal: { kind: "knock", knockableId: "cup" } },
  { id: "sis_knock", label: "", cat: "sister", goal: { kind: "knock", knockableId: "cup" } },
  { id: "sis_claim", label: "", cat: "sister", goal: { kind: "claim", pointId: "sun" } },
  { id: "bro_own", label: "", cat: "brother", goal: { kind: "own_count", count: OWN_TARGET } },
  { id: "bro_swat", label: "", cat: "brother", goal: { kind: "swat" } },
  { id: "sis_tease", label: "", cat: "sister", goal: { kind: "tease", seconds: TEASE_SECONDS } },
  { id: "sis_treat", label: "", cat: "sister", goal: { kind: "treat", treatId: "fish" } },
];

const WORLD: WorldDef = {
  ...TEST_WORLD,
  knockables: [{ id: "cup", name: "cup", pos: CUP }],
  mischief: LIST,
};

function quiet(): GameState {
  const fresh = createGame(WORLD, TEST_SETTINGS);
  return withCat(withCat(fresh, "brother", { pos: OPEN_WEST }), "sister", { pos: OPEN_EAST });
}

function tick(state: GameState, input = IDLE, dt = DT): GameState {
  return step(state, input, dt, WORLD, TEST_SETTINGS);
}

function nearCup(distance: number): Vec2 {
  return { x: CUP.x + distance, z: CUP.z };
}

function done(state: GameState, id: string): boolean {
  return state.mischief.find((item) => item.id === id)?.done === true;
}

function doneIds(state: GameState): string[] {
  return state.mischief.filter((item) => item.done).map((item) => item.id);
}

function score(state: GameState, cat: CatId): number {
  return state.cats[cat].score;
}

describe("knocking things over", () => {
  it("cat_at_exact_knock_radius_knocks_and_scores", () => {
    const next = tick(withCat(quiet(), "sister", { pos: nearCup(KNOCK_RADIUS) }));
    expect(next.knockables).toEqual([{ id: "cup", knockedBy: "sister", resetIn: RESET_SECONDS }]);
    expect(next.events).toContainEqual({ kind: "knocked", knockableId: "cup", by: "sister" });
    expect(score(next, "sister")).toBe(KNOCK_POINTS + BONUS);
  });

  it("cat_just_outside_knock_radius_does_nothing", () => {
    const next = tick(withCat(quiet(), "sister", { pos: nearCup(KNOCK_RADIUS + JUST_OUTSIDE) }));
    expect(next.knockables).toEqual([{ id: "cup", knockedBy: null, resetIn: 0 }]);
    expect(next.events).toEqual([]);
  });

  it("stunned_cat_cannot_knock", () => {
    const stunned = withCat(quiet(), "sister", { pos: nearCup(NEARER), stunnedFor: STUNNED });
    expect(tick(stunned).knockables[0]?.knockedBy).toBeNull();
  });

  it("nearer_cat_gets_the_knock", () => {
    const both = withCat(withCat(quiet(), "brother", { pos: nearCup(FARTHER) }), "sister", {
      pos: nearCup(NEARER),
    });
    expect(tick(both).knockables[0]?.knockedBy).toBe("sister");
  });

  it("knocked_thing_is_not_knocked_again_until_put_back", () => {
    const knocked = tick(withCat(quiet(), "sister", { pos: nearCup(NEARER) }));
    const again = tick(knocked);
    expect(again.events).toEqual([]);
    expect(score(again, "sister")).toBe(score(knocked, "sister"));
  });

  it("knocked_thing_is_put_back_after_reset_seconds", () => {
    const knocked = tick(withCat(quiet(), "sister", { pos: nearCup(NEARER) }));
    const away = withCat(knocked, "sister", { pos: OPEN_EAST });
    const almost = tick(away, IDLE, RESET_SECONDS - EXACT_DT);
    expect(almost.knockables[0]?.knockedBy).toBe("sister");
    const back = tick(almost, IDLE, EXACT_DT);
    expect(back.knockables).toEqual([{ id: "cup", knockedBy: null, resetIn: 0 }]);
  });
});

describe("mischief list", () => {
  it("knock_goal_ticks_only_for_the_cat_that_knocked", () => {
    const next = tick(withCat(quiet(), "brother", { pos: nearCup(NEARER) }));
    expect(doneIds(next)).toEqual(["bro_knock"]);
    expect(next.events).toContainEqual({
      kind: "mischief",
      mischiefId: "bro_knock",
      by: "brother",
    });
    expect(score(next, "brother")).toBe(KNOCK_POINTS + BONUS);
  });

  it("finished_item_stays_done_and_pays_once", () => {
    const first = tick(withCat(quiet(), "brother", { pos: nearCup(NEARER) }));
    const later = tick(withCat(first, "brother", { pos: OPEN_WEST }));
    expect(done(later, "bro_knock")).toBe(true);
    expect(later.events).toEqual([]);
    expect(score(later, "brother")).toBe(score(first, "brother"));
  });

  it("claim_goal_ticks_when_that_cat_captures_the_point", () => {
    const filling = withPoint(withCat(quiet(), "sister", { pos: SUN }), "sun", {
      capturer: "sister",
      progress: ALMOST_CAPTURED,
    });
    const next = tick(filling);
    expect(next.events).toContainEqual({ kind: "captured", pointId: "sun", by: "sister" });
    expect(doneIds(next)).toEqual(["sis_claim"]);
  });

  it("own_count_goal_needs_the_full_count", () => {
    const one = withPoint(quiet(), "rug", { owner: "brother" });
    expect(done(tick(one), "bro_own")).toBe(false);
    const two = withPoint(one, "lap", { owner: "brother" });
    expect(done(tick(two), "bro_own")).toBe(true);
  });

  it("swat_goal_ticks_on_a_landed_swat_only", () => {
    const apart = tick(quiet(), inputs({ brother: { swat: true } }));
    expect(apart.events).toContainEqual({ kind: "swat_missed", by: "brother" });
    expect(done(apart, "bro_swat")).toBe(false);
    const together = withCat(quiet(), "sister", { pos: OPEN_WEST });
    expect(done(tick(together, inputs({ brother: { swat: true } })), "bro_swat")).toBe(true);
  });

  it("tease_goal_fills_only_while_hidden_near_the_brother", () => {
    const hiding = withCat(withCat(quiet(), "brother", { pos: BESIDE_COUCH }), "sister", {
      pos: UNDER_COUCH,
    });
    const almost = tick(hiding, IDLE, TEASE_SECONDS - DT);
    expect(done(almost, "sis_tease")).toBe(false);
    const farAway = tick(withCat(almost, "brother", { pos: OPEN_EAST }), IDLE, TEASE_SECONDS);
    expect(done(farAway, "sis_tease")).toBe(false);
    expect(done(tick(almost, IDLE, DT + DT), "sis_tease")).toBe(true);
  });

  it("treat_goal_ticks_for_the_named_treat", () => {
    const next = tick(withCat(quiet(), "sister", { pos: FISH }));
    expect(next.events).toContainEqual({ kind: "treat", treatId: "fish", by: "sister" });
    expect(done(next, "sis_treat")).toBe(true);
  });
});
