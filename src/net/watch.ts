import type { ConnectionFacts, NetworkCheck } from "./diagnostics";
import type { NetRoom, NetTrouble } from "./room";

const MS_PER_SECOND = 1000;

export interface WatchOptions {
  /** When "still looking" advice starts. */
  readonly slowAfterSeconds: number;
  /** Milliseconds; injectable for tests. */
  readonly now?: () => number;
}

/**
 * Collects what is known about one room's connection attempt: relay reachability, problems the transport
 * reported, how long it has been, and the network check if one ran. Feed `facts()` to `advise` or
 * `formatReport`.
 */
export class ConnectionWatch {
  private trouble: NetTrouble | null = null;
  private network: NetworkCheck | null = null;
  private listener: () => void = () => undefined;
  private readonly now: () => number;
  private readonly startedAt: number;

  constructor(
    private readonly room: NetRoom,
    private readonly options: WatchOptions,
  ) {
    this.now = options.now ?? (() => performance.now());
    this.startedAt = this.now();
    room.onTrouble((trouble) => {
      this.trouble = trouble;
      this.listener();
    });
  }

  /** Called when the transport reports trouble or a network check finishes. */
  onChange(listener: () => void): void {
    this.listener = listener;
  }

  noteNetwork(check: NetworkCheck): void {
    this.network = check;
    this.listener();
  }

  facts(): ConnectionFacts {
    return {
      relays: this.room.relays(),
      network: this.network,
      trouble: this.trouble,
      waitingSeconds: (this.now() - this.startedAt) / MS_PER_SECOND,
      slowAfterSeconds: this.options.slowAfterSeconds,
    };
  }
}
