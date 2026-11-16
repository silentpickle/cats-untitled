// Test-only fixtures: a small house and a settings table. The coordinates are layout data, so they
// are written out once here and the tests refer to them by name.
import type {
  CatId,
  CatInput,
  CatState,
  GameEvent,
  GameState,
  Inputs,
  NapPointState,
  Rect,
  Settings,
  TreatState,
  Vec2,
  WorldDef,
} from "./types";
import { createGame } from "./create";
import { step } from "./step";
import { IDLE_INPUT } from "./stateOps";

export const TEST_SETTINGS: Settings = {
  round: { durationSeconds: 180 },
  capture: { secondsToCapture: 4, pointsPerSecond: 1, radius: 0.6 },
  cats: {
    brother: { speed: 1.6, scale: 1.25, captureMultiplier: 1.5, radius: 0.28 },
    sister: { speed: 2.8, scale: 0.95, captureMultiplier: 1, radius: 0.2 },
  },
  swat: { range: 0.9, stunSeconds: 1.2, cooldownSeconds: 4, fleeSeconds: 2.5 },
  hide: { pointsPerSecond: 0.5, teaseRange: 3 },
  treats: { points: 5, respawnSeconds: 20, pickupRadius: 0.5 },
  mischief: { points: 15, knockRadius: 0.5, knockPoints: 2, resetSeconds: 25 },
};

export const BOUNDS: Rect = { minX: 0, minZ: 0, maxX: 12, maxZ: 10 };
/** Full-height wall down the middle with a gap at the top (z above 6). Stops both cats. */
export const WALL: Rect = { minX: 5.8, minZ: 0, maxX: 6.2, maxZ: 6 };
/** Couch: the brother cannot pass, the sister walks under it and hides there. */
export const COUCH: Rect = { minX: 1, minZ: 7, maxX: 3, maxZ: 8 };
export const TABLE: Rect = { minX: 8.5, minZ: 2, maxX: 9.5, maxZ: 3 };

export const SUN: Vec2 = { x: 2, z: 2 };
export const RUG: Vec2 = { x: 3, z: 5 };
export const LAP: Vec2 = { x: 7.5, z: 8.5 };
export const BED: Vec2 = { x: 10.5, z: 8 };
export const BOWL: Vec2 = { x: 10.5, z: 1 };

export const FISH: Vec2 = { x: 6, z: 7.5 };
export const MOUSE: Vec2 = { x: 4, z: 1 };

export const TEST_WORLD: WorldDef = {
  bounds: BOUNDS,
  obstacles: [
    { rect: WALL, blocks: "both" },
    { rect: COUCH, blocks: "brother" },
    { rect: TABLE, blocks: "both" },
  ],
  napPoints: [
    { id: "sun", name: "Sunbeam", pos: SUN },
    { id: "rug", name: "Rug", pos: RUG },
    { id: "lap", name: "Lap", pos: LAP },
    { id: "bed", name: "Bed", pos: BED },
    { id: "bowl", name: "Food bowl", pos: BOWL },
  ],
  hideSpots: [{ id: "under_couch", rect: COUCH }],
  treatSpawns: [
    { id: "fish", pos: FISH },
    { id: "mouse", pos: MOUSE },
  ],
  knockables: [],
  mischief: [],
  spawn: { brother: { x: 1, z: 4 }, sister: { x: 11, z: 5 } },
};

/** Open floor west of the wall, clear of every point, treat and obstacle. */
export const OPEN_WEST: Vec2 = { x: 4, z: 3 };
/** Open floor east of the wall, clear of every point, treat and obstacle. */
export const OPEN_EAST: Vec2 = { x: 11, z: 5 };

export const IDLE: Inputs = { brother: IDLE_INPUT, sister: IDLE_INPUT };

export function newGame(): GameState {
  return createGame(TEST_WORLD, TEST_SETTINGS);
}

export function inputs(patch: Partial<Record<CatId, Partial<CatInput>>>): Inputs {
  return {
    brother: { ...IDLE_INPUT, ...patch.brother },
    sister: { ...IDLE_INPUT, ...patch.sister },
  };
}

export function withCat(state: GameState, id: CatId, patch: Partial<CatState>): GameState {
  return { ...state, cats: { ...state.cats, [id]: { ...state.cats[id], ...patch } } };
}

/** Both cats parked on open floor, far from each other and from everything else. */
export function quietGame(): GameState {
  return withCat(withCat(newGame(), "brother", { pos: OPEN_WEST }), "sister", { pos: OPEN_EAST });
}

export function withPoint(state: GameState, id: string, patch: Partial<NapPointState>): GameState {
  return { ...state, points: state.points.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

export function withTreat(state: GameState, id: string, patch: Partial<TreatState>): GameState {
  return { ...state, treats: state.treats.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

export function pointById(state: GameState, id: string): NapPointState | undefined {
  return state.points.find((p) => p.id === id);
}

export function treatById(state: GameState, id: string): TreatState | undefined {
  return state.treats.find((t) => t.id === id);
}

export function stepTest(state: GameState, input: Inputs, dt: number): GameState {
  return step(state, input, dt, TEST_WORLD, TEST_SETTINGS);
}

/** Runs `count` steps with the same inputs; returns the last state and every event on the way. */
export function run(
  state: GameState,
  input: Inputs,
  dt: number,
  count: number,
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  let current = state;
  const events: GameEvent[] = [];
  for (let i = 0; i < count; i++) {
    current = stepTest(current, input, dt);
    events.push(...current.events);
  }
  return { state: current, events };
}
