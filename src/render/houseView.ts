import * as THREE from "three";
import type { Rect } from "../sim/types";
import { WALL_THICKNESS, wallRect } from "../house/toWorld";
import type {
  FloorMaterial,
  FurnitureDef,
  HouseFloor,
  SurfaceName,
  WallDef,
  WallKind,
} from "../house/types";
import { loadModelCopy } from "./models";
import { SURFACES, repeatsFor, surfaceMaterial, surfaceTexture } from "./surfaces";

const HALF = 0.5;
const QUARTER_TURN = Math.PI * HALF;

const WALLS = {
  height: 2.5,
  curbHeight: 0.4,
  sillHeight: 0.9,
  headerStart: 2.05,
  railHeight: 0.08,
  // Pale blue-white paint above, the slate blue of the island and pillar below.
  upperColor: 0xdfe3ea,
  lowerColor: 0x5d667a,
  railColor: 0xf7f5f0,
  doorColor: 0xfaf7f0,
  frameColor: 0xf4f2ec,
  trackColor: 0x6f6a64,
} as const;

/**
 * Window and slider glass: a thin pane, nearly clear, in a white frame. The panes draw after everything
 * else, always in the same order, so they never trade places with the nap rings from frame to frame.
 */
const GLASS = {
  color: 0xdcefff,
  opacity: 0.16,
  roughness: 0.05,
  pane: 0.02,
  frame: 0.05,
  frameDepth: 0.07,
  /** How far outside the wall's centre line the slid-open panel runs. */
  outsideTrack: 0.07,
  trackHeight: 0.015,
  drawOrder: 10,
} as const;

interface FloorLook {
  readonly surface: SurfaceName;
  /** Multiplies the pattern: white leaves it as drawn. */
  readonly color: number;
  /** Light the floor gives off on its own (the sunbeam). */
  readonly glow: number;
}

const PLAIN = 0xffffff;
const NO_GLOW = 0x000000;

const FLOORS: Record<FloorMaterial, FloorLook> = {
  carpet: { surface: "carpet", color: PLAIN, glow: NO_GLOW },
  tile: { surface: "tile", color: PLAIN, glow: NO_GLOW },
  wood: { surface: "hardwood", color: PLAIN, glow: NO_GLOW },
  concrete: { surface: "concrete", color: PLAIN, glow: NO_GLOW },
  stairwell: { surface: "hardwood", color: 0x4a403c, glow: NO_GLOW },
  sunbeam: { surface: "hardwood", color: 0xffe7b0, glow: 0x5a3a12 },
  deck: { surface: "deck", color: PLAIN, glow: NO_GLOW },
};

/** The lawn reaches this far past the house on every side, well past anything the camera sees. */
const YARD_MARGIN = 20;
/** Floors draw before everything else, later areas on top of earlier ones. */
const FLOOR_DRAW_ORDER = -1000;
const OPENING_GAP = 0.02;
const FLOOR_ROUGHNESS = 0.85;

const DEFAULT_BOX_COLOR = 0xb0a090;
const GLOW = { intensity: 6, distance: 4.5, emissive: 2 } as const;

/** A slice of a wall between two heights: solid paint, or a glazed opening. */
interface Band {
  readonly from: number;
  readonly to: number;
  readonly material: THREE.Material;
  readonly glazed?: boolean;
}

/**
 * Texture coordinates in metres over the pattern's size, measured from the house's corner, so planks and
 * tiles keep their real size and line up across neighbouring floor areas.
 */
function worldUvs(geometry: THREE.PlaneGeometry, rect: Rect, tileMetres: number): void {
  const width = rect.maxX - rect.minX;
  const depth = rect.maxZ - rect.minZ;
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i += 1) {
    const x = rect.minX + uv.getX(i) * width;
    const z = rect.maxZ - uv.getY(i) * depth;
    uv.setXY(i, x / tileMetres, -z / tileMetres);
  }
}

/**
 * Every floor area lies flat at height 0. Overlapping areas are ordered by drawing them first, in
 * layer order, each one painting over the last. Stacking them a few millimetres apart instead lifted the top
 * layers above the rugs and the see-through nap rings, which then flickered in and out of the floor.
 */
