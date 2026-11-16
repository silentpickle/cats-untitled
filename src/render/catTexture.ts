import * as THREE from "three";

/**
 * The stock cat is grey with a shared colour-swatch texture. This repaints the swatches so the
 * fur is black, the eyes are yellow-green and the nose stays pink.
 */

const CHANNELS = 4;
const MAX_CHANNEL = 255;
const COLOR_CHANNELS = 3;

const EYE = { r: 222, g: 226, b: 78 } as const;
const FUR = { base: 16, range: 22, blueTint: 4 } as const;
const LIMITS = {
  eyeBrightness: 0.25,
  pinkRedOverGreen: 40,
  pinkRedOverBlue: 30,
  pinkBrightness: 0.5,
};

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function brightness(c: Rgb): number {
  return (c.r + c.g + c.b) / (COLOR_CHANNELS * MAX_CHANNEL);
}

function isPink(c: Rgb): boolean {
  const redLeads = c.r - c.g > LIMITS.pinkRedOverGreen && c.r - c.b > LIMITS.pinkRedOverBlue;
  return redLeads && brightness(c) > LIMITS.pinkBrightness;
}

export function blackCatColor(c: Rgb): Rgb {
  if (isPink(c)) {
    return c;
  }
  const light = brightness(c);
  if (light < LIMITS.eyeBrightness) {
    return EYE;
  }
  const shade = FUR.base + light * FUR.range;
  return { r: shade, g: shade, b: shade + FUR.blueTint };
}

function repaint(pixels: Uint8ClampedArray): void {
  for (let i = 0; i < pixels.length; i += CHANNELS) {
    const next = blackCatColor({
      r: pixels[i] ?? 0,
      g: pixels[i + 1] ?? 0,
      b: pixels[i + 1 + 1] ?? 0,
    });
    pixels[i] = next.r;
    pixels[i + 1] = next.g;
    pixels[i + 1 + 1] = next.b;
  }
}

export function blackCatTexture(source: THREE.Texture): THREE.Texture {
  const image = source.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (context === null) {
    return source;
  }
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  repaint(data.data);
  context.putImageData(data, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = source.flipY;
  texture.colorSpace = source.colorSpace;
  texture.wrapS = source.wrapS;
  texture.wrapT = source.wrapT;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}
