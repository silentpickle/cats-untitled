import * as THREE from "three";
import type { GroundAt } from "../input/tapGoal";

const UP = new THREE.Vector3(0, 1, 0);
const TO_NDC = 2;

/** The line of sight through a point on the screen, as a function from height to floor position. */
export function sightLine(
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): GroundAt {
  const box = canvas.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((clientX - box.left) / box.width) * TO_NDC - 1,
    1 - ((clientY - box.top) / box.height) * TO_NDC,
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  return (height) => {
    const hit = raycaster.ray.intersectPlane(new THREE.Plane(UP, -height), new THREE.Vector3());
    return hit === null ? null : { x: hit.x, z: hit.z };
  };
}
