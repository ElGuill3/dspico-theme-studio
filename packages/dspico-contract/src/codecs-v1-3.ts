import { LAUNCHER_V1_VISUAL_FILES } from "./profile-v1-3.js";

export const CODEC_POLICY_V1 = "le-xbgr555-a3i5-a5i3-round-half-up-median-cut-v1" as const;
export const PALETTE_POLICY_V1 = "locked-median-cut-v1" as const;
export type RgbaImageV1 = { width: number; height: number; pixels: Uint8Array };
export type IndexedCodecV1 = { indices: Uint8Array; palette: Uint8Array; palettePolicy: typeof PALETTE_POLICY_V1 };
export type V13VisualFilesV1 = Record<(typeof LAUNCHER_V1_VISUAL_FILES)[number], Uint8Array>;

type Color = { r: number; g: number; b: number };
type Point = Color & { count: number };

const q5 = (value: number) => Math.min(31, Math.floor((value * 31 + 127) / 255));
const qAlpha = (value: number, bits: number) => Math.floor((value * ((1 << bits) - 1) + 127) / 255);
const colorKey = ({ r, g, b }: Color) => `${r},${g},${b}`;
const lexical = (left: Color, right: Color) => left.r - right.r || left.g - right.g || left.b - right.b;

const assertImage = (image: RgbaImageV1, name: string, width?: number, height?: number): void => {
  if (width !== undefined && (image.width !== width || image.height !== height))
    throw new Error(`${name} must be ${width}x${height}.`);
  if (image.pixels.length !== image.width * image.height * 4)
    throw new Error(`${name} RGBA8 pixels have an invalid length.`);
};

const word = ({ r, g, b }: Color, transparent = false) =>
  transparent ? 0 : 0x8000 | q5(r) | (q5(g) << 5) | (q5(b) << 10);
const writePalette = (colors: readonly Color[], slots: number): Uint8Array => {
  const output = new Uint8Array(slots * 2);
  colors.slice(0, slots - 1).forEach((color, index) => {
    const value = word(color);
    const offset = (index + 1) * 2;
    output[offset] = value & 255;
    output[offset + 1] = value >>> 8;
  });
  return output;
};

const points = (image: RgbaImageV1): Point[] => {
  const counts = new Map<string, Point>();
  for (let offset = 0; offset < image.pixels.length; offset += 4) {
    if (image.pixels[offset + 3] === 0) continue;
    const color = { r: image.pixels[offset]!, g: image.pixels[offset + 1]!, b: image.pixels[offset + 2]! };
    const key = colorKey(color),
      prior = counts.get(key);
    if (prior) prior.count += 1;
    else counts.set(key, { ...color, count: 1 });
  }
  return [...counts.values()].sort(lexical);
};

const range = (box: readonly Point[], channel: keyof Color) =>
  Math.max(...box.map((point) => point[channel])) - Math.min(...box.map((point) => point[channel]));

const palette = (image: RgbaImageV1, slots: number): Color[] => {
  const boxes: Point[][] = [points(image)];
  while (boxes.length < slots - 1) {
    const candidates = boxes.map((box, index) => ({ box, index })).filter(({ box }) => box.length > 1);
    if (!candidates.length) break;
    const selected = candidates.reduce((best, current) => {
      const bestRange = Math.max(range(best.box, "r"), range(best.box, "g"), range(best.box, "b"));
      const currentRange = Math.max(range(current.box, "r"), range(current.box, "g"), range(current.box, "b"));
      return currentRange > bestRange ? current : best;
    });
    const channels: (keyof Color)[] = ["r", "g", "b"];
    const channel = channels.reduce((best, candidate) =>
      range(selected.box, candidate) > range(selected.box, best) ? candidate : best,
    );
    const sorted = [...selected.box].sort((left, right) => left[channel] - right[channel] || lexical(left, right));
    const halfway = Math.ceil(sorted.reduce((sum, point) => sum + point.count, 0) / 2);
    let count = 0;
    let split = 1;
    for (let index = 0; index < sorted.length - 1; index += 1) {
      count += sorted[index]!.count;
      if (count >= halfway) {
        split = index + 1;
        break;
      }
    }
    boxes.splice(selected.index, 1, sorted.slice(0, split), sorted.slice(split));
  }
  return boxes
    .filter((box) => box.length)
    .map((box) => {
      const total = box.reduce((sum, point) => sum + point.count, 0);
      return {
        r: Math.floor((box.reduce((sum, point) => sum + point.r * point.count, 0) + total / 2) / total),
        g: Math.floor((box.reduce((sum, point) => sum + point.g * point.count, 0) + total / 2) / total),
        b: Math.floor((box.reduce((sum, point) => sum + point.b * point.count, 0) + total / 2) / total),
      };
    })
    .sort(lexical);
};

