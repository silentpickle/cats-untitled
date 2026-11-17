import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSettings } from "../config";
import { MemoryHub, settle, type NetworkCheck } from "../net";
import { Troubleshooter, relayLine, stunServers, type HelpView } from "./troubleshooter";

const net = loadSettings().net;
const ONE_SECOND_MS = 1000;
const STRICT: NetworkCheck = { local: true, publicAddress: true, relay: false, mapping: "changes" };

interface Shown {
  relay: string;
  advice: readonly string[];
  urgent: boolean;
  said: string[];
  busy: boolean[];
}

function recordingView(): { view: HelpView; shown: Shown } {
  const shown: Shown = { relay: "", advice: [], urgent: false, said: [], busy: [] };
  const view: HelpView = {
    showHelp: (relay, advice, urgent) => {
      Object.assign(shown, { relay, advice, urgent });
    },
    checking: (busy) => {
      shown.busy.push(busy);
    },
    say: (text) => {
      shown.said.push(text);
    },
  };
  return { view, shown };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Troubleshooter", () => {
  it("shows relay reachability as soon as it follows a room", () => {
    const hub = new MemoryHub();
    const { view, shown } = recordingView();
    const help = new Troubleshooter(view, net, stunServers(net));
    help.follow(hub.join("host"), "host");
    expect(shown.relay).toBe(relayLine({ open: 1, connecting: 0, total: 1 }));
    expect(shown.advice).toEqual([]);
    help.stop();
  });

  it("says matchmaking is connecting until a relay answers", () => {
    expect(relayLine({ open: 0, connecting: 3, total: 5 })).toBe("Matchmaking: connecting…");
    expect(relayLine({ open: 2, connecting: 3, total: 5 })).toBe(
      "Matchmaking: 2 of 5 servers reachable.",
    );
    expect(relayLine({ open: 0, connecting: 0, total: 5 })).toBe(
      "Matchmaking: 0 of 5 servers reachable.",
    );
  });

  it("opens the panel and tells the player once when the connection fails", async () => {
    const hub = new MemoryHub();
    const { view, shown } = recordingView();
    const help = new Troubleshooter(view, net, stunServers(net));
    help.follow(hub.join("guest"), "guest");
    hub.reportTrouble("guest", { kind: "unreachable", detail: "could not connect to peer h" });
    hub.reportTrouble("guest", { kind: "unreachable", detail: "could not connect to peer h" });
    await settle();
    expect(shown.urgent).toBe(true);
    expect(shown.advice[0]).toMatch(/networks wouldn't connect/);
    expect(shown.said).toHaveLength(1);
    expect(help.report()).toContain("role: guest");
    help.stop();
  });

  it("adds 'still looking' advice once the wait passes the slow mark", async () => {
    vi.useFakeTimers();
    const hub = new MemoryHub();
    const { view, shown } = recordingView();
    const help = new Troubleshooter(view, net, stunServers(net));
    help.follow(hub.join("guest"), "guest");
    await vi.advanceTimersByTimeAsync(net.slowJoinSeconds * ONE_SECOND_MS);
    expect(shown.advice[0]).toMatch(/Still looking/);
    help.stop();
  });

  it("runs the network check with the game's STUN servers and shows the verdict", async () => {
    const hub = new MemoryHub();
    const { view, shown } = recordingView();
    const servers: (readonly RTCIceServer[])[] = [];
    const help = new Troubleshooter(view, net, stunServers(net), (ice) => {
      servers.push(ice);
      return Promise.resolve(STRICT);
    });
    help.follow(hub.join("host"), "host");
    help.runCheck();
    await settle();
    expect(servers).toEqual([net.stunServers.map((urls) => ({ urls }))]);
    expect(shown.busy).toEqual([true, false]);
    expect(shown.advice[0]).toMatch(/looks strict/);
    expect(help.report()).toContain("nat mapping: changes");
    help.stop();
  });

  it("reports WebRTC as blocked when the check cannot start", async () => {
    const hub = new MemoryHub();
    const { view, shown } = recordingView();
    const help = new Troubleshooter(view, net, [], () => Promise.reject(new Error("no WebRTC")));
    help.follow(hub.join("host"), "host");
    help.runCheck();
    await settle();
    expect(shown.advice.join(" ")).toMatch(/isn't allowed/);
    help.stop();
  });

  it("does nothing without a room", () => {
    const { view, shown } = recordingView();
    const help = new Troubleshooter(view, net, []);
    help.runCheck();
    expect(shown.busy).toEqual([]);
    expect(help.report()).toBe("No room open.");
  });
});
