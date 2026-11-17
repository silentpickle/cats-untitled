import { afterEach, describe, expect, it, vi } from "vitest";
import { checkNetwork, type MakeProbe } from "./probe";

const TIMEOUT_MS = 5000;
const ICE: RTCIceServer[] = [{ urls: "stun:stun.example.test:3478" }];
const HOST_LINE = "candidate:1 1 udp 2122260223 a.local 50000 typ host";
const SRFLX_LINE = "candidate:2 1 udp 1686052607 203.0.113.5 50000 typ srflx raddr 0.0.0.0 rport 0";

interface Fake {
  readonly make: MakeProbe;
  readonly closed: () => boolean;
  readonly servers: () => readonly RTCIceServer[];
}

/** A probe that emits `lines` when started; `end` adds the end-of-candidates signal. */
function fakeProbe(lines: readonly string[], end: boolean, fail = false): Fake {
  let closed = false;
  let servers: readonly RTCIceServer[] = [];
  const make: MakeProbe = (iceServers) => {
    servers = iceServers;
    let emit: (line: string | null) => void = () => undefined;
    return {
      start: () => {
        if (fail) {
          return Promise.reject(new Error("WebRTC is disabled"));
        }
        lines.forEach((line) => {
          emit(line);
        });
        if (end) {
          emit(null);
        }
        return Promise.resolve();
      },
      onCandidate: (handler) => {
        emit = handler;
      },
      close: () => {
        closed = true;
      },
    };
  };
  return { make, closed: () => closed, servers: () => servers };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("checkNetwork", () => {
  it("summarizes the candidates once gathering completes, and closes the probe", async () => {
    const fake = fakeProbe([HOST_LINE, SRFLX_LINE, "garbage"], true);
    const check = await checkNetwork(ICE, TIMEOUT_MS, fake.make);
    expect(check).toEqual({ local: true, publicAddress: true, relay: false, mapping: "steady" });
    expect(fake.closed()).toBe(true);
    expect(fake.servers()).toEqual(ICE);
  });

  it("gives up at the timeout with what it has", async () => {
    vi.useFakeTimers();
    const fake = fakeProbe([HOST_LINE], false);
    const pending = checkNetwork(ICE, TIMEOUT_MS, fake.make);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    await expect(pending).resolves.toMatchObject({ local: true, publicAddress: false });
    expect(fake.closed()).toBe(true);
  });

  it("rejects when the browser will not start WebRTC", async () => {
    const fake = fakeProbe([], false, true);
    await expect(checkNetwork(ICE, TIMEOUT_MS, fake.make)).rejects.toThrow("disabled");
    expect(fake.closed()).toBe(true);
  });
});
