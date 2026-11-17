// Room-code multiplayer with no server of our own. Game-agnostic: nothing in src/net imports the game.
// See docs/multiplayer.md for how it works and how to reuse it in another project.
export type { JoinRoom, MessageHandler, NetChannel, NetRoom } from "./room";
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
} from "./session";
export { SendRate } from "./rate";
export { MemoryHub, settle } from "./memoryRoom";
export { trysteroJoiner, type TrysteroOptions } from "./trysteroRoom";
