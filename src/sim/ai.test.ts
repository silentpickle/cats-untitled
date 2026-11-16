import { describe, expect, it } from "vitest";
import type { CatId, GameEvent, GameState, Vec2 } from "./types";
import { CAT_IDS } from "./types";
import { aiInput } from "./ai";
import { buildNavGrid } from "./nav";
import { blockersFor, overlapsAny } from "./movement";
import { HALF, directionTo, dot, length, rectCenter } from "./geometry";
import {
  BOUNDS,
  COUCH,
  OPEN_WEST,
  SUN,
  TEST_SETTINGS,
  TEST_WORLD,
  newGame,
  quietGame,
  stepTest,
  withCat,
} from "./testFixtures";

const NAV = {
  brother: buildNavGrid(TEST_WORLD, "brother", TEST_SETTINGS),
  sister: buildNavGrid(TEST_WORLD, "sister", TEST_SETTINGS),
};

const SOAK_STEPS_PER_SECOND = 30;
const SOAK_DT = 1 / SOAK_STEPS_PER_SECOND;
const SOAK_MAX_STEPS = Math.ceil(TEST_SETTINGS.round.durationSeconds / SOAK_DT) + 1;
/** Slack for floating-point rounding when checking a cat is inside bounds and clear of obstacles. */
const GEOMETRY_SLACK = 1e-9;

const IN_SWAT_REACH: Vec2 = { x: OPEN_WEST.x + TEST_SETTINGS.swat.range * HALF, z: OPEN_WEST.z };
/** Just south of the couch, with the brother coming straight at her from further south. */
const BELOW_COUCH: Vec2 = { x: 2, z: 6.2 };
const BROTHER_APPROACH: Vec2 = { x: 2, z: 5.5 };
const UNDER_COUCH: Vec2 = { x: 2, z: 7.5 };
const FACING_NORTH = 0;

function think(state: GameState, cat: CatId) {
  return aiInput(state, cat, TEST_WORLD, TEST_SETTINGS, NAV[cat]);
}

/** Brother walking north at the couch with his swat ready, sister somewhere near it. */
function chasedTo(sisterPos: Vec2): GameState {
  const brother = withCat(quietGame(), "brother", {
    pos: BROTHER_APPROACH,
    facing: FACING_NORTH,
    moving: true,
  });
  return withCat(brother, "sister", { pos: sisterPos, hidden: sisterPos === UNDER_COUCH });
}

function catIsSound(state: GameState, id: CatId): boolean {
  const { pos } = state.cats[id];
  const radius = TEST_SETTINGS.cats[id].radius - GEOMETRY_SLACK;
  const finite = Number.isFinite(pos.x) && Number.isFinite(pos.z);
  const inBounds =
    pos.x - radius >= BOUNDS.minX &&
    pos.x + radius <= BOUNDS.maxX &&
    pos.z - radius >= BOUNDS.minZ &&
    pos.z + radius <= BOUNDS.maxZ;
  return finite && inBounds && !overlapsAny(pos, radius, blockersFor(TEST_WORLD, id));
}

function playRound(): { readonly state: GameState; readonly events: GameEvent[]; unsound: number } {
  let state = newGame();
  const events: GameEvent[] = [];
  let unsound = 0;
  for (let i = 0; i < SOAK_MAX_STEPS && state.phase === "playing"; i++) {
    const inputs = { brother: think(state, "brother"), sister: think(state, "sister") };
    state = stepTest(state, inputs, SOAK_DT);
    events.push(...state.events);
    unsound += CAT_IDS.filter((id) => !catIsSound(state, id)).length;
  }
  return { state, events, unsound };
}

function capturesBy(events: readonly GameEvent[], cat: CatId): number {
  return events.filter((e) => e.kind === "captured" && e.by === cat).length;
}

describe("ai", () => {
  it("napping_ai_holds_still", () => {
    const onSun = withCat(quietGame(), "sister", { pos: SUN });
    expect(think(onSun, "sister").move).toEqual({ x: 0, z: 0 });
    const brotherOnSun = withCat(quietGame(), "brother", { pos: SUN });
    expect(think(brotherOnSun, "brother").move).toEqual({ x: 0, z: 0 });
  });

  it("brother_swats_visible_sister_in_reach", () => {
    const close = withCat(quietGame(), "sister", { pos: IN_SWAT_REACH });
    expect(think(close, "brother").swat).toBe(true);
  });

  it("brother_holds_swat_when_not_ready_or_hidden", () => {
    const close = withCat(quietGame(), "sister", { pos: IN_SWAT_REACH });
    const cooling = withCat(close, "brother", { swatCooldown: 1 });
    expect(think(cooling, "brother").swat).toBe(false);
    const hidden = withCat(close, "sister", { hidden: true });
    expect(think(hidden, "brother").swat).toBe(false);
  });

  it("sister_runs_for_cover_when_chased", () => {
    const move = think(chasedTo(BELOW_COUCH), "sister").move;
    const towardCover = directionTo(BELOW_COUCH, rectCenter(COUCH));
    expect(dot(move, towardCover)).toBeGreaterThan(0);
  });

  it("sister_waits_hidden_while_chased", () => {
    expect(think(chasedTo(UNDER_COUCH), "sister").move).toEqual({ x: 0, z: 0 });
  });

  it("sister_leaves_cover_when_brother_stops", () => {
    const resting = withCat(chasedTo(UNDER_COUCH), "brother", { moving: false });
    expect(length(think(resting, "sister").move)).toBeGreaterThan(0);
  });

  it("stunned_ai_is_idle", () => {
    const stunned = withCat(quietGame(), "sister", { stunnedFor: 1 });
    expect(think(stunned, "sister")).toEqual({
      move: { x: 0, z: 0 },
      swat: false,
      stealth: false,
    });
  });

  it("ai_soak_full_round", () => {
    const { state, events, unsound } = playRound();
    expect(unsound).toBe(0);
    expect(state.phase).toBe("finished");
    expect(events.filter((e) => e.kind === "round_over")).toHaveLength(1);
    expect(capturesBy(events, "brother")).toBeGreaterThan(0);
    expect(capturesBy(events, "sister")).toBeGreaterThan(0);
  });
});
