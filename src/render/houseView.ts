import * as THREE from "three";
import type { Rect } from "../sim/types";
import { WALL_THICKNESS, wallRect } from "../house/toWorld";
import type { FloorMaterial, FurnitureDef, HouseFloor, WallDef, WallKind } from "../house/types";
import { loadModelCopy } from "./models";

const HALF = 0.5;
const QUARTER_TURN = Math.PI * HALF;

const WALLS = {
  height: 2.5,
  curbHeight: 0.18,
  sillHeight: 0.9,
  headerStart: 2.05,
  color: 0xefe8da,
  doorColor: 0xfaf7f0,
  glassColor: 0xcfeaff,
  glassGlow: 0.9,
} as const;

const FLOORS: Record<FloorMaterial, number> = {
  carpet: 0xd9cfbd,
  tile: 0xcdbfa6,
  sunbeam: 0xf6e7a6,
};
const FLOOR_LAYER_STEP = 0.004;
const OPENING_GAP = 0.02;

const DEFAULT_BOX_COLOR = 0xb0a090;
const GLOW = { intensity: 6, distance: 4.5, emissive: 2 } as const;

interface Band {
  readonly from: number;
  readonly to: number;
  readonly material: THREE.Material;
}

function floorMesh(rect: Rect, material: FloorMaterial, layer: number): THREE.Mesh {
  const width = rect.maxX - rect.minX;
  const depth = rect.maxZ - rect.minZ;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ color: FLOORS[material], roughness: 1 }),
  );
  mesh.rotation.x = -QUARTER_TURN;
  mesh.position.set(rect.minX + width * HALF, layer * FLOOR_LAYER_STEP, rect.minZ + depth * HALF);
  mesh.receiveShadow = true;
  return mesh;
}

function wallBands(kind: WallKind, mats: WallMaterials): Band[] {
  const header: Band = { from: WALLS.headerStart, to: WALLS.height, material: mats.wall };
  const table: Record<WallKind, Band[]> = {
    wall: [{ from: 0, to: WALLS.height, material: mats.wall }],
    window: [
      { from: 0, to: WALLS.sillHeight, material: mats.wall },
      { from: WALLS.sillHeight, to: WALLS.headerStart, material: mats.glass },
      header,
    ],
    slider: [{ from: 0, to: WALLS.headerStart, material: mats.glass }, header],
    door: [{ from: 0, to: WALLS.headerStart, material: mats.door }, header],
  };
  return table[kind];
}

function curbBands(kind: WallKind, mats: WallMaterials): Band[] {
  const material = kind === "door" ? mats.door : mats.wall;
  return [{ from: 0, to: WALLS.curbHeight, material }];
}

interface WallMaterials {
  readonly wall: THREE.Material;
  readonly door: THREE.Material;
  readonly glass: THREE.Material;
}

function wallMaterials(): WallMaterials {
  return {
    wall: new THREE.MeshStandardMaterial({ color: WALLS.color, roughness: 1 }),
    door: new THREE.MeshStandardMaterial({ color: WALLS.doorColor, roughness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({
      color: WALLS.glassColor,
      emissive: WALLS.glassColor,
      emissiveIntensity: WALLS.glassGlow,
    }),
  };
}

function wallMeshes(wall: WallDef, mats: WallMaterials): THREE.Mesh[] {
  const rect = wallRect(wall);
  // Plain walls overlap their neighbours to fill corners. Windows and doors are a different colour,
  // so they stop short of the neighbouring wall and sit a hair thinner: no two faces share a plane.
  const inset = wall.kind === "wall" ? 0 : WALL_THICKNESS + OPENING_GAP;
  const alongX = wall.from.z === wall.to.z;
  const width = Math.max(rect.maxX - rect.minX - (alongX ? inset : OPENING_GAP), OPENING_GAP);
  const depth = Math.max(rect.maxZ - rect.minZ - (alongX ? OPENING_GAP : inset), OPENING_GAP);
  const bands = wall.cutaway === true ? curbBands(wall.kind, mats) : wallBands(wall.kind, mats);
  return bands.map((band) => {
    const height = band.to - band.from;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), band.material);
    mesh.position.set(
      rect.minX + (rect.maxX - rect.minX) * HALF,
      band.from + height * HALF,
      rect.minZ + (rect.maxZ - rect.minZ) * HALF,
    );
    mesh.receiveShadow = true;
    return mesh;
  });
}

/** The kit's fabric is a pink-red; anything redder than this ratio over green counts as fabric. */
const FABRIC_RED_OVER_GREEN = 1.25;

function isFabric(color: THREE.Color): boolean {
  return color.r > color.g * FABRIC_RED_OVER_GREEN && color.r > color.b * FABRIC_RED_OVER_GREEN;
}

function retint(material: THREE.Material, tint: number): THREE.Material {
  if (!(material instanceof THREE.MeshStandardMaterial) || !isFabric(material.color)) {
    return material;
  }
  const copy = material.clone();
  copy.color.setHex(tint);
  return copy;
}

function tintFabric(object: THREE.Object3D, tint: number): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const current = child.material as THREE.Material | THREE.Material[];
    child.material = Array.isArray(current)
      ? current.map((material) => retint(material, tint))
      : retint(current, tint);
  });
}

function enableShadows(object: THREE.Object3D): void {
  object.traverse((child) => {
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

function boxFurniture(item: FurnitureDef): THREE.Object3D {
  const color = item.color ?? DEFAULT_BOX_COLOR;
  const glows = item.glow === true;
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    emissive: glows ? color : 0,
    emissiveIntensity: glows ? GLOW.emissive : 0,
  });
  const { w, d, h } = item.size;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(item.pos.x, (item.lift ?? 0) + h * HALF, item.pos.z);
  if (!glows) {
    enableShadows(mesh);
    return mesh;
  }
  const light = new THREE.PointLight(color, GLOW.intensity, GLOW.distance);
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
  return fitModel(model, item);
}

/** Builds everything that does not move: floors, walls and furniture. */
export async function buildHouse(floor: HouseFloor): Promise<THREE.Group> {
  const group = new THREE.Group();
  floor.floors.forEach((area, layer) => {
    group.add(floorMesh(area.rect, area.material, layer));
  });
  const mats = wallMaterials();
  for (const wall of floor.walls) {
    group.add(...wallMeshes(wall, mats));
  }
  const furniture = await Promise.all(floor.furniture.map(furnitureObject));
  group.add(...furniture);
  return group;
}
