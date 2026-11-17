import { getRelaySockets, joinRoom, type ActionError, type MessageAction } from "trystero";
import type { JoinRoom, MessageHandler, NetChannel, NetRoom, NetTrouble, RelayCount } from "./room";
import { troubleFor } from "./trysteroErrors";

/**
 * The only file that knows about Trystero. Trystero finds the other browser through public Nostr relays
 * (no server of ours), then connects the two directly over WebRTC; after that, game traffic never touches
 * the relays.
 */

export interface TrysteroOptions {
  /** Namespaces room codes, so another app using the same code never lands in our room. */
  readonly appId: string;
  /**
   * Relay servers (TURN) for networks that block direct connections. Empty means direct only, which
   * works on most home networks.
   */
  readonly turn?: readonly RTCIceServer[];
  /**
   * STUN servers, which tell each browser its public address. Omit to use Trystero's built-in list. Pass
   * them when the network check (`checkNetwork`) should test exactly the servers the game uses.
   */
  readonly stun?: readonly RTCIceServer[];
}

/**
 * Messages travel as JSON text so any plain object can be sent without fitting Trystero's JSON type, and
 * so a malformed message is caught in one place.
 */
type Wire = MessageAction<string>;

function parseWire(
  text: string,
  channel: string,
): { readonly ok: boolean; readonly data: unknown } {
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
    console.warn(`net: dropped a malformed message on "${channel}"`, error.message);
    return { ok: false, data: null };
  }
}

function isActionError(error: unknown): error is ActionError {
  return error instanceof Error && "kind" in error;
}

/**
 * A send to a peer that has just left rejects; that is normal at the end of a round, so it is ignored.
 * Anything else is a real fault and is rethrown.
 */
function ignoreDeparted(error: unknown): void {
  if (isActionError(error) && error.kind === "disconnected") {
    return;
  }
  throw error;
}

function wrapChannel(name: string, action: Wire): NetChannel {
  let unsubscribe: () => void = () => undefined;
  return {
    send: (data, to) => {
      action
        .send(JSON.stringify(data), to === undefined ? {} : { target: to })
        .catch(ignoreDeparted);
    },
    onMessage: (handler: MessageHandler) => {
      unsubscribe();
      unsubscribe = action.onMessage((text, context) => {
        const parsed = parseWire(text, name);
        if (parsed.ok) {
          handler(parsed.data, context.peerId);
        }
      });
    },
  };
}

/** Every ICE server the game uses: what `checkNetwork` should test. Empty means Trystero's defaults. */
export function iceServers(options: TrysteroOptions): RTCIceServer[] {
  return [...(options.stun ?? []), ...(options.turn ?? [])];
}

function iceConfig(options: TrysteroOptions): {
  turnConfig?: RTCIceServer[];
  rtcConfig?: RTCConfiguration;
} {
  const turn = options.turn ?? [];
  if (options.stun !== undefined) {
    // Trystero uses rtcConfig.iceServers instead of its defaults and turnConfig, so it needs both.
    return { rtcConfig: { iceServers: iceServers(options) } };
  }
  return turn.length === 0 ? {} : { turnConfig: [...turn] };
}

/** Relay sockets are shared by every room on the page; count the ones open now. */
function openRelays(): RelayCount {
  const sockets: unknown = getRelaySockets();
  if (typeof sockets !== "object" || sockets === null) {
    return { open: 0, connecting: 0, total: 0 };
  }
  const all = Object.values(sockets).filter((socket) => socket instanceof WebSocket);
  const inState = (state: number): number => all.filter((s) => s.readyState === state).length;
  return {
    open: inState(WebSocket.OPEN),
    connecting: inState(WebSocket.CONNECTING),
    total: all.length,
  };
}

function ignoreTrouble(): void {
  // Nobody is listening yet.
}

/** Keeps one listener per event: setting a new one removes the previous one. */
function replacing<T>(subscribe: (handler: T) => () => void): (handler: T) => void {
  let unsubscribe: () => void = () => undefined;
  return (handler) => {
    unsubscribe();
    unsubscribe = subscribe(handler);
  };
}

/** A `JoinRoom` backed by Trystero's default (Nostr) matchmaking. */
export function trysteroJoiner(options: TrysteroOptions): JoinRoom {
  return (code) => {
    let troubleHandler: (trouble: NetTrouble) => void = ignoreTrouble;
    const room = joinRoom({ appId: options.appId, ...iceConfig(options) }, code);
    room.onError((error) => {
      console.warn(`net: room error ${error.code}`, error.message);
      const trouble = troubleFor(error);
      if (trouble !== null) {
        troubleHandler(trouble);
      }
    });
    const channels = new Map<string, NetChannel>();
    const onPeerJoin = replacing<(peerId: string) => void>((handler) =>
      room.onPeerJoin(({ peerId }) => {
        handler(peerId);
      }),
    );
    const onPeerLeave = replacing<(peerId: string) => void>((handler) =>
      room.onPeerLeave(({ peerId }) => {
        handler(peerId);
      }),
    );
    const net: NetRoom = {
      channel: (name) => {
        const existing = channels.get(name);
        if (existing !== undefined) {
          return existing;
        }
        const made = wrapChannel(name, room.makeAction<string>(name));
        channels.set(name, made);
        return made;
      },
      onPeerJoin,
      onPeerLeave,
      onTrouble: (handler) => {
        troubleHandler = handler;
      },
      relays: openRelays,
      leave: () => {
        void room.leave();
      },
    };
    return net;
  };
}
