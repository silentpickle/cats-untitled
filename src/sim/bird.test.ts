import { describe, expect, it } from "vitest";
import type { BirdPathDef, BirdState, GameEvent, GameState, Inputs, Vec2, WorldDef } from "./types";
import { step } from "./step";
import { chaseDirection } from "./bird";
import { IDLE, TEST_SETTINGS, TEST_WORLD, inputs, quietGame, withCat } from "./testFixtures";

/** A step length that binary floats hold exactly, so countdowns land on their limits. */
const EXACT_DT = 0.25;
const BIRD = TEST_SETTINGS.bird;
const STEPS_TO_FLY_OUT = 200;
/** Cosine of about ten degrees. */
const NEARLY_STRAIGHT = 0.98;

const PATIO = { minX: 0, minZ: 0, maxX: 3, maxZ: 1 } as const;
const ON_PATIO: Vec2 = { x: 1.5, z: 0.9 };
const DOOR: Vec2 = { x: 1.5, z: 1.5 };
const OUTSIDE: Vec2 = { x: 1.5, z: 0.4 };
const PERCH_A: Vec2 = { x: 4, z: 4 };
const PERCH_B: Vec2 = { x: 4, z: 8 };
/** Open floor west of perch A, in line with it. */
const WEST_OF_A: Vec2 = { x: 1, z: 4 };

/** Either side of the test house's middle wall (x 5.8 to 6.2, z 0 to 6), low down where it is solid. */
const WEST_OF_WALL: Vec2 = { x: 5, z: 3 };
const EAST_OF_WALL: Vec2 = { x: 7, z: 3 };

const PATH: BirdPathDef = {
  patio: PATIO,
  door: DOOR,
  outside: OUTSIDE,
  perches: [PERCH_A, PERCH_B],
};
const WORLD: WorldDef = { ...TEST_WORLD, bird: PATH };

const STEP_IN = inputs({ brother: { move: { x: 0, z: 1 } } });
const STEP_ALONG_PATIO = inputs({ brother: { move: { x: 1, z: 0 } } });
const PULL_WEST = inputs({ brother: { move: { x: -1, z: 0 } } });

function stepBird(state: GameState, input: Inputs, world: WorldDef = WORLD): GameState {
  return step(state, input, EXACT_DT, world, TEST_SETTINGS);
}

function withBird(state: GameState, patch: Partial<BirdState>): GameState {
  return { ...state, bird: { ...state.bird, ...patch } };
}

/** Aragorn on the patio, one step from coming in, and the rule has seen him out there. */
function outOnPatio(): GameState {
  return stepBird(withCat(quietGame(), "brother", { pos: ON_PATIO }), IDLE);
}

/** A bird sitting on perch A, with plenty of time left in the house. */
function birdOnPerchA(brotherAt: Vec2): GameState {
  const state = withCat(quietGame(), "brother", { pos: brotherAt, chasing: true });
  return withBird(state, {
    phase: "in",
    pos: PERCH_A,
    target: 0,
    perched: true,
    inFor: BIRD.seconds,
  });
}

/** Stunned, so he stays exactly where he was put for the step. */
function frozen(state: GameState): GameState {
  return withCat(state, "brother", { stunnedFor: BIRD.seconds });
}

function birdEvents(events: readonly GameEvent[]): GameEvent["kind"][] {
  return events.map((e) => e.kind).filter((kind) => kind.startsWith("bird"));
}

