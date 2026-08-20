import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { encodeV13VisualFiles, sha256, type RgbaImageV1 } from "../../../../../packages/dspico-contract/src/index.js";
import { LauncherPreviewError } from "./authority.js";
import { importLauncherPaletteFixtureV1 } from "./fixture.js";
import { renderLauncherPreview } from "./render-launcher-preview.js";

const root = process.env.DSPICO_LAUNCHER_RUNTIME_ROOT;
if (!root) throw new Error("DSPICO_LAUNCHER_RUNTIME_ROOT is required for launcher preview fixture admission.");
const palette = execFileSync("git", [
  "-C",
  root,
  "show",
  "c648ce888f9b24a1a269795dd0391528e5d12251:_pico/themes/raspberry/gridcellSelectedPltt.bin",
]);
const fixture = importLauncherPaletteFixtureV1(palette);
const image = (width: number, height: number, rgba: readonly number[]): RgbaImageV1 => ({
  width,
  height,
  pixels: Uint8Array.from(Array.from({ length: width * height }, () => rgba).flat()),
});
const files = encodeV13VisualFiles({
  top: image(256, 192, [64, 32, 16, 255]),
  bottom: image(256, 192, [32, 64, 96, 255]),
  gridcell: image(64, 64, [220, 80, 40, 255]),
  gridcellSelected: image(64, 64, [40, 220, 80, 255]),
  bannerListCell: image(256, 49, [80, 100, 220, 255]),
  bannerListCellSelected: image(256, 49, [220, 200, 40, 255]),
  scrim: image(8, 42, [0, 0, 0, 160]),
});
const render = (mode: string, selectedIndex = fixture.selectedIndex, names = fixture.names) =>
  renderLauncherPreview({ theme: { kind: "custom", files }, mode, fixture: { ...fixture, selectedIndex, names } });
const renderMaterial = (mode: string, primaryColor = { r: 138, g: 217, b: 255 }, darkTheme = false) =>
  renderLauncherPreview({
    theme: { kind: "material", primaryColor, darkTheme } as never,
    mode,
    fixture: { ...fixture, names: ["One", "Two", "Three", "Four", "Five"], selectedIndex: 2 },
  });
const goldens = {
  "horizontal-grid": {
    top: "291b23e16492a87c4753078639b4826b9c3dc6c24a2422062ce0b096f0e710b3",
    bottom: "291c3b01acb05e902c4f1ba39e92291d55297ba145f97910051d180553c2f46a",
  },
  "vertical-grid": {
    top: "291b23e16492a87c4753078639b4826b9c3dc6c24a2422062ce0b096f0e710b3",
    bottom: "17abb82d0e8f9f811ca4d8c8955166ee239d665f376a6fa6a577e7b78636f2fc",
  },
  "banner-list": {
    top: "291b23e16492a87c4753078639b4826b9c3dc6c24a2422062ce0b096f0e710b3",
    bottom: "cb13e20381dbe0acdfafa26322f495a091a2f87bbaa07b7e72f5493260000dca",
  },
  coverflow: {
    top: "427c5fa2bd93e27391c15e78375b810cd76443b7478e1fb3aeff8e4bbd1c4522",
    bottom: "748a08be71583d4907731318209a082cda67a63a7e90f5ae3f70dfbd643e1eff",
  },
} as const;

describe("Custom launcher preview compositor", () => {
  it.each(Object.keys(goldens))("stages deterministic dual-screen buffers for %s", (mode) => {
    const first = render(mode);
    const second = render(mode);
    expect(first).toEqual(second);
    expect(sha256(first.top)).toBe(goldens[mode as keyof typeof goldens].top);
    expect(sha256(first.bottom)).toBe(goldens[mode as keyof typeof goldens].bottom);
  });

  it("makes grid focus bright while darkening inactive space through the decoded scrim", () => {
    const frame = render("horizontal-grid");
    const inactive = (42 * 256 + 10) * 4;
    const active = (42 * 256 + 58) * 4;
    expect(frame.bottom[active + 1]).toBeGreaterThan(frame.bottom[active]);
    expect(frame.bottom[inactive]).toBeGreaterThan(frame.bottom[inactive + 1]);
    expect(frame.bottom[0]).toBeLessThan(32);
  });

  it("centers Coverflow focus with two dimmed geometric neighbors on each side when available", () => {
    const frame = render("coverflow", 2, ["One", "Two", "Three", "Four", "Five"]);
    expect(frame.metadata.coverflow).toMatchObject({ centeredIndex: 2, dimmedLeft: 2, dimmedRight: 2 });
  });

  it("renders fixture-driven status, content, and pinned Coverflow transforms", () => {
    const base = render("coverflow", 2, ["One", "Two", "Three", "Four", "Five"]);
    const changed = renderLauncherPreview({
      theme: { kind: "custom", files },
      mode: "coverflow",
      fixture: {
        ...fixture,
        names: ["Uno", "Dos", "Tres", "Cuatro", "Cinco"],
        selectedIndex: 2,
        status: { nickname: "Lab", batteryPercent: 73 },
      },
    });
    expect(changed.top).not.toEqual(base.top);
    expect(changed.bottom).not.toEqual(base.bottom);
    expect(base.metadata.coverflow?.transforms).toEqual([
      { offset: -2, x: 92, width: 106, depth: -80, angle: -65, mask: 112 },
      { offset: -1, x: 98, width: 106, depth: -50, angle: -55, mask: 112 },
      { offset: 0, x: 128, width: 106, depth: 0, angle: 0, mask: 255 },
      { offset: 1, x: 158, width: 106, depth: -50, angle: 55, mask: 112 },
      { offset: 2, x: 164, width: 106, depth: -80, angle: 65, mask: 112 },
    ]);
  });

  it.each(["horizontal-grid", "vertical-grid", "banner-list", "coverflow"])(
    "stages mode-aware Material buffers that react to both authority fields for %s",
    (mode) => {
      const base = renderMaterial(mode);
      expect(renderMaterial(mode)).toEqual(base);
      const recolored = renderMaterial(mode, { r: 20, g: 80, b: 160 });
      const dark = renderMaterial(mode, { r: 138, g: 217, b: 255 }, true);
      expect(recolored.top).not.toEqual(base.top);
      expect(recolored.bottom).not.toEqual(base.bottom);
      expect(dark.top).not.toEqual(base.top);
      expect(dark.bottom).not.toEqual(base.bottom);
      expect(base.metadata.fidelity).toEqual({
        geometry: "launcher-vector-backed",
        materialFields: "launcher-vector-backed",
        raster: "Chromium approximation",
      });
    },
  );

  it("refuses malformed custom bytes and unsupported layouts without returning a frame", () => {
    expect(() =>
      renderLauncherPreview({
        theme: { kind: "custom", files: { ...files, "scrim.bin": new Uint8Array() } },
        mode: "horizontal-grid",
        fixture,
      }),
    ).toThrow(LauncherPreviewError);
    expect(() => render("file-list")).toThrow(LauncherPreviewError);
    expect(() => render("unknown")).toThrow(LauncherPreviewError);
  });
});
