import { sha256 } from "../../../../../packages/dspico-contract/src/index.js";
import { LAUNCHER_V1_PROFILE } from "../../../../../packages/dspico-contract/src/profile-v1-3.js";

const commit = "c648ce888f9b24a1a269795dd0391528e5d12251" as const;
const source = (path: string, blobOid: string, sha256: string) => ({ path, blobOid, sha256 });
const layoutSources = [
  source(
    "arm9/source/services/settings/RomBrowserLayout.h",
    "6c8104d38922fb6d3e3780ad00eb08887dedfc8a",
    "9f8cdf378e0d645d68f9d2f452c58275609f3737ee5b732319843b42780d7fe5",
  ),
  source(
    "arm9/source/romBrowser/DisplayMode/RomBrowserDisplayModeFactory.cpp",
    "e5b876f92de5ccb9e0ad912907d852c05366dd75",
    "af14372c94d065da9e466ac527ca7eaec63845fc8b8ffc4210ce02962181e822",
  ),
  source(
    "arm9/source/romBrowser/DisplayMode/RomBrowserHorizontalIconGridDisplayMode.h",
    "73bc0e697848a27a0fc403312e39e4dbf07e9db4",
    "f9719dd23de3a77b1f6f0a9ef8039d16ba2b8a5494c1dbf009a9ccebfe46375a",
  ),
  source(
    "arm9/source/romBrowser/DisplayMode/RomBrowserVerticalIconGridDisplayMode.h",
    "c26600fa752bfea94f37bf54337ccdf09efcd6d2",
    "7a90565b638f43d6f44fd9f670ebcc5d2078700d78678bbbf348c338e8e87362",
  ),
  source(
    "arm9/source/romBrowser/DisplayMode/RomBrowserBannerListDisplayMode.h",
    "5b0a395e19e8d4c0954409c9ea59dd79c642b58a",
    "c9be49bac6594a387b4523877fa1cd5b8091f0b90371c68841888891af4c5852",
  ),
  source(
    "arm9/source/romBrowser/DisplayMode/RomBrowserHorizontalCoverFlowDisplayMode.h",
    "48b055564bcd20ca1b70d595afeb2dd87966d808",
    "f9bacc22c4f5f0672c37e636c615387bc7275155025a15fbd11824b812b26ec9",
  ),
  source(
    "LICENSE.txt",
    "59dc7d23bc7d7d47d6ff53d0cfbece5a761d54ee",
    "ce9bd8c9fa3f0743078f7a9b593157c749380dc1915547b0ac6d0ea39b1bb771",
  ),
  source(
    "arm9/source/romBrowser/views/CoverFlowRecyclerView.cpp",
    "967f86defdbbcb8cf75ce793416b50a82a189ace",
    "3f01e11c942b020ed761696e17daecc382ca81c4447154921eba63b8e432b965",
  ),
] as const;
const fixtureCandidate = LAUNCHER_V1_PROFILE.evidence.find(
  ({ path }) => path === "_pico/themes/raspberry/gridcellSelectedPltt.bin",
);
if (LAUNCHER_V1_PROFILE.launcherCommit !== commit || !fixtureCandidate)
  throw new Error("Launcher preview authority is incomplete.");
const fixture = fixtureCandidate;

export type LauncherPreviewModeV1 = "horizontal-grid" | "vertical-grid" | "banner-list" | "coverflow";
export class LauncherPreviewError extends Error {
  constructor(
    readonly code: "unsupported-layout" | "unadmitted-fixture" | "invalid-custom-files" | "invalid-fixture",
    message: string,
  ) {
    super(message);
    this.name = "LauncherPreviewError";
  }
}

export const LAUNCHER_PREVIEW_AUTHORITY_V1 = {
  launcherCommit: commit,
  evidence: { manifestSha256: LAUNCHER_V1_PROFILE.manifestSha256, sources: LAUNCHER_V1_PROFILE.evidence },
  layoutSources,
  license: { spdx: "Zlib", attribution: "Copyright (c) 2025 LNH team", noticeSha256: layoutSources[6].sha256 },
  fixture: {
    source: fixture,
    bundle: false,
    rule: "Import only hash-admitted launcher bytes; never bundle launcher artwork.",
  },
  custom: {
    cover: { left: 75, top: 18, width: 106, height: 96 },
    filename: { left: 18, top: 170, width: 220, textColor: [30, 30, 30], blendColor: [200, 200, 200] },
  },
  layouts: {
    "horizontal-grid": { source: layoutSources[2].path, bounds: [0, 42, 256, 150], padding: [10, 0], spacing: [4, 4] },
    "vertical-grid": { source: layoutSources[3].path, bounds: [42, 0, 214, 192], padding: [0, 3], spacing: [9, 3] },
    "banner-list": { source: layoutSources[4].path, bounds: [42, 0, 214, 192], padding: [0, 3], spacing: [0, 3] },
    coverflow: { source: layoutSources[5].path, topCover: false },
  },
} as const;

export function createLauncherPreviewFrameModelV1(mode: string) {
  if (!Object.hasOwn(LAUNCHER_PREVIEW_AUTHORITY_V1.layouts, mode))
    throw new LauncherPreviewError("unsupported-layout", `Launcher layout is unsupported: ${mode}`);
  return { mode: mode as LauncherPreviewModeV1, width: 256 as const, height: 192 as const, authority: commit };
}

export function admitLauncherPreviewFixtureV1(bytes: Uint8Array): Uint8Array {
  if (!(bytes instanceof Uint8Array) || sha256(bytes) !== fixture.sha256)
    throw new LauncherPreviewError(
      "unadmitted-fixture",
      "Launcher fixture bytes are not admitted by the authority manifest.",
    );
  return new Uint8Array(bytes);
}
