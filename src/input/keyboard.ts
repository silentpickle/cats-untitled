import type { Vec2 } from "../sim/types";

const LEFT = ["KeyA", "ArrowLeft"];
const RIGHT = ["KeyD", "ArrowRight"];
const UP = ["KeyW", "ArrowUp"];
const DOWN = ["KeyS", "ArrowDown"];
const SWAT = ["Space", "KeyE"];
const HANDLED = new Set([...LEFT, ...RIGHT, ...UP, ...DOWN, ...SWAT]);

export class Keyboard {
  private readonly held = new Set<string>();

  constructor(target: Window) {
    target.addEventListener("keydown", (event) => {
      this.press(event, true);
    });
    target.addEventListener("keyup", (event) => {
      this.press(event, false);
    });
    target.addEventListener("blur", () => {
      this.held.clear();
    });
  }

  private press(event: KeyboardEvent, down: boolean): void {
    if (!HANDLED.has(event.code)) {
      return;
    }
    event.preventDefault();
    if (down) {
      this.held.add(event.code);
      return;
    }
    this.held.delete(event.code);
  }

  private any(codes: readonly string[]): boolean {
    return codes.some((code) => this.held.has(code));
  }

  private axis(negative: readonly string[], positive: readonly string[]): number {
    return Number(this.any(positive)) - Number(this.any(negative));
  }

  move(): Vec2 {
    return { x: this.axis(LEFT, RIGHT), z: this.axis(UP, DOWN) };
  }

  swat(): boolean {
    return this.any(SWAT);
  }
}
