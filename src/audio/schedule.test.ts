import { describe, expect, it } from "vitest";
import { RECIPES, SOUND_NAMES, type Envelope, type Phrase } from "./recipes";
import {
  SILENT,
  buildSchedule,
  contourPoints,
  envelopeLength,
  envelopePoints,
  expandPhrase,
  maxConcurrentPeak,
  scheduleVoice,
  type ScheduledVoice,
} from "./schedule";

const ENVELOPE: Envelope = { attack: 0.01, hold: 0.2, release: 0.3, peak: 0.25 };
const START = 0.5;
const TOLERANCE_DIGITS = 9;
const OVERTONE_RATIO = 2;
const OVERTONE_LEVEL = 0.25;
const NOTE_HZ = 440;
const SECOND_NOTE_HZ = 660;
const PHRASE: Phrase = {
  kind: "phrase",
  start: 0.1,
  wave: "sine",
  attack: 0.01,
  release: 0.2,
  peak: 0.2,
  notes: [
    { at: 0, hz: NOTE_HZ, hold: 0.05 },
    { at: 0.2, hz: SECOND_NOTE_HZ, hold: 0.05 },
  ],
};
const NOTE_COUNT = PHRASE.notes.length;

function allSchedules(): ScheduledVoice[][] {
  return SOUND_NAMES.map((name) => buildSchedule(RECIPES[name]));
}

function allPoints(voice: ScheduledVoice) {
  const frequency = voice.kind === "tone" ? voice.frequency : [];
  return [...voice.gain, ...frequency, ...(voice.filter?.frequency ?? [])];
}

describe("envelope maths", () => {
  const points = envelopePoints(ENVELOPE, START);

  it("envelope_never_exceeds_peak", () => {
    for (const point of points) expect(point.value).toBeLessThanOrEqual(ENVELOPE.peak);
  });

  it("envelope_starts_and_ends_silent", () => {
    expect(points.at(0)).toMatchObject({ at: START, value: SILENT, curve: "set" });
    expect(points.at(-1)).toMatchObject({ value: SILENT, curve: "exponential" });
  });

  it("envelope_runs_forward_in_time", () => {
    const times = points.map((point) => point.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("envelope_ends_after_its_length", () => {
    expect(points.at(-1)?.at).toBeCloseTo(START + envelopeLength(ENVELOPE), TOLERANCE_DIGITS);
  });
});

describe("schedule building", () => {
  it("contour_sets_then_glides", () => {
    const points = contourPoints(PHRASE.notes, START);
    expect(points.map((point) => point.curve)).toEqual(["set", "exponential"]);
    expect(points.at(-1)?.at).toBeCloseTo(START + (PHRASE.notes.at(-1)?.at ?? 0));
  });

  it("phrase_expands_one_tone_per_note", () => {
    const tones = expandPhrase(PHRASE);
    expect(tones).toHaveLength(NOTE_COUNT);
    expect(tones.map((tone) => tone.start)).toEqual(
      PHRASE.notes.map((note) => PHRASE.start + note.at),
    );
  });

  it("overtone_adds_a_quieter_partial", () => {
    const shining = { ...PHRASE, overtone: { ratio: OVERTONE_RATIO, level: OVERTONE_LEVEL } };
    const [main, shine] = expandPhrase(shining);
    expect(shine?.pitch[0]?.hz).toBe(NOTE_HZ * OVERTONE_RATIO);
    expect(shine?.envelope.peak).toBeLessThan(main?.envelope.peak ?? 0);
  });

  it("detune_defaults_to_zero", () => {
    const [tone] = expandPhrase(PHRASE);
    const scheduled = tone ? scheduleVoice(tone) : null;
    expect(scheduled).toMatchObject({ kind: "tone", detune: 0, filter: null });
  });

  it("sources_stop_after_their_envelope", () => {
    for (const voice of allSchedules().flat()) expect(voice.stop).toBeGreaterThan(voice.end);
  });

  it("exponential_ramps_target_positive_values", () => {
    const ramps = allSchedules()
      .flat()
      .flatMap(allPoints)
      .filter((point) => point.curve === "exponential");
    for (const point of ramps) expect(point.value).toBeGreaterThan(0);
  });

  it("concurrent_peak_sums_only_overlaps", () => {
    const tones = expandPhrase({ ...PHRASE, release: 0.01 }).map(scheduleVoice);
    expect(maxConcurrentPeak(tones)).toBeCloseTo(PHRASE.peak);
    const together = expandPhrase({ ...PHRASE, release: 1 }).map(scheduleVoice);
    expect(maxConcurrentPeak(together)).toBeCloseTo(PHRASE.peak * NOTE_COUNT);
  });
});
