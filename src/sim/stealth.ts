import type { GameState } from "./types";
import type { StepContext } from "./context";
import { withCat, withEvents } from "./stateOps";

/**
 * Rule: the sister slips out of sight when asked and her cooldown is ready. The cooldown starts the
 * moment she vanishes. The effective input is already false while she is stunned or fleeing, and
 * for the brother.
 */
export function applyStealth(state: GameState, ctx: StepContext): GameState {
  const { sister } = state.cats;
  if (!ctx.inputs.sister.stealth || sister.stealthCooldown > 0) return state;
  const { seconds, cooldownSeconds } = ctx.settings.stealth;
  const unseen = withCat(state, {
    ...sister,
    stealthFor: seconds,
    stealthCooldown: cooldownSeconds,
  });
  return withEvents(unseen, [{ kind: "stealth", by: "sister" }]);
}