function groundMesh(rect: Rect, look: FloorLook, drawOrder: number): THREE.Mesh {
  const width = rect.maxX - rect.minX;
  const depth = rect.maxZ - rect.minZ;
  const geometry = new THREE.PlaneGeometry(width, depth);
  worldUvs(geometry, rect, SURFACES[look.surface].tileMetres ?? 1);
  const mesh = new THREE.Mesh(
    geometry,
    // Always passing (rather than switching the test off) still writes depth, so nothing under the
    // floor shows through it.
    new THREE.MeshStandardMaterial({
      map: surfaceTexture(look.surface),
      color: look.color,
      emissive: look.glow,
      roughness: FLOOR_ROUGHNESS,
      depthFunc: THREE.AlwaysDepth,
    }),
  );
  mesh.renderOrder = drawOrder;
  mesh.rotation.x = -QUARTER_TURN;
  mesh.position.set(rect.minX + width * HALF, 0, rect.minZ + depth * HALF);
  mesh.receiveShadow = true;
  return mesh;
}

function floorMesh(rect: Rect, material: FloorMaterial, layer: number): THREE.Mesh {
  return groundMesh(rect, FLOORS[material], FLOOR_DRAW_ORDER + layer);
}

/** Grass all round the house, drawn before the floors so they paint over it indoors. */
function yardMesh(bounds: Rect): THREE.Mesh {
  const yard: Rect = {
    minX: bounds.minX - YARD_MARGIN,
    minZ: bounds.minZ - YARD_MARGIN,
    maxX: bounds.maxX + YARD_MARGIN,
    maxZ: bounds.maxZ + YARD_MARGIN,
  };
  return groundMesh(yard, { surface: "grass", color: PLAIN, glow: NO_GLOW }, FLOOR_DRAW_ORDER - 1);
}

function wallBands(kind: WallKind, mats: WallMaterials): Band[] {
  const header: Band = { from: WALLS.headerStart, to: WALLS.height, material: mats.wall };
  const railTop = WALLS.sillHeight + WALLS.railHeight;
  const table: Record<WallKind, Band[]> = {
    // Two-tone paint with a white chair rail, as in the photos of the dining nook.
    wall: [
      { from: 0, to: WALLS.sillHeight, material: mats.lower },
      { from: WALLS.sillHeight, to: railTop, material: mats.rail },
      { from: railTop, to: WALLS.height, material: mats.wall },
    ],
    window: [
      { from: 0, to: WALLS.sillHeight, material: mats.lower },
      { from: WALLS.sillHeight, to: WALLS.headerStart, material: mats.glass, glazed: true },
      header,
    ],
    slider: [{ from: 0, to: WALLS.headerStart, material: mats.glass, glazed: true }, header],
    door: [{ from: 0, to: WALLS.headerStart, material: mats.door }, header],
    catDoor: [header],
  };
  return table[kind];
}

function curbBands(kind: WallKind, mats: WallMaterials): Band[] {
  const material = kind === "door" ? mats.door : mats.lower;
  return [{ from: 0, to: WALLS.curbHeight, material }];
}

interface WallMaterials {
  /** Paint above the chair rail. */
  readonly wall: THREE.Material;
  readonly lower: THREE.Material;
  readonly rail: THREE.Material;
  readonly door: THREE.Material;
  readonly glass: THREE.Material;
  readonly frame: THREE.Material;
  readonly track: THREE.Material;
}

function wallMaterials(): WallMaterials {
  return {
    wall: new THREE.MeshStandardMaterial({ color: WALLS.upperColor, roughness: 1 }),
    lower: new THREE.MeshStandardMaterial({ color: WALLS.lowerColor, roughness: 1 }),
    rail: new THREE.MeshStandardMaterial({ color: WALLS.railColor, roughness: 0.7 }),
    door: new THREE.MeshStandardMaterial({ color: WALLS.doorColor, roughness: 0.6 }),
    // No depth write: whatever is behind the pane (the yard, a cat on the patio) still draws through it.
    glass: new THREE.MeshStandardMaterial({
      color: GLASS.color,
      transparent: true,
      opacity: GLASS.opacity,
      roughness: GLASS.roughness,
      depthWrite: false,
    }),
    frame: new THREE.MeshStandardMaterial({ color: WALLS.frameColor, roughness: 0.6 }),
    track: new THREE.MeshStandardMaterial({ color: WALLS.trackColor, roughness: 0.8 }),
  };
}

/**
 * A wall laid out in its own frame: local x runs along it, y up, z across it. The group is placed and
 * turned so the pieces built in that frame land in the house.
 */
interface WallFrame {
  readonly group: THREE.Group;
  readonly length: number;
  readonly thickness: number;
}

