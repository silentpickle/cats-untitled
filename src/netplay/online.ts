import type { NetSettings } from "../config";
import {
  GuestSession,
  HostSession,
  makeRoomCode,
  roomLink,
  type JoinRoom,
  type SessionStatus,
} from "../net";
import { LocalMatch, computerRival, otherCat, type Match } from "../play/localMatch";
import type { NavGrid } from "../sim";
import type { CatId, GameState, Settings, WorldDef } from "../sim/types";
import { catName } from "../ui/screens";
import { GuestMatch } from "./guestMatch";
import { HostMatch, remoteRival } from "./hostMatch";
import type { Lobby } from "./lobby";
import type { Troubleshooter } from "./troubleshooter";
import { PROTOCOL_VERSION, decodeWelcome, type CatsGuest, type CatsHost } from "./protocol";
import { decodeCatInput, decodeGameState } from "./wire";

/** What an online round can do that a solo one cannot. */
export interface OnlineRound {
  /** Host only: start another round in the same room. */
  readonly canRestart: boolean;
  restart(): void;
  /** Close the room and go back to the menu. */
  leave(): void;
}

/** The parts of the game an online session drives. */
export interface GameHooks {
  startRound(cat: CatId, match: Match, online: OnlineRound): void;
  say(text: string): void;
  showNotice(title: string, detail: string): void;
  idleState(): GameState;
  backToMenu(): void;
}

export interface OnlineWorld {
  readonly world: WorldDef;
  readonly sim: Settings;
  readonly navs: Readonly<Record<CatId, NavGrid>>;
}

const GUEST_STATUS: Partial<Record<SessionStatus, string>> = {
  waiting: "Looking for the room…",
  full: "That room already has two players.",
  mismatch: "Your friend has a different version of the game. Both of you reload the page.",
};

/** Opens or joins a room and turns the session's progress into rounds and messages. */
export class Online {
  private close: () => void = () => undefined;

  constructor(
    private readonly net: NetSettings,
    private readonly game: OnlineWorld,
    private readonly joiner: JoinRoom,
    private readonly lobby: Lobby,
    private readonly hooks: GameHooks,
    private readonly help: Troubleshooter,
  ) {}

  /** Leaves any open room. Safe to call when none is open. */
  leave(): void {
    this.help.stop();
    this.close();
    this.close = () => undefined;
  }

  host(cat: CatId): void {
    this.leave();
    const code = makeRoomCode(this.net.roomCodeLength);
    const room = this.joiner(code);
    const link: CatsHost = new HostSession({
      room,
      protocol: PROTOCOL_VERSION,
      welcome: { cat: otherCat(cat) },
      decodeInput: decodeCatInput,
    });
    this.close = () => {
      link.close();
    };
    this.lobby.showRoom(code, roomLink(window.location.href, code));
    this.lobby.say(`Waiting for your friend to join as ${catName(otherCat(cat))}…`);
    this.help.follow(room, "host");
    link.onStatus((status) => {
      this.onHostStatus(status, cat, link);
    });
  }

  join(code: string): void {
    this.leave();
    const room = this.joiner(code);
    const link: CatsGuest = new GuestSession({
      room,
      protocol: PROTOCOL_VERSION,
      decodeState: decodeGameState,
      decodeWelcome,
    });
    this.close = () => {
      link.close();
    };
    this.lobby.say(GUEST_STATUS.waiting ?? "");
    this.help.follow(room, "guest");
    link.onWelcome((welcome) => {
      this.startGuestRound(welcome.cat, link);
    });
    link.onStatus((status) => {
      this.onGuestStatus(status);
    });
  }

  private onHostStatus(status: SessionStatus, cat: CatId, link: CatsHost): void {
    if (status === "connected") {
      this.startHostRound(cat, link);
      return;
    }
    if (status === "left") {
      this.hooks.say(`Your friend left. The computer plays ${catName(otherCat(cat))} now.`);
    }
  }

  private startHostRound(cat: CatId, link: CatsHost): void {
    const { world, sim, navs } = this.game;
    const fallback = computerRival(world, sim, navs, otherCat(cat));
    const local = new LocalMatch(world, sim, cat, remoteRival(link, fallback));
    const match = new HostMatch(local, link, this.net.snapshotsPerSecond);
    this.help.stop();
    this.lobby.hide();
    this.hooks.startRound(cat, match, {
      canRestart: true,
      restart: () => {
        this.startHostRound(cat, link);
      },
      leave: () => {
        this.leaveToMenu();
      },
    });
  }

  private startGuestRound(cat: CatId, link: CatsGuest): void {
    const match = new GuestMatch(link, this.hooks.idleState(), this.net.inputsPerSecond);
    this.help.stop();
    this.lobby.hide();
    this.hooks.startRound(cat, match, {
      canRestart: false,
      restart: () => undefined,
      leave: () => {
        this.leaveToMenu();
      },
    });
  }

  private onGuestStatus(status: SessionStatus): void {
    if (status === "left") {
      this.leave();
      this.hooks.showNotice("Connection lost", "Your friend's game closed or lost its connection.");
      return;
    }
    const message = GUEST_STATUS[status];
    if (message !== undefined) {
      this.lobby.say(message);
    }
  }

  private leaveToMenu(): void {
    this.leave();
    this.hooks.backToMenu();
  }
}
