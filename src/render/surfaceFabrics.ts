import {
  FULL_TURN,
  between,
  disc,
  fill,
  oval,
  pick,
  speckle,
  wrapped,
  type Sheet,
} from "./canvasKit";

/** Cloth from the photos: the faded rug, the plaid table cover, the curtains, the throws on the couch. */

const HALF = 0.5;

const RUG = {
  base: "#6a7fa1",
  border: { colors: ["#2f3d63", "#b07a8f", "#d9d0bf"], widthPx: 14 },
  blotches: { colors: ["#2f3d63", "#8fa3c2", "#b07a8f", "#4d6b8c"], count: 70, maxRadius: 60 },
  blotchAlpha: 0.35,
  wear: { colors: ["#ddd5c4", "#c9a1b0", "#a7b6cf"], count: 6000, maxRadius: 4, alpha: 0.35 },
} as const;

function rugBorder(sheet: Sheet): void {
  const { ctx } = sheet;
  RUG.border.colors.forEach((color, band) => {
    const inset = band * RUG.border.widthPx + RUG.border.widthPx * HALF;
    ctx.strokeStyle = color;
    ctx.lineWidth = RUG.border.widthPx;
    ctx.strokeRect(inset, inset, sheet.width - inset - inset, sheet.height - inset - inset);
  });
}

/** The faded, distressed blue rug under the coffee table. */
export function vintageRug(sheet: Sheet): void {
  fill(sheet, RUG.base);
  sheet.ctx.globalAlpha = RUG.blotchAlpha;
  for (let i = 0; i < RUG.blotches.count; i += 1) {
    const shape = {
      x: sheet.rand() * sheet.width,
      y: sheet.rand() * sheet.height,
      rx: between(sheet.rand, RUG.blotches.maxRadius * HALF, RUG.blotches.maxRadius),
      ry: between(sheet.rand, RUG.blotches.maxRadius * HALF * HALF, RUG.blotches.maxRadius * HALF),
      turn: sheet.rand() * Math.PI,
    };
    oval(sheet, shape, pick(sheet.rand, RUG.blotches.colors));
  }
  sheet.ctx.globalAlpha = 1;
  rugBorder(sheet);
  speckle(sheet, RUG.wear);
}

interface Stripe {
  readonly color: string;
  readonly at: number;
  readonly width: number;
}

const PLAID = {
  base: "#efe5cc",
  alpha: 0.5,
  stripes: [
    { color: "#b5363a", at: 0, width: 26 },
    { color: "#2f4f80", at: 40, width: 18 },
    { color: "#6f9e86", at: 70, width: 22 },
    { color: "#e1b94f", at: 100, width: 8 },
    { color: "#b5363a", at: 122, width: 6 },
    { color: "#2f4f80", at: 150, width: 30 },
    { color: "#6f9e86", at: 196, width: 10 },
    { color: "#e1b94f", at: 220, width: 16 },
  ] satisfies Stripe[],
} as const;

/** The madras plaid cover on the bench by the fireplace. */
export function plaid(sheet: Sheet): void {
  fill(sheet, PLAID.base);
  sheet.ctx.globalAlpha = PLAID.alpha;
  for (const stripe of PLAID.stripes) {
    sheet.ctx.fillStyle = stripe.color;
    sheet.ctx.fillRect(stripe.at, 0, stripe.width, sheet.height);
    sheet.ctx.fillRect(0, stripe.at, sheet.width, stripe.width);
  }
  sheet.ctx.globalAlpha = 1;
}

interface Flower {
  readonly petals: readonly string[];
  readonly middle: string;
  readonly leaf: string;
  readonly radius: number;
}

const PETALS = 5;
const PETAL_REACH = 0.9;
const PETAL_SIZE = 0.6;
const MIDDLE_SIZE = 0.4;
const LEAF = { reach: 1.5, long: 0.9, wide: 0.35 } as const;

function flower(sheet: Sheet, x: number, y: number, look: Flower): void {
  const color = pick(sheet.rand, look.petals);
  const spin = sheet.rand() * Math.PI;
  const leafShape = {
    x: x + look.radius * LEAF.reach,
    y: y + look.radius * HALF,
    rx: look.radius * LEAF.long,
    ry: look.radius * LEAF.wide,
    turn: spin,
  };
  oval(sheet, leafShape, look.leaf);
  for (let p = 0; p < PETALS; p += 1) {
    const angle = spin + (p / PETALS) * FULL_TURN;
    const px = x + Math.cos(angle) * look.radius * PETAL_REACH;
    const py = y + Math.sin(angle) * look.radius * PETAL_REACH;
    disc(sheet, px, py, look.radius * PETAL_SIZE, color);
  }
  disc(sheet, x, y, look.radius * MIDDLE_SIZE, look.middle);
}

function scatterFlowers(sheet: Sheet, count: number, look: Flower): void {
  for (let i = 0; i < count; i += 1) {
    const x = sheet.rand() * sheet.width;
    const y = sheet.rand() * sheet.height;
    wrapped(sheet, x, y, (wx, wy) => {
      flower(sheet, wx, wy, look);
    });
  }
}

const CURTAIN = {
  base: "#f3efe5",
  count: 9,
  look: {
    petals: ["#2f5597", "#5d82c0", "#203f78"],
    middle: "#e9e2cf",
    leaf: "#7f9cc9",
    radius: 16,
  },
} as const;

