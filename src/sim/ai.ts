import type {
  CatId,
  CatInput,
  CatState,
  GameState,
  HideSpotDef,
  NapPointDef,
  Settings,
  Vec2,
  WorldDef,
} from "./types";
import type { NavGrid } from "./nav";
import type { DistanceField } from "./distanceField";
import { fieldAt, fieldDistance } from "./distanceField";
import { NOT_FOUND, cellAt, cellCenter } from "./navGrid";
import { steerAlong } from "./steer";
import { ZERO, directionTo, distance, dot, headingVector, rectCenter } from "./geometry";
import { IDLE_INPUT, otherCat } from "./stateOps";

// AI tuning. These shape how the computer plays, not the rules, so they live here and not in config.

/** Both: stop and nap once within this fraction of the capture radius of the chosen point. */
const NAP_ARRIVE_FRACTION = 0.5;
/** Brother: seconds of extra walking he accepts to take a point his sister owns. */
const BROTHER_SISTER_OWNED_BONUS_SECONDS = 3;
/** Brother: seconds of extra walking he accepts to break a capture his sister is making. */
const BROTHER_SISTER_CAPTURING_BONUS_SECONDS = 5;
/** Brother: swat when she is within this fraction of swat range (both cats move before it lands). */
const BROTHER_SWAT_REACH_FRACTION = 0.9;
/** Sister: go for a treat when it is at most this many metres' walk away. */
const SISTER_TREAT_CHASE_METRES = 3;
/** Sister: the brother is a threat within this many metres. */
const SISTER_DANGER_METRES = 2.5;
/** Sister: count his swat as ready when its cooldown is below this many seconds. */
const SISTER_DANGER_COOLDOWN_SECONDS = 0.5;
/** Sister: he is coming at her when the cosine between his facing and her direction is above this. */
const SISTER_CHASE_CONE_COS = 0.5;
/** Sister: metres of her own walk she trades for each metre of distance from her brother. */
const SISTER_BROTHER_DISTANCE_WEIGHT = 2;

/** What one AI decision looks at. */
interface AiView {
  readonly state: GameState;
  readonly world: WorldDef;
  readonly settings: Settings;
  readonly nav: NavGrid;
  readonly me: CatState;
  readonly other: CatState;
}

type Plan = (view: AiView) => Vec2 | undefined;

// ---- Shared helpers ----

/** The item with the lowest finite cost, or undefined if none has one. */
function bestBy<T>(items: readonly T[], cost: (item: T) => number): T | undefined {
  let best: T | undefined;
  let bestCost = Infinity;
  for (const item of items) {
    const c = cost(item);
    best = c < bestCost ? item : best;
    bestCost = Math.min(c, bestCost);
  }
  return best;
}

function ownerOf(view: AiView, pointId: string): CatId | null {
  return view.state.points.find((p) => p.id === pointId)?.owner ?? null;
}

function capturerOf(view: AiView, pointId: string): CatId | null {
  return view.state.points.find((p) => p.id === pointId)?.capturer ?? null;
}

function walkTo(view: AiView, field: DistanceField | undefined, target: Vec2): Vec2 {
  if (field === undefined) return directionTo(view.me.pos, target);
  return steerAlong(view.nav, field, view.me.pos);
}

function walkDistance(view: AiView, field: DistanceField | undefined, target: Vec2): number {
  if (field === undefined) return distance(view.me.pos, target);
  return fieldDistance(view.nav, field, view.me.pos);
}

/** The grid lets this cat get within capture radius of the point. */
function canNapOn(view: AiView, def: NapPointDef): boolean {
  const field = view.nav.toNapPoint.get(def.id);
  if (field === undefined) return true;
  if (field.goalCell === NOT_FOUND) return false;
  return distance(cellCenter(view.nav, field.goalCell), def.pos) <= view.settings.capture.radius;
}

/** The path toward the point still leads somewhere closer from where the cat stands. */
function canGetCloser(view: AiView, def: NapPointDef): boolean {
  const field = view.nav.toNapPoint.get(def.id);
  if (field === undefined) return true;
  const here = fieldAt(field, cellAt(view.nav, view.me.pos));
  return Number.isFinite(here) && here > 0;
}

function hasArrived(view: AiView, def: NapPointDef): boolean {
  const gap = distance(view.me.pos, def.pos);
  const radius = view.settings.capture.radius;
  if (gap <= radius * NAP_ARRIVE_FRACTION) return true;
  return gap <= radius && !canGetCloser(view, def);
}

/** Walk to the point, then hold perfectly still: any movement cancels napping. */
function moveToNap(view: AiView, def: NapPointDef): Vec2 {
  if (hasArrived(view, def)) return ZERO;
  return walkTo(view, view.nav.toNapPoint.get(def.id), def.pos);
}

/** Points this cat does not own and can reach. */
function napCandidates(view: AiView): NapPointDef[] {
  return view.world.napPoints.filter(
    (def) => ownerOf(view, def.id) !== view.me.id && canNapOn(view, def),
  );
}

/** A point the cat is already sitting within range of and does not own: stay until it is taken. */
function heldPoint(view: AiView): NapPointDef | undefined {
  const radius = view.settings.capture.radius;
  return napCandidates(view).find((def) => distance(view.me.pos, def.pos) <= radius);
}

// ---- Brother ----

function sisterClaimBonus(view: AiView, pointId: string): number {
  if (capturerOf(view, pointId) === "sister") return BROTHER_SISTER_CAPTURING_BONUS_SECONDS;
  if (ownerOf(view, pointId) === "sister") return BROTHER_SISTER_OWNED_BONUS_SECONDS;
  return 0;
}

