import type * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}assets/${path}`;
}

/** Loads a model once; later calls share the same download. */
export function loadGltf(path: string): Promise<GLTF> {
  const cached = cache.get(path);
  if (cached !== undefined) {
    return cached;
  }
  const pending = loader.loadAsync(assetUrl(path));
  cache.set(path, pending);
  return pending;
}

export async function loadModelCopy(path: string): Promise<THREE.Object3D> {
  const gltf = await loadGltf(path);
  return gltf.scene.clone(true);
}
