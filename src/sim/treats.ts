import type { CatId, GameState, Settings, TreatState, Vec2 } from "./types";
import { CAT_IDS } from "./types";
import type { StepContext } from "./context";
import { distance } from "./geometry";
import { addScore, countDown, withCat, withEvents } from "./stateOps";

function tickTreat(treat: TreatState, dt: number): TreatState {
  if (treat.available) return treat;
  const respawnIn = countDown(treat.respawnIn, dt);
  return { ...treat, respawnIn, available: respawnIn === 0 };
}

/** Rule: taken treats count down to respawning. */
export function tickTreats(state: GameState, ctx: StepContext): GameState {
  return { ...state, treats: state.treats.map((t) => tickTreat(t, ctx.dt)) };
}

/** The non-stunned cat in pickup range nearest the treat; the brother wins an exact tie. */
function taker(state: GameState, pos: Vec2, settings: Settings): CatId | undefined {
  const reach = (id: CatId) => distance(state.cats[id].pos, pos);
  const eligible = CAT_IDS.filter(
    (id) => state.cats[id].stunnedFor === 0 && reach(id) <= settings.treats.pickupRadius,
  );
  return [...eligible].sort((a, b) => reach(a) - reach(b))[0];
}

function takeTreat(state: GameState, treatId: string, by: CatId, settings: Settings): GameState {
  const treats = state.treats.map((t) =>
    t.id === treatId ? { ...t, available: false, respawnIn: settings.treats.respawnSeconds } : t,
  );
  const fed = withCat({ ...state, treats }, addScore(state.cats[by], settings.treats.points));
  return withEvents(fed, [{ kind: "treat", treatId, by }]);
}

function pickUp(state: GameState, treat: TreatState, ctx: StepContext): GameState {
  const def = ctx.world.treatSpawns.find((d) => d.id === treat.id);
  if (!treat.available || def === undefined) return state;
  const by = taker(state, def.pos, ctx.settings);
  return by === undefined ? state : takeTreat(state, treat.id, by, ctx.settings);
}

/** Rule: a cat close enough to an available treat eats it. */
export function pickUpTreats(state: GameState, ctx: StepContext): GameState {
  return state.treats.reduce((s, treat) => pickUp(s, treat, ctx), state);
}
