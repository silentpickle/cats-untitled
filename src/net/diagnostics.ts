import type { NetTrouble, RelayCount } from "./room";

/**
 * Plain-language troubleshooting for a room that will not connect. Pure functions: the browser parts
 * (gathering ICE candidates, reading relay sockets) live in `probe.ts` and `trysteroRoom.ts`.
 *
 * A connection needs three things, checked in this order:
 * 1. **Matchmaking:** at least one relay reachable, so the two browsers can find each other.
 * 2. **An address the other side can reach:** STUN tells the browser its public address. Without it, only
 *    players on the same network can connect.
 * 3. **A router that keeps that address steady:** a "strict" (symmetric) NAT gives every destination a
 *    different port, so the address STUN saw is useless to the friend. Two strict networks never connect
 *    directly; only a TURN relay helps.
 */

export type CandidateKind = "host" | "srflx" | "prflx" | "relay";

/** One ICE candidate, as far as troubleshooting cares. */
export interface Candidate {
  readonly kind: CandidateKind;
  readonly protocol: "udp" | "tcp";
  readonly address: string;
  readonly port: number;
}

/** Whether the router keeps a steady public port: `changes` is a strict NAT. */
export type NatMapping = "steady" | "changes" | "unknown";

/** What a network check found. Holds no addresses, so it is safe to show and to copy into a report. */
export interface NetworkCheck {
  /** The browser can open network connections at all (WebRTC not blocked). */
  readonly local: boolean;
  /** STUN answered: the browser knows its public address. */
  readonly publicAddress: boolean;
  /** A TURN relay answered. */
  readonly relay: boolean;
  readonly mapping: NatMapping;
}

/** Everything known about a connection attempt, for advice and reports. */
export interface ConnectionFacts {
  readonly relays: RelayCount;
  /** Null until the player runs the network check. */
  readonly network: NetworkCheck | null;
  readonly trouble: NetTrouble | null;
  readonly waitingSeconds: number;
  /** When "still looking" advice starts. */
  readonly slowAfterSeconds: number;
}

const CANDIDATE_PREFIX = "candidate:";
const FIELD_PROTOCOL = 2;
const FIELD_ADDRESS = 4;
const FIELD_PORT = 5;
const FIELD_TYP = 6;
const FIELD_KIND = 7;
const KINDS: readonly CandidateKind[] = ["host", "srflx", "prflx", "relay"];

function candidateKind(text: string | undefined): CandidateKind | null {
  return KINDS.find((kind) => kind === text) ?? null;
}

function candidateProtocol(text: string | undefined): "udp" | "tcp" | null {
  const lower = text?.toLowerCase();
  return lower === "udp" || lower === "tcp" ? lower : null;
}

/** Reads an SDP candidate line (`candidate:… 1 udp … 203.0.113.5 54321 typ srflx …`); null if malformed. */
export function parseCandidate(line: string): Candidate | null {
  const text = line.trim().replace(/^a=/, "");
  if (!text.startsWith(CANDIDATE_PREFIX)) {
    return null;
  }
  const fields = text.split(/\s+/);
  const kind = candidateKind(fields[FIELD_KIND]);
  const protocol = candidateProtocol(fields[FIELD_PROTOCOL]);
  const address = fields[FIELD_ADDRESS] ?? "";
  const port = Number(fields[FIELD_PORT]);
  if (fields[FIELD_TYP] !== "typ" || kind === null || protocol === null || address === "") {
    return null;
  }
  return Number.isInteger(port) ? { kind, protocol, address, port } : null;
}

function udpOfKind(candidates: readonly Candidate[], kind: CandidateKind): Candidate[] {
  return candidates.filter((c) => c.kind === kind && c.protocol === "udp");
}

/**
 * A steady router maps each local socket to one public port, whichever STUN server asks. So more distinct
 * public ports than local sockets means the mapping changes per destination: a strict NAT.
 */
function natMapping(candidates: readonly Candidate[]): NatMapping {
  const reflexive = udpOfKind(candidates, "srflx");
  if (reflexive.length === 0) {
    return "unknown";
  }
  const sockets = Math.max(udpOfKind(candidates, "host").length, 1);
  const ports = new Map<string, Set<number>>();
  for (const c of reflexive) {
    const seen = ports.get(c.address) ?? new Set<number>();
    seen.add(c.port);
    ports.set(c.address, seen);
  }
  const most = Math.max(...[...ports.values()].map((seen) => seen.size));
  return most > sockets ? "changes" : "steady";
}

