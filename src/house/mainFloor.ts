import type { FurnitureDef, HouseFloor, Size3, Turns, WallDef, WallKind } from "./types";

/**
 * Main floor, laid out from the floor plan of the twin house (docs/plan.md) and dressed from
 * photos of the real one. Metres; x runs east, z runs south toward the camera. The fireplace
 * wall is north so the camera faces it.
 *
 * Rough map:                 north (balcony slider, fireplace)
 *   den (dining table) |  living room      |  primary bedroom
 *   kitchen + island   |                   |  hall, closet, bath
 *   laundry | stairs   |  foyer            |  bath
 *   (garage, not built)   front door       |  second bedroom
 *
 * Walls inside the house are low curbs so the camera sees over them; only the pillar wall behind
 * the island stands full height.
 */

const FACES_SOUTH: Turns = 0;
const FACES_WEST: Turns = 1;
const FACES_NORTH: Turns = 2;
const FACES_EAST: Turns = 3;

/** Colours picked off the photos of the house. */
const COLORS = {
  mantel: 0xf4f1ea,
  firebox: 0x1c1a1a,
  fire: 0xff8a2a,
  ottoman: 0xd8cfa8,
  oak: 0xb4743a,
  oakDark: 0x8e5526,
  espresso: 0x45291c,
  cherryTable: 0xa8492b,
  maple: 0xd29a58,
  wicker: 0xb39a6e,
  rockerGreen: 0x2f5a46,
  blackMetal: 0x1d1d1f,
  lampShade: 0xe3d3b0,
  stainless: 0xb9bdc0,
  whiteEnamel: 0xf1f0ec,
  stoolSeat: 0xcfd3d6,
  mustardThrow: 0xd9a21f,
  butterflyPillow: 0xd8cdb5,
  floralPillow: 0x8c8a5c,
  catTree: 0x2f55c8,
  sisal: 0xc9b48a,
  diningRug: 0x55565c,
  petBed: 0xc8553d,
  bowl: 0x3f7fc4,
  cushion: 0x9aa64a,
  sofa: 0x3c3f3b,
  foyerRug: 0x9c978c,
  halfWall: 0x5d667a,
  trim: 0xf7f5f0,
  bigBed: 0x8e3b3b,
  kidBed: 0x3f8f6b,
  kidRug: 0x4a79b8,
} as const;

function wall(x1: number, z1: number, x2: number, z2: number, kind: WallKind = "wall"): WallDef {
  return { from: { x: x1, z: z1 }, to: { x: x2, z: z2 }, kind };
}

function curb(x1: number, z1: number, x2: number, z2: number, kind: WallKind = "wall"): WallDef {
  return { ...wall(x1, z1, x2, z2, kind), cutaway: true };
}

const OUTSIDE_WALLS: readonly WallDef[] = [
  // North: balcony slider off the den, a window either side of the fireplace, bedroom window.
  wall(0, 0, 0.6, 0),
  wall(0.6, 0, 2.5, 0, "slider"),
  wall(2.5, 0, 3.1, 0),
  wall(3.1, 0, 3.9, 0, "window"),
  wall(3.9, 0, 5.9, 0),
  wall(5.9, 0, 6.7, 0, "window"),
  wall(6.7, 0, 8.4, 0),
  wall(8.4, 0, 10.2, 0, "window"),
  wall(10.2, 0, 11.4, 0),
  wall(11.4, 0, 11.4, 12.1),
  // West: kitchen window over the sink.
  wall(0, 0, 0, 4.2),
  wall(0, 4.2, 0, 5.3, "window"),
  wall(0, 5.3, 0, 9.4),
  // South is cut away: the door to the garage from the laundry, then the front door.
  curb(0, 9.4, 1.2, 9.4),
  curb(1.2, 9.4, 2.1, 9.4, "door"),
  curb(2.1, 9.4, 6.3, 9.4),
  curb(6.3, 9.4, 7.3, 9.4, "door"),
  curb(7.3, 9.4, 7.95, 9.4),
  // The second bedroom sticks out past the front door.
  curb(7.95, 9.4, 7.95, 12.1),
  curb(7.95, 12.1, 11.4, 12.1),
];

