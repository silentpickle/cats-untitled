/**
 * The contract between the game rules (src/sim) and everything that draws or drives them.
 * The sim is pure: no Three.js, no DOM, no clocks. Positions are metres on the floor plane.
 */

export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export type CatId = "brother" | "sister";

export const CAT_IDS: readonly CatId[] = ["brother", "sister"];

/** Axis-aligned rectangle on the floor. */
export interface Rect {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

/** Who a piece of furniture or wall stops. The sister fits under things her brother cannot. */
export type Blocks = "both" | "brother";

export interface Obstacle {
  readonly rect: Rect;
  readonly blocks: Blocks;
}

export interface NapPointDef {
  readonly id: string;
  readonly name: string;
  readonly pos: Vec2;
}

/** A zone where the sister counts as hidden (usually the same rect as a "brother" obstacle). */
export interface HideSpotDef {
  readonly id: string;
  readonly rect: Rect;
}

export interface TreatSpawnDef {
  readonly id: string;
  readonly pos: Vec2;
}

export interface WorldDef {
  readonly bounds: Rect;
  readonly obstacles: readonly Obstacle[];
  readonly napPoints: readonly NapPointDef[];
  readonly hideSpots: readonly HideSpotDef[];
  readonly treatSpawns: readonly TreatSpawnDef[];
  readonly spawn: Readonly<Record<CatId, Vec2>>;
}

export interface CatSettings {
  readonly speed: number;
  readonly scale: number;
  readonly captureMultiplier: number;
  readonly radius: number;
}

/** Mirrors config.toml; see that file for what each value means. */
export interface Settings {
  readonly round: { readonly durationSeconds: number };
  readonly capture: {
    readonly secondsToCapture: number;
    readonly pointsPerSecond: number;
    readonly radius: number;
  };
  readonly cats: Readonly<Record<CatId, CatSettings>>;
  readonly swat: {
    readonly range: number;
    readonly stunSeconds: number;
    readonly cooldownSeconds: number;
    readonly fleeSeconds: number;
  };
  readonly hide: { readonly pointsPerSecond: number; readonly teaseRange: number };
  readonly treats: {
    readonly points: number;
    readonly respawnSeconds: number;
    readonly pickupRadius: number;
  };
}

export interface CatState {
  readonly id: CatId;
  readonly pos: Vec2;
  /** Radians, 0 faces +z, increasing toward +x. */
  readonly facing: number;
  readonly moving: boolean;
  /** Sitting still on a nap point. */
  readonly napping: boolean;
  /** Sister only: inside a hide spot. */
  readonly hidden: boolean;
  /** Seconds left unable to act after being swatted. */
  readonly stunnedFor: number;
  /** Seconds left of forced running away after the stun. */
  readonly fleeFor: number;
  /** Brother only: seconds until he can swat again. */
  readonly swatCooldown: number;
  readonly score: number;
}

export interface NapPointState {
  readonly id: string;
  readonly owner: CatId | null;
  /** Who is currently filling the meter, if anyone. */
  readonly capturer: CatId | null;
  /** 0 to 1 toward the capturer taking the point. */
  readonly progress: number;
}

export interface TreatState {
  readonly id: string;
  readonly available: boolean;
  readonly respawnIn: number;
}

export type GameEvent =
  | { readonly kind: "captured"; readonly pointId: string; readonly by: CatId }
  | { readonly kind: "swatted"; readonly by: CatId; readonly target: CatId }
  | { readonly kind: "swat_missed"; readonly by: CatId }
  | { readonly kind: "treat"; readonly treatId: string; readonly by: CatId }
  | { readonly kind: "round_over"; readonly winner: CatId | "tie" };

export type Phase = "playing" | "finished";

export interface GameState {
  readonly phase: Phase;
  readonly timeLeft: number;
  readonly cats: Readonly<Record<CatId, CatState>>;
  readonly points: readonly NapPointState[];
  readonly treats: readonly TreatState[];
  /** Things that happened during the step that produced this state. */
  readonly events: readonly GameEvent[];
}

export interface CatInput {
  /** Desired direction; length is clamped to 1. */
  readonly move: Vec2;
  /** Brother only; ignored for the sister. */
  readonly swat: boolean;
}

export type Inputs = Readonly<Record<CatId, CatInput>>;
