import { between, fill, pick, shade, speckle, type Sheet } from "./canvasKit";

/**
 * Hard surfaces from the photos: dark Brazilian cherry planks in the living room, beige porcelain tile in
 * the kitchen, speckled grey granite on the counters.
 */

const HARDWOOD = {
  plankPx: 40,
  seamPx: 2,
  minLengthPx: 110,
  maxLengthPx: 360,
  colors: ["#3e1a11", "#4c2116", "#5a291b", "#6a3220", "#7a3c26", "#87452b", "#33150e"],
  seam: "#170905",
  spread: 0.025,
  grainLines: 6,
  grainAlpha: 0.22,
  grainStepPx: 12,
  grainWobblePx: 1.5,
  grainDark: "#1d0b06",
  sheenAlpha: 0.08,
  sheen: "#d89a72",
} as const;

function grain(sheet: Sheet, x: number, y: number, length: number): void {
  const { ctx, rand } = sheet;
  ctx.globalAlpha = HARDWOOD.grainAlpha;
  ctx.strokeStyle = HARDWOOD.grainDark;
  for (let i = 0; i < HARDWOOD.grainLines; i += 1) {
    const gx = x + rand() * (HARDWOOD.plankPx - HARDWOOD.seamPx);
    const phase = rand() * Math.PI;
    ctx.beginPath();
    ctx.moveTo(gx, y);
    for (let step = 0; step <= length; step += HARDWOOD.grainStepPx) {
      ctx.lineTo(gx + Math.sin(phase + step * HARDWOOD.grainWobblePx) * 1, y + step);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = HARDWOOD.sheenAlpha;
  ctx.fillStyle = HARDWOOD.sheen;
  ctx.fillRect(x, y, (HARDWOOD.plankPx - HARDWOOD.seamPx) * between(rand, 0, 1), length);
  ctx.globalAlpha = 1;
}

function plank(sheet: Sheet, x: number, y: number, length: number): void {
  const color = shade(sheet.rand, pick(sheet.rand, HARDWOOD.colors), HARDWOOD.spread);
  for (const top of [y, y - sheet.height]) {
    sheet.ctx.fillStyle = color;
    sheet.ctx.fillRect(x, top, HARDWOOD.plankPx - HARDWOOD.seamPx, length - HARDWOOD.seamPx);
    grain(sheet, x, top, length - HARDWOOD.seamPx);
  }
}

/** Planks run along the canvas's height, which lies along z: away from the camera, as in the photos. */
export function hardwood(sheet: Sheet): void {
  fill(sheet, HARDWOOD.seam);
  for (let x = 0; x < sheet.width; x += HARDWOOD.plankPx) {
    const start = sheet.rand() * sheet.height;
    let y = start;
    while (y < start + sheet.height) {
      const length = between(sheet.rand, HARDWOOD.minLengthPx, HARDWOOD.maxLengthPx);
      plank(sheet, x, y, length);
      y += length;
    }
  }
}

const TILE = {
  across: 2,
  groutPx: 5,
  base: "#cdc3b0",
  spread: 0.025,
  grout: "#968d80",
  mottle: { colors: ["#b8ad99", "#ddd4c3", "#a89c88"], count: 2500, maxRadius: 5, alpha: 0.18 },
} as const;

const HALF = 0.5;

export function tile(sheet: Sheet): void {
  const size = sheet.width / TILE.across;
  for (let col = 0; col < TILE.across; col += 1) {
    for (let row = 0; row < TILE.across; row += 1) {
      sheet.ctx.fillStyle = shade(sheet.rand, TILE.base, TILE.spread);
      sheet.ctx.fillRect(col * size, row * size, size, size);
    }
  }
  speckle(sheet, TILE.mottle);
  sheet.ctx.fillStyle = TILE.grout;
  for (let k = 0; k <= TILE.across; k += 1) {
    const at = k * size - TILE.groutPx * HALF;
    sheet.ctx.fillRect(at, 0, TILE.groutPx, sheet.height);
    sheet.ctx.fillRect(0, at, sheet.width, TILE.groutPx);
  }
}

const CARPET = {
  base: "#d3c8b4",
  pile: { colors: ["#bfb39c", "#e4dbc9", "#c9bda6"], count: 9000, maxRadius: 2, alpha: 0.5 },
} as const;

export function carpet(sheet: Sheet): void {
  fill(sheet, CARPET.base);
  speckle(sheet, CARPET.pile);
}

const CONCRETE = {
  base: "#77787c",
  grit: { colors: ["#5f6064", "#8e8f93", "#6c6a66"], count: 5000, maxRadius: 3, alpha: 0.35 },
} as const;

export function concrete(sheet: Sheet): void {
  fill(sheet, CONCRETE.base);
  speckle(sheet, CONCRETE.grit);
}

const GRANITE = {
  base: "#8e8a84",
  cloud: { colors: ["#a7a39c", "#77736d"], count: 400, maxRadius: 14, alpha: 0.25 },
  flecks: {
    colors: ["#1e1c1b", "#2c2a28", "#ecebe6", "#d9d5cd", "#6b5848"],
    count: 4500,
    maxRadius: 3,
    alpha: 0.85,
  },
} as const;

export function granite(sheet: Sheet): void {
  fill(sheet, GRANITE.base);
  speckle(sheet, GRANITE.cloud);
  speckle(sheet, GRANITE.flecks);
}

const GRASS = {
  base: "#5d8a3a",
  blades: {
    colors: ["#4a7530", "#6f9d45", "#7fae52", "#3f6527", "#8bb85e"],
    count: 9000,
    maxRadius: 2,
    alpha: 0.7,
  },
  clover: { colors: ["#557f35", "#68943f"], count: 120, maxRadius: 9, alpha: 0.35 },
} as const;

/** The lawn outside: mown grass with a few darker clover patches. */
export function grass(sheet: Sheet): void {
  fill(sheet, GRASS.base);
  speckle(sheet, GRASS.clover);
  speckle(sheet, GRASS.blades);
}

const DECK = {
  boardPx: 56,
  gapPx: 6,
  gap: "#2a120c",
  colors: ["#8f3a2a", "#9c4130", "#a54a36", "#88352a", "#963d2d"],
  spread: 0.03,
  grain: { colors: ["#6e2a1e", "#b25a44"], count: 1400, maxRadius: 2, alpha: 0.3 },
  nail: "#3a1d16",
  nailPx: 3,
  nailInsetPx: 10,
} as const;

/** The patio: wide boards stained brick red, running across it with dark gaps between. */
export function deck(sheet: Sheet): void {
  fill(sheet, DECK.gap);
  const { ctx, rand } = sheet;
  for (let y = 0; y < sheet.height; y += DECK.boardPx) {
    ctx.fillStyle = shade(rand, pick(rand, DECK.colors), DECK.spread);
    ctx.fillRect(0, y, sheet.width, DECK.boardPx - DECK.gapPx);
    ctx.fillStyle = DECK.nail;
    const mid = y + (DECK.boardPx - DECK.gapPx) * HALF;
    ctx.fillRect(DECK.nailInsetPx, mid, DECK.nailPx, DECK.nailPx);
    ctx.fillRect(sheet.width - DECK.nailInsetPx, mid, DECK.nailPx, DECK.nailPx);
  }
  speckle(sheet, DECK.grain);
}