const INSIDE_WALLS: readonly WallDef[] = [
  // Kitchen: the pillar wall behind the island, the walkthrough, then the fridge wall.
  wall(3.1, 3.4, 3.1, 4.5),
  curb(3.1, 5.7, 3.1, 9.4),
  // Kitchen to laundry, with the laundry door left open.
  curb(0, 7, 1.1, 7),
  curb(2.2, 7, 3.1, 7),
  // Living room to the bedroom wing; the gap is the hall.
  curb(7, 0, 7, 3.5),
  curb(7, 5.5, 7, 6.3),
  // Primary bedroom's south wall: doors to the hall, the walk-in closet and its bath.
  curb(7, 3.3, 7.15, 3.3),
  curb(8.05, 3.3, 8.45, 3.3),
  curb(9.35, 3.3, 10.1, 3.3),
  curb(11, 3.3, 11.4, 3.3),
  curb(8.2, 3.3, 8.2, 6.3),
  curb(9.6, 3.3, 9.6, 6.3),
  curb(7, 6.3, 11.4, 6.3),
  // Second bath, off the foyer.
  curb(8.8, 6.3, 8.8, 7),
  curb(8.8, 7.9, 8.8, 8.3),
  curb(8.8, 8.3, 11.4, 8.3),
];

/** One drawn-back curtain beside a living-room window. */
function curtain(id: string, x: number): FurnitureDef {
  return {
    id,
    model: null,
    pos: { x, z: 0.14 },
    size: { w: 0.35, d: 0.08, h: 2.2 },
    turns: FACES_SOUTH,
    surface: "floralCurtain",
  };
}

/** A thin thing laid on or hung over furniture: throws, pillows, pictures. Cats pass through it. */
function dressing(
  id: string,
  x: number,
  z: number,
  size: Size3,
  lift: number,
  look: Pick<FurnitureDef, "color" | "surface">,
): FurnitureDef {
  return { id, model: null, pos: { x, z }, size, turns: FACES_SOUTH, lift, ...look };
}

/** What the photos add around the living room: throws, pillows, pictures, the rocker, a box. */
const LIVING_DRESSING: readonly FurnitureDef[] = [
  dressing("coffee_runner", 5, 2.5, { w: 1, d: 0.32, h: 0.01 }, 0.45, { surface: "runner" }),
  dressing("throw_mustard", 6.32, 2.05, { w: 0.5, d: 0.8, h: 0.03 }, 0.42, {
    color: COLORS.mustardThrow,
  }),
  dressing("throw_peacock", 6.86, 2.3, { w: 0.18, d: 1.3, h: 0.4 }, 0.45, {
    surface: "peacockThrow",
  }),
  dressing("quilt_back", 5.55, 4.26, { w: 1.2, d: 0.16, h: 0.4 }, 0.45, { surface: "quilt" }),
  dressing("pillow_butterfly", 6.78, 1.75, { w: 0.14, d: 0.42, h: 0.32 }, 0.42, {
    color: COLORS.butterflyPillow,
  }),
  dressing("pillow_floral_a", 6.75, 3.1, { w: 0.14, d: 0.36, h: 0.3 }, 0.42, {
    color: COLORS.floralPillow,
  }),
  dressing("pillow_floral_b", 4.5, 4.18, { w: 0.36, d: 0.14, h: 0.3 }, 0.42, {
    color: COLORS.floralPillow,
  }),
  dressing("painting_tree", 7.65, 0.1, { w: 0.95, d: 0.03, h: 0.63 }, 1.25, {
    surface: "treePainting",
  }),
  dressing("painting_cat", 2.75, 0.1, { w: 0.32, d: 0.03, h: 0.4 }, 1.25, {
    surface: "catPainting",
  }),
  dressing("console_plaid", 3.55, 1.5, { w: 0.4, d: 1.1, h: 0.03 }, 0.62, { surface: "plaid" }),
  dressing("rocker_throw", 3.85, 4.12, { w: 0.5, d: 0.1, h: 0.55 }, 0.45, {
    surface: "orangeThrow",
  }),
  dressing("rocker_runner_left", 3.6, 3.85, { w: 0.05, d: 0.75, h: 0.04 }, 0, {
    color: COLORS.rockerGreen,
  }),
  dressing("rocker_runner_right", 4.1, 3.85, { w: 0.05, d: 0.75, h: 0.04 }, 0, {
    color: COLORS.rockerGreen,
  }),
  {
    id: "rocker",
    model: "chairRounded",
    pos: { x: 3.85, z: 3.85 },
    size: { w: 0.55, d: 0.6, h: 0.95 },
    turns: FACES_NORTH,
    lift: 0.04,
    paint: { wood: COLORS.wicker },
  },
  {
    id: "console_bench",
    model: "table",
    pos: { x: 3.55, z: 1.5 },
    size: { w: 0.38, d: 1.05, h: 0.62 },
    turns: FACES_EAST,
    paint: { wood: COLORS.espresso },
  },
  {
    id: "cardboard_box",
    model: "cardboardBoxOpen",
    pos: { x: 6.2, z: 0.55 },
    size: { w: 0.45, d: 0.4, h: 0.3 },
    turns: FACES_SOUTH,
  },
  ...["stool_west", "stool_east"].map((id, i): FurnitureDef => ({
    id,
    model: "stoolBar",
    pos: { x: i === 0 ? 1.55 : 2.95, z: 3.17 },
    size: { w: 0.36, d: 0.36, h: 0.75 },
    turns: FACES_NORTH,
    paint: { wood: COLORS.blackMetal, carpet: COLORS.stoolSeat },
  })),
];

