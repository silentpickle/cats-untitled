/** Pure noise generators for the looped buffers the voices and the purr play from. */

export type Random = () => number;

/** Maps a 0..1 random number onto -1..1. */
const BIPOLAR_SPAN = 2;
/** How far each brown-noise sample may wander; smaller is deeper and smoother. */
const BROWN_STEP = 0.06;
/** Brings leaky-integrated noise back up to a usable level. */
const BROWN_GAIN = 3;

function whiteSample(random: Random): number {
  return random() * BIPOLAR_SPAN - 1;
}

export function clampAll(samples: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
  return samples.map((value) => Math.min(1, Math.max(-1, value)));
}

/**
 * Tilts the buffer so its last sample equals its first. A looped buffer then has no step at the
 * seam, so it never ticks once per loop.
 */
export function removeDrift(samples: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
  const lastIndex = samples.length - 1;
  if (lastIndex < 1) return samples;
  const drift = (samples[lastIndex] ?? 0) - (samples[0] ?? 0);
  return samples.map((value, index) => value - (drift * index) / lastIndex);
}

export function whiteNoise(length: number, random: Random): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(length);
  for (let index = 0; index < length; index++) samples[index] = whiteSample(random);
  return samples;
}

/** Leaky-integrated white noise: most energy is low, which suits a purr. Seamless when looped. */
export function brownNoise(length: number, random: Random): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(length);
  let level = 0;
  for (let index = 0; index < length; index++) {
    level = (level + BROWN_STEP * whiteSample(random)) / (1 + BROWN_STEP);
    samples[index] = level * BROWN_GAIN;
  }
  return clampAll(removeDrift(samples));
}
