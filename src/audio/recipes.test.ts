import { describe, expect, it } from "vitest";
import { RECIPES, SOUND_NAMES, type Part, type SoundName } from "./recipes";
import {
  buildSchedule,
  maxConcurrentPeak,
  scheduleLength,
  type ScheduledTone,
  type ScheduledVoice,
} from "./schedule";

/** Every sound is short; the longest is the end-of-round phrase. */
const MAX_SOUND_SECONDS = 1.6;
/** Noise is quietened a lot by its filter, so a noise voice may set a higher peak than a tone. */
const MAX_VOICE_PEAK = 0.7;
const MAX_TONE_PEAK = 0.35;
/** Peaks sounding together stay under full scale before the master level. */
const MAX_CONCURRENT_PEAK = 1;
/** Anything faster than this clicks. */
const MIN_ATTACK_SECONDS = 0.002;
/** Gentle range: nothing rumbles below this or shrills above that. */
const LOWEST_TONE_HZ = 40;
const HIGHEST_TONE_HZ = 4000;
const HIGHEST_FILTER_HZ = 8000;
const CENTS_PER_OCTAVE = 1200;
const OCTAVE_RATIO = 2;
const SECOND_TO_LAST = -2;

function scheduleOf(name: SoundName): ScheduledVoice[] {
  return buildSchedule(RECIPES[name]);
}

function tones(name: SoundName): ScheduledTone[] {
  return scheduleOf(name).filter((voice) => voice.kind === "tone");
}

/** Every frequency a tone passes through, with its detune applied. */
function toneHz(tone: ScheduledTone): number[] {
  const shift = OCTAVE_RATIO ** (tone.detune / CENTS_PER_OCTAVE);
  return tone.frequency.map((point) => point.value * shift);
}

function lowestHz(name: SoundName): number {
  return Math.min(...tones(name).flatMap(toneHz));
}

function attackSeconds(voice: ScheduledVoice): number {
  const [silent, peak] = voice.gain;
  return (peak?.at ?? 0) - (silent?.at ?? 0);
}

function phraseNotesHz(part: Part | undefined): number[] {
  if (part?.kind !== "phrase") return [];
  return part.notes.map((note) => note.hz);
}

describe.each(SOUND_NAMES)("%s", (name) => {
  const voices = scheduleOf(name);

  it("every_sound_has_a_recipe", () => {
    expect(voices.length).toBeGreaterThan(0);
  });

  it("sound_stays_short", () => {
    expect(scheduleLength(voices)).toBeLessThanOrEqual(MAX_SOUND_SECONDS);
  });

  it("sound_starts_at_once", () => {
    expect(Math.min(...voices.map((voice) => voice.start))).toBe(0);
  });

  it("voice_peaks_stay_modest", () => {
    for (const voice of voices) expect(voice.peak).toBeLessThanOrEqual(MAX_VOICE_PEAK);
    for (const tone of tones(name)) expect(tone.peak).toBeLessThanOrEqual(MAX_TONE_PEAK);
  });

  it("overlapping_voices_leave_headroom", () => {
    expect(maxConcurrentPeak(voices)).toBeLessThanOrEqual(MAX_CONCURRENT_PEAK);
  });

  it("no_voice_attacks_instantly", () => {
    for (const voice of voices)
      expect(attackSeconds(voice)).toBeGreaterThanOrEqual(MIN_ATTACK_SECONDS);
  });

  it("tones_stay_in_a_gentle_range", () => {
    for (const hz of tones(name).flatMap(toneHz)) {
      expect(hz).toBeGreaterThanOrEqual(LOWEST_TONE_HZ);
      expect(hz).toBeLessThanOrEqual(HIGHEST_TONE_HZ);
    }
  });

  it("filters_stay_below_nyquist", () => {
    const sweeps = voices.flatMap((voice) => voice.filter?.frequency ?? []);
    for (const point of sweeps) expect(point.value).toBeLessThanOrEqual(HIGHEST_FILTER_HZ);
  });
});

describe("character", () => {
  it("records_cover_exactly_the_sound_names", () => {
    expect(Object.keys(RECIPES).sort()).toEqual([...SOUND_NAMES].sort());
  });

  it("brother_meow_lower_and_longer", () => {
    expect(lowestHz("meow_brother")).toBeLessThan(lowestHz("meow_sister"));
    expect(scheduleLength(scheduleOf("meow_brother"))).toBeGreaterThan(
      scheduleLength(scheduleOf("meow_sister")),
    );
  });

  it("sister_meow_ends_rising", () => {
    const contour = tones("meow_sister")[0]?.frequency.map((point) => point.value) ?? [];
    expect(contour.at(-1)).toBeGreaterThan(contour.at(SECOND_TO_LAST) ?? Infinity);
  });

  it("capture_rises_and_lost_falls", () => {
    const capture = phraseNotesHz(RECIPES.capture[0]);
    const lost = phraseNotesHz(RECIPES.capture_lost[0]);
    expect(capture).toEqual([...capture].sort((a, b) => a - b));
    expect(lost).toEqual([...lost].sort((a, b) => b - a));
  });

  it("round_lose_ends_lower_than_it_starts", () => {
    const melody = phraseNotesHz(RECIPES.round_lose[0]);
    expect(melody.at(-1)).toBeLessThan(melody.at(0) ?? 0);
  });
});
