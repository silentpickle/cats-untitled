import { SendRate } from "../net";
import type { Match, RivalInput } from "../play/localMatch";
import { IDLE_INPUT } from "../sim";
import type { CatInput, GameEvent, GameState } from "../sim/types";
import type { CatsHost } from "./protocol";

/**
 * The other cat's input on the host: whatever the guest last sent. Before the first input it stands
 * still; once the guest has left, `fallback` (the computer) takes over so the round can finish.
 */
export function remoteRival(link: CatsHost, fallback: RivalInput): RivalInput {
  return (state) => {
    const input = link.latestInput();
    if (input !== null) {
      return input;
    }
    return link.state === "left" ? fallback(state) : IDLE_INPUT;
  };
}

/**
 * Runs the round like a solo match and sends snapshots to the guest at a steady rate. A snapshot carries
 * every event since the last one, so the guest hears every capture and swat even though it sees fewer
 * frames than the host.
 */
export class HostMatch implements Match {
  private pending: GameEvent[] = [];
  private readonly rate: SendRate;

  constructor(
    private readonly local: Match,
    private readonly link: CatsHost,
    snapshotsPerSecond: number,
  ) {
    this.rate = new SendRate(snapshotsPerSecond);
  }

  get state(): GameState {
    return this.local.state;
  }

  advance(dt: number, mine: () => CatInput): readonly GameEvent[] {
    const events = this.local.advance(dt, mine);
    this.pending.push(...events);
    if (this.rate.due(dt)) {
      this.link.sendState({ ...this.local.state, events: this.pending });
      this.pending = [];
    }
    return events;
  }
}
