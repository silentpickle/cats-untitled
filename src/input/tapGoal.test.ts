import { describe, expect, it } from "vitest";
import type { NapPointPlacement } from "../house/types";
import type { Vec2 } from "../sim/types";
import { RING_SNAP_METRES, pickGoal, type GroundAt } from "./tapGoal";

const COUNTER_HEIGHT = 0.95;
/** Metres the line of sight drifts north for each metre it drops, as with a camera to the south. */
const DRIFT_PER_METRE = 0.8;
const NUDGE = 0.01;

const FLOOR_RING: NapPointPlacement = { id: "rug", name: "Rug", pos: { x: 2, z: 2 }, height: 0 };
const COUNTER_RING: NapPointPlacement = {
  id: "bed",
  name: "Bed",
  pos: { x: 6, z: 5 },
  height: COUNTER_HEIGHT,
};
const POINTS = [FLOOR_RING, COUNTER_RING];

/** A line of sight that reaches the floor at `floorHit`, slanting away from the camera. */
function sightLine(floorHit: Vec2): GroundAt {
  return (height) => ({ x: floorHit.x, z: floorHit.z + height * DRIFT_PER_METRE });
}

/** The floor position seen "through" a spot at the given height. */
function floorBehind(spot: Vec2, height: number): Vec2 {
  return { x: spot.x, z: spot.z - height * DRIFT_PER_METRE };
}

describe("turning a tap into a place to walk", () => {
  it("tap_on_open_floor_goes_exactly_there", () => {
    const tap = { x: 8, z: 1 };
    expect(pickGoal(sightLine(tap), POINTS)).toEqual(tap);
  });

  it("tap_at_the_edge_of_a_floor_ring_snaps_to_its_centre", () => {
    const edge = { x: FLOOR_RING.pos.x + RING_SNAP_METRES, z: FLOOR_RING.pos.z };
    expect(pickGoal(sightLine(edge), POINTS)).toEqual(FLOOR_RING.pos);
  });

  it("tap_just_past_a_ring_does_not_snap", () => {
    const past = { x: FLOOR_RING.pos.x + RING_SNAP_METRES + NUDGE, z: FLOOR_RING.pos.z };
    expect(pickGoal(sightLine(past), POINTS)).toEqual(past);
  });

  it("tap_on_a_raised_ring_snaps_even_though_the_floor_behind_it_is_far_away", () => {
    const seenThrough = floorBehind(COUNTER_RING.pos, COUNTER_HEIGHT);
    expect(Math.abs(seenThrough.z - COUNTER_RING.pos.z)).toBeGreaterThan(RING_SNAP_METRES);
    expect(pickGoal(sightLine(seenThrough), POINTS)).toEqual(COUNTER_RING.pos);
  });

  it("tap_that_misses_the_ground_gives_nothing", () => {
    expect(pickGoal(() => null, POINTS)).toBeNull();
  });
});