const LIVING: readonly FurnitureDef[] = [
  curtain("curtain_a", 3.05),
  curtain("curtain_b", 3.9),
  curtain("curtain_c", 5.85),
  curtain("curtain_d", 6.75),
  {
    id: "fireplace",
    model: null,
    pos: { x: 4.85, z: 0.3 },
    size: { w: 1.5, d: 0.45, h: 1.25 },
    turns: FACES_SOUTH,
    blocks: "both",
    color: COLORS.mantel,
  },
  {
    id: "firebox",
    model: null,
    pos: { x: 4.85, z: 0.5 },
    size: { w: 0.85, d: 0.1, h: 0.75 },
    turns: FACES_SOUTH,
    color: COLORS.firebox,
  },
  {
    id: "fire",
    model: null,
    pos: { x: 4.85, z: 0.54 },
    size: { w: 0.4, d: 0.06, h: 0.3 },
    turns: FACES_SOUTH,
    color: COLORS.fire,
    glow: true,
  },
  {
    id: "tv",
    model: "televisionModern",
    pos: { x: 4.85, z: 0.22 },
    size: { w: 1.4, d: 0.1, h: 0.8 },
    turns: FACES_SOUTH,
    lift: 1.4,
  },
  {
    id: "plant",
    model: "pottedPlant",
    pos: { x: 3.5, z: 0.45 },
    size: { w: 0.5, d: 0.5, h: 1.1 },
    turns: FACES_SOUTH,
    blocks: "both",
  },
  {
    id: "sofa_east",
    model: "loungeSofaLong",
    pos: { x: 6.5, z: 2.4 },
    size: { w: 0.95, d: 2.2, h: 0.85 },
    turns: FACES_WEST,
    tint: COLORS.sofa,
    platformHeight: 0.42,
  },
  {
    id: "sofa_south",
    model: "loungeSofa",
    pos: { x: 5.2, z: 3.9 },
    size: { w: 2, d: 0.9, h: 0.85 },
    turns: FACES_NORTH,
    tint: COLORS.sofa,
    platformHeight: 0.42,
  },
  {
    id: "rug_living",
    model: null,
    pos: { x: 5, z: 2.5 },
    size: { w: 2.6, d: 2, h: 0.02 },
    turns: FACES_SOUTH,
    surface: "vintageRug",
  },
  {
    id: "coffee_table",
    model: "tableCoffee",
    paint: { wood: COLORS.espresso },
    pos: { x: 5, z: 2.5 },
    size: { w: 1.2, d: 0.7, h: 0.45 },
    turns: FACES_SOUTH,
    blocks: "brother",
    hide: true,
  },
  {
    id: "side_table",
    model: "sideTable",
    paint: { wood: COLORS.espresso },
    pos: { x: 6.65, z: 3.85 },
    size: { w: 0.45, d: 0.45, h: 0.5 },
    turns: FACES_WEST,
    blocks: "both",
  },
  {
    id: "table_lamp",
    model: "lampRoundTable",
    paint: { metal: COLORS.blackMetal, lamp: COLORS.lampShade },
    pos: { x: 6.65, z: 3.85 },
    size: { w: 0.3, d: 0.3, h: 0.55 },
    turns: FACES_SOUTH,
    lift: 0.5,
  },
  {
    id: "floor_lamp",
    model: "lampRoundFloor",
    paint: { metal: COLORS.blackMetal, lamp: COLORS.lampShade },
    pos: { x: 6.7, z: 0.4 },
    size: { w: 0.35, d: 0.35, h: 1.5 },
    turns: FACES_SOUTH,
    blocks: "both",
  },
  {
    id: "ottoman",
    model: null,
    pos: { x: 3.9, z: 2.6 },
    size: { w: 0.5, d: 0.5, h: 0.38 },
    turns: FACES_SOUTH,
    platformHeight: 0.38,
    color: COLORS.ottoman,
  },
  {
    id: "floor_cushions",
    model: null,
    pos: { x: 3.8, z: 5.9 },
    size: { w: 0.6, d: 0.6, h: 0.22 },
    turns: FACES_SOUTH,
    platformHeight: 0.22,
    color: COLORS.cushion,
  },
  {
    id: "hall_cabinet",
    model: "sideTableDrawers",
    paint: { wood: COLORS.espresso },
    pos: { x: 6.7, z: 5.9 },
    size: { w: 0.45, d: 0.6, h: 0.8 },
    turns: FACES_WEST,
    blocks: "both",
  },
  ...LIVING_DRESSING,
];

