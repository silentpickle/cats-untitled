import { SendRate } from "../net";
import type { Match } from "../play/localMatch";
import type { CatInput, GameEvent, GameState } from "../sim/types";
import type { CatsGuest } from "./protocol";

/**
 * The guest's side of a round: it never runs the rules. It shows the host's latest snapshot, plays the
 * events that came with it, and sends its own input at a steady rate.
 */
export class GuestMatch implements Match {
  private current: GameState;
  private pending: GameEvent[] = [];
  private readonly rate: SendRate;

  constructor(
    private readonly link: CatsGuest,
    initial: GameState,
    inputsPerSecond: number,
  ) {
    this.current = initial;
    this.rate = new SendRate(inputsPerSecond);
    link.onSnapshot((state) => {
      this.current = state;
      this.pending.push(...state.events);
    });
  }

  get state(): GameState {
    return this.current;
  }

  /**
   * Input is only read when it is about to be sent, so a quick tap of the ability button is held until
   * the next send instead of being read and dropped on a frame in between.
   */
  advance(dt: number, mine: () => CatInput): readonly GameEvent[] {
    if (this.rate.due(dt)) {
      this.link.sendInput(mine());
    }
    const events = this.pending;
    this.pending = [];
    return events;
  }
}
