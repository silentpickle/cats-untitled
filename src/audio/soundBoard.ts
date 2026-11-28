import { createEngine, masterTarget, resumeIfSuspended, type Engine } from "./engine";
import { startPurr, startSamplePurr, stopPurr, type Purr } from "./purr";
import { RECIPES, type SoundName } from "./recipes";
import {
  fetchCatSamples,
  isExpectedLoadFailure,
  isOneShotSample,
  ONE_SHOT_SAMPLES,
  playSample,
  type SampleBank,
  type SampleLoader,
} from "./samples";
import { buildSchedule } from "./schedule";
import { playSchedule, rampTo } from "./voices";

/** Schedule a hair ahead of now so the first automation point is never in the past. */
const START_LEAD_SECONDS = 0.01;
/** The same sound asked for again within this window is heard once, not stacked. */
const MIN_RETRIGGER_SECONDS = 0.05;
/** Mute and unmute glide rather than cut. */
const MUTE_RAMP_SECONDS = 0.15;

/**
 * The game's sounds: synthesized, except the cat voices, which are recordings once they have loaded.
 * Nothing is created until `unlock()` is called from a user gesture; before that every call only
 * records what was asked for.
 */
export class SoundBoard {
  private engine: Engine | null = null;
  private isMuted = false;
  private wantsPurr = false;
  private purr: Purr | null = null;
  private samples: SampleBank = {};
  /** Settles (never rejects) once the recordings have loaded or failed; null when not loading. */
  private loading: Promise<void> | null = null;
  private readonly lastPlayed = new Map<SoundName, number>();
  private readonly loadSamples: SampleLoader;

  constructor(loadSamples: SampleLoader = fetchCatSamples) {
    this.loadSamples = loadSamples;
  }

  get muted(): boolean {
    return this.isMuted;
  }

  /** Creates or resumes the AudioContext. Call from a user gesture; safe to call repeatedly. */
  unlock(): void {
    if (this.engine) {
      resumeIfSuspended(this.engine.ctx);
      return;
    }
    if (typeof AudioContext === "undefined") return;
    this.engine = createEngine(new AudioContext(), this.isMuted);
    resumeIfSuspended(this.engine.ctx);
    this.syncPurr();
    this.startLoadingSamples(this.engine.ctx);
  }

  play(name: SoundName): void {
    const engine = this.engine;
    if (!engine || this.isMuted) return;
    const now = engine.ctx.currentTime;
    if (!this.takeTurn(name, now)) return;
    if (this.loading && isOneShotSample(name)) {
      this.playOnceLoaded(this.loading, name);
      return;
    }
    this.playNow(engine, name);
  }

  setPurring(on: boolean): void {
    this.wantsPurr = on;
    this.syncPurr();
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    const engine = this.engine;
    if (!engine) return;
    rampTo(engine.master.gain, masterTarget(muted), engine.ctx.currentTime, MUTE_RAMP_SECONDS);
  }

  /** A cat voice asked for mid-load waits for its recording rather than playing the synth stand-in. */
  private playOnceLoaded(loading: Promise<void>, name: SoundName): void {
    void loading.then(() => {
      const engine = this.engine;
      if (!engine || this.isMuted) return;
      this.playNow(engine, name);
    });
  }

  private playNow(engine: Engine, name: SoundName): void {
    const when = engine.ctx.currentTime + START_LEAD_SECONDS;
    if (this.playRecorded(engine, name, when)) return;
    playSchedule(engine.rig, buildSchedule(RECIPES[name]), when);
  }

  /** False when there is no recording of this sound (yet), so the synth should play it. */
  private playRecorded(engine: Engine, name: SoundName, when: number): boolean {
    if (!isOneShotSample(name)) return false;
    const buffer = this.samples[name];
    if (!buffer) return false;
    playSample(engine.ctx, engine.master, buffer, ONE_SHOT_SAMPLES[name], when);
    return true;
  }

  private startLoadingSamples(ctx: BaseAudioContext): void {
    this.loading = this.loadSamples(ctx).then(
      (bank) => {
        this.loading = null;
        this.useSamples(bank);
      },
      (error: unknown) => {
        this.loading = null;
        if (!isExpectedLoadFailure(error)) throw error;
        console.warn("audio: cat samples failed to load; using synthesized voices", error);
      },
    );
  }

  /** Swaps a running noise purr for the recorded one; the two cross-fade. */
  private useSamples(bank: SampleBank): void {
    this.samples = bank;
    const engine = this.engine;
    if (!engine || !this.purr || !bank.purr) return;
    stopPurr(engine.ctx, this.purr);
    this.purr = null;
    this.syncPurr();
  }

  /** False when this sound already started a moment ago. */
  private takeTurn(name: SoundName, now: number): boolean {
    const last = this.lastPlayed.get(name);
    if (last !== undefined && now - last < MIN_RETRIGGER_SECONDS) return false;
    this.lastPlayed.set(name, now);
    return true;
  }

  private startAnyPurr(engine: Engine): Purr {
    const loop = this.samples.purr;
    if (loop) return startSamplePurr(engine.ctx, engine.master, loop);
    return startPurr(engine.ctx, engine.master, engine.brown);
  }

  private syncPurr(): void {
    const engine = this.engine;
    if (!engine) return;
    if (this.wantsPurr && !this.purr) {
      this.purr = this.startAnyPurr(engine);
      return;
    }
    if (this.wantsPurr || !this.purr) return;
    stopPurr(engine.ctx, this.purr);
    this.purr = null;
  }
}
