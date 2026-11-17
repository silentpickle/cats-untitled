import { describe, expect, it } from "vitest";
import { loadSettings } from "../config";
import { MAIN_FLOOR } from "../house/mainFloor";
import { toWorld } from "../house/toWorld";
import { SIM_STEP } from "../play/localMatch";
import { createGame } from "../sim";
import { ZERO, add, distance, scale, vec } from "../sim/geometry";
import { blockersFor, moveOneCat, overlapsAny } from "../sim/movement";
import type { CatState, Vec2 } from "../sim/types";
import { HISTORY_LIMIT, OwnCatPredictor, type PredictOptions } from "./predict";

const FRAME = SIM_STEP;
const LONG_FRAME = 0.1;
const PRECISION_DIGITS = 9;
const SETTLED_DIGITS = 3;
const FRAMES_TO_SETTLE = 60;
const FRAMES_OF_WALKING = 30;
const SNAPSHOT_EVERY_FRAMES = 3;
const ACK_LAG_FRAMES = 12;
const STUN_SECONDS = 1;
const FLEE_SECONDS = 2;
const SECOND_INPUT = 2;

const DEAD_ZONE = 0.25;
const SNAP = 1.5;
const BLEND_PER_SECOND = 8;
const OPTIONS: PredictOptions = {
  deadZoneMetres: DEAD_ZONE,
  snapMetres: SNAP,
  blendPerSecond: BLEND_PER_SECOND,
};
/** Exactly representable distances, so the edge tests compare exact numbers. */
const JUST_PAST_DEAD_ZONE = 0.3125;
const MEDIUM_ERROR = 0.5;
const FOLLOW_GAP = 1;
const LARGE_ERROR = 2;

const EAST: Vec2 = { x: 1, z: 0 };
const WEST: Vec2 = { x: -1, z: 0 };
/** Open floor in the real house with a few metres clear to the east and west, for both cats. */
const START: Vec2 = { x: 4, z: 10.75 };
/** West of the wall at x 7 (between the rooms at the north), and a spot just east of it. */
const WEST_OF_WALL: Vec2 = { x: 6.25, z: 1.5 };
const EAST_OF_WALL: Vec2 = { x: 7.5, z: 1.5 };

const world = toWorld(MAIN_FLOOR);
const sim = loadSettings().sim;
const BROTHER = sim.cats.brother;

function hostCat(pos: Vec2, patch: Partial<CatState> = {}): CatState {
  return { ...createGame(world, sim).cats.brother, pos, ...patch };
}

function east(metres: number): Vec2 {
  return add(START, vec(metres, 0));
}

function predictorAt(pos: Vec2): OwnCatPredictor {
  const predictor = new OwnCatPredictor("brother", world, sim, OPTIONS);
  predictor.reset(hostCat(pos));
  return predictor;
}

/** Draws one frame with no input, so only corrections can move the cat. */
function idleFrame(p: OwnCatPredictor, dt: number = FRAME): Vec2 {
  return p.advance(dt, ZERO, hostCat(START)).pos;
}

/** Sends input 1 from where the prediction stands, then hears the host put the cat at `hostPos`. */
function hostSays(p: OwnCatPredictor, hostPos: Vec2): void {
  p.sent(1);
  p.reconcile(1, hostCat(hostPos));
}

/** Where the host has the cat after each number of frames of walking east from START. */
function hostTrack(frames: number): Vec2[] {
  const track: Vec2[] = [START];
  let cat = hostCat(START);
  for (let i = 0; i < frames; i++) {
    cat = moveOneCat(cat, EAST, FRAME, world, sim);
    track.push(cat.pos);
  }
  return track;
}

