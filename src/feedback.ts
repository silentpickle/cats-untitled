import type { SoundName } from "./audio";
import type { CatId, GameEvent, WorldDef } from "./sim/types";
import { catName } from "./ui/screens";

/** What the player should hear and read when something happens in the game. */
export interface Feedback {
  readonly toast: string | null;
  readonly sounds: readonly SoundName[];
}

type FeedbackFor<K extends GameEvent["kind"]> = (
  event: Extract<GameEvent, { kind: K }>,
  player: CatId,
  world: WorldDef,
) => Feedback;

const MEOWS: Record<CatId, SoundName> = { brother: "meow_brother", sister: "meow_sister" };

function nameOf(list: readonly { id: string; name: string }[], id: string): string {
  return list.find((entry) => entry.id === id)?.name ?? id;
}

/** One small rule per kind of event. */
const RULES: { readonly [K in GameEvent["kind"]]: FeedbackFor<K> } = {
  captured: (event, player, world) => ({
    toast: `${catName(event.by)} claimed the ${nameOf(world.napPoints, event.pointId)}`,
    sounds: event.by === player ? ["capture", MEOWS[player]] : ["capture_lost"],
  }),
  swatted: () => ({ toast: "Swat!", sounds: ["swat", "startled"] }),
  swat_missed: (event, player) => ({
    toast: event.by === player ? "Missed!" : null,
    sounds: ["swat_miss"],
  }),
  stealth: (event, player) => ({
    toast: event.by === player ? "Stealth!" : `${catName(event.by)} vanished`,
    sounds: ["swat_miss"],
  }),
  treat: (event, player) => ({
    toast: `${catName(event.by)} found a treat`,
    sounds: event.by === player ? ["treat"] : [],
  }),
  knocked: (event, _player, world) => ({
    toast: `${catName(event.by)} knocked over the ${nameOf(world.knockables, event.knockableId)}`,
    sounds: ["knock"],
  }),
  mischief: (event, player, world) => ({
    toast:
      event.by === player
        ? `Mischief done: ${world.mischief.find((m) => m.id === event.mischiefId)?.label ?? ""}`
        : null,
    sounds: event.by === player ? ["mischief"] : [],
  }),
  bird_in: (_event, player) => ({
    toast:
      player === "brother" ? "A bird! You can't help yourself." : "A bird followed Aragorn in!",
    sounds: ["chirp"],
  }),
  bird_out: () => ({ toast: "The bird got away", sounds: ["chirp"] }),
  round_over: (event, player) => ({
    toast: null,
    sounds: [event.winner === player || event.winner === "tie" ? "round_win" : "round_lose"],
  }),
};

export function feedbackFor(event: GameEvent, player: CatId, world: WorldDef): Feedback {
  const rule = RULES[event.kind] as FeedbackFor<GameEvent["kind"]>;
  return rule(event, player, world);
}
