import type { MessageHandler, NetChannel, NetRoom } from "./room";

/**
 * A pretend slow connection, for trying netcode with two tabs on one machine. `withLag` wraps any
 * `NetRoom` and holds each outgoing message for `latencyMs` plus a random share of `jitterMs`. Like a
 * reliable ordered channel, a message never overtakes an earlier one on the same channel: a message whose
 * delay ran out early waits for the one before it, so a slow message releases a bunch behind it, as real
 * connections do. Only outgoing traffic is delayed; when both tabs add lag, a round trip takes twice
 * `latencyMs`.
 *
 * Turn it on from the page address: `?lag=200&jitter=40` (see `lagFromUrl`).
 */

export interface LagOptions {
  /** Delay added to every outgoing message, in milliseconds. */
  readonly latencyMs: number;
  /** Extra random delay of up to this many milliseconds per message. */
  readonly jitterMs: number;
  /** Uniform in [0, 1). Defaults to `Math.random`. */
  readonly random?: () => number;
  /** Runs `task` after `ms` milliseconds. Defaults to `setTimeout`. */
  readonly schedule?: (task: () => void, ms: number) => void;
}

/** The URL query parameter that turns on pretend lag, in milliseconds: `?lag=200`. */
export const LAG_QUERY_PARAM = "lag";
/** The URL query parameter for the jitter on top, in milliseconds: `?jitter=40`. */
export const JITTER_QUERY_PARAM = "jitter";
/** Jitter, as a share of the lag, when the address gives a lag but no jitter. */
export const DEFAULT_JITTER_FRACTION = 0.2;

interface Pending {
  readonly data: unknown;
  readonly to: string | undefined;
  due: boolean;
}

function defaultSchedule(task: () => void, ms: number): void {
  setTimeout(task, ms);
}

function checkOptions(options: LagOptions): void {
  const valid = [options.latencyMs, options.jitterMs].every(
    (value) => Number.isFinite(value) && value >= 0,
  );
  if (!valid) {
    throw new Error(
      `withLag: latencyMs and jitterMs must be 0 or more, got ${String(options.latencyMs)} and ${String(options.jitterMs)}`,
    );
  }
}

/** One channel's outgoing queue: sends leave in order, each no sooner than its own delay. */
class LaggedChannel implements NetChannel {
  private queue: Pending[] = [];
  private closed = false;

  constructor(
    private readonly inner: NetChannel,
    private readonly delayMs: () => number,
    private readonly schedule: (task: () => void, ms: number) => void,
  ) {}

  send(data: unknown, to?: string): void {
    if (this.closed) {
      return;
    }
    const pending: Pending = { data, to, due: false };
    this.queue.push(pending);
    this.schedule(() => {
      pending.due = true;
      this.flush();
    }, this.delayMs());
  }

  onMessage(handler: MessageHandler): void {
    this.inner.onMessage(handler);
  }

  /** Drops everything still waiting; nothing more leaves. */
  close(): void {
    this.closed = true;
    this.queue = [];
  }

  private flush(): void {
    let head = this.queue[0];
    while (head?.due === true) {
      this.queue.shift();
      this.inner.send(head.data, head.to);
      head = this.queue[0];
    }
  }
}

/** `room`, with every outgoing message held back as `options` says. Everything else passes through. */
export function withLag(room: NetRoom, options: LagOptions): NetRoom {
  checkOptions(options);
  const random = options.random ?? Math.random;
  const schedule = options.schedule ?? defaultSchedule;
  const delayMs = (): number => options.latencyMs + random() * options.jitterMs;
  const channels = new Map<string, LaggedChannel>();
  const channel = (name: string): LaggedChannel => {
    const existing = channels.get(name);
    if (existing !== undefined) {
      return existing;
    }
    const lagged = new LaggedChannel(room.channel(name), delayMs, schedule);
    channels.set(name, lagged);
    return lagged;
  };
  return {
    channel,
    onPeerJoin: (handler) => {
      room.onPeerJoin(handler);
    },
    onPeerLeave: (handler) => {
      room.onPeerLeave(handler);
    },
    onTrouble: (handler) => {
      room.onTrouble(handler);
    },
    relays: () => room.relays(),
    leave: () => {
      for (const lagged of channels.values()) {
        lagged.close();
      }
      room.leave();
    },
  };
}

/** A query parameter as a number of milliseconds: null when missing, blank, negative or not a number. */
function millisecondsParam(params: URLSearchParams, name: string): number | null {
  const raw = params.get(name)?.trim() ?? "";
  const value = Number(raw);
  return raw === "" || !Number.isFinite(value) || value < 0 ? null : value;
}

/**
 * The pretend lag a page address asks for, such as `?lag=200&jitter=40`, or null when `lag` is missing or
 * not a number of milliseconds. A missing or invalid `jitter` defaults to `DEFAULT_JITTER_FRACTION` of
 * the lag.
 */
export function lagFromUrl(pageUrl: string): LagOptions | null {
  const params = new URL(pageUrl).searchParams;
  const latencyMs = millisecondsParam(params, LAG_QUERY_PARAM);
  if (latencyMs === null) {
    return null;
  }
  const jitterMs =
    millisecondsParam(params, JITTER_QUERY_PARAM) ?? latencyMs * DEFAULT_JITTER_FRACTION;
  return { latencyMs, jitterMs };
}
