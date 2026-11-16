import type { CatId, GameState } from "./types";
import type { StepContext } from "./context";
import { countDown, withEvents } from "./stateOps";

export function winnerOf(state: GameState): CatId | "tie" {
  const { brother, sister } = state.cats;
  if (brother.score === sister.score) return "tie";
  return brother.score > sister.score ? "brother" : "sister";
}

/** Rule: the round clock runs down; at zero the round is over. Runs last, after all scoring. */
export function tickRound(state: GameState, ctx: StepContext): GameState {
  const timeLeft = countDown(state.timeLeft, ctx.dt);
  if (timeLeft > 0) return { ...state, timeLeft };
  const finished: GameState = { ...state, timeLeft, phase: "finished" };
  return withEvents(finished, [{ kind: "round_over", winner: winnerOf(state) }]);
}
