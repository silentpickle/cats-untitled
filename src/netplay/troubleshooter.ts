import type { NetSettings } from "../config";
import {
  BLOCKED_NETWORK,
  ConnectionWatch,
  advise,
  checkNetwork,
  formatReport,
  networkVerdict,
  type NetRoom,
  type NetworkCheck,
  type RelayCount,
} from "../net";

const REFRESH_MS = 1000;
const MS_PER_SECOND = 1000;

export type Role = "host" | "guest";

/** The parts of the lobby the troubleshooter writes to. */
export interface HelpView {
  showHelp(relayLine: string, advice: readonly string[], urgent: boolean): void;
  checking(busy: boolean): void;
  say(text: string): void;
}

export type NetworkChecker = (
  iceServers: readonly RTCIceServer[],
  timeoutMs: number,
) => Promise<NetworkCheck>;

export function relayLine({ open, connecting, total }: RelayCount): string {
  if (total === 0 || (open === 0 && connecting > 0)) {
    return "Matchmaking: connecting…";
  }
  return `Matchmaking: ${String(open)} of ${String(total)} servers reachable.`;
}

/** The STUN servers from config.toml, in the shape WebRTC wants. */
export function stunServers(net: NetSettings): RTCIceServer[] {
  return net.stunServers.map((urls) => ({ urls }));
}

/**
 * Keeps the lobby's "Trouble connecting?" panel current while a room waits for its second player: relay
 * reachability every second, problems as soon as the transport reports them, and the network check when
 * the player asks for it.
 */
export class Troubleshooter {
  private watch: ConnectionWatch | null = null;
  private role: Role = "host";
  private timer: ReturnType<typeof setInterval> | undefined;
  private told = false;

  constructor(
    private readonly view: HelpView,
    private readonly net: NetSettings,
    private readonly ice: readonly RTCIceServer[],
    private readonly check: NetworkChecker = checkNetwork,
  ) {}

  /** Starts watching a room that is waiting for its partner. */
  follow(room: NetRoom, role: Role): void {
    this.stop();
    this.role = role;
    this.told = false;
    const watch = new ConnectionWatch(room, { slowAfterSeconds: this.net.slowJoinSeconds });
    watch.onChange(() => {
      this.refresh();
    });
    this.watch = watch;
    this.timer = setInterval(() => {
      this.refresh();
    }, REFRESH_MS);
    this.refresh();
  }

  /** The two are connected, or the room closed: stop updating. */
  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.watch = null;
  }

  runCheck(): void {
    const watch = this.watch;
    if (watch === null) {
      return;
    }
    this.view.checking(true);
    const done = (result: NetworkCheck): void => {
      this.view.checking(false);
      watch.noteNetwork(result);
    };
    this.check(this.ice, this.net.networkCheckSeconds * MS_PER_SECOND).then(done, () => {
      done(BLOCKED_NETWORK);
    });
  }

  report(): string {
    if (this.watch === null) {
      return "No room open.";
    }
    return formatReport(this.watch.facts(), {
      role: this.role,
      browser: navigator.userAgent,
      time: new Date().toISOString(),
    });
  }

  private refresh(): void {
    if (this.watch === null) {
      return;
    }
    const facts = this.watch.facts();
    const verdict = facts.network === null ? [] : [networkVerdict(facts.network)];
    const urgent = facts.trouble !== null;
    this.view.showHelp(relayLine(facts.relays), [...verdict, ...advise(facts)], urgent);
    if (urgent && !this.told) {
      this.told = true;
      this.view.say("Couldn't connect to your friend. See below.");
    }
  }
}
