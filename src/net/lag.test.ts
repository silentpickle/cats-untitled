import { describe, expect, it } from "vitest";
import {
  DEFAULT_JITTER_FRACTION,
  JITTER_QUERY_PARAM,
  LAG_QUERY_PARAM,
  lagFromUrl,
  withLag,
  type LagOptions,
} from "./lag";
import { MemoryHub, settle } from "./memoryRoom";
import type { NetRoom, NetTrouble } from "./room";

const LATENCY_MS = 100;
const JITTER_MS = 40;
const HALF = 0.5;
const HALF_JITTER_DELAY = LATENCY_MS + JITTER_MS * HALF;
const FULL_JITTER_DELAY = LATENCY_MS + JITTER_MS;
const NEGATIVE = -1;
const PAGE = "https://example.test/game/";
const TROUBLE: NetTrouble = { kind: "unreachable", detail: "test" };

interface Timer {
  readonly at: number;
  readonly order: number;
  readonly task: () => void;
}

/** A fake clock for `schedule`: tasks run, in time order, only when the test advances it. */
class FakeTimers {
  private now = 0;
  private timers: Timer[] = [];

  readonly schedule = (task: () => void, ms: number): void => {
    this.timers.push({ at: this.now + ms, order: this.timers.length, task });
  };

  /** Runs every task due within the next `ms`, then lets the memory hub deliver what they sent. */
  async advance(ms: number): Promise<void> {
    const end = this.now + ms;
    for (let next = this.nextDue(end); next !== undefined; next = this.nextDue(end)) {
      this.timers = this.timers.filter((timer) => timer !== next);
      this.now = next.at;
      next.task();
    }
    this.now = end;
    await settle();
  }

  private nextDue(end: number): Timer | undefined {
    return this.timers
      .filter((timer) => timer.at <= end)
      .sort((a, b) => a.at - b.at || a.order - b.order)[0];
  }
}

/** Returns `values` in turn, then 0. */
function sequence(...values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index] ?? 0;
    index += 1;
    return value;
  };
}

function options(timers: FakeTimers, random: () => number): LagOptions {
  return { latencyMs: LATENCY_MS, jitterMs: JITTER_MS, random, schedule: timers.schedule };
}

function listen(room: NetRoom, channel: string): unknown[] {
  const seen: unknown[] = [];
  room.channel(channel).onMessage((data) => seen.push(data));
  return seen;
}

