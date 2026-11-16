import type { CatId, GameState, MischiefDef } from "../sim/types";
import { element } from "./dom";

/** The player's to-do list down the side of the screen. */
export class MischiefList {
  private readonly root = element("mischief", HTMLElement);
  private readonly list = element("mischief-items", HTMLElement);
  private readonly rows = new Map<string, HTMLElement>();

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
  }

  hide(): void {
    this.root.hidden = true;
  }

  update(state: GameState): void {
    for (const item of state.mischief) {
      this.rows.get(item.id)?.classList.toggle("done", item.done);
    }
  }
}
