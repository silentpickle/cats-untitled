/**
 * The seam between the rest of `src/net` and whatever actually moves bytes between browsers. Sessions
 * talk to a `NetRoom`; `trysteroRoom.ts` makes one from Trystero and `memoryRoom.ts` makes one in memory
 * for tests. Swap the transport by writing another function that returns a `NetRoom`.
 */

/** Receives a message and the id of the peer that sent it. The data is untrusted: decode before use. */
export type MessageHandler = (data: unknown, from: string) => void;

export interface NetChannel {
  /**
   * Sends JSON-serializable `data` to one peer, or to every peer when `to` is omitted. Fire and forget:
   * delivery is reliable and ordered per channel while the peer stays connected.
   */
  send(data: unknown, to?: string): void;
  /** Replaces the handler for incoming messages on this channel. */
  onMessage(handler: MessageHandler): void;
}

/**
 * Something the transport noticed that the player should hear about.
 * - `unreachable`: a peer was found through matchmaking, but the direct connection to it failed. Usually
 *   a strict network on one side; a TURN relay or another network fixes it.
 * - `refused`: the peer turned the connection away (for example a wrong room password).
 */
export interface NetTrouble {
  readonly kind: "unreachable" | "refused";
  /** The transport's own wording, for reports. Not meant for players. */
  readonly detail: string;
}

/**
 * How many matchmaking relays this page is talking to: `open` answer now, `connecting` are still being
 * reached. `total` 0 means the transport has none (yet).
 */
export interface RelayCount {
  readonly open: number;
  readonly connecting: number;
  readonly total: number;
}

export interface NetRoom {
  /** This browser's id in the room, as other peers see it. */
  readonly selfId: string;
  /** A named message channel. Calling it twice with one name returns the same channel. */
  channel(name: string): NetChannel;
  onPeerJoin(handler: (peerId: string) => void): void;
  onPeerLeave(handler: (peerId: string) => void): void;
  /** Replaces the handler for connection problems the transport reports. */
  onTrouble(handler: (trouble: NetTrouble) => void): void;
  /** Matchmaking relays reachable right now. */
  relays(): RelayCount;
  /** Disconnects from every peer and stops looking for new ones. */
  leave(): void;
}

/** Opens a room by its code. Implementations namespace codes per app, so two games never meet. */
export type JoinRoom = (code: string) => NetRoom;
