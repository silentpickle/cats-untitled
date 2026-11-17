import type { CatId, CatState, GameState, Rect, Settings, Vec2, WorldDef } from "./types";
import type { StepContext } from "./context";
import {
  add,
  circleOverlapsRect,
  clampCircleInside,
  clampLength,
  headingOf,
  length,
  scale,
  sub,
  vec,
  HALF,
} from "./geometry";
import { mapCats } from "./stateOps";

/** Halvings used to find how far a blocked axis move can go before touching an obstacle. */
const CONTACT_SEARCH_STEPS = 10;
/** Floor for the substep length, so a zero radius can never mean infinitely many substeps. */
const MIN_SUBSTEP_METRES = 0.01;

/** What a moving cat can bump into. */
interface Body {
  readonly radius: number;
  readonly bounds: Rect;
  readonly blockers: readonly Rect[];
}

/** Obstacle rects that stop this cat. The sister walks under "brother" obstacles. */
export function blockersFor(world: WorldDef, cat: CatId): readonly Rect[] {
  return world.obstacles.filter((o) => o.blocks === "both" || cat === "brother").map((o) => o.rect);
}

export function overlapsAny(pos: Vec2, radius: number, rects: readonly Rect[]): boolean {
  return rects.some((r) => circleOverlapsRect(pos, radius, r));
}

/**
 * Builds the body for a cat at `pos`. Obstacles the cat already overlaps are left out, so a cat placed
 * inside one (a bad spawn) can walk out instead of being frozen.
 */
function bodyAt(world: WorldDef, cat: CatId, radius: number, pos: Vec2): Body {
  const blockers = blockersFor(world, cat).filter((r) => !circleOverlapsRect(pos, radius, r));
  return { radius, bounds: world.bounds, blockers };
}

/** Furthest point along `delta` (from `pos`) that does not overlap a blocker, found by bisection. */
function contactPoint(pos: Vec2, delta: Vec2, body: Body): Vec2 {
  let free = 0;
  let blocked = 1;
  for (let i = 0; i < CONTACT_SEARCH_STEPS; i++) {
    const mid = (free + blocked) * HALF;
    const hit = overlapsAny(add(pos, scale(delta, mid)), body.radius, body.blockers);
    free = hit ? free : mid;
    blocked = hit ? mid : blocked;
  }
  return add(pos, scale(delta, free));
}

/** Moves along one axis, stopping at bounds and at the first obstacle in the way. */
function moveAxis(pos: Vec2, delta: Vec2, body: Body): Vec2 {
  const target = clampCircleInside(add(pos, delta), body.radius, body.bounds);
  if (!overlapsAny(target, body.radius, body.blockers)) return target;
  return contactPoint(pos, sub(target, pos), body);
}

/**
 * Moves a circle by `delta`, x then z, so a blocked axis does not stop the other (cats slide along
 * walls). Long moves are cut into substeps no longer than the radius so thin walls cannot be skipped.
 */
export function moveCircle(pos: Vec2, delta: Vec2, body: Body): Vec2 {
  const substepLength = Math.max(body.radius, MIN_SUBSTEP_METRES);
  const substeps = Math.max(1, Math.ceil(length(delta) / substepLength));
  const part = scale(delta, 1 / substeps);
  let at = pos;
  for (let i = 0; i < substeps; i++) {
    at = moveAxis(at, vec(part.x, 0), body);
    at = moveAxis(at, vec(0, part.z), body);
  }
  return at;
}

/**
 * Moves one cat by `move` (a direction, length clamped to 1) for `dt` seconds at its own speed, with the
 * same collision as every step. The host's rules and the guest's prediction of its own cat both use this.
 */
export function moveOneCat(
  cat: CatState,
  move: Vec2,
  dt: number,
  world: WorldDef,
  settings: Settings,
): CatState {
  const catSettings = settings.cats[cat.id];
  const wanted = clampLength(move, 1);
  const delta = scale(wanted, catSettings.speed * dt);
  const body = bodyAt(world, cat.id, catSettings.radius, cat.pos);
  const pos = moveCircle(cat.pos, delta, body);
  const displacement = sub(pos, cat.pos);
  const moving = length(displacement) > 0;
  return { ...cat, pos, moving, facing: moving ? headingOf(displacement) : cat.facing };
}

/** Rule: each cat moves by its effective input. */
export function applyMovement(state: GameState, ctx: StepContext): GameState {
  return mapCats(state, (cat) =>
    moveOneCat(cat, ctx.inputs[cat.id].move, ctx.dt, ctx.world, ctx.settings),
  );
}
