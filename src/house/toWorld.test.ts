import { describe, expect, it } from "vitest";
import { MAIN_FLOOR } from "./mainFloor";
import { furnitureRect, platformHeightAt, toWorld } from "./toWorld";
import type { Rect, Vec2 } from "../sim/types";

const COUCH_SEAT_HEIGHT = 0.42;
const COUCH_X = 9.4;
const COUCH_Z = 2.6;
const OPEN_FLOOR_X = 4.3;
const OPEN_FLOOR_Z = 3.5;

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