describe("withLag", () => {
  it("holds each message for latency plus its share of jitter", async () => {
    const hub = new MemoryHub();
    const timers = new FakeTimers();
    const sender = withLag(hub.join("a"), options(timers, sequence(HALF)));
    const seen = listen(hub.join("b"), "x");
    await settle();
    sender.channel("x").send("hello");
    await timers.advance(HALF_JITTER_DELAY - 1);
    expect(seen).toEqual([]);
    await timers.advance(1);
    expect(seen).toEqual(["hello"]);
  });

  it("never lets a message overtake an earlier one on its channel", async () => {
    const hub = new MemoryHub();
    const timers = new FakeTimers();
    const sender = withLag(hub.join("a"), options(timers, sequence(1, 0)));
    const seen = listen(hub.join("b"), "x");
    await settle();
    sender.channel("x").send("slow");
    sender.channel("x").send("fast");
    await timers.advance(LATENCY_MS);
    expect(seen).toEqual([]);
    await timers.advance(JITTER_MS);
    expect(seen).toEqual(["slow", "fast"]);
  });

  it("lets channels run independently", async () => {
    const hub = new MemoryHub();
    const timers = new FakeTimers();
    const sender = withLag(hub.join("a"), options(timers, sequence(1, 0)));
    const receiver = hub.join("b");
    const onX = listen(receiver, "x");
    const onY = listen(receiver, "y");
    await settle();
    sender.channel("x").send("slow");
    sender.channel("y").send("fast");
    await timers.advance(LATENCY_MS);
    expect(onX).toEqual([]);
    expect(onY).toEqual(["fast"]);
    await timers.advance(FULL_JITTER_DELAY - LATENCY_MS);
    expect(onX).toEqual(["slow"]);
  });

  it("delivers to the addressed peer only", async () => {
    const hub = new MemoryHub();
    const timers = new FakeTimers();
    const sender = withLag(hub.join("a"), options(timers, sequence()));
    const toB = listen(hub.join("b"), "x");
    const toC = listen(hub.join("c"), "x");
    await settle();
    sender.channel("x").send("psst", "b");
    await timers.advance(LATENCY_MS);
    expect(toB).toEqual(["psst"]);
    expect(toC).toEqual([]);
  });

  it("does not delay incoming messages", async () => {
    const hub = new MemoryHub();
    const timers = new FakeTimers();
    const lagged = withLag(hub.join("a"), options(timers, sequence()));
    const seen = listen(lagged, "x");
    const other = hub.join("b");
    await settle();
    other.channel("x").send("hi");
    await settle();
    expect(seen).toEqual(["hi"]);
  });

  it("returns the same channel for the same name", () => {
    const hub = new MemoryHub();
    const lagged = withLag(hub.join("a"), options(new FakeTimers(), sequence()));
    expect(lagged.channel("x")).toBe(lagged.channel("x"));
  });

  it("passes peers, trouble and relays through", async () => {
    const hub = new MemoryHub();
    const inner = hub.join("a");
    const lagged = withLag(inner, options(new FakeTimers(), sequence()));
    const events: string[] = [];
    lagged.onPeerJoin((peer) => events.push(`join ${peer}`));
    lagged.onPeerLeave((peer) => events.push(`leave ${peer}`));
    lagged.onTrouble((trouble) => events.push(trouble.kind));
    const other = hub.join("b");
    await settle();
    hub.reportTrouble("a", TROUBLE);
    other.leave();
    await settle();
    expect(events).toEqual(["join b", "unreachable", "leave b"]);
    expect(lagged.relays()).toEqual(inner.relays());
  });

  it("drops messages still waiting when the room is left", async () => {
    const hub = new MemoryHub();
    const timers = new FakeTimers();
    const sender = withLag(hub.join("a"), options(timers, sequence()));
    const receiver = hub.join("b");
    const seen = listen(receiver, "x");
    const left: string[] = [];
    receiver.onPeerLeave((peer) => left.push(peer));
    await settle();
    sender.channel("x").send("too late");
    sender.leave();
    sender.channel("x").send("after leaving");
    await timers.advance(FULL_JITTER_DELAY);
    expect(seen).toEqual([]);
    expect(left).toEqual(["a"]);
  });

  it("refuses negative latency or jitter", () => {
    const room = new MemoryHub().join("a");
    expect(() => withLag(room, { latencyMs: NEGATIVE, jitterMs: 0 })).toThrow(/latencyMs/);
    expect(() => withLag(room, { latencyMs: 0, jitterMs: NEGATIVE })).toThrow(/jitterMs/);
  });
});

describe("lagFromUrl", () => {
  function url(query: string): string {
    return `${PAGE}?${query}`;
  }

  it("reads lag and jitter", () => {
    const query = `${LAG_QUERY_PARAM}=${String(LATENCY_MS)}&${JITTER_QUERY_PARAM}=${String(JITTER_MS)}`;
    expect(lagFromUrl(url(query))).toEqual({ latencyMs: LATENCY_MS, jitterMs: JITTER_MS });
  });

  it("defaults jitter to a share of the lag", () => {
    expect(lagFromUrl(url(`${LAG_QUERY_PARAM}=${String(LATENCY_MS)}`))).toEqual({
      latencyMs: LATENCY_MS,
      jitterMs: LATENCY_MS * DEFAULT_JITTER_FRACTION,
    });
  });

  it("defaults jitter that is not a number", () => {
    expect(
      lagFromUrl(url(`${LAG_QUERY_PARAM}=${String(LATENCY_MS)}&${JITTER_QUERY_PARAM}=lots`)),
    ).toEqual({ latencyMs: LATENCY_MS, jitterMs: LATENCY_MS * DEFAULT_JITTER_FRACTION });
  });

  it("accepts a lag of zero", () => {
    expect(lagFromUrl(url(`${LAG_QUERY_PARAM}=0`))).toEqual({ latencyMs: 0, jitterMs: 0 });
  });

  it("is null without a usable lag", () => {
    expect(lagFromUrl(PAGE)).toBeNull();
    expect(lagFromUrl(url(`${LAG_QUERY_PARAM}=`))).toBeNull();
    expect(lagFromUrl(url(`${LAG_QUERY_PARAM}=slow`))).toBeNull();
    expect(lagFromUrl(url(`${LAG_QUERY_PARAM}=${String(NEGATIVE)}`))).toBeNull();
  });
});
