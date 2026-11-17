import { describe, expect, it } from "vitest";
import { buildNavGrid } from "../sim";
import {
  GOLDEN_FILE,
  SIM_STEP as SCENARIO_STEP,
  runLoopScenario,
  scenarioWorld,
} from "./loopScenario";
import { LocalMatch, SIM_STEP, computerRival, otherCat } from "./localMatch";

describe("LocalMatch", () => {
  it("reproduces the pinned solo loop for both cats", async () => {
    const { world, settings } = scenarioWorld();
    const navs = {
      brother: buildNavGrid(world, "brother", settings),
      sister: buildNavGrid(world, "sister", settings),
    };
    const record = runLoopScenario(
      (player) =>
        new LocalMatch(
          world,
          settings,
          player,
          computerRival(world, settings, navs, otherCat(player)),
        ),
    );
    await expect(JSON.stringify(record, null, 1)).toMatchFileSnapshot(GOLDEN_FILE);
  });

  it("steps at the same rate as the pinned loop", () => {
    expect(SIM_STEP).toBe(SCENARIO_STEP);
  });
});
