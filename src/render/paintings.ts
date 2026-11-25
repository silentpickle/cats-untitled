import { FULL_TURN, between, disc, fill, oval, pick, type Sheet } from "./canvasKit";

/** Small hand-drawn copies of two pictures on the living-room walls. */

const HALF = 0.5;

const TREE = {
  springSky: "#d6e4c4",
  winterSky: "#cfcac6",
  mist: "rgba(245,245,245,0.85)",
  ground: { spring: "#7aa35a", winter: "#8a7a66", top: 0.8 },
  bark: "#3b2a1f",
  trunk: { base: 0.12, top: 0.05, rootY: 0.86, forkY: 0.48 },
  branch: { depth: 7, length: 0.2, shrink: 0.72, spread: 0.5, width: 9, thin: 0.68 },
  springLeaves: { colors: ["#e8a6c8", "#f2c4da", "#7fae5a", "#a8c97a", "#5f8f44"], count: 900 },
  autumnLeaves: { colors: ["#c9782f", "#e0a845", "#8f4a26"], count: 120 },
  leafRadius: { min: 3, max: 9 },
  crown: { x: 0.33, y: 0.3, rx: 0.3, ry: 0.24 },
} as const;

interface Limb {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly length: number;
  readonly width: number;
  readonly depth: number;
}

function branch(sheet: Sheet, limb: Limb): void {
  if (limb.depth === 0) {
    return;
  }
  const endX = limb.x + Math.cos(limb.angle) * limb.length;
  const endY = limb.y + Math.sin(limb.angle) * limb.length;
  const { ctx } = sheet;
  ctx.strokeStyle = TREE.bark;
  ctx.lineWidth = limb.width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(limb.x, limb.y);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  const next = {
    x: endX,
    y: endY,
    length: limb.length * TREE.branch.shrink,
    width: limb.width * TREE.branch.thin,
    depth: limb.depth - 1,
  };
  const wobble = between(sheet.rand, -TREE.branch.spread, TREE.branch.spread) * HALF;
  branch(sheet, { ...next, angle: limb.angle - TREE.branch.spread + wobble });
  branch(sheet, { ...next, angle: limb.angle + TREE.branch.spread + wobble });
}

function treeBackdrop(sheet: Sheet): void {
  const { ctx, width, height } = sheet;
  const sky = ctx.createLinearGradient(0, 0, width, 0);
  sky.addColorStop(0, TREE.springSky);
  sky.addColorStop(1, TREE.winterSky);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  const ground = ctx.createLinearGradient(0, 0, width, 0);
  ground.addColorStop(0, TREE.ground.spring);
  ground.addColorStop(1, TREE.ground.winter);
  ctx.fillStyle = ground;
  ctx.fillRect(0, height * TREE.ground.top, width, height);
}

function trunk(sheet: Sheet): void {
  const { ctx, width, height } = sheet;
  const mid = width * HALF;
  ctx.fillStyle = TREE.bark;
  ctx.beginPath();
  ctx.moveTo(mid - width * TREE.trunk.base, height * TREE.trunk.rootY);
  ctx.lineTo(mid - width * TREE.trunk.top * HALF, height * TREE.trunk.forkY);
  ctx.lineTo(mid + width * TREE.trunk.top * HALF, height * TREE.trunk.forkY);
  ctx.lineTo(mid + width * TREE.trunk.base, height * TREE.trunk.rootY);
  ctx.fill();
}

function leaves(sheet: Sheet, spec: { colors: readonly string[]; count: number }, mirror: boolean) {
  const { width, height, rand } = sheet;
  for (let i = 0; i < spec.count; i += 1) {
    const angle = rand() * FULL_TURN;
    const reach = Math.sqrt(rand());
    const x = TREE.crown.x + Math.cos(angle) * TREE.crown.rx * reach;
    const y = TREE.crown.y + Math.sin(angle) * TREE.crown.ry * reach;
    const radius = between(rand, TREE.leafRadius.min, TREE.leafRadius.max);
    disc(sheet, (mirror ? 1 - x : x) * width, y * height, radius, pick(rand, spec.colors));
  }
}

