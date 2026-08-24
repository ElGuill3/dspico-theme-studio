import { describe, expect, it } from "vitest";
import {
  CUSTOM_VISUAL_DOCUMENTS_V1,
  sha256,
  type CustomLauncherLayoutOverridesV1,
  type CustomVisualRoleV1,
  type CustomVisualSourceV1,
} from "../../../../../packages/dspico-contract/src/index.js";
import { LauncherPreviewError } from "./authority.js";
import { neutralLauncherFixtureV1 } from "./fixture.js";
import { renderPartialCustomLauncherPreview } from "./render-launcher-preview.js";

const source = (role: CustomVisualRoleV1, rgba: readonly number[]): CustomVisualSourceV1 => {
  const { width, height } = CUSTOM_VISUAL_DOCUMENTS_V1[role],
    pixels = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(rgba, offset);
  return { role, sourceSha256: sha256(pixels), width, height, pixels, provenance: { rightsToExport: true } };
};
const fixture = { ...neutralLauncherFixtureV1(), selectedIndex: 1 };
const committed = (overrides: CustomLauncherLayoutOverridesV1) => ({
  authoritySha256: "b".repeat(64),
  overrides,
});
const render = (
  mode: string,
  sources: readonly CustomVisualSourceV1[] = [],
  committedLayout?: CustomLauncherLayoutOverridesV1,
) =>
  renderPartialCustomLauncherPreview({
    mode,
    sources,
    fixture,
    ...(committedLayout ? { committedLayout: committed(committedLayout) } : {}),
  });

describe("partial Custom launcher preview", () => {
  it.each(["horizontal-grid", "vertical-grid", "banner-list", "coverflow"])(
    "renders deterministic semitransparent 0/7 placeholders without ready fidelity for %s",
    (mode) => {
      const frame = render(mode);
      expect(render(mode)).toEqual(frame);
      for (const alpha of [frame.top[3]!, frame.bottom[(191 * 256 + 255) * 4 + 3]!]) {
        expect(alpha).toBeGreaterThan(0);
        expect(alpha).toBeLessThan(255);
      }
      expect(frame.metadata.fidelity).toEqual({
        geometry: "launcher-vector-backed",
        raster: "deterministic CPU approximation",
      });
    },
  );

  it("replaces only one placeholder with exact real pixels and no overlay", () => {
    const empty = render("horizontal-grid"),
      rgba = [211, 23, 47, 73] as const,
      frame = render("horizontal-grid", [source("top-background", rgba)]);
    expect(frame.top.slice(0, 4)).toEqual(Uint8Array.from(rgba));
    expect(frame.top).not.toEqual(empty.top);
    expect(frame.bottom).toEqual(empty.bottom);
  });

  it.each([
    ["top-background", "horizontal-grid", "top", 0, 0],
    ["bottom-background", "horizontal-grid", "bottom", 255, 191],
    ["grid-cell", "horizontal-grid", "bottom", 10, 42],
    ["grid-cell-selected", "horizontal-grid", "bottom", 58, 42],
    ["banner-cell", "banner-list", "bottom", 42, 3],
    ["banner-cell-selected", "banner-list", "bottom", 42, 50],
    ["scrim", "horizontal-grid", "bottom", 0, 0],
  ] as const)("maps %s at its true dimensions", (role, mode, screen, x, y) => {
    const real = source(role, [223, 17, 29, 255]),
      baseline = render(mode)[screen],
      rendered = render(mode, [real])[screen],
      offset = (y * 256 + x) * 4;
    expect(rendered.slice(offset, offset + 4)).not.toEqual(baseline.slice(offset, offset + 4));
    expect(() => render(mode, [{ ...real, width: real.width - 1 }])).toThrow(LauncherPreviewError);
  });

  it("uses only the replaced committed DTO, never a draft-only layout", () => {
    const committedLayout = {
        topIcon: { position: { x: 4, y: 100 }, blendColor: { r: 220, g: 30, b: 40 } },
      } satisfies CustomLauncherLayoutOverridesV1,
      replacement = {
        topIcon: { position: { x: 40, y: 100 }, blendColor: { r: 30, g: 220, b: 40 } },
      } satisfies CustomLauncherLayoutOverridesV1,
      draftOnly = {
        topIcon: { position: { x: 80, y: 100 }, blendColor: { r: 40, g: 30, b: 220 } },
      } satisfies CustomLauncherLayoutOverridesV1,
      before = render("horizontal-grid", [], committedLayout),
      replaced = render("horizontal-grid", [], replacement);

    expect(render("horizontal-grid", [], committedLayout)).toEqual(before);
    expect(replaced).not.toEqual(before);
    expect(render("horizontal-grid", [], committedLayout)).not.toEqual(render("horizontal-grid", [], draftOnly));
  });
});
