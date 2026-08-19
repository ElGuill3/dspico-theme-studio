import type { RgbaImageV1 } from "../../../../../packages/dspico-contract/src/codecs-v1-3.js";

export const stage = (image: RgbaImageV1): Uint8Array => new Uint8Array(image.pixels);

export function fade(pixels: Uint8Array, opacity: number): void {
  for (let offset = 0; offset < pixels.length; offset += 4)
    for (let channel = 0; channel < 3; channel += 1)
      pixels[offset + channel] = Math.round((pixels[offset + channel]! * opacity) / 255);
}

export function blit(
  target: Uint8Array,
  targetWidth: number,
  source: RgbaImageV1,
  left: number,
  top: number,
  width = source.width,
  height = source.height,
  opacity = 255,
): void {
  const targetHeight = target.length / (targetWidth * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const dx = left + x,
        dy = top + y;
      if (dx < 0 || dy < 0 || dx >= targetWidth || dy >= targetHeight) continue;
      const input =
          (Math.floor((y * source.height) / height) * source.width + Math.floor((x * source.width) / width)) * 4,
        output = (dy * targetWidth + dx) * 4,
        alpha = Math.round((source.pixels[input + 3]! * opacity) / 255),
        inverse = 255 - alpha;
      for (let channel = 0; channel < 3; channel += 1)
        target[output + channel] = Math.round(
          (source.pixels[input + channel]! * alpha + target[output + channel]! * inverse) / 255,
        );
      target[output + 3] = Math.min(255, alpha + Math.round((target[output + 3]! * inverse) / 255));
    }
}

export function tile(
  target: Uint8Array,
  targetWidth: number,
  source: RgbaImageV1,
  left: number,
  top: number,
  width: number,
  height: number,
  tileWidth = source.width,
  tileHeight = source.height,
): void {
  for (let y = top; y < top + height; y += tileHeight)
    for (let x = left; x < left + width; x += tileWidth) blit(target, targetWidth, source, x, y, tileWidth, tileHeight);
}
