import type { RoomError, RoomErrorCode } from "trystero";
import type { NetTrouble } from "./room";

/**
 * What each Trystero room error means to the player. Codes not listed (a relay failing, identity or
 * plugin problems) are not shown: the relay count already covers relays, and the rest are not about the
 * friend's connection.
 */
const TROUBLE_KINDS: Partial<Record<RoomErrorCode, NetTrouble["kind"]>> = {
  "peer-connect-failed": "unreachable",
  "decrypt-failed": "refused",
  "handshake-failed": "refused",
  "room-full": "refused",
  banned: "refused",
};

/** The player-facing kind of a Trystero room error, or null when it is not worth showing. */
export function troubleFor(error: Pick<RoomError, "code" | "message">): NetTrouble | null {
  const kind = TROUBLE_KINDS[error.code];
  return kind === undefined ? null : { kind, detail: `${error.code}: ${error.message}` };
}
