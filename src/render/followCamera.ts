import * as THREE from "three";
import type { CameraSettings } from "../config";
import type { Rect, Vec2 } from "../sim/types";

/** How far inside each wall the view centre stops, so the screen is not mostly empty outside. */
const MARGIN = { side: 4, far: 2.5, near: 3 } as const;

/** On tall, narrow screens the camera backs off so about as much of the room stays in view. */
const WIDE_ENOUGH_ASPECT = 1.2;
const MAX_PULL_BACK = 1.8;

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

/** Keeps a fixed high angle on the cat, easing toward it so quick turns do not jolt the view. */
export class FollowCamera {
  private readonly focus = new THREE.Vector3();
  private placed = false;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly settings: CameraSettings,
    private readonly bounds: Rect,
  ) {}

  update(target: Vec2, dt: number): void {
    const goal = new THREE.Vector3(
      clamp(target.x, this.bounds.minX + MARGIN.side, this.bounds.maxX - MARGIN.side),
      0,
      clamp(target.z, this.bounds.minZ + MARGIN.far, this.bounds.maxZ - MARGIN.near),
    );
    if (!this.placed) {
      this.focus.copy(goal);
      this.placed = true;
    }
    const blend = 1 - Math.exp(-this.settings.followLerp * dt);
    this.focus.lerp(goal, blend);
    const pullBack = clamp(WIDE_ENOUGH_ASPECT / this.camera.aspect, 1, MAX_PULL_BACK);
    this.camera.position.set(
      this.focus.x,
      this.settings.height * pullBack,
      this.focus.z + this.settings.distance * pullBack,
    );
    this.camera.lookAt(this.focus);
  }
}
