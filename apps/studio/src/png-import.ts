import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
export const MAX_SOURCE_BYTES = 16_777_216;
export const MAX_WIDTH = 4096;
export const MAX_PIXELS = 16_777_216;
export const MAX_DECODED_BYTES = MAX_PIXELS * 4;
export const MAX_PROJECT_SOURCE_BYTES = 268_435_456;
export const MAX_PROJECT_ASSETS = 256;
export const PNG_NORMALIZATION_POLICY = "rgba8-straight-top-left-v1";
export type AssetProvenanceV1 = {
  originalName: string;
  source: string;
  author: string;
  credit: string;
  license: string;
  terms: string;
  notice: string;
  intendedUse: string;
  rightsToExport: boolean;
};
export type PngImportContext = { sourceBytes?: number; assetCount?: number };
export type ImportedPngV1 = {
  sourceSha256: string;
  originalName: string;
  width: number;
  height: number;
  pixels: Uint8Array;
  normalizationPolicy: typeof PNG_NORMALIZATION_POLICY;
  provenance: AssetProvenanceV1;
  referenceOnly: boolean;
};
const fail = (message: string): never => {
  throw new Error(message);
};

const crc32 = (type: string, data: Uint8Array): number => {
  let value = 0xffffffff;
  const update = (byte: number) => {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  };
  for (let index = 0; index < type.length; index += 1) update(type.charCodeAt(index));
  for (const byte of data) update(byte);
  return (value ^ 0xffffffff) >>> 0;
};
const paeth = (left: number, above: number, upperLeft: number): number => {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
    ? left
    : aboveDistance <= upperLeftDistance
      ? above
      : upperLeft;
};
const completeProvenance = (value: AssetProvenanceV1): boolean =>
  (["originalName", "source", "author", "credit", "license", "terms", "notice", "intendedUse"] as const).every(
    (field) => typeof value[field] === "string" && value[field].trim().length > 0,
  );
