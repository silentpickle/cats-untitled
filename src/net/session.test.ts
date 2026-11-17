import { describe, expect, it } from "vitest";
import { MemoryHub, settle } from "./memoryRoom";
import type { NetRoom } from "./room";
import {
  GuestSession,
  HostSession,
  type Decoder,
  type SessionStatus,
  type SnapshotInfo,
} from "./session";

const PROTOCOL = 3;
const OTHER_PROTOCOL = 4;
const STATE_VALUE = 42;
const HOST_TIME = 1.5;
const LATER_TIME = 2.5;
const LATEST_TIME = 3.5;
const FIRST_SEQ = 1;
const SECOND_SEQ = 2;
const THIRD_SEQ = 3;
const FRACTIONAL_SEQ = 1.5;
const NEGATIVE = -1;

// The wire names session.ts uses; the raw peers below speak the protocol by hand.
const CONTROL = "ctl";
const STATE = "state";
const INPUT = "input";
const HOST_ID = "host";
const GUEST_ID = "g1";

interface Snap {
  readonly tick: number;
}
interface Move {
  readonly dir: string;
}
interface Seat {
  readonly seat: string;
}

const decodeSnap: Decoder<Snap> = (raw) =>
  typeof raw === "object" && raw !== null && "tick" in raw && typeof raw.tick === "number"
    ? { tick: raw.tick }
    : null;
const decodeMove: Decoder<Move> = (raw) =>
  typeof raw === "object" && raw !== null && "dir" in raw && typeof raw.dir === "string"
    ? { dir: raw.dir }
    : null;
const decodeSeat: Decoder<Seat> = (raw) =>
  typeof raw === "object" && raw !== null && "seat" in raw && typeof raw.seat === "string"
    ? { seat: raw.seat }
    : null;

function host(hub: MemoryHub, protocol = PROTOCOL): HostSession<Snap, Move> {
  return new HostSession({
    room: hub.join("host"),
    protocol,
    welcome: { seat: "aragorn" },
    decodeInput: decodeMove,
  });
}

function guest(hub: MemoryHub, id: string, protocol = PROTOCOL): GuestSession<Snap, Move, Seat> {
  return new GuestSession({
    room: hub.join(id),
    protocol,
    decodeState: decodeSnap,
    decodeWelcome: decodeSeat,
  });
}

function record(session: { onStatus(l: (s: SessionStatus) => void): void }): SessionStatus[] {
  const seen: SessionStatus[] = [];
  session.onStatus((status) => seen.push(status));
  return seen;
}

interface Delivered {
  readonly snap: Snap;
  readonly info: SnapshotInfo;
}

function collect(g: GuestSession<Snap, Move, Seat>): Delivered[] {
  const delivered: Delivered[] = [];
  g.onSnapshot((snap, info) => delivered.push({ snap, info }));
  return delivered;
}

/** A guest that speaks the wire by hand: answers hello with join and records what the host sends. */
function rawGuest(hub: MemoryHub): { readonly room: NetRoom; readonly states: unknown[] } {
  const room = hub.join(GUEST_ID);
  const states: unknown[] = [];
  room.channel(CONTROL).onMessage((_raw, from) => {
    room.channel(CONTROL).send({ kind: "join", protocol: PROTOCOL }, from);
  });
  room.channel(STATE).onMessage((raw) => states.push(raw));
  return { room, states };
}

/** A host that speaks the wire by hand: says hello and records what the guest sends. */
function rawHost(hub: MemoryHub): { readonly room: NetRoom; readonly inputs: unknown[] } {
  const room = hub.join(HOST_ID);
  const inputs: unknown[] = [];
  room.onPeerJoin((peer) => {
    room.channel(CONTROL).send({ kind: "hello", protocol: PROTOCOL, welcome: { seat: "x" } }, peer);
  });
  room.channel(INPUT).onMessage((raw) => inputs.push(raw));
  return { room, inputs };
}

async function sendRawStates(room: NetRoom, envelopes: readonly unknown[]): Promise<void> {
  for (const envelope of envelopes) {
    room.channel(STATE).send(envelope, GUEST_ID);
  }
  await settle();
}

async function sendRawInputs(room: NetRoom, envelopes: readonly unknown[]): Promise<void> {
  for (const envelope of envelopes) {
    room.channel(INPUT).send(envelope, HOST_ID);
  }
  await settle();
}

