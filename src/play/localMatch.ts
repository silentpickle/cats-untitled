import { aiInput, createGame, step, type NavGrid } from "../sim";
import type {
  CatId,
  CatInput,
  GameEvent,
  GameState,
  Inputs,
  Settings,
  WorldDef,
} from "../sim/types";

const STEPS_PER_SECOND = 60;
export const SIM_STEP = 1 / STEPS_PER_SECOND;

/**
 * One round being played, whoever runs it. `advance` is called once per drawn frame with the frame's
 * length and a way to read this player's input; it returns the events that happened.
 */
export interface Match {
  readonly state: GameState;
  advance(dt: number, mine: () => CatInput): readonly GameEvent[];
}

/** Where the other cat's input comes from: the computer, or a friend over the network. */
export type RivalInput = (state: GameState) => CatInput;

export function otherCat(cat: CatId): CatId {
  return cat === "brother" ? "sister" : "brother";
}

/** The computer plays the other cat. */
export function computerRival(
  world: WorldDef,
  settings: Settings,
  navs: Readonly<Record<CatId, NavGrid>>,
  rival: CatId,
): RivalInput {
  return (state) => aiInput(state, rival, world, settings, navs[rival]);
}

/** Runs the rules in this page at a fixed 60 steps a second, carrying spare frame time over. */
export class LocalMatch implements Match {
  private current: GameState;
  private leftover = 0;

  constructor(
    private readonly world: WorldDef,
    private readonly settings: Settings,
    private readonly player: CatId,
    private readonly rival: RivalInput,
  ) {
    this.current = createGame(world, settings);
  }

  get state(): GameState {
    return this.current;
  }

  advance(dt: number, mine: () => CatInput): readonly GameEvent[] {
    const events: GameEvent[] = [];
    this.leftover += dt;
    while (this.leftover >= SIM_STEP) {
      this.leftover -= SIM_STEP;
      events.push(...this.stepOnce(mine()));
    }
    return events;
  }

  /** Play-testing aid: runs the rules ahead with a fixed input instead of waiting for real time. */
  fastForward(seconds: number, input: CatInput): readonly GameEvent[] {
    const events: GameEvent[] = [];
    const steps = Math.round(seconds / SIM_STEP);
    for (let i = 0; i < steps; i += 1) {
      events.push(...this.stepOnce(input));
    }
    return events;
  }

  private stepOnce(mine: CatInput): readonly GameEvent[] {
    const theirs = this.rival(this.current);
    const inputs: Inputs =
      this.player === "brother"
        ? { brother: mine, sister: theirs }
        : { brother: theirs, sister: mine };
    this.current = step(this.current, inputs, SIM_STEP, this.world, this.settings);
    return this.current.events;
  }
}
