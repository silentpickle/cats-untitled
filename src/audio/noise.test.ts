import { describe, expect, it } from "vitest";
import { brownNoise, removeDrift, whiteNoise, type Random } from "./noise";

const LENGTH = 4000;
const SEED = 12345;
const LCG_MULTIPLIER = 1664525;
const LCG_INCREMENT = 1013904223;
const LCG_MODULUS = 4294967296;
const SEAM_TOLERANCE = 1e-6;
const ONE_SAMPLE = 0.5;
const SHORT_BUFFER = Float32Array.of(ONE_SAMPLE);

/** Deterministic random numbers so the tests never flake. */
function seeded(seed: number): Random {
  let state = seed;
  return () => {
    state = (state * LCG_MULTIPLIER + LCG_INCREMENT) % LCG_MODULUS;
    return state / LCG_MODULUS;
  };
}

/** Average jump between neighbouring samples: big for hiss, small for rumble. */
function roughness(samples: Float32Array): number {
  let total = 0;
  for (let index = 1; index < samples.length; index++) {
    total += Math.abs((samples[index] ?? 0) - (samples[index - 1] ?? 0));
  }
  return total / samples.length;
}

function expectInRange(samples: Float32Array): void {
  for (const value of samples) {
    expect(value).toBeGreaterThanOrEqual(-1);
    expect(value).toBeLessThanOrEqual(1);
  }
}

describe("noise", () => {
  const white = whiteNoise(LENGTH, seeded(SEED));
  const brown = brownNoise(LENGTH, seeded(SEED));

  it("white_noise_stays_in_range", () => {
    expect(white).toHaveLength(LENGTH);
    expectInRange(white);
  });

  it("brown_noise_stays_in_range", () => {
    expect(brown).toHaveLength(LENGTH);
    expectInRange(brown);
  });

  it("brown_noise_smoother_than_white", () => {
    expect(roughness(brown)).toBeLessThan(roughness(white));
  });

  it("brown_noise_loops_without_seam", () => {
    expect(Math.abs((brown.at(-1) ?? 1) - (brown.at(0) ?? 0))).toBeLessThan(SEAM_TOLERANCE);
  });

  it("drift_removal_leaves_one_sample_alone", () => {
    expect(removeDrift(SHORT_BUFFER)).toEqual(SHORT_BUFFER);
  });
});
