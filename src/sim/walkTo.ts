import type { Vec2 } from "./types";
import type { WalkGrid } from "./navGrid";
import { NOT_FOUND, cellAt, cellCenter } from "./navGrid";
import type { DistanceField } from "./distanceField";
import { buildField } from "./distanceField";
import { steerAlong } from "./steer";
import { ZERO, distance } from "./geometry";

/** Close enough to a tapped spot to stop; a little more than the fastest cat moves in one step. */
export const WALK_ARRIVE_METRES = 0.1;

/** A place the player asked their cat to walk to, with the route there already worked out. */
export interface WalkGoal {
  readonly target: Vec2;
  readonly field: DistanceField;
}

/**
 * Plans a walk to `to` for the cat this grid was built for. A spot the cat cannot stand on (inside
 * furniture, outside the house) becomes the nearest spot it can. Undefined if it can stand nowhere.
 */
export function planWalk(grid: WalkGrid, to: Vec2): WalkGoal | undefined {
  const field = buildField(grid, to);
  if (field.goalCell === NOT_FOUND) return undefined;
  const standable = grid.walkable[cellAt(grid, to)] === true;
  const target = standable ? to : cellCenter(grid, field.goalCell);
  return { target, field: { ...field, target } };
}

/** The direction to walk this step, or zero once the cat has arrived (or cannot get there). */
export function walkInput(grid: WalkGrid, goal: WalkGoal, from: Vec2): Vec2 {
  if (distance(from, goal.target) <= WALK_ARRIVE_METRES) return ZERO;
  return steerAlong(grid, goal.field, from);
}
