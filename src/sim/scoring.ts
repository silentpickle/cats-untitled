import type { CatId, GameState } from "./types";
import type { StepContext } from "./context";
import { addScore, mapCats } from "./stateOps";

function ownedCount(state: GameState, id: CatId): number {
  return state.points.filter((p) => p.owner === id).length;
}

/** Rule: every owned point pays its owner, whether or not the owner is sitting on it. */
export function scoreOwnedPoints(state: GameState, ctx: StepContext): GameState {
  const perPoint = ctx.settings.capture.pointsPerSecond * ctx.dt;
  return mapCats(state, (cat) => addScore(cat, perPoint * ownedCount(state, cat.id)));
}
