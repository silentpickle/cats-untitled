/**
 * Recorded cat voices: two meows, a hiss and a purr loop. They load after the AudioContext exists
 * and replace the synthesized versions once decoded; until then (or if loading fails) the synth
 * recipes play instead, so the game is never silent. Files: `public/assets/sounds/`, credited in
 * `docs/credits.md`.
 */
import type { SoundName } from "./recipes";
import { chain } from "./voices";

export const SAMPLE_FILES = {
  meow_brother: "meow_brother.wav",
  meow_sister: "meow_sister.wav",
  startled: "hiss.wav",
  purr: "purr_loop.wav",
} as const;

export type SampleName = keyof typeof SAMPLE_FILES;
export type SampleBank = Partial<Record<SampleName, AudioBuffer>>;
export type SampleLoader = (ctx: BaseAudioContext) => Promise<SampleBank>;

/** Gain before the master level, and playback speed (below 1 is slower and deeper). */
export interface SamplePlayback {
  readonly level: number;
  readonly rate: number;
}

/**
 * Aragorn is the big cat, so his meow is slowed into a deeper voice. Arwen's is a tiny mew: a short
 * snip of a kitten, low-passed so it never screeches, nudged up a little and quiet.
 */
export const ONE_SHOT_SAMPLES = {
  meow_brother: { level: 0.35, rate: 0.85 },
  meow_sister: { level: 0.2, rate: 1.1 },
  startled: { level: 0.28, rate: 1 },
} as const satisfies Partial<Record<SoundName, SamplePlayback>>;

export type OneShotSample = keyof typeof ONE_SHOT_SAMPLES;

const SOUND_DIR = `${import.meta.env.BASE_URL}assets/sounds/`;

/** A sound file the server would not hand over. */
export class SampleLoadError extends Error {}

export function isOneShotSample(name: SoundName): name is OneShotSample {
  return name in ONE_SHOT_SAMPLES;
}

async function loadOne(ctx: BaseAudioContext, file: string): Promise<AudioBuffer> {
  const response = await fetch(SOUND_DIR + file);
  if (!response.ok) throw new SampleLoadError(`${file}: HTTP ${String(response.status)}`);
  return ctx.decodeAudioData(await response.arrayBuffer());
}

/** Fetches and decodes every cat sample. Rejects if any one of them fails. */
export async function fetchCatSamples(ctx: BaseAudioContext): Promise<SampleBank> {
  const names = Object.keys(SAMPLE_FILES) as SampleName[];
  const buffers = await Promise.all(names.map((name) => loadOne(ctx, SAMPLE_FILES[name])));
  return Object.fromEntries(names.map((name, index) => [name, buffers[index]]));
}

/** Network and decode failures are expected in the wild; anything else is a bug. */
export function isExpectedLoadFailure(error: unknown): boolean {
  return (
    error instanceof SampleLoadError || error instanceof TypeError || error instanceof DOMException
  );
}

/** Plays a buffer once at `when` and disconnects it after it ends. */
export function playSample(
  ctx: BaseAudioContext,
  output: AudioNode,
  buffer: AudioBuffer,
  playback: SamplePlayback,
  when: number,
): void {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = playback.rate;
  const amp = ctx.createGain();
  amp.gain.value = playback.level;
  const nodes = [source, amp];
  chain(nodes, output);
  source.addEventListener(
    "ended",
    () => {
      for (const node of nodes) node.disconnect();
    },
    { once: true },
  );
  source.start(when);
}
