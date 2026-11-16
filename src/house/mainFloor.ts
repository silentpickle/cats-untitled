import type { FurnitureDef, HouseFloor, Turns, WallDef, WallKind } from "./types";

/**
 * Main floor, laid out from the ten listing photos (docs/plan.md). Metres; x runs east, z runs
 * south toward the camera. The fireplace wall is north so the camera faces it.
 *
 * Rough map:            north (slider, fireplace)
 *   dining nook  |  living room
 *   -------------+
 *   kitchen      |  foyer
 *                south (front door, cut away)
 */

const FACES_SOUTH: Turns = 0;
const FACES_WEST: Turns = 1;
const FACES_NORTH: Turns = 2;
const FACES_EAST: Turns = 3;

const COLORS = {
  mantel: 0xf4f1ea,
  firebox: 0x1c1a1a,
  fire: 0xff8a2a,
  ottoman: 0xd8cfa8,
  counter: 0xb9813f,
  petBed: 0xc8553d,
  bowl: 0x3f7fc4,
  cushion: 0x9aa64a,
  sofa: 0x70776a,
  livingRug: 0x6e3b36,
  foyerRug: 0x9c978c,
  wicker: 0xd9c7a0,
  shutter: 0xc98a4b,
} as const;

function wall(x1: number, z1: number, x2: number, z2: number, kind: WallKind = "wall"): WallDef {
  return { from: { x: x1, z: z1 }, to: { x: x2, z: z2 }, kind };
}

function curb(x1: number, z1: number, x2: number, z2: number, kind: WallKind = "wall"): WallDef {
  return { ...wall(x1, z1, x2, z2, kind), cutaway: true };
}

const WALLS: readonly WallDef[] = [
  // North: sliding door by the dining nook, a window either side of the fireplace.
  wall(0, 0, 1.5, 0),
  wall(1.5, 0, 3.5, 0, "slider"),
  wall(3.5, 0, 5, 0),
  wall(5, 0, 6, 0, "window"),
  wall(6, 0, 8.4, 0),
  wall(8.4, 0, 9.4, 0, "window"),
  wall(9.4, 0, 10, 0),
  wall(10, 0, 10, 8),
  // West: kitchen window over the sink.
  wall(0, 0, 0, 5.8),
  wall(0, 5.8, 0, 6.9, "window"),
  wall(0, 6.9, 0, 8),
  // South is cut away: garage door from the kitchen, front door from the foyer.
  curb(0, 8, 4, 8),
  curb(4, 8, 4.9, 8, "door"),
  curb(4.9, 8, 6.9, 8),
  curb(6.9, 8, 7.9, 8, "door"),
  curb(7.9, 8, 10, 8),
  // Kitchen and foyer divider.
  curb(5, 6, 5, 8),
];

/** One leaf of the folding wooden shutters that stand in front of the living-room windows. */
function shutter(id: string, x: number): FurnitureDef {
  return {
    id,
    model: null,
    pos: { x, z: 0.14 },
    size: { w: 0.4, d: 0.06, h: 1.7 },
    turns: FACES_SOUTH,
    color: COLORS.shutter,
  };
}

