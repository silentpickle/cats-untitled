import { getRelaySockets, joinRoom, selfId, type MessageAction } from "trystero";
import { classifyJoinError } from "./diagnostics";
import type { JoinRoom, MessageHandler, NetChannel, NetRoom, NetTrouble, RelayCount } from "./room";

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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- Trystero types it `any`; checked below.
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

/** A `JoinRoom` backed by Trystero's default (Nostr) matchmaking. */
export function trysteroJoiner(options: TrysteroOptions): JoinRoom {
  return (code) => {
    let troubleHandler: (trouble: NetTrouble) => void = ignoreTrouble;
    const room = joinRoom({ appId: options.appId, ...iceConfig(options) }, code, {
      onJoinError: (details) => {
        console.warn("net: could not join room", details.error);
        troubleHandler(classifyJoinError(details.error));
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
