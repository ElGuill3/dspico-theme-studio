import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCustomRenderPlan, type LayerV2, type ThemeProjectV2 } from "../../theme-core/src/index.js";
import {
  CustomCompileBlockedError,
  compileCustomBackgroundsV1,
  compileCustomThemeExportV1,
  packRgba8ToDspico15,
  validateThemeProjectV2,
} from "./index.js";

const golden = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "packages/test-fixtures/goldens/custom-background-v1/compiler-v1.json"),
    "utf8",
  ),
) as Record<string, string | string[]>;
const hash = (character: string) => character.repeat(64);
const record = (character: string, width: number, height: number) => ({
  sourceSha256: hash(character),
  width,
  height,
  normalizationPolicy: "rgba8-straight-top-left-v1",
  provenance: {
    originalName: `${character}.png`,
    source: `https://example.test/${character}.png`,
    author: "Author",
    credit: "Author",
    license: "CC-BY-4.0",
    terms: "Attribution required",
    notice: "Copyright Author",
    intendedUse: "Custom theme background",
    rightsToExport: true,
  },
  referenceOnly: false,
});
const layer = (
  id: string,
  character: string,
  source: { x: number; y: number; width: number; height: number },
  destination: { x: number; y: number; width: number; height: number },
  visible = true,
): LayerV2 => ({
  id,
  name: id,
  visible,
  opacity: 65536,
  asset: { path: `assets/sha256/${hash(character)}.png`, sha256: hash(character) },
  xQ16: destination.x * 65536,
  yQ16: destination.y * 65536,
  width: source.x + source.width,
  height: source.y + source.height,
  widthQ16: destination.width * 65536,
  heightQ16: destination.height * 65536,
  crop: source,
});
const project = (top: LayerV2[], bottom: LayerV2[], assets: unknown[]): ThemeProjectV2 => ({
  formatVersion: 2,
  projectId: "compiler",
  themeKind: "custom",
  metadata: { name: "Compiler", description: "Deterministic compiler fixture", author: "Author" },
  targetProfileId: "dspico-launcher-v1",
  tokens: {},
  launchTransition: { coverStartScalePercent: 100, coverFinalAlpha: 12, scrimFinalAlpha: 14 },
  scenes: [],
  assetManifest: [...new Map([...top, ...bottom].map((item) => [item.asset.sha256, item.asset])).values()],
  acknowledgments: [],
  documents: [
    { screen: "top", width: 256, height: 192, layers: top },
    { screen: "bottom", width: 256, height: 192, layers: bottom },
  ],
  assets,
  notices: [],
});
const source = (character: string, width: number, height: number, pixels: number[]) => ({
  sourceSha256: hash(character),
  width,
  height,
  normalizationPolicy: "rgba8-straight-top-left-v1" as const,
  pixels: new Uint8Array(pixels),
});
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const zipEntries = (zip: Uint8Array) => {
  const entries: Record<string, Uint8Array> = {},
    view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true),
      nameLength = view.getUint16(offset + 26, true),
      start = offset + 30 + nameLength;
    const name = new TextDecoder().decode(zip.slice(offset + 30, start));
    entries[name] = zip.slice(start, start + size);
    offset = start + size;
  }
  return entries;
};

