import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MASTER_LEVEL } from "./engine";
import {
  FakeAudioContext,
  FakeCompressor,
  FakeGain,
  type FakeNode,
  type FakeSource,
} from "./fakeAudio";
import { PURR } from "./purr";
import { RECIPES, SOUND_NAMES } from "./recipes";
import { buildSchedule } from "./schedule";
import { SoundBoard } from "./soundBoard";

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
    const board = new SoundBoard();
    expect(() => {
      for (const name of SOUND_NAMES) board.play(name);
      board.setPurring(true);
      board.setMuted(true);
      board.setPurring(false);
      board.setMuted(false);
    }).not.toThrow();
  });

  it("unlock_without_audio_context_is_quiet", () => {
    const board = new SoundBoard();
    expect(() => {
      board.unlock();
      board.unlock();
      board.play("treat");
    }).not.toThrow();
  });

  it("muted_flag_follows_set_muted", () => {
    const board = new SoundBoard();
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
    new SoundBoard().play("treat");
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it("unlock_creates_one_running_context", () => {
    const board = new SoundBoard();
    board.unlock();
    board.unlock();
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(fakeContext().state).toBe("running");
  });

  it("every_sound_plays_and_stops", () => {
    const board = new SoundBoard();
    board.unlock();
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
    const board = new SoundBoard();
    board.unlock();
    const ctx = fakeContext();
    const before = ctx.created.length;
    board.play("knock");
    for (const source of sourcesSince(ctx, before)) source.end();
    expect(createdSince(ctx, before).every((node) => node.disconnected)).toBe(true);
  });

  it("rapid_repeats_are_merged", () => {
    const board = new SoundBoard();
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
    const board = new SoundBoard();
    board.setMuted(true);
    board.unlock();
    const ctx = fakeContext();
    const before = ctx.created.length;
    board.play("round_win");
    expect(ctx.created.length).toBe(before);
    expect(masterGain(ctx).gain.value).toBe(0);
  });

  it("set_muted_ramps_master_gain", () => {
    const board = new SoundBoard();
    board.unlock();
    const gain = masterGain(fakeContext()).gain;
    board.setMuted(true);
    expect(gain.events.at(-1)).toMatchObject({ kind: "linear", value: 0 });
    board.setMuted(false);
    expect(gain.events.at(-1)).toMatchObject({ kind: "linear", value: MASTER_LEVEL });
  });

  it("purr_asked_before_unlock_starts_on_unlock", () => {
    const board = new SoundBoard();
    board.setPurring(true);
    board.unlock();
    const sources = fakeContext().sources();
    expect(sources).toHaveLength(PURR_SOURCES);
    expect(sources.every((source) => source.startedAt !== null)).toBe(true);
  });

  it("purr_fades_in_from_silence", () => {
    const board = new SoundBoard();
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
    const board = new SoundBoard();
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
    const board = new SoundBoard();
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