function chair(id: string, x: number, z: number, turns: Turns): FurnitureDef {
  return {
    id,
    model: "chair",
    pos: { x, z },
    size: { w: 0.42, d: 0.42, h: 0.9 },
    turns,
    blocks: "both",
    paint: { wood: COLORS.maple },
  };
}

/** One plain box of the blue carpeted cat tree that stands beside the sliding door. */
function treePart(id: string, x: number, z: number, size: Size3, lift: number): FurnitureDef {
  const carpeted = size.w > 0.2;
  const base: FurnitureDef = {
    id,
    model: null,
    pos: { x, z },
    size,
    turns: FACES_SOUTH,
    lift,
    color: carpeted ? COLORS.catTree : COLORS.sisal,
  };
  // Only the two perches are for standing on; the base and posts are just scenery.
  return carpeted && lift > 0 ? { ...base, platformHeight: lift + size.h } : base;
}

const CAT_TREE: readonly FurnitureDef[] = [
  treePart("cat_tree_base", 2.72, 0.58, { w: 0.7, d: 0.6, h: 0.06 }, 0),
  treePart("cat_tree_post_low", 2.56, 0.72, { w: 0.12, d: 0.12, h: 0.3 }, 0.06),
  treePart("cat_tree_perch_low", 2.56, 0.72, { w: 0.36, d: 0.36, h: 0.08 }, 0.36),
  treePart("cat_tree_post_high", 2.86, 0.44, { w: 0.12, d: 0.12, h: 0.66 }, 0.06),
  treePart("cat_tree_perch_high", 2.86, 0.44, { w: 0.38, d: 0.38, h: 0.08 }, 0.72),
];

const DEN: readonly FurnitureDef[] = [
  ...CAT_TREE,
  {
    id: "rug_dining",
    model: "rugRound",
    pos: { x: 1.6, z: 2 },
    size: { w: 2.6, d: 2.4, h: 0.02 },
    turns: FACES_SOUTH,
    tint: COLORS.diningRug,
  },
  {
    id: "dining_table",
    model: "tableRound",
    paint: { wood: COLORS.cherryTable },
    pos: { x: 1.6, z: 2 },
    size: { w: 1.5, d: 0.9, h: 0.75 },
    turns: FACES_SOUTH,
    blocks: "brother",
    hide: true,
  },
  chair("chair_nw", 1.1, 1.25, FACES_SOUTH),
  chair("chair_ne", 2.1, 1.25, FACES_SOUTH),
  chair("chair_sw", 1.1, 2.75, FACES_NORTH),
  chair("chair_se", 2.1, 2.75, FACES_NORTH),
];

