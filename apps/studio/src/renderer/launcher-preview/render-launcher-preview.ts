import {
  decodeA3I5,
  decodeA5I3,
  decodeXbgr555,
  type V13VisualFilesV1,
} from "../../../../../packages/dspico-contract/src/codecs-v1-3.js";
import { createLauncherPreviewFrameModelV1, LauncherPreviewError } from "./authority.js";
import type { LauncherFixtureV1 } from "./fixture.js";
import { materialPreviewV1 } from "./material.js";
import { renderCustomScenesV1, renderMaterialScenesV1, type LauncherPreviewMetadataV1 } from "./scenes.js";

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
