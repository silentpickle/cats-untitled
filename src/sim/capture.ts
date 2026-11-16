import type {
  CatId,
  CatState,
  GameEvent,
  GameState,
  NapPointDef,
  NapPointState,
  Settings,
  WorldDef,
} from "./types";
import { CAT_IDS } from "./types";
import type { StepContext } from "./context";
import { distance } from "./geometry";
import { countDown, mapCats } from "./stateOps";

interface PointResult {
  readonly point: NapPointState;
  readonly events: readonly GameEvent[];
}

const NO_EVENTS: readonly GameEvent[] = [];

function onPoint(cat: CatState, def: NapPointDef, settings: Settings): boolean {
  return distance(cat.pos, def.pos) <= settings.capture.radius;
}

/** Sitting still on a nap point, and not stunned or fleeing. */
export function isNapping(cat: CatState, world: WorldDef, settings: Settings): boolean {
  if (cat.moving || cat.stunnedFor > 0 || cat.fleeFor > 0) return false;
  return world.napPoints.some((def) => onPoint(cat, def, settings));
}

/** Rule: refresh each cat's napping flag. */
export function updateNapping(state: GameState, ctx: StepContext): GameState {
  return mapCats(state, (cat) => ({ ...cat, napping: isNapping(cat, ctx.world, ctx.settings) }));
}

function nappersOn(state: GameState, def: NapPointDef, settings: Settings): CatId[] {
  return CAT_IDS.filter((id) => state.cats[id].napping && onPoint(state.cats[id], def, settings));
}

/** Nobody (or only the owner) is on the point: the meter drains at the base rate. */
function decay(point: NapPointState, ctx: StepContext): NapPointState {
  const progress = countDown(point.progress, ctx.dt / ctx.settings.capture.secondsToCapture);
  return { ...point, progress, capturer: progress > 0 ? point.capturer : null };
}

/** One non-owner naps alone: the meter fills, restarting if the other cat had been filling it. */
function fill(point: NapPointState, napper: CatId, ctx: StepContext): PointResult {
  const start = point.capturer === napper ? point.progress : 0;
  const rate = ctx.settings.cats[napper].captureMultiplier / ctx.settings.capture.secondsToCapture;
  const progress = start + ctx.dt * rate;
  if (progress < 1) return { point: { ...point, capturer: napper, progress }, events: NO_EVENTS };
  return {
    point: { ...point, owner: napper, capturer: null, progress: 0 },
    events: [{ kind: "captured", pointId: point.id, by: napper }],
  };
}

function advancePoint(
  point: NapPointState,
  nappers: readonly CatId[],
  ctx: StepContext,
): PointResult {
  if (nappers.length > 1) return { point, events: NO_EVENTS };
  const napper = nappers[0];
  if (napper === undefined || napper === point.owner) {
    return { point: decay(point, ctx), events: NO_EVENTS };
  }
  return fill(point, napper, ctx);
}

function advanceById(state: GameState, point: NapPointState, ctx: StepContext): PointResult {
  const def = ctx.world.napPoints.find((d) => d.id === point.id);
  if (def === undefined) return { point, events: NO_EVENTS };
  return advancePoint(point, nappersOn(state, def, ctx.settings), ctx);
}

/** Rule: nap point meters fill, drain or hold, and full meters change owner. */
export function updateCapture(state: GameState, ctx: StepContext): GameState {
  const results = state.points.map((point) => advanceById(state, point, ctx));
  return {
    ...state,
    points: results.map((r) => r.point),
    events: [...state.events, ...results.flatMap((r) => r.events)],
  };
}
