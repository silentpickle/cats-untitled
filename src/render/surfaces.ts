import * as THREE from "three";
import type { SurfaceName } from "../house/types";
import { newSheet, type Sheet } from "./canvasKit";
import { catPainting, treePainting } from "./paintings";
import {
  floralCurtain,
  orangeThrow,
  peacockThrow,
  plaid,
  quilt,
  runner,
  vintageRug,
} from "./surfaceFabrics";
import { carpet, concrete, deck, granite, grass, hardwood, tile } from "./surfaceFloors";

/** Which faces of a box carry the pattern; the rest take the edge colour. */
export type SurfaceFaces = "top" | "front" | "all";

export interface SurfaceDef {
  readonly width: number;
  readonly height: number;
  /** Metres one copy of the pattern covers; null stretches one copy over the whole face. */
  readonly tileMetres: number | null;
  readonly faces: SurfaceFaces;
  readonly edge: number;
  readonly draw: (sheet: Sheet) => void;
}

const PX = {
  large: 512,
  medium: 256,
  rugHeight: 400,
  paintingHeight: 340,
  catHeight: 320,
} as const;

export const SURFACES: Record<SurfaceName, SurfaceDef> = {
  hardwood: {
    width: PX.large,
    height: PX.large,
    tileMetres: 1.6,
    faces: "all",
    edge: 0x4c2116,
    draw: hardwood,
  },
  tile: {
    width: PX.large,
    height: PX.large,
    tileMetres: 0.9,
    faces: "all",
    edge: 0xcdc3b0,
    draw: tile,
  },
  carpet: {
    width: PX.medium,
    height: PX.medium,
    tileMetres: 0.6,
    faces: "all",
    edge: 0xd3c8b4,
    draw: carpet,
  },
  concrete: {
    width: PX.medium,
    height: PX.medium,
    tileMetres: 1,
    faces: "all",
    edge: 0x77787c,
    draw: concrete,
  },
  grass: {
    width: PX.large,
    height: PX.large,
    tileMetres: 3,
    faces: "all",
    edge: 0x5d8a3a,
    draw: grass,
  },
  deck: {
    width: PX.large,
    height: PX.large,
    tileMetres: 1.4,
    faces: "all",
    edge: 0x7a2f22,
    draw: deck,
  },
  granite: {
    width: PX.medium,
    height: PX.medium,
    tileMetres: 0.6,
    faces: "all",
    edge: 0x8e8a84,
    draw: granite,
  },
  vintageRug: {
    width: PX.large,
    height: PX.rugHeight,
    tileMetres: null,
    faces: "top",
    edge: 0x2f3d63,
    draw: vintageRug,
  },
  plaid: {
    width: PX.medium,
    height: PX.medium,
    tileMetres: 0.45,
    faces: "all",
    edge: 0xb5363a,
    draw: plaid,
  },
  floralCurtain: {
    width: PX.medium,
    height: PX.medium,
    tileMetres: 0.45,
    faces: "all",
    edge: 0xf3efe5,
    draw: floralCurtain,
  },
  runner: {
    width: PX.medium,
    height: PX.medium,
    tileMetres: null,
    faces: "top",
    edge: 0xb49a76,
    draw: runner,
  },
  quilt: {
    width: PX.medium,
    height: PX.medium,
    tileMetres: null,
    faces: "all",
    edge: 0x25305a,
    draw: quilt,
  },
  peacockThrow: {
    width: PX.medium,
    height: PX.medium,
    tileMetres: 0.6,
    faces: "all",
    edge: 0x262a5a,
    draw: peacockThrow,
  },
  orangeThrow: {
    width: PX.medium,
    height: PX.medium,
    tileMetres: null,
    faces: "all",
    edge: 0xf05a1a,
    draw: orangeThrow,
  },
  treePainting: {
    width: PX.large,
    height: PX.paintingHeight,
    tileMetres: null,
    faces: "front",
    edge: 0x2b2420,
    draw: treePainting,
  },
  catPainting: {
    width: PX.medium,
    height: PX.catHeight,
    tileMetres: null,
    faces: "front",
    edge: 0x111111,
    draw: catPainting,
  },
};

const ANISOTROPY = 8;
const cache = new Map<SurfaceName, THREE.CanvasTexture>();

/** Each pattern is drawn once, the first time something asks for it; its seed is its place in the list. */
export function surfaceTexture(name: SurfaceName): THREE.CanvasTexture {
  const cached = cache.get(name);
  if (cached !== undefined) {
    return cached;
  }
  const def = SURFACES[name];
  const seed = Object.keys(SURFACES).indexOf(name) + 1;
  const sheet = newSheet(def.width, def.height, seed);
  def.draw(sheet);
  const texture = new THREE.CanvasTexture(sheet.ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = ANISOTROPY;
  cache.set(name, texture);
  return texture;
}

/** How many copies of the pattern fit across a face this many metres wide and tall. */
export function repeatsFor(name: SurfaceName, across: number, down: number): THREE.Vector2 {
  const tileMetres = SURFACES[name].tileMetres;
  if (tileMetres === null) {
    return new THREE.Vector2(1, 1);
  }
  return new THREE.Vector2(across / tileMetres, down / tileMetres);
}

/** A material showing the pattern, repeated so it keeps its real size on a face of the given size. */
export function surfaceMaterial(
  name: SurfaceName,
  repeats: THREE.Vector2,
): THREE.MeshStandardMaterial {
  const map = surfaceTexture(name).clone();
  map.repeat.copy(repeats);
  return new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
}
