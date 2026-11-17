import { SendRate, SnapshotBuffer, type SnapshotInfo } from "../net";
import type { Match } from "../play/localMatch";
import { IDLE_INPUT } from "../sim";
import type {
  CatId,
  CatInput,
  CatState,
  GameEvent,
  GameState,
  Settings,
  WorldDef,
} from "../sim/types";
import { interpolateState } from "./interpolate";
import { OwnCatPredictor, type PredictOptions } from "./predict";
import type { CatsGuest } from "./protocol";

/** What the guest needs to smooth the host's snapshots and predict its own cat. */
export interface GuestSmoothing {
  /** The cat this guest plays. */
  readonly cat: CatId;
  readonly world: WorldDef;
  readonly settings: Settings;
  /** How far behind the newest snapshot the other cat is drawn, before any jitter allowance. */
  readonly delaySeconds: number;
  readonly predict: PredictOptions;
  readonly inputsPerSecond: number;
}

function withCat(state: GameState, cat: CatState): GameState {
  return { ...state, cats: { ...state.cats, [cat.id]: cat } };
}

/**
 * The guest's side of a round: it never runs the rules.
 *
 * - Everything but its own cat is drawn a little in the past, blended between the two host snapshots on
 *   either side, so it moves smoothly instead of hopping from snapshot to snapshot.
 * - Its own cat moves at once with the host's own movement rule and is nudged toward where the host says
 *   it is, so the player's input shows without waiting for a round trip.
 * - Events (sounds, messages) play as soon as their snapshot arrives.
 */
export class GuestMatch implements Match {
  private shown: GameState;
  /** The host's newest word, for everything the guest does not predict. */
  private newest: GameState;
  private pending: GameEvent[] = [];
  private lastSent: CatInput = IDLE_INPUT;
  private started = false;
  private readonly rate: SendRate;
  private readonly buffer: SnapshotBuffer<GameState>;
  private readonly predictor: OwnCatPredictor;

  constructor(
    private readonly link: CatsGuest,
    initial: GameState,
    private readonly smoothing: GuestSmoothing,
  ) {
    this.shown = initial;
    this.newest = initial;
    this.rate = new SendRate(smoothing.inputsPerSecond);
    this.buffer = new SnapshotBuffer({ delaySeconds: smoothing.delaySeconds });
    this.predictor = new OwnCatPredictor(
      smoothing.cat,
      smoothing.world,
      smoothing.settings,
      smoothing.predict,
    );
    // Pushed on arrival, not on the next frame: the buffer reads arrival times to measure jitter.
    link.onSnapshot((state, info) => {
      this.receive(state, info);
    });
  }

  get state(): GameState {
    return this.shown;
  }

  /**
   * Input is only read when it is about to be sent, so a quick tap of the ability button is held until
   * the next send instead of being read and dropped on a frame in between. The prediction moves with the
   * input the host was sent, so the two agree.
   */
  advance(dt: number, mine: () => CatInput): readonly GameEvent[] {
    if (this.rate.due(dt)) {
      this.send(mine());
    }
    const own = this.predictor.advance(
      dt,
      this.lastSent.move,
      this.newest.cats[this.smoothing.cat],
    );
    this.shown = withCat(this.others(), own);
    const events = this.pending;
    this.pending = [];
    return events;
  }

  private send(input: CatInput): void {
    this.lastSent = input;
    const seq = this.link.sendInput(input);
    if (seq > 0) {
      this.predictor.sent(seq);
    }
  }

  private receive(state: GameState, info: SnapshotInfo): void {
    this.buffer.push(info.time, state);
    this.pending.push(...state.events);
    this.newest = state;
    const own = state.cats[this.smoothing.cat];
    if (!this.started) {
      this.started = true;
      this.predictor.reset(own);
      return;
    }
    this.predictor.reconcile(info.ack, own);
  }

  /** The host's view, blended between snapshots; the newest one until there are two. */
  private others(): GameState {
    const bracket = this.buffer.sample();
    if (bracket === null) {
      return this.newest;
    }
    return interpolateState(bracket.from, bracket.to, bracket.t);
  }
}
