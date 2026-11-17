import type { CatId, GameState } from "../sim/types";
import { element } from "./dom";

const CAT_NAMES: Record<CatId, string> = { brother: "Aragorn", sister: "Arwen" };

export function catName(cat: CatId): string {
  return CAT_NAMES[cat];
}

function isCatId(value: string | undefined): value is CatId {
  return value === "brother" || value === "sister";
}

/** Who ran the round that just ended, which decides what the end screen offers. */
export type RoundMode = "solo" | "host" | "guest";

export interface ScreenHandlers {
  onPick(cat: CatId): void;
  /** "Play again": back to the menu when solo, a new round in the same room when hosting. */
  onAgain(): void;
  /** "Leave room": close the online session. */
  onLeave(): void;
  onFriend(): void;
}

const GUEST_WAIT = " Your friend can start another round.";

/** The pick-a-cat screen and the end-of-round screen. */
export class Screens {
  private readonly select = element("select", HTMLElement);
  private readonly result = element("result", HTMLElement);
  private readonly title = element("result-title", HTMLElement);
  private readonly detail = element("result-detail", HTMLElement);
  private readonly again = element("again", HTMLButtonElement);
  private readonly leave = element("leave", HTMLButtonElement);

  constructor(handlers: ScreenHandlers) {
    for (const button of this.select.querySelectorAll<HTMLButtonElement>("button[data-cat]")) {
      button.addEventListener("click", () => {
        const cat = button.dataset.cat;
        if (isCatId(cat)) {
          this.select.hidden = true;
          handlers.onPick(cat);
        }
      });
    }
    this.again.addEventListener("click", () => {
      this.result.hidden = true;
      handlers.onAgain();
    });
    this.leave.addEventListener("click", () => {
      this.result.hidden = true;
      handlers.onLeave();
    });
    element("play-friend", HTMLButtonElement).addEventListener("click", () => {
      this.select.hidden = true;
      handlers.onFriend();
    });
  }

  showSelect(): void {
    this.result.hidden = true;
    this.select.hidden = false;
  }

  hideSelect(): void {
    this.select.hidden = true;
  }

  hideResult(): void {
    this.result.hidden = true;
  }

  showResult(state: GameState, player: CatId, winner: CatId | "tie", mode: RoundMode): void {
    const brother = String(Math.floor(state.cats.brother.score));
    const sister = String(Math.floor(state.cats.sister.score));
    const wait = mode === "guest" ? GUEST_WAIT : "";
    this.show(
      resultTitle(player, winner),
      `Aragorn ${brother} · Arwen ${sister}. Bedtime: both cats curl up together.${wait}`,
    );
    this.again.hidden = mode === "guest";
    this.leave.hidden = mode === "solo";
  }

  /** A message with only a way back to the menu, such as a lost connection. */
  showNotice(title: string, detail: string): void {
    this.show(title, detail);
    this.again.hidden = true;
    this.leave.hidden = false;
    this.leave.textContent = "Back to menu";
  }

  private show(title: string, detail: string): void {
    this.title.textContent = title;
    this.detail.textContent = detail;
    this.leave.textContent = "Leave room";
    this.result.hidden = false;
  }
}

export function resultTitle(player: CatId, winner: CatId | "tie"): string {
  if (winner === "tie") {
    return "A tie!";
  }
  return winner === player ? "You win!" : `${catName(winner)} wins`;
}
