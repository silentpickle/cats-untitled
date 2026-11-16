import { describe, expect, it } from "vitest";
import type { GameState, Vec2 } from "./types";
import { HALF } from "./geometry";
import {
  COUCH,
  IDLE,
  OPEN_WEST,
  TEST_SETTINGS,
  inputs,
  quietGame,
  run,
  stepTest,
  withCat,
} from "./testFixtures";

const DT = 0.1;
const PRECISION_DIGITS = 9;
const DOUBLE = 2;
const { swat: SWAT } = TEST_SETTINGS;

/** Half the swat range east of OPEN_WEST: in reach. */
const IN_REACH: Vec2 = { x: OPEN_WEST.x + SWAT.range * HALF, z: OPEN_WEST.z };
/** Twice the swat range east of OPEN_WEST: out of reach. */
const OUT_OF_REACH: Vec2 = { x: OPEN_WEST.x + SWAT.range * DOUBLE, z: OPEN_WEST.z };
/** Inside the couch (a hide spot) and the brother pressed against its front, within swat range. */
const UNDER_COUCH: Vec2 = { x: 2, z: 7.3 };
const COUCH_FRONT: Vec2 = { x: 2, z: COUCH.minZ - TEST_SETTINGS.cats.brother.radius };

const SWAT_INPUT = inputs({ brother: { swat: true } });
const STEPS_TO_COOL_DOWN = Math.ceil(SWAT.cooldownSeconds / DT) + 1;
const SHORT_STUN = DT * HALF;
const SOME_FLEE = 1;
const FLEE_GAP_METRES = 2;
const FLEE_EAST_START: Vec2 = { x: OPEN_WEST.x + FLEE_GAP_METRES, z: OPEN_WEST.z };
const WEST: Vec2 = { x: -1, z: 0 };

function sisterAt(pos: Vec2): GameState {
  return withCat(quietGame(), "sister", { pos });
}

describe("swat", () => {
  it("swat_hits_visible_sister_in_range", () => {
    const next = stepTest(sisterAt(IN_REACH), SWAT_INPUT, DT);
    expect(next.cats.sister.stunnedFor).toBe(SWAT.stunSeconds);
    expect(next.cats.sister.fleeFor).toBe(SWAT.fleeSeconds);
    expect(next.cats.brother.swatCooldown).toBe(SWAT.cooldownSeconds);
    expect(next.events).toEqual([{ kind: "swatted", by: "brother", target: "sister" }]);
  });

  it("swat_misses_out_of_range", () => {
    const next = stepTest(sisterAt(OUT_OF_REACH), SWAT_INPUT, DT);
    expect(next.cats.sister.stunnedFor).toBe(0);
    expect(next.cats.brother.swatCooldown).toBe(SWAT.cooldownSeconds);
    expect(next.events).toEqual([{ kind: "swat_missed", by: "brother" }]);
  });

  it("swat_misses_hidden_sister", () => {
    const start = withCat(sisterAt(UNDER_COUCH), "brother", { pos: COUCH_FRONT });
    const next = stepTest(start, SWAT_INPUT, DT);
    expect(next.cats.sister.hidden).toBe(true);
    expect(next.cats.sister.stunnedFor).toBe(0);
    expect(next.events).toEqual([{ kind: "swat_missed", by: "brother" }]);
  });

  it("cooldown_blocks_second_swat", () => {
    const first = stepTest(sisterAt(OUT_OF_REACH), SWAT_INPUT, DT);
    const second = stepTest(withCat(first, "sister", { pos: IN_REACH }), SWAT_INPUT, DT);
    expect(second.events).toEqual([]);
    expect(second.cats.sister.stunnedFor).toBe(0);
    expect(second.cats.brother.swatCooldown).toBeCloseTo(
      SWAT.cooldownSeconds - DT,
      PRECISION_DIGITS,
    );
  });

  it("swat_ready_again_after_cooldown", () => {
    const first = stepTest(sisterAt(OUT_OF_REACH), SWAT_INPUT, DT);
    const { state: cooled } = run(first, IDLE, DT, STEPS_TO_COOL_DOWN);
    expect(cooled.cats.brother.swatCooldown).toBe(0);
    const again = stepTest(cooled, SWAT_INPUT, DT);
    expect(again.events).toEqual([{ kind: "swat_missed", by: "brother" }]);
  });

  it("sister_swat_input_ignored", () => {
    const start = withCat(sisterAt(IN_REACH), "brother", { pos: OPEN_WEST });
    const next = stepTest(start, inputs({ sister: { swat: true } }), DT);
    expect(next.events).toEqual([]);
    expect(next.cats.brother.stunnedFor).toBe(0);
    expect(next.cats.sister.swatCooldown).toBe(0);
  });

  it("stunned_brother_cannot_swat", () => {
    const start = withCat(sisterAt(IN_REACH), "brother", { stunnedFor: SOME_FLEE });
    const next = stepTest(start, SWAT_INPUT, DT);
    expect(next.events).toEqual([]);
    expect(next.cats.sister.stunnedFor).toBe(0);
  });
});

describe("stun_and_flee", () => {
  it("stunned_cat_ignores_input", () => {
    const start = withCat(sisterAt(OUT_OF_REACH), "sister", { stunnedFor: SOME_FLEE });
    const next = stepTest(start, inputs({ sister: { move: WEST } }), DT);
    expect(next.cats.sister.pos).toEqual(OUT_OF_REACH);
    expect(next.cats.sister.moving).toBe(false);
    expect(next.cats.sister.stunnedFor).toBeCloseTo(SOME_FLEE - DT, PRECISION_DIGITS);
  });

  it("fleeing_cat_runs_away_from_other_cat", () => {
    const start = withCat(sisterAt(FLEE_EAST_START), "sister", { fleeFor: SOME_FLEE });
    const next = stepTest(start, inputs({ sister: { move: WEST } }), DT);
    expect(next.cats.sister.pos.x).toBeCloseTo(
      FLEE_EAST_START.x + TEST_SETTINGS.cats.sister.speed * DT,
      PRECISION_DIGITS,
    );
    expect(next.cats.sister.pos.z).toBeCloseTo(FLEE_EAST_START.z, PRECISION_DIGITS);
  });

  it("flee_waits_for_stun_to_end", () => {
    const start = withCat(sisterAt(OUT_OF_REACH), "sister", {
      stunnedFor: SHORT_STUN,
      fleeFor: SOME_FLEE,
    });
    const afterStun = stepTest(start, IDLE, DT);
    expect(afterStun.cats.sister.stunnedFor).toBe(0);
    expect(afterStun.cats.sister.fleeFor).toBe(SOME_FLEE);
    const fleeing = stepTest(afterStun, IDLE, DT);
    expect(fleeing.cats.sister.fleeFor).toBeCloseTo(SOME_FLEE - DT, PRECISION_DIGITS);
    expect(fleeing.cats.sister.moving).toBe(true);
  });

  it("timers_never_go_below_zero", () => {
    const start = withCat(sisterAt(OUT_OF_REACH), "sister", { fleeFor: SHORT_STUN });
    const withCooldown = withCat(start, "brother", { swatCooldown: SHORT_STUN });
    const next = stepTest(withCooldown, IDLE, DT);
    expect(next.cats.sister.fleeFor).toBe(0);
    expect(next.cats.brother.swatCooldown).toBe(0);
  });
});