const checkedProvenance = (value: AssetProvenanceV1): AssetProvenanceV1 => {
  const originalName = value.originalName.split(/[\\/]/).at(-1) ?? "";
  if (/^(?:[a-z]:[\\/]|[\\]|\/|file:)/i.test(value.source.trim()))
    throw new Error("Provenance source must be a citation or URL, not a filesystem path.");
  const normalized = { ...value, originalName };
  if (!normalized.originalName.trim()) throw new Error("PNG provenance requires an original name.");
  if (value.rightsToExport && !completeProvenance(normalized))
    throw new Error("Export rights consent requires complete provenance.");
  return normalized;
};
const checkLimits = (bytes: Uint8Array, context: PngImportContext): void => {
  if (bytes.byteLength > MAX_SOURCE_BYTES) fail("PNG source size exceeds the published limit.");
  if (!Number.isSafeInteger(context.sourceBytes ?? 0) || (context.sourceBytes ?? 0) < 0)
    fail("Project source byte accounting is invalid.");
  if ((context.sourceBytes ?? 0) + bytes.byteLength > MAX_PROJECT_SOURCE_BYTES)
    fail("Project source bytes exceed the published limit.");
  if (context.assetCount !== undefined && (!Number.isSafeInteger(context.assetCount) || context.assetCount < 0))
    fail("Project asset accounting is invalid.");
  if ((context.assetCount ?? 0) >= MAX_PROJECT_ASSETS) fail("Project asset count exceeds the published limit.");
};
const decodePixels = (
  width: number,
  height: number,
  compressed: readonly Uint8Array[],
  sourceBytes: number,
): Uint8Array => {
  const rowBytes = width * 4;
  const expected = height * (rowBytes + 1);
  if (expected > MAX_DECODED_BYTES || expected + sourceBytes > 268_435_456)
    fail("PNG decoded memory exceeds the published limit.");
  let inflated = new Uint8Array();
  try {
    inflated = new Uint8Array(
      inflateSync(Buffer.concat(compressed.map((part) => Buffer.from(part))), { maxOutputLength: expected }),
    );
  } catch {
    fail("PNG image data is not a valid zlib stream.");
  }
  if (inflated.length !== expected) fail("PNG image data has an unexpected decoded size.");
  const pixels = new Uint8Array(width * height * 4);
  const previous = new Uint8Array(rowBytes);
  let input = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = inflated[input++]!;
    if (filter > 4) fail("PNG uses an unsupported row filter.");
    const rowStart = row * rowBytes;
    for (let column = 0; column < rowBytes; column += 1) {
      const raw = inflated[input++]!;
      const left = column >= 4 ? pixels[rowStart + column - 4]! : 0;
      const above = previous[column]!;
      const upperLeft = column >= 4 ? previous[column - 4]! : 0;
      pixels[rowStart + column] =
        filter === 0
          ? raw
          : filter === 1
            ? (raw + left) & 255
            : filter === 2
              ? (raw + above) & 255
              : filter === 3
                ? (raw + Math.floor((left + above) / 2)) & 255
                : (raw + paeth(left, above, upperLeft)) & 255;
    }
    previous.set(pixels.subarray(rowStart, rowStart + rowBytes));
  }
  return pixels;
};
export function importPng(
  input: Uint8Array,
  provenance: AssetProvenanceV1,
  context: PngImportContext = {},
): ImportedPngV1 {
  checkLimits(input, context);
  const bytes = new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const expectedSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < expectedSignature.length || expectedSignature.some((byte, index) => bytes[index] !== byte))
    fail("PNG signature is invalid.");
  let offset = 8;
  let width = 0;
  let height = 0;
  let sawHeader = false;
  let sawData = false;
  let dataClosed = false;
  let sawEnd = false;
  const compressed: Uint8Array[] = [];
  const knownCritical = new Set(["IHDR", "IDAT", "IEND", "PLTE"]);
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) fail("PNG chunk is truncated.");
    const length = view.getUint32(offset);
    const type = Buffer.from(bytes.subarray(offset + 4, offset + 8)).toString("latin1");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) fail("PNG chunk is truncated.");
    const data = bytes.subarray(dataStart, dataEnd);
    if (view.getUint32(dataEnd) !== crc32(type, data)) fail("PNG chunk CRC verification failed.");
    offset = dataEnd + 4;
    if (type === "acTL" || type === "fcTL" || type === "fdAT") fail("APNG animation is unsupported.");
    if ((type.charCodeAt(0) & 32) === 0 && !knownCritical.has(type)) fail("PNG contains an unknown critical chunk.");
    if (!sawHeader && type !== "IHDR") fail("PNG IHDR must be the first chunk.");
    if (type === "IHDR") {
      if (sawHeader || length !== 13) fail("PNG IHDR is invalid.");
      width = view.getUint32(dataStart);
      height = view.getUint32(dataStart + 4);
      if (width < 1 || height < 1 || width > MAX_WIDTH || height > MAX_WIDTH || width * height > MAX_PIXELS)
        fail("PNG dimensions exceed the published limit.");
      if (data[8] !== 8 || data[9] !== 6 || data[10] !== 0 || data[11] !== 0 || data[12] !== 0)
        fail("PNG must be non-interlaced RGBA8.");
      sawHeader = true;
    } else if (type === "IDAT") {
      if (dataClosed || sawEnd || !sawHeader) fail("PNG IDAT ordering is invalid.");
      sawData = true;
      compressed.push(data);
    } else if (type === "IEND") {
      if (length !== 0 || !sawHeader || !sawData || sawEnd || offset !== bytes.length)
        fail("PNG IEND ordering is invalid.");
      sawEnd = true;
    } else if (sawData) {
      dataClosed = true;
    }
  }
  if (!sawEnd) fail("PNG is missing IEND.");
  const normalized = checkedProvenance(provenance);
  return {
    sourceSha256: createHash("sha256").update(bytes).digest("hex"),
    originalName: normalized.originalName,
    width,
    height,
    pixels: decodePixels(width, height, compressed, bytes.length),
    normalizationPolicy: PNG_NORMALIZATION_POLICY,
    provenance: normalized,
    referenceOnly: normalized.rightsToExport !== true || !completeProvenance(normalized),
  };
}
