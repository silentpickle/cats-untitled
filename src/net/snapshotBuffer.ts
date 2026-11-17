/**
 * Smooths a stream of timestamped snapshots for drawing. Snapshots arrive bunched and late; drawing the
 * newest one makes the picture hop. Instead the buffer keeps the last few and runs its own render clock
 * in host time, a little behind the newest snapshot, and says which two snapshots that moment falls
 * between. The caller blends them (`from`, `to`, `t`); the buffer knows nothing about what `T` holds.
 *
 * The render clock runs at real-time speed and is nudged, never yanked: when it drifts from where it
 * should be it runs up to `MAX_RATE_ADJUST` faster or slower until it is back. Only when it is wildly
 * off (the first snapshot, after `clear`, after a long stall) does it jump. The delay behind the newest
 * snapshot grows with the arrival jitter it measures, so a bumpy connection still has a snapshot to
 * move toward.
 */

/** Two snapshots and how far between them the render clock is. */
export interface Bracket<T> {
  readonly from: T;
  readonly to: T;
  /** 0 at `from`, 1 at `to`. */
  readonly t: number;
}

export interface BufferOptions {
  /** How far behind the newest snapshot to draw, in seconds, before any jitter allowance. */
  readonly delaySeconds: number;
  /** How many snapshots to keep. Defaults to `DEFAULT_SNAPSHOT_CAPACITY`. */
  readonly capacity?: number;
  /** The real clock in seconds. Defaults to `performance.now()` in seconds. */
  readonly now?: () => number;
}

/** Snapshots kept by default: over half a second at 20 a second, more than any sensible delay. */
export const DEFAULT_SNAPSHOT_CAPACITY = 16;
/** Bracketing needs two snapshots. */
const MIN_CAPACITY = 2;
/** The most the render clock runs faster or slower than real time while catching up: ±10%. */
export const MAX_RATE_ADJUST = 0.1;
/** Seconds of render-clock error that earn the full rate adjustment; smaller errors get a share. */
const FULL_ADJUST_ERROR_SECONDS = 0.05;
/** Further off than this, in seconds, and the render clock jumps instead of catching up. */
export const SNAP_THRESHOLD_SECONDS = 0.5;
/** How much of each new jitter sample the smoothed estimate takes in (exponential smoothing). */
const JITTER_SMOOTHING = 0.1;
/** The jitter allowance is this many times the smoothed jitter. */
const JITTER_MULTIPLIER = 2;
/** The jitter allowance never adds more than this to the delay, in seconds. */
export const MAX_JITTER_ALLOWANCE_SECONDS = 0.25;
const MS_PER_SECOND = 1000;

interface Entry<T> {
  readonly time: number;
  readonly value: T;
}