/** A granite top a little wider than the cabinet or half wall it sits on. */
function granite(
  id: string,
  x: number,
  z: number,
  w: number,
  d: number,
  lift: number,
): FurnitureDef {
  return {
    id,
    model: null,
    pos: { x, z },
    size: { w, d, h: 0.05 },
    turns: FACES_SOUTH,
    lift,
    surface: "granite",
  };
}

/**
 * The island: a counter on the kitchen side backed by a taller half wall on the den side, which
 * turns the corner into the full-height pillar wall (INSIDE_WALLS) with more counter in front.
 */
const ISLAND: readonly FurnitureDef[] = [
  {
    id: "island_bar",
    model: null,
    pos: { x: 2.3, z: 3.5 },
    size: { w: 1.6, d: 0.2, h: 1.1 },
    turns: FACES_SOUTH,
    platformHeight: 1.15,
    color: COLORS.halfWall,
  },
  granite("island_bar_top", 2.3, 3.5, 1.66, 0.3, 1.1),
  {
    id: "island_counter",
    model: null,
    pos: { x: 2.3, z: 3.85 },
    size: { w: 1.6, d: 0.5, h: 0.9 },
    turns: FACES_SOUTH,
    platformHeight: 0.95,
    color: COLORS.oak,
  },
  granite("island_counter_top", 2.3, 3.87, 1.6, 0.54, 0.9),
  {
    id: "island_return",
    model: null,
    pos: { x: 2.76, z: 4.35 },
    size: { w: 0.52, d: 0.5, h: 0.9 },
    turns: FACES_SOUTH,
    blocks: "both",
    color: COLORS.oak,
  },
  granite("island_return_top", 2.75, 4.35, 0.56, 0.52, 0.9),
  {
    id: "pet_bed",
    model: null,
    pos: { x: 2.4, z: 3.87 },
    size: { w: 0.5, d: 0.38, h: 0.1 },
    turns: FACES_SOUTH,
    lift: 0.95,
    color: COLORS.petBed,
  },
];

/** Honey oak cabinets, white enamel stove and dishwasher. */
const KITCHEN_PAINT = {
  wood: COLORS.oak,
  woodDark: COLORS.oakDark,
  metal: COLORS.whiteEnamel,
} as const;

function counter(id: string, model: string, x: number, z: number, turns: Turns): FurnitureDef {
  const alongWall = 0.75;
  const deep = 0.6;
  const facesSideways = turns === FACES_EAST || turns === FACES_WEST;
  return {
    id,
    model,
    pos: { x, z },
    size: { w: facesSideways ? deep : alongWall, d: facesSideways ? alongWall : deep, h: 0.95 },
    turns,
    blocks: "both",
    paint: KITCHEN_PAINT,
  };
}

const KITCHEN: readonly FurnitureDef[] = [
  ...ISLAND,
  counter("counter_west_a", "kitchenCabinet", 0.38, 3.98, FACES_EAST),
  counter("sink", "kitchenSink", 0.38, 4.73, FACES_EAST),
  counter("counter_west_b", "kitchenCabinetDrawer", 0.38, 5.48, FACES_EAST),
  counter("stove", "kitchenStoveElectric", 0.38, 6.23, FACES_EAST),
  counter("counter_fridge", "kitchenCabinet", 2.72, 6.02, FACES_WEST),
  granite("counter_west_a_top", 0.36, 3.98, 0.66, 0.75, 0.93),
  granite("counter_west_b_top", 0.36, 5.48, 0.66, 0.75, 0.93),
  granite("counter_fridge_top", 2.74, 6.02, 0.66, 0.75, 0.93),
  {
    id: "fridge",
    model: "kitchenFridge",
    paint: { metalLight: COLORS.stainless },
    pos: { x: 2.66, z: 6.58 },
    size: { w: 0.72, d: 0.7, h: 1.8 },
    turns: FACES_WEST,
    blocks: "both",
  },
  {
    id: "food_bowl",
    model: null,
    pos: { x: 1.6, z: 6.75 },
    size: { w: 0.3, d: 0.2, h: 0.08 },
    turns: FACES_SOUTH,
    color: COLORS.bowl,
  },
];

