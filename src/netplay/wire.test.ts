import { describe, expect, it } from "vitest";
import { loadSettings } from "../config";
import { MAIN_FLOOR } from "../house/mainFloor";
import { toWorld } from "../house/toWorld";
import { aiInput, buildNavGrid, createGame, step } from "../sim";
import type { GameEvent, GameState } from "../sim/types";
import { decodeCatInput, decodeGameState } from "./wire";

const STEPS_PER_SECOND = 60;
const DT = 1 / STEPS_PER_SECOND;
const SECONDS_TO_PLAY = 5;
const UNIT_LENGTH = 1;
const LENGTH_TOLERANCE_DIGITS = 9;
const LONG_MOVE = { x: 3, z: 4 };
const SHORT_MOVE = { x: 0.3, z: -0.4 };

function playedState(): GameState {
  const settings = loadSettings().sim;
  const world = toWorld(MAIN_FLOOR);
  const navs = {
    brother: buildNavGrid(world, "brother", settings),
    sister: buildNavGrid(world, "sister", settings),
  };
  let state = createGame(world, settings);
  for (let i = 0; i < SECONDS_TO_PLAY * STEPS_PER_SECOND; i += 1) {
    const inputs = {
      brother: aiInput(state, "brother", world, settings, navs.brother),
      sister: aiInput(state, "sister", world, settings, navs.sister),
    };
    state = step(state, inputs, DT, world, settings);
  }
  return state;
}

/** What the guest actually receives: the state after a trip through JSON. */
function overTheWire(value: unknown): Record<string, unknown> {
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("expected an object");
  }
  return { ...parsed };
}

const ALL_EVENTS: readonly GameEvent[] = [
  { kind: "captured", pointId: "sofa", by: "brother" },
  { kind: "swatted", by: "brother", target: "sister" },
  { kind: "swat_missed", by: "brother" },
  { kind: "stealth", by: "sister" },
  { kind: "treat", treatId: "bowl", by: "sister" },
  { kind: "knocked", knockableId: "vase", by: "brother" },
  { kind: "mischief", mischiefId: "knock_vase", by: "sister" },
  { kind: "round_over", winner: "sister" },
  { kind: "round_over", winner: "tie" },
];

describe("decodeGameState", () => {
  const state = playedState();
  const wire = overTheWire(state);

  it("gives back a played state unchanged after a JSON round trip", () => {
    expect(state.points.length).toBeGreaterThan(0);
    expect(decodeGameState(wire)).toEqual(wire);
  });

  it.each(ALL_EVENTS.map((event) => [event.kind, event] as const))(
    "round-trips a %s event",
    (_kind, event) => {
      const withEvent = overTheWire({ ...state, events: [event] });
      expect(decodeGameState(withEvent)).toEqual(withEvent);
    },
  );

  it("drops keys it does not know", () => {
    const decoded = decodeGameState({ ...wire, extra: "nope" });
    expect(decoded).toEqual(wire);
    expect(decoded).not.toHaveProperty("extra");
  });

  it("rejects a state with a missing cat", () => {
    expect(decodeGameState({ ...wire, cats: { brother: state.cats.brother } })).toBeNull();
  });

  it("rejects a state with a NaN score", () => {
    const sister = { ...state.cats.sister, score: Number.NaN };
    expect(decodeGameState({ ...wire, cats: { ...state.cats, sister } })).toBeNull();
  });

  it("rejects a state with an infinite timer", () => {
    expect(decodeGameState({ ...wire, timeLeft: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it("rejects a state with an unknown phase", () => {
    expect(decodeGameState({ ...wire, phase: "paused" })).toBeNull();
  });

  it("rejects a state with an unknown event kind", () => {
    expect(decodeGameState({ ...wire, events: [{ kind: "teleported", by: "sister" }] })).toBeNull();
  });

  it("rejects a round_over event with an unknown winner", () => {
    const events = [{ kind: "round_over", winner: "dog" }];
    expect(decodeGameState({ ...wire, events })).toBeNull();
  });

  it("rejects a state whose points are not an array", () => {
    expect(decodeGameState({ ...wire, points: { length: 0 } })).toBeNull();
  });

  it("rejects a nap point with a bad CatId as owner", () => {
    const points = state.points.map((point) => ({ ...point, owner: "dog" }));
    expect(decodeGameState({ ...wire, points })).toBeNull();
  });

  it("rejects a cat stored under the other cat's name", () => {
    const cats = { brother: state.cats.sister, sister: state.cats.sister };
    expect(decodeGameState({ ...wire, cats })).toBeNull();
  });

  it("rejects a state missing its timer", () => {
    const rest = Object.fromEntries(Object.entries(wire).filter(([key]) => key !== "timeLeft"));
    expect(decodeGameState(rest)).toBeNull();
  });

  it("rejects things that are not objects at all", () => {
    expect(decodeGameState(null)).toBeNull();
    expect(decodeGameState("state")).toBeNull();
    expect(decodeGameState([])).toBeNull();
  });
});

describe("decodeCatInput", () => {
  it("passes a short move through unchanged", () => {
    const input = { move: SHORT_MOVE, swat: true, stealth: false };
    expect(decodeCatInput(input)).toEqual(input);
  });

  it("clamps a long move to length one", () => {
    const decoded = decodeCatInput({ move: LONG_MOVE, swat: false, stealth: true });
    expect(decoded).not.toBeNull();
    const move = decoded?.move ?? { x: 0, z: 0 };
    expect(Math.hypot(move.x, move.z)).toBeCloseTo(UNIT_LENGTH, LENGTH_TOLERANCE_DIGITS);
    expect(move.x / move.z).toBeCloseTo(LONG_MOVE.x / LONG_MOVE.z, LENGTH_TOLERANCE_DIGITS);
  });

  it("drops keys it does not know", () => {
    const decoded = decodeCatInput({ move: SHORT_MOVE, swat: false, stealth: false, fly: true });
    expect(decoded).not.toHaveProperty("fly");
  });

  it("rejects an input with a NaN move", () => {
    expect(
      decodeCatInput({ move: { x: Number.NaN, z: 0 }, swat: false, stealth: false }),
    ).toBeNull();
  });

  it("rejects an input with a non-boolean swat", () => {
    expect(decodeCatInput({ move: SHORT_MOVE, swat: "yes", stealth: false })).toBeNull();
  });

  it("rejects an input with no move", () => {
    expect(decodeCatInput({ swat: false, stealth: false })).toBeNull();
  });
});
