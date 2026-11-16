import { createEngine, masterTarget, resumeIfSuspended, type Engine } from "./engine";
import { startPurr, stopPurr, type Purr } from "./purr";
import { RECIPES, type SoundName } from "./recipes";
import { buildSchedule } from "./schedule";
import { playSchedule, rampTo } from "./voices";

/** Schedule a hair ahead of now so the first automation point is never in the past. */
const START_LEAD_SECONDS = 0.01;
/** The same sound asked for again within this window is heard once, not stacked. */
const MIN_RETRIGGER_SECONDS = 0.05;
/** Mute and unmute glide rather than cut. */
const MUTE_RAMP_SECONDS = 0.15;

/**
 * The game's sounds, all synthesized. Nothing is created until `unlock()` is called from a user
 * gesture; before that every call only records what was asked for.
 */
export class SoundBoard {
  private engine: Engine | null = null;
  private isMuted = false;
  private wantsPurr = false;
  private purr: Purr | null = null;
  private readonly lastPlayed = new Map<SoundName, number>();

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
  }

  play(name: SoundName): void {
    const engine = this.engine;
    if (!engine || this.isMuted) return;
    const now = engine.ctx.currentTime;
    if (!this.takeTurn(name, now)) return;
    playSchedule(engine.rig, buildSchedule(RECIPES[name]), now + START_LEAD_SECONDS);
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

  /** False when this sound already started a moment ago. */
  private takeTurn(name: SoundName, now: number): boolean {
    const last = this.lastPlayed.get(name);
    if (last !== undefined && now - last < MIN_RETRIGGER_SECONDS) return false;
    this.lastPlayed.set(name, now);
    return true;
  }

  private syncPurr(): void {
    const engine = this.engine;
    if (!engine) return;
    if (this.wantsPurr && !this.purr) {
      this.purr = startPurr(engine.ctx, engine.master, engine.brown);
      return;
    }
    if (this.wantsPurr || !this.purr) return;
    stopPurr(engine.ctx, this.purr);
    this.purr = null;
  }
}
