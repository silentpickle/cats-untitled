import * as THREE from "three";
import type { CameraSettings } from "../config";
import type { Rect, Vec2 } from "../sim/types";

/**
 * On tall, narrow screens the camera backs off a little so more of the room fits across, but not so
 * far that the house becomes a small band in the middle of the screen.
 */
const NARROW_ASPECT = 0.75;
const MAX_PULL_BACK = 1.4;
/** Share of the visible half-width or half-depth kept between the view centre and a wall. */
const EDGE_SHARE = 0.85;
const HALF = 0.5;
const HALF_TURN_DEGREES = 180;

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

/** Clamps `value` so a view reaching `reach` either side stays inside [low, high], centring if it cannot. */
function keepInside(value: number, low: number, high: number, reach: number): number {
  const margin = Math.min(reach * EDGE_SHARE, (high - low) * HALF);
  return clamp(value, low + margin, high - margin);
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
    const pullBack = clamp(NARROW_ASPECT / this.camera.aspect, 1, MAX_PULL_BACK);
    const height = this.settings.height * pullBack;
    const distance = this.settings.distance * pullBack;
    const reach = this.groundReach(height, distance);
    const goal = new THREE.Vector3(
      keepInside(target.x, this.bounds.minX, this.bounds.maxX, reach.across),
      0,
      keepInside(target.z, this.bounds.minZ, this.bounds.maxZ, reach.deep),
    );
    if (!this.placed) {
      this.focus.copy(goal);
      this.placed = true;
    }
    this.focus.lerp(goal, 1 - Math.exp(-this.settings.followLerp * dt));
    this.camera.position.set(this.focus.x, height, this.focus.z + distance);
    this.camera.lookAt(this.focus);
  }

  /** Roughly how far the floor is visible either side of the view centre, across and in depth. */
  private groundReach(height: number, distance: number): { across: number; deep: number } {
    const range = Math.hypot(height, distance);
    const halfFov = (this.camera.fov * HALF * Math.PI) / HALF_TURN_DEGREES;
    const halfHeight = range * Math.tan(halfFov);
    return { across: halfHeight * this.camera.aspect, deep: (halfHeight * range) / height };
  }
}
