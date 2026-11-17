import { describe, expect, it } from "vitest";
import { loadSettings } from "./config";
import { MAIN_FLOOR } from "./house/mainFloor";
import { toWorld } from "./house/toWorld";
import { aiInput, buildNavGrid, createGame, step } from "./sim";
import type { GameState, WorldDef } from "./sim/types";

const STEPS_PER_SECOND = 60;
const DT = 1 / STEPS_PER_SECOND;
/** Metres each spawn is shifted between rounds, so the result is not one lucky opening. */
const SPAWN_NUDGE = 0.5;
/** Shifts of [brother x, brother z, sister x, sister z], in nudges. */
/** Two nudges: the furthest an opening is shifted. */
const FAR = 2;
const OPENINGS: readonly (readonly number[])[] = [
  [0, 0, 0, 0],
  [1, 0, -1, 0],
  [-1, 1, 1, -1],
  [0, 1, 0, -1],
  [FAR, -1, -1, 1],
  [-1, -1, 1, 1],
];
/** Over all the openings, the weaker cat's total must reach this share of the stronger cat's. */
const FAIR_TOTAL_SHARE = 0.85;
/** In any single round, the weaker cat must reach this share of the stronger cat's score. */
const FAIR_ROUND_SHARE = 0.6;

function shifted(world: WorldDef, nudges: readonly number[]): WorldDef {
  const [bx = 0, bz = 0, sx = 0, sz = 0] = nudges.map((n) => n * SPAWN_NUDGE);
  const { brother, sister } = world.spawn;
  return {
    ...world,
    spawn: {
      brother: { x: brother.x + bx, z: brother.z + bz },
      sister: { x: sister.x + sx, z: sister.z + sz },
    },
  };
}

function playRound(world: WorldDef): GameState {
  const settings = loadSettings().sim;
  const navs = {
    brother: buildNavGrid(world, "brother", settings),
    sister: buildNavGrid(world, "sister", settings),
  };
  let state = createGame(world, settings);
  while (state.phase === "playing") {
    const inputs = {
      brother: aiInput(state, "brother", world, settings, navs.brother),
      sister: aiInput(state, "sister", world, settings, navs.sister),
    };
    state = step(state, inputs, DT, world, settings);
  }
  return state;
}

function share(a: number, b: number): number {
  return Math.min(a, b) / Math.max(a, b);
}

describe("computer cats on the main floor", () => {
  const rounds = OPENINGS.map((nudges) => playRound(shifted(toWorld(MAIN_FLOOR), nudges)));
  const brother = rounds.map((r) => r.cats.brother.score);
  const sister = rounds.map((r) => r.cats.sister.score);
  const sum = (scores: readonly number[]) => scores.reduce((a, b) => a + b, 0);

  it("both_cats_score", () => {
    expect(Math.min(...brother, ...sister)).toBeGreaterThan(0);
  });

  it("totals_are_close", () => {
    expect(share(sum(brother), sum(sister))).toBeGreaterThan(FAIR_TOTAL_SHARE);
  });

  it("no_round_runs_away", () => {
    rounds.forEach((_, i) => {
      expect(share(brother[i] ?? 0, sister[i] ?? 0)).toBeGreaterThan(FAIR_ROUND_SHARE);
    });
  });
});
