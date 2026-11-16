/** Reports every press on the stage, and every move while pressed, as screen coordinates. */
export class TapInput {
  private pressed = false;

  constructor(target: HTMLElement, onTap: (clientX: number, clientY: number) => void) {
    target.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary) {
        return;
      }
      this.pressed = true;
      onTap(event.clientX, event.clientY);
    });
    target.addEventListener("pointermove", (event) => {
      if (this.pressed && event.isPrimary) {
        onTap(event.clientX, event.clientY);
      }
    });
    for (const kind of ["pointerup", "pointercancel", "pointerleave"] as const) {
      target.addEventListener(kind, () => {
        this.pressed = false;
      });
    }
  }
}

/** The on-screen swat or stealth button. */
export class AbilityButton {
  private held = false;
  /** A press not yet seen by the game, so a tap shorter than one frame still counts. */
  private pending = false;

  constructor(private readonly button: HTMLElement) {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.held = true;
      this.pending = true;
    });
    for (const kind of ["pointerup", "pointercancel", "pointerleave"] as const) {
      button.addEventListener(kind, () => {
        this.held = false;
      });
    }
  }

  label(text: string, cat: string): void {
    this.button.textContent = text;
    this.button.className = cat;
    this.button.hidden = false;
  }

  hide(): void {
    this.button.hidden = true;
    this.held = false;
    this.pending = false;
  }

  /** True while pressed, and once more for a press that has already been released. */
  takePress(): boolean {
    const pressed = this.held || this.pending;
    this.pending = false;
    return pressed;
  }
}