describe("host and guest sessions", () => {
  it("connects and tells the guest its seat", async () => {
    const hub = new MemoryHub();
    const h = host(hub);
    const g = guest(hub, "g1");
    const welcomes: Seat[] = [];
    g.onWelcome((seat) => welcomes.push(seat));
    await settle();
    expect(h.state).toBe("connected");
    expect(g.state).toBe("connected");
    expect(welcomes).toEqual([{ seat: "aragorn" }]);
  });

  it("carries snapshots to the guest and inputs to the host", async () => {
    const hub = new MemoryHub();
    const h = host(hub);
    const g = guest(hub, "g1");
    const snaps: Snap[] = [];
    g.onSnapshot((snap) => snaps.push(snap));
    await settle();
    h.sendState({ tick: STATE_VALUE }, HOST_TIME);
    g.sendInput({ dir: "left" });
    await settle();
    expect(snaps).toEqual([{ tick: STATE_VALUE }]);
    expect(h.latestInput()).toEqual({ dir: "left" });
    expect(h.latestInputSeq()).toBe(FIRST_SEQ);
  });

  it("keeps the last good input when a bad one arrives", async () => {
    const hub = new MemoryHub();
    const h = host(hub);
    const g = guest(hub, "g1");
    await settle();
    g.sendInput({ dir: "up" });
    await settle();
    (g as unknown as GuestSession<Snap, unknown, Seat>).sendInput({ dir: 1 });
    await settle();
    expect(h.latestInput()).toEqual({ dir: "up" });
    expect(h.latestInputSeq()).toBe(FIRST_SEQ);
  });

  it("tells a third peer the room is full and ignores its input", async () => {
    const hub = new MemoryHub();
    const h = host(hub);
    guest(hub, "g1");
    await settle();
    const late = guest(hub, "g2");
    await settle();
    late.sendInput({ dir: "down" });
    await settle();
    expect(late.state).toBe("full");
    expect(h.latestInput()).toBeNull();
  });

  it("refuses a host on another protocol version", async () => {
    const hub = new MemoryHub();
    const h = host(hub, OTHER_PROTOCOL);
    const g = guest(hub, "g1");
    await settle();
    expect(g.state).toBe("mismatch");
    expect(h.state).toBe("waiting");
  });

  it("reports when the guest leaves and forgets its input", async () => {
    const hub = new MemoryHub();
    const h = host(hub);
    const g = guest(hub, "g1");
    const seen = record(h);
    await settle();
    g.sendInput({ dir: "up" });
    await settle();
    g.close();
    await settle();
    expect(seen).toEqual(["connected", "left"]);
    expect(h.latestInput()).toBeNull();
    expect(h.latestInputSeq()).toBe(0);
  });

  it("reports when the host leaves", async () => {
    const hub = new MemoryHub();
    const h = host(hub);
    const g = guest(hub, "g1");
    const seen = record(g);
    await settle();
    h.close();
    await settle();
    expect(seen).toEqual(["connected", "left"]);
  });

  it("drops snapshots that fail to decode", async () => {
    const hub = new MemoryHub();
    const h = host(hub);
    const g = guest(hub, "g1");
    const snaps: Snap[] = [];
    g.onSnapshot((snap) => snaps.push(snap));
    await settle();
    (h as unknown as HostSession<unknown, Move>).sendState({ tick: "soon" }, HOST_TIME);
    await settle();
    expect(snaps).toEqual([]);
  });

  it("sends nothing before anyone joins", async () => {
    const hub = new MemoryHub();
    const h = host(hub);
    h.sendState({ tick: 1 }, HOST_TIME);
    const g = guest(hub, "g1");
    const snaps: Snap[] = [];
    g.onSnapshot((snap) => snaps.push(snap));
    await settle();
    expect(snaps).toEqual([]);
  });
});

describe("input envelopes", () => {
  it("numbers inputs from 1 and returns each seq", async () => {
    const hub = new MemoryHub();
    const { inputs } = rawHost(hub);
    const g = guest(hub, GUEST_ID);
    await settle();
    const seqs = [g.sendInput({ dir: "up" }), g.sendInput({ dir: "down" })];
    await settle();
    expect(seqs).toEqual([FIRST_SEQ, SECOND_SEQ]);
    expect(inputs).toEqual([
      { seq: FIRST_SEQ, input: { dir: "up" } },
      { seq: SECOND_SEQ, input: { dir: "down" } },
    ]);
  });

  it("returns 0 and sends nothing before connecting", async () => {
    const hub = new MemoryHub();
    const g = guest(hub, GUEST_ID);
    const { inputs } = rawHost(hub);
    expect(g.sendInput({ dir: "up" })).toBe(0);
    await settle();
    expect(inputs).toEqual([]);
  });

  it("host ignores an input whose seq is not newer", async () => {
    const hub = new MemoryHub();
    const h = host(hub);
    const { room } = rawGuest(hub);
    await settle();
    await sendRawInputs(room, [
      { seq: SECOND_SEQ, input: { dir: "up" } },
      { seq: FIRST_SEQ, input: { dir: "down" } },
      { seq: SECOND_SEQ, input: { dir: "left" } },
    ]);
    expect(h.latestInput()).toEqual({ dir: "up" });
    expect(h.latestInputSeq()).toBe(SECOND_SEQ);
    await sendRawInputs(room, [{ seq: THIRD_SEQ, input: { dir: "right" } }]);
    expect(h.latestInput()).toEqual({ dir: "right" });
    expect(h.latestInputSeq()).toBe(THIRD_SEQ);
  });

  it("host ignores malformed input envelopes", async () => {
    const hub = new MemoryHub();
    const h = host(hub);
    const { room } = rawGuest(hub);
    await settle();
    await sendRawInputs(room, [
      { dir: "up" },
      { input: { dir: "up" } },
      { seq: 0, input: { dir: "up" } },
      { seq: NEGATIVE, input: { dir: "up" } },
      { seq: FRACTIONAL_SEQ, input: { dir: "up" } },
      { seq: String(FIRST_SEQ), input: { dir: "up" } },
      null,
    ]);
    expect(h.latestInput()).toBeNull();
    expect(h.latestInputSeq()).toBe(0);
  });

  it("an undecodable input does not use up its seq", async () => {
    const hub = new MemoryHub();
    const h = host(hub);
    const { room } = rawGuest(hub);
    await settle();
    await sendRawInputs(room, [
      { seq: FIRST_SEQ, input: { dir: 1 } },
      { seq: FIRST_SEQ, input: { dir: "up" } },
    ]);
    expect(h.latestInput()).toEqual({ dir: "up" });
    expect(h.latestInputSeq()).toBe(FIRST_SEQ);
  });
});

