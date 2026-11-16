import type { CatId, CatState, GameState, Settings, WorldDef } from "./types";
import { isHidden } from "./hide";

function newCat(id: CatId, world: WorldDef): CatState {
  const pos = world.spawn[id];
  return {
    id,
    pos,
    facing: 0,
    moving: false,
    napping: false,
    hidden: isHidden(world, id, pos),
    stunnedFor: 0,
    fleeFor: 0,
    swatCooldown: 0,
    stealthFor: 0,
    stealthCooldown: 0,
    score: 0,
  };
}

/** A fresh round: cats at their spawns, every point free, every treat out. */
export function createGame(world: WorldDef, settings: Settings): GameState {
  return {
    phase: "playing",
    timeLeft: settings.round.durationSeconds,
    cats: { brother: newCat("brother", world), sister: newCat("sister", world) },
    points: world.napPoints.map((p) => ({ id: p.id, owner: null, capturer: null, progress: 0 })),
    treats: world.treatSpawns.map((t) => ({ id: t.id, available: true, respawnIn: 0 })),
    knockables: world.knockables.map((k) => ({ id: k.id, knockedBy: null, resetIn: 0 })),
    mischief: world.mischief.map((m) => ({ id: m.id, cat: m.cat, done: false, progress: 0 })),
    events: [],
  };
}
