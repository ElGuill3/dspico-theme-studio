import { CUSTOM_VISUAL_TOTAL_BYTES_V1 } from "../../dspico-contract/src/custom-v1-3.js";
import { LAUNCHER_V1_VISUAL_FILES } from "../../dspico-contract/src/profile-v1-3.js";
import { V3_VISUAL_ROLES, type AssetRoleV3, type ThemeProjectV3 } from "./model-v3.js";

export type RenderPlanV3 = {
  version: 3;
  policy: "q16-crop-source-over-v3";
  fidelity: "Chromium approximation";
  hardwareParityClaimed: false;
  screens: { screen: "top" | "bottom"; sourceSha256?: string; role: AssetRoleV3 }[];
  visual: {
    roles: typeof V3_VISUAL_ROLES;
    outputPaths: typeof LAUNCHER_V1_VISUAL_FILES;
    totalBytes: typeof CUSTOM_VISUAL_TOTAL_BYTES_V1;
    postCodec: "Decoded post-codec output";
    fidelity: "Chromium approximation";
    hardwareParityClaimed: false;
    hardwareUnknown: true;
  };
};

export function createRenderPlanV3(project: ThemeProjectV3): RenderPlanV3 {
  return {
    version: 3,
    policy: "q16-crop-source-over-v3",
    fidelity: "Chromium approximation",
    hardwareParityClaimed: false,
    screens: [
      { screen: "top", role: "top-background", sourceSha256: project.roleAssignments["top-background"] },
      { screen: "bottom", role: "bottom-background", sourceSha256: project.roleAssignments["bottom-background"] },
    ],
    visual: {
      roles: V3_VISUAL_ROLES,
      outputPaths: LAUNCHER_V1_VISUAL_FILES,
      totalBytes: CUSTOM_VISUAL_TOTAL_BYTES_V1,
      postCodec: "Decoded post-codec output",
      fidelity: "Chromium approximation",
      hardwareParityClaimed: false,
      hardwareUnknown: true,
    },
  };
}
