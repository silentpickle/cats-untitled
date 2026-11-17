// Room-code multiplayer with no server of our own. Game-agnostic: nothing in src/net imports the game.
// See docs/multiplayer.md for how it works and how to reuse it in another project.
export type { JoinRoom, MessageHandler, NetChannel, NetRoom, NetTrouble, RelayCount } from "./room";
export {
  ROOM_CODE_ALPHABET,
  ROOM_QUERY_PARAM,
  makeRoomCode,
  normalizeRoomCode,
  roomFromUrl,
  roomLink,
  type RandomBytes,
} from "./roomCode";
export {
  GuestSession,
  HostSession,
  type Decoder,
  type GuestOptions,
  type HostOptions,
  type SessionStatus,
  type SnapshotInfo,
} from "./session";
export { SendRate } from "./rate";
export {
  DEFAULT_SNAPSHOT_CAPACITY,
  MAX_JITTER_ALLOWANCE_SECONDS,
  MAX_RATE_ADJUST,
  SNAP_THRESHOLD_SECONDS,
  SnapshotBuffer,
  type Bracket,
  type BufferOptions,
} from "./snapshotBuffer";
export {
  DEFAULT_JITTER_FRACTION,
  JITTER_QUERY_PARAM,
  LAG_QUERY_PARAM,
  lagFromUrl,
  withLag,
  type LagOptions,
} from "./lag";
export { MemoryHub, settle } from "./memoryRoom";
export { iceServers, trysteroJoiner, type TrysteroOptions } from "./trysteroRoom";
export {
  advise,
  formatReport,
  networkVerdict,
  parseCandidate,
  summarizeCandidates,
  type Candidate,
  type ConnectionFacts,
  type NatMapping,
  type NetworkCheck,
} from "./diagnostics";
export {
  BLOCKED_NETWORK,
  browserProbe,
  checkNetwork,
  type MakeProbe,
  type ProbeConnection,
} from "./probe";
export { ConnectionWatch, type WatchOptions } from "./watch";
