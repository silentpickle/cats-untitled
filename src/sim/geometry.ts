import type { Rect, Vec2 } from "./types";

export const ZERO: Vec2 = { x: 0, z: 0 };
export const HALF = 0.5;

export function vec(x: number, z: number): Vec2 {
  return { x, z };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, z: a.z + b.z };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, z: a.z - b.z };
}

export function scale(v: Vec2, k: number): Vec2 {
  return { x: v.x * k, z: v.z * k };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.z * b.z;
}

export function length(v: Vec2): number {
  return Math.hypot(v.x, v.z);
}

export function distance(a: Vec2, b: Vec2): number {
  return length(sub(a, b));
}

/** Unit vector in the direction of `v`, or zero when `v` has no length. */
export function normalize(v: Vec2): Vec2 {
  const len = length(v);
  return len > 0 ? scale(v, 1 / len) : ZERO;
}

/** Unit vector from `from` toward `to`, or zero when they coincide. */
export function directionTo(from: Vec2, to: Vec2): Vec2 {
  return normalize(sub(to, from));
}

export function clampLength(v: Vec2, max: number): Vec2 {
  const len = length(v);
  return len > max ? scale(v, max / len) : v;
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Replaces non-finite components with zero so bad input can never poison positions. */
export function finiteVec(v: Vec2): Vec2 {
  return { x: Number.isFinite(v.x) ? v.x : 0, z: Number.isFinite(v.z) ? v.z : 0 };
}

/** Radians, 0 faces +z, increasing toward +x. */
export function headingOf(v: Vec2): number {
  return Math.atan2(v.x, v.z);
}

/** Unit vector a cat with this heading faces. */
export function headingVector(heading: number): Vec2 {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

export function pointInRect(p: Vec2, r: Rect): boolean {
  return p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
}

export function rectCenter(r: Rect): Vec2 {
  return { x: (r.minX + r.maxX) * HALF, z: (r.minZ + r.maxZ) * HALF };
}

/** True when a circle overlaps a rect; touching edges does not count. */
export function circleOverlapsRect(centre: Vec2, radius: number, r: Rect): boolean {
  const dx = centre.x - clamp(centre.x, r.minX, r.maxX);
  const dz = centre.z - clamp(centre.z, r.minZ, r.maxZ);
  return dx * dx + dz * dz < radius * radius;
}

/** Clamps a circle's centre so the whole circle stays inside the rect. */
export function clampCircleInside(centre: Vec2, radius: number, r: Rect): Vec2 {
  return {
    x: clamp(centre.x, r.minX + radius, r.maxX - radius),
    z: clamp(centre.z, r.minZ + radius, r.maxZ - radius),
  };
}