/** Washer or dryer: cats can sit on top, where it is warm. */
function machine(id: string, model: string, z: number): FurnitureDef {
  return {
    id,
    model,
    pos: { x: 0.45, z },
    size: { w: 0.7, d: 0.68, h: 0.95 },
    turns: FACES_EAST,
    platformHeight: 0.95,
  };
}

const LAUNDRY: readonly FurnitureDef[] = [
  machine("washer", "washer", 7.6),
  machine("dryer", "dryer", 8.35),
  {
    id: "pantry",
    model: "bookcaseClosedDoors",
    paint: { wood: COLORS.oak },
    pos: { x: 2.78, z: 8.1 },
    size: { w: 0.45, d: 1.5, h: 1.7 },
    turns: FACES_WEST,
    blocks: "both",
  },
];

/** The half wall around the stairs down to the basement, which is not built yet. */
function railing(id: string, x: number, z: number, w: number, d: number): FurnitureDef {
  return {
    id,
    model: null,
    pos: { x, z },
    size: { w, d, h: 0.95 },
    turns: FACES_SOUTH,
    blocks: "both",
    color: COLORS.halfWall,
  };
}

const FOYER: readonly FurnitureDef[] = [
  railing("stair_rail_north", 4.1, 6.45, 2, 0.14),
  railing("stair_rail_east", 5.1, 7.3, 0.14, 1.84),
  {
    id: "stairs_down",
    model: "stairs",
    paint: { wood: COLORS.espresso, woodDark: COLORS.espresso },
    pos: { x: 4.1, z: 8 },
    size: { w: 1.2, d: 2.4, h: 0.3 },
    turns: FACES_NORTH,
  },
  {
    id: "coat_closet",
    model: null,
    pos: { x: 5.5, z: 8.75 },
    size: { w: 0.9, d: 1.2, h: 1.3 },
    turns: FACES_SOUTH,
    blocks: "both",
    color: COLORS.trim,
  },
  {
    id: "rug_foyer",
    model: "rugRound",
    pos: { x: 7, z: 8.1 },
    size: { w: 1.6, d: 1.6, h: 0.02 },
    turns: FACES_SOUTH,
    tint: COLORS.foyerRug,
  },
  {
    id: "bench",
    model: "benchCushion",
    pos: { x: 7.8, z: 6.62 },
    size: { w: 1.2, d: 0.5, h: 0.5 },
    turns: FACES_SOUTH,
    tint: COLORS.wicker,
    paint: { wood: COLORS.espresso },
    blocks: "brother",
    hide: true,
  },
];

function bathPiece(
  id: string,
  model: string,
  x: number,
  z: number,
  size: Size3,
  turns: Turns,
): FurnitureDef {
  return { id, model, pos: { x, z }, size, turns, blocks: "both" };
}

