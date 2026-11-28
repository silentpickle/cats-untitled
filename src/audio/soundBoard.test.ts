import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MASTER_LEVEL } from "./engine";
import {
  FakeAudioContext,
  type FakeBufferSource,
  FakeCompressor,
  FakeGain,
  type FakeNode,
  type FakeSource,
} from "./fakeAudio";
import { PURR } from "./purr";
import { RECIPES, SOUND_NAMES } from "./recipes";
import { ONE_SHOT_SAMPLES, type SampleBank } from "./samples";
import { buildSchedule } from "./schedule";
import { SoundBoard } from "./soundBoard";

/** A loader with nothing in it: every sound stays synthesized. */
const noSamples = (): Promise<SampleBank> => Promise.resolve({});

/** Lets a loader's promise settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/** Long enough that the same sound is not merged with its previous play. */
const LATER_SECONDS = 1;
/** Oscillators and noise loop in one purr: the noise, the pulse LFO and the breath LFO. */
const PURR_SOURCES = 3;

function fakeContext(): FakeAudioContext {
  const ctx = FakeAudioContext.instances.at(-1);
  if (!ctx) throw new Error("no AudioContext was created");
  return ctx;
}

function masterGain(ctx: FakeAudioContext): FakeGain {
  const master = ctx.created.find(
    (node): node is FakeGain =>
      node instanceof FakeGain && node.outputs.some((out) => out instanceof FakeCompressor),
  );
  if (!master) throw new Error("no master gain");
  return master;
}

function createdSince(ctx: FakeAudioContext, count: number): FakeNode[] {
  return ctx.created.slice(count);
}

function sourcesSince(ctx: FakeAudioContext, count: number): FakeSource[] {
  return ctx.sources().filter((source) => ctx.created.indexOf(source) >= count);
}

describe("without Web Audio", () => {
  it("calls_before_unlock_do_not_throw", () => {
    const board = new SoundBoard(noSamples);
    expect(() => {
      for (const name of SOUND_NAMES) board.play(name);
      board.setPurring(true);
      board.setMuted(true);
      board.setPurring(false);
      board.setMuted(false);
    }).not.toThrow();
  });

  it("unlock_without_audio_context_is_quiet", () => {
    const board = new SoundBoard(noSamples);
    expect(() => {
      board.unlock();
      board.unlock();
      board.play("treat");
    }).not.toThrow();
  });

  it("muted_flag_follows_set_muted", () => {
    const board = new SoundBoard(noSamples);
    expect(board.muted).toBe(false);
    board.setMuted(true);
    expect(board.muted).toBe(true);
  });
});