function performanceSeconds(): number {
  return performance.now() / MS_PER_SECOND;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * How far to move the render clock beyond real time to close `error` seconds over `elapsed` seconds:
 * at most `MAX_RATE_ADJUST` of the elapsed time, and never past the target.
 */
function correction(error: number, elapsed: number): number {
  const rate = clamp(
    (error / FULL_ADJUST_ERROR_SECONDS) * MAX_RATE_ADJUST,
    -MAX_RATE_ADJUST,
    MAX_RATE_ADJUST,
  );
  const reach = Math.abs(error);
  return clamp(elapsed * rate, -reach, reach);
}

function hold<T>(entry: Entry<T>, t: number): Bracket<T> {
  return { from: entry.value, to: entry.value, t };
}

function between<T>(from: Entry<T>, to: Entry<T>, time: number): Bracket<T> {
  return { from: from.value, to: to.value, t: (time - from.time) / (to.time - from.time) };
}

/** The pair around `time` in `entries` (sorted by time, not empty). */
function bracket<T>(entries: readonly Entry<T>[], time: number): Bracket<T> | null {
  const next = entries.findIndex((entry) => entry.time > time);
  const last = entries.at(-1);
  if (next === -1) {
    return last === undefined ? null : hold(last, 1);
  }
  const to = entries[next];
  const from = entries[next - 1];
  if (to === undefined) {
    return null;
  }
  return from === undefined ? hold(to, 0) : between(from, to, time);
}

function checkOptions(delaySeconds: number, capacity: number): void {
  if (!(delaySeconds >= 0) || !Number.isFinite(delaySeconds)) {
    throw new Error(`SnapshotBuffer: delaySeconds must be 0 or more, got ${String(delaySeconds)}`);
  }
  if (!Number.isInteger(capacity) || capacity < MIN_CAPACITY) {
    throw new Error(
      `SnapshotBuffer: capacity must be a whole number of at least ${String(MIN_CAPACITY)}, got ${String(capacity)}`,
    );
  }
}

/** An interpolation buffer with its own render clock in host time. */
export class SnapshotBuffer<T> {
  private readonly baseDelay: number;
  private readonly capacity: number;
  private readonly now: () => number;
  private entries: Entry<T>[] = [];
  /** Real time the newest snapshot arrived. */
  private newestArrival = 0;
  /** Smoothed |arrival gap − host time gap|, in seconds. */
  private jitter = 0;
  /** Where the render clock stood, in host time, at real time `clockReadAt`; null until first sampled. */
  private renderTime: number | null = null;
  private clockReadAt = 0;

  constructor(options: BufferOptions) {
    this.baseDelay = options.delaySeconds;
    this.capacity = options.capacity ?? DEFAULT_SNAPSHOT_CAPACITY;
    this.now = options.now ?? performanceSeconds;
    checkOptions(this.baseDelay, this.capacity);
  }

  /** Adds a snapshot taken at host `time`. Ignored unless newer than the newest held. */
  push(time: number, value: T): void {
    const newest = this.entries.at(-1);
    if (!Number.isFinite(time) || (newest !== undefined && time <= newest.time)) {
      return;
    }
    const arrival = this.now();
    if (newest !== undefined) {
      this.measureJitter(arrival - this.newestArrival, time - newest.time);
    }
    this.entries.push({ time, value });
    if (this.entries.length > this.capacity) {
      this.entries.shift();
    }
    this.newestArrival = arrival;
  }

  /**
   * Advances the render clock to now and returns the snapshots around it. Before the oldest snapshot it
   * holds the oldest (`t` 0); past the newest it holds the newest (`t` 1) rather than guess ahead.
   * Null when empty.
   */
  sample(): Bracket<T> | null {
    const newest = this.entries.at(-1);
    if (newest === undefined) {
      return null;
    }
    return bracket(this.entries, this.advanceClock(newest.time));
  }

  /** The newest snapshot held, or null when empty. */
  newest(): { readonly time: number; readonly value: T } | null {
    return this.entries.at(-1) ?? null;
  }

  /** How far behind the newest snapshot the render clock aims, in seconds: the base plus jitter. */
  delay(): number {
    const allowance = Math.min(this.jitter * JITTER_MULTIPLIER, MAX_JITTER_ALLOWANCE_SECONDS);
    return this.baseDelay + allowance;
  }

  /** Forgets every snapshot and the jitter measured; the next sample jumps straight to its target. */
  clear(): void {
    this.entries = [];
    this.jitter = 0;
    this.renderTime = null;
  }

  private measureJitter(arrivalGap: number, hostGap: number): void {
    const sample = Math.abs(arrivalGap - hostGap);
    this.jitter += (sample - this.jitter) * JITTER_SMOOTHING;
  }

  /** Moves the render clock to real time now and returns it, in host time. */
  private advanceClock(newestTime: number): number {
    const now = this.now();
    const target = newestTime + (now - this.newestArrival) - this.delay();
    const elapsed = Math.max(0, now - this.clockReadAt);
    this.clockReadAt = now;
    const drifted = this.renderTime === null ? null : this.renderTime + elapsed;
    if (drifted === null || Math.abs(target - drifted) > SNAP_THRESHOLD_SECONDS) {
      this.renderTime = target;
      return target;
    }
    this.renderTime = drifted + correction(target - drifted, elapsed);
    return this.renderTime;
  }
}