const LIVING: readonly FurnitureDef[] = [
  shutter("shutter_a", 4.95),
  shutter("shutter_b", 6.05),
  shutter("shutter_c", 8.4),
  shutter("shutter_d", 9.4),
  {
    id: "fireplace",
    model: null,
    pos: { x: 7.2, z: 0.3 },
    size: { w: 1.7, d: 0.45, h: 1.25 },
    turns: FACES_SOUTH,
    blocks: "both",
    color: COLORS.mantel,
  },
  {
    id: "firebox",
    model: null,
    pos: { x: 7.2, z: 0.5 },
    size: { w: 0.85, d: 0.1, h: 0.75 },
    turns: FACES_SOUTH,
    color: COLORS.firebox,
  },
  {
    id: "fire",
    model: null,
    pos: { x: 7.2, z: 0.54 },
    size: { w: 0.4, d: 0.06, h: 0.3 },
    turns: FACES_SOUTH,
    color: COLORS.fire,
    glow: true,
  },
  {
    id: "tv_stand",
    model: "cabinetTelevision",
    pos: { x: 5.5, z: 0.5 },
    size: { w: 1.1, d: 0.5, h: 0.6 },
    turns: FACES_SOUTH,
    blocks: "both",
  },
  {
    id: "tv",
    model: "televisionModern",
    pos: { x: 5.5, z: 0.5 },
    size: { w: 0.95, d: 0.15, h: 0.6 },
    turns: FACES_SOUTH,
    lift: 0.6,
  },
  {
    id: "plant",
    model: "pottedPlant",
    pos: { x: 4.4, z: 0.45 },
    size: { w: 0.5, d: 0.5, h: 1.1 },
    turns: FACES_SOUTH,
    blocks: "both",
  },
  {
    id: "sofa_east",
    model: "loungeSofaLong",
    pos: { x: 9.45, z: 2.6 },
    size: { w: 0.95, d: 2.2, h: 0.85 },
    turns: FACES_WEST,
    tint: COLORS.sofa,
    platformHeight: 0.42,
  },
  {
    id: "sofa_south",
    model: "loungeSofa",
    pos: { x: 7.3, z: 4.55 },
    size: { w: 2, d: 0.9, h: 0.85 },
    turns: FACES_NORTH,
    tint: COLORS.sofa,
    platformHeight: 0.42,
  },
  {
    id: "rug_living",
    model: "rugRectangle",
    pos: { x: 7.3, z: 2.6 },
    size: { w: 2.8, d: 2, h: 0.02 },
    turns: FACES_SOUTH,
    tint: COLORS.livingRug,
  },
  {
    id: "coffee_table",
    model: "tableCoffeeGlass",
    pos: { x: 7.3, z: 2.6 },
    size: { w: 1.2, d: 0.7, h: 0.45 },
    turns: FACES_SOUTH,
    blocks: "brother",
    hide: true,
  },
  {
    id: "side_table",
    model: "sideTable",
    pos: { x: 9.55, z: 4.2 },
    size: { w: 0.45, d: 0.45, h: 0.5 },
    turns: FACES_WEST,
    blocks: "both",
  },
  {
    id: "table_lamp",
    model: "lampRoundTable",
    pos: { x: 9.55, z: 4.2 },
    size: { w: 0.3, d: 0.3, h: 0.55 },
    turns: FACES_SOUTH,
    lift: 0.5,
  },
  {
    id: "floor_lamp",
    model: "lampRoundFloor",
    pos: { x: 9.6, z: 0.4 },
    size: { w: 0.35, d: 0.35, h: 1.5 },
    turns: FACES_SOUTH,
    blocks: "both",
  },
  {
    id: "ottoman",
    model: null,
    pos: { x: 5.3, z: 1.5 },
    size: { w: 0.5, d: 0.5, h: 0.38 },
    turns: FACES_SOUTH,
    platformHeight: 0.38,
    color: COLORS.ottoman,
  },
];

function chair(id: string, x: number, z: number, turns: Turns): FurnitureDef {
  return {
    id,
    model: "chairCushion",
    pos: { x, z },
    size: { w: 0.42, d: 0.42, h: 0.9 },
    turns,
    blocks: "both",
    tint: COLORS.wicker,
  };
}

const DINING: readonly FurnitureDef[] = [
  {
    id: "dining_table",
    model: "table",
    pos: { x: 2.4, z: 2.3 },
    size: { w: 1.5, d: 0.9, h: 0.75 },
    turns: FACES_SOUTH,
    blocks: "brother",
    hide: true,
  },
  chair("chair_nw", 1.9, 1.55, FACES_SOUTH),
  chair("chair_ne", 2.9, 1.55, FACES_SOUTH),
  chair("chair_sw", 1.9, 3.05, FACES_NORTH),
  chair("chair_se", 2.9, 3.05, FACES_NORTH),
  {
    id: "bakers_rack",
    model: "bookcaseOpen",
    pos: { x: 0.3, z: 2.6 },
    size: { w: 0.45, d: 1, h: 1.8 },
    turns: FACES_EAST,
    blocks: "both",
  },
];

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
  };
}

function stool(id: string, x: number, z: number): FurnitureDef {
  return {
    id,
    model: "stoolBar",
    pos: { x, z },
    size: { w: 0.35, d: 0.35, h: 0.7 },
    turns: FACES_SOUTH,
    blocks: "both",
  };
}

