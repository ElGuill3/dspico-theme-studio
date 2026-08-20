import type { RgbaImageV1 } from "../../../../../packages/dspico-contract/src/codecs-v1-3.js";
import { LAUNCHER_PREVIEW_AUTHORITY_V1, LauncherPreviewError, type LauncherPreviewModeV1 } from "./authority.js";
import type { LauncherFixtureV1 } from "./fixture.js";
import type { MaterialRolesV1 } from "./material.js";
import { blit, fade, paint, stage, tile } from "./raster.js";

export type CustomPreviewAssetsV1 = {
  top: RgbaImageV1;
  bottom: RgbaImageV1;
  grid: RgbaImageV1;
  gridSelected: RgbaImageV1;
  banner: RgbaImageV1;
  bannerSelected: RgbaImageV1;
  scrim: RgbaImageV1;
};
type CoverflowTransform = {
  offset: number;
  x: number;
  width: number;
  depth: number;
  angle?: number;
  mask: number;
};
type Coverflow = {
  centeredIndex: number;
  dimmedLeft: number;
  dimmedRight: number;
  transforms: readonly CoverflowTransform[];
};
export type LauncherPreviewMetadataV1 = {
  selectedIndex: number;
  inactiveOpacity: number;
  coverflow?: Coverflow;
  fidelity: {
    geometry: "launcher-vector-backed";
    materialFields?: "launcher-vector-backed";
    compiledPixels?: "exact compiled output";
    raster: "Chromium approximation";
  };
};

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
const ink = (pixels: Uint8Array, text: string, left: number, top: number, color: readonly number[]) => {
  for (const [index, character] of [...text].entries()) {
    const bits = character.charCodeAt(0);
    for (let y = 0; y < 5; y += 1)
      for (let x = 0; x < 3; x += 1)
        if ((bits >> ((x + y * 3) % 7)) & 1) paint(pixels, left + index * 4 + x, top + y, 1, 1, color);
  }
};
const paintCover = (
  pixels: Uint8Array,
  left: number,
  top: number,
  width: number,
  height: number,
  color: readonly number[],
) => {
  paint(pixels, left, top, width, height, color);
  paint(pixels, left + 4, top + 4, width - 8, height - 8, [color[2]!, color[0]!, color[1]!]);
};
const cover = (
  pixels: Uint8Array,
  name: string,
  left: number,
  top: number,
  width: number,
  height: number,
  color: readonly number[],
) => {
  paintCover(pixels, left, top, width, height, color);
  ink(pixels, name, left + 6, top + height - 12, [255, 255, 255]);
};
const filenameInk = (
  pixels: Uint8Array,
  text: string,
  left: number,
  top: number,
  width: number,
  textColor: readonly number[],
  blendColor: readonly number[],
) => {
  for (const [index, character] of [...text].entries()) {
    const origin = left + index * 4;
    if (origin >= left + width) break;
    const bits = character.charCodeAt(0);
    for (let y = 0; y < 5; y += 1) {
      let occupied = false;
      for (let x = 0; x < 3; x += 1)
        if ((bits >> ((x + y * 3) % 7)) & 1) {
          const target = origin + x;
          if (target >= left && target < left + width) {
            paint(pixels, target, top + y, 1, 1, textColor);
            occupied = true;
          }
        }
      const fringe = origin + 3;
      if (occupied && fringe >= left && fringe < left + width) paint(pixels, fringe, top + y, 1, 1, blendColor);
    }
  }
};
const customTopContent = (top: Uint8Array, fixture: LauncherFixtureV1, showCover: boolean) => {
  const { cover, filename } = LAUNCHER_PREVIEW_AUTHORITY_V1.custom;
  ink(top, `${fixture.status.nickname} ${fixture.status.batteryPercent}%`, 8, 6, [255, 255, 255]);
  if (showCover) paintCover(top, cover.left, cover.top, cover.width, cover.height, [255, 255, 255]);
  filenameInk(
    top,
    fixture.names[fixture.selectedIndex]!,
    filename.left,
    filename.top,
    filename.width,
    filename.textColor,
    filename.blendColor,
  );
};
const materialTopContent = (
  top: Uint8Array,
  fixture: LauncherFixtureV1,
  color: readonly number[],
  showCover: boolean,
) => {
  ink(top, `${fixture.status.nickname} ${fixture.status.batteryPercent}%`, 8, 6, color);
  if (showCover) cover(top, fixture.names[fixture.selectedIndex]!, 75, 18, 106, 96, color);
};
const itemContent = (bottom: Uint8Array, name: string, left: number, top: number, color: readonly number[]) => {
  paint(bottom, left + 5, top + 5, 12, 12, color);
  ink(bottom, name, left + 22, top + 7, color);
};

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
    itemContent(bottom, fixture.names[index]!, left, top, [255, 255, 255]);
  });
}

function paintBanner(bottom: Uint8Array, fixture: LauncherFixtureV1, assets: CustomPreviewAssetsV1): void {
  const geometry = LAUNCHER_PREVIEW_AUTHORITY_V1.layouts["banner-list"];
  fixture.names.forEach((_, index) => {
    const top = geometry.padding[1] + index * (44 + geometry.spacing[1]);
    blit(
      bottom,
      256,
      index === fixture.selectedIndex ? assets.bannerSelected : assets.banner,
      geometry.bounds[0],
      top,
      203,
      44,
      index === fixture.selectedIndex ? 255 : 128,
    );
    itemContent(bottom, fixture.names[index]!, geometry.bounds[0], top, [255, 255, 255]);
  });
}

