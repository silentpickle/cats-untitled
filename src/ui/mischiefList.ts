import type { CatId, GameState, MischiefDef } from "../sim/types";
import { element } from "./dom";

const NARROW_SCREEN = "(max-width: 700px)";

/** The player's to-do list down the side of the screen. */
export class MischiefList {
  private readonly root = element("mischief", HTMLElement);
  private readonly list = element("mischief-items", HTMLElement);
  private readonly toggle = element("mischief-toggle", HTMLButtonElement);
  private readonly rows = new Map<string, HTMLElement>();

  constructor() {
    this.toggle.addEventListener("click", () => {
      this.setOpen(this.root.classList.contains("collapsed"));
    });
  }

  private setOpen(open: boolean): void {
    this.root.classList.toggle("collapsed", !open);
    this.toggle.setAttribute("aria-expanded", String(open));
  }

  show(player: CatId, items: readonly MischiefDef[]): void {
    this.rows.clear();
    this.list.replaceChildren();
    for (const item of items.filter((candidate) => candidate.cat === player)) {
      const row = document.createElement("li");
      row.textContent = item.label;
      this.rows.set(item.id, row);
      this.list.append(row);
    }
    this.root.hidden = this.rows.size === 0;
    // Small screens start with the list folded away so it does not cover the house.
    this.setOpen(!window.matchMedia(NARROW_SCREEN).matches);
  }

  hide(): void {
    this.root.hidden = true;
  }

  update(state: GameState): void {
    let done = 0;
    for (const item of state.mischief) {
      const row = this.rows.get(item.id);
      if (row === undefined) {
        continue;
      }
      row.classList.toggle("done", item.done);
      done += Number(item.done);
    }
    this.toggle.textContent = `Mischief ${String(done)}/${String(this.rows.size)}`;
  }
}
