import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import type { CatId, CatSettings, CatState } from "../sim/types";
import { blackCatTexture } from "./catTexture";
import { loadGltf } from "./models";

const CAT_MODEL = "cat.glb";

/** Nose-to-tail length of the sister in metres, before each cat's own scale. Larger than life. */
const BASE_LENGTH = 0.8;
/** Turn that makes the model's nose point along +z. */
const MODEL_YAW = 0;

const TUNING = {
  fade: 0.18,
  turnSpeed: 10,
  climbSpeed: 9,
  loafSquash: 0.72,
  loafEase: 6,
  swaggerRoll: 0.09,
  swaggerRate: 5,
  brotherWidth: 1.18,
  brotherWalkPace: 0.8,
  sisterRunPace: 1.2,
  napPace: 0.35,
  chestFleckSize: 0.07,
  chestFleckHeight: 0.2,
  chestFleckForward: 0.3,
  roughness: 0.85,
} as const;

const WHITE = 0xffffff;
const FULL_TURN = Math.PI + Math.PI;

type Pose = "idle" | "walk" | "run" | "nap" | "startled" | "swat";

const CLIP_SUFFIX: Record<Pose, string> = {
  idle: "Idle",
  walk: "Walk",
  run: "Run",
  nap: "Idle",
  startled: "Jump_Loop",
  swat: "Headbutt",
};

function clipFor(clips: readonly THREE.AnimationClip[], pose: Pose): THREE.AnimationClip {
  const suffix = `|${CLIP_SUFFIX[pose]}`;
  const clip = clips.find((candidate) => candidate.name.endsWith(suffix));
  if (clip === undefined) {
    throw new Error(`cat model has no ${CLIP_SUFFIX[pose]} animation`);
  }
  return clip;
}

function paintBlack(model: THREE.Object3D): void {
  let painted: THREE.Texture | null = null;
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const original = child.material as THREE.MeshStandardMaterial;
    if (original.map === null) {
      return;
    }
    painted ??= blackCatTexture(original.map);
    child.material = new THREE.MeshStandardMaterial({ map: painted, roughness: TUNING.roughness });
    child.castShadow = true;
    child.frustumCulled = false;
  });
}

function poseFor(state: CatState, id: CatId): Pose {
  if (state.stunnedFor > 0) {
    return "startled";
  }
  if (state.fleeFor > 0) {
    return "run";
  }
  if (state.napping) {
    return "nap";
  }
  if (!state.moving) {
    return "idle";
  }
  return id === "sister" ? "run" : "walk";
}

function shortestTurn(from: number, to: number): number {
  const diff = (to - from) % FULL_TURN;
  if (diff > Math.PI) {
    return diff - FULL_TURN;
  }
  if (diff < -Math.PI) {
    return diff + FULL_TURN;
  }
  return diff;
}

function ease(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/** One cat on screen: the model, its animations, and how it follows the game state. */
export class CatView {
  readonly object = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<Pose, THREE.AnimationAction>;
  private pose: Pose = "idle";
  private swatting = false;
  private walkClock = 0;
  private readonly baseScale: THREE.Vector3;

  constructor(
    private readonly id: CatId,
    model: THREE.Object3D,
    clips: readonly THREE.AnimationClip[],
    settings: CatSettings,
  ) {
    paintBlack(model);
    model.rotation.y = MODEL_YAW;
    model.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    const unit = (BASE_LENGTH * settings.scale) / Math.max(size.x, size.z);
    const width = id === "brother" ? TUNING.brotherWidth : 1;
    this.baseScale = new THREE.Vector3(unit * width, unit, unit);
    this.body.scale.copy(this.baseScale);
    this.body.add(model);
    this.object.add(this.body);
    if (id === "sister") {
      this.object.add(this.chestFleck(settings.scale));
    }

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = this.buildActions(clips);
    this.actions.idle.play();
    this.mixer.addEventListener("finished", () => {
      this.swatting = false;
    });
  }

  private buildActions(clips: readonly THREE.AnimationClip[]): Record<Pose, THREE.AnimationAction> {
    const action = (pose: Pose): THREE.AnimationAction =>
      this.mixer.clipAction(clipFor(clips, pose));
    const actions = {
      idle: action("idle"),
      walk: action("walk"),
      run: action("run"),
      nap: action("nap"),
      startled: action("startled"),
      swat: action("swat"),
    };
    actions.swat.setLoop(THREE.LoopOnce, 1);
    actions.walk.timeScale = this.id === "brother" ? TUNING.brotherWalkPace : 1;
    actions.run.timeScale = this.id === "sister" ? TUNING.sisterRunPace : 1;
    return actions;
  }

  /** The sister's tiny white patch. */
  private chestFleck(scale: number): THREE.Mesh {
    const edge = TUNING.chestFleckSize * scale;
    const fleck = new THREE.Mesh(
      new THREE.BoxGeometry(edge, edge, edge),
      new THREE.MeshStandardMaterial({ color: WHITE }),
    );
    const reach = BASE_LENGTH * scale;
    fleck.position.set(0, reach * TUNING.chestFleckHeight, reach * TUNING.chestFleckForward);
    return fleck;
  }

  playSwat(): void {
    this.swatting = true;
    this.switchTo("swat");
  }

  private switchTo(pose: Pose): void {
    if (pose === this.pose) {
      return;
    }
    const next = this.actions[pose];
    const previous = this.actions[this.pose];
    this.pose = pose;
    if (next === previous) {
      return;
    }
    next.reset().fadeIn(TUNING.fade).play();
    previous.fadeOut(TUNING.fade);
  }

  update(state: CatState, groundHeight: number, dt: number): void {
    if (!this.swatting) {
      this.switchTo(poseFor(state, this.id));
    }
    const napping = this.pose === "nap";
    this.mixer.timeScale = napping ? TUNING.napPace : 1;
    this.mixer.update(dt);

    this.object.position.x = state.pos.x;
    this.object.position.z = state.pos.z;
    this.object.position.y += (groundHeight - this.object.position.y) * ease(TUNING.climbSpeed, dt);
    const turn = shortestTurn(this.object.rotation.y, state.facing);
    this.object.rotation.y += turn * ease(TUNING.turnSpeed, dt);

    this.settle(napping, dt);
    this.swagger(state.moving, dt);
  }

  /** Sinks into a loaf while napping. */
  private settle(napping: boolean, dt: number): void {
    const goal = this.baseScale.y * (napping ? TUNING.loafSquash : 1);
    this.body.scale.y += (goal - this.body.scale.y) * ease(TUNING.loafEase, dt);
  }

  /** The brother rolls his shoulders when he walks. */
  private swagger(moving: boolean, dt: number): void {
    if (this.id !== "brother" || !moving) {
      this.body.rotation.z *= 1 - ease(TUNING.loafEase, dt);
      return;
    }
    this.walkClock += dt;
    this.body.rotation.z = Math.sin(this.walkClock * TUNING.swaggerRate) * TUNING.swaggerRoll;
  }
}

export async function loadCatViews(
  cats: Readonly<Record<CatId, CatSettings>>,
): Promise<Record<CatId, CatView>> {
  const gltf = await loadGltf(CAT_MODEL);
  const make = (id: CatId): CatView =>
    new CatView(id, cloneSkinned(gltf.scene), gltf.animations, cats[id]);
  return { brother: make("brother"), sister: make("sister") };
}
