import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { importPng, MAX_PROJECT_SOURCE_BYTES, MAX_SOURCE_BYTES, type AssetProvenanceV1 } from "./png-import.js";
const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crc32 = (bytes: Uint8Array): number => {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Uint8Array = new Uint8Array()): Buffer => {
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  Buffer.from(type).copy(output, 4);
  Buffer.from(data).copy(output, 8);
  output.writeUInt32BE(crc32(output.subarray(4, 8 + data.length)), 8 + data.length);
  return output;
};
const png = (width = 1, height = 1, raw = Uint8Array.from([0, 255, 0, 0, 255]), extra: Buffer[] = []): Uint8Array => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from(signature),
    chunk("IHDR", header),
    ...extra,
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND"),
  ]);
};
const provenance: AssetProvenanceV1 = {
  originalName: "pixel.png",
  source: "https://example.test/pixel.png",
  author: "Ada",
  credit: "Ada",
  license: "CC-BY-4.0",
  terms: "Attribution required",
  notice: "Copyright Ada",
  intendedUse: "Custom theme background",
  rightsToExport: true,
};
describe("bounded canonical PNG import", () => {
  it("normalizes valid RGBA8 pixels and records deterministic provenance", () => {
    const asset = importPng(png(), provenance);
    expect(asset).toMatchObject({
      width: 1,
      height: 1,
      normalizationPolicy: "rgba8-straight-top-left-v1",
      referenceOnly: false,
      provenance,
    });
    expect(asset.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(importPng(png(), provenance).sourceSha256).toBe(asset.sourceSha256);
    expect([...asset.pixels]).toEqual([255, 0, 0, 255]);
  });
  it.each([
    ["invalid signature", Uint8Array.of(1, 2, 3), "signature"],
    ["zero dimensions", png(0, 1), "dimensions"],
    ["oversized dimensions", png(4097, 1), "dimensions"],
    [
      "CRC failure",
      (() => {
        const bytes = png();
        bytes[bytes.length - 1] ^= 1;
        return bytes;
      })(),
      "CRC",
    ],
    ["APNG animation", png(1, 1, undefined, [chunk("acTL", new Uint8Array(8))]), "APNG"],
    ["unknown critical chunk", png(1, 1, undefined, [chunk("ABCD")]), "critical"],
  ] as const)("rejects %s before import", (_name, bytes, message) => {
    expect(() => importPng(bytes, provenance)).toThrow(message);
  });
  it("rejects source and project byte limits before decoding", () => {
    expect(() => importPng(new Uint8Array(MAX_SOURCE_BYTES + 1), provenance)).toThrow("source");
    expect(() => importPng(png(), provenance, { sourceBytes: MAX_PROJECT_SOURCE_BYTES })).toThrow(/project/i);
  });
  it("refuses export consent without complete rights and keeps explicit references non-exportable", () => {
    expect(() => importPng(png(), { ...provenance, license: "" })).toThrow("rights");
    const reference = importPng(png(), { ...provenance, rightsToExport: false });
    expect(reference.referenceOnly).toBe(true);
  });
});
