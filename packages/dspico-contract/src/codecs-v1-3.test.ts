import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LAUNCHER_V1_VISUAL_FILES } from "./profile-v1-3.js";
import { encodeA3I5, encodeA5I3, encodeV13VisualFiles, encodeXbgr555, type RgbaImageV1 } from "./index.js";

const golden = JSON.parse(
  readFileSync(path.join(process.cwd(), "packages/test-fixtures/goldens/codecs-v1-3/codec-v1.json"), "utf8"),
) as {
  directHex: string;
  a3i5IndicesHex: string;
  a3i5PalettePrefixHex: string;
  a5i3IndicesHex: string;
  a5i3PalettePrefixHex: string;
};
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const image = (width: number, height: number, pixels: number[]): RgbaImageV1 => ({
  width,
  height,
  pixels: new Uint8Array(pixels),
});
const solid = (width: number, height: number, rgba: readonly number[]) =>
  image(width, height, Array.from({ length: width * height }, () => [...rgba]).flat());

describe("v1.3 deterministic codecs", () => {
  it("packs little-endian XBGR555 with transparent bit 15", () => {
    expect(hex(encodeXbgr555(image(4, 1, [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 9, 8, 7, 0])))).toBe(
      golden.directHex,
    );
  });

  it("quantizes lexical palettes and packs A3I5/A5I3 alpha and index bits", () => {
    const pixels = [0, 0, 0, 0, 255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 255];
    const a3i5 = encodeA3I5(image(4, 1, pixels));
    const a5i3 = encodeA5I3(image(4, 1, pixels));
    expect(hex(a3i5.indices)).toBe(golden.a3i5IndicesHex);
    expect(hex(a3i5.palette.slice(0, 8))).toBe(golden.a3i5PalettePrefixHex);
    expect(a3i5.palette).toHaveLength(64);
    expect(hex(a5i3.indices)).toBe(golden.a5i3IndicesHex);
    expect(hex(a5i3.palette.slice(0, 8))).toBe(golden.a5i3PalettePrefixHex);
    expect(a5i3.palette).toHaveLength(16);
    expect(encodeA3I5(image(4, 1, pixels))).toEqual(a3i5);
  });

  it("keeps palette generation locked for post-codec output", () => {
    const encoded = encodeA3I5(image(2, 1, [255, 0, 0, 255, 0, 0, 0, 0]));

    expect(encoded.palettePolicy).toBe("locked-median-cut-v1");
  });

  it("emits the exact consuming-code filenames and byte sizes", () => {
    const files = encodeV13VisualFiles({
      top: solid(256, 192, [255, 0, 0, 255]),
      bottom: solid(256, 192, [0, 0, 0, 0]),
      gridcell: solid(64, 64, [255, 0, 0, 255]),
      gridcellSelected: solid(64, 64, [0, 255, 0, 255]),
      bannerListCell: solid(256, 49, [0, 0, 255, 255]),
      bannerListCellSelected: solid(256, 49, [255, 255, 255, 255]),
      scrim: solid(8, 42, [0, 0, 0, 128]),
    });
    expect(Object.keys(files)).toEqual([...LAUNCHER_V1_VISUAL_FILES]);
    expect(files["gridcellSelectedPltt.bin"]).toBeDefined();
    expect(files).not.toHaveProperty("gridcellPlttSelected");
    expect(Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, bytes.length]))).toEqual({
      "topbg.bin": 98_304,
      "bottombg.bin": 98_304,
      "gridcell.bin": 4_096,
      "gridcellSelected.bin": 4_096,
      "gridcellPltt.bin": 64,
      "gridcellSelectedPltt.bin": 64,
      "bannerListCell.bin": 12_544,
      "bannerListCellSelected.bin": 12_544,
      "bannerListCellPltt.bin": 64,
      "bannerListCellSelectedPltt.bin": 64,
      "scrim.bin": 336,
      "scrimPltt.bin": 16,
    });
  });

  it("rejects incorrect dimensions before encoding", () => {
    expect(() =>
      encodeV13VisualFiles({
        top: solid(1, 1, [0, 0, 0, 0]),
        bottom: solid(256, 192, [0, 0, 0, 0]),
        gridcell: solid(64, 64, [0, 0, 0, 0]),
        gridcellSelected: solid(64, 64, [0, 0, 0, 0]),
        bannerListCell: solid(256, 49, [0, 0, 0, 0]),
        bannerListCellSelected: solid(256, 49, [0, 0, 0, 0]),
        scrim: solid(8, 42, [0, 0, 0, 0]),
      }),
    ).toThrow("top must be 256x192");
  });
});
