import type {
  BirdPathDef,
  Blocks,
  KnockableDef,
  MischiefDef,
  NapPointDef,
  Rect,
  TreatSpawnDef,
  Vec2,
} from "../sim/types";

/** Quarter turns clockwise seen from above; 0 means the piece's front faces +z (toward the camera). */
export type Turns = 0 | 1 | 2 | 3;

export interface Size3 {
  /** Along x after turning. */
  readonly w: number;
  /** Along z after turning. */
  readonly d: number;
  readonly h: number;
}

export interface FurnitureDef {
  readonly id: string;
  /** Kenney furniture kit model name, or null for a plain box. */
  readonly model: string | null;
  readonly pos: Vec2;
  readonly size: Size3;
  readonly turns: Turns;
  /** Height of the base above the floor (a TV on its stand). */
  readonly lift?: number;
  /** Who it stops. Omitted means cats pass through or over it. */
  readonly blocks?: Blocks;
  /** Cats standing inside its footprint are raised to this height (couch seat, counter top). */
  readonly platformHeight?: number;
  /** The sister counts as hidden inside its footprint. */
  readonly hide?: boolean;
  /** Box colour when there is no model. */
  readonly color?: number;
  /** Replaces the kit's pink upholstery and rug colour on this piece. */
  readonly tint?: number;
  /** Recolours the kit model's parts by material name (wood, woodDark, metal, lamp, carpet...). */
  readonly paint?: Readonly<Record<string, number>>;
  /** A drawn pattern on a plain box (a rug, a throw, a painting) in place of its flat colour. */
  readonly surface?: SurfaceName;
  /** Lit from within (the fire). */
  readonly glow?: boolean;
}

/** Patterns drawn from the house photos (render/surfaces.ts). */
export type SurfaceName =
  | "hardwood"
  | "tile"
  | "carpet"
  | "concrete"
  | "grass"
  | "deck"
  | "granite"
  | "vintageRug"
  | "plaid"
  | "floralCurtain"
  | "runner"
  | "quilt"
  | "peacockThrow"
  | "orangeThrow"
  | "treePainting"
  | "catPainting";

/**
 * `catDoor` is a two-panel sliding door left half open: the panel at the `to` end stands slid back over
 * the fixed one at the `from` end, on the outside track, and cats walk through the `to` half.
 */
export type WallKind = "wall" | "window" | "slider" | "door" | "catDoor";

/** Axis-aligned wall segment. */
export interface WallDef {
  readonly from: Vec2;
  readonly to: Vec2;
  readonly kind: WallKind;
  /** Drawn as a low curb so the camera sees past it. */
  readonly cutaway?: boolean;
}

export type FloorMaterial =
  "carpet" | "tile" | "wood" | "concrete" | "stairwell" | "sunbeam" | "deck";

export interface FloorAreaDef {
  readonly rect: Rect;
  readonly material: FloorMaterial;
}

export interface NapPointPlacement extends NapPointDef {
  /** Height of the marker (0 on the floor, seat height on a couch). */
  readonly height: number;
}

export type KnockableLook = "cup" | "remote" | "toy";

export interface KnockablePlacement extends KnockableDef {
  /** Height of whatever it stands on. */
  readonly height: number;
  readonly look: KnockableLook;
}

/** A place the bird lands, and how high off the floor (a table top, the cat tree). */
export interface PerchPlacement {
  readonly pos: Vec2;
  readonly height: number;
}

export interface BirdPathPlacement extends Omit<BirdPathDef, "perches"> {
  readonly perches: readonly PerchPlacement[];
}

export interface HouseFloor {
  readonly id: string;
  readonly name: string;
  readonly bounds: Rect;
  readonly floors: readonly FloorAreaDef[];
  readonly walls: readonly WallDef[];
  readonly furniture: readonly FurnitureDef[];
  readonly napPoints: readonly NapPointPlacement[];
  readonly treatSpawns: readonly TreatSpawnDef[];
  readonly knockables: readonly KnockablePlacement[];
  readonly mischief: readonly MischiefDef[];
  readonly spawn: { readonly brother: Vec2; readonly sister: Vec2 };
  /** Where a bird can follow Aragorn in; omitted for a house shut to the outside. */
  readonly bird?: BirdPathPlacement;
}
