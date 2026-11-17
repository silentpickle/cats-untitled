import type { NetRoom } from "./room";

/**
 * A two-seat, host-authoritative session over any `NetRoom`.
 *
 * - The **host** runs the game. It sends `State` snapshots and reads the guest's latest `Input`.
 * - The **guest** draws the snapshots it receives and sends its `Input`.
 *
 * Handshake: when a peer appears, the host sends `hello` (protocol version and a `Welcome` such as which
 * character the guest plays). A guest that accepts replies `join`; only then are the two connected. A
 * third peer gets `full`. Messages from anyone but the partner are ignored, so a stray peer that guesses
 * the code cannot take control.
 *
 * Generic over the game's types: the game passes decoders that check what arrives off the network.
 */

/** Checks untrusted data; returns null when it is not a valid `T`. */
export type Decoder<T> = (raw: unknown) => T | null;

export type SessionStatus =
  /** Room open, nobody has joined yet (host) or no host has answered yet (guest). */
  | "waiting"
  | "connected"
  /** The partner closed the page or lost the connection. */
  | "left"
  /** Guest only: the room already has two players. */
  | "full"
  /** Guest only: the host runs a different version of the game. */
  | "mismatch";

const CONTROL = "ctl";
const STATE = "state";
const INPUT = "input";

type Control =
  | { readonly kind: "hello"; readonly protocol: number; readonly welcome: unknown }
  | { readonly kind: "join"; readonly protocol: number }
  | { readonly kind: "full" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function decodeControl(raw: unknown): Control | null {
  if (!isRecord(raw)) {
    return null;
  }
  if (raw.kind === "full") {
    return { kind: "full" };
  }
  if (typeof raw.protocol !== "number") {
    return null;
  }
  if (raw.kind === "join") {
    return { kind: "join", protocol: raw.protocol };
  }
  return raw.kind === "hello"
    ? { kind: "hello", protocol: raw.protocol, welcome: raw.welcome }
    : null;
}

/** Status bookkeeping shared by both seats. */
class StatusCell {
  private current: SessionStatus = "waiting";
  private listener: (status: SessionStatus) => void = () => undefined;

  get value(): SessionStatus {
    return this.current;
  }

  set(status: SessionStatus): void {
    if (status === this.current) {
      return;
    }
    this.current = status;
    this.listener(status);
  }

  listen(listener: (status: SessionStatus) => void): void {
    this.listener = listener;
  }
}

export interface HostOptions<Input> {
  readonly room: NetRoom;
  /** Bump when the snapshot or input shape changes, so old and new pages refuse each other politely. */
  readonly protocol: number;
  /** What the guest is told on joining, such as which character it plays. Must be JSON-serializable. */
  readonly welcome: unknown;
  readonly decodeInput: Decoder<Input>;
}

export class HostSession<State, Input> {
  private readonly status = new StatusCell();
  private guest: string | null = null;
  private input: Input | null = null;
  private readonly room: NetRoom;

  constructor(private readonly options: HostOptions<Input>) {
    this.room = options.room;
    this.room.onPeerJoin((peer) => {
      this.greet(peer);
    });
    this.room.onPeerLeave((peer) => {
      this.forget(peer);
    });
    this.room.channel(CONTROL).onMessage((raw, from) => {
      this.onControl(decodeControl(raw), from);
    });
    this.room.channel(INPUT).onMessage((raw, from) => {
      this.onInput(raw, from);
    });
  }

  get state(): SessionStatus {
    return this.status.value;
  }

  onStatus(listener: (status: SessionStatus) => void): void {
    this.status.listen(listener);
  }

  /** The guest's most recent input, or null before the first one arrives or after the guest left. */
  latestInput(): Input | null {
    return this.input;
  }

  /** Sends a snapshot to the guest, if one is connected. */
  sendState(state: State): void {
    if (this.guest === null) {
      return;
    }
    this.room.channel(STATE).send(state, this.guest);
  }

  close(): void {
    this.room.leave();
  }

  private greet(peer: string): void {
    const control = this.room.channel(CONTROL);
    if (this.guest !== null) {
      control.send({ kind: "full" }, peer);
      return;
    }
    control.send(
      { kind: "hello", protocol: this.options.protocol, welcome: this.options.welcome },
      peer,
    );
  }

  private onControl(control: Control | null, from: string): void {
    if (control?.kind !== "join" || control.protocol !== this.options.protocol) {
      return;
    }
    if (this.guest !== null) {
      this.room.channel(CONTROL).send({ kind: "full" }, from);
      return;
    }
    this.guest = from;
    this.status.set("connected");
  }

  private onInput(raw: unknown, from: string): void {
    if (from !== this.guest) {
      return;
    }
    this.input = this.options.decodeInput(raw) ?? this.input;
  }

  private forget(peer: string): void {
    if (peer !== this.guest) {
      return;
    }
    this.guest = null;
    this.input = null;
    this.status.set("left");
  }
}

export interface GuestOptions<State, Welcome> {
  readonly room: NetRoom;
  readonly protocol: number;
  readonly decodeState: Decoder<State>;
  readonly decodeWelcome: Decoder<Welcome>;
}

export class GuestSession<State, Input, Welcome> {
  private readonly status = new StatusCell();
  private host: string | null = null;
  private welcomed: (welcome: Welcome) => void = () => undefined;
  private snapshot: (state: State) => void = () => undefined;
  private readonly room: NetRoom;

  constructor(private readonly options: GuestOptions<State, Welcome>) {
    this.room = options.room;
    this.room.onPeerJoin(() => undefined);
    this.room.onPeerLeave((peer) => {
      this.forget(peer);
    });
    this.room.channel(CONTROL).onMessage((raw, from) => {
      this.onControl(decodeControl(raw), from);
    });
    this.room.channel(STATE).onMessage((raw, from) => {
      this.onState(raw, from);
    });
  }

  get state(): SessionStatus {
    return this.status.value;
  }

  onStatus(listener: (status: SessionStatus) => void): void {
    this.status.listen(listener);
  }

  /** Called once, when the host accepts this guest. */
  onWelcome(listener: (welcome: Welcome) => void): void {
    this.welcomed = listener;
  }

  /** Called for every valid snapshot from the host. */
  onSnapshot(listener: (state: State) => void): void {
    this.snapshot = listener;
  }

  sendInput(input: Input): void {
    if (this.host === null) {
      return;
    }
    this.room.channel(INPUT).send(input, this.host);
  }

  close(): void {
    this.room.leave();
  }

  private onControl(control: Control | null, from: string): void {
    if (control === null || this.host !== null) {
      return;
    }
    if (control.kind === "full") {
      this.status.set("full");
      return;
    }
    if (control.kind === "hello") {
      this.accept(control, from);
    }
  }

  private accept(hello: Control & { kind: "hello" }, from: string): void {
    const welcome = this.options.decodeWelcome(hello.welcome);
    if (hello.protocol !== this.options.protocol || welcome === null) {
      this.status.set("mismatch");
      return;
    }
    this.host = from;
    this.room.channel(CONTROL).send({ kind: "join", protocol: this.options.protocol }, from);
    this.status.set("connected");
    this.welcomed(welcome);
  }

  private onState(raw: unknown, from: string): void {
    if (from !== this.host) {
      return;
    }
    const state = this.options.decodeState(raw);
    if (state !== null) {
      this.snapshot(state);
    }
  }

  private forget(peer: string): void {
    if (peer !== this.host) {
      return;
    }
    this.host = null;
    this.status.set("left");
  }
}
