import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCustomRenderPlan, type LayerV2, type ThemeProjectV2 } from "../../theme-core/src/index.js";
import {
  CustomCompileBlockedError,
  compileCustomVisualPackageV1,
  compileCustomBackgroundsV1,
  compileCustomThemeExportV1,
  customExportBlockedDiagnostic,
  packRgba8ToDspico15,
  validateThemeProjectV2,
} from "./index.js";
import {
  CUSTOM_LAUNCHER_LAYOUT_KEYS_V1,
  CUSTOM_VISUAL_ROLES_V1,
  CUSTOM_VISUAL_SLOTS_V1,
  CUSTOM_VISUAL_TOTAL_BYTES_V1,
  validateCustomLauncherLayoutOverridesV1,
  validateCustomModelV1,
  validateCustomThemeV13,
  validateCustomVisualPackageV1,
} from "./custom-v1-3.js";

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

  it("blocks V2 Custom publication instead of emitting transparent role placeholders", () => {
    const top = layer("top", "e", { x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 1, height: 1 });
    const bottom = { ...top, id: "bottom" };
    const input = project([top], [bottom], [record("e", 1, 1)]),
      plan = createCustomRenderPlan(input);
    const sources = [source("e", 1, 1, [255, 0, 0, 255])];

    expect(() => compileCustomThemeExportV1(input, plan, sources)).toThrow(CustomCompileBlockedError);
    try {
      compileCustomThemeExportV1(input, plan, sources);
    } catch (error) {
      expect(error).toMatchObject({
        diagnostics: [expect.objectContaining({ ruleId: "custom.export-blocked", severity: "error" })],
      });
    }
  });
});

const v13Theme = () => ({
  type: "custom",
  name: "Raspberry",
  description: "Theme based on raspberries.",
  author: "Author",
  primaryColor: { r: 138, g: 217, b: 255 },
  darkTheme: false,
  topIcon: { position: { x: 24, y: 132 }, blendColor: { r: 200, g: 200, b: 200 } },
  topBannerTextLine0: {
    position: { x: 70, y: 126 },
    width: 176,
    textColor: { r: 30, g: 30, b: 30 },
    blendColor: { r: 200, g: 200, b: 200 },
  },
  topBannerTextLine1: {
    position: { x: 70, y: 141 },
    width: 176,
    textColor: { r: 30, g: 30, b: 30 },
    blendColor: { r: 200, g: 200, b: 200 },
  },
  topBannerTextLine2: {
    position: { x: 70, y: 155 },
    width: 176,
    textColor: { r: 30, g: 30, b: 30 },
    blendColor: { r: 200, g: 200, b: 200 },
  },
  topFileNameText: {
    position: { x: 18, y: 170 },
    width: 220,
    textColor: { r: 30, g: 30, b: 30 },
    blendColor: { r: 200, g: 200, b: 200 },
  },
  topCover: { position: { x: 75, y: 18 } },
  gridIcon: { blendColor: { r: 200, g: 200, b: 200 } },
  bannerListIcon: { blendColor: { r: 200, g: 200, b: 200 } },
  bannerListTextLine0: { textColor: { r: 30, g: 30, b: 30 } },
  bannerListTextLine1: { textColor: { r: 30, g: 30, b: 30 } },
  bannerListTextLine2: { textColor: { r: 30, g: 30, b: 30 } },
});
const v13Source = () => ({
  sourceSha256: hash("f"),
  width: 256,
  height: 192,
  normalizationPolicy: "rgba8-straight-top-left-v1",
  provenance: {
    originalName: "raspberry.png",
    source: "https://example.test/raspberry.png",
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
const v13VisualPackage = () => ({
  slots: CUSTOM_VISUAL_SLOTS_V1.map((slot) => ({
    path: slot.path,
    length: slot.length,
    geometry: { ...slot.geometry },
    codec: slot.codec,
    sourceSha256: hash("f"),
    bytes: new Uint8Array(slot.length),
  })),
  provenance: [v13Source()],
});

describe("v1.3 Custom model and completeness gate", () => {
  it("compiles seven assigned source roles into the exact hashed post-codec rail", () => {
    const sources = CUSTOM_VISUAL_ROLES_V1.map((role, index) => ({
      role,
      sourceSha256: hash(String(index)),
      width: 1,
      height: 1,
      pixels: new Uint8Array([index * 20, 255 - index * 20, 128, 255]),
      provenance: { ...v13Source().provenance },
      recipe: { transform: "nearest-center-floor-v1" },
    }));
    const first = compileCustomVisualPackageV1(sources);

    expect(first.lineage).toHaveLength(7);
    expect(first.outputs).toHaveLength(12);
    expect(first.totalBytes).toBe(CUSTOM_VISUAL_TOTAL_BYTES_V1);
    expect(first.outputs.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256))).toBe(true);
    expect(first.palettePolicy).toBe("locked-median-cut-v1");
    expect(first.preview).toEqual({
      label: "Decoded post-codec output",
      fidelity: "Chromium approximation",
      hardwareParityClaimed: false,
      hardwareUnknown: true,
    });
    expect(compileCustomVisualPackageV1(sources)).toEqual(first);
  });

  it("accepts the typed launcher layout and exact 12-slot visual package", () => {
    const visual = v13VisualPackage();
    const result = validateCustomModelV1({ theme: v13Theme(), visual });

    expect(result).toMatchObject({ valid: true, totalBytes: CUSTOM_VISUAL_TOTAL_BYTES_V1, diagnostics: [] });
    expect(visual.slots).toHaveLength(12);
    expect(visual.slots.reduce((total, slot) => total + slot.bytes.length, 0)).toBe(230_496);
  });

  it("rejects partial, unsafe, and unsupported Custom JSON without defaulting", () => {
    const input = { ...v13Theme(), topIcon: { position: { x: 256, y: 132 } }, launchTransition: {} };
    const result = validateCustomThemeV13(input);

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["custom.layout-object", "custom.range", "custom.unsupported-field"]),
    );
  });

  it("rejects missing, mis-sized, misnamed, or unauthorized visual slots", () => {
    const visual = v13VisualPackage();
    visual.slots = visual.slots.slice(0, -1);
    visual.provenance[0]!.provenance.rightsToExport = false;
    const result = validateCustomVisualPackageV1(visual);

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["custom.visual-completeness", "custom.provenance-rights"]),
    );
  });

  it("reports the actual byte length for a short visual binary", () => {
    const visual = v13VisualPackage();
    const expected = visual.slots[0]!.length;
    visual.slots[0]!.bytes = new Uint8Array(expected - 1);
    const result = validateCustomVisualPackageV1(visual);

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "custom.visual-length",
          path: "/slots/0/length",
          expected,
          observed: expected - 1,
        }),
      ]),
    );
  });

  it("keeps publication blocked even when the dependent model is complete", () => {
    expect(validateCustomModelV1({ theme: v13Theme(), visual: v13VisualPackage() }).valid).toBe(true);
    expect(customExportBlockedDiagnostic()).toMatchObject({
      ruleId: "custom.export-blocked",
      severity: "error",
      location: { document: "project.json", pointer: "/export" },
    });
  });
});