/** White curtains with big blue flowers, either side of the living-room windows. */
export function floralCurtain(sheet: Sheet): void {
  fill(sheet, CURTAIN.base);
  scatterFlowers(sheet, CURTAIN.count, CURTAIN.look);
}

const RUNNER = {
  base: "#ece3cd",
  count: 14,
  look: {
    petals: ["#c8844a", "#a9643a", "#d6b35a"],
    middle: "#5c4632",
    leaf: "#7d8f5a",
    radius: 10,
  },
  hem: "#b49a76",
  hemPx: 6,
} as const;

/** The flowered runner on the coffee table. */
export function runner(sheet: Sheet): void {
  fill(sheet, RUNNER.base);
  scatterFlowers(sheet, RUNNER.count, RUNNER.look);
  sheet.ctx.fillStyle = RUNNER.hem;
  sheet.ctx.fillRect(0, 0, sheet.width, RUNNER.hemPx);
  sheet.ctx.fillRect(0, sheet.height - RUNNER.hemPx, sheet.width, RUNNER.hemPx);
}

const QUILT = {
  squares: 4,
  colors: ["#25305a", "#334476", "#1d2647", "#3d4f85", "#5a3a5e"],
  stitch: "#8c93b5",
  zigzag: ["#a2324a", "#e8dcc4"],
  zigzagPx: 16,
} as const;

function zigzagEdge(sheet: Sheet): void {
  const { ctx } = sheet;
  const bottom = sheet.height;
  let i = 0;
  for (let x = 0; x < sheet.width; x += QUILT.zigzagPx) {
    ctx.fillStyle = QUILT.zigzag[i % QUILT.zigzag.length] ?? QUILT.stitch;
    ctx.beginPath();
    ctx.moveTo(x, bottom);
    ctx.lineTo(x + QUILT.zigzagPx * HALF, bottom - QUILT.zigzagPx);
    ctx.lineTo(x + QUILT.zigzagPx, bottom);
    ctx.fill();
    i += 1;
  }
}

/** The navy patchwork quilt with the red and cream sawtooth edge, over the back of the couch. */
export function quilt(sheet: Sheet): void {
  const size = sheet.width / QUILT.squares;
  for (let col = 0; col < QUILT.squares; col += 1) {
    for (let row = 0; row < QUILT.squares; row += 1) {
      sheet.ctx.fillStyle = pick(sheet.rand, QUILT.colors);
      sheet.ctx.fillRect(col * size, row * size, size, size);
    }
  }
  sheet.ctx.strokeStyle = QUILT.stitch;
  sheet.ctx.setLineDash([QUILT.zigzagPx * HALF * HALF, QUILT.zigzagPx * HALF * HALF]);
  for (let k = 0; k < QUILT.squares; k += 1) {
    sheet.ctx.strokeRect(k * size, 0, size, sheet.height);
  }
  sheet.ctx.setLineDash([]);
  zigzagEdge(sheet);
}

const PEACOCK = {
  base: "#262a5a",
  swirls: { colors: ["#c99a3a", "#5a4a8a", "#2f7f8f", "#e2d6b0", "#13153a"], count: 60 },
  minRadius: 8,
  maxRadius: 30,
  ring: 0.55,
} as const;

/** The navy, purple and gold patterned throw over the long couch. */
export function peacockThrow(sheet: Sheet): void {
  fill(sheet, PEACOCK.base);
  for (let i = 0; i < PEACOCK.swirls.count; i += 1) {
    const x = sheet.rand() * sheet.width;
    const y = sheet.rand() * sheet.height;
    const radius = between(sheet.rand, PEACOCK.minRadius, PEACOCK.maxRadius);
    const outer = pick(sheet.rand, PEACOCK.swirls.colors);
    const inner = pick(sheet.rand, PEACOCK.swirls.colors);
    const turn = sheet.rand() * Math.PI;
    wrapped(sheet, x, y, (wx, wy) => {
      oval(sheet, { x: wx, y: wy, rx: radius, ry: radius * HALF, turn }, outer);
      oval(
        sheet,
        { x: wx, y: wy, rx: radius * PEACOCK.ring, ry: radius * HALF * PEACOCK.ring, turn },
        inner,
      );
    });
  }
}

const ORANGE_THROW = {
  base: "#f05a1a",
  ink: "#151110",
  bands: [
    { x: 0.08, y: 0.1, w: 0.84, h: 0.08 },
    { x: 0.08, y: 0.1, w: 0.08, h: 0.8 },
    { x: 0.84, y: 0.1, w: 0.08, h: 0.8 },
    { x: 0.08, y: 0.82, w: 0.84, h: 0.08 },
    { x: 0.28, y: 0.3, w: 0.1, h: 0.4 },
    { x: 0.45, y: 0.3, w: 0.25, h: 0.1 },
    { x: 0.6, y: 0.3, w: 0.1, h: 0.4 },
    { x: 0.45, y: 0.6, w: 0.25, h: 0.1 },
  ],
} as const;

/** The bright orange blanket with bold black lettering over the wicker rocker. */
export function orangeThrow(sheet: Sheet): void {
  fill(sheet, ORANGE_THROW.base);
  sheet.ctx.fillStyle = ORANGE_THROW.ink;
  for (const band of ORANGE_THROW.bands) {
    sheet.ctx.fillRect(
      band.x * sheet.width,
      band.y * sheet.height,
      band.w * sheet.width,
      band.h * sheet.height,
    );
  }
}
