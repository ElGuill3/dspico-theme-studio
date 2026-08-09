import { createHash } from "node:crypto";

import capabilityEvidence from "../evidence/dspico-theme-sounds-v1-capability.json";
import {
  DSPICO_V13_SUPPORTED_HOST,
  LAUNCHER_V1_PROFILE,
  THEME_SOUNDS_V1_CAPABILITY_ID,
  THEME_SOUNDS_V1_FILES,
  THEME_SOUNDS_V1_SOURCE_COMMITS,
  THEME_SOUNDS_V1_TARGET_SHA256,
} from "../../dspico-contract/src/profile-v1-3.js";

type CapabilityEvidenceV1 = {
  schemaVersion: number;
  capabilityId: string;
  component: string;
  supportedHost: typeof DSPICO_V13_SUPPORTED_HOST;
  fallback: boolean;
  sourceLineage: readonly { commit: string; role: string }[];
  targetSha256: string;
  assets: readonly { name: string; path: string; channel: number }[];
  format: Record<string, string | number>;
  limits: Record<string, unknown>;
  evidence: {
    kind: string;
    status: string;
    hardwareParityClaimed: boolean;
    perProjectReceiptRequired: boolean;
  };
};

const soundCapability = capabilityEvidence as CapabilityEvidenceV1;
const failIf = (condition: boolean, message: string): void => {
  if (condition) throw new Error(`Invalid composite profile evidence: ${message}`);
};

failIf(soundCapability.schemaVersion !== 1, "unsupported capability schema");
failIf(soundCapability.capabilityId !== THEME_SOUNDS_V1_CAPABILITY_ID, "capability identity drift");
failIf(soundCapability.supportedHost.id !== DSPICO_V13_SUPPORTED_HOST.id, "supported host drift");
failIf(soundCapability.fallback !== false, "fallback is not allowed");
failIf(soundCapability.targetSha256 !== THEME_SOUNDS_V1_TARGET_SHA256, "installed target hash drift");
failIf(
  JSON.stringify(soundCapability.sourceLineage.map(({ commit }) => commit)) !==
    JSON.stringify(THEME_SOUNDS_V1_SOURCE_COMMITS),
  "source lineage drift",
);
failIf(
  JSON.stringify(soundCapability.assets.map(({ path }) => path)) !== JSON.stringify(THEME_SOUNDS_V1_FILES),
  "sound path drift",
);
failIf(soundCapability.evidence.hardwareParityClaimed, "capability evidence claims hardware parity");
failIf(soundCapability.evidence.perProjectReceiptRequired, "WAV evidence requires a project receipt");

export const THEME_SOUNDS_V1_CAPABILITY = soundCapability;
export const COMPOSITE_PROFILE_V1 = {
  profileId: LAUNCHER_V1_PROFILE.profileId,
  schemaVersion: 1,
  supportedHost: DSPICO_V13_SUPPORTED_HOST,
  fallback: false,
  components: {
    visual: LAUNCHER_V1_PROFILE.components.visual,
    themeSounds: {
      componentId: THEME_SOUNDS_V1_CAPABILITY_ID,
      targetSha256: THEME_SOUNDS_V1_TARGET_SHA256,
      sourceCommits: THEME_SOUNDS_V1_SOURCE_COMMITS,
      capabilityEvidence: soundCapability,
    },
  },
} as const;

export const DSPICO_COMPOSITE_PROFILE_V1 = COMPOSITE_PROFILE_V1;
export const COMPOSITE_PROFILE_V1_SHA256 = createHash("sha256")
  .update(JSON.stringify(COMPOSITE_PROFILE_V1))
  .digest("hex");
