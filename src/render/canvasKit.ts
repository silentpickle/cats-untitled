import * as THREE from "three";

/** Small drawing helpers shared by the hand-drawn house surfaces. */

export type Rand = () => number;

export interface Sheet {
  readonly ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly rand: Rand;
}

const MULBERRY = {
  step: 0x6d2b79f5,
  shiftA: 15,
  shiftB: 7,
  shiftC: 14,
  range: 4294967296,
} as const;

/** Same seed, same picture: every load of the house looks the same. */
export function seeded(seed: number): Rand {
  let state = seed;
  return () => {
    state = (state + MULBERRY.step) | 0;
    let t = Math.imul(state ^ (state >>> MULBERRY.shiftA), state | 1);
    t ^= t + Math.imul(t ^ (t >>> MULBERRY.shiftB), t | MULBERRY.shiftB);
    return ((t ^ (t >>> MULBERRY.shiftC)) >>> 0) / MULBERRY.range;
  };
}

export function between(rand: Rand, low: number, high: number): number {
  return low + rand() * (high - low);
}

export function pick<T>(rand: Rand, items: readonly T[]): T {
  const item = items[Math.floor(rand() * items.length)];
  if (item === undefined) {
    throw new Error("pick from an empty list");
  }
  return item;
}

/** The colour a little lighter or darker, at random. */
export function shade(rand: Rand, color: string, spread: number): string {
  const c = new THREE.Color(color);
  c.offsetHSL(0, 0, between(rand, -spread, spread));
  return c.getStyle();
}

export function fill(sheet: Sheet, color: string): void {
  sheet.ctx.fillStyle = color;
  sheet.ctx.fillRect(0, 0, sheet.width, sheet.height);
}

const WRAP_OFFSETS = [-1, 0, 1] as const;

/** Draws a shape at a spot and again one tile over each way, so the texture repeats without a seam. */
export function wrapped(sheet: Sheet, x: number, y: number, draw: (x: number, y: number) => void) {
  for (const dx of WRAP_OFFSETS) {
    for (const dy of WRAP_OFFSETS) {
      draw(x + dx * sheet.width, y + dy * sheet.height);
    }
  }
}

export interface Speckles {
  readonly colors: readonly string[];
  readonly count: number;
  readonly maxRadius: number;
  readonly alpha: number;
}

/** Scatters small dots: carpet pile, granite flecks, concrete grit. */
export function speckle(sheet: Sheet, spec: Speckles): void {
  const { ctx, rand } = sheet;
  ctx.globalAlpha = spec.alpha;
  for (let i = 0; i < spec.count; i += 1) {
    ctx.fillStyle = pick(rand, spec.colors);
    const size = between(rand, spec.maxRadius * HALF, spec.maxRadius);
    ctx.fillRect(rand() * sheet.width, rand() * sheet.height, size, size);
  }
  ctx.globalAlpha = 1;
}

const HALF = 0.5;
export const FULL_TURN = Math.PI + Math.PI;

export function disc(sheet: Sheet, x: number, y: number, radius: number, color: string): void {
  sheet.ctx.fillStyle = color;
  sheet.ctx.beginPath();
  sheet.ctx.arc(x, y, radius, 0, FULL_TURN);
  sheet.ctx.fill();
}

export interface Oval {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
  readonly turn: number;
}

export function oval(sheet: Sheet, shape: Oval, color: string): void {
  sheet.ctx.fillStyle = color;
  sheet.ctx.beginPath();
  sheet.ctx.ellipse(shape.x, shape.y, shape.rx, shape.ry, shape.turn, 0, FULL_TURN);
  sheet.ctx.fill();
}

export function newSheet(width: number, height: number, seed: number): Sheet {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("no 2D canvas to draw the house textures on");
  }
  return { ctx, width, height, rand: seeded(seed) };
}
