import { describe, expect, it } from "vitest";
import { MemoryHub, settle } from "./memoryRoom";
import { GuestSession, HostSession, type Decoder, type SessionStatus } from "./session";

const PROTOCOL = 3;
const OTHER_PROTOCOL = 4;
const STATE_VALUE = 42;

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
    h.sendState({ tick: STATE_VALUE });
    g.sendInput({ dir: "left" });
    await settle();
    expect(snaps).toEqual([{ tick: STATE_VALUE }]);
    expect(h.latestInput()).toEqual({ dir: "left" });
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
    (h as unknown as HostSession<unknown, Move>).sendState({ tick: "soon" });
    await settle();
    expect(snaps).toEqual([]);
  });

  it("sends nothing before anyone joins", async () => {
    const hub = new MemoryHub();
    const h = host(hub);
    h.sendState({ tick: 1 });
    const g = guest(hub, "g1");
    const snaps: Snap[] = [];
    g.onSnapshot((snap) => snaps.push(snap));
    await settle();
    expect(snaps).toEqual([]);
  });
});