/** The big canvas over the couch: one tree, blossoming on the left and bare on the right. */
export function treePainting(sheet: Sheet): void {
  treeBackdrop(sheet);
  trunk(sheet);
  const start = {
    x: sheet.width * HALF,
    y: sheet.height * TREE.trunk.forkY,
    length: sheet.height * TREE.branch.length,
    width: TREE.branch.width,
    depth: TREE.branch.depth,
  };
  branch(sheet, { ...start, angle: -Math.PI * HALF - TREE.branch.spread });
  branch(sheet, { ...start, angle: -Math.PI * HALF + TREE.branch.spread });
  leaves(sheet, TREE.springLeaves, false);
  leaves(sheet, TREE.autumnLeaves, true);
  const mist = sheet.ctx.createLinearGradient(0, sheet.height * TREE.ground.top, 0, sheet.height);
  mist.addColorStop(0, "rgba(245,245,245,0)");
  mist.addColorStop(1, TREE.mist);
  sheet.ctx.fillStyle = mist;
  sheet.ctx.fillRect(0, 0, sheet.width, sheet.height);
}

const CAT_ART = {
  background: "#2a1f3a",
  flowers: {
    colors: ["#e2412f", "#f08a2a", "#f2c53d", "#e86aa0", "#3fb3a5", "#7cc455", "#9a6ad6"],
    count: 70,
    minRadius: 5,
    maxRadius: 16,
  },
  flowerMiddle: "#2a1f3a",
  middleSize: 0.35,
  fur: "#0d0c10",
  body: { x: 0.5, y: 0.8, rx: 0.3, ry: 0.26 },
  head: { x: 0.5, y: 0.48, r: 0.2 },
  ear: { offset: 0.13, up: 0.34, wide: 0.08 },
  eye: { offset: 0.08, y: 0.47, rx: 0.055, ry: 0.065, pupil: 0.015, color: "#f2d23b" },
} as const;

function catEars(sheet: Sheet): void {
  const { ctx, width, height } = sheet;
  const { head, ear } = CAT_ART;
  ctx.fillStyle = CAT_ART.fur;
  for (const side of [-1, 1]) {
    const baseX = head.x + side * ear.offset;
    ctx.beginPath();
    ctx.moveTo((baseX - ear.wide) * width, head.y * height);
    ctx.lineTo((baseX + side * ear.wide * HALF) * width, (head.y - ear.up) * height);
    ctx.lineTo((baseX + ear.wide) * width, head.y * height);
    ctx.fill();
  }
}

function catEyes(sheet: Sheet): void {
  const { width, height } = sheet;
  const { eye, head } = CAT_ART;
  for (const side of [-1, 1]) {
    const x = (head.x + side * eye.offset) * width;
    const shape = { x, y: eye.y * height, rx: eye.rx * width, ry: eye.ry * width, turn: 0 };
    oval(sheet, shape, eye.color);
    oval(sheet, { ...shape, rx: eye.pupil * width }, CAT_ART.fur);
  }
}

/** The black cat with yellow eyes in a field of bright flowers, leaning on the wall by the couch. */
export function catPainting(sheet: Sheet): void {
  fill(sheet, CAT_ART.background);
  const { flowers } = CAT_ART;
  for (let i = 0; i < flowers.count; i += 1) {
    const x = sheet.rand() * sheet.width;
    const y = sheet.rand() * sheet.height;
    const radius = between(sheet.rand, flowers.minRadius, flowers.maxRadius);
    disc(sheet, x, y, radius, pick(sheet.rand, flowers.colors));
    disc(sheet, x, y, radius * CAT_ART.middleSize, CAT_ART.flowerMiddle);
  }
  const { width, height } = sheet;
  const { body, head } = CAT_ART;
  const bodyShape = {
    x: body.x * width,
    y: body.y * height,
    rx: body.rx * width,
    ry: body.ry * height,
  };
  oval(sheet, { ...bodyShape, turn: 0 }, CAT_ART.fur);
  disc(sheet, head.x * width, head.y * height, head.r * width, CAT_ART.fur);
  catEars(sheet);
  catEyes(sheet);
}
