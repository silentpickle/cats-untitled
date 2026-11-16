import type { Rect, Vec2 } from "./types";
import { HALF, circleOverlapsRect, clamp, distance } from "./geometry";

/** Side of one nav cell, metres. */
export const NAV_CELL_SIZE = 0.25;
/** Extra gap kept between a walkable cell centre and the nearest blocker, metres. */
export const NAV_CLEARANCE = 0.05;
/** Returned by cell searches that find nothing. */
export const NOT_FOUND = -1;

/** Which cells of the floor a given cat can stand in. Cells are row-major: index = row * cols + col. */
export interface WalkGrid {
  /** Floor position of the corner of cell 0 (the bounds' min corner). */
  readonly origin: Vec2;
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  /** True when a cat centred on that cell overlaps nothing that blocks it and stays in bounds. */
  readonly walkable: readonly boolean[];
}

export interface Neighbour {
  readonly index: number;
  readonly cost: number;
}

interface Offset {
  readonly dc: number;
  readonly dr: number;
}

const ORTHOGONAL: readonly Offset[] = [
  { dc: 1, dr: 0 },
  { dc: -1, dr: 0 },
  { dc: 0, dr: 1 },
  { dc: 0, dr: -1 },
];

const DIAGONAL: readonly Offset[] = [
  { dc: 1, dr: 1 },
  { dc: 1, dr: -1 },
  { dc: -1, dr: 1 },
  { dc: -1, dr: -1 },
];

export function colOf(grid: WalkGrid, index: number): number {
  return index % grid.cols;
}

export function rowOf(grid: WalkGrid, index: number): number {
  return Math.floor(index / grid.cols);
}

export function cellCenter(grid: WalkGrid, index: number): Vec2 {
  return {
    x: grid.origin.x + (colOf(grid, index) + HALF) * grid.cellSize,
    z: grid.origin.z + (rowOf(grid, index) + HALF) * grid.cellSize,
  };
}

/** The cell containing `pos`, clamped onto the grid. */
export function cellAt(grid: WalkGrid, pos: Vec2): number {
  const col = clamp(Math.floor((pos.x - grid.origin.x) / grid.cellSize), 0, grid.cols - 1);
  const row = clamp(Math.floor((pos.z - grid.origin.z) / grid.cellSize), 0, grid.rows - 1);
  return row * grid.cols + col;
}

function walkableAt(grid: WalkGrid, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return false;
  return grid.walkable[row * grid.cols + col] === true;
}

/** Walkable cells one step away. Diagonals need both side cells free, so paths never cut corners. */
export function neighbours(grid: WalkGrid, index: number): Neighbour[] {
  const col = colOf(grid, index);
  const row = rowOf(grid, index);
  const open = (o: Offset) => walkableAt(grid, col + o.dc, row + o.dr);
  const toNeighbour = (cost: number) => (o: Offset) => ({
    index: (row + o.dr) * grid.cols + col + o.dc,
    cost,
  });
  const straight = ORTHOGONAL.filter(open).map(toNeighbour(grid.cellSize));
  const diagonal = DIAGONAL.filter(
    (o) => open(o) && walkableAt(grid, col + o.dc, row) && walkableAt(grid, col, row + o.dr),
  ).map(toNeighbour(grid.cellSize * Math.SQRT2));
  return [...straight, ...diagonal];
}

/** Index of the cell, among `candidates`, whose centre is nearest `pos`; NOT_FOUND if none. */
export function nearestCell(grid: WalkGrid, pos: Vec2, candidates: readonly number[]): number {
  let best = NOT_FOUND;
  let bestDistance = Infinity;
  for (const index of candidates) {
    const d = distance(pos, cellCenter(grid, index));
    best = d < bestDistance ? index : best;
    bestDistance = Math.min(d, bestDistance);
  }
  return best;
}

export function walkableCells(grid: WalkGrid): number[] {
  return grid.walkable.flatMap((open, index) => (open ? [index] : []));
}

/** Cells within `rings` steps (a square window) of `centre`, clipped to the grid. */
export function cellsAround(grid: WalkGrid, centre: number, rings: number): number[] {
  const col = colOf(grid, centre);
  const row = rowOf(grid, centre);
  const cells: number[] = [];
  for (let r = Math.max(0, row - rings); r <= Math.min(grid.rows - 1, row + rings); r++) {
    for (let c = Math.max(0, col - rings); c <= Math.min(grid.cols - 1, col + rings); c++) {
      cells.push(r * grid.cols + c);
    }
  }
  return cells;
}

function insideBounds(p: Vec2, radius: number, bounds: Rect): boolean {
  return (
    p.x >= bounds.minX + radius &&
    p.x <= bounds.maxX - radius &&
    p.z >= bounds.minZ + radius &&
    p.z <= bounds.maxZ - radius
  );
}

function isWalkable(p: Vec2, radius: number, bounds: Rect, blockers: readonly Rect[]): boolean {
  if (!insideBounds(p, radius, bounds)) return false;
  return !blockers.some((r) => circleOverlapsRect(p, radius + NAV_CLEARANCE, r));
}

/** Marks every cell a circle of `radius` can stand in without touching `blockers`. */
export function buildWalkGrid(bounds: Rect, radius: number, blockers: readonly Rect[]): WalkGrid {
  const cellSize = NAV_CELL_SIZE;
  const cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cellSize));
  const rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cellSize));
  const shape = { origin: { x: bounds.minX, z: bounds.minZ }, cellSize, cols, rows, walkable: [] };
  const walkable = Array.from({ length: cols * rows }, (_, index) =>
    isWalkable(cellCenter(shape, index), radius, bounds, blockers),
  );
  return { ...shape, walkable };
}
