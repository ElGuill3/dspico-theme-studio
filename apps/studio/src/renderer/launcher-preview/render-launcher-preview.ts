import {
  decodeA3I5,
  decodeA5I3,
  decodeXbgr555,
  type V13VisualFilesV1,
} from "../../../../../packages/dspico-contract/src/codecs-v1-3.js";
import {
  CUSTOM_VISUAL_DOCUMENTS_V1,
  CUSTOM_VISUAL_ROLES_V1,
  type CustomVisualRoleV1,
  type CustomVisualSourceV1,
  type RgbaImageV1,
} from "../../../../../packages/dspico-contract/src/index.js";
import { createLauncherPreviewFrameModelV1, LauncherPreviewError } from "./authority.js";
import type { LauncherFixtureV1 } from "./fixture.js";
import { materialPreviewV1 } from "./material.js";
import {
  renderCustomScenesV1,
  renderMaterialScenesV1,
  type CustomPreviewAssetsV1,
  type LauncherPreviewMetadataV1,
} from "./scenes.js";

export type LauncherPreviewFrameV1 = {
  mode: ReturnType<typeof createLauncherPreviewFrameModelV1>["mode"];
  top: Uint8Array;
  bottom: Uint8Array;
  metadata: LauncherPreviewMetadataV1 & { authority: string };
};

const decode = (files: V13VisualFilesV1) => ({
  top: decodeXbgr555(files["topbg.bin"], 256, 192),
  bottom: decodeXbgr555(files["bottombg.bin"], 256, 192),
  grid: decodeA3I5(files["gridcell.bin"], files["gridcellPltt.bin"], 64, 64),
  gridSelected: decodeA3I5(files["gridcellSelected.bin"], files["gridcellSelectedPltt.bin"], 64, 64),
  banner: decodeA3I5(files["bannerListCell.bin"], files["bannerListCellPltt.bin"], 256, 49),
  bannerSelected: decodeA3I5(files["bannerListCellSelected.bin"], files["bannerListCellSelectedPltt.bin"], 256, 49),
  scrim: decodeA5I3(files["scrim.bin"], files["scrimPltt.bin"], 8, 42),
});
const assetKeys = {
  "top-background": "top",
  "bottom-background": "bottom",
  "grid-cell": "grid",
  "grid-cell-selected": "gridSelected",
  "banner-cell": "banner",
  "banner-cell-selected": "bannerSelected",
  scrim: "scrim",
} as const satisfies Record<CustomVisualRoleV1, keyof CustomPreviewAssetsV1>;
const placeholder = (role: CustomVisualRoleV1): RgbaImageV1 => {
  const { width, height } = CUSTOM_VISUAL_DOCUMENTS_V1[role],
    pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const value = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 54 : 46;
      pixels.set([value, value + 6, value + 12, 96], (y * width + x) * 4);
    }
  return { width, height, pixels };
};
const partialAssets = (sources: readonly CustomVisualSourceV1[]): CustomPreviewAssetsV1 => {
  const byRole = new Map(sources.map((source) => [source.role, source]));
  return Object.fromEntries(
    CUSTOM_VISUAL_ROLES_V1.map((role) => {
      const source = byRole.get(role),
        expected = CUSTOM_VISUAL_DOCUMENTS_V1[role];
      if (
        source &&
        (source.width !== expected.width ||
          source.height !== expected.height ||
          !(source.pixels instanceof Uint8Array) ||
          source.pixels.length !== expected.width * expected.height * 4)
      )
        throw new LauncherPreviewError(
          "invalid-custom-files",
          `Custom preview source dimensions are invalid: ${role}.`,
        );
      return [
        assetKeys[role],
        source ? { width: source.width, height: source.height, pixels: source.pixels } : placeholder(role),
      ];
    }),
  ) as CustomPreviewAssetsV1;
};

export function renderPartialCustomLauncherPreview(input: {
  sources: readonly CustomVisualSourceV1[];
  mode: string;
  fixture: LauncherFixtureV1;
}): LauncherPreviewFrameV1 {
  const model = createLauncherPreviewFrameModelV1(input.mode);
  try {
    const frame = renderCustomScenesV1(model.mode, input.fixture, partialAssets(input.sources));
    return {
      mode: model.mode,
      top: frame.top,
      bottom: frame.bottom,
      metadata: {
        ...frame.metadata,
        authority: model.authority,
        fidelity: { geometry: frame.metadata.fidelity.geometry, raster: frame.metadata.fidelity.raster },
      },
    };
  } catch (error) {
    if (error instanceof LauncherPreviewError) throw error;
    throw new LauncherPreviewError("invalid-custom-files", "Partial Custom launcher sources could not be rendered.");
  }
}

export function renderLauncherPreview(input: {
  theme:
    | { kind: "custom"; files: V13VisualFilesV1 }
    | { kind: "material"; primaryColor: { r: number; g: number; b: number }; darkTheme: boolean };
  mode: string;
  fixture: LauncherFixtureV1;
}): LauncherPreviewFrameV1 {
  const model = createLauncherPreviewFrameModelV1(input.mode);
  try {
    const frame =
      input.theme.kind === "custom"
        ? renderCustomScenesV1(model.mode, input.fixture, decode(input.theme.files))
        : renderMaterialScenesV1(model.mode, input.fixture, materialPreviewV1(input.theme).roles);
    return {
      mode: model.mode,
      top: frame.top,
      bottom: frame.bottom,
      metadata: { authority: model.authority, ...frame.metadata },
    };
  } catch (error) {
    if (error instanceof LauncherPreviewError) throw error;
    throw new LauncherPreviewError("invalid-custom-files", "Custom launcher bytes could not be decoded.");
  }
}
