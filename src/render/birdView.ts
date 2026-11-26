import * as THREE from "three";
import type { BirdPathPlacement } from "../house/types";
import type { BirdState } from "../sim/types";

/** A house sparrow: brown back, pale belly, a short dark beak. Metres. */
const LOOK = {
  back: 0x7a5534,
  belly: 0xd8cbb0,
  beak: 0x2b2420,
  bodyRadius: 0.07,
  bodyStretch: 1.5,
  headRadius: 0.045,
  headUp: 0.06,
  headForward: 0.08,
  beakLength: 0.035,
  beakRadius: 0.012,
  wingSpan: 0.13,
  wingChord: 0.08,
  wingThick: 0.008,
  tailLength: 0.08,
  tailWidth: 0.05,
  segments: 12,
} as const;

const MOTION = {
  /** Height it flies at between perches. */
  flyHeight: 1.45,
  bobHeight: 0.06,
  bobPerSecond: 6,
  flapPerSecond: 22,
  flapAngle: 1.1,
  /** Wings folded along the body while it sits. */
  foldAngle: 0.15,
  heightEase: 8,
  turnEase: 14,
  /** Seconds it is still seen climbing away after leaving through the door. */
  departSeconds: 1.2,
  departClimb: 2.5,
  /** Moves shorter than this between frames do not turn it. */
  minTurnMetres: 0.002,
} as const;

const HALF = 0.5;
const QUARTER_TURN = Math.PI * HALF;

function wing(side: number, material: THREE.Material): THREE.Group {
  const pivot = new THREE.Group();
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(LOOK.wingSpan, LOOK.wingThick, LOOK.wingChord),
    material,
  );
  blade.position.x = side * LOOK.wingSpan * HALF;
  blade.castShadow = true;
  pivot.add(blade);
  pivot.position.set(side * LOOK.bodyRadius * HALF, LOOK.bodyRadius * HALF, 0);
  return pivot;
}

function body(back: THREE.Material, belly: THREE.Material): THREE.Mesh[] {
  const trunk = new THREE.Mesh(
    new THREE.SphereGeometry(LOOK.bodyRadius, LOOK.segments, LOOK.segments),
    belly,
  );
  trunk.scale.z = LOOK.bodyStretch;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(LOOK.headRadius, LOOK.segments, LOOK.segments),
    back,
  );
  head.position.set(0, LOOK.headUp, LOOK.headForward);
  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(LOOK.beakRadius, LOOK.beakLength, LOOK.segments),
    new THREE.MeshStandardMaterial({ color: LOOK.beak }),
  );
  beak.rotation.x = QUARTER_TURN;
  beak.position.set(0, LOOK.headUp, LOOK.headForward + LOOK.headRadius);
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(LOOK.tailWidth, LOOK.wingThick, LOOK.tailLength),
    back,
  );
  tail.position.set(0, LOOK.bodyRadius * HALF, -LOOK.bodyRadius * LOOK.bodyStretch);
  const parts = [trunk, head, beak, tail];
  for (const part of parts) part.castShadow = true;
  return parts;
}

function ease(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/** The bird that sometimes follows Aragorn in: flaps between perches, sits with its wings folded. */
export class BirdView {
  readonly object = new THREE.Group();
  private readonly wings: readonly THREE.Group[];
  private clock = 0;
  private departing = 0;
  private wasIn = false;
  private readonly last = new THREE.Vector2();

  constructor(private readonly path: BirdPathPlacement | undefined) {
    const back = new THREE.MeshStandardMaterial({ color: LOOK.back, roughness: 0.8 });
    const belly = new THREE.MeshStandardMaterial({ color: LOOK.belly, roughness: 0.8 });
    this.wings = [wing(-1, back), wing(1, back)];
    this.object.add(...body(back, belly), ...this.wings);
    this.object.visible = false;
  }

  update(bird: BirdState, dt: number): void {
    this.clock += dt;
    const inside = bird.phase !== "away";
    if (!inside) {
      this.depart(dt);
      return;
    }
    if (!this.wasIn) this.arrive(bird);
    this.wasIn = true;
    this.object.visible = true;
    this.face(bird, dt);
    this.object.position.x = bird.pos.x;
    this.object.position.z = bird.pos.z;
    const goal = this.heightFor(bird);
    this.object.position.y += (goal - this.object.position.y) * ease(MOTION.heightEase, dt);
    this.flap(!bird.perched);
  }

  private arrive(bird: BirdState): void {
    this.object.position.set(bird.pos.x, MOTION.flyHeight, bird.pos.z);
    this.last.set(bird.pos.x, bird.pos.z);
  }

  /** After it goes out the door it keeps climbing for a moment, then is gone. */
  private depart(dt: number): void {
    if (this.wasIn) this.departing = MOTION.departSeconds;
    this.wasIn = false;
    this.departing = Math.max(0, this.departing - dt);
    this.object.visible = this.departing > 0;
    if (!this.object.visible) return;
    this.object.position.y += MOTION.departClimb * dt;
    this.flap(true);
  }

  private heightFor(bird: BirdState): number {
    const perch = this.path?.perches[bird.target];
    if (bird.perched && bird.phase === "in" && perch !== undefined) return perch.height;
    return MOTION.flyHeight + Math.sin(this.clock * MOTION.bobPerSecond) * MOTION.bobHeight;
  }

  private face(bird: BirdState, dt: number): void {
    const dx = bird.pos.x - this.last.x;
    const dz = bird.pos.z - this.last.y;
    this.last.set(bird.pos.x, bird.pos.z);
    if (Math.hypot(dx, dz) < MOTION.minTurnMetres) return;
    const goal = Math.atan2(dx, dz);
    const turn = Math.atan2(
      Math.sin(goal - this.object.rotation.y),
      Math.cos(goal - this.object.rotation.y),
    );
    this.object.rotation.y += turn * ease(MOTION.turnEase, dt);
  }

  private flap(flying: boolean): void {
    const angle = flying
      ? Math.sin(this.clock * MOTION.flapPerSecond) * MOTION.flapAngle
      : -MOTION.foldAngle;
    const [left, right] = this.wings;
    if (left !== undefined) left.rotation.z = -angle;
    if (right !== undefined) right.rotation.z = angle;
  }
}
