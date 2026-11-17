import { describe, expect, it } from "vitest";
import { loadSettings } from "../config";
import { MAIN_FLOOR } from "../house/mainFloor";
import { toWorld } from "../house/toWorld";
import { GuestSession, HostSession, MemoryHub, settle } from "../net";
import { LocalMatch, SIM_STEP, type RivalInput } from "../play/localMatch";
import { IDLE_INPUT, createGame } from "../sim";
import type { CatInput, GameEvent } from "../sim/types";
import { GuestMatch, type GuestSmoothing } from "./guestMatch";
import { HostMatch, remoteRival } from "./hostMatch";
import { PROTOCOL_VERSION, decodeWelcome, type CatsGuest, type CatsHost } from "./protocol";
import { decodeCatInput, decodeGameState } from "./wire";

const SNAPSHOTS_PER_SECOND = 20;
const INPUTS_PER_SECOND = 30;
const FRAME = SIM_STEP;
const SECOND_OF_FRAMES = 60;
const EAST: CatInput = { move: { x: 1, z: 0 }, swat: false, stealth: false };
const FALLBACK: CatInput = { move: { x: 0, z: 1 }, swat: false, stealth: false };

const world = toWorld(MAIN_FLOOR);
const sim = loadSettings().sim;
const net = loadSettings().net;

/** The guest plays Aragorn, as in `connectedPair`. */
const SMOOTHING: GuestSmoothing = {
  cat: "brother",
  world,
  settings: sim,
  delaySeconds: net.interpolationDelaySeconds,
  inputsPerSecond: INPUTS_PER_SECOND,
  predict: {
    deadZoneMetres: net.predictionDeadZoneMetres,
    snapMetres: net.predictionSnapMetres,
    blendPerSecond: net.predictionBlendPerSecond,
  },
};

function guestMatch(link: CatsGuest): GuestMatch {
  return new GuestMatch(link, createGame(world, sim), SMOOTHING);
}

interface Pair {
  readonly hub: MemoryHub;
  readonly hostLink: CatsHost;
  readonly guestLink: CatsGuest;
}

async function connectedPair(): Promise<Pair> {
  const hub = new MemoryHub();
  const hostLink: CatsHost = new HostSession({
    room: hub.join("host"),
    protocol: PROTOCOL_VERSION,
    welcome: { cat: "brother" },
    decodeInput: decodeCatInput,
  });
  const guestLink: CatsGuest = new GuestSession({
    room: hub.join("guest"),
    protocol: PROTOCOL_VERSION,
    decodeState: decodeGameState,
    decodeWelcome,
  });
  await settle();
  return { hub, hostLink, guestLink };
}

/** Arwen hosts; Aragorn's input comes from the guest. */
function hostMatch(link: CatsHost, fallback: RivalInput = () => FALLBACK): HostMatch {
  const local = new LocalMatch(world, sim, "sister", remoteRival(link, fallback));
  let frames = 0;
  // A frame-counting clock, so snapshot times follow the simulation rather than the test's real time.
  const clock = (): number => {
    frames += 1;
    return frames * FRAME;
  };
  return new HostMatch(local, link, SNAPSHOTS_PER_SECOND, clock);
}

async function runFrames(
  frames: number,
  host: HostMatch,
  guest: GuestMatch,
  guestInput: CatInput,
): Promise<GameEvent[]> {
  const heard: GameEvent[] = [];
  for (let i = 0; i < frames; i += 1) {
    host.advance(FRAME, () => IDLE_INPUT);
    heard.push(...guest.advance(FRAME, () => guestInput));
    await settle();
  }
  return heard;
}

describe("online match", () => {
  it("moves the guest's cat on the host and shows it on the guest", async () => {
    const { hostLink, guestLink } = await connectedPair();
    const host = hostMatch(hostLink);
    const guest = guestMatch(guestLink);
    const start = host.state.cats.brother.pos.x;
    await runFrames(SECOND_OF_FRAMES, host, guest, EAST);
    expect(host.state.cats.brother.pos.x).toBeGreaterThan(start);
    expect(guest.state.cats.brother.pos.x).toBeGreaterThan(start);
    expect(guest.state.timeLeft).toBeLessThan(sim.round.durationSeconds);
  });

  it("moves the guest's own cat within one input send, before the host replies", async () => {
    const { guestLink } = await connectedPair();
    const guest = guestMatch(guestLink);
    const start = guest.state.cats.brother.pos.x;
    const framesPerSend = Math.ceil(SECOND_OF_FRAMES / INPUTS_PER_SECOND);
    for (let i = 0; i < framesPerSend; i += 1) {
      guest.advance(FRAME, () => EAST);
    }
    expect(guest.state.cats.brother.pos.x).toBeGreaterThan(start);
  });

  it("keeps the guest's cat where the host has it once both stop", async () => {
    const { hostLink, guestLink } = await connectedPair();
    const host = hostMatch(hostLink);
    const guest = guestMatch(guestLink);
    await runFrames(SECOND_OF_FRAMES, host, guest, EAST);
    await runFrames(SECOND_OF_FRAMES, host, guest, IDLE_INPUT);
    const gap = Math.abs(guest.state.cats.brother.pos.x - host.state.cats.brother.pos.x);
    expect(gap).toBeLessThanOrEqual(net.predictionDeadZoneMetres);
  });

  it("delivers every host event to the guest exactly once", async () => {
    const { hostLink, guestLink } = await connectedPair();
    const host = hostMatch(hostLink);
    const guest = guestMatch(guestLink);
    const swat: CatInput = { ...IDLE_INPUT, swat: true };
    const hostEvents: GameEvent[] = [];
    const guestEvents: GameEvent[] = [];
    for (let i = 0; i < SECOND_OF_FRAMES; i += 1) {
      hostEvents.push(...host.advance(FRAME, () => IDLE_INPUT));
      guestEvents.push(...guest.advance(FRAME, () => swat));
      await settle();
    }
    hostEvents.push(...host.advance(1 / SNAPSHOTS_PER_SECOND, () => IDLE_INPUT));
    await settle();
    guestEvents.push(...guest.advance(0, () => swat));
    expect(hostEvents.length).toBeGreaterThan(0);
    expect(guestEvents).toEqual(hostEvents);
  });

  it("keeps the guest's cat still until its first input arrives", () => {
    const hub = new MemoryHub();
    const link: CatsHost = new HostSession({
      room: hub.join("host"),
      protocol: PROTOCOL_VERSION,
      welcome: { cat: "brother" },
      decodeInput: decodeCatInput,
    });
    const rival = remoteRival(link, () => FALLBACK);
    expect(rival(createGame(world, sim))).toEqual(IDLE_INPUT);
  });

  it("hands the guest's cat to the computer when the guest leaves", async () => {
    const { hostLink, guestLink } = await connectedPair();
    guestLink.sendInput(EAST);
    await settle();
    const rival = remoteRival(hostLink, () => FALLBACK);
    expect(rival(createGame(world, sim))).toEqual(EAST);
    guestLink.close();
    await settle();
    expect(hostLink.state).toBe("left");
    expect(rival(createGame(world, sim))).toEqual(FALLBACK);
  });
});
