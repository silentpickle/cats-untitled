import { describe, expect, it } from "vitest";
import { loadSettings } from "../config";
import { MAIN_FLOOR } from "./mainFloor";
import { toWorld } from "./toWorld";
import { buildNavGrid, type NavGrid } from "../sim";
import { blockersFor, moveCircle, overlapsAny } from "../sim/movement";
import { cellCenter } from "../sim/navGrid";
import { fieldAt, type DistanceField } from "../sim/distanceField";
import { steerAlong } from "../sim/steer";
import { CAT_IDS, type CatId, type Vec2 } from "../sim/types";

const STEPS_PER_SECOND = 60;
/** Longest walk allowed: well over the length of the house at the slower cat's speed. */
const MAX_WALK_SECONDS = 40;
/** Every this many cells is tried as a starting point. */
const CELL_STRIDE = 23;
/** The scan walks thousands of routes, so it gets longer than the default test timeout. */
const SCAN_TIMEOUT_MS = 60000;
/** A start slid off its cell centre, so cats pressed against furniture are covered too. */
const SLIDE: Vec2 = { x: 0.1, z: -0.1 };
/** Decimal places when naming a start in a failure message. */
const DIGITS = 2;
const ARRIVED_METRES = 0.25;

const world = toWorld(MAIN_FLOOR);
const settings = loadSettings().sim;

/** Walks from `from` toward the nap point by steering alone; returns the metres left. */
function walkGap(cat: CatId, nav: NavGrid, from: Vec2, field: DistanceField): number {
  const { speed, radius } = settings.cats[cat];
  const body = { radius, bounds: world.bounds, blockers: blockersFor(world, cat) };
  const stride = speed / STEPS_PER_SECOND;
  let pos = from;
  for (let i = 0; i < MAX_WALK_SECONDS * STEPS_PER_SECOND; i++) {
    const d = steerAlong(nav, field, pos);
    pos = moveCircle(pos, { x: d.x * stride, z: d.z * stride }, body);
    if (Math.hypot(pos.x - field.target.x, pos.z - field.target.z) < ARRIVED_METRES) break;
  }
  return Math.hypot(pos.x - field.target.x, pos.z - field.target.z);
}

/** Nap points the cat cannot walk to from cell `i` (a start slid off the cell centre). */
function stuckFrom(cat: CatId, nav: NavGrid, i: number): string[] {
  const centre = cellCenter(nav, i);
  const start = { x: centre.x + SLIDE.x, z: centre.z + SLIDE.z };
  const radius = settings.cats[cat].radius;
  if (nav.walkable[i] !== true || overlapsAny(start, radius, blockersFor(world, cat))) return [];
  return [...nav.toNapPoint]
    .filter(([, field]) => Number.isFinite(fieldAt(field, i)))
    .filter(([, field]) => walkGap(cat, nav, start, field) > settings.capture.radius)
    .map(([id]) => `${cat} ${id} from ${start.x.toFixed(DIGITS)},${start.z.toFixed(DIGITS)}`);
}

function stuckStarts(cat: CatId): string[] {
  const nav = buildNavGrid(world, cat, settings);
  const starts = Array.from(
    { length: Math.ceil(nav.walkable.length / CELL_STRIDE) },
    (_, n) => n * CELL_STRIDE,
  );
  return starts.flatMap((i) => stuckFrom(cat, nav, i));
}

/** Where Arwen used to stop dead, in the nook by the second bath, and where she was headed. */
const BATH_NOOK: Vec2 = { x: 9.13, z: 6.63 };

describe("walking anywhere in the house", () => {
  for (const cat of CAT_IDS) {
    it(
      `W1_${cat}_never_stuck`,
      () => {
        expect(stuckStarts(cat)).toEqual([]);
      },
      SCAN_TIMEOUT_MS,
    );
  }

  it(
    "W2_sister_leaves_bath_nook",
    () => {
      const nav = buildNavGrid(world, "sister", settings);
      const field = nav.toNapPoint.get("sunbeam");
      expect(field).toBeDefined();
      if (field === undefined) return;
      expect(walkGap("sister", nav, BATH_NOOK, field)).toBeLessThan(settings.capture.radius);
    },
    SCAN_TIMEOUT_MS,
  );
});
