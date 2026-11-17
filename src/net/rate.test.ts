import { describe, expect, it } from "vitest";
import { SendRate } from "./rate";

const PER_SECOND = 10;
const INTERVAL = 1 / PER_SECOND;
const UNDER_FRACTION = 0.99;
const JUST_UNDER = INTERVAL * UNDER_FRACTION;
const STALL_SECONDS = 5;

describe("SendRate", () => {
  it("is not due before one interval has passed", () => {
    expect(new SendRate(PER_SECOND).due(JUST_UNDER)).toBe(false);
  });

  it("is due exactly at one interval", () => {
    expect(new SendRate(PER_SECOND).due(INTERVAL)).toBe(true);
  });

  it("carries leftover time to the next frame", () => {
    const rate = new SendRate(PER_SECOND);
    expect(rate.due(JUST_UNDER)).toBe(false);
    expect(rate.due(JUST_UNDER)).toBe(true);
    expect(rate.due(JUST_UNDER)).toBe(true);
  });

  it("does not burst after a long stall", () => {
    const rate = new SendRate(PER_SECOND);
    expect(rate.due(STALL_SECONDS)).toBe(true);
    expect(rate.due(0)).toBe(true);
    expect(rate.due(0)).toBe(false);
  });

  it("refuses a rate of zero", () => {
    expect(() => new SendRate(0)).toThrow(/above zero/);
  });
});
