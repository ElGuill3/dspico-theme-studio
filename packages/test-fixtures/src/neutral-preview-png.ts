import { deflateSync } from "node:zlib";
// prettier-ignore
const crc32 = (bytes: Uint8Array) => { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; };
// prettier-ignore
const chunk = (type: string, data: Uint8Array) => { const name = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([name, data]))); return Buffer.concat([length, name, data, checksum]); };
// prettier-ignore
const neutralPng = (rgba: readonly number[]) => { const header = Buffer.from([0, 0, 1, 0, 0, 0, 0, 192, 8, 6, 0, 0, 0]), pixels = Buffer.alloc(192 * 1025); for (let row = 0; row < 192; row += 1) for (let column = 0; column < 256; column += 1) pixels.set(column < 8 ? [rgba[2]!, rgba[1]!, rgba[0]!, rgba[3]!] : rgba, row * 1025 + 1 + column * 4); return Uint8Array.from(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", new Uint8Array())])); };
export const neutralPreviewPngV1 = neutralPng([32, 64, 96, 255]);
export const neutralPreviewPngVariantV1 = neutralPng([96, 64, 32, 255]);
