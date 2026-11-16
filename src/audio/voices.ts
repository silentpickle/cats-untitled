/** Plays scheduled voices on a real (or fake) AudioContext. The only maths here is `when + at`. */
import type { AutomationPoint, Curve, ScheduledFilter, ScheduledVoice } from "./schedule";

/** What a voice needs to sound: a context, where to send it, and a noise buffer to read from. */
export interface Rig {
  readonly ctx: BaseAudioContext;
  readonly output: AudioNode;
  readonly noise: AudioBuffer;
}

type Ramp = (param: AudioParam, value: number, time: number) => void;

const RAMPS: Readonly<Record<Curve, Ramp>> = {
  set: (param, value, time) => param.setValueAtTime(value, time),
  linear: (param, value, time) => param.linearRampToValueAtTime(value, time),
  exponential: (param, value, time) => param.exponentialRampToValueAtTime(value, time),
};

export function applyPoints(
  param: AudioParam,
  points: readonly AutomationPoint[],
  when: number,
): void {
  for (const point of points) RAMPS[point.curve](param, point.value, when + point.at);
}

/** Ramps a param from wherever it is now, so a change mid-ramp never jumps. */
export function rampTo(param: AudioParam, target: number, now: number, seconds: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(target, now + seconds);
}

/** Connects nodes in order, the last one into `output`. */
export function chain(nodes: readonly AudioNode[], output: AudioNode): void {
  nodes.reduce((from, to) => from.connect(to)).connect(output);
}

function makeFilter(ctx: BaseAudioContext, filter: ScheduledFilter, when: number): AudioNode {
  const node = ctx.createBiquadFilter();
  node.type = filter.kind;
  node.Q.value = filter.q;
  applyPoints(node.frequency, filter.frequency, when);
  return node;
}

function makeSource(rig: Rig, voice: ScheduledVoice, when: number): AudioScheduledSourceNode {
  if (voice.kind === "noise") {
    const source = rig.ctx.createBufferSource();
    source.buffer = rig.noise;
    source.loop = true;
    return source;
  }
  const oscillator = rig.ctx.createOscillator();
  oscillator.type = voice.wave;
  oscillator.detune.value = voice.detune;
  applyPoints(oscillator.frequency, voice.frequency, when);
  return oscillator;
}

function voiceNodes(rig: Rig, voice: ScheduledVoice, when: number): AudioNode[] {
  const amp = rig.ctx.createGain();
  amp.gain.value = 0;
  applyPoints(amp.gain, voice.gain, when);
  if (!voice.filter) return [amp];
  return [makeFilter(rig.ctx, voice.filter, when), amp];
}

/** Starts one voice at `when` and tears its nodes down once it has stopped. */
export function playVoice(rig: Rig, voice: ScheduledVoice, when: number): void {
  const source = makeSource(rig, voice, when);
  const nodes = [source, ...voiceNodes(rig, voice, when)];
  chain(nodes, rig.output);
  source.addEventListener(
    "ended",
    () => {
      for (const node of nodes) node.disconnect();
    },
    { once: true },
  );
  source.start(when + voice.start);
  source.stop(when + voice.stop);
}

export function playSchedule(rig: Rig, voices: readonly ScheduledVoice[], when: number): void {
  for (const voice of voices) playVoice(rig, voice, when);
}
