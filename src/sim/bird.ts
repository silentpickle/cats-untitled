import type {
  BirdPathDef,
  BirdPhase,
  BirdState,
  CatState,
  GameState,
  Settings,
  Vec2,
  WorldDef,
} from "./types";
import type { StepContext } from "./context";
import { ZERO, add, directionTo, distance, pointInRect, scale } from "./geometry";
import { blockersFor } from "./movement";
import { buildWalkGrid, type WalkGrid } from "./navGrid";
import { buildField, type DistanceField } from "./distanceField";
import { steerAlong } from "./steer";
import { countDown, withCat, withEvents } from "./stateOps";

/** Leg of the way out: first the door, then out over the patio. */
const LEG_DOOR = 0;
const LEG_OUTSIDE = 1;

export const NO_BIRD: BirdState = {
  phase: "away",
  pos: ZERO,
  target: 0,
  perched: false,
  inFor: 0,
  cooldown: 0,
  brotherOutside: false,
};

type BirdSettings = Settings["bird"];

/** Where the bird got to after flying `stride` metres toward `goal`, and whether it is there. */
function flyToward(from: Vec2, goal: Vec2, stride: number): { pos: Vec2; arrived: boolean } {
  if (distance(from, goal) <= stride) return { pos: goal, arrived: true };
  return { pos: add(from, scale(directionTo(from, goal), stride)), arrived: false };
}

function withBird(state: GameState, bird: BirdState): GameState {
  return { ...state, bird };
}

/** Aragorn stepped in off the patio with the bird right behind him. */
function flyIn(path: BirdPathDef, bird: BirdSettings): BirdState {
  return {
    ...NO_BIRD,
    phase: "in",
    pos: path.door,
    inFor: bird.seconds,
  };
}

function whileAway(state: GameState, path: BirdPathDef, ctx: StepContext): GameState {
  const outside = pointInRect(state.cats.brother.pos, path.patio);
  const cameIn = state.bird.brotherOutside && !outside;
  if (cameIn && state.bird.cooldown === 0) {
    return withEvents(withBird(state, flyIn(path, ctx.settings.bird)), [{ kind: "bird_in" }]);
  }
  const cooldown = countDown(state.bird.cooldown, ctx.dt);
  return withBird(state, { ...state.bird, cooldown, brotherOutside: outside });
}

/** Sitting on a perch with Aragorn close by: off to the next one. */
function scared(bird: BirdState, brother: CatState, settings: BirdSettings): boolean {
  return bird.perched && distance(bird.pos, brother.pos) < settings.scareRadius;
}

function whileIn(state: GameState, path: BirdPathDef, ctx: StepContext): GameState {
  const { bird } = state;
  const inFor = countDown(bird.inFor, ctx.dt);
  if (inFor === 0) {
    return withBird(state, { ...bird, phase: "leaving", target: LEG_DOOR, perched: false, inFor });
  }
  const flees = scared(bird, state.cats.brother, ctx.settings.bird);
  const target = flees ? (bird.target + 1) % path.perches.length : bird.target;
  const goal = path.perches[target] ?? path.door;
  const flight = flyToward(bird.pos, goal, ctx.settings.bird.speed * ctx.dt);
  return withBird(state, { ...bird, inFor, target, pos: flight.pos, perched: flight.arrived });
}

function whileLeaving(state: GameState, path: BirdPathDef, ctx: StepContext): GameState {
  const { bird } = state;
  const goal = bird.target === LEG_DOOR ? path.door : path.outside;
  const flight = flyToward(bird.pos, goal, ctx.settings.bird.speed * ctx.dt);
  if (!flight.arrived) return withBird(state, { ...bird, pos: flight.pos });
  if (bird.target === LEG_DOOR) {
    return withBird(state, { ...bird, pos: flight.pos, target: LEG_OUTSIDE });
  }
  const gone: BirdState = {
    ...NO_BIRD,
    pos: flight.pos,
    cooldown: ctx.settings.bird.cooldownSeconds,
    brotherOutside: pointInRect(state.cats.brother.pos, path.patio),
  };
  return withEvents(withBird(state, gone), [{ kind: "bird_out" }]);
}

type PhaseRule = (state: GameState, path: BirdPathDef, ctx: StepContext) => GameState;

const PHASE_RULES: Readonly<Record<BirdPhase, PhaseRule>> = {
  away: whileAway,
  in: whileIn,
  leaving: whileLeaving,
};

/**
 * Rule: a bird can follow Aragorn in from the patio. It flits from perch to perch, moving on whenever he
 * gets close, then flies back out the door. He chases it the whole time it is in, whatever his player wants.
 */
export function updateBird(state: GameState, ctx: StepContext): GameState {
  const path = ctx.world.bird;
  if (path === undefined) return state;
  const next = PHASE_RULES[state.bird.phase](state, path, ctx);
  const chasing = next.bird.phase !== "away";
  const brother = next.cats.brother;
  return brother.chasing === chasing ? next : withCat(next, { ...brother, chasing });
}

/** Aragorn's walkable floor and the way to every place the bird goes, built once per house. */
interface ChaseRoutes {
  readonly grid: WalkGrid;
  readonly perches: readonly DistanceField[];
  /** The way out: the door, then outside. */
  readonly out: readonly DistanceField[];
}

const ROUTES = new WeakMap<BirdPathDef, ChaseRoutes>();

function chaseRoutes(path: BirdPathDef, world: WorldDef, settings: Settings): ChaseRoutes {
  const known = ROUTES.get(path);
  if (known !== undefined) return known;
  const { radius } = settings.cats.brother;
  const grid = buildWalkGrid(world.bounds, radius, blockersFor(world, "brother"));
  const routes: ChaseRoutes = {
    grid,
    perches: path.perches.map((perch) => buildField(grid, perch)),
    out: [path.door, path.outside].map((spot) => buildField(grid, spot)),
  };
  ROUTES.set(path, routes);
  return routes;
}

/** Where the bird is headed, or sitting: he runs for that, the way the AI walks to a nap point. */
function birdGoal(bird: BirdState, routes: ChaseRoutes): DistanceField | undefined {
  return bird.phase === "leaving" ? routes.out[bird.target] : routes.perches[bird.target];
}

/**
 * Which way Aragorn runs while a bird is in: along the floor toward wherever it is landing, round the
 * furniture in the way. Straight at it if there is no route (a house with no bird path, or no way there).
 */
export function chaseDirection(state: GameState, world: WorldDef, settings: Settings): Vec2 {
  const { pos } = state.cats.brother;
  const straight = directionTo(pos, state.bird.pos);
  if (world.bird === undefined) return straight;
  const routes = chaseRoutes(world.bird, world, settings);
  const goal = birdGoal(state.bird, routes);
  if (goal === undefined) return straight;
  const along = steerAlong(routes.grid, goal, pos);
  return along.x === 0 && along.z === 0 ? straight : along;
}
