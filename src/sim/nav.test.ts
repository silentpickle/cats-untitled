import { describe, expect, it } from "vitest";
import type { Vec2 } from "./types";
import { buildNavGrid } from "./nav";
import { cellAt } from "./navGrid";
import { fieldDistance } from "./distanceField";
import { steerAlong } from "./steer";
import { distance, rectCenter } from "./geometry";
import { BOWL, COUCH, TEST_SETTINGS, TEST_WORLD, WALL } from "./testFixtures";

const BROTHER_NAV = buildNavGrid(TEST_WORLD, "brother", TEST_SETTINGS);
const SISTER_NAV = buildNavGrid(TEST_WORLD, "sister", TEST_SETTINGS);
/** West of the wall, level with the bowl on the other side. */
const WEST_OF_WALL: Vec2 = { x: 4, z: 1 };
/** The detour over the wall's top end is at least this many metres longer than flying straight. */
const DETOUR_METRES = 4;

describe("nav", () => {
  it("wall_cells_blocked_for_both", () => {
    const wallCell = cellAt(BROTHER_NAV, rectCenter(WALL));
    expect(BROTHER_NAV.walkable[wallCell]).toBe(false);
    expect(SISTER_NAV.walkable[wallCell]).toBe(false);
  });

  it("couch_walkable_for_sister_only", () => {
    const couchCell = cellAt(BROTHER_NAV, rectCenter(COUCH));
    expect(BROTHER_NAV.walkable[couchCell]).toBe(false);
    expect(SISTER_NAV.walkable[couchCell]).toBe(true);
  });

  it("fields_built_for_every_target", () => {
    expect([...BROTHER_NAV.toNapPoint.keys()]).toEqual(TEST_WORLD.napPoints.map((p) => p.id));
    expect([...SISTER_NAV.toTreat.keys()]).toEqual(TEST_WORLD.treatSpawns.map((t) => t.id));
    expect([...SISTER_NAV.toHideSpot.keys()]).toEqual(TEST_WORLD.hideSpots.map((s) => s.id));
  });

  it("path_goes_around_wall", () => {
    const field = BROTHER_NAV.toNapPoint.get("bowl");
    expect(field).toBeDefined();
    if (field === undefined) return;
    const walk = fieldDistance(BROTHER_NAV, field, WEST_OF_WALL);
    expect(walk).toBeGreaterThan(distance(WEST_OF_WALL, BOWL) + DETOUR_METRES);
    const heading = steerAlong(BROTHER_NAV, field, WEST_OF_WALL);
    expect(heading.z).toBeGreaterThan(0);
  });
});
