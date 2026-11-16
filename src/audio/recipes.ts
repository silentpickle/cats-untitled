/**
 * Every game sound as data. A recipe is a list of parts; each part is a single voice (a tone or a
 * filtered noise burst) or a phrase of notes that expands into tones. Times are seconds from the
 * start of the sound (part `start`) or from the start of the part (contour `at`). Peaks are gains
 * before the master level. Pitches are Hz; note names are in comments.
 */

export const SOUND_NAMES = [
  "meow_brother",
  "meow_sister",
  "swat",
  "swat_miss",
  "startled",
  "treat",
  "capture",
  "capture_lost",
  "knock",
  "mischief",
  "round_win",
  "round_lose",
] as const;

export type SoundName = (typeof SOUND_NAMES)[number];

export type Wave = "sine" | "triangle" | "sawtooth" | "square";
export type FilterKind = "lowpass" | "bandpass" | "highpass";

/** A frequency at a moment, `at` seconds after its part starts. */
export interface FrequencyPoint {
  readonly at: number;
  readonly hz: number;
}

/** Linear rise to `peak`, hold, then exponential fall to silence. */
export interface Envelope {
  readonly attack: number;
  readonly hold: number;
  readonly release: number;
  readonly peak: number;
}

export interface FilterSweep {
  readonly kind: FilterKind;
  readonly q: number;
  readonly sweep: readonly FrequencyPoint[];
}

export interface ToneVoice {
  readonly kind: "tone";
  readonly start: number;
  readonly wave: Wave;
  /** Cents; -1200 is an octave below the contour. */
  readonly detune?: number;
  readonly pitch: readonly FrequencyPoint[];
  readonly envelope: Envelope;
  readonly filter?: FilterSweep;
}

export interface NoiseVoice {
  readonly kind: "noise";
  readonly start: number;
  readonly envelope: Envelope;
  readonly filter: FilterSweep;
}

export interface PhraseNote {
  readonly at: number;
  readonly hz: number;
  readonly hold: number;
}

/** A quieter partial above each note, for a bell-like shine. */
export interface Overtone {
  readonly ratio: number;
  readonly level: number;
}

export interface Phrase {
  readonly kind: "phrase";
  readonly start: number;
  readonly wave: Wave;
  readonly attack: number;
  readonly release: number;
  readonly peak: number;
  readonly overtone?: Overtone;
  readonly notes: readonly PhraseNote[];
}

export type Voice = ToneVoice | NoiseVoice;
export type Part = Voice | Phrase;
export type Recipe = readonly Part[];

/** Low, slow, a bit gruff: a sawtooth "mee-ow" with a soft square an octave below. */
const MEOW_BROTHER: Recipe = [
  {
    kind: "tone",
    start: 0,
    wave: "sawtooth",
    pitch: [
      { at: 0, hz: 200 },
      { at: 0.12, hz: 280 },
      { at: 0.4, hz: 260 },
      { at: 0.75, hz: 170 },
    ],
    envelope: { attack: 0.07, hold: 0.4, release: 0.3, peak: 0.26 },
    filter: {
      kind: "lowpass",
      q: 4,
      sweep: [
        { at: 0, hz: 500 },
        { at: 0.15, hz: 1600 },
        { at: 0.45, hz: 1300 },
        { at: 0.77, hz: 450 },
      ],
    },
  },
  {
    kind: "tone",
    start: 0,
    wave: "square",
    detune: -1200,
    pitch: [
      { at: 0, hz: 200 },
      { at: 0.12, hz: 280 },
      { at: 0.4, hz: 260 },
      { at: 0.75, hz: 170 },
    ],
    envelope: { attack: 0.1, hold: 0.35, release: 0.3, peak: 0.07 },
    filter: {
      kind: "lowpass",
      q: 1,
      sweep: [
        { at: 0, hz: 300 },
        { at: 0.3, hz: 600 },
        { at: 0.75, hz: 300 },
      ],
    },
  },
];

/** Higher and shorter, ending on a rise like a question: "mew?" */
const MEOW_SISTER: Recipe = [
  {
    kind: "tone",
    start: 0,
    wave: "sawtooth",
    pitch: [
      { at: 0, hz: 560 },
      { at: 0.07, hz: 760 },
      { at: 0.18, hz: 680 },
      { at: 0.34, hz: 900 },
    ],
    envelope: { attack: 0.03, hold: 0.22, release: 0.13, peak: 0.22 },
    filter: {
      kind: "lowpass",
      q: 3,
      sweep: [
        { at: 0, hz: 900 },
        { at: 0.1, hz: 2800 },
        { at: 0.22, hz: 2200 },
        { at: 0.36, hz: 3000 },
      ],
    },
  },
];

