/** Builds the shared graph once a context exists: master gain into a gentle limiter. */
import { brownNoise, whiteNoise, type Random } from "./noise";
import type { Rig } from "./voices";

/** Overall level. One sound peaks well under full scale; the limiter catches pile-ups. */
export const MASTER_LEVEL = 0.6;
/** Seconds of noise in each looped buffer. */
const NOISE_SECONDS = 2;
const MONO = 1;
const FIRST_CHANNEL = 0;

const LIMITER = {
  thresholdDb: -10,
  kneeDb: 6,
  ratio: 12,
  attackSeconds: 0.003,
  releaseSeconds: 0.25,
} as const;

export interface Engine {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  /** One-shot voices play through this. */
  readonly rig: Rig;
  /** The purr's noise. */
  readonly brown: AudioBuffer;
}

type NoiseMaker = (length: number, random: Random) => Float32Array<ArrayBuffer>;

function makeLimiter(ctx: BaseAudioContext): DynamicsCompressorNode {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = LIMITER.thresholdDb;
  limiter.knee.value = LIMITER.kneeDb;
  limiter.ratio.value = LIMITER.ratio;
  limiter.attack.value = LIMITER.attackSeconds;
  limiter.release.value = LIMITER.releaseSeconds;
  return limiter;
}

function makeNoiseBuffer(ctx: BaseAudioContext, make: NoiseMaker): AudioBuffer {
  const length = Math.round(ctx.sampleRate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(MONO, length, ctx.sampleRate);
  buffer.copyToChannel(make(length, Math.random), FIRST_CHANNEL);
  return buffer;
}

export function masterTarget(muted: boolean): number {
  return muted ? 0 : MASTER_LEVEL;
}

export function createEngine(ctx: AudioContext, muted: boolean): Engine {
  const master = ctx.createGain();
  master.gain.value = masterTarget(muted);
  master.connect(makeLimiter(ctx)).connect(ctx.destination);
  return {
    ctx,
    master,
    rig: { ctx, output: master, noise: makeNoiseBuffer(ctx, whiteNoise) },
    brown: makeNoiseBuffer(ctx, brownNoise),
  };
}

export function resumeIfSuspended(ctx: AudioContext): void {
  if (ctx.state !== "suspended") return;
  void ctx.resume();
}
