import { ZERO, add, clampCircleInside, finiteVec, length, scale, sub } from "../sim/geometry";
import { blockersFor, moveOneCat, overlapsAny } from "../sim/movement";
import type { CatId, CatState, Rect, Settings, Vec2, WorldDef } from "../sim/types";

/**
 * How many sent inputs are remembered for reconciling. At 30 inputs a second this covers about two seconds
 * of round trip; an ack older than that is compared with the current prediction instead.
 */
export const HISTORY_LIMIT = 64;

export interface PredictOptions {
  /** Errors smaller than this are left alone (input timing noise). */
  readonly deadZoneMetres: number;
  /** Errors larger than this snap at once (a swat knock-back, a new round). */
  readonly snapMetres: number;
  /** How fast a correction is blended in, per second (exponential). */
  readonly blendPerSecond: number;
}

/** The part of the cat the guest predicts; everything else is always the host's. */
interface Pose {
  readonly pos: Vec2;
  readonly facing: number;
  readonly moving: boolean;
}

/** Where the prediction stood when an input was sent. */
interface SentInput {
  readonly seq: number;
  readonly pos: Vec2;
}

function poseOf(cat: CatState): Pose {
  return { pos: cat.pos, facing: cat.facing, moving: cat.moving };
}

/** While the host stuns the cat or makes it flee, the guest's input does nothing, so there is nothing to predict. */
function hostOverrides(cat: CatState): boolean {
  return cat.stunnedFor > 0 || cat.fleeFor > 0;
}

/** Negative or non-finite frame time counts as none. */
function usableDt(dt: number): number {
  return Number.isFinite(dt) ? Math.max(0, dt) : 0;
}

/** Share of a remaining gap closed in `dt` seconds at `rate` per second; the same at any frame rate. */
function blendFraction(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/**
 * The guest's own cat, moved at once by the guest's input with the host's own movement rule, then pulled
 * toward where the host says it is. Small disagreements are ignored, medium ones are blended in over a few
 * frames, and large ones (a swat, a new round) snap.
 */
export class OwnCatPredictor {
  private pose: Pose | null = null;
  /** Correction still to blend in. */
  private pending: Vec2 = ZERO;
  private history: SentInput[] = [];
  private readonly radius: number;
  private readonly blockers: readonly Rect[];

  constructor(
    private readonly cat: CatId,
    private readonly world: WorldDef,
    private readonly settings: Settings,
    private readonly options: PredictOptions,
  ) {
    this.radius = settings.cats[cat].radius;
    this.blockers = blockersFor(world, cat);
  }

  /** Start from the host's word, e.g. on the first snapshot or a new round. */
  reset(authoritative: CatState): void {
    this.pose = poseOf(authoritative);
    this.pending = ZERO;
    this.history = [];
  }

  /** The guest just sent input number `seq`; remember where the prediction stood. */
  sent(seq: number): void {
    if (this.pose === null) return;
    this.history.push({ seq, pos: this.pose.pos });
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
  }

  /**
   * Advance one frame with the input the guest last sent. `authoritative` is the newest host view of this
   * cat. Returns the cat to draw: the host's cat with the predicted position, facing and moving.
   */
  advance(dt: number, move: Vec2, authoritative: CatState): CatState {
    const pose = this.pose ?? poseOf(authoritative);
    const frame = usableDt(dt);
    const next = hostOverrides(authoritative)
      ? this.follow(pose, frame, authoritative)
      : this.predict(pose, frame, move, authoritative);
    this.pose = next;
    return { ...authoritative, pos: next.pos, facing: next.facing, moving: next.moving };
  }

  /** A snapshot arrived saying the host had applied inputs up to `ack`, and where it put the cat. */
  reconcile(ack: number, authoritative: CatState): void {
    if (this.pose === null) {
      this.reset(authoritative);
      return;
    }
    const recorded = this.history.find((h) => h.seq === ack)?.pos ?? this.pose.pos;
    this.history = this.history.filter((h) => h.seq > ack);
    if (hostOverrides(authoritative)) return;
    this.correct(sub(authoritative.pos, add(recorded, this.pending)));
  }

  /** Acts on how far the host is from where the prediction is already heading. */
  private correct(error: Vec2): void {
    const size = length(error);
    if (size > this.options.snapMetres) {
      this.shift(add(this.pending, error));
      this.pending = ZERO;
      return;
    }
    if (size > this.options.deadZoneMetres) this.pending = add(this.pending, error);
  }

  /** Moves the prediction, and every remembered position after it, by a correction. */
  private shift(by: Vec2): void {
    if (this.pose === null) return;
    this.pose = { ...this.pose, pos: add(this.pose.pos, by) };
    this.history = this.history.map((h) => ({ ...h, pos: add(h.pos, by) }));
  }

  private predict(pose: Pose, dt: number, move: Vec2, authoritative: CatState): Pose {
    const start: CatState = { ...authoritative, id: this.cat, pos: pose.pos, facing: pose.facing };
    this.pose = poseOf(moveOneCat(start, finiteVec(move), dt, this.world, this.settings));
    this.blendIn(dt);
    return this.pose;
  }

  /**
   * Blends part of the pending correction in. A part-way point that would sit in furniture or outside the
   * house is skipped and the whole correction lands at once: its end is where the host put the cat.
   */
  private blendIn(dt: number): void {
    if (this.pose === null) return;
    const part = scale(this.pending, blendFraction(this.options.blendPerSecond, dt));
    const applied = this.fits(add(this.pose.pos, part)) ? part : this.pending;
    this.pending = sub(this.pending, applied);
    this.shift(applied);
  }

  /** The host is steering the cat: glide to where it says (or jump, if far), facing as it says. */
  private follow(pose: Pose, dt: number, authoritative: CatState): Pose {
    this.pending = ZERO;
    const gap = sub(authoritative.pos, pose.pos);
    const glide = add(pose.pos, scale(gap, blendFraction(this.options.blendPerSecond, dt)));
    const pos = length(gap) > this.options.snapMetres ? authoritative.pos : glide;
    return { pos, facing: authoritative.facing, moving: authoritative.moving };
  }

  /** Same body rules as movement: inside the house, clear of everything that stops this cat. */
  private fits(pos: Vec2): boolean {
    const inside = clampCircleInside(pos, this.radius, this.world.bounds);
    if (inside.x !== pos.x || inside.z !== pos.z) return false;
    return !overlapsAny(pos, this.radius, this.blockers);
  }
}
