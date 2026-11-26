import type {
  CatId,
  CatInput,
  CatState,
  GameState,
  Inputs,
  Settings,
  Vec2,
  WorldDef,
} from "./types";
import type { StepContext } from "./context";
import { finiteVec, headingVector, length, normalize, sub } from "./geometry";
import { IDLE_INPUT, countDown, mapCats, otherCat } from "./stateOps";
import { chaseDirection } from "./bird";

/** Direction straight away from the other cat; along the cat's facing if they are on top of each other. */
function fleeDirection(cat: CatState, other: CatState): Vec2 {
  const away = sub(cat.pos, other.pos);
  return length(away) > 0 ? normalize(away) : headingVector(cat.facing);
}

/** The world and settings, for steering a chase round furniture. */
interface Surroundings {
  readonly world: WorldDef;
  readonly settings: Settings;
}

function effectiveInput(
  state: GameState,
  id: CatId,
  input: CatInput,
  around: Surroundings,
): CatInput {
  const cat = state.cats[id];
  if (cat.stunnedFor > 0) return IDLE_INPUT;
  if (cat.fleeFor > 0) {
    return { ...IDLE_INPUT, move: fleeDirection(cat, state.cats[otherCat(id)]) };
  }
  if (cat.chasing) {
    return { ...IDLE_INPUT, move: chaseDirection(state, around.world, around.settings) };
  }
  return {
    move: finiteVec(input.move),
    swat: id === "brother" && input.swat,
    stealth: id === "sister" && input.stealth,
  };
}

/** What each cat actually does this step: stun freezes it, flee and chasing a bird override its direction. */
export function effectiveInputs(state: GameState, inputs: Inputs, around: Surroundings): Inputs {
  return {
    brother: effectiveInput(state, "brother", inputs.brother, around),
    sister: effectiveInput(state, "sister", inputs.sister, around),
  };
}

/** Stun counts down first; flee only counts down once the stun is over. */
function tickCat(cat: CatState, dt: number): CatState {
  const ticked: CatState = {
    ...cat,
    swatCooldown: countDown(cat.swatCooldown, dt),
    stealthFor: countDown(cat.stealthFor, dt),
    stealthCooldown: countDown(cat.stealthCooldown, dt),
  };
  if (cat.stunnedFor > 0) return { ...ticked, stunnedFor: countDown(cat.stunnedFor, dt) };
  return { ...ticked, fleeFor: countDown(cat.fleeFor, dt) };
}

/** Rule: stun, flee, swat cooldown and stealth timers count down. */
export function tickTimers(state: GameState, ctx: StepContext): GameState {
  return mapCats(state, (cat) => tickCat(cat, ctx.dt));
}