export function summarizeCandidates(candidates: readonly Candidate[]): NetworkCheck {
  const has = (kind: CandidateKind): boolean => candidates.some((c) => c.kind === kind);
  return {
    local: candidates.length > 0,
    publicAddress: has("srflx") || has("prflx"),
    relay: has("relay"),
    mapping: natMapping(candidates),
  };
}

type AdviceRule = (facts: ConnectionFacts) => string | null;

const noRelays: AdviceRule = ({ relays }) =>
  relays.total > 0 && relays.open === 0 && relays.connecting === 0
    ? "Can't reach any matchmaking server. Check the internet connection, and try turning off a VPN or ad blocker."
    : null;

const unreachable: AdviceRule = ({ trouble }) =>
  trouble?.kind === "unreachable"
    ? "Found your friend, but your two networks wouldn't connect directly. This happens on some work, school and mobile networks. Try again with both of you on home Wi-Fi."
    : null;

const refused: AdviceRule = ({ trouble }) =>
  trouble?.kind === "refused"
    ? "Your friend's game turned the connection away. Both of you reload the page and try a new room."
    : null;

const blocked: AdviceRule = ({ network }) =>
  network !== null && !network.local
    ? "This browser isn't allowed to make game connections. A privacy setting or extension may be blocking WebRTC."
    : null;

const noStun: AdviceRule = ({ network }) =>
  network?.local === true && !network.publicAddress && !network.relay
    ? "This network hides your address from the internet. Online play will only work with someone on the same Wi-Fi."
    : null;

const strictNat: AdviceRule = ({ network }) =>
  network?.mapping === "changes"
    ? "This network's router looks strict. You can likely play with friends on most home networks, but not with another strict network (often mobile data or office Wi-Fi)."
    : null;

const slow: AdviceRule = ({ trouble, waitingSeconds, slowAfterSeconds }) =>
  trouble === null && waitingSeconds >= slowAfterSeconds
    ? "Still looking. Check the code matches, and that your friend's room screen is open and in front (a background tab or locked phone stops answering)."
    : null;

const ADVICE_RULES: readonly AdviceRule[] = [
  noRelays,
  unreachable,
  refused,
  blocked,
  noStun,
  strictNat,
  slow,
];

/** What to tell the player, most important first. Empty when nothing looks wrong. */
export function advise(facts: ConnectionFacts): string[] {
  return ADVICE_RULES.map((rule) => rule(facts)).filter((line) => line !== null);
}

/** A healthy network check, said out loud, so "Check my connection" always answers something. */
export function networkVerdict(check: NetworkCheck): string {
  if (!check.publicAddress) {
    return "Network check: no public address found.";
  }
  return check.mapping === "changes"
    ? "Network check: public address found, but the router looks strict."
    : "Network check: this network looks fine for online play.";
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function networkLines(check: NetworkCheck | null): string[] {
  if (check === null) {
    return ["network check: not run"];
  }
  return [
    `webrtc: ${yesNo(check.local)}`,
    `public address (stun): ${yesNo(check.publicAddress)}`,
    `turn relay: ${yesNo(check.relay)}`,
    `nat mapping: ${check.mapping}`,
  ];
}

/**
 * A short text report to paste into a message when asking for help. Holds no IP addresses or room code.
 * `context` adds lines such as the role and the browser.
 */
export function formatReport(
  facts: ConnectionFacts,
  context: Readonly<Record<string, string>>,
): string {
  const lines = [
    ...Object.entries(context).map(([key, value]) => `${key}: ${value}`),
    `relays open: ${String(facts.relays.open)} of ${String(facts.relays.total)}`,
    `waiting: ${String(Math.round(facts.waitingSeconds))} s`,
    `trouble: ${facts.trouble === null ? "none" : `${facts.trouble.kind} (${facts.trouble.detail})`}`,
    ...networkLines(facts.network),
    ...advise(facts).map((line) => `advice: ${line}`),
  ];
  return lines.join("\n");
}
