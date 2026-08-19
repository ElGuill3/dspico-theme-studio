import type { RgbaImageV1 } from "../../../../../packages/dspico-contract/src/codecs-v1-3.js";
import { LAUNCHER_PREVIEW_AUTHORITY_V1, LauncherPreviewError, type LauncherPreviewModeV1 } from "./authority.js";
import type { LauncherFixtureV1 } from "./fixture.js";
import { blit, fade, stage, tile } from "./raster.js";

export type CustomPreviewAssetsV1 = {
  top: RgbaImageV1;
  bottom: RgbaImageV1;
  grid: RgbaImageV1;
  gridSelected: RgbaImageV1;
  banner: RgbaImageV1;
  bannerSelected: RgbaImageV1;
  scrim: RgbaImageV1;
};
type Coverflow = { centeredIndex: number; dimmedLeft: number; dimmedRight: number };

const assertFixture = (fixture: LauncherFixtureV1) => {
  if (
    !fixture.names.length ||
    !Number.isSafeInteger(fixture.selectedIndex) ||
    fixture.selectedIndex < 0 ||
    fixture.selectedIndex >= fixture.names.length
  )
    throw new LauncherPreviewError("invalid-fixture", "Launcher fixture selection is invalid.");
};
const gridGeometry = (mode: "horizontal-grid" | "vertical-grid") => LAUNCHER_PREVIEW_AUTHORITY_V1.layouts[mode];

function paintChrome(bottom: Uint8Array, mode: LauncherPreviewModeV1, scrim: RgbaImageV1): void {
  fade(bottom, 192);
  if (mode === "horizontal-grid" || mode === "coverflow") tile(bottom, 256, scrim, 0, 0, 256, 42);
  else tile(bottom, 256, scrim, 0, 0, 42, 192, 42, 42);
}

function paintGrid(
  bottom: Uint8Array,
  fixture: LauncherFixtureV1,
  assets: CustomPreviewAssetsV1,
  mode: "horizontal-grid" | "vertical-grid",
): void {
  const geometry = gridGeometry(mode),
    horizontal = mode === "horizontal-grid";
  fixture.names.forEach((_, index) => {
    const [left, top] = horizontal
      ? [geometry.padding[0] + index * (44 + geometry.spacing[0]), geometry.bounds[1]]
      : [geometry.bounds[0], geometry.padding[1] + index * (44 + geometry.spacing[1])];
    blit(
      bottom,
      256,
      index === fixture.selectedIndex ? assets.gridSelected : assets.grid,
      left,
      top,
      44,
      44,
      index === fixture.selectedIndex ? 255 : 128,
    );
  });
}

function paintBanner(bottom: Uint8Array, fixture: LauncherFixtureV1, assets: CustomPreviewAssetsV1): void {
  const geometry = LAUNCHER_PREVIEW_AUTHORITY_V1.layouts["banner-list"];
  fixture.names.forEach((_, index) =>
    blit(
      bottom,
      256,
      index === fixture.selectedIndex ? assets.bannerSelected : assets.banner,
      geometry.bounds[0],
      geometry.padding[1] + index * (44 + geometry.spacing[1]),
      203,
      44,
      index === fixture.selectedIndex ? 255 : 128,
    ),
  );
}

function paintCoverflow(bottom: Uint8Array, fixture: LauncherFixtureV1, grid: RgbaImageV1): Coverflow {
  let dimmedLeft = 0,
    dimmedRight = 0;
  for (const offset of [-2, -1, 1, 2, 0]) {
    const index = fixture.selectedIndex + offset;
    if (index < 0 || index >= fixture.names.length) continue;
    const distance = Math.abs(offset),
      size = 64 - distance * 16;
    if (offset < 0) dimmedLeft += 1;
    if (offset > 0) dimmedRight += 1;
    blit(
      bottom,
      256,
      grid,
      128 + offset * 34 - Math.floor(size / 2),
      64 + distance * 12,
      size,
      size,
      distance ? 112 : 255,
    );
  }
  return { centeredIndex: fixture.selectedIndex, dimmedLeft, dimmedRight };
}

export function renderCustomScenesV1(
  mode: LauncherPreviewModeV1,
  fixture: LauncherFixtureV1,
  assets: CustomPreviewAssetsV1,
) {
  assertFixture(fixture);
  const top = stage(assets.top),
    bottom = stage(assets.bottom);
  paintChrome(bottom, mode, assets.scrim);
  if (mode === "horizontal-grid" || mode === "vertical-grid") paintGrid(bottom, fixture, assets, mode);
  if (mode === "banner-list") paintBanner(bottom, fixture, assets);
  const coverflow = mode === "coverflow" ? paintCoverflow(bottom, fixture, assets.grid) : undefined;
  return {
    top,
    bottom,
    metadata: { selectedIndex: fixture.selectedIndex, inactiveOpacity: 128, ...(coverflow ? { coverflow } : {}) },
  };
}
