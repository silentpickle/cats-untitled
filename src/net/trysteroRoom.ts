import { joinRoom, selfId, type MessageAction } from "trystero";
import type { JoinRoom, MessageHandler, NetChannel, NetRoom } from "./room";

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

function wrapChannel(name: string, action: Wire): NetChannel {
  return {
    send: (data, to) => {
      void action.send(JSON.stringify(data), to === undefined ? {} : { target: to });
    },
    onMessage: (handler: MessageHandler) => {
      action.onMessage = (text, context) => {
        const parsed = parseWire(text, name);
        if (parsed.ok) {
          handler(parsed.data, context.peerId);
        }
      };
    },
  };
}

function turnConfig(options: TrysteroOptions): { turnConfig?: RTCIceServer[] } {
  const turn = options.turn ?? [];
  return turn.length === 0 ? {} : { turnConfig: [...turn] };
}

/** A `JoinRoom` backed by Trystero's default (Nostr) matchmaking. */
export function trysteroJoiner(options: TrysteroOptions): JoinRoom {
  return (code) => {
    const room = joinRoom({ appId: options.appId, ...turnConfig(options) }, code, {
      onJoinError: (details) => {
        console.warn("net: could not join room", details.error);
      },
    });
    const channels = new Map<string, NetChannel>();
    const net: NetRoom = {
      selfId,
      channel: (name) => {
        const existing = channels.get(name);
        if (existing !== undefined) {
          return existing;
        }
        const made = wrapChannel(name, room.makeAction<string>(name));
        channels.set(name, made);
        return made;
      },
      onPeerJoin: (handler) => {
        room.onPeerJoin = handler;
      },
      onPeerLeave: (handler) => {
        room.onPeerLeave = handler;
      },
      leave: () => {
        void room.leave();
      },
    };
    return net;
  };
}