const nearest = (color: Color, colors: readonly Color[]): number => {
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  colors.forEach((candidate, index) => {
    const next = (color.r - candidate.r) ** 2 + (color.g - candidate.g) ** 2 + (color.b - candidate.b) ** 2;
    if (next < distance) {
      distance = next;
      best = index;
    }
  });
  return best + 1;
};

const encodeIndexed = (image: RgbaImageV1, alphaBits: number, indexBits: number, slots: number): IndexedCodecV1 => {
  assertImage(image, "indexed image");
  const colors = palette(image, slots),
    indices = new Uint8Array(image.width * image.height);
  for (let input = 0, output = 0; input < image.pixels.length; input += 4, output += 1) {
    const alpha = image.pixels[input + 3]!;
    const color = { r: image.pixels[input]!, g: image.pixels[input + 1]!, b: image.pixels[input + 2]! };
    indices[output] = alpha === 0 ? 0 : (qAlpha(alpha, alphaBits) << indexBits) | nearest(color, colors);
  }
  return { indices, palette: writePalette(colors, slots), palettePolicy: PALETTE_POLICY_V1 };
};

export function encodeXbgr555(image: RgbaImageV1): Uint8Array {
  assertImage(image, "XBGR555 image");
  const output = new Uint8Array(image.width * image.height * 2);
  for (let input = 0, offset = 0; input < image.pixels.length; input += 4, offset += 2) {
    const value = word(
      { r: image.pixels[input]!, g: image.pixels[input + 1]!, b: image.pixels[input + 2]! },
      image.pixels[input + 3]! < 128,
    );
    output[offset] = value & 255;
    output[offset + 1] = value >>> 8;
  }
  return output;
}

export const encodeA3I5 = (image: RgbaImageV1): IndexedCodecV1 => encodeIndexed(image, 3, 5, 32);
export const encodeA5I3 = (image: RgbaImageV1): IndexedCodecV1 => encodeIndexed(image, 5, 3, 8);

export function encodeV13VisualFiles(input: {
  top: RgbaImageV1;
  bottom: RgbaImageV1;
  gridcell: RgbaImageV1;
  gridcellSelected: RgbaImageV1;
  bannerListCell: RgbaImageV1;
  bannerListCellSelected: RgbaImageV1;
  scrim: RgbaImageV1;
}): V13VisualFilesV1 {
  assertImage(input.top, "top", 256, 192);
  assertImage(input.bottom, "bottom", 256, 192);
  assertImage(input.gridcell, "gridcell", 64, 64);
  assertImage(input.gridcellSelected, "gridcellSelected", 64, 64);
  assertImage(input.bannerListCell, "bannerListCell", 256, 49);
  assertImage(input.bannerListCellSelected, "bannerListCellSelected", 256, 49);
  assertImage(input.scrim, "scrim", 8, 42);
  const grid = encodeA3I5(input.gridcell),
    gridSelected = encodeA3I5(input.gridcellSelected);
  const banner = encodeA3I5(input.bannerListCell),
    bannerSelected = encodeA3I5(input.bannerListCellSelected);
  const scrim = encodeA5I3(input.scrim);
  return {
    "topbg.bin": encodeXbgr555(input.top),
    "bottombg.bin": encodeXbgr555(input.bottom),
    "gridcell.bin": grid.indices,
    "gridcellSelected.bin": gridSelected.indices,
    "gridcellPltt.bin": grid.palette,
    "gridcellSelectedPltt.bin": gridSelected.palette,
    "bannerListCell.bin": banner.indices,
    "bannerListCellSelected.bin": bannerSelected.indices,
    "bannerListCellPltt.bin": banner.palette,
    "bannerListCellSelectedPltt.bin": bannerSelected.palette,
    "scrim.bin": scrim.indices,
    "scrimPltt.bin": scrim.palette,
  };
}