function wallFrame(wall: WallDef): WallFrame {
  const rect = wallRect(wall);
  const alongX = wall.from.z === wall.to.z;
  // Plain walls overlap their neighbours to fill corners. Windows and doors are a different colour,
  // so they stop short of the neighbouring wall and sit a hair thinner: no two faces share a plane.
  const inset = wall.kind === "wall" ? 0 : WALL_THICKNESS + OPENING_GAP;
  const spanX = rect.maxX - rect.minX;
  const spanZ = rect.maxZ - rect.minZ;
  const group = new THREE.Group();
  group.position.set(rect.minX + spanX * HALF, 0, rect.minZ + spanZ * HALF);
  group.rotation.y = alongX ? 0 : QUARTER_TURN;
  return {
    group,
    length: Math.max((alongX ? spanX : spanZ) - inset, OPENING_GAP),
    thickness: Math.max((alongX ? spanZ : spanX) - OPENING_GAP, OPENING_GAP),
  };
}

/** A box in the wall's own frame, `x` along it, `z` across it, standing on `from`. */
function block(
  size: { readonly w: number; readonly h: number; readonly d: number },
  at: { readonly x: number; readonly from: number; readonly z: number },
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.w, size.h, size.d), material);
  mesh.position.set(at.x, at.from + size.h * HALF, at.z);
  mesh.receiveShadow = true;
  return mesh;
}

/** One sheet of glass in a white frame, `width` wide, centred `x` along the wall and `z` across it. */
function glazedPanel(
  width: number,
  band: Band,
  at: { readonly x: number; readonly z: number },
  mats: WallMaterials,
): THREE.Mesh[] {
  const height = band.to - band.from;
  const depth = GLASS.frameDepth;
  const side = (width - GLASS.frame) * HALF;
  // Tucked half a frame inside the frame on every side, so no face of the glass shares a plane with it.
  const pane = block(
    { w: width - GLASS.frame, h: height - GLASS.frame, d: GLASS.pane },
    { x: at.x, from: band.from + GLASS.frame * HALF, z: at.z },
    mats.glass,
  );
  pane.renderOrder = GLASS.drawOrder;
  pane.receiveShadow = false;
  const rails = [band.from, band.to - GLASS.frame].map((from) =>
    block({ w: width, h: GLASS.frame, d: depth }, { x: at.x, from, z: at.z }, mats.frame),
  );
  const stiles = [-side, side].map((offset) =>
    block(
      { w: GLASS.frame, h: height, d: depth },
      { x: at.x + offset, from: band.from, z: at.z },
      mats.frame,
    ),
  );
  return [pane, ...rails, ...stiles];
}

/**
 * A sliding door left half open: the fixed panel at the `from` end, the moving one slid back over it on
 * the outside track, and a floor track across the open half.
 */
function catDoorPanels(wall: WallDef, frame: WallFrame, mats: WallMaterials): THREE.Mesh[] {
  const alongX = wall.from.z === wall.to.z;
  const fromSide = alongX ? Math.sign(wall.from.x - wall.to.x) : Math.sign(wall.to.z - wall.from.z);
  const half = frame.length * HALF;
  const fixedX = fromSide * half * HALF;
  const glass: Band = { from: 0, to: WALLS.headerStart, material: mats.glass };
  const track = block(
    { w: half, h: GLASS.trackHeight, d: frame.thickness },
    { x: -fixedX, from: 0, z: 0 },
    mats.track,
  );
  return [
    track,
    ...glazedPanel(half, glass, { x: fixedX, z: 0 }, mats),
    ...glazedPanel(half, glass, { x: fixedX, z: -GLASS.outsideTrack }, mats),
  ];
}

function bandMeshes(frame: WallFrame, band: Band, mats: WallMaterials): THREE.Mesh[] {
  if (band.glazed === true) return glazedPanel(frame.length, band, { x: 0, z: 0 }, mats);
  const size = { w: frame.length, h: band.to - band.from, d: frame.thickness };
  return [block(size, { x: 0, from: band.from, z: 0 }, band.material)];
}

function wallObject(wall: WallDef, mats: WallMaterials): THREE.Group {
  const frame = wallFrame(wall);
  const bands = wall.cutaway === true ? curbBands(wall.kind, mats) : wallBands(wall.kind, mats);
  frame.group.add(...bands.flatMap((band) => bandMeshes(frame, band, mats)));
  if (wall.kind === "catDoor" && wall.cutaway !== true) {
    frame.group.add(...catDoorPanels(wall, frame, mats));
  }
  return frame.group;
}

/** The kit's fabric is a pink-red; anything redder than this ratio over green counts as fabric. */
const FABRIC_RED_OVER_GREEN = 1.25;

function isFabric(color: THREE.Color): boolean {
  return color.r > color.g * FABRIC_RED_OVER_GREEN && color.r > color.b * FABRIC_RED_OVER_GREEN;
}

type Recolor = (material: THREE.MeshStandardMaterial) => number | undefined;

