import {
  parseCandidate,
  summarizeCandidates,
  type Candidate,
  type NetworkCheck,
} from "./diagnostics";

/**
 * The network check: open a throwaway WebRTC connection to nobody, and see which addresses the browser
 * gathers from the STUN (and TURN) servers the game uses. Nothing is sent to another player.
 */

/** The slice of `RTCPeerConnection` the check needs, so tests can pass a fake. */
export interface ProbeConnection {
  /** Starts gathering candidates. */
  start(): Promise<void>;
  /** Called with each candidate line, then null when gathering is complete. */
  onCandidate(handler: (line: string | null) => void): void;
  close(): void;
}

export type MakeProbe = (iceServers: readonly RTCIceServer[]) => ProbeConnection;

const PROBE_CHANNEL = "probe";

/** The real thing, for the browser. */
export const browserProbe: MakeProbe = (iceServers) => {
  const connection = new RTCPeerConnection({ iceServers: [...iceServers] });
  return {
    start: async () => {
      connection.createDataChannel(PROBE_CHANNEL);
      await connection.setLocalDescription(await connection.createOffer());
    },
    onCandidate: (handler) => {
      connection.onicecandidate = (event) => {
        const line = event.candidate?.candidate ?? "";
        handler(line === "" ? null : line);
      };
    },
    close: () => {
      connection.close();
    },
  };
};

/**
 * Gathers candidates for up to `timeoutMs`, then summarizes them. Rejects only if the browser refuses to
 * start (WebRTC disabled); the caller reports that as "blocked".
 */
export function checkNetwork(
  iceServers: readonly RTCIceServer[],
  timeoutMs: number,
  makeProbe: MakeProbe = browserProbe,
): Promise<NetworkCheck> {
  const probe = makeProbe(iceServers);
  const found: Candidate[] = [];
  return new Promise<NetworkCheck>((resolve, reject) => {
    const finish = (): void => {
      clearTimeout(timer);
      probe.close();
      resolve(summarizeCandidates(found));
    };
    const timer = setTimeout(finish, timeoutMs);
    probe.onCandidate((line) => {
      if (line === null) {
        finish();
        return;
      }
      const candidate = parseCandidate(line);
      if (candidate !== null) {
        found.push(candidate);
      }
    });
    probe.start().catch((error: unknown) => {
      clearTimeout(timer);
      probe.close();
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

/** What a browser that refuses WebRTC looks like to the advice rules. */
export const BLOCKED_NETWORK: NetworkCheck = {
  local: false,
  publicAddress: false,
  relay: false,
  mapping: "unknown",
};