/** Seconds to walk there, less a bonus for spoiling his sister's points. */
function brotherCost(view: AiView, def: NapPointDef): number {
  const walk = walkDistance(view, view.nav.toNapPoint.get(def.id), def.pos);
  return walk / view.settings.cats[view.me.id].speed - sisterClaimBonus(view, def.id);
}

function brotherTarget(view: AiView): NapPointDef | undefined {
  const held = heldPoint(view);
  if (held !== undefined) return held;
  const best = bestBy(napCandidates(view), (def) => brotherCost(view, def));
  return best ?? bestBy(view.world.napPoints, (def) => distance(def.pos, view.other.pos));
}

function shouldSwat(view: AiView): boolean {
  const { me, other, settings } = view;
  if (me.swatCooldown > 0 || other.hidden) return false;
  if (other.stunnedFor > 0 || other.fleeFor > 0) return false;
  return distance(me.pos, other.pos) <= settings.swat.range * BROTHER_SWAT_REACH_FRACTION;
}

function brotherInput(view: AiView): CatInput {
  const target = brotherTarget(view);
  return { move: target === undefined ? ZERO : moveToNap(view, target), swat: shouldSwat(view) };
}

// ---- Sister ----

/** He is close, his swat is (nearly) ready, and he is walking at her. */
function isThreatened(view: AiView): boolean {
  const { me, other } = view;
  if (!other.moving || other.swatCooldown > SISTER_DANGER_COOLDOWN_SECONDS) return false;
  if (distance(me.pos, other.pos) > SISTER_DANGER_METRES) return false;
  return dot(headingVector(other.facing), directionTo(other.pos, me.pos)) >= SISTER_CHASE_CONE_COS;
}

function hideField(view: AiView, spot: HideSpotDef): DistanceField | undefined {
  return view.nav.toHideSpot.get(spot.id);
}

function walkToSpot(view: AiView, spot: HideSpotDef): number {
  return walkDistance(view, hideField(view, spot), rectCenter(spot.rect));
}

/** She can get into the spot before he can get to it. */
function reachesFirst(view: AiView, spot: HideSpotDef): boolean {
  const mine = walkToSpot(view, spot) / view.settings.cats[view.me.id].speed;
  const his =
    distance(view.other.pos, rectCenter(spot.rect)) / view.settings.cats[view.other.id].speed;
  return mine < his;
}

function walkToHide(view: AiView, spot: HideSpotDef): Vec2 {
  if (view.me.hidden) return ZERO;
  return walkTo(view, hideField(view, spot), rectCenter(spot.rect));
}

/**
 * Wait in cover while he keeps coming; otherwise run for the nearest hide spot she can reach before
 * him, or straight away from him if there is none.
 */
const evade: Plan = (view) => {
  if (!isThreatened(view)) return undefined;
  if (view.me.hidden) return ZERO;
  const safe = view.world.hideSpots.filter((s) => reachesFirst(view, s));
  const spot = bestBy(safe, (s) => walkToSpot(view, s));
  if (spot === undefined) return directionTo(view.other.pos, view.me.pos);
  return walkToHide(view, spot);
};

/** Keep filling a point she is already on, unless her brother is sitting on it too. */
const keepCapturing: Plan = (view) => {
  const held = heldPoint(view);
  if (held === undefined) return undefined;
  if (distance(view.other.pos, held.pos) <= view.settings.capture.radius) return undefined;
  return moveToNap(view, held);
};

const chaseTreat: Plan = (view) => {
  const out = view.world.treatSpawns.filter(
    (t) => view.state.treats.find((s) => s.id === t.id)?.available === true,
  );
  const walk = (pos: Vec2, id: string) => walkDistance(view, view.nav.toTreat.get(id), pos);
  const near = out.filter((t) => walk(t.pos, t.id) <= SISTER_TREAT_CHASE_METRES);
  const treat = bestBy(near, (t) => walk(t.pos, t.id));
  return treat === undefined ? undefined : walkTo(view, view.nav.toTreat.get(treat.id), treat.pos);
};

/** Her walk to the point, less how far it is from her brother. */
function sisterCost(view: AiView, def: NapPointDef): number {
  const mine = walkDistance(view, view.nav.toNapPoint.get(def.id), def.pos);
  return mine - SISTER_BROTHER_DISTANCE_WEIGHT * distance(view.other.pos, def.pos);
}

const capture: Plan = (view) => {
  const target = bestBy(napCandidates(view), (def) => sisterCost(view, def));
  return target === undefined ? undefined : moveToNap(view, target);
};

/** Nothing left to take: tease him from the hide spot nearest him. */
const lurk: Plan = (view) => {
  const spot = bestBy(view.world.hideSpots, (s) => distance(rectCenter(s.rect), view.other.pos));
  return spot === undefined ? undefined : walkToHide(view, spot);
};

/** Her priorities, first match wins. */
const SISTER_PLANS: readonly Plan[] = [evade, keepCapturing, chaseTreat, capture, lurk];

function sisterInput(view: AiView): CatInput {
  for (const plan of SISTER_PLANS) {
    const move = plan(view);
    if (move !== undefined) return { move, swat: false };
  }
  return IDLE_INPUT;
}

// ---- Entry point ----

/** The computer's input for `cat` this step. Idle while stunned or fleeing (the rules steer then). */
export function aiInput(
  state: GameState,
  cat: CatId,
  world: WorldDef,
  settings: Settings,
  nav: NavGrid,
): CatInput {
  const me = state.cats[cat];
  if (state.phase === "finished" || me.stunnedFor > 0 || me.fleeFor > 0) return IDLE_INPUT;
  const view: AiView = { state, world, settings, nav, me, other: state.cats[otherCat(cat)] };
  return cat === "brother" ? brotherInput(view) : sisterInput(view);
}
