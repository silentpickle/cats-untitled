import type { Vec2 } from "./types";
import type { WalkGrid } from "./navGrid";
import { NOT_FOUND, cellAt, cellCenter, nearestCell, walkableCells } from "./navGrid";
import type { DistanceField } from "./distanceField";
import { buildField, fieldAt } from "./distanceField";
import { steerAlong } from "./steer";
import { ZERO, distance } from "./geometry";

/** Close enough to a tapped spot to stop; a little more than the fastest cat moves in one step. */
export const WALK_ARRIVE_METRES = 0.1;

/** A place the player asked their cat to walk to, with the route there already worked out. */
export interface WalkGoal {
  readonly target: Vec2;
  readonly field: DistanceField;
}

/** Cells the cat can walk to from `from`, judged by a field built outward from where it stands. */
function reachableFrom(grid: WalkGrid, from: Vec2): number[] {
  const fromCat = buildField(grid, from);
  return walkableCells(grid).filter((index) => Number.isFinite(fieldAt(fromCat, index)));
}

/**
 * Plans a walk from `from` to `to` for the cat this grid was built for. A spot the cat cannot get to
 * (inside furniture, outside the house, behind a closed door) becomes the nearest spot it can, so the
 * cat never heads straight at somewhere it has no route to. Undefined if it can reach nowhere.
 */
export function planWalk(grid: WalkGrid, from: Vec2, to: Vec2): WalkGoal | undefined {
  const reachable = reachableFrom(grid, from);
  const tapped = cellAt(grid, to);
  const goalCell = reachable.includes(tapped) ? tapped : nearestCell(grid, to, reachable);
  if (goalCell === NOT_FOUND) return undefined;
  const target = goalCell === tapped ? to : cellCenter(grid, goalCell);
  return { target, field: buildField(grid, target) };
}

/** The direction to walk this step, or zero once the cat has arrived (or cannot get there). */
export function walkInput(grid: WalkGrid, goal: WalkGoal, from: Vec2): Vec2 {
  if (distance(from, goal.target) <= WALK_ARRIVE_METRES) return ZERO;
  return steerAlong(grid, goal.field, from);
}
