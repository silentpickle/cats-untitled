import type { GameState, Inputs, Settings, WorldDef } from "./types";
import type { Rule, StepContext } from "./context";
import { applyMovement } from "./movement";
import { effectiveInputs, tickTimers } from "./status";
import { scoreHiding, updateHidden } from "./hide";
import { applySwat } from "./swat";
import { applyStealth } from "./stealth";
import { updateCapture, updateNapping } from "./capture";
import { scoreOwnedPoints } from "./scoring";
import { pickUpTreats, tickTreats } from "./treats";
import { tickRound } from "./round";
import { knockThings, resetKnocked } from "./knock";
import { updateMischief } from "./mischief";
import { updateBird } from "./bird";
import { clamp } from "./geometry";

/**
 * The rules, in the order they run each step. Movement comes first so everything after it sees where
 * the cats ended up; timers tick before the swat so a fresh stun or cooldown lasts its full length; the bird
 * moves once Aragorn has, so it sees whether he just stepped in off the patio;
 * mischief runs after every rule whose events it reads; the round clock runs last so the final step
 * still scores.
 */
const RULES: readonly Rule[] = [
  applyMovement,
  tickTimers,
  updateBird,
  updateHidden,
  applyStealth,
  applySwat,
  updateNapping,
  updateCapture,
  scoreOwnedPoints,
  scoreHiding,
  tickTreats,
  pickUpTreats,
  resetKnocked,
  knockThings,
  updateMischief,
  tickRound,
];

/** Negative or non-finite dt counts as no time; dt never runs past the end of the round. */
function usableDt(dt: number, timeLeft: number): number {
  return Number.isFinite(dt) ? clamp(dt, 0, timeLeft) : 0;
}

/** Advances the game by `dt` seconds. Pure: returns a new state and never mutates its arguments. */
export function step(
  state: GameState,
  inputs: Inputs,
  dt: number,
  world: WorldDef,
  settings: Settings,
): GameState {
  const fresh: GameState = { ...state, events: [] };
  if (state.phase === "finished") return fresh;
  const ctx: StepContext = {
    world,
    settings,
    dt: usableDt(dt, state.timeLeft),
    inputs: effectiveInputs(state, inputs, { world, settings }),
  };
  return RULES.reduce((s, rule) => rule(s, ctx), fresh);
}