describe("Custom background 15bpp compiler", () => {
  it("matches pinned XBGR555 packing, alpha, and quantization bytes", () => {
    expect(hex(packRgba8ToDspico15(new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 9, 8, 7, 0])))).toBe(
      golden.packingHex,
    );
    expect(hex(packRgba8ToDspico15(new Uint8Array([255, 0, 0, 127, 255, 0, 0, 128])))).toBe(golden.alphaHex);
    expect(hex(packRgba8ToDspico15(new Uint8Array([128, 4, 251, 255])))).toBe(golden.quantizationHex);
    for (let value = 0; value < 256; value += 1) {
      const packed = packRgba8ToDspico15(new Uint8Array([value, 0, 0, 255]));
      const expected = Math.min(31, Math.floor((value * 63 + 255) / 510));
      expect((packed[0]! | (packed[1]! << 8)) & 31).toBe(expected);
    }
  });

  it("composes straight RGBA8 with fixed-integer source-over before packing", () => {
    const blue = layer("blue", "a", { x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 1, height: 1 });
    const red = layer("red", "b", { x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 1, height: 1 });
    const input = project(
      [blue, red],
      [{ ...blue, id: "bottom", visible: false }],
      [record("a", 1, 1), record("b", 1, 1)],
    );
    const result = compileCustomBackgroundsV1(input, createCustomRenderPlan(input), [
      source("a", 1, 1, [0, 0, 255, 255]),
      source("b", 1, 1, [255, 0, 0, 128]),
    ]);
    expect(hex(result.top.slice(0, 2))).toBe(golden.sourceOverHex);
  });

  it("matches the clipped nearest-center-floor crop golden and repeats exactly", () => {
    const pixels = Array.from({ length: 16 }, (_, index) => [
      (index % 4) * 80,
      Math.floor(index / 4) * 80,
      0,
      255,
    ]).flat();
    const top = layer("crop", "c", { x: 1, y: 1, width: 2, height: 2 }, { x: -1, y: -1, width: 4, height: 4 });
    top.width = 4;
    top.height = 4;
    const input = project([top], [{ ...top, id: "bottom", visible: false }], [record("c", 4, 4)]);
    const plan = createCustomRenderPlan(input),
      sources = [source("c", 4, 4, pixels)];
    const first = compileCustomBackgroundsV1(input, plan, sources),
      second = compileCustomBackgroundsV1(input, plan, sources);

    expect(first.top).toHaveLength(98_304);
    expect(first.bottom).toHaveLength(98_304);
    expect(hex(first.top.slice(0, 8))).toBe(golden.cropFirstRowsHex[0]);
    expect(hex(first.top.slice(256 * 2, 256 * 2 + 8))).toBe(golden.cropFirstRowsHex[1]);
    expect(createHash("sha256").update(first.top).digest("hex")).toBe(golden.cropTopSha256);
    expect(createHash("sha256").update(first.bottom).digest("hex")).toBe(golden.transparentBottomSha256);
    expect(first.bottom.every((byte) => byte === 0)).toBe(true);
    expect(first).toEqual(second);
  });

  it("refuses invalid validation, stale warnings, and missing normalized pixels", () => {
    const top = layer("top", "d", { x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 1, height: 1 });
    const input = project([top], [{ ...top, id: "bottom", visible: false }], [record("d", 1, 1)]);
    const plan = createCustomRenderPlan(input),
      sources = [source("d", 1, 1, [1, 2, 3, 255])];

    expect(() => compileCustomBackgroundsV1({ ...input, targetProfileId: "future" }, plan, sources)).toThrow(
      CustomCompileBlockedError,
    );
    const warned = { ...input, metadata: { ...input.metadata, description: "Short" } };
    const warning = validateThemeProjectV2(warned).diagnostics.find(({ severity }) => severity === "warning")!;
    expect(() => compileCustomBackgroundsV1(warned, plan, sources)).toThrow(CustomCompileBlockedError);
    expect(() => compileCustomBackgroundsV1(warned, plan, sources, [warning.fingerprint])).not.toThrow();
    expect(() => compileCustomBackgroundsV1(input, plan, [])).toThrow("normalized RGBA8 source");
    expect(() => compileCustomBackgroundsV1(input, plan, [source("d", 2, 1, [1, 2, 3, 255, 4, 5, 6, 255])])).toThrow(
      "Invalid normalized RGBA8 source",
    );
    expect(() => compileCustomBackgroundsV1({ ...input, slots: { grid: true } }, plan, sources)).toThrow(
      CustomCompileBlockedError,
    );
  });

  it("builds deterministic ordered Custom files, ZIP parity, and provenance lineage", () => {
    const top = layer("top", "e", { x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 1, height: 1 });
    const bottom = { ...top, id: "bottom" };
    const input = project([top], [bottom], [record("e", 1, 1)]),
      plan = createCustomRenderPlan(input);
    const sources = [source("e", 1, 1, [255, 0, 0, 255])];

    const first = compileCustomThemeExportV1(input, plan, sources),
      second = compileCustomThemeExportV1(input, plan, sources);

    expect(first.files.map(({ path }) => path)).toEqual(["theme.json", "topbg.bin", "bottombg.bin", "report.json"]);
    expect(first).toEqual(second);
    expect(zipEntries(first.zipBytes)).toEqual(Object.fromEntries(first.files.map((file) => [file.path, file.bytes])));
    const report = JSON.parse(new TextDecoder().decode(first.files[3]!.bytes));
    expect(report.compatibility).toMatchObject({ profileId: "dspico-launcher-v1", projectFormatVersion: 2 });
    expect(report.policies).toMatchObject({
      packing: "le-xbgr1555-alpha128-round-half-up-no-dither-v1",
      resize: "nearest-center-floor-v1",
    });
    expect(report.sources).toEqual([hash("e")]);
    expect(
      report.lineage.map(({ screen, layerId }: { screen: string; layerId: string }) => ({ screen, layerId })),
    ).toEqual([
      { screen: "top", layerId: "top" },
      { screen: "bottom", layerId: "bottom" },
    ]);
    expect(report.credits[0]).toMatchObject({ name: "Author", source: "https://example.test/e.png" });
    expect(report.licenses[0]).toMatchObject({ name: "CC-BY-4.0", notice: "Copyright Author" });
  });
});