describe("OwnCatPredictor", () => {
  it("moves_on_input_at_once", () => {
    const p = predictorAt(START);
    const drawn = p.advance(FRAME, EAST, hostCat(START));
    const expected = moveOneCat(hostCat(START), EAST, FRAME, world, sim);
    expect(drawn.pos).toEqual(expected.pos);
    expect(drawn.moving).toBe(true);
    expect(drawn.facing).toBe(expected.facing);
    expect(drawn.pos.x).toBeCloseTo(START.x + BROTHER.speed * FRAME, PRECISION_DIGITS);
  });

  it("starts_from_host_without_reset", () => {
    const p = new OwnCatPredictor("brother", world, sim, OPTIONS);
    const drawn = p.advance(0, EAST, hostCat(START));
    expect(drawn.pos).toEqual(START);
  });

  it("returns_host_cat_with_predicted_pose", () => {
    const p = predictorAt(START);
    const host = hostCat(START, { score: LARGE_ERROR, swatCooldown: FOLLOW_GAP });
    const drawn = p.advance(FRAME, EAST, host);
    expect({ ...drawn, pos: host.pos, facing: host.facing, moving: host.moving }).toEqual(host);
  });

  it("host_agrees_no_correction", () => {
    const frames = FRAMES_TO_SETTLE;
    const track = hostTrack(frames);
    const p = predictorAt(START);
    let drawn = START;
    for (let seq = 1; seq <= frames; seq++) {
      p.sent(seq);
      drawn = p.advance(FRAME, EAST, hostCat(START)).pos;
      const ack = seq - ACK_LAG_FRAMES;
      if (ack > 0 && seq % SNAPSHOT_EVERY_FRAMES === 0) {
        // Input `ack` was sent when the cat had walked ack - 1 frames.
        p.reconcile(ack, hostCat(track[ack - 1] ?? START));
      }
    }
    expect(drawn).toEqual(track[frames]);
  });

  it("error_at_dead_zone_ignored", () => {
    const p = predictorAt(START);
    hostSays(p, east(DEAD_ZONE));
    expect(idleFrame(p)).toEqual(START);
  });

  it("error_past_dead_zone_blended", () => {
    const p = predictorAt(START);
    hostSays(p, east(JUST_PAST_DEAD_ZONE));
    expect(idleFrame(p).x).toBeGreaterThan(START.x);
  });

  it("medium_error_blended_without_jump", () => {
    const p = predictorAt(START);
    const target = east(MEDIUM_ERROR);
    hostSays(p, target);
    const first = idleFrame(p);
    const share = 1 - Math.exp(-BLEND_PER_SECOND * FRAME);
    expect(first.x).toBeCloseTo(START.x + MEDIUM_ERROR * share, PRECISION_DIGITS);
    let gap = distance(first, target);
    for (let i = 1; i < FRAMES_TO_SETTLE; i++) {
      const next = distance(idleFrame(p), target);
      expect(next).toBeLessThan(gap);
      gap = next;
    }
    expect(gap).toBeCloseTo(0, SETTLED_DIGITS);
  });

  it("error_at_snap_blended", () => {
    const p = predictorAt(START);
    hostSays(p, east(SNAP));
    expect(idleFrame(p, 0)).toEqual(START);
  });

  it("large_error_snaps", () => {
    const p = predictorAt(START);
    hostSays(p, east(LARGE_ERROR));
    expect(idleFrame(p, 0)).toEqual(east(LARGE_ERROR));
  });

  it("repeated_error_not_double_counted", () => {
    const p = predictorAt(START);
    p.sent(1);
    p.sent(SECOND_INPUT);
    p.reconcile(1, hostCat(east(MEDIUM_ERROR)));
    p.reconcile(SECOND_INPUT, hostCat(east(MEDIUM_ERROR)));
    let drawn = START;
    for (let i = 0; i < FRAMES_TO_SETTLE; i++) drawn = idleFrame(p);
    expect(drawn.x).toBeCloseTo(START.x + MEDIUM_ERROR, SETTLED_DIGITS);
  });

  it("blended_correction_not_reapplied", () => {
    const p = predictorAt(START);
    p.sent(1);
    p.sent(SECOND_INPUT);
    p.reconcile(1, hostCat(east(MEDIUM_ERROR)));
    for (let i = 0; i < FRAMES_TO_SETTLE; i++) idleFrame(p);
    p.reconcile(SECOND_INPUT, hostCat(east(MEDIUM_ERROR)));
    let drawn = START;
    for (let i = 0; i < FRAMES_TO_SETTLE; i++) drawn = idleFrame(p);
    expect(drawn.x).toBeCloseTo(START.x + MEDIUM_ERROR, SETTLED_DIGITS);
  });

  it("snapped_correction_not_reapplied", () => {
    const p = predictorAt(START);
    p.sent(1);
    p.sent(SECOND_INPUT);
    p.reconcile(1, hostCat(east(LARGE_ERROR)));
    p.reconcile(SECOND_INPUT, hostCat(east(LARGE_ERROR)));
    expect(idleFrame(p, 0)).toEqual(east(LARGE_ERROR));
  });

  it("correction_never_stops_in_wall", () => {
    const p = predictorAt(WEST_OF_WALL);
    hostSays(p, EAST_OF_WALL);
    const share = 1 - Math.exp(-BLEND_PER_SECOND * LONG_FRAME);
    const partWay = add(WEST_OF_WALL, scale(vec(EAST_OF_WALL.x - WEST_OF_WALL.x, 0), share));
    expect(overlapsAny(partWay, BROTHER.radius, blockersFor(world, "brother"))).toBe(true);
    expect(p.advance(LONG_FRAME, ZERO, hostCat(WEST_OF_WALL)).pos).toEqual(EAST_OF_WALL);
  });

  it("stunned_follows_host", () => {
    const p = predictorAt(START);
    const host = hostCat(east(FOLLOW_GAP), { stunnedFor: STUN_SECONDS });
    const drawn = p.advance(FRAME, WEST, host);
    const share = 1 - Math.exp(-BLEND_PER_SECOND * FRAME);
    expect(drawn.pos.x).toBeCloseTo(START.x + FOLLOW_GAP * share, PRECISION_DIGITS);
  });

  it("fleeing_follows_host_facing", () => {
    const p = predictorAt(START);
    const host = hostCat(east(FOLLOW_GAP), {
      fleeFor: FLEE_SECONDS,
      facing: Math.PI,
      moving: true,
    });
    const drawn = p.advance(FRAME, EAST, host);
    expect(drawn.pos.x).toBeGreaterThan(START.x);
    expect(drawn.pos.x).toBeLessThan(START.x + FOLLOW_GAP);
    expect(drawn.facing).toBe(Math.PI);
    expect(drawn.moving).toBe(true);
  });

  it("follow_far_snaps", () => {
    const p = predictorAt(START);
    const host = hostCat(east(LARGE_ERROR), { stunnedFor: STUN_SECONDS });
    expect(p.advance(FRAME, ZERO, host).pos).toEqual(east(LARGE_ERROR));
  });

  it("reconcile_ignored_while_stunned", () => {
    const p = predictorAt(START);
    p.sent(1);
    p.reconcile(1, hostCat(east(LARGE_ERROR), { stunnedFor: STUN_SECONDS }));
    expect(idleFrame(p, 0)).toEqual(START);
  });

  it("history_bounded_oldest_dropped", () => {
    const p = predictorAt(START);
    const recorded: Vec2[] = [];
    let drawn = START;
    for (let seq = 1; seq <= HISTORY_LIMIT + 1; seq++) {
      recorded.push(drawn);
      p.sent(seq);
      drawn = p.advance(FRAME, EAST, hostCat(START)).pos;
    }
    // Input 1 fell out, so the host's word is compared with the current prediction: no error.
    p.reconcile(1, hostCat(drawn));
    expect(idleFrame(p, 0)).toEqual(drawn);
    // Input 2 is the oldest kept; the host agrees with where it was sent from.
    p.reconcile(SECOND_INPUT, hostCat(recorded[1] ?? START));
    expect(idleFrame(p, 0)).toEqual(drawn);
  });

  it("ack_zero_uses_current_prediction", () => {
    const p = predictorAt(START);
    p.sent(1);
    let drawn = START;
    for (let i = 0; i < FRAMES_OF_WALKING; i++) drawn = p.advance(FRAME, EAST, hostCat(START)).pos;
    p.reconcile(0, hostCat(drawn));
    expect(idleFrame(p)).toEqual(drawn);
  });

  it("reset_drops_pending_correction", () => {
    const p = predictorAt(START);
    hostSays(p, east(MEDIUM_ERROR));
    p.reset(hostCat(START));
    expect(idleFrame(p)).toEqual(START);
  });
});
