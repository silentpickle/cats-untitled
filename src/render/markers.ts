import * as THREE from "three";
import type { NapPointPlacement } from "../house/types";
import type { CatId, GameState, TreatSpawnDef, Vec2 } from "../sim/types";

export const CAT_COLORS: Record<CatId, number> = { brother: 0xffa63d, sister: 0x5fd0ff };
const NEUTRAL = 0xffffff;

const RING = {
  inner: 0.48,
  outer: 0.6,
  segments: 40,
  lift: 0.03,
  opacity: 0.85,
  fillOpacity: 0.45,
};
const TREAT = { size: 0.13, height: 0.3, color: 0xffd447, spin: 2.5, bob: 0.05, bobRate: 3 };
const HALF = 0.5;
const FLAT = -Math.PI * HALF;
const GOAL = {
  inner: 0.12,
  outer: 0.2,
  lift: 0.04,
  color: 0xffffff,
  opacity: 0.9,
  pulse: 0.2,
  rate: 6,
};
const MIN_FILL = 0.001;

interface PointMarker {
  readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  readonly fill: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
}

function pointMarker(point: NapPointPlacement): PointMarker {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(RING.inner, RING.outer, RING.segments),
    new THREE.MeshBasicMaterial({ color: NEUTRAL, transparent: true, opacity: RING.opacity }),
  );
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(RING.inner, RING.segments),
    new THREE.MeshBasicMaterial({ color: NEUTRAL, transparent: true, opacity: RING.fillOpacity }),
  );
  for (const mesh of [ring, fill]) {
    mesh.rotation.x = FLAT;
    mesh.position.set(point.pos.x, point.height + RING.lift, point.pos.z);
  }
  fill.visible = false;
  return { ring, fill };
}

/** Rings on the nap points and the treats lying about. */
export class Markers {
  readonly object = new THREE.Group();
  private readonly points = new Map<string, PointMarker>();
  private readonly treats = new Map<string, THREE.Mesh>();
  private clock = 0;
  private readonly goal = new THREE.Mesh(
    new THREE.RingGeometry(GOAL.inner, GOAL.outer, RING.segments),
    new THREE.MeshBasicMaterial({ color: GOAL.color, transparent: true, opacity: GOAL.opacity }),
  );

  constructor(napPoints: readonly NapPointPlacement[], treatSpawns: readonly TreatSpawnDef[]) {
    for (const point of napPoints) {
      const marker = pointMarker(point);
      this.points.set(point.id, marker);
      this.object.add(marker.ring, marker.fill);
    }
    this.goal.rotation.x = FLAT;
    this.goal.visible = false;
    this.object.add(this.goal);
    const treatMaterial = new THREE.MeshStandardMaterial({
      color: TREAT.color,
      emissive: TREAT.color,
      emissiveIntensity: 0.5,
    });
    for (const spawn of treatSpawns) {
      const treat = new THREE.Mesh(new THREE.OctahedronGeometry(TREAT.size), treatMaterial);
      treat.position.set(spawn.pos.x, TREAT.height, spawn.pos.z);
      this.treats.set(spawn.id, treat);
      this.object.add(treat);
    }
  }

  /** Shows where the player tapped, at the height of whatever is there; null hides it. */
  setGoal(pos: Vec2 | null, height: number): void {
    this.goal.visible = pos !== null;
    if (pos !== null) {
      this.goal.position.set(pos.x, height + GOAL.lift, pos.z);
    }
  }

  update(state: GameState, dt: number): void {
    this.clock += dt;
    this.goal.scale.setScalar(1 + Math.sin(this.clock * GOAL.rate) * GOAL.pulse);
    for (const point of state.points) {
      const marker = this.points.get(point.id);
      if (marker === undefined) {
        continue;
      }
      marker.ring.material.color.setHex(point.owner === null ? NEUTRAL : CAT_COLORS[point.owner]);
      marker.fill.visible = point.capturer !== null && point.progress > MIN_FILL;
      if (point.capturer !== null) {
        marker.fill.material.color.setHex(CAT_COLORS[point.capturer]);
        marker.fill.scale.setScalar(Math.max(point.progress, MIN_FILL));
      }
    }
    for (const treatState of state.treats) {
      const treat = this.treats.get(treatState.id);
      if (treat === undefined) {
        continue;
      }
      treat.visible = treatState.available;
      treat.rotation.y = this.clock * TREAT.spin;
      treat.position.y = TREAT.height + Math.sin(this.clock * TREAT.bobRate) * TREAT.bob;
    }
  }
}
