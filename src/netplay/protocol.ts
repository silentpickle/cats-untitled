// What this game puts on the wire, on top of src/net's generic session.
import type { GuestSession, HostSession } from "../net";
import { CAT_IDS, type CatId, type CatInput, type GameState } from "../sim/types";

/**
 * Bump whenever GameState, CatInput or Welcome change shape, so a stale page and a fresh one refuse
 * each other with a clear message instead of misreading each other's snapshots.
 */
export const PROTOCOL_VERSION = 1;

/** Told to the guest on joining: which cat it plays. */
export interface Welcome {
  readonly cat: CatId;
}

export function decodeWelcome(raw: unknown): Welcome | null {
  if (typeof raw !== "object" || raw === null || !("cat" in raw)) {
    return null;
  }
  const cat = CAT_IDS.find((id) => id === raw.cat);
  return cat === undefined ? null : { cat };
}

export type CatsHost = HostSession<GameState, CatInput>;
export type CatsGuest = GuestSession<GameState, CatInput, Welcome>;
