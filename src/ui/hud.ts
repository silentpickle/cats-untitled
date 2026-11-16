import type { CatId, GameState } from "../sim/types";
import { element } from "./dom";

const SECONDS_PER_MINUTE = 60;
const SECOND_DIGITS = 2;
const TOAST_MS = 1600;

export function clockText(secondsLeft: number): string {
  const whole = Math.max(0, Math.ceil(secondsLeft));
  const minutes = Math.floor(whole / SECONDS_PER_MINUTE);
  const seconds = String(whole % SECONDS_PER_MINUTE).padStart(SECOND_DIGITS, "0");
  return `${String(minutes)}:${seconds}`;
}

/** The strip along the top: both scores, the clock, and a dot per nap point. */
export class Hud {
  private readonly root = element("hud", HTMLElement);
  private readonly timer = element("timer", HTMLElement);
  private readonly points = element("points", HTMLElement);
  private readonly toast = element("toast", HTMLElement);
  private readonly hint = element("hint", HTMLElement);
  private readonly scores: Record<CatId, HTMLElement> = {
    brother: element("score-brother", HTMLElement),
    sister: element("score-sister", HTMLElement),
  };
  private readonly dots: HTMLElement[] = [];
  private toastTimer = 0;

  show(player: CatId, pointCount: number, hint: string): void {
    this.root.hidden = false;
    this.hint.hidden = false;
    this.hint.textContent = hint;
    for (const cat of Object.keys(this.scores)) {
      this.scores[cat as CatId].parentElement?.classList.toggle("you", cat === player);
    }
    this.points.replaceChildren();
    this.dots.length = 0;
    for (let i = 0; i < pointCount; i += 1) {
      const dot = document.createElement("i");
      this.points.append(dot);
      this.dots.push(dot);
    }
  }

  hide(): void {
    this.root.hidden = true;
    this.hint.hidden = true;
  }

  update(state: GameState): void {
    this.timer.textContent = clockText(state.timeLeft);
    this.scores.brother.textContent = String(Math.floor(state.cats.brother.score));
    this.scores.sister.textContent = String(Math.floor(state.cats.sister.score));
    state.points.forEach((point, index) => {
      const dot = this.dots[index];
      if (dot !== undefined) {
        dot.className = point.owner ?? "";
      }
    });
  }

  say(message: string): void {
    this.toast.textContent = message;
    this.toast.classList.add("show");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.classList.remove("show");
    }, TOAST_MS);
  }
}
