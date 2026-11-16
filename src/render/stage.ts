import * as THREE from "three";
import type { Rect } from "../sim/types";

const LOOK = {
  background: 0x2b2a33,
  skyLight: 0xfff4e0,
  groundLight: 0x6b5a4a,
  hemisphereIntensity: 1.1,
  sunColor: 0xfff0d0,
  sunIntensity: 2.2,
  sunHeight: 12,
  sunOffsetX: -4,
  sunOffsetZ: 5,
  shadowMapSize: 2048,
  shadowMargin: 2,
  shadowFar: 40,
  shadowBias: -0.0005,
  fieldOfView: 38,
  near: 0.1,
  far: 100,
  maxPixelRatio: 2,
} as const;

const HALF = 0.5;

export interface Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  resize(): void;
  render(): void;
}

function makeSun(bounds: Rect): THREE.DirectionalLight {
  const centerX = (bounds.minX + bounds.maxX) * HALF;
  const centerZ = (bounds.minZ + bounds.maxZ) * HALF;
  const reach = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * HALF;
  const sun = new THREE.DirectionalLight(LOOK.sunColor, LOOK.sunIntensity);
  sun.position.set(centerX + LOOK.sunOffsetX, LOOK.sunHeight, centerZ + LOOK.sunOffsetZ);
  sun.target.position.set(centerX, 0, centerZ);
  sun.castShadow = true;
  sun.shadow.mapSize.set(LOOK.shadowMapSize, LOOK.shadowMapSize);
  sun.shadow.bias = LOOK.shadowBias;
  const cam = sun.shadow.camera;
  cam.left = -reach - LOOK.shadowMargin;
  cam.right = reach + LOOK.shadowMargin;
  cam.top = reach + LOOK.shadowMargin;
  cam.bottom = -reach - LOOK.shadowMargin;
  cam.far = LOOK.shadowFar;
  return sun;
}

export function createStage(canvas: HTMLCanvasElement, bounds: Rect): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, LOOK.maxPixelRatio));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(LOOK.background);
  scene.add(new THREE.HemisphereLight(LOOK.skyLight, LOOK.groundLight, LOOK.hemisphereIntensity));
  const sun = makeSun(bounds);
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(LOOK.fieldOfView, 1, LOOK.near, LOOK.far);

  function resize(): void {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  resize();
  return {
    renderer,
    scene,
    camera,
    resize,
    render: () => {
      renderer.render(scene, camera);
    },
  };
}
