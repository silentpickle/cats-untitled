import type { CatId, GameState, Vec2, WorldDef } from "./types";
import type { StepContext } from "./context";
import { distance, pointInRect } from "./geometry";
import { addScore, mapCats, withCat } from "./stateOps";

/** The sister is hidden while her centre is inside a hide spot. The brother never hides. */
export function isHidden(world: WorldDef, cat: CatId, pos: Vec2): boolean {
  return cat === "sister" && world.hideSpots.some((spot) => pointInRect(pos, spot.rect));
}

/** Rule: refresh each cat's hidden flag from where it now stands. */
export function updateHidden(state: GameState, ctx: StepContext): GameState {
  return mapCats(state, (cat) => ({ ...cat, hidden: isHidden(ctx.world, cat.id, cat.pos) }));
}

/** Rule: the sister scores for hiding within tease range of her brother. */
export function scoreHiding(state: GameState, ctx: StepContext): GameState {
  const { sister, brother } = state.cats;
  if (!sister.hidden) return state;
  if (distance(sister.pos, brother.pos) > ctx.settings.hide.teaseRange) return state;
  return withCat(state, addScore(sister, ctx.settings.hide.pointsPerSecond * ctx.dt));
}
