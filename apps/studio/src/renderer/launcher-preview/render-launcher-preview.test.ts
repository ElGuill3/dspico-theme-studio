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
const goldens = {
  "horizontal-grid": {
    top: "52a96b5370ed8ff2a62e77ddf474fb11137f3e449187424c0f73ad51085e3bb8",
    bottom: "ef6e0d01a8d1703f92ccdb0fe3d4a8dae27609d6ba7c8a8b398f08f624a12004",
  },
  "vertical-grid": {
    top: "52a96b5370ed8ff2a62e77ddf474fb11137f3e449187424c0f73ad51085e3bb8",
    bottom: "5a6b772aefafd0ba26b95fbe2a0161afea84aa3abcc58e4cb499691bcc5050e0",
  },
  "banner-list": {
    top: "52a96b5370ed8ff2a62e77ddf474fb11137f3e449187424c0f73ad51085e3bb8",
    bottom: "01f4e828775b30962747b05aad672fa919bb9ac805cab272c962e060464a40c3",
  },
  coverflow: {
    top: "52a96b5370ed8ff2a62e77ddf474fb11137f3e449187424c0f73ad51085e3bb8",
    bottom: "e97d6ec2986f3ab2a22527ddfd83d9f152751205740aa92cf900b31ce81f03ab",
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
    expect(frame.metadata.coverflow).toEqual({ centeredIndex: 2, dimmedLeft: 2, dimmedRight: 2 });
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