const KITCHEN: readonly FurnitureDef[] = [
  {
    id: "peninsula",
    model: null,
    pos: { x: 1.8, z: 4.9 },
    size: { w: 3.6, d: 0.6, h: 0.95 },
    turns: FACES_SOUTH,
    platformHeight: 0.95,
    color: COLORS.counter,
  },
  {
    id: "pet_bed",
    model: null,
    pos: { x: 2.6, z: 4.9 },
    size: { w: 0.55, d: 0.42, h: 0.1 },
    turns: FACES_SOUTH,
    lift: 0.95,
    color: COLORS.petBed,
  },
  stool("stool_west", 1.2, 4.3),
  stool("stool_east", 2, 4.3),
  counter("counter_west_a", "kitchenCabinet", 0.3, 5.6, FACES_EAST),
  counter("sink", "kitchenSink", 0.3, 6.35, FACES_EAST),
  counter("counter_west_b", "kitchenCabinet", 0.3, 7.1, FACES_EAST),
  {
    id: "fridge",
    model: "kitchenFridge",
    pos: { x: 1.05, z: 7.6 },
    size: { w: 0.8, d: 0.7, h: 1.8 },
    turns: FACES_NORTH,
    blocks: "both",
  },
  counter("counter_south_a", "kitchenCabinetDrawer", 1.85, 7.65, FACES_NORTH),
  counter("stove", "kitchenStoveElectric", 2.6, 7.65, FACES_NORTH),
  counter("counter_south_b", "kitchenCabinet", 3.35, 7.65, FACES_NORTH),
  {
    id: "food_bowl",
    model: null,
    pos: { x: 3.2, z: 6.95 },
    size: { w: 0.3, d: 0.2, h: 0.08 },
    turns: FACES_SOUTH,
    color: COLORS.bowl,
  },
];

const FOYER: readonly FurnitureDef[] = [
  {
    id: "rug_foyer",
    model: "rugRound",
    pos: { x: 7.4, z: 6.6 },
    size: { w: 1.6, d: 1.6, h: 0.02 },
    turns: FACES_SOUTH,
    tint: COLORS.foyerRug,
  },
  {
    id: "bench",
    model: "benchCushion",
    pos: { x: 9.6, z: 6.4 },
    size: { w: 0.5, d: 1.2, h: 0.5 },
    turns: FACES_WEST,
    tint: COLORS.wicker,
    blocks: "brother",
    hide: true,
  },
  {
    id: "floor_cushions",
    model: null,
    pos: { x: 5.65, z: 7.2 },
    size: { w: 0.6, d: 0.6, h: 0.22 },
    turns: FACES_SOUTH,
    platformHeight: 0.22,
    color: COLORS.cushion,
  },
  {
    id: "hall_cabinet",
    model: "sideTableDrawers",
    pos: { x: 5.4, z: 6.35 },
    size: { w: 0.45, d: 0.5, h: 0.8 },
    turns: FACES_EAST,
    blocks: "both",
  },
];

export const MAIN_FLOOR: HouseFloor = {
  id: "main",
  name: "Main floor",
  bounds: { minX: 0, minZ: 0, maxX: 10, maxZ: 8 },
  floors: [
    { rect: { minX: 0, minZ: 0, maxX: 10, maxZ: 8 }, material: "carpet" },
    { rect: { minX: 0, minZ: 0, maxX: 4, maxZ: 3.7 }, material: "tile" },
    { rect: { minX: 0, minZ: 4.6, maxX: 5, maxZ: 8 }, material: "tile" },
    { rect: { minX: 6.2, minZ: 5.7, maxX: 8.6, maxZ: 8 }, material: "tile" },
    { rect: { minX: 1.6, minZ: 0.1, maxX: 3.4, maxZ: 1.3 }, material: "sunbeam" },
  ],
  walls: WALLS,
  furniture: [...LIVING, ...DINING, ...KITCHEN, ...FOYER],
  napPoints: [
    { id: "sunbeam", name: "Sunbeam", pos: { x: 2.5, z: 0.75 }, height: 0 },
    { id: "fireplace", name: "Fireplace", pos: { x: 7.2, z: 1.05 }, height: 0 },
    { id: "couch", name: "Couch", pos: { x: 9.4, z: 2.6 }, height: 0.42 },
    { id: "counter_bed", name: "Counter bed", pos: { x: 2.6, z: 4.9 }, height: 0.95 },
    { id: "food_bowl", name: "Food bowl", pos: { x: 3.2, z: 6.5 }, height: 0 },
    { id: "foyer_rug", name: "Shag rug", pos: { x: 7.4, z: 6.6 }, height: 0 },
    { id: "cushions", name: "Floor cushions", pos: { x: 5.65, z: 7.2 }, height: 0.22 },
  ],
  treatSpawns: [
    { id: "treat_kitchen", pos: { x: 1.7, z: 6.1 } },
    { id: "treat_table", pos: { x: 2.4, z: 2.3 } },
    { id: "treat_tv", pos: { x: 5.9, z: 1.7 } },
    { id: "treat_foyer", pos: { x: 8.8, z: 7.3 } },
  ],
  spawn: { brother: { x: 6, z: 3.5 }, sister: { x: 4.3, z: 3.5 } },
};
