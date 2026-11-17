import { normalizeRoomCode } from "../net";
import type { CatId } from "../sim/types";
import { element } from "../ui/dom";

const COPIED_MS = 1500;

export interface LobbyHandlers {
  onHost(cat: CatId): void;
  onJoin(code: string): void;
  onBack(): void;
  onCheckNetwork(): void;
  /** The troubleshooting report to copy. */
  report(): string;
}

const CHECK_LABEL = "Check my connection";
const REPORT_LABEL = "Copy report";

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
  private readonly help = element("lobby-help", HTMLDetailsElement);
  private readonly relayStatus = element("relay-status", HTMLElement);
  private readonly advice = element("net-advice", HTMLUListElement);
  private readonly check = element("check-network", HTMLButtonElement);
  private readonly copyReport = element("copy-report", HTMLButtonElement);
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
      this.copyText(this.link, this.copy, "Copy invite link");
    });
    this.check.addEventListener("click", () => {
      handlers.onCheckNetwork();
    });
    this.copyReport.addEventListener("click", () => {
      this.copyText(handlers.report(), this.copyReport, REPORT_LABEL);
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
    this.help.hidden = true;
    this.help.open = false;
    this.say(code === "" ? "" : "Tap Join to play with your friend.");
  }

  /**
   * Updates the "Trouble connecting?" panel. `urgent` opens it, for problems the player must act on.
   */
  showHelp(relayLine: string, advice: readonly string[], urgent: boolean): void {
    this.help.hidden = false;
    this.help.open ||= urgent;
    this.relayStatus.textContent = relayLine;
    this.advice.replaceChildren(
      ...advice.map((line) => {
        const item = document.createElement("li");
        item.textContent = line;
        return item;
      }),
    );
  }

  /** While a network check runs, its button says so and cannot be pressed again. */
  checking(busy: boolean): void {
    this.check.disabled = busy;
    this.check.textContent = busy ? "Checking…" : CHECK_LABEL;
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

  /** The clipboard can refuse (no permission, insecure page); then show the text to copy by hand. */
  private copyText(text: string, button: HTMLButtonElement, label: string): void {
    navigator.clipboard.writeText(text).then(
      () => {
        button.textContent = "Copied!";
        window.setTimeout(() => {
          button.textContent = label;
        }, COPIED_MS);
      },
      () => {
        this.say(text);
      },
    );
  }
}