describe("Custom launcher layout overrides", () => {
  const layout = () => {
    const theme = v13Theme();
    return {
      topIcon: theme.topIcon,
      topBannerTextLine0: theme.topBannerTextLine0,
      topBannerTextLine1: theme.topBannerTextLine1,
      topBannerTextLine2: theme.topBannerTextLine2,
      topFileNameText: theme.topFileNameText,
      topCover: theme.topCover,
    };
  };

  it("accepts only the six complete supported layout overrides", () => {
    const overrides = layout();

    expect(CUSTOM_LAUNCHER_LAYOUT_KEYS_V1).toEqual([
      "topIcon",
      "topBannerTextLine0",
      "topBannerTextLine1",
      "topBannerTextLine2",
      "topFileNameText",
      "topCover",
    ]);
    expect(validateCustomLauncherLayoutOverridesV1(overrides)).toMatchObject({ valid: true, diagnostics: [] });
  });

  it("rejects unknown, partial, and out-of-range overrides", () => {
    const unknown = validateCustomLauncherLayoutOverridesV1({ ...layout(), bottomText: {} });
    const partial = validateCustomLauncherLayoutOverridesV1({
      ...layout(),
      topIcon: { position: { x: 24, y: 132 } },
    });
    const range = validateCustomLauncherLayoutOverridesV1({
      ...layout(),
      topFileNameText: {
        ...layout().topFileNameText,
        position: { x: 250, y: 170 },
        width: 7,
      },
    });

    expect(unknown.diagnostics.map(({ code }) => code)).toContain("custom.unsupported-field");
    expect(partial.diagnostics.map(({ code }) => code)).toContain("custom.layout-object");
    expect(range.diagnostics.map(({ code }) => code)).toContain("custom.range");
  });
});
