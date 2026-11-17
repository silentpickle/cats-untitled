import type { CatState, GameState, NapPointState, Vec2 } from "../sim/types";

const FULL_TURN = Math.PI + Math.PI;

function lerp(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}

function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) };
}

/** An angle brought into [-π, π). */
function wrapAngle(a: number): number {
  return a - FULL_TURN * Math.floor((a + Math.PI) / FULL_TURN);
}

/** Blends two headings the short way round, so 3.0 to -3.0 passes through π rather than 0. */
export function lerpAngle(from: number, to: number, t: number): number {
  return wrapAngle(from + wrapAngle(to - from) * t);
}

/** A cat between two snapshots: position and facing blend; everything else is the newer snapshot's. */
function blendCat(from: CatState, to: CatState, t: number): CatState {
  return { ...to, pos: lerpVec(from.pos, to.pos, t), facing: lerpAngle(from.facing, to.facing, t) };
}

/** A meter only blends while the same cat holds and fills it in both snapshots. */
function blendPoint(from: NapPointState | undefined, to: NapPointState, t: number): NapPointState {
  if (from?.owner !== to.owner || from.capturer !== to.capturer) return to;
  return { ...to, progress: lerp(from.progress, to.progress, t) };
}

function blendBetween(from: GameState, to: GameState, t: number): GameState {
  const fromPoints = new Map(from.points.map((p) => [p.id, p]));
  return {
    ...to,
    timeLeft: lerp(from.timeLeft, to.timeLeft, t),
    cats: {
      brother: blendCat(from.cats.brother, to.cats.brother, t),
      sister: blendCat(from.cats.sister, to.cats.sister, t),
    },
    points: to.points.map((p) => blendPoint(fromPoints.get(p.id), p, t)),
    events: [],
  };
}

/**
 * What to draw `t` of the way (clamped to 0..1) from one host snapshot to the next. Positions, facings,
 * the clock and nap meters blend; every discrete field (phase, timers, scores, owners, treats, knockables,
 * mischief) is `to`'s. At the ends (and for a NaN `t`, read as 0) it is exactly `from` or `to`.
 * `events` is always empty: events are played once, when their snapshot arrives.
 */
export function interpolateState(from: GameState, to: GameState, t: number): GameState {
  if (!(t > 0)) return { ...from, events: [] };
  if (t >= 1) return { ...to, events: [] };
  return blendBetween(from, to, t);
}
