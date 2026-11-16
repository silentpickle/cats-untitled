import type { CatId, CatInput, CatState, GameEvent, GameState } from "./types";
import { ZERO } from "./geometry";

export const IDLE_INPUT: CatInput = { move: ZERO, swat: false, stealth: false };

export function otherCat(id: CatId): CatId {
  return id === "brother" ? "sister" : "brother";
}

export function mapCats(state: GameState, fn: (cat: CatState) => CatState): GameState {
  return { ...state, cats: { brother: fn(state.cats.brother), sister: fn(state.cats.sister) } };
}

export function withCat(state: GameState, cat: CatState): GameState {
  return { ...state, cats: { ...state.cats, [cat.id]: cat } };
}

export function withEvents(state: GameState, events: readonly GameEvent[]): GameState {
  if (events.length === 0) return state;
  return { ...state, events: [...state.events, ...events] };
}

export function addScore(cat: CatState, amount: number): CatState {
  return amount === 0 ? cat : { ...cat, score: cat.score + amount };
}

/** A timer after `dt` seconds, never below zero. */
export function countDown(value: number, dt: number): number {
  return Math.max(0, value - dt);
}
