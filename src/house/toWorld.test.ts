import { describe, expect, it } from "vitest";
import { MAIN_FLOOR } from "./mainFloor";
import { furnitureRect, platformHeightAt, toWorld } from "./toWorld";
import { loadSettings } from "../config";
import { buildNavGrid } from "../sim";
import { buildField, fieldDistance } from "../sim/distanceField";
import { cellCenter } from "../sim/navGrid";
import { CAT_IDS, type CatId, type Rect, type Vec2, type WorldDef } from "../sim/types";

const COUCH_SEAT_HEIGHT = 0.42;
const COUCH_X = 6.45;
const COUCH_Z = 2.4;
const OPEN_FLOOR_X = 5.2;
const OPEN_FLOOR_Z = 5.2;

/** How far the nearest standable spot may be from a ring or treat and still count as reaching it. */
const REACH_METRES = 0.5;

interface Walk {
  /** Metres to walk from the cat's spawn; Infinity when no route exists. */
  readonly route: number;
  /** Metres left between where the walk ends and the spot itself. */
  readonly gap: number;
}

function walkFromSpawn(world: WorldDef, cat: CatId, to: Vec2): Walk {
  const grid = buildNavGrid(world, cat, loadSettings().sim);
  const field = buildField(grid, to);
  const end = cellCenter(grid, field.goalCell);
  return {
    route: fieldDistance(grid, field, world.spawn[cat]),
    gap: Math.hypot(end.x - to.x, end.z - to.z),
  };
}

function inside(rect: Rect, pos: Vec2): boolean {
  return pos.x > rect.minX && pos.x < rect.maxX && pos.z > rect.minZ && pos.z < rect.maxZ;
}

describe("main floor world", () => {
  const world = toWorld(MAIN_FLOOR);

  it("nap_points_are_reachable_by_the_brother", () => {
    for (const point of world.napPoints) {
      const blockers = world.obstacles.filter((o) => inside(o.rect, point.pos));
      expect(blockers, point.id).toEqual([]);
    }
  });

  it("both_cats_can_walk_to_every_nap_point", () => {
    for (const cat of CAT_IDS) {
      for (const point of world.napPoints) {
        const walk = walkFromSpawn(world, cat, point.pos);
        expect(walk.route, `${cat} to ${point.id}`).toBeLessThan(Infinity);
        expect(walk.gap, `${cat} to ${point.id}`).toBeLessThan(REACH_METRES);
      }
    }
  });

  it("the_sister_can_walk_to_every_treat", () => {
    for (const treat of world.treatSpawns) {
      const walk = walkFromSpawn(world, "sister", treat.pos);
      expect(walk.route, treat.id).toBeLessThan(Infinity);
      expect(walk.gap, treat.id).toBeLessThan(REACH_METRES);
    }
  });

  it("spawns_are_clear_of_obstacles", () => {
    for (const pos of [world.spawn.brother, world.spawn.sister]) {
      expect(world.obstacles.filter((o) => inside(o.rect, pos))).toEqual([]);
    }
  });

  it("treats_are_reachable_by_the_sister", () => {
    for (const treat of world.treatSpawns) {
      const blockers = world.obstacles.filter(
        (o) => o.blocks === "both" && inside(o.rect, treat.pos),
      );
      expect(blockers, treat.id).toEqual([]);
    }
  });

  it("hide_spots_match_brother_only_furniture", () => {
    const hideIds = world.hideSpots.map((spot) => spot.id).sort();
    const expected = MAIN_FLOOR.furniture
      .filter((item) => item.hide === true)
      .map((item) => item.id)
      .sort();
    expect(hideIds).toEqual(expected);
    for (const item of MAIN_FLOOR.furniture.filter((f) => f.hide === true)) {
      expect(item.blocks, item.id).toBe("brother");
      expect(world.hideSpots.find((s) => s.id === item.id)?.rect).toEqual(furnitureRect(item));
    }
  });

  it("couch_raises_the_cat_and_open_floor_does_not", () => {
    expect(platformHeightAt(MAIN_FLOOR, COUCH_X, COUCH_Z)).toBe(COUCH_SEAT_HEIGHT);
    expect(platformHeightAt(MAIN_FLOOR, OPEN_FLOOR_X, OPEN_FLOOR_Z)).toBe(0);
  });
});