const BEDROOM_WING: readonly FurnitureDef[] = [
  // Primary bedroom.
  {
    id: "big_bed",
    model: "bedDouble",
    pos: { x: 9.4, z: 1.15 },
    size: { w: 1.7, d: 2.1, h: 0.6 },
    turns: FACES_SOUTH,
    tint: COLORS.bigBed,
    paint: { wood: COLORS.blackMetal },
    platformHeight: 0.5,
  },
  bathPiece("nightstand_west", "cabinetBed", 8.2, 0.4, { w: 0.45, d: 0.45, h: 0.5 }, FACES_SOUTH),
  bathPiece("nightstand_east", "cabinetBed", 10.6, 0.4, { w: 0.45, d: 0.45, h: 0.5 }, FACES_SOUTH),
  bathPiece("dresser", "bookcaseClosedWide", 11.1, 2.5, { w: 0.45, d: 1.2, h: 0.9 }, FACES_WEST),
  // Walk-in closet.
  {
    id: "closet_shelf",
    model: "bench",
    pos: { x: 8.9, z: 5.95 },
    size: { w: 1.2, d: 0.5, h: 0.5 },
    turns: FACES_NORTH,
    blocks: "brother",
    hide: true,
  },
  bathPiece("closet_box", "cardboardBoxClosed", 9.3, 4, { w: 0.45, d: 0.45, h: 0.4 }, FACES_SOUTH),
  // Primary bath.
  bathPiece("tub_primary", "bathtub", 10.5, 5.9, { w: 1.6, d: 0.7, h: 0.55 }, FACES_NORTH),
  bathPiece("toilet_primary", "toilet", 9.95, 4.8, { w: 0.45, d: 0.6, h: 0.75 }, FACES_EAST),
  bathPiece(
    "sink_primary",
    "bathroomCabinet",
    11.12,
    4.7,
    { w: 0.45, d: 0.7, h: 0.85 },
    FACES_WEST,
  ),
  // Second bath.
  bathPiece("tub_hall", "bathtub", 10.3, 6.72, { w: 1.6, d: 0.7, h: 0.55 }, FACES_SOUTH),
  bathPiece("toilet_hall", "toilet", 11.05, 7.7, { w: 0.6, d: 0.45, h: 0.75 }, FACES_WEST),
  bathPiece("sink_hall", "bathroomSink", 9.5, 8, { w: 0.7, d: 0.45, h: 0.85 }, FACES_NORTH),
  // Second bedroom.
  {
    id: "kid_bed",
    model: "bedSingle",
    pos: { x: 10.8, z: 10.5 },
    size: { w: 1, d: 2.1, h: 0.55 },
    turns: FACES_SOUTH,
    tint: COLORS.kidBed,
    platformHeight: 0.45,
  },
  {
    id: "rug_kid",
    model: "rugRounded",
    pos: { x: 9.3, z: 10.4 },
    size: { w: 1.6, d: 1.3, h: 0.02 },
    turns: FACES_SOUTH,
    tint: COLORS.kidRug,
  },
  {
    id: "desk",
    model: "desk",
    pos: { x: 8.7, z: 11.7 },
    size: { w: 1.2, d: 0.6, h: 0.75 },
    turns: FACES_NORTH,
    blocks: "brother",
    hide: true,
  },
  bathPiece("bookcase_kid", "bookcaseOpenLow", 10.3, 8.62, { w: 1.2, d: 0.4, h: 0.9 }, FACES_SOUTH),
  {
    id: "teddy",
    model: "bear",
    pos: { x: 10.8, z: 9.75 },
    size: { w: 0.3, d: 0.25, h: 0.35 },
    turns: FACES_SOUTH,
    lift: 0.45,
  },
];

