import { describe, expect, it } from "vitest";
import type { GameState } from "./types";
import { HALF } from "./geometry";
import {
  IDLE,
  TEST_SETTINGS,
  TEST_WORLD,
  inputs,
  newGame,
  quietGame,
  stepTest,
  withCat,
  withPoint,
} from "./testFixtures";
import { createGame } from "./create";

const DT = 0.1;
const PRECISION_DIGITS = 9;
const LAST_SLICE = DT * HALF;
const HIGH_SCORE = 3;
const LOW_SCORE = 1;
const EAST = { x: 1, z: 0 };

function lastStep(brotherScore: number, sisterScore: number): GameState {
  const scored = withCat(withCat(quietGame(), "brother", { score: brotherScore }), "sister", {
    score: sisterScore,
  });
  return { ...scored, timeLeft: LAST_SLICE };
}

describe("round", () => {
  it("create_game_starts_fresh", () => {
    const game = createGame(TEST_WORLD, TEST_SETTINGS);
    expect(game.phase).toBe("playing");
    expect(game.timeLeft).toBe(TEST_SETTINGS.round.durationSeconds);
    expect(game.events).toEqual([]);
    expect(game.cats.brother.pos).toEqual(TEST_WORLD.spawn.brother);
    expect(game.cats.sister.pos).toEqual(TEST_WORLD.spawn.sister);
    expect(game.cats.sister).toMatchObject({ score: 0, stunnedFor: 0, fleeFor: 0, hidden: false });
    expect(game.points.every((p) => p.owner === null && p.progress === 0)).toBe(true);
    expect(game.points.map((p) => p.id)).toEqual(TEST_WORLD.napPoints.map((p) => p.id));
    expect(game.treats.every((t) => t.available)).toBe(true);
  });

  it("timer_counts_down", () => {
    const next = stepTest(newGame(), IDLE, DT);
    expect(next.timeLeft).toBeCloseTo(TEST_SETTINGS.round.durationSeconds - DT, PRECISION_DIGITS);
    expect(next.phase).toBe("playing");
  });

  it("round_over_names_brother_winner", () => {
    const next = stepTest(lastStep(HIGH_SCORE, LOW_SCORE), IDLE, DT);
    expect(next.phase).toBe("finished");
    expect(next.timeLeft).toBe(0);
    expect(next.events).toEqual([{ kind: "round_over", winner: "brother" }]);
  });

  it("round_over_names_sister_winner", () => {
    const next = stepTest(lastStep(LOW_SCORE, HIGH_SCORE), IDLE, DT);
    expect(next.events).toEqual([{ kind: "round_over", winner: "sister" }]);
  });

  it("round_over_equal_scores_tie", () => {
    const next = stepTest(lastStep(LOW_SCORE, LOW_SCORE), IDLE, DT);
    expect(next.events).toEqual([{ kind: "round_over", winner: "tie" }]);
  });

  it("final_step_scores_only_time_left", () => {
    const owned = withPoint(lastStep(0, 0), "sun", { owner: "brother" });
    const next = stepTest(owned, IDLE, DT);
    expect(next.cats.brother.score).toBeCloseTo(
      LAST_SLICE * TEST_SETTINGS.capture.pointsPerSecond,
      PRECISION_DIGITS,
    );
    expect(next.events).toEqual([{ kind: "round_over", winner: "brother" }]);
  });

  it("finished_state_does_not_score_or_move", () => {
    const owned = withPoint(lastStep(0, 0), "sun", { owner: "brother" });
    const finished = stepTest(owned, IDLE, DT);
    const after = stepTest(finished, inputs({ brother: { move: EAST } }), DT);
    expect(after).toEqual({ ...finished, events: [] });
  });

  it("step_does_not_mutate_input", () => {
    const start = withPoint(quietGame(), "sun", { owner: "sister" });
    const snapshot = structuredClone(start);
    stepTest(start, inputs({ brother: { move: EAST, swat: true } }), DT);
    expect(start).toEqual(snapshot);
  });

  it("events_only_from_this_step", () => {
    const swatted = stepTest(quietGame(), inputs({ brother: { swat: true } }), DT);
    expect(swatted.events).toHaveLength(1);
    const next = stepTest(swatted, IDLE, DT);
    expect(next.events).toEqual([]);
  });

  it("negative_dt_changes_nothing", () => {
    const start = quietGame();
    const next = stepTest(start, inputs({ brother: { move: EAST } }), -DT);
    expect(next).toEqual(start);
  });
});