function recolorOne(material: THREE.Material, pickColor: Recolor): THREE.Material {
  if (!(material instanceof THREE.MeshStandardMaterial)) {
    return material;
  }
  const color = pickColor(material);
  if (color === undefined) {
    return material;
  }
  const copy = material.clone();
  copy.color.setHex(color);
  return copy;
}

/** Swaps in a copy of each material the rule gives a new colour, leaving the shared originals alone. */
function recolor(object: THREE.Object3D, pickColor: Recolor): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const current = child.material as THREE.Material | THREE.Material[];
    child.material = Array.isArray(current)
      ? current.map((material) => recolorOne(material, pickColor))
      : recolorOne(current, pickColor);
  });
}

function tintFabric(object: THREE.Object3D, tint: number): void {
  recolor(object, (material) => (isFabric(material.color) ? tint : undefined));
}

function paintParts(object: THREE.Object3D, paint: Readonly<Record<string, number>>): void {
  recolor(object, (material) => paint[material.name]);
}

function enableShadows(object: THREE.Object3D): void {
  object.traverse((child) => {
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

const BOX_FACES = 6;
const FACE_TOP = 2;
const FACE_FRONT = 4;

/** The pattern on the faces its surface names, the edge colour on the rest. */
function surfaceMaterials(
  item: FurnitureDef,
  name: SurfaceName,
): THREE.Material | THREE.Material[] {
  const def = SURFACES[name];
  const { w, d, h } = item.size;
  const front = def.faces === "front";
  const pattern = surfaceMaterial(name, repeatsFor(name, w, front ? h : d));
  if (def.faces === "all") {
    return pattern;
  }
  const edge = new THREE.MeshStandardMaterial({ color: def.edge, roughness: 0.9 });
  const patterned = front ? FACE_FRONT : FACE_TOP;
  return Array.from({ length: BOX_FACES }, (_, face) => (face === patterned ? pattern : edge));
}

function plainMaterial(item: FurnitureDef): THREE.Material {
  const color = item.color ?? DEFAULT_BOX_COLOR;
  const glows = item.glow === true;
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    emissive: glows ? color : 0,
    emissiveIntensity: glows ? GLOW.emissive : 0,
  });
}

function boxFurniture(item: FurnitureDef): THREE.Object3D {
  const material =
    item.surface === undefined ? plainMaterial(item) : surfaceMaterials(item, item.surface);
  const { w, d, h } = item.size;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(item.pos.x, (item.lift ?? 0) + h * HALF, item.pos.z);
  if (item.glow !== true) {
    enableShadows(mesh);
    return mesh;
  }
  const light = new THREE.PointLight(
    item.color ?? DEFAULT_BOX_COLOR,
    GLOW.intensity,
    GLOW.distance,
  );
  mesh.add(light);
  return mesh;
}

/** Turns the model to face the right way, then stretches it to fill the footprint it was given. */
function fitModel(model: THREE.Object3D, item: FurnitureDef): THREE.Object3D {
  const pivot = new THREE.Group();
  pivot.add(model);
  pivot.rotation.y = -item.turns * QUARTER_TURN;
  pivot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(pivot);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const outer = new THREE.Group();
  outer.add(pivot);
  const scale = new THREE.Vector3(item.size.w / size.x, item.size.h / size.y, item.size.d / size.z);
  outer.scale.copy(scale);
  outer.position.set(
    item.pos.x - center.x * scale.x,
    (item.lift ?? 0) - box.min.y * scale.y,
    item.pos.z - center.z * scale.z,
  );
  enableShadows(outer);
  return outer;
}

async function furnitureObject(item: FurnitureDef): Promise<THREE.Object3D> {
  if (item.model === null) {
    return boxFurniture(item);
  }
  const model = await loadModelCopy(`furniture/${item.model}.glb`);
  if (item.tint !== undefined) {
    tintFabric(model, item.tint);
  }
  if (item.paint !== undefined) {
    paintParts(model, item.paint);
  }
  return fitModel(model, item);
}

/** Builds everything that does not move: floors, walls and furniture. */
export async function buildHouse(floor: HouseFloor): Promise<THREE.Group> {
  const group = new THREE.Group();
  group.add(yardMesh(floor.bounds));
  floor.floors.forEach((area, layer) => {
    group.add(floorMesh(area.rect, area.material, layer));
  });
  const mats = wallMaterials();
  for (const wall of floor.walls) {
    group.add(wallObject(wall, mats));
  }
  const furniture = await Promise.all(floor.furniture.map(furnitureObject));
  group.add(...furniture);
  return group;
}
