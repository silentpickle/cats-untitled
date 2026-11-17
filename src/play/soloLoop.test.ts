/**
 * Pins the solo game loop as it was written in src/main.ts (`advance` and `stepOnce` of `Game`) before
 * it was moved out. `referenceLoop` is a verbatim copy of that logic; the golden file is its output.
 * Anything that replaces the loop must reproduce the same golden file (see localMatch.test.ts).
 */
import { describe, expect, it } from "vitest";
import { aiInput, buildNavGrid, createGame, step } from "../sim";
import type { CatId, CatInput, GameEvent, GameState, Inputs } from "../sim";
import {
  GOLDEN_FILE,
  SIM_STEP,
  runLoopScenario,
  scenarioWorld,
  type LoopUnderTest,
} from "./loopScenario";

function otherCat(cat: CatId): CatId {
  return cat === "brother" ? "sister" : "brother";
}

function referenceLoop(player: CatId): LoopUnderTest {
  const { world, settings } = scenarioWorld();
  const navs = {
    brother: buildNavGrid(world, "brother", settings),
    sister: buildNavGrid(world, "sister", settings),
  };
  let state: GameState = createGame(world, settings);
  let leftover = 0;
  const stepOnce = (mine: CatInput, events: GameEvent[]): void => {
    const rival = otherCat(player);
    const ai = aiInput(state, rival, world, settings, navs[rival]);
    const inputs: Inputs =
      player === "brother" ? { brother: mine, sister: ai } : { brother: ai, sister: mine };
    state = step(state, inputs, SIM_STEP, world, settings);
    events.push(...state.events);
  };
  return {
    advance: (dt, mine) => {
      const events: GameEvent[] = [];
      leftover += dt;
      while (leftover >= SIM_STEP) {
        leftover -= SIM_STEP;
        stepOnce(mine(), events);
      }
      return events;
    },
    get state() {
      return state;
    },
  };
}

describe("solo game loop", () => {
  it("matches the golden record for both cats", async () => {
    await expect(JSON.stringify(runLoopScenario(referenceLoop), null, 1)).toMatchFileSnapshot(
      GOLDEN_FILE,
    );
  });
});
