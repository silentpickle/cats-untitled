import { describe, expect, it } from "vitest";
import {
  MAX_JITTER_ALLOWANCE_SECONDS,
  MAX_RATE_ADJUST,
  SnapshotBuffer,
  type Bracket,
  type BufferOptions,
} from "./snapshotBuffer";

// Times are multiples of 1/8 s so the arithmetic below is exact in floating point.
const DELAY = 0.125;
const FIRST_TIME = 9.75;
const SECOND_TIME = 10;
const STEP = 0.25;
const HALF = 0.5;
const ON_SNAPSHOT_DELAY = 1;
const BEFORE_OLDEST_DELAY = 2.5;
const OLDEST_DELAY = 2;
const LONG_DELAY = 1.5;
const BIG_CAPACITY = 3;
const HUGE_GAP = 100;
const SNAP_EDGE_GAP = 0.5;
const PAST_SNAP_EDGE_GAP = 0.625;
const SMALL_GAP = 0.03125;
const STARVED_SECONDS = 5;
const BAD_DELAY = -1;
const TOO_SMALL_CAPACITY = 1;
const DIGITS = 9;
const EPSILON = 1e-9;

// A stream of snapshots, 20 a second, drawn at 60 frames a second.
const SEND_INTERVAL = 0.05;
const FRAMES_PER_SECOND = 60;
const FRAME = 1 / FRAMES_PER_SECOND;
const LATENCY = 0.1;
const MAX_JITTER = 0.08;
const STREAM_LENGTH = 120;
const STEADY_DELAY = 0.1;
const SMOOTH_DELAY = 0.25;
const SETTLE_FRAMES = 60;

// Park-Miller pseudo-random numbers, so the jittered stream is the same every run.
const LCG_MULTIPLIER = 16807;
const LCG_MODULUS = 2147483647;
const LCG_SEED = 42;

function seededRandom(): () => number {
  let seed = LCG_SEED;
  return () => {
    seed = (seed * LCG_MULTIPLIER) % LCG_MODULUS;
    return seed / LCG_MODULUS;
  };
}

interface Clock {
  seconds: number;
}

function makeBuffer(
  clock: Clock,
  options: Omit<BufferOptions, "now"> = { delaySeconds: DELAY },
): SnapshotBuffer<string> {
  return new SnapshotBuffer<string>({ ...options, now: () => clock.seconds });
}

/** Pushes `time` at real time equal to it, so arrival gaps match host gaps and jitter stays 0. */
function pushOnTime(
  buffer: SnapshotBuffer<string>,
  clock: Clock,
  time: number,
  value: string,
): void {
  clock.seconds = time;
  buffer.push(time, value);
}

function lerp(bracket: Bracket<number> | null): number {
  return bracket === null ? Number.NaN : bracket.from + (bracket.to - bracket.from) * bracket.t;
}

interface Arrival {
  readonly time: number;
  readonly arrival: number;
}

/** Snapshots every `SEND_INTERVAL`, arriving `LATENCY` plus up to `jitter` later, never overtaking. */
function stream(jitter: number): Arrival[] {
  const random = seededRandom();
  const arrivals: Arrival[] = [];
  let last = 0;
  for (let index = 0; index < STREAM_LENGTH; index += 1) {
    const time = index * SEND_INTERVAL;
    last = Math.max(last, time + LATENCY + random() * jitter);
    arrivals.push({ time, arrival: last });
  }
  return arrivals;
}

/** Plays `arrivals` into a buffer whose values are their own times; returns what each frame draws. */
function play(arrivals: readonly Arrival[], delaySeconds: number): number[] {
  const clock: Clock = { seconds: 0 };
  const buffer = new SnapshotBuffer<number>({ delaySeconds, now: () => clock.seconds });
  const drawn: number[] = [];
  const end = arrivals.at(-1)?.arrival ?? 0;
  let next = 0;
  for (let frame = 0; frame * FRAME <= end; frame += 1) {
    const frameTime = frame * FRAME;
    // Messages arrive between frames, so each push reads the clock at its own arrival.
    for (; next < arrivals.length && (arrivals[next]?.arrival ?? 0) <= frameTime; next += 1) {
      const arrival = arrivals[next];
      clock.seconds = arrival?.arrival ?? 0;
      buffer.push(arrival?.time ?? 0, arrival?.time ?? 0);
    }
    clock.seconds = frameTime;
    drawn.push(lerp(buffer.sample()));
  }
  return drawn.filter((value) => !Number.isNaN(value));
}

function steps(values: readonly number[]): number[] {
  return values.slice(1).map((value, index) => value - (values[index] ?? 0));
}