describe("a bird following Aragorn in", () => {
  it("B1_follows_in", () => {
    const next = stepBird(outOnPatio(), STEP_IN);
    expect(next.bird.phase).toBe("in");
    expect(next.bird.pos).toEqual(DOOR);
    expect(next.cats.brother.chasing).toBe(true);
    expect(next.events).toEqual([{ kind: "bird_in" }]);
  });

  it("B2_cooldown_blocks", () => {
    const resting = withBird(outOnPatio(), { cooldown: BIRD.cooldownSeconds });
    const next = stepBird(resting, STEP_IN);
    expect(next.bird.phase).toBe("away");
    expect(next.bird.cooldown).toBe(BIRD.cooldownSeconds - EXACT_DT);
    expect(next.cats.brother.chasing).toBe(false);
  });

  it("B3_patio_stroll", () => {
    const next = stepBird(outOnPatio(), STEP_ALONG_PATIO);
    expect(next.bird.phase).toBe("away");
    expect(next.bird.brotherOutside).toBe(true);
  });

  it("B4_sister_never", () => {
    const sisterOut = stepBird(withCat(quietGame(), "sister", { pos: ON_PATIO }), IDLE);
    const next = stepBird(sisterOut, inputs({ sister: { move: { x: 0, z: 1 } } }));
    expect(next.bird.phase).toBe("away");
  });

  it("B5_closed_house", () => {
    const out = stepBird(withCat(quietGame(), "brother", { pos: ON_PATIO }), IDLE, TEST_WORLD);
    const next = stepBird(out, STEP_IN, TEST_WORLD);
    expect(next.bird.phase).toBe("away");
    expect(next.events).toEqual([]);
  });
});

describe("chasing the bird", () => {
  it("C1_input_ignored", () => {
    const next = stepBird(birdOnPerchA(WEST_OF_A), PULL_WEST);
    expect(next.cats.brother.pos.x).toBeGreaterThan(WEST_OF_A.x);
  });

  it("C2_swat_ignored", () => {
    const next = stepBird(birdOnPerchA(WEST_OF_A), inputs({ brother: { swat: true } }));
    expect(next.cats.brother.swatCooldown).toBe(0);
  });

  it("C3_close_scares", () => {
    const justInside = { x: PERCH_A.x - BIRD.scareRadius + EXACT_DT, z: PERCH_A.z };
    const next = stepBird(frozen(birdOnPerchA(justInside)), IDLE);
    expect(next.bird.target).toBe(1);
    expect(next.bird.perched).toBe(false);
    expect(next.bird.pos.z).toBe(PERCH_A.z + BIRD.speed * EXACT_DT);
  });

  it("C4_radius_edge", () => {
    const atEdge = { x: PERCH_A.x - BIRD.scareRadius, z: PERCH_A.z };
    const next = stepBird(frozen(birdOnPerchA(atEdge)), IDLE);
    expect(next.bird.target).toBe(0);
    expect(next.bird.perched).toBe(true);
  });

  it("C6_open_floor", () => {
    // Along the nav cells, so within a few degrees of the straight line rather than exactly on it.
    const dir = chaseDirection(birdOnPerchA(WEST_OF_A), WORLD, TEST_SETTINGS);
    expect(dir.x).toBeGreaterThan(NEARLY_STRAIGHT);
  });

  it("C7_around_wall", () => {
    // Perch B's twin on the far side of the test house's middle wall: the way round is via its gap (z > 6).
    const behindWall = { ...WORLD, bird: { ...PATH, perches: [EAST_OF_WALL] } };
    const state = withBird(birdOnPerchA(WEST_OF_WALL), { pos: EAST_OF_WALL });
    const dir = chaseDirection(state, behindWall, TEST_SETTINGS);
    expect(dir.z).toBeGreaterThan(0);
  });

  it("C5_perch_wraps", () => {
    const onLast = withBird(birdOnPerchA(PERCH_B), { pos: PERCH_B, target: 1 });
    expect(stepBird(onLast, IDLE).bird.target).toBe(0);
  });
});

describe("the bird leaving", () => {
  it("L1_time_up", () => {
    const lastMoment = withBird(birdOnPerchA(WEST_OF_A), { inFor: EXACT_DT });
    const next = stepBird(lastMoment, IDLE);
    expect(next.bird.phase).toBe("leaving");
    expect(next.cats.brother.chasing).toBe(true);
  });

  it("L2_flies_out", () => {
    let state = withBird(birdOnPerchA(WEST_OF_A), { inFor: EXACT_DT });
    const seen: GameEvent[] = [];
    for (let i = 0; i < STEPS_TO_FLY_OUT && state.bird.phase !== "away"; i++) {
      state = stepBird(state, IDLE);
      seen.push(...state.events);
    }
    expect(birdEvents(seen)).toEqual(["bird_out"]);
    expect(state.bird.pos).toEqual(OUTSIDE);
    expect(state.bird.cooldown).toBe(BIRD.cooldownSeconds);
    expect(state.cats.brother.chasing).toBe(false);
  });
});
