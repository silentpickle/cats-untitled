/**
 * Pure maths: turns a recipe into a flat list of voices with absolute automation points. Nothing
 * here touches Web Audio, so all of it is unit-testable.
 */
import type {
  Envelope,
  FilterKind,
  FilterSweep,
  FrequencyPoint,
  NoiseVoice,
  Part,
  Phrase,
  PhraseNote,
  Recipe,
  ToneVoice,
  Voice,
  Wave,
} from "./recipes";

/** Exponential ramps cannot reach zero; this is about -80 dB, inaudible. */
export const SILENT = 0.0001;
/** Sources keep running this long after their envelope ends, so the tail is never cut. */
export const STOP_TAIL_SECONDS = 0.05;
/** An overtone dies away faster than its note, as on a bell. */
const OVERTONE_RELEASE_SHARE = 0.5;

export type Curve = "set" | "linear" | "exponential";

/** One AudioParam event: hold `value` from `at` ("set") or ramp to it by `at`. */
export interface AutomationPoint {
  readonly at: number;
  readonly value: number;
  readonly curve: Curve;
}

export interface ScheduledFilter {
  readonly kind: FilterKind;
  readonly q: number;
  readonly frequency: readonly AutomationPoint[];
}

interface ScheduledTiming {
  readonly start: number;
  /** Envelope back to silence. */
  readonly end: number;
  /** Source stops (end plus a tail). */
  readonly stop: number;
  readonly peak: number;
  readonly gain: readonly AutomationPoint[];
}

export interface ScheduledTone extends ScheduledTiming {
  readonly kind: "tone";
  readonly wave: Wave;
  readonly detune: number;
  readonly frequency: readonly AutomationPoint[];
  readonly filter: ScheduledFilter | null;
}

export interface ScheduledNoise extends ScheduledTiming {
  readonly kind: "noise";
  readonly filter: ScheduledFilter;
}

export type ScheduledVoice = ScheduledTone | ScheduledNoise;

export function envelopeLength(envelope: Envelope): number {
  return envelope.attack + envelope.hold + envelope.release;
}

/** Silent, linear rise to peak, hold, exponential fall back to silent. */
export function envelopePoints(envelope: Envelope, start: number): AutomationPoint[] {
  const peakAt = start + envelope.attack;
  const holdEnd = peakAt + envelope.hold;
  return [
    { at: start, value: SILENT, curve: "set" },
    { at: peakAt, value: envelope.peak, curve: "linear" },
    { at: holdEnd, value: envelope.peak, curve: "linear" },
    { at: holdEnd + envelope.release, value: SILENT, curve: "exponential" },
  ];
}

/** Glides between frequencies exponentially, which sounds even to the ear. */
export function contourPoints(
  contour: readonly FrequencyPoint[],
  start: number,
): AutomationPoint[] {
  return contour.map((point, index) => ({
    at: start + point.at,
    value: point.hz,
    curve: index === 0 ? "set" : "exponential",
  }));
}

function noteTone(phrase: Phrase, note: PhraseNote, hz: number, envelope: Envelope): ToneVoice {
  return {
    kind: "tone",
    start: phrase.start + note.at,
    wave: phrase.wave,
    pitch: [{ at: 0, hz }],
    envelope,
  };
}

function noteVoices(phrase: Phrase, note: PhraseNote): ToneVoice[] {
  const { attack, release, peak, overtone } = phrase;
  const main = noteTone(phrase, note, note.hz, { attack, hold: note.hold, release, peak });
  if (!overtone) return [main];
  const shine = noteTone(phrase, note, note.hz * overtone.ratio, {
    attack,
    hold: note.hold,
    release: release * OVERTONE_RELEASE_SHARE,
    peak: peak * overtone.level,
  });
  return [main, shine];
}

/** One tone per note, plus one per overtone. */
export function expandPhrase(phrase: Phrase): ToneVoice[] {
  return phrase.notes.flatMap((note) => noteVoices(phrase, note));
}

export function partVoices(part: Part): readonly Voice[] {
  return part.kind === "phrase" ? expandPhrase(part) : [part];
}

function scheduleFilter(filter: FilterSweep, start: number): ScheduledFilter {
  return { kind: filter.kind, q: filter.q, frequency: contourPoints(filter.sweep, start) };
}

function timing(start: number, envelope: Envelope): ScheduledTiming {
  const end = start + envelopeLength(envelope);
  return {
    start,
    end,
    stop: end + STOP_TAIL_SECONDS,
    peak: envelope.peak,
    gain: envelopePoints(envelope, start),
  };
}

function scheduleTone(voice: ToneVoice): ScheduledTone {
  return {
    kind: "tone",
    wave: voice.wave,
    detune: voice.detune ?? 0,
    frequency: contourPoints(voice.pitch, voice.start),
    filter: voice.filter ? scheduleFilter(voice.filter, voice.start) : null,
    ...timing(voice.start, voice.envelope),
  };
}

function scheduleNoise(voice: NoiseVoice): ScheduledNoise {
  return {
    kind: "noise",
    filter: scheduleFilter(voice.filter, voice.start),
    ...timing(voice.start, voice.envelope),
  };
}

export function scheduleVoice(voice: Voice): ScheduledVoice {
  return voice.kind === "tone" ? scheduleTone(voice) : scheduleNoise(voice);
}

export function buildSchedule(recipe: Recipe): ScheduledVoice[] {
  return recipe.flatMap(partVoices).map(scheduleVoice);
}

/** Seconds from the first voice starting to the last envelope ending. */
export function scheduleLength(voices: readonly ScheduledVoice[]): number {
  return Math.max(0, ...voices.map((voice) => voice.end));
}

function peakSumAt(voices: readonly ScheduledVoice[], time: number): number {
  return voices
    .filter((voice) => voice.start <= time && time < voice.end)
    .reduce((sum, voice) => sum + voice.peak, 0);
}

/** The worst case of voice peaks sounding at once (a voice's loudest moment is near its start). */
export function maxConcurrentPeak(voices: readonly ScheduledVoice[]): number {
  return Math.max(0, ...voices.map((voice) => peakSumAt(voices, voice.start)));
}
