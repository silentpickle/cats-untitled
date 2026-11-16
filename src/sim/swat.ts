import type { CatState, GameState, Settings } from "./types";
import type { StepContext } from "./context";
import { distance } from "./geometry";
import { withCat, withEvents } from "./stateOps";

function canHit(brother: CatState, sister: CatState, settings: Settings): boolean {
  const visible = !sister.hidden && sister.stealthFor === 0;
  return visible && distance(brother.pos, sister.pos) <= settings.swat.range;
}

function stun(cat: CatState, settings: Settings): CatState {
  return { ...cat, stunnedFor: settings.swat.stunSeconds, fleeFor: settings.swat.fleeSeconds };
}

/**
 * Rule: the brother swats when asked and his cooldown is ready, whichever way he faces. A visible
 * sister in range is stunned and then flees, and he waits the full cooldown; otherwise the swat
 * misses and he only waits the short miss cooldown.
 * The effective input is already false while he is stunned and for the sister.
 */
export function applySwat(state: GameState, ctx: StepContext): GameState {
  const { brother, sister } = state.cats;
  if (!ctx.inputs.brother.swat || brother.swatCooldown > 0) return state;
  const { cooldownSeconds, missCooldownSeconds } = ctx.settings.swat;
  if (!canHit(brother, sister, ctx.settings)) {
    const missed = withCat(state, { ...brother, swatCooldown: missCooldownSeconds });
    return withEvents(missed, [{ kind: "swat_missed", by: "brother" }]);
  }
  const armed = withCat(state, { ...brother, swatCooldown: cooldownSeconds });
  const hit = withCat(armed, stun(sister, ctx.settings));
  return withEvents(hit, [{ kind: "swatted", by: "brother", target: "sister" }]);
}
