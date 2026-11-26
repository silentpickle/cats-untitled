import type { BirdPathDef, HideSpotDef, Obstacle, Rect, WorldDef } from "../sim/types";
import type { BirdPathPlacement, FurnitureDef, HouseFloor, WallDef } from "./types";

export const WALL_THICKNESS = 0.15;
const HALF = 0.5;

export function furnitureRect(item: FurnitureDef): Rect {
  const halfW = item.size.w * HALF;
  const halfD = item.size.d * HALF;
  return {
    minX: item.pos.x - halfW,
    maxX: item.pos.x + halfW,
    minZ: item.pos.z - halfD,
    maxZ: item.pos.z + halfD,
  };
}

export function wallRect(wall: WallDef): Rect {
  const halfT = WALL_THICKNESS * HALF;
  return {
    minX: Math.min(wall.from.x, wall.to.x) - halfT,
    maxX: Math.max(wall.from.x, wall.to.x) + halfT,
    minZ: Math.min(wall.from.z, wall.to.z) - halfT,
    maxZ: Math.max(wall.from.z, wall.to.z) + halfT,
  };
}

function furnitureObstacles(furniture: readonly FurnitureDef[]): Obstacle[] {
  const obstacles: Obstacle[] = [];
  for (const item of furniture) {
    if (item.blocks === undefined) {
      continue;
    }
    obstacles.push({ rect: furnitureRect(item), blocks: item.blocks });
  }
  return obstacles;
}

function hideSpots(furniture: readonly FurnitureDef[]): HideSpotDef[] {
  return furniture
    .filter((item) => item.hide === true)
    .map((item) => ({ id: item.id, rect: furnitureRect(item) }));
}

/** The part of a wall that stops cats: all of it, except the open half of a cat door. */
function solidPart(wall: WallDef): WallDef {
  if (wall.kind !== "catDoor") return wall;
  const middle = {
    x: (wall.from.x + wall.to.x) * HALF,
    z: (wall.from.z + wall.to.z) * HALF,
  };
  return { ...wall, to: middle };
}

function wallObstacles(walls: readonly WallDef[]): Obstacle[] {
  return walls.map((wall) => ({ rect: wallRect(solidPart(wall)), blocks: "both" }));
}

function birdPath(placement: BirdPathPlacement): BirdPathDef {
  return { ...placement, perches: placement.perches.map((perch) => perch.pos) };
}

/** Turns the drawable house description into what the game rules need. */
export function toWorld(floor: HouseFloor): WorldDef {
  const walls = wallObstacles(floor.walls);
  const world: WorldDef = {
    bounds: floor.bounds,
    obstacles: [...walls, ...furnitureObstacles(floor.furniture)],
    napPoints: floor.napPoints.map(({ id, name, pos }) => ({ id, name, pos })),
    hideSpots: hideSpots(floor.furniture),
    treatSpawns: floor.treatSpawns,
    knockables: floor.knockables.map(({ id, name, pos }) => ({ id, name, pos })),
    mischief: floor.mischief,
    spawn: floor.spawn,
  };
  return floor.bird === undefined ? world : { ...world, bird: birdPath(floor.bird) };
}

/** Height a cat stands at for a given spot: the tallest platform under it, else the floor. */
export function platformHeightAt(floor: HouseFloor, x: number, z: number): number {
  let height = 0;
  for (const item of floor.furniture) {
    if (item.platformHeight === undefined) {
      continue;
    }
    const rect = furnitureRect(item);
    const inside = x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
    if (inside) {
      height = Math.max(height, item.platformHeight);
    }
  }
  return height;
}
