import type { GameState, Inputs, Settings, WorldDef } from "./types";

/** Everything a rule needs besides the state it transforms. */
export interface StepContext {
  readonly world: WorldDef;
  readonly settings: Settings;
  /** Seconds simulated by this step, already clamped to the time left in the round. */
  readonly dt: number;
  /** Inputs after stun and flee have overridden what the players asked for. */
  readonly inputs: Inputs;
}

/** One game rule: takes the state part-way through a step and returns the next. */
export type Rule = (state: GameState, ctx: StepContext) => GameState;