describe("snapshot envelopes", () => {
  it("stamps each snapshot with host time and the latest input seq", async () => {
    const hub = new MemoryHub();
    const h = host(hub);
    const { room, states } = rawGuest(hub);
    await settle();
    h.sendState({ tick: STATE_VALUE }, HOST_TIME);
    await sendRawInputs(room, [
      { seq: FIRST_SEQ, input: { dir: "up" } },
      { seq: SECOND_SEQ, input: { dir: "up" } },
    ]);
    h.sendState({ tick: STATE_VALUE }, LATER_TIME);
    await settle();
    expect(states).toEqual([
      { time: HOST_TIME, ack: 0, state: { tick: STATE_VALUE } },
      { time: LATER_TIME, ack: SECOND_SEQ, state: { tick: STATE_VALUE } },
    ]);
  });

  it("delivers time and ack with each snapshot", async () => {
    const hub = new MemoryHub();
    const h = host(hub);
    const g = guest(hub, GUEST_ID);
    const delivered = collect(g);
    await settle();
    g.sendInput({ dir: "up" });
    await settle();
    h.sendState({ tick: STATE_VALUE }, HOST_TIME);
    await settle();
    expect(delivered).toEqual([
      { snap: { tick: STATE_VALUE }, info: { time: HOST_TIME, ack: FIRST_SEQ } },
    ]);
  });

  it("guest drops snapshots that are not newer", async () => {
    const hub = new MemoryHub();
    const { room } = rawHost(hub);
    const g = guest(hub, GUEST_ID);
    const delivered = collect(g);
    await settle();
    await sendRawStates(room, [
      { time: LATER_TIME, ack: 0, state: { tick: 1 } },
      { time: HOST_TIME, ack: 0, state: { tick: 0 } },
      { time: LATER_TIME, ack: 0, state: { tick: 0 } },
      { time: LATEST_TIME, ack: 0, state: { tick: SECOND_SEQ } },
    ]);
    expect(delivered.map((d) => d.info.time)).toEqual([LATER_TIME, LATEST_TIME]);
  });

  it("guest accepts time 0 and ack 0", async () => {
    const hub = new MemoryHub();
    const { room } = rawHost(hub);
    const g = guest(hub, GUEST_ID);
    const delivered = collect(g);
    await settle();
    await sendRawStates(room, [{ time: 0, ack: 0, state: { tick: 1 } }]);
    expect(delivered).toEqual([{ snap: { tick: 1 }, info: { time: 0, ack: 0 } }]);
  });

  it("guest drops malformed snapshot envelopes", async () => {
    const hub = new MemoryHub();
    const { room } = rawHost(hub);
    const g = guest(hub, GUEST_ID);
    const delivered = collect(g);
    await settle();
    await sendRawStates(room, [
      { tick: 1 },
      { time: NEGATIVE, ack: 0, state: { tick: 1 } },
      { time: HOST_TIME, ack: NEGATIVE, state: { tick: 1 } },
      { time: String(HOST_TIME), ack: 0, state: { tick: 1 } },
      { time: HOST_TIME, state: { tick: 1 } },
      { time: Number.POSITIVE_INFINITY, ack: 0, state: { tick: 1 } },
      null,
    ]);
    expect(delivered).toEqual([]);
  });

  it("an undecodable snapshot does not advance the guest's clock", async () => {
    const hub = new MemoryHub();
    const { room } = rawHost(hub);
    const g = guest(hub, GUEST_ID);
    const delivered = collect(g);
    await settle();
    await sendRawStates(room, [
      { time: HOST_TIME, ack: 0, state: { tick: "soon" } },
      { time: HOST_TIME, ack: 0, state: { tick: 1 } },
    ]);
    expect(delivered).toEqual([{ snap: { tick: 1 }, info: { time: HOST_TIME, ack: 0 } }]);
  });
});
