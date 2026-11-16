/**
 * The purr: looped brown noise, low-passed, pulsed about 25 times a second, and swelled slowly as
 * if breathing. It fades in when it starts and out when it stops, so it never clicks.
 */
import { chain, rampTo } from "./voices";

export const PURR = {
  cutoffHz: 600,
  q: 0.7,
  /** Real purrs pulse at roughly 25 Hz. */
  pulseHz: 25,
  /** Share of the gain the pulse swings: 0.5 swings it between 0 and 1. */
  pulseDepth: 0.5,
  /** One slow in-and-out every two seconds or so. */
  breathHz: 0.45,
  breathDepth: 0.35,
  level: 0.45,
  fadeInSeconds: 0.8,
  fadeOutSeconds: 0.6,
  stopTailSeconds: 0.1,
} as const;

export interface Purr {
  readonly fade: GainNode;
  readonly sources: readonly AudioScheduledSourceNode[];
  readonly nodes: readonly AudioNode[];
}

interface Swell {
  readonly node: GainNode;
  readonly lfo: OscillatorNode;
  readonly depth: GainNode;
}

/** A gain that a sine LFO swings around `1 - depth` by `depth`. */
function swell(ctx: BaseAudioContext, hz: number, depth: number): Swell {
  const node = ctx.createGain();
  node.gain.value = 1 - depth;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = hz;
  const depthNode = ctx.createGain();
  depthNode.gain.value = depth;
  lfo.connect(depthNode).connect(node.gain);
  return { node, lfo, depth: depthNode };
}

function noiseLoop(ctx: BaseAudioContext, noise: AudioBuffer): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.loop = true;
  return source;
}

function lowpass(ctx: BaseAudioContext): BiquadFilterNode {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = PURR.cutoffHz;
  filter.Q.value = PURR.q;
  return filter;
}

export function startPurr(ctx: BaseAudioContext, output: AudioNode, noise: AudioBuffer): Purr {
  const now = ctx.currentTime;
  const source = noiseLoop(ctx, noise);
  const filter = lowpass(ctx);
  const pulse = swell(ctx, PURR.pulseHz, PURR.pulseDepth);
  const breath = swell(ctx, PURR.breathHz, PURR.breathDepth);
  const fade = ctx.createGain();
  fade.gain.value = 0;
  rampTo(fade.gain, PURR.level, now, PURR.fadeInSeconds);
  const path = [source, filter, pulse.node, breath.node, fade];
  chain(path, output);
  const sources = [source, pulse.lfo, breath.lfo];
  for (const node of sources) node.start(now);
  return { fade, sources, nodes: [...path, pulse.lfo, pulse.depth, breath.lfo, breath.depth] };
}

/** Fades the purr out from wherever it is, then stops and disconnects every node. */
export function stopPurr(ctx: BaseAudioContext, purr: Purr): void {
  const now = ctx.currentTime;
  rampTo(purr.fade.gain, 0, now, PURR.fadeOutSeconds);
  const stopAt = now + PURR.fadeOutSeconds + PURR.stopTailSeconds;
  const [first] = purr.sources;
  first?.addEventListener(
    "ended",
    () => {
      for (const node of purr.nodes) node.disconnect();
    },
    { once: true },
  );
  for (const node of purr.sources) node.stop(stopAt);
}
