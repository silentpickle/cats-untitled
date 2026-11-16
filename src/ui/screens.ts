import type { CatId, GameState } from "../sim/types";
import { element } from "./dom";

const CAT_NAMES: Record<CatId, string> = { brother: "Brother", sister: "Sister" };

export function catName(cat: CatId): string {
  return CAT_NAMES[cat];
}

function isCatId(value: string | undefined): value is CatId {
  return value === "brother" || value === "sister";
}

/** The pick-a-cat screen and the end-of-round screen. */
export class Screens {
  private readonly select = element("select", HTMLElement);
  private readonly result = element("result", HTMLElement);
  private readonly title = element("result-title", HTMLElement);
  private readonly detail = element("result-detail", HTMLElement);

  constructor(onPick: (cat: CatId) => void, onAgain: () => void) {
    for (const button of this.select.querySelectorAll<HTMLButtonElement>("button[data-cat]")) {
      button.addEventListener("click", () => {
        const cat = button.dataset.cat;
        if (isCatId(cat)) {
          this.select.hidden = true;
          onPick(cat);
        }
      });
    }
    element("again", HTMLButtonElement).addEventListener("click", () => {
      this.result.hidden = true;
      this.select.hidden = false;
      onAgain();
    });
  }

  showResult(state: GameState, player: CatId, winner: CatId | "tie"): void {
    const brother = String(Math.floor(state.cats.brother.score));
    const sister = String(Math.floor(state.cats.sister.score));
    this.title.textContent = resultTitle(player, winner);
    this.detail.textContent = `Brother ${brother} · Sister ${sister}. Bedtime: both cats curl up together.`;
    this.result.hidden = false;
  }
}

export function resultTitle(player: CatId, winner: CatId | "tie"): string {
  if (winner === "tie") {
    return "A tie!";
  }
  return winner === player ? "You win!" : `${catName(winner)} wins`;
}
