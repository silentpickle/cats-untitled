/**
 * A scripted stretch of play used to pin the fixed-step game loop: uneven frame times (including one
 * exactly one step long, the `>=` edge), keyboard-style moves that change over time, and ability
 * presses, for each cat as the player. Any loop that runs the same rules must give the same record.
 */
import { loadSettings } from "../config";
import { MAIN_FLOOR } from "../house/mainFloor";
import { toWorld } from "../house/toWorld";
import { CAT_IDS, type CatId, type CatInput, type GameEvent, type GameState } from "../sim";

const STEPS_PER_SECOND = 60;
export const SIM_STEP = 1 / STEPS_PER_SECOND;

/** What a loop under test has to offer: advance by a frame, report the events, expose the state. */
export interface LoopUnderTest {
  advance(dt: number, mine: () => CatInput): readonly GameEvent[];
  readonly state: GameState;
}

export type LoopFactory = (player: CatId) => LoopUnderTest;

const HALF = 0.5;
const STEPS_IN_LONG_GAP = 2.5;
const HALF_STEP = SIM_STEP * HALF;
const TWO_AND_A_HALF_STEPS = SIM_STEP * STEPS_IN_LONG_GAP;
const LONG_FRAME = 0.1;
const TINY_FRAME = 0.001;

/** One exact step, a frame too short to step, then frames that leave and use up leftover time. */
const FRAME_PATTERN: readonly number[] = [
  SIM_STEP,
  HALF_STEP,
  HALF_STEP,
  TWO_AND_A_HALF_STEPS,
  TINY_FRAME,
  LONG_FRAME,
];
const REPEATS = 40;
const MOVE_PHASE_CALLS = 45;
const PRESS_EVERY = 37;

const MOVES: readonly CatInput["move"][] = [
  { x: 1, z: 0 },
  { x: 0, z: -1 },
  { x: -1, z: 1 },
  { x: 0, z: 0 },
];

/** Player input that depends only on how many times it has been asked, like a scripted keyboard. */
function scriptedPlayer(): () => CatInput {
  let calls = 0;
  return () => {
    const move = MOVES[Math.floor(calls / MOVE_PHASE_CALLS) % MOVES.length] ?? { x: 0, z: 0 };
    const press = calls % PRESS_EVERY === 0;
    calls += 1;
    return { move, swat: press, stealth: press };
  };
}

export interface LoopRecord {
  readonly player: CatId;
  /** Round clock after each frame, so a step taken one frame late or early shows up. */
  readonly clock: readonly number[];
  readonly events: readonly GameEvent[];
  readonly final: GameState;
}

function runOne(factory: LoopFactory, player: CatId): LoopRecord {
  const loop = factory(player);
  const mine = scriptedPlayer();
  const events: GameEvent[] = [];
  const clock: number[] = [];
  const frames = Array.from({ length: REPEATS }, () => FRAME_PATTERN).flat();
  for (const dt of frames) {
    events.push(...loop.advance(dt, mine));
    clock.push(loop.state.timeLeft);
  }
  return { player, clock, events, final: loop.state };
}

/** Runs the scenario once for each cat as the player. */
export function runLoopScenario(factory: LoopFactory): readonly LoopRecord[] {
  return CAT_IDS.map((player) => runOne(factory, player));
}

export function scenarioWorld(): {
  readonly world: ReturnType<typeof toWorld>;
  readonly settings: ReturnType<typeof loadSettings>["sim"];
} {
  return { world: toWorld(MAIN_FLOOR), settings: loadSettings().sim };
}

export const GOLDEN_FILE = "./__golden__/soloLoop.json";
