import { describe, expect, it } from "vitest";

import { launcherV1Fixture } from "../../test-fixtures/src/launcher-v1.js";
import {
  COMPOSITE_PROFILE_V1,
  COMPOSITE_PROFILE_V1_SHA256,
  DSPICO_COMPOSITE_PROFILE_V1,
  THEME_SOUNDS_V1_CAPABILITY,
} from "../../test-fixtures/src/composite-profile-v1.js";
import {
  DSPICO_V13_SUPPORTED_HOST,
  LAUNCHER_V1_PROFILE,
  THEME_SOUNDS_V1_CAPABILITY_ID,
  THEME_SOUNDS_V1_FILES,
  THEME_SOUNDS_V1_TARGET_SHA256,
} from "./profile-v1-3.js";

describe("composite v1.3 profile", () => {
  it("pins the official visual authority and supported host", () => {
    expect(LAUNCHER_V1_PROFILE).toMatchObject({
      profileId: launcherV1Fixture.profileId,
      tag: "v1.3.0",
      launcherCommit: "b087565651c83081dd65552863f5efc2f28e489c",
      manifestSha256: launcherV1Fixture.manifestSha256,
      supportedHost: DSPICO_V13_SUPPORTED_HOST,
      fallback: false,
    });
  });

  it("binds visual and UI-sound authorities as independent components", () => {
    expect(COMPOSITE_PROFILE_V1.components.visual.manifestSha256).toBe(LAUNCHER_V1_PROFILE.manifestSha256);
    expect(COMPOSITE_PROFILE_V1.components.themeSounds.componentId).toBe(THEME_SOUNDS_V1_CAPABILITY_ID);
    expect(COMPOSITE_PROFILE_V1.components.themeSounds.targetSha256).toBe(THEME_SOUNDS_V1_TARGET_SHA256);
    expect(COMPOSITE_PROFILE_V1.components.themeSounds.capabilityEvidence.component).toBe("theme-ui-sound-authoring");
  });

  it("binds the installed target without a fallback or per-project receipt", () => {
    expect(THEME_SOUNDS_V1_CAPABILITY).toMatchObject({
      capabilityId: THEME_SOUNDS_V1_CAPABILITY_ID,
      supportedHost: DSPICO_V13_SUPPORTED_HOST,
      targetSha256: THEME_SOUNDS_V1_TARGET_SHA256,
      fallback: false,
      evidence: { hardwareParityClaimed: false, perProjectReceiptRequired: false },
    });
    expect(THEME_SOUNDS_V1_CAPABILITY.assets.map(({ path }) => path)).toEqual(THEME_SOUNDS_V1_FILES);
  });

  it("exposes a stable composite identity for later receipts", () => {
    expect(DSPICO_COMPOSITE_PROFILE_V1).toEqual(COMPOSITE_PROFILE_V1);
    expect(COMPOSITE_PROFILE_V1_SHA256).toMatch(/^[a-f0-9]{64}$/);
  });
});