/** A muffled pat of noise over a little falling thump. */
const SWAT: Recipe = [
  {
    kind: "noise",
    start: 0,
    envelope: { attack: 0.004, hold: 0.015, release: 0.11, peak: 0.5 },
    filter: {
      kind: "lowpass",
      q: 0.8,
      sweep: [
        { at: 0, hz: 1400 },
        { at: 0.13, hz: 300 },
      ],
    },
  },
  {
    kind: "tone",
    start: 0,
    wave: "sine",
    pitch: [
      { at: 0, hz: 170 },
      { at: 0.12, hz: 75 },
    ],
    envelope: { attack: 0.004, hold: 0.02, release: 0.1, peak: 0.35 },
  },
];

/** Air through a band that opens and closes: "fwip". */
const SWAT_MISS: Recipe = [
  {
    kind: "noise",
    start: 0,
    envelope: { attack: 0.05, hold: 0.04, release: 0.14, peak: 0.55 },
    filter: {
      kind: "bandpass",
      q: 1.5,
      sweep: [
        { at: 0, hz: 500 },
        { at: 0.08, hz: 2200 },
        { at: 0.23, hz: 900 },
      ],
    },
  },
];

/** "Mrrp!": a quick pitch warble (the rolled r) that flips up at the end. */
const STARTLED: Recipe = [
  {
    kind: "tone",
    start: 0,
    wave: "sawtooth",
    pitch: [
      { at: 0, hz: 430 },
      { at: 0.02, hz: 520 },
      { at: 0.04, hz: 450 },
      { at: 0.06, hz: 540 },
      { at: 0.08, hz: 470 },
      { at: 0.1, hz: 620 },
      { at: 0.16, hz: 980 },
    ],
    envelope: { attack: 0.012, hold: 0.1, release: 0.08, peak: 0.22 },
    filter: {
      kind: "lowpass",
      q: 2,
      sweep: [
        { at: 0, hz: 900 },
        { at: 0.1, hz: 1600 },
        { at: 0.18, hz: 2400 },
      ],
    },
  },
];

/** Ding-ding up a fifth, C6 then G6, with a soft octave shine. */
const TREAT: Recipe = [
  {
    kind: "phrase",
    start: 0,
    wave: "sine",
    attack: 0.005,
    release: 0.4,
    peak: 0.2,
    overtone: { ratio: 2, level: 0.25 },
    notes: [
      { at: 0, hz: 1046.5, hold: 0.03 },
      { at: 0.11, hz: 1567.98, hold: 0.05 },
    ],
  },
];

/** C5 E5 G5 C6, quick and bright. */
const CAPTURE: Recipe = [
  {
    kind: "phrase",
    start: 0,
    wave: "triangle",
    attack: 0.008,
    release: 0.28,
    peak: 0.16,
    overtone: { ratio: 2, level: 0.2 },
    notes: [
      { at: 0, hz: 523.25, hold: 0.04 },
      { at: 0.08, hz: 659.25, hold: 0.04 },
      { at: 0.16, hz: 783.99, hold: 0.04 },
      { at: 0.24, hz: 1046.5, hold: 0.12 },
    ],
  },
];

/** "Uh-oh": D5 down to B4, soft triangle. */
const CAPTURE_LOST: Recipe = [
  {
    kind: "phrase",
    start: 0,
    wave: "triangle",
    attack: 0.01,
    release: 0.25,
    peak: 0.17,
    notes: [
      { at: 0, hz: 587.33, hold: 0.08 },
      { at: 0.17, hz: 493.88, hold: 0.12 },
    ],
  },
];

