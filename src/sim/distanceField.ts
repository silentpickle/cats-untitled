import type { Vec2 } from "./types";
import { MinHeap } from "./heap";
import type { HeapItem } from "./heap";
import type { WalkGrid } from "./navGrid";
import {
  NOT_FOUND,
  cellAt,
  cellCenter,
  cellsAround,
  nearestCell,
  neighbours,
  walkableCells,
} from "./navGrid";
import { distance } from "./geometry";

/** How many cells around a cat to look for a reachable cell before scanning the whole grid. */
const REJOIN_SEARCH_RINGS = 4;

/** Shortest walking distance from every cell to one target, built once with Dijkstra. */
export interface DistanceField {
  /** Where the field leads: a nap point, treat, or hide spot centre. */
  readonly target: Vec2;
  /** The walkable cell nearest the target, where `dist` is 0; NOT_FOUND if nothing is walkable. */
  readonly goalCell: number;
  /** Metres along the grid from each cell to the goal cell; Infinity where unreachable. */
  readonly dist: readonly number[];
}

function relax(grid: WalkGrid, dist: number[], heap: MinHeap, from: HeapItem): void {
  for (const n of neighbours(grid, from.index)) {
    const d = from.priority + n.cost;
    if (d >= (dist[n.index] ?? Infinity)) continue;
    dist[n.index] = d;
    heap.push({ index: n.index, priority: d });
  }
}

/** Dijkstra outward from the walkable cell nearest `target`. */
export function buildField(grid: WalkGrid, target: Vec2): DistanceField {
  const goalCell = nearestCell(grid, target, walkableCells(grid));
  const dist = new Array<number>(grid.walkable.length).fill(Infinity);
  if (goalCell === NOT_FOUND) return { target, goalCell, dist };
  dist[goalCell] = 0;
  const heap = new MinHeap();
  heap.push({ index: goalCell, priority: 0 });
  for (let item = heap.pop(); item !== undefined; item = heap.pop()) {
    if (item.priority > (dist[item.index] ?? Infinity)) continue;
    relax(grid, dist, heap, item);
  }
  return { target, goalCell, dist };
}

export function fieldAt(field: DistanceField, index: number): number {
  return field.dist[index] ?? Infinity;
}

function reachable(field: DistanceField, cells: readonly number[]): number[] {
  return cells.filter((index) => Number.isFinite(fieldAt(field, index)));
}

/**
 * The reachable cell to path from when standing at `pos`. Usually the cell underfoot; a cat pressed
 * against furniture stands in a cell too close to it to be walkable, so use the walkable cell nearest
 * it. If that cell is cut off from the target the cat has no way there (NOT_FOUND): jumping to a
 * reachable cell on the far side of a wall would send it into furniture it cannot get past. Only a cat
 * with no walkable cell around it at all (placed inside furniture) searches the whole floor.
 */
export function entryCell(grid: WalkGrid, field: DistanceField, pos: Vec2): number {
  const here = cellAt(grid, pos);
  if (Number.isFinite(fieldAt(field, here))) return here;
  const open = cellsAround(grid, here, REJOIN_SEARCH_RINGS).filter(
    (i) => grid.walkable[i] === true,
  );
  if (open.length === 0) return nearestCell(grid, pos, reachable(field, walkableCells(grid)));
  const nearest = nearestCell(grid, pos, open);
  return Number.isFinite(fieldAt(field, nearest)) ? nearest : NOT_FOUND;
}

/** Walking distance in metres from `pos` to the field's goal; Infinity if it cannot be reached. */
export function fieldDistance(grid: WalkGrid, field: DistanceField, pos: Vec2): number {
  const cell = entryCell(grid, field, pos);
  if (cell === NOT_FOUND) return Infinity;
  return fieldAt(field, cell) + distance(pos, cellCenter(grid, cell));
}