export const MAIN_FLOOR: HouseFloor = {
  id: "main",
  name: "Main floor",
  bounds: { minX: 0, minZ: 0, maxX: 11.4, maxZ: 12.1 },
  floors: [
    { rect: { minX: 0, minZ: 0, maxX: 7, maxZ: 9.4 }, material: "wood" },
    { rect: { minX: 0, minZ: 9.4, maxX: 7.95, maxZ: 12.1 }, material: "concrete" },
    { rect: { minX: 0, minZ: 3.4, maxX: 3.1, maxZ: 9.4 }, material: "tile" },
    { rect: { minX: 3.1, minZ: 6.4, maxX: 5.1, maxZ: 9.4 }, material: "stairwell" },
    { rect: { minX: 7, minZ: 3.3, maxX: 8.2, maxZ: 6.3 }, material: "wood" },
    { rect: { minX: 7, minZ: 6.3, maxX: 8.8, maxZ: 9.4 }, material: "wood" },
    { rect: { minX: 5.9, minZ: 8.4, maxX: 7.95, maxZ: 9.4 }, material: "tile" },
    { rect: { minX: 7, minZ: 0, maxX: 11.4, maxZ: 3.3 }, material: "carpet" },
    { rect: { minX: 8.2, minZ: 3.3, maxX: 9.6, maxZ: 6.3 }, material: "carpet" },
    { rect: { minX: 9.6, minZ: 3.3, maxX: 11.4, maxZ: 6.3 }, material: "tile" },
    { rect: { minX: 8.8, minZ: 6.3, maxX: 11.4, maxZ: 8.3 }, material: "tile" },
    { rect: { minX: 7.95, minZ: 8.3, maxX: 11.4, maxZ: 12.1 }, material: "carpet" },
    { rect: { minX: 0.7, minZ: 0.1, maxX: 2.4, maxZ: 1 }, material: "sunbeam" },
  ],
  walls: [...OUTSIDE_WALLS, ...INSIDE_WALLS],
  furniture: [...LIVING, ...DEN, ...KITCHEN, ...LAUNDRY, ...FOYER, ...BEDROOM_WING],
  napPoints: [
    { id: "sunbeam", name: "Sunbeam", pos: { x: 1.5, z: 0.6 }, height: 0 },
    { id: "fireplace", name: "Fireplace", pos: { x: 4.85, z: 1.05 }, height: 0 },
    { id: "couch", name: "Couch", pos: { x: 6.45, z: 2.4 }, height: 0.42 },
    { id: "counter_bed", name: "Counter bed", pos: { x: 2.4, z: 3.87 }, height: 0.95 },
    { id: "food_bowl", name: "Food bowl", pos: { x: 1.6, z: 6.3 }, height: 0 },
    { id: "dryer", name: "Warm dryer", pos: { x: 0.45, z: 8.35 }, height: 0.95 },
    { id: "foyer_rug", name: "Shag rug", pos: { x: 7, z: 8.1 }, height: 0 },
    { id: "big_bed", name: "Big bed", pos: { x: 9.4, z: 1.4 }, height: 0.5 },
    { id: "kid_bed", name: "Kid's bed", pos: { x: 10.8, z: 10.8 }, height: 0.45 },
  ],
  treatSpawns: [
    { id: "treat_kitchen", pos: { x: 1.4, z: 5.3 } },
    { id: "treat_table", pos: { x: 1.6, z: 2 } },
    { id: "treat_tv", pos: { x: 4.85, z: 1.7 } },
    { id: "treat_foyer", pos: { x: 6.3, z: 7 } },
    { id: "treat_closet", pos: { x: 8.9, z: 4.6 } },
    { id: "treat_bedroom", pos: { x: 9.3, z: 10.4 } },
  ],
  knockables: [
    { id: "cup", name: "coffee cup", pos: { x: 1.75, z: 3.87 }, height: 0.95, look: "cup" },
    { id: "remote", name: "TV remote", pos: { x: 3.9, z: 2.6 }, height: 0.38, look: "remote" },
    { id: "toy_mouse", name: "toy mouse", pos: { x: 5.6, z: 5.4 }, height: 0, look: "toy" },
  ],
  mischief: [
    { id: "swat_arwen", label: "Swat Arwen", cat: "brother", goal: { kind: "swat" } },
    {
      id: "knock_cup",
      label: "Knock the cup off the counter",
      cat: "brother",
      goal: { kind: "knock", knockableId: "cup" },
    },
    {
      id: "claim_couch",
      label: "Claim the couch",
      cat: "brother",
      goal: { kind: "claim", pointId: "couch" },
    },
    {
      id: "bat_mouse",
      label: "Bat the toy mouse",
      cat: "brother",
      goal: { kind: "knock", knockableId: "toy_mouse" },
    },
    {
      id: "own_four",
      label: "Hold 4 spots at once",
      cat: "brother",
      goal: { kind: "own_count", count: 4 },
    },
    {
      id: "tease_aragorn",
      label: "Hide near Aragorn for 5 seconds",
      cat: "sister",
      goal: { kind: "tease", seconds: 5 },
    },
    {
      id: "table_treat",
      label: "Sneak the treat under the table",
      cat: "sister",
      goal: { kind: "treat", treatId: "treat_table" },
    },
    {
      id: "knock_remote",
      label: "Knock the remote off the ottoman",
      cat: "sister",
      goal: { kind: "knock", knockableId: "remote" },
    },
    {
      id: "claim_sunbeam",
      label: "Nap in the sunbeam",
      cat: "sister",
      goal: { kind: "claim", pointId: "sunbeam" },
    },
    {
      id: "claim_counter_bed",
      label: "Take the bed on the counter",
      cat: "sister",
      goal: { kind: "claim", pointId: "counter_bed" },
    },
  ],
  spawn: { brother: { x: 5.2, z: 5.2 }, sister: { x: 4, z: 5 } },
};