function paintCoverflow(bottom: Uint8Array, fixture: LauncherFixtureV1, grid: RgbaImageV1): Coverflow {
  let dimmedLeft = 0,
    dimmedRight = 0;
  const transforms: CoverflowTransform[] = [];
  for (const offset of [-2, -1, 1, 2, 0]) {
    const index = fixture.selectedIndex + offset;
    if (index < 0 || index >= fixture.names.length) continue;
    const distance = Math.abs(offset),
      x = offset === 0 ? 128 : 128 + (offset < 0 ? -1 : 1) * (24 + distance * 6),
      angle = offset === 0 ? 0 : (offset < 0 ? -1 : 1) * (45 + distance * 10),
      depth = distance ? -distance * 30 - 20 : 0,
      left = x - 53;
    if (offset < 0) dimmedLeft += 1;
    if (offset > 0) dimmedRight += 1;
    transforms.push({ offset, x, width: 106, depth, angle, mask: distance ? 112 : 255 });
    blit(bottom, 256, grid, left, 64 + distance * 12, 106, 96, distance ? 112 : 255);
    itemContent(bottom, fixture.names[index]!, left, 64 + distance * 12, [255, 255, 255]);
  }
  return {
    centeredIndex: fixture.selectedIndex,
    dimmedLeft,
    dimmedRight,
    transforms: transforms.sort((a, b) => a.offset - b.offset),
  };
}

export function renderCustomScenesV1(
  mode: LauncherPreviewModeV1,
  fixture: LauncherFixtureV1,
  assets: CustomPreviewAssetsV1,
) {
  assertFixture(fixture);
  const top = stage(assets.top),
    bottom = stage(assets.bottom);
  customTopContent(top, fixture, mode !== "coverflow");
  paintChrome(bottom, mode, assets.scrim);
  if (mode === "horizontal-grid" || mode === "vertical-grid") paintGrid(bottom, fixture, assets, mode);
  if (mode === "banner-list") paintBanner(bottom, fixture, assets);
  const coverflow = mode === "coverflow" ? paintCoverflow(bottom, fixture, assets.grid) : undefined;
  return {
    top,
    bottom,
    metadata: {
      selectedIndex: fixture.selectedIndex,
      inactiveOpacity: 128,
      fidelity: {
        geometry: "launcher-vector-backed",
        compiledPixels: "exact compiled output",
        raster: "Chromium approximation",
      },
      ...(coverflow ? { coverflow } : {}),
    } satisfies LauncherPreviewMetadataV1,
  };
}

const materialCoverflow = (bottom: Uint8Array, fixture: LauncherFixtureV1, roles: MaterialRolesV1): Coverflow => {
  const transforms: CoverflowTransform[] = [];
  for (const offset of [-2, -1, 0, 1, 2]) {
    const index = fixture.selectedIndex + offset;
    if (index < 0 || index >= fixture.names.length) continue;
    const [x, width] =
      offset < 0 ? [46 - 40 * Math.abs(offset), 36] : offset === 0 ? [46, 106] : offset === 1 ? [156, 54] : [214, 36];
    const depth = -5 - Math.abs(offset),
      mask = Math.abs(offset) ? 144 : 255;
    transforms.push({ offset, x, width, depth, mask });
    cover(bottom, fixture.names[index]!, x, 56, width, 96, Math.abs(offset) ? roles.surfaceBright : roles.mainIconBg);
  }
  return { centeredIndex: fixture.selectedIndex, dimmedLeft: 2, dimmedRight: 2, transforms };
};

export function renderMaterialScenesV1(
  mode: LauncherPreviewModeV1,
  fixture: LauncherFixtureV1,
  roles: MaterialRolesV1,
) {
  assertFixture(fixture);
  const top = new Uint8Array(256 * 192 * 4),
    bottom = new Uint8Array(256 * 192 * 4);
  paint(top, 0, 0, 256, 192, roles.inverseOnSurface);
  paint(bottom, 0, 0, 256, 96, roles.inverseOnSurface);
  paint(bottom, 0, 96, 256, 96, roles.secondaryContainer);
  materialTopContent(top, fixture, roles.onSurface, mode !== "coverflow");
  const vertical = mode === "vertical-grid" || mode === "banner-list";
  paint(bottom, 0, 0, vertical ? 42 : 256, vertical ? 192 : 42, roles.inverseOnSurface);
  if (mode === "horizontal-grid" || mode === "vertical-grid")
    fixture.names.forEach((name, index) => {
      const [left, top] = mode === "horizontal-grid" ? [10 + index * 48, 42] : [42, 3 + index * 47];
      cover(bottom, name, left, top, 44, 44, index === fixture.selectedIndex ? roles.mainIconBg : roles.surfaceBright);
    });
  if (mode === "banner-list")
    fixture.names.forEach((name, index) =>
      cover(
        bottom,
        name,
        42,
        3 + index * 47,
        203,
        44,
        index === fixture.selectedIndex ? roles.mainIconBg : roles.surfaceBright,
      ),
    );
  const coverflow = mode === "coverflow" ? materialCoverflow(bottom, fixture, roles) : undefined;
  paint(bottom, 8, 174, 16, 10, roles.onSurfaceVariant);
  paint(bottom, 232, 174, 16, 10, roles.tertiary);
  return {
    top,
    bottom,
    metadata: {
      selectedIndex: fixture.selectedIndex,
      inactiveOpacity: 128,
      fidelity: {
        geometry: "launcher-vector-backed",
        materialFields: "launcher-vector-backed",
        raster: "Chromium approximation",
      },
      ...(coverflow ? { coverflow } : {}),
    } satisfies LauncherPreviewMetadataV1,
  };
}
