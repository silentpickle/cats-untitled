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

/** Something small a cat can knock over by brushing past it. */
export interface KnockableDef {
  readonly id: string;
  readonly name: string;
  readonly pos: Vec2;
}

/** What has to happen for a mischief-list item to be ticked off. */
export type MischiefGoal =
  | { readonly kind: "knock"; readonly knockableId: string }
  | { readonly kind: "claim"; readonly pointId: string }
  | { readonly kind: "own_count"; readonly count: number }
  | { readonly kind: "swat" }
  | { readonly kind: "tease"; readonly seconds: number }
  | { readonly kind: "treat"; readonly treatId: string };

/** One line on a cat's to-do list. */
export interface MischiefDef {
  readonly id: string;
  readonly label: string;
  readonly cat: CatId;
  readonly goal: MischiefGoal;
}

/**
 * Where a bird can follow Aragorn in from the patio, and where it lands once inside. A house without an
 * open door to the outside has none.
 */
export interface BirdPathDef {
  /** Aragorn counts as outside while he stands here. */
  readonly patio: Rect;
  /** Just inside the open door: the bird comes in and goes out here. */
  readonly door: Vec2;
  /** Out over the patio, where the bird flies off. */
  readonly outside: Vec2;
  /** Places it lands, in the order it flits between them. */
  readonly perches: readonly Vec2[];
}

export interface WorldDef {
  readonly bounds: Rect;
  readonly obstacles: readonly Obstacle[];
  readonly napPoints: readonly NapPointDef[];
  readonly hideSpots: readonly HideSpotDef[];
  readonly treatSpawns: readonly TreatSpawnDef[];
  readonly knockables: readonly KnockableDef[];
  readonly mischief: readonly MischiefDef[];
  readonly spawn: Readonly<Record<CatId, Vec2>>;
  readonly bird?: BirdPathDef;
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
    /** Wait after a swat that lands. */
    readonly cooldownSeconds: number;
    /** Shorter wait after a swat that hits nothing, so he can try again. */
    readonly missCooldownSeconds: number;
    readonly fleeSeconds: number;
  };
  readonly stealth: { readonly seconds: number; readonly cooldownSeconds: number };
  readonly hide: { readonly pointsPerSecond: number; readonly teaseRange: number };
  readonly treats: {
    readonly points: number;
    readonly respawnSeconds: number;
    readonly pickupRadius: number;
  };
  readonly mischief: {
    readonly points: number;
    readonly knockRadius: number;
    readonly knockPoints: number;
    readonly resetSeconds: number;
  };
  readonly bird: {
    /** How long it stays in before heading back out. */
    readonly seconds: number;
    readonly speed: number;
    /** Aragorn this close sends it off its perch to the next one. */
    readonly scareRadius: number;
    /** Wait after one leaves before another can follow him in. */
    readonly cooldownSeconds: number;
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
  /** Sister only: seconds of stealth left; she cannot be swatted while it runs. */
  readonly stealthFor: number;
  /** Sister only: seconds until she can go stealthy again, counted from when she last did. */
  readonly stealthCooldown: number;
  /** Brother only: a bird is in and he cannot help chasing it; his own input is ignored. */
  readonly chasing: boolean;
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

export interface KnockableState {
  readonly id: string;
  readonly knockedBy: CatId | null;
  /** Seconds until someone puts it back; 0 while it is standing. */
  readonly resetIn: number;
}

export interface MischiefState {
  readonly id: string;
  readonly cat: CatId;
  readonly done: boolean;
  /** 0 to 1; only goals that take time (teasing) sit between the two. */
  readonly progress: number;
}

/** No bird; in the house, flitting between perches; on its way back out the door. */
export type BirdPhase = "away" | "in" | "leaving";

export interface BirdState {
  readonly phase: BirdPhase;
  readonly pos: Vec2;
  /** While in, the perch it is on or flying to; while leaving, 0 for the door and 1 for outside. */
  readonly target: number;
  readonly perched: boolean;
  /** Seconds left before it heads for the door. */
  readonly inFor: number;
  /** Seconds until another bird can follow Aragorn in. */
  readonly cooldown: number;
  /** Aragorn was out on the patio at the end of the last step. */
  readonly brotherOutside: boolean;
}

export type GameEvent =
  | { readonly kind: "captured"; readonly pointId: string; readonly by: CatId }
  | { readonly kind: "swatted"; readonly by: CatId; readonly target: CatId }
  | { readonly kind: "swat_missed"; readonly by: CatId }
  | { readonly kind: "stealth"; readonly by: CatId }
  | { readonly kind: "treat"; readonly treatId: string; readonly by: CatId }
  | { readonly kind: "knocked"; readonly knockableId: string; readonly by: CatId }
  | { readonly kind: "mischief"; readonly mischiefId: string; readonly by: CatId }
  | { readonly kind: "bird_in" }
  | { readonly kind: "bird_out" }
  | { readonly kind: "round_over"; readonly winner: CatId | "tie" };

export type Phase = "playing" | "finished";

export interface GameState {
  readonly phase: Phase;
  readonly timeLeft: number;
  readonly cats: Readonly<Record<CatId, CatState>>;
  readonly points: readonly NapPointState[];
  readonly treats: readonly TreatState[];
  readonly knockables: readonly KnockableState[];
  readonly mischief: readonly MischiefState[];
  readonly bird: BirdState;
  /** Things that happened during the step that produced this state. */
  readonly events: readonly GameEvent[];
}

export interface CatInput {
  /** Desired direction; length is clamped to 1. */
  readonly move: Vec2;
  /** Brother only; ignored for the sister. */
  readonly swat: boolean;
  /** Sister only; ignored for the brother. */
  readonly stealth: boolean;
}

export type Inputs = Readonly<Record<CatId, CatInput>>;
