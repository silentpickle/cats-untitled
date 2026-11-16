import { describe, expect, it } from "vitest";
import type { CatState } from "../sim/types";
import { abilityStatus } from "./ability";

const PART_SECOND = 1.2;
const LONG_WAIT = 6.5;

function cat(patch: Partial<CatState>): CatState {
  return {
    id: "sister",
    pos: { x: 0, z: 0 },
    facing: 0,
    moving: false,
    napping: false,
    hidden: false,
    stunnedFor: 0,
    fleeFor: 0,
    swatCooldown: 0,
    stealthFor: 0,
    stealthCooldown: 0,
    score: 0,
    ...patch,
  };
}

describe("ability pill", () => {
  it("brother_swat_ready_and_counting_down", () => {
    expect(abilityStatus(cat({ id: "brother" }))).toEqual({ text: "Swat ready", ready: true });
    expect(abilityStatus(cat({ id: "brother", swatCooldown: PART_SECOND }))).toEqual({
      text: "Swat in 2s",
      ready: false,
    });
  });

  it("sister_stealth_ready_active_and_cooling_down", () => {
    expect(abilityStatus(cat({}))).toEqual({ text: "Stealth ready", ready: true });
    expect(abilityStatus(cat({ stealthFor: PART_SECOND, stealthCooldown: LONG_WAIT }))).toEqual({
      text: "Unseen for 2s",
      ready: false,
    });
    expect(abilityStatus(cat({ stealthCooldown: LONG_WAIT }))).toEqual({
      text: "Stealth in 7s",
      ready: false,
    });
  });
});
