import type { NapPointPlacement } from "../house/types";
import type { Vec2 } from "../sim/types";

/** A tap this close to a nap ring's centre counts as a tap on the ring. */
export const RING_SNAP_METRES = 0.75;

/** Where a tap's line of sight crosses a horizontal plane at `height`, or null if it never does. */
export type GroundAt = (height: number) => Vec2 | null;

function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function tappedRing(groundAt: GroundAt, points: readonly NapPointPlacement[]): Vec2 | null {
  for (const point of points) {
    const hit = groundAt(point.height);
    if (hit !== null && distanceBetween(hit, point.pos) <= RING_SNAP_METRES) {
      return point.pos;
    }
  }
  return null;
}

/**
 * Turns a tap into a place to walk. A tap on a nap ring goes to the ring's centre, judged at the
 * ring's own height so the rings on the couch and counter work; anything else is a spot on the floor.
 */
export function pickGoal(groundAt: GroundAt, points: readonly NapPointPlacement[]): Vec2 | null {
  return tappedRing(groundAt, points) ?? groundAt(0);
}
