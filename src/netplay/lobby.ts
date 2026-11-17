import { normalizeRoomCode } from "../net";
import type { CatId } from "../sim/types";
import { element } from "../ui/dom";

const COPIED_MS = 1500;

export interface LobbyHandlers {
  onHost(cat: CatId): void;
  onJoin(code: string): void;
  onBack(): void;
}

function hostCat(button: HTMLButtonElement): CatId | null {
  const cat = button.dataset.host;
  return cat === "brother" || cat === "sister" ? cat : null;
}

/** The "Play with a friend" screen: open a room as one cat, or type a friend's code. */
export class Lobby {
  private readonly root = element("lobby", HTMLElement);
  private readonly start = element("lobby-start", HTMLElement);
  private readonly wait = element("lobby-wait", HTMLElement);
  private readonly code = element("room-code", HTMLElement);
  private readonly status = element("lobby-status", HTMLElement);
  private readonly input = element("join-code", HTMLInputElement);
  private readonly copy = element("copy-link", HTMLButtonElement);
  private link = "";

  constructor(
    private readonly handlers: LobbyHandlers,
    private readonly codeLength: number,
  ) {
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("button[data-host]")) {
      button.addEventListener("click", () => {
        const cat = hostCat(button);
        if (cat !== null) {
          handlers.onHost(cat);
        }
      });
    }
    element("join-form", HTMLFormElement).addEventListener("submit", (event) => {
      event.preventDefault();
      this.submitJoin();
    });
    this.copy.addEventListener("click", () => {
      this.copyLink();
    });
    element("lobby-back", HTMLButtonElement).addEventListener("click", () => {
      handlers.onBack();
    });
  }

  /** Shows the first step; `code` pre-fills the join box, as when opened from an invite link. */
  open(code = ""): void {
    this.root.hidden = false;
    this.start.hidden = false;
    this.wait.hidden = true;
    this.input.value = code;
    this.say(code === "" ? "" : "Tap Join to play with your friend.");
  }

  /** Room open: show the code big, and offer the invite link. */
  showRoom(code: string, link: string): void {
    this.start.hidden = true;
    this.wait.hidden = false;
    this.code.textContent = code;
    this.link = link;
    this.copy.textContent = "Copy invite link";
  }

  say(text: string): void {
    this.status.textContent = text;
  }

  hide(): void {
    this.root.hidden = true;
  }

  private submitJoin(): void {
    const code = normalizeRoomCode(this.input.value, this.codeLength);
    if (code === null) {
      this.say(`A room code is ${String(this.codeLength)} letters and numbers.`);
      return;
    }
    this.start.hidden = true;
    this.handlers.onJoin(code);
  }

  /** The clipboard can refuse (no permission, insecure page); then show the link to copy by hand. */
  private copyLink(): void {
    navigator.clipboard.writeText(this.link).then(
      () => {
        this.copy.textContent = "Copied!";
        window.setTimeout(() => {
          this.copy.textContent = "Copy invite link";
        }, COPIED_MS);
      },
      () => {
        this.say(this.link);
      },
    );
  }
}
