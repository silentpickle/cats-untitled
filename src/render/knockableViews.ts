import * as THREE from "three";
import type { KnockableLook, KnockablePlacement } from "../house/types";
import type { GameState } from "../sim/types";

const LOOKS: Record<KnockableLook, { w: number; h: number; d: number; color: number }> = {
  cup: { w: 0.11, h: 0.13, d: 0.11, color: 0xf7f3ea },
  remote: { w: 0.2, h: 0.04, d: 0.07, color: 0x2a2a30 },
  toy: { w: 0.16, h: 0.09, d: 0.1, color: 0x9aa3ad },
};

const HALF = 0.5;
const FALL = { reach: 0.55, tip: Math.PI * HALF, ease: 9 } as const;

interface KnockableView {
  readonly mesh: THREE.Mesh;
  readonly standing: THREE.Vector3;
  readonly fallen: THREE.Vector3;
}

function makeView(item: KnockablePlacement): KnockableView {
  const look = LOOKS[item.look];
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(look.w, look.h, look.d),
    new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.6 }),
  );
  mesh.castShadow = true;
  const standing = new THREE.Vector3(item.pos.x, item.height + look.h * HALF, item.pos.z);
  // Knocked things land on the floor on the camera side, where they can be seen.
  const fallen = new THREE.Vector3(item.pos.x, look.w * HALF, item.pos.z + FALL.reach);
  mesh.position.copy(standing);
  return { mesh, standing, fallen };
}

/** The cup, remote and toy: upright until a cat knocks them, then lying on the floor. */
export class KnockableViews {
  readonly object = new THREE.Group();
  private readonly views = new Map<string, KnockableView>();

  constructor(items: readonly KnockablePlacement[]) {
    for (const item of items) {
      const view = makeView(item);
      this.views.set(item.id, view);
      this.object.add(view.mesh);
    }
  }

  update(state: GameState, dt: number): void {
    const blend = 1 - Math.exp(-FALL.ease * dt);
    for (const item of state.knockables) {
      const view = this.views.get(item.id);
      if (view === undefined) {
        continue;
      }
      const down = item.knockedBy !== null;
      view.mesh.position.lerp(down ? view.fallen : view.standing, blend);
      view.mesh.rotation.z += ((down ? FALL.tip : 0) - view.mesh.rotation.z) * blend;
    }
  }
}
