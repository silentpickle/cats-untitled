import type { CatId, Settings, Vec2, WorldDef } from "./types";
import type { WalkGrid } from "./navGrid";
import { buildWalkGrid } from "./navGrid";
import type { DistanceField } from "./distanceField";
import { buildField } from "./distanceField";
import { blockersFor } from "./movement";
import { rectCenter } from "./geometry";

/**
 * Everything the AI needs to find its way around the house as one cat: which cells that cat can stand
 * in, and a precomputed distance field to every nap point, treat spawn and hide spot (keyed by id).
 * Build once per cat per world with `buildNavGrid`; it never changes during a round.
 */
export interface NavGrid extends WalkGrid {
  readonly cat: CatId;
  readonly toNapPoint: ReadonlyMap<string, DistanceField>;
  readonly toTreat: ReadonlyMap<string, DistanceField>;
  readonly toHideSpot: ReadonlyMap<string, DistanceField>;
}

interface Target {
  readonly id: string;
  readonly pos: Vec2;
}

function fieldsTo(grid: WalkGrid, targets: readonly Target[]): ReadonlyMap<string, DistanceField> {
  return new Map(targets.map((t) => [t.id, buildField(grid, t.pos)]));
}

export function buildNavGrid(world: WorldDef, cat: CatId, settings: Settings): NavGrid {
  const grid = buildWalkGrid(world.bounds, settings.cats[cat].radius, blockersFor(world, cat));
  const hideSpots = world.hideSpots.map((s) => ({ id: s.id, pos: rectCenter(s.rect) }));
  return {
    ...grid,
    cat,
    toNapPoint: fieldsTo(grid, world.napPoints),
    toTreat: fieldsTo(grid, world.treatSpawns),
    toHideSpot: fieldsTo(grid, hideSpots),
  };
}