describe("with a fake AudioContext", () => {
  beforeEach(() => {
    FakeAudioContext.instances.length = 0;
    vi.stubGlobal("AudioContext", FakeAudioContext);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("constructor_creates_no_context", () => {
    new SoundBoard(noSamples).play("treat");
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it("unlock_creates_one_running_context", () => {
    const board = new SoundBoard(noSamples);
    board.unlock();
    board.unlock();
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(fakeContext().state).toBe("running");
  });

  it("every_sound_plays_and_stops", async () => {
    const board = new SoundBoard(noSamples);
    board.unlock();
    await settle();
    const ctx = fakeContext();
    for (const name of SOUND_NAMES) {
      const before = ctx.created.length;
      board.play(name);
      const sources = sourcesSince(ctx, before);
      expect(sources).toHaveLength(buildSchedule(RECIPES[name]).length);
      for (const source of sources) {
        expect(source.stoppedAt).toBeGreaterThan(source.startedAt ?? Infinity);
      }
      ctx.currentTime += LATER_SECONDS;
    }
  });

  it("finished_voices_disconnect_their_nodes", () => {
    const board = new SoundBoard(noSamples);
    board.unlock();
    const ctx = fakeContext();
    const before = ctx.created.length;
    board.play("knock");
    for (const source of sourcesSince(ctx, before)) source.end();
    expect(createdSince(ctx, before).every((node) => node.disconnected)).toBe(true);
  });

  it("rapid_repeats_are_merged", () => {
    const board = new SoundBoard(noSamples);
    board.unlock();
    const ctx = fakeContext();
    const before = ctx.created.length;
    board.play("swat");
    const once = ctx.created.length;
    board.play("swat");
    expect(ctx.created.length).toBe(once);
    expect(once).toBeGreaterThan(before);
  });

  it("muted_board_plays_nothing", () => {
    const board = new SoundBoard(noSamples);
    board.setMuted(true);
    board.unlock();
    const ctx = fakeContext();
    const before = ctx.created.length;
    board.play("round_win");
    expect(ctx.created.length).toBe(before);
    expect(masterGain(ctx).gain.value).toBe(0);
  });

  it("set_muted_ramps_master_gain", () => {
    const board = new SoundBoard(noSamples);
    board.unlock();
    const gain = masterGain(fakeContext()).gain;
    board.setMuted(true);
    expect(gain.events.at(-1)).toMatchObject({ kind: "linear", value: 0 });
    board.setMuted(false);
    expect(gain.events.at(-1)).toMatchObject({ kind: "linear", value: MASTER_LEVEL });
  });

  it("purr_asked_before_unlock_starts_on_unlock", () => {
    const board = new SoundBoard(noSamples);
    board.setPurring(true);
    board.unlock();
    const sources = fakeContext().sources();
    expect(sources).toHaveLength(PURR_SOURCES);
    expect(sources.every((source) => source.startedAt !== null)).toBe(true);
  });

  it("purr_fades_in_from_silence", () => {
    const board = new SoundBoard(noSamples);
    board.unlock();
    const ctx = fakeContext();
    const before = ctx.created.length;
    board.setPurring(true);
    const fades = createdSince(ctx, before).filter((node) => node instanceof FakeGain);
    const fade = fades.find((node) => node.gain.events.some((event) => event.kind === "linear"));
    expect(fade?.gain.events.at(-1)).toMatchObject({ kind: "linear", value: PURR.level });
    expect(fade?.gain.events.find((event) => event.kind === "set")?.value).toBe(0);
  });

  it("purr_stops_then_disconnects", () => {
    const board = new SoundBoard(noSamples);
    board.unlock();
    const ctx = fakeContext();
    const before = ctx.created.length;
    board.setPurring(true);
    board.setPurring(true);
    board.setPurring(false);
    const sources = sourcesSince(ctx, before);
    expect(sources).toHaveLength(PURR_SOURCES);
    expect(sources.every((source) => source.stoppedAt !== null)).toBe(true);
    for (const source of sources) source.end();
    expect(createdSince(ctx, before).every((node) => node.disconnected)).toBe(true);
  });

  it("purr_restart_leaves_one_running", () => {
    const board = new SoundBoard(noSamples);
    board.unlock();
    board.setPurring(true);
    board.setPurring(false);
    board.setPurring(true);
    const running = fakeContext()
      .sources()
      .filter((source) => source.stoppedAt === null);
    expect(running).toHaveLength(PURR_SOURCES);
  });
});

describe("with recorded cat samples", () => {
  /** Stands in for a decoded AudioBuffer; the fake context never reads it. */
  const FAKE_BUFFER = {} as AudioBuffer;
  const ALL_SAMPLES: SampleBank = {
    meow_brother: FAKE_BUFFER,
    meow_sister: FAKE_BUFFER,
    startled: FAKE_BUFFER,
    purr: FAKE_BUFFER,
  };
  const withSamples = (): Promise<SampleBank> => Promise.resolve(ALL_SAMPLES);

  const samplesLoaded = settle;

  beforeEach(() => {
    FakeAudioContext.instances.length = 0;
    vi.stubGlobal("AudioContext", FakeAudioContext);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("meow_plays_one_recorded_voice_at_its_rate", async () => {
    const board = new SoundBoard(withSamples);
    board.unlock();
    await samplesLoaded();
    const ctx = fakeContext();
    const before = ctx.created.length;
    board.play("meow_brother");
    const sources = sourcesSince(ctx, before) as FakeBufferSource[];
    expect(sources).toHaveLength(1);
    expect(sources[0]?.buffer).toBe(FAKE_BUFFER);
    expect(sources[0]?.playbackRate.value).toBe(ONE_SHOT_SAMPLES.meow_brother.rate);
  });

  it("recorded_voice_disconnects_after_ending", async () => {
    const board = new SoundBoard(withSamples);
    board.unlock();
    await samplesLoaded();
    const ctx = fakeContext();
    const before = ctx.created.length;
    board.play("startled");
    for (const source of sourcesSince(ctx, before)) source.end();
    expect(createdSince(ctx, before).every((node) => node.disconnected)).toBe(true);
  });

  it("sounds_without_recordings_stay_synthesized", async () => {
    const board = new SoundBoard(withSamples);
    board.unlock();
    await samplesLoaded();
    const ctx = fakeContext();
    const before = ctx.created.length;
    board.play("treat");
    expect(sourcesSince(ctx, before)).toHaveLength(buildSchedule(RECIPES.treat).length);
  });

  it("meow_before_samples_load_waits_for_recording", async () => {
    const board = new SoundBoard(withSamples);
    board.unlock();
    const ctx = fakeContext();
    const before = ctx.created.length;
    board.play("meow_sister");
    expect(sourcesSince(ctx, before)).toHaveLength(0);
    await samplesLoaded();
    const sources = sourcesSince(ctx, before) as FakeBufferSource[];
    expect(sources).toHaveLength(1);
    expect(sources[0]?.buffer).toBe(FAKE_BUFFER);
  });

  it("meow_during_failed_load_falls_back_to_synth", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const board = new SoundBoard(() => Promise.reject(new TypeError("offline")));
    board.unlock();
    const ctx = fakeContext();
    const before = ctx.created.length;
    board.play("meow_brother");
    await samplesLoaded();
    expect(sourcesSince(ctx, before)).toHaveLength(buildSchedule(RECIPES.meow_brother).length);
    warn.mockRestore();
  });

  it("beeps_during_load_play_at_once", () => {
    const board = new SoundBoard(withSamples);
    board.unlock();
    const ctx = fakeContext();
    const before = ctx.created.length;
    board.play("treat");
    expect(sourcesSince(ctx, before)).toHaveLength(buildSchedule(RECIPES.treat).length);
  });

  it("running_noise_purr_swaps_to_recording", async () => {
    const board = new SoundBoard(withSamples);
    board.setPurring(true);
    board.unlock();
    const ctx = fakeContext();
    const noisePurr = ctx.sources();
    expect(noisePurr).toHaveLength(PURR_SOURCES);
    await samplesLoaded();
    expect(noisePurr.every((source) => source.stoppedAt !== null)).toBe(true);
    const running = ctx.sources().filter((source) => source.stoppedAt === null);
    expect(running).toHaveLength(1);
    expect((running[0] as FakeBufferSource).loop).toBe(true);
  });

  it("failed_load_keeps_synth_and_warns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const board = new SoundBoard(() => Promise.reject(new TypeError("offline")));
    board.unlock();
    await samplesLoaded();
    const ctx = fakeContext();
    const before = ctx.created.length;
    board.play("meow_brother");
    expect(sourcesSince(ctx, before)).toHaveLength(buildSchedule(RECIPES.meow_brother).length);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
