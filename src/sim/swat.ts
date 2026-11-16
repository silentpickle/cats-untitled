import type { CatState, GameState, Settings } from "./types";
import type { StepContext } from "./context";
import { distance } from "./geometry";
import { withCat, withEvents } from "./stateOps";

function canHit(brother: CatState, sister: CatState, settings: Settings): boolean {
  return !sister.hidden && distance(brother.pos, sister.pos) <= settings.swat.range;
}

function stun(cat: CatState, settings: Settings): CatState {
  return { ...cat, stunnedFor: settings.swat.stunSeconds, fleeFor: settings.swat.fleeSeconds };
}

/**
 * Rule: the brother swats when asked and his cooldown is ready. A visible sister in range is stunned
 * and then flees; otherwise the swat misses. Either way the cooldown restarts.
 * The effective input is already false while he is stunned and for the sister.
 */
export function applySwat(state: GameState, ctx: StepContext): GameState {
  const { brother, sister } = state.cats;
  if (!ctx.inputs.brother.swat || brother.swatCooldown > 0) return state;
  const armed = withCat(state, { ...brother, swatCooldown: ctx.settings.swat.cooldownSeconds });
  if (!canHit(brother, sister, ctx.settings)) {
    return withEvents(armed, [{ kind: "swat_missed", by: "brother" }]);
  }
  const hit = withCat(armed, stun(sister, ctx.settings));
  return withEvents(hit, [{ kind: "swatted", by: "brother", target: "sister" }]);
}