/** A glassy clink (two inharmonic sines), then four small bursts of clatter. */
const KNOCK: Recipe = [
  {
    kind: "tone",
    start: 0,
    wave: "sine",
    pitch: [{ at: 0, hz: 2350 }],
    envelope: { attack: 0.002, hold: 0.01, release: 0.16, peak: 0.12 },
  },
  {
    kind: "tone",
    start: 0,
    wave: "sine",
    pitch: [{ at: 0, hz: 3720 }],
    envelope: { attack: 0.002, hold: 0.005, release: 0.08, peak: 0.06 },
  },
  {
    kind: "noise",
    start: 0.13,
    envelope: { attack: 0.003, hold: 0.006, release: 0.06, peak: 0.7 },
    filter: { kind: "bandpass", q: 2.5, sweep: [{ at: 0, hz: 1800 }] },
  },
  {
    kind: "noise",
    start: 0.2,
    envelope: { attack: 0.003, hold: 0.006, release: 0.05, peak: 0.6 },
    filter: { kind: "bandpass", q: 2.5, sweep: [{ at: 0, hz: 2600 }] },
  },
  {
    kind: "noise",
    start: 0.26,
    envelope: { attack: 0.003, hold: 0.006, release: 0.05, peak: 0.5 },
    filter: { kind: "bandpass", q: 2.5, sweep: [{ at: 0, hz: 1500 }] },
  },
  {
    kind: "noise",
    start: 0.33,
    envelope: { attack: 0.003, hold: 0.006, release: 0.07, peak: 0.35 },
    filter: { kind: "bandpass", q: 2.5, sweep: [{ at: 0, hz: 2200 }] },
  },
];

/** A quick pentatonic run up (G5 A5 C6 D6 E6) landing on G6. */
const MISCHIEF: Recipe = [
  {
    kind: "phrase",
    start: 0,
    wave: "triangle",
    attack: 0.005,
    release: 0.12,
    peak: 0.13,
    overtone: { ratio: 2, level: 0.2 },
    notes: [
      { at: 0, hz: 783.99, hold: 0.02 },
      { at: 0.05, hz: 880, hold: 0.02 },
      { at: 0.1, hz: 1046.5, hold: 0.02 },
      { at: 0.15, hz: 1174.66, hold: 0.02 },
      { at: 0.2, hz: 1318.51, hold: 0.02 },
      { at: 0.27, hz: 1567.98, hold: 0.08 },
    ],
  },
];

/** "Ta-ta-ta-taa": G4 C5 E5 G5, the last one held over a soft C5+E5. */
const ROUND_WIN: Recipe = [
  {
    kind: "phrase",
    start: 0,
    wave: "triangle",
    attack: 0.01,
    release: 0.35,
    peak: 0.13,
    overtone: { ratio: 2, level: 0.3 },
    notes: [
      { at: 0, hz: 392, hold: 0.06 },
      { at: 0.12, hz: 523.25, hold: 0.06 },
      { at: 0.24, hz: 659.25, hold: 0.06 },
      { at: 0.36, hz: 783.99, hold: 0.3 },
    ],
  },
  {
    kind: "phrase",
    start: 0.36,
    wave: "triangle",
    attack: 0.02,
    release: 0.4,
    peak: 0.09,
    notes: [
      { at: 0, hz: 523.25, hold: 0.3 },
      { at: 0, hz: 659.25, hold: 0.3 },
    ],
  },
];

/** G5 E5 D5 settling on C5 over a warm low C4+E4: a shrug, not a sigh. */
const ROUND_LOSE: Recipe = [
  {
    kind: "phrase",
    start: 0,
    wave: "triangle",
    attack: 0.02,
    release: 0.3,
    peak: 0.13,
    notes: [
      { at: 0, hz: 783.99, hold: 0.1 },
      { at: 0.2, hz: 659.25, hold: 0.1 },
      { at: 0.4, hz: 587.33, hold: 0.1 },
      { at: 0.6, hz: 523.25, hold: 0.35 },
    ],
  },
  {
    kind: "phrase",
    start: 0.6,
    wave: "sine",
    attack: 0.08,
    release: 0.5,
    peak: 0.09,
    notes: [
      { at: 0, hz: 261.63, hold: 0.35 },
      { at: 0, hz: 329.63, hold: 0.35 },
    ],
  },
];

export const RECIPES: Readonly<Record<SoundName, Recipe>> = {
  meow_brother: MEOW_BROTHER,
  meow_sister: MEOW_SISTER,
  swat: SWAT,
  swat_miss: SWAT_MISS,
  startled: STARTLED,
  treat: TREAT,
  capture: CAPTURE,
  capture_lost: CAPTURE_LOST,
  knock: KNOCK,
  mischief: MISCHIEF,
  round_win: ROUND_WIN,
  round_lose: ROUND_LOSE,
};
