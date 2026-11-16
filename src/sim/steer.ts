import type { Vec2 } from "./types";
import type { WalkGrid } from "./navGrid";
import { NOT_FOUND, cellAt, cellCenter, neighbours } from "./navGrid";
import type { DistanceField } from "./distanceField";
import { entryCell, fieldAt } from "./distanceField";
import { add, directionTo, distance, scale, sub, HALF, ZERO } from "./geometry";

/** How many cells down the path to look for the furthest one in a straight, clear line. */
const LOOKAHEAD_CELLS = 6;

/** The neighbour one step closer to the goal, or the cell itself at the goal. */
function downhill(grid: WalkGrid, field: DistanceField, index: number): number {
  let best = index;
  for (const n of neighbours(grid, index)) {
    best = fieldAt(field, n.index) < fieldAt(field, best) ? n.index : best;
  }
  return best;
}

/** True when every point sampled along a→b (every half cell) lies in a walkable cell. */
export function clearLine(grid: WalkGrid, a: Vec2, b: Vec2): boolean {
  const samples = Math.ceil(distance(a, b) / (grid.cellSize * HALF));
  const delta = sub(b, a);
  for (let i = 1; i <= samples; i++) {
    const p = add(a, scale(delta, i / samples));
    if (grid.walkable[cellAt(grid, p)] !== true) return false;
  }
  return true;
}

/** Furthest cell centre along the path (up to the lookahead) that `from` can walk to in a line. */
function lookahead(grid: WalkGrid, field: DistanceField, from: Vec2, start: number): Vec2 {
  let cell = downhill(grid, field, start);
  let aim = cellCenter(grid, cell);
  for (let i = 1; i < LOOKAHEAD_CELLS; i++) {
    cell = downhill(grid, field, cell);
    const next = cellCenter(grid, cell);
    if (!clearLine(grid, from, next)) return aim;
    aim = next;
  }
  return aim;
}

/**
 * Unit direction to walk from `from` to follow the field to its target. In the goal cell it heads
 * straight for the target. A cat standing off the walkable cells (pressed against furniture) plans
 * from the nearest reachable cell instead. Zero when the target cannot be reached.
 */
export function steerAlong(grid: WalkGrid, field: DistanceField, from: Vec2): Vec2 {
  const cell = entryCell(grid, field, from);
  if (cell === NOT_FOUND) return ZERO;
  if (fieldAt(field, cell) === 0) return directionTo(from, field.target);
  const eye = cell === cellAt(grid, from) ? from : cellCenter(grid, cell);
  return directionTo(from, lookahead(grid, field, eye, cell));
}