describe("SnapshotBuffer", () => {
  it("returns null when empty", () => {
    const clock: Clock = { seconds: 0 };
    const buffer = makeBuffer(clock);
    expect(buffer.sample()).toBeNull();
    expect(buffer.newest()).toBeNull();
  });

  it("jumps straight to its target on the first sample", () => {
    const clock: Clock = { seconds: 0 };
    const buffer = makeBuffer(clock);
    pushOnTime(buffer, clock, FIRST_TIME, "a");
    pushOnTime(buffer, clock, SECOND_TIME, "b");
    expect(buffer.sample()).toEqual({ from: "a", to: "b", t: HALF });
  });

  it("holds the oldest snapshot before it", () => {
    const clock: Clock = { seconds: 0 };
    const buffer = makeBuffer(clock);
    pushOnTime(buffer, clock, SECOND_TIME, "a");
    expect(buffer.sample()).toEqual({ from: "a", to: "a", t: 0 });
  });

  it("holds the newest snapshot when starved", () => {
    const clock: Clock = { seconds: 0 };
    const buffer = makeBuffer(clock);
    pushOnTime(buffer, clock, FIRST_TIME, "a");
    pushOnTime(buffer, clock, SECOND_TIME, "b");
    buffer.sample();
    clock.seconds += STARVED_SECONDS;
    expect(buffer.sample()).toEqual({ from: "b", to: "b", t: 1 });
  });

  it("jumps to the new target after clear", () => {
    const clock: Clock = { seconds: 0 };
    const buffer = makeBuffer(clock);
    pushOnTime(buffer, clock, FIRST_TIME, "a");
    pushOnTime(buffer, clock, SECOND_TIME, "b");
    buffer.sample();
    buffer.clear();
    expect(buffer.newest()).toBeNull();
    // Only a quarter second from where the old clock would be: without the clear it would catch up.
    buffer.push(FIRST_TIME, "c");
    clock.seconds += STEP;
    buffer.push(SECOND_TIME, "d");
    expect(buffer.sample()).toEqual({ from: "c", to: "d", t: HALF });
  });

  it("ignores snapshots that are not newer", () => {
    const clock: Clock = { seconds: 0 };
    const buffer = makeBuffer(clock);
    buffer.push(SECOND_TIME, "a");
    buffer.push(SECOND_TIME, "same time");
    buffer.push(FIRST_TIME, "older");
    buffer.push(Number.NaN, "nonsense");
    expect(buffer.newest()).toEqual({ time: SECOND_TIME, value: "a" });
  });

  describe("render time exactly on a snapshot", () => {
    function threeSnapshots(delaySeconds: number): SnapshotBuffer<string> {
      const clock: Clock = { seconds: 0 };
      const buffer = makeBuffer(clock, { delaySeconds });
      pushOnTime(buffer, clock, 1, "a");
      pushOnTime(buffer, clock, 1 + 1, "b");
      pushOnTime(buffer, clock, 1 + 1 + 1, "c");
      return buffer;
    }

    it("starts from a middle snapshot it lands on", () => {
      expect(threeSnapshots(ON_SNAPSHOT_DELAY).sample()).toEqual({ from: "b", to: "c", t: 0 });
    });

    it("holds the newest snapshot it lands on", () => {
      expect(threeSnapshots(0).sample()).toEqual({ from: "c", to: "c", t: 1 });
    });

    it("starts from the oldest snapshot it lands on", () => {
      expect(threeSnapshots(OLDEST_DELAY).sample()).toEqual({ from: "a", to: "b", t: 0 });
    });

    it("holds the oldest snapshot when just before it", () => {
      expect(threeSnapshots(BEFORE_OLDEST_DELAY).sample()).toEqual({ from: "a", to: "a", t: 0 });
    });
  });

  describe("capacity", () => {
    it("drops the oldest snapshot beyond capacity", () => {
      const clock: Clock = { seconds: 0 };
      const buffer = makeBuffer(clock, { delaySeconds: LONG_DELAY, capacity: 1 + 1 });
      pushOnTime(buffer, clock, 1, "a");
      pushOnTime(buffer, clock, 1 + 1, "b");
      pushOnTime(buffer, clock, 1 + 1 + 1, "c");
      expect(buffer.sample()).toEqual({ from: "b", to: "b", t: 0 });
    });

    it("keeps exactly capacity snapshots", () => {
      const clock: Clock = { seconds: 0 };
      const buffer = makeBuffer(clock, { delaySeconds: LONG_DELAY, capacity: BIG_CAPACITY });
      pushOnTime(buffer, clock, 1, "a");
      pushOnTime(buffer, clock, 1 + 1, "b");
      pushOnTime(buffer, clock, 1 + 1 + 1, "c");
      expect(buffer.sample()).toEqual({ from: "a", to: "b", t: HALF });
    });

    it("keeps two snapshots at the smallest capacity", () => {
      const clock: Clock = { seconds: 0 };
      const buffer = makeBuffer(clock, { delaySeconds: HALF, capacity: 1 + 1 });
      pushOnTime(buffer, clock, 1, "a");
      pushOnTime(buffer, clock, 1 + 1, "b");
      expect(buffer.sample()).toEqual({ from: "a", to: "b", t: HALF });
    });

    it("refuses a capacity below two or a negative delay", () => {
      const clock: Clock = { seconds: 0 };
      expect(() =>
        makeBuffer(clock, { delaySeconds: DELAY, capacity: TOO_SMALL_CAPACITY }),
      ).toThrow(/capacity/);
      expect(() => makeBuffer(clock, { delaySeconds: BAD_DELAY })).toThrow(/delaySeconds/);
    });
  });

  describe("snap threshold", () => {
    // A huge first gap saturates the jitter allowance, so the delay stays put while the test moves the
    // target by an exact amount.
    function saturated(clock: Clock, gap: number): SnapshotBuffer<string> {
      const buffer = makeBuffer(clock);
      buffer.push(0, "a");
      buffer.push(HUGE_GAP, "b");
      expect(buffer.delay()).toBe(DELAY + MAX_JITTER_ALLOWANCE_SECONDS);
      buffer.sample();
      buffer.push(HUGE_GAP + gap, "c");
      return buffer;
    }

    it("catches up rather than jumps at exactly the threshold", () => {
      const clock: Clock = { seconds: 0 };
      const bracket = saturated(clock, SNAP_EDGE_GAP).sample();
      expect(bracket?.from).toBe("a");
      expect(bracket?.to).toBe("b");
    });

    it("catches up after a stall without overshooting the target", () => {
      const clock: Clock = { seconds: 0 };
      const buffer = saturated(clock, SMALL_GAP);
      clock.seconds += 1;
      buffer.push(HUGE_GAP + SMALL_GAP + 1, "d");
      const target = 1 - DELAY - MAX_JITTER_ALLOWANCE_SECONDS;
      expect(buffer.sample()).toEqual({ from: "c", to: "d", t: target });
    });

    it("jumps when past the threshold", () => {
      const clock: Clock = { seconds: 0 };
      const target = PAST_SNAP_EDGE_GAP - DELAY - MAX_JITTER_ALLOWANCE_SECONDS;
      expect(saturated(clock, PAST_SNAP_EDGE_GAP).sample()).toEqual({
        from: "b",
        to: "c",
        t: target / PAST_SNAP_EDGE_GAP,
      });
    });
  });

  describe("jitter allowance", () => {
    it("adds nothing for a steady stream", () => {
      const clock: Clock = { seconds: 0 };
      const buffer = makeBuffer(clock);
      pushOnTime(buffer, clock, FIRST_TIME, "a");
      pushOnTime(buffer, clock, SECOND_TIME, "b");
      expect(buffer.delay()).toBe(DELAY);
    });

    it("grows with jitter", () => {
      const clock: Clock = { seconds: 0 };
      const buffer = makeBuffer(clock);
      buffer.push(FIRST_TIME, "a");
      buffer.push(SECOND_TIME, "b");
      expect(buffer.delay()).toBeGreaterThan(DELAY);
      expect(buffer.delay()).toBeLessThan(DELAY + MAX_JITTER_ALLOWANCE_SECONDS);
    });

    it("stays capped", () => {
      const clock: Clock = { seconds: 0 };
      const buffer = makeBuffer(clock);
      buffer.push(0, "a");
      buffer.push(HUGE_GAP, "b");
      expect(buffer.delay()).toBe(DELAY + MAX_JITTER_ALLOWANCE_SECONDS);
    });

    it("is forgotten on clear", () => {
      const clock: Clock = { seconds: 0 };
      const buffer = makeBuffer(clock);
      buffer.push(0, "a");
      buffer.push(HUGE_GAP, "b");
      buffer.clear();
      expect(buffer.delay()).toBe(DELAY);
    });
  });

  describe("streams", () => {
    it("draws a steady stream at a constant distance behind", () => {
      const drawn = play(stream(0), STEADY_DELAY).slice(SETTLE_FRAMES);
      for (const step of steps(drawn)) {
        expect(step).toBeCloseTo(FRAME, DIGITS);
      }
    });

    it("never goes backwards under jittered arrivals", () => {
      const drawn = play(stream(MAX_JITTER), STEADY_DELAY);
      for (const step of steps(drawn)) {
        expect(step).toBeGreaterThanOrEqual(0);
      }
    });

    it("runs within the rate bound of real time under jittered arrivals", () => {
      const drawn = play(stream(MAX_JITTER), SMOOTH_DELAY).slice(SETTLE_FRAMES);
      for (const step of steps(drawn)) {
        expect(step).toBeGreaterThanOrEqual(FRAME * (1 - MAX_RATE_ADJUST) - EPSILON);
        expect(step).toBeLessThanOrEqual(FRAME * (1 + MAX_RATE_ADJUST) + EPSILON);
      }
    });
  });
});
