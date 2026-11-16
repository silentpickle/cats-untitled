import { describe, expect, it } from "vitest";
import { loadSettings } from "./config";
import { MAIN_FLOOR } from "./house/mainFloor";
import { toWorld } from "./house/toWorld";
import { aiInput, buildNavGrid, createGame, step } from "./sim";
import type { GameState } from "./sim/types";

const STEPS_PER_SECOND = 60;
const DT = 1 / STEPS_PER_SECOND;
/**
 * Neither computer cat should be shut out on the real house. The round is deterministic but
 * sensitive to settings, so this is a loose guard against one cat running away with it.
 */
const FAIR_SHARE = 0.25;

function playRound(): GameState {
  const settings = loadSettings().sim;
  const world = toWorld(MAIN_FLOOR);
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

describe("computer cats on the main floor", () => {
  const final = playRound();
  const brother = final.cats.brother.score;
  const sister = final.cats.sister.score;

  it("both_cats_score", () => {
    expect(brother).toBeGreaterThan(0);
    expect(sister).toBeGreaterThan(0);
  });

  it("neither_cat_dominates", () => {
    expect(Math.min(brother, sister) / Math.max(brother, sister)).toBeGreaterThan(FAIR_SHARE);
  });
});
