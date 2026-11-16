import type { Vec2 } from "../sim/types";

const HALF = 0.5;
const NO_POINTER = -1;

/** On-screen thumb stick and swat button for phones and tablets. */
export class TouchControls {
  private direction: Vec2 = { x: 0, z: 0 };
  private swatHeld = false;
  private pointer = NO_POINTER;

  constructor(
    private readonly stick: HTMLElement,
    private readonly knob: HTMLElement,
    swatButton: HTMLElement,
  ) {
    stick.addEventListener("pointerdown", (event) => {
      this.pointer = event.pointerId;
      stick.setPointerCapture(event.pointerId);
      this.track(event);
    });
    stick.addEventListener("pointermove", (event) => {
      this.track(event);
    });
    for (const kind of ["pointerup", "pointercancel"] as const) {
      stick.addEventListener(kind, () => {
        this.release();
      });
    }
    swatButton.addEventListener("pointerdown", () => {
      this.swatHeld = true;
    });
    for (const kind of ["pointerup", "pointercancel", "pointerleave"] as const) {
      swatButton.addEventListener(kind, () => {
        this.swatHeld = false;
      });
    }
  }

  private track(event: PointerEvent): void {
    if (event.pointerId !== this.pointer) {
      return;
    }
    const box = this.stick.getBoundingClientRect();
    const reach = box.width * HALF;
    const dx = (event.clientX - (box.left + reach)) / reach;
    const dz = (event.clientY - (box.top + reach)) / reach;
    const length = Math.max(1, Math.hypot(dx, dz));
    this.direction = { x: dx / length, z: dz / length };
    this.knob.style.transform = `translate(${String(this.direction.x * reach)}px, ${String(this.direction.z * reach)}px)`;
  }

  private release(): void {
    this.pointer = NO_POINTER;
    this.direction = { x: 0, z: 0 };
    this.knob.style.transform = "";
  }

  move(): Vec2 {
    return this.direction;
  }

  swat(): boolean {
    return this.swatHeld;
  }
}
