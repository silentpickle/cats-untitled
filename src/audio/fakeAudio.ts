/**
 * A tiny stand-in for the Web Audio API, for tests in Node. It records what was asked of it and,
 * like browsers, throws on an exponential ramp to zero or below.
 */

export interface ParamEvent {
  readonly kind: "set" | "linear" | "exponential" | "cancel";
  readonly value: number;
  readonly time: number;
}

export class FakeParam {
  value = 0;
  readonly events: ParamEvent[] = [];

  setValueAtTime(value: number, time: number): this {
    this.events.push({ kind: "set", value, time });
    this.value = value;
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): this {
    this.events.push({ kind: "linear", value, time });
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number): this {
    if (value <= 0) throw new RangeError("exponential ramp needs a positive value");
    this.events.push({ kind: "exponential", value, time });
    return this;
  }

  cancelScheduledValues(time: number): this {
    this.events.push({ kind: "cancel", value: this.value, time });
    return this;
  }
}

export class FakeNode {
  readonly kind: string;
  disconnected = false;
  readonly outputs: (FakeNode | FakeParam)[] = [];

  constructor(kind: string) {
    this.kind = kind;
  }

  connect<T extends FakeNode | FakeParam>(target: T): T {
    this.outputs.push(target);
    return target;
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

export class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

export class FakeFilter extends FakeNode {
  type = "lowpass";
  readonly Q = new FakeParam();
  readonly frequency = new FakeParam();
}

export class FakeCompressor extends FakeNode {
  readonly threshold = new FakeParam();
  readonly knee = new FakeParam();
  readonly ratio = new FakeParam();
  readonly attack = new FakeParam();
  readonly release = new FakeParam();
}

export class FakeSource extends FakeNode {
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  private readonly endedListeners: (() => void)[] = [];

  addEventListener(type: string, listener: () => void): void {
    if (type === "ended") this.endedListeners.push(listener);
  }

  start(time: number): void {
    this.startedAt = time;
  }

  stop(time: number): void {
    this.stoppedAt = time;
  }

  /** What the browser does once the source has stopped. */
  end(): void {
    for (const listener of this.endedListeners) listener();
  }
}

export class FakeOscillator extends FakeSource {
  type = "sine";
  readonly frequency = new FakeParam();
  readonly detune = new FakeParam();
}

export class FakeBufferSource extends FakeSource {
  buffer: unknown = null;
  loop = false;
  readonly playbackRate = new FakeParam();
}

const FAKE_SAMPLE_RATE = 8000;

export class FakeAudioContext {
  static readonly instances: FakeAudioContext[] = [];
  currentTime = 0;
  readonly sampleRate = FAKE_SAMPLE_RATE;
  state: "suspended" | "running" = "suspended";
  readonly destination = new FakeNode("destination");
  readonly created: FakeNode[] = [];

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  resume(): Promise<void> {
    this.state = "running";
    return Promise.resolve();
  }

  createGain(): FakeGain {
    return this.track(new FakeGain("gain"));
  }

  createBiquadFilter(): FakeFilter {
    return this.track(new FakeFilter("filter"));
  }

  createDynamicsCompressor(): FakeCompressor {
    return this.track(new FakeCompressor("compressor"));
  }

  createOscillator(): FakeOscillator {
    return this.track(new FakeOscillator("oscillator"));
  }

  createBufferSource(): FakeBufferSource {
    return this.track(new FakeBufferSource("bufferSource"));
  }

  createBuffer(channels: number, length: number, sampleRate: number): object {
    return { channels, length, sampleRate, copyToChannel: () => undefined };
  }

  sources(): FakeSource[] {
    return this.created.filter((node) => node instanceof FakeSource);
  }

  private track<T extends FakeNode>(node: T): T {
    this.created.push(node);
    return node;
  }
}
