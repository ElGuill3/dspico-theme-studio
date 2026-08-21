import { describe, expect, it } from "vitest";

import { encodeV13VisualFiles, sha256, type RgbaImageV1 } from "../../../../../packages/dspico-contract/src/index.js";
import { LAUNCHER_PREVIEW_AUTHORITY_V1, LauncherPreviewError } from "./authority.js";
import { neutralLauncherFixtureV1 } from "./fixture.js";
import { renderLauncherPreview } from "./render-launcher-preview.js";

const fixture = {
  ...neutralLauncherFixtureV1(),
  names: ["Neutral One", "Neutral Two", "Neutral Three"],
  selectedIndex: 1,
};
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
    top: "43a9ac5980f8943d8b3b6a63a88aed561420dd9bbe8f7b44c6e6b132137dafe2",
    bottom: "c65fc232d19a4497134b336e8f809be2ff247852aad1e19f9bde3bb31bd8fd71",
  },
  "vertical-grid": {
    top: "43a9ac5980f8943d8b3b6a63a88aed561420dd9bbe8f7b44c6e6b132137dafe2",
    bottom: "be6cdb7890d7176ac51fa105ad0d240e01623b682e9696264d404048e620bd85",
  },
  "banner-list": {
    top: "43a9ac5980f8943d8b3b6a63a88aed561420dd9bbe8f7b44c6e6b132137dafe2",
    bottom: "057f81224c735bdeddef035a70b97cb84639ae8ef40443dc645addf042d76b97",
  },
  coverflow: {
    top: "2e20e3fba25ea4fd45aa170e9b3eb04e5564047923c441aadc44eb44f0c83c3e",
    bottom: "64f85e14bad7ecdd998e494d7f6a37880f081d189278341db808817516f8d935",
  },
} as const;

describe("Custom launcher preview compositor", () => {
  it.each(Object.keys(goldens))("stages deterministic dual-screen buffers for %s", (mode) => {
    const first = render(mode);
    const second = render(mode);
    expect(first).toEqual(second);
    expect({ top: sha256(first.top), bottom: sha256(first.bottom) }).toEqual(goldens[mode as keyof typeof goldens]);
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

  it("consumes app-bar, grid-cell, and banner-cell geometry from the admitted composition authority", () => {
    const composition = LAUNCHER_PREVIEW_AUTHORITY_V1.composition,
      appBar = composition.appBar as unknown as { extent: number; buttonSize: number },
      gridOffset = composition.gridCell.textureOffset as unknown as [number, number],
      bannerOffset = composition.bannerCell.textureOffset as unknown as [number, number],
      originalAppBar = { ...appBar },
      originalGridX = gridOffset[0],
      originalBannerX = bannerOffset[0],
      horizontal = render("horizontal-grid").bottom,
      banner = render("banner-list").bottom;
    try {
      appBar.extent -= 1;
      expect(render("horizontal-grid").bottom).not.toEqual(horizontal);
      appBar.extent = originalAppBar.extent;
      appBar.buttonSize -= 1;
      expect(render("horizontal-grid").bottom).not.toEqual(horizontal);
      appBar.buttonSize = originalAppBar.buttonSize;
      gridOffset[0] += 1;
      expect(render("horizontal-grid").bottom).not.toEqual(horizontal);
      gridOffset[0] = originalGridX;
      bannerOffset[0] += 1;
      expect(render("banner-list").bottom).not.toEqual(banner);
    } finally {
      Object.assign(appBar, originalAppBar);
      gridOffset[0] = originalGridX;
      bannerOffset[0] = originalBannerX;
    }
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
      {
        offset: -2,
        x: 92,
        width: 106,
        renderedWidth: 73,
        top: 61,
        depth: -80,
        angle: 65,
        mask: 255,
        reflectionRows: 20,
      },
      {
        offset: -1,
        x: 98,
        width: 106,
        renderedWidth: 76,
        top: 61,
        depth: -50,
        angle: 55,
        mask: 255,
        reflectionRows: 20,
      },
      { offset: 0, x: 128, width: 106, renderedWidth: 106, top: 63, depth: 0, angle: 0, mask: 255, reflectionRows: 20 },
      {
        offset: 1,
        x: 158,
        width: 106,
        renderedWidth: 76,
        top: 61,
        depth: -50,
        angle: -55,
        mask: 255,
        reflectionRows: 20,
      },
      {
        offset: 2,
        x: 164,
        width: 106,
        renderedWidth: 73,
        top: 61,
        depth: -80,
        angle: -65,
        mask: 255,
        reflectionRows: 20,
      },
    ]);
  });

  it("uses the launcher's asymmetric Material carousel geometry and rounded clipping", () => {
    const frame = renderMaterial("coverflow");
    expect(frame.metadata.coverflow?.transforms).toEqual([
      { offset: -2, x: -34, width: 106, renderedWidth: 36, top: 56, depth: -7, mask: 255, cornerRadius: 18 },
      { offset: -1, x: 6, width: 106, renderedWidth: 36, top: 56, depth: -6, mask: 255, cornerRadius: 18 },
      { offset: 0, x: 46, width: 106, renderedWidth: 106, top: 56, depth: -5, mask: 255, cornerRadius: 18 },
      { offset: 1, x: 156, width: 106, renderedWidth: 54, top: 56, depth: -6, mask: 255, cornerRadius: 18 },
      { offset: 2, x: 214, width: 106, renderedWidth: 36, top: 56, depth: -7, mask: 255, cornerRadius: 18 },
    ]);
    const pixel = (x: number, y: number) => Array.from(frame.bottom.slice((y * 256 + x) * 4, (y * 256 + x) * 4 + 3));
    expect(pixel(170, 80)).toEqual([189, 134, 248]);
    expect(pixel(156, 56)).toEqual(pixel(0, 56));
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
        raster: "deterministic CPU approximation",
      });
    },
  );

  it("invalidates the bounded decode cache when visual bytes mutate in place", () => {
    const mutable = Object.fromEntries(
        Object.entries(files).map(([path, bytes]) => [path, bytes.slice()]),
      ) as typeof files,
      first = renderLauncherPreview({ theme: { kind: "custom", files: mutable }, mode: "horizontal-grid", fixture });
    mutable["topbg.bin"][0] ^= 0x1f;
    const second = renderLauncherPreview({
      theme: { kind: "custom", files: mutable },
      mode: "horizontal-grid",
      fixture,
    });
    expect(second.top).not.toEqual(first.top);
    expect(
      renderLauncherPreview({ theme: { kind: "custom", files: mutable }, mode: "horizontal-grid", fixture }),
    ).toEqual(second);
  });

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
