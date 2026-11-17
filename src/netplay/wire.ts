// Checks what arrives off the network before the game touches it. Every decoder rebuilds its value
// from the known fields only, so extra keys, wrong types and non-finite numbers never get through.
import type { CatId, CatInput, CatState, GameEvent, GameState, Phase, Vec2 } from "../sim/types";
import { CAT_IDS } from "../sim/types";

/** Marks a value that failed to decode. Not `null`, because some fields are legitimately null. */
const INVALID = Symbol("invalid");
type Invalid = typeof INVALID;
type Decoder<T> = (raw: unknown) => T | Invalid;
type Decoded<D> = D extends Decoder<infer T> ? T : never;
type Shape = Readonly<Record<string, Decoder<unknown>>>;
type ShapeOf<S extends Shape> = { -readonly [K in keyof S]: Decoded<S[K]> };

/** No list in the game comes close; this only stops a hostile peer making us walk a huge array. */
const MAX_LIST_LENGTH = 256;
const MAX_MOVE_LENGTH = 1;
const PHASES: readonly Phase[] = ["playing", "finished"];
const WINNERS: readonly (CatId | "tie")[] = [...CAT_IDS, "tie"];

// --- Primitive decoders ---------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(raw: unknown): number | Invalid {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : INVALID;
}

function bool(raw: unknown): boolean | Invalid {
  return typeof raw === "boolean" ? raw : INVALID;
}

function str(raw: unknown): string | Invalid {
  return typeof raw === "string" ? raw : INVALID;
}

function oneOf<T extends string>(values: readonly T[]): Decoder<T> {
  return (raw) => values.find((value) => value === raw) ?? INVALID;
}

function literal<T extends string>(value: T): Decoder<T> {
  return oneOf([value]);
}

function nullable<T>(decode: Decoder<T>): Decoder<T | null> {
  return (raw) => (raw === null ? null : decode(raw));
}

function arrayOf<T>(decode: Decoder<T>): Decoder<T[]> {
  return (raw) => {
    if (!Array.isArray(raw) || raw.length > MAX_LIST_LENGTH) {
      return INVALID;
    }
    const out: T[] = [];
    for (const item of raw) {
      const value = decode(item);
      if (value === INVALID) {
        return INVALID;
      }
      out.push(value);
    }
    return out;
  };
}

function hasShape<S extends Shape>(out: Record<string, unknown>, shape: S): out is ShapeOf<S> {
  return Object.keys(shape).every((key) => Object.hasOwn(out, key));
}

/** An object with exactly these fields, each present and valid; any other keys are dropped. */
function object<S extends Shape>(shape: S): Decoder<ShapeOf<S>> {
  return (raw) => {
    if (!isRecord(raw)) {
      return INVALID;
    }
    const out: Record<string, unknown> = {};
    for (const [key, decode] of Object.entries(shape)) {
      const value = Object.hasOwn(raw, key) ? decode(raw[key]) : INVALID;
      if (value === INVALID) {
        return INVALID;
      }
      out[key] = value;
    }
    return hasShape(out, shape) ? out : INVALID;
  };
}

// --- Game shapes ----------------------------------------------------------------------------

const catId = oneOf(CAT_IDS);
const vec2: Decoder<Vec2> = object({ x: finite, z: finite });

const catState: Decoder<CatState> = object({
  id: catId,
  pos: vec2,
  facing: finite,
  moving: bool,
  napping: bool,
  hidden: bool,
  stunnedFor: finite,
  fleeFor: finite,
  swatCooldown: finite,
  stealthFor: finite,
  stealthCooldown: finite,
  score: finite,
});

/** The cat stored under `cats[id]` must say it is that cat. */
function catNamed(id: CatId): Decoder<CatState> {
  return (raw) => {
    const cat = catState(raw);
    return cat !== INVALID && cat.id === id ? cat : INVALID;
  };
}

const napPoint = object({
  id: str,
  owner: nullable(catId),
  capturer: nullable(catId),
  progress: finite,
});

const treat = object({ id: str, available: bool, respawnIn: finite });
const knockable = object({ id: str, knockedBy: nullable(catId), resetIn: finite });
const mischief = object({ id: str, cat: catId, done: bool, progress: finite });

// --- Events: one decoder per kind -----------------------------------------------------------

type EventKind = GameEvent["kind"];

const EVENT_DECODERS: { readonly [K in EventKind]: Decoder<Extract<GameEvent, { kind: K }>> } = {
  captured: object({ kind: literal("captured"), pointId: str, by: catId }),
  swatted: object({ kind: literal("swatted"), by: catId, target: catId }),
  swat_missed: object({ kind: literal("swat_missed"), by: catId }),
  stealth: object({ kind: literal("stealth"), by: catId }),
  treat: object({ kind: literal("treat"), treatId: str, by: catId }),
  knocked: object({ kind: literal("knocked"), knockableId: str, by: catId }),
  mischief: object({ kind: literal("mischief"), mischiefId: str, by: catId }),
  round_over: object({ kind: literal("round_over"), winner: oneOf(WINNERS) }),
};

function isEventKind(value: unknown): value is EventKind {
  return typeof value === "string" && Object.hasOwn(EVENT_DECODERS, value);
}

function gameEvent(raw: unknown): GameEvent | Invalid {
  if (!isRecord(raw) || !isEventKind(raw.kind)) {
    return INVALID;
  }
  return EVENT_DECODERS[raw.kind](raw);
}

// --- Top level ------------------------------------------------------------------------------

const gameState: Decoder<GameState> = object({
  phase: oneOf(PHASES),
  timeLeft: finite,
  cats: object({ brother: catNamed("brother"), sister: catNamed("sister") }),
  points: arrayOf(napPoint),
  treats: arrayOf(treat),
  knockables: arrayOf(knockable),
  mischief: arrayOf(mischief),
  events: arrayOf(gameEvent),
});

const catInput: Decoder<CatInput> = object({ move: vec2, swat: bool, stealth: bool });

function clampLength(move: Vec2): Vec2 {
  const length = Math.hypot(move.x, move.z);
  if (length <= MAX_MOVE_LENGTH) {
    return move;
  }
  const scale = MAX_MOVE_LENGTH / length;
  return { x: move.x * scale, z: move.z * scale };
}

function orNull<T>(value: T | Invalid): T | null {
  return value === INVALID ? null : value;
}

/** A full game state from the host, or null if any part of it is the wrong shape. */
export function decodeGameState(raw: unknown): GameState | null {
  return orNull(gameState(raw));
}

/** A guest's input, with its move vector clamped to length 1, or null if it is the wrong shape. */
export function decodeCatInput(raw: unknown): CatInput | null {
  const input = catInput(raw);
  if (input === INVALID) {
    return null;
  }
  return { ...input, move: clampLength(input.move) };
}
