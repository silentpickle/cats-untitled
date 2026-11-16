import type { CatId, GameEvent, GameState, KnockableState, Vec2 } from "./types";
import { CAT_IDS } from "./types";
import type { StepContext } from "./context";
import { distance } from "./geometry";
import { addScore, countDown, withCat, withEvents } from "./stateOps";

/** The non-stunned cat within reach that is nearest the thing; the brother wins an exact tie. */
function knocker(state: GameState, pos: Vec2, radius: number): CatId | undefined {
  const reach = (id: CatId): number => distance(state.cats[id].pos, pos);
  const eligible = CAT_IDS.filter((id) => state.cats[id].stunnedFor === 0 && reach(id) <= radius);
  return [...eligible].sort((a, b) => reach(a) - reach(b))[0];
}

function knockedBy(state: GameState, item: KnockableState, ctx: StepContext): CatId | undefined {
  if (item.knockedBy !== null) return undefined;
  const def = ctx.world.knockables.find((d) => d.id === item.id);
  if (def === undefined) return undefined;
  return knocker(state, def.pos, ctx.settings.mischief.knockRadius);
}

/** Rule: knocked things are put back after a while. */
export function resetKnocked(state: GameState, ctx: StepContext): GameState {
  const knockables = state.knockables.map((item) => {
    if (item.knockedBy === null) return item;
    const resetIn = countDown(item.resetIn, ctx.dt);
    return { ...item, resetIn, knockedBy: resetIn === 0 ? null : item.knockedBy };
  });
  return { ...state, knockables };
}

function knock(state: GameState, itemId: string, by: CatId, ctx: StepContext): GameState {
  const { knockPoints, resetSeconds } = ctx.settings.mischief;
  const knockables = state.knockables.map((item) =>
    item.id === itemId ? { ...item, knockedBy: by, resetIn: resetSeconds } : item,
  );
  const paid = withCat({ ...state, knockables }, addScore(state.cats[by], knockPoints));
  const event: GameEvent = { kind: "knocked", knockableId: itemId, by };
  return withEvents(paid, [event]);
}

/** Rule: a cat that brushes past something knockable sends it flying, for a small bonus. */
export function knockThings(state: GameState, ctx: StepContext): GameState {
  return state.knockables.reduce((s, item) => {
    const by = knockedBy(s, item, ctx);
    return by === undefined ? s : knock(s, item.id, by, ctx);
  }, state);
}
