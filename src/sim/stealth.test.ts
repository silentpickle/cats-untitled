import { describe, expect, it } from "vitest";
import { OPEN_WEST, TEST_SETTINGS, inputs, quietGame, stepTest, withCat } from "./testFixtures";

/** A step length that binary floats hold exactly, so countdowns land on their limits. */
const EXACT_DT = 0.5;
const STEALTH_SECONDS = TEST_SETTINGS.stealth.seconds;
const STEALTH_COOLDOWN = TEST_SETTINGS.stealth.cooldownSeconds;
const MISS_COOLDOWN = TEST_SETTINGS.swat.missCooldownSeconds;
const HIT_COOLDOWN = TEST_SETTINGS.swat.cooldownSeconds;
const STUNNED = 1;

const GO_UNSEEN = inputs({ sister: { stealth: true } });
const SWAT = inputs({ brother: { swat: true } });
const BOTH = inputs({ brother: { swat: true }, sister: { stealth: true } });

function together() {
  return withCat(quietGame(), "sister", { pos: OPEN_WEST });
}

describe("stealth", () => {
  it("sister_goes_unseen_and_cooldown_starts_at_once", () => {
    const next = stepTest(quietGame(), GO_UNSEEN, EXACT_DT);
    expect(next.cats.sister.stealthFor).toBe(STEALTH_SECONDS);
    expect(next.cats.sister.stealthCooldown).toBe(STEALTH_COOLDOWN);
    expect(next.events).toEqual([{ kind: "stealth", by: "sister" }]);
  });

  it("brother_cannot_go_unseen", () => {
    const next = stepTest(quietGame(), inputs({ brother: { stealth: true } }), EXACT_DT);
    expect(next.cats.brother.stealthFor).toBe(0);
    expect(next.events).toEqual([]);
  });

  it("stunned_sister_cannot_go_unseen", () => {
    const stunned = withCat(quietGame(), "sister", { stunnedFor: STUNNED });
    expect(stepTest(stunned, GO_UNSEEN, EXACT_DT).cats.sister.stealthFor).toBe(0);
  });

  it("stealth_ends_after_its_seconds_and_not_before", () => {
    const unseen = stepTest(quietGame(), GO_UNSEEN, EXACT_DT);
    const almost = stepTest(unseen, inputs({}), STEALTH_SECONDS - EXACT_DT);
    expect(almost.cats.sister.stealthFor).toBe(EXACT_DT);
    expect(stepTest(almost, inputs({}), EXACT_DT).cats.sister.stealthFor).toBe(0);
  });

  it("stealth_cannot_be_reused_until_the_cooldown_ends", () => {
    const unseen = stepTest(quietGame(), GO_UNSEEN, EXACT_DT);
    const almost = stepTest(unseen, GO_UNSEEN, STEALTH_COOLDOWN - EXACT_DT);
    expect(almost.events).toEqual([]);
    expect(almost.cats.sister.stealthCooldown).toBe(EXACT_DT);
    const again = stepTest(stepTest(almost, inputs({}), EXACT_DT), GO_UNSEEN, EXACT_DT);
    expect(again.events).toEqual([{ kind: "stealth", by: "sister" }]);
  });

  it("unseen_sister_cannot_be_swatted", () => {
    const next = stepTest(together(), BOTH, EXACT_DT);
    expect(next.events).toEqual([
      { kind: "stealth", by: "sister" },
      { kind: "swat_missed", by: "brother" },
    ]);
    expect(next.cats.sister.stunnedFor).toBe(0);
  });

  it("sister_can_be_swatted_again_once_stealth_runs_out", () => {
    const unseen = stepTest(together(), GO_UNSEEN, EXACT_DT);
    const seen = stepTest(unseen, inputs({}), STEALTH_SECONDS);
    expect(stepTest(seen, SWAT, EXACT_DT).events).toEqual([
      { kind: "swatted", by: "brother", target: "sister" },
    ]);
  });
});

describe("swat cooldowns", () => {
  it("swat_lands_whichever_way_the_brother_faces", () => {
    const facingAway = withCat(together(), "brother", { facing: Math.PI });
    expect(stepTest(facingAway, SWAT, EXACT_DT).events).toEqual([
      { kind: "swatted", by: "brother", target: "sister" },
    ]);
  });

  it("a_miss_costs_the_short_cooldown_and_a_hit_the_long_one", () => {
    expect(stepTest(quietGame(), SWAT, EXACT_DT).cats.brother.swatCooldown).toBe(MISS_COOLDOWN);
    expect(stepTest(together(), SWAT, EXACT_DT).cats.brother.swatCooldown).toBe(HIT_COOLDOWN);
  });

  it("brother_can_swat_again_as_soon_as_the_miss_cooldown_ends", () => {
    const missed = stepTest(quietGame(), SWAT, EXACT_DT);
    const tooSoon = stepTest(missed, SWAT, MISS_COOLDOWN - EXACT_DT);
    expect(tooSoon.events).toEqual([]);
    const ready = stepTest(stepTest(tooSoon, inputs({}), EXACT_DT), SWAT, EXACT_DT);
    expect(ready.events).toEqual([{ kind: "swat_missed", by: "brother" }]);
  });
});
