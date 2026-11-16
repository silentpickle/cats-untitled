import type {
  CatId,
  GameEvent,
  GameState,
  MischiefDef,
  MischiefGoal,
  MischiefState,
} from "./types";
import type { StepContext } from "./context";
import { distance } from "./geometry";
import { addScore, otherCat, withCat, withEvents } from "./stateOps";

type GoalOf<K extends MischiefGoal["kind"]> = Extract<MischiefGoal, { kind: K }>;

/** Returns the item's progress (0 to 1) after this step. */
type Checker<K extends MischiefGoal["kind"]> = (
  goal: GoalOf<K>,
  cat: CatId,
  before: number,
  state: GameState,
  ctx: StepContext,
) => number;

function happened(state: GameState, match: (event: GameEvent) => boolean): number {
  return state.events.some(match) ? 1 : 0;
}

function isTeasing(state: GameState, cat: CatId, ctx: StepContext): boolean {
  const me = state.cats[cat];
  const rival = state.cats[otherCat(cat)];
  return me.hidden && distance(me.pos, rival.pos) <= ctx.settings.hide.teaseRange;
}

/** One small check per kind of goal. */
const CHECKERS: { readonly [K in MischiefGoal["kind"]]: Checker<K> } = {
  knock: (goal, cat, _before, state) =>
    happened(
      state,
      (e) => e.kind === "knocked" && e.by === cat && e.knockableId === goal.knockableId,
    ),
  claim: (goal, cat, _before, state) =>
    happened(state, (e) => e.kind === "captured" && e.by === cat && e.pointId === goal.pointId),
  own_count: (goal, cat, _before, state) =>
    state.points.filter((p) => p.owner === cat).length >= goal.count ? 1 : 0,
  swat: (_goal, cat, _before, state) =>
    happened(state, (e) => e.kind === "swatted" && e.by === cat),
  tease: (goal, cat, before, state, ctx) =>
    isTeasing(state, cat, ctx) ? before + ctx.dt / goal.seconds : before,
  treat: (goal, cat, _before, state) =>
    happened(state, (e) => e.kind === "treat" && e.by === cat && e.treatId === goal.treatId),
};

function progressAfter(def: MischiefDef, item: MischiefState, state: GameState, ctx: StepContext) {
  const check = CHECKERS[def.goal.kind] as Checker<MischiefGoal["kind"]>;
  return Math.min(1, check(def.goal, def.cat, item.progress, state, ctx));
}

function advance(item: MischiefState, state: GameState, ctx: StepContext): MischiefState {
  if (item.done) return item;
  const def = ctx.world.mischief.find((d) => d.id === item.id);
  if (def === undefined) return item;
  const progress = progressAfter(def, item, state, ctx);
  return { ...item, progress, done: progress >= 1 };
}

function reward(state: GameState, item: MischiefState, ctx: StepContext): GameState {
  const paid = withCat(state, addScore(state.cats[item.cat], ctx.settings.mischief.points));
  return withEvents(paid, [{ kind: "mischief", mischiefId: item.id, by: item.cat }]);
}

/** Rule: tick off any mischief-list item whose goal was met this step, and pay its bonus. */
export function updateMischief(state: GameState, ctx: StepContext): GameState {
  const mischief = state.mischief.map((item) => advance(item, state, ctx));
  const newlyDone = mischief.filter(
    (item, index) => item.done && state.mischief[index]?.done !== true,
  );
  const updated: GameState = { ...state, mischief };
  return newlyDone.reduce((s, item) => reward(s, item, ctx), updated);
}
