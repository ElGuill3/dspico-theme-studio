import { sha256 } from "../../../../../packages/dspico-contract/src/index.js";
import type {
  CustomLauncherLayoutKeyV1,
  CustomLauncherLayoutOverridesV1,
  CustomThemeV13,
} from "../../../../../packages/dspico-contract/src/custom-v1-3.js";
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
] as const;
const sceneSources = [
  source(
    "arm9/source/themes/custom/CustomTheme.cpp",
    "3463acf93c20071b78b34d73583d85d87f954f8c",
    "bfe4ed94c858315176cdbf6c3b3fe5735e3f48f7ad0a88c5f4c1a5110288ff92",
  ),
  source(
    "arm9/source/romBrowser/views/AppBarView.cpp",
    "128c3254d5d88b6432d12ec0bfaace102eaca422",
    "8227a8b77e40b4f41ca96dc0312f5e2e00f054dff826d1811fef71a99501e6e2",
  ),
  source(
    "arm9/source/romBrowser/Theme/custom/CustomAppBarView.cpp",
    "8ffdfd2f6cc6b681f6a9ff66e40e3420c4c0305d",
    "69f3473e58416a16d233886980cc415c4f810cddb77d7a46adb44a41b4a0f239",
  ),
  source(
    "arm9/source/romBrowser/Theme/custom/CustomIconGridItemView.cpp",
    "4674fb83f8a2815b997726ce1e37010e37eb17bf",
    "d4d5c4fcc1c56e059b1c4d1d3b6976922b0ce32307af82c77a2509ea46b9c59d",
  ),
  source(
    "arm9/source/romBrowser/Theme/custom/CustomBannerListItemView.cpp",
    "a2dea5e4080dfbfcdab727167e51824f1876ba57",
    "d42b98376c53b010adedf9103eb68f20382d9c31d32856edc90e8366ddca1b4d",
  ),
  source(
    "arm9/source/romBrowser/views/RomBrowserTopScreenView.cpp",
    "e5a1ac2e7f5300cc9229d0e102494afe78fad2d2",
    "0931b367072583f1a08ad99ca5cd806fc81fcdd91529f2a64d68d4b62c28b13f",
  ),
  source(
    "arm9/source/romBrowser/views/StatusBarFormat.h",
    "77a2db90283fcd068c2413aa1204383bf9ed3f77",
    "aaa0a96a1bd7f10d41d6c71a6a4047a6d90f1878933f8f1f64eb1e958b59aa21",
  ),
  source(
    "arm9/source/romBrowser/views/CoverFlowRecyclerView.cpp",
    "967f86defdbbcb8cf75ce793416b50a82a189ace",
    "3f01e11c942b020ed761696e17daecc382ca81c4447154921eba63b8e432b965",
  ),
  source(
    "arm9/source/romBrowser/views/CoverView.cpp",
    "015b4993ceb00cdf8e718cfa6a739e3f43173de2",
    "b2e05c5240dc6d54a55eb7ffef9009da62433ee0c79980d4bb71a33b94ad9b45",
  ),
  source(
    "arm9/source/romBrowser/Theme/Material/CarouselRecyclerView.cpp",
    "748343301302686277200a20b8c9d2e10443c3ed",
    "d56a10a3e1f200ac47a37b2175950367a3f6d3802a9aac0da61cc9d04c692b28",
  ),
  source(
    "arm9/source/romBrowser/Theme/Material/MaterialFileInfoCardView.cpp",
    "153cbcdf3f6bf98b92b7ef094d65a08c105d35d4",
    "a4077e05bd35468789c41aadcfe67c60edcb0ef7a5167e18a2229f62fc4a4873",
  ),
] as const;
const fixtureCandidate = LAUNCHER_V1_PROFILE.evidence.find(
  ({ path }) => path === "_pico/themes/raspberry/gridcellSelectedPltt.bin",
);
if (LAUNCHER_V1_PROFILE.launcherCommit !== commit || !fixtureCandidate)
  throw new Error("Launcher preview authority is incomplete.");
const fixture = fixtureCandidate;

export type LauncherPreviewModeV1 = "horizontal-grid" | "vertical-grid" | "banner-list" | "coverflow";
export type EffectiveCustomLauncherLayoutV1 = Required<Pick<CustomThemeV13, CustomLauncherLayoutKeyV1>>;
const customLauncherLayoutDefaultsV1 = {
  topIcon: { position: { x: 24, y: 132 }, blendColor: { r: 200, g: 200, b: 200 } },
  topBannerTextLine0: {
    position: { x: 70, y: 126 },
    width: 176,
    textColor: { r: 30, g: 30, b: 30 },
    blendColor: { r: 200, g: 200, b: 200 },
  },
  topBannerTextLine1: {
    position: { x: 70, y: 141 },
    width: 176,
    textColor: { r: 30, g: 30, b: 30 },
    blendColor: { r: 200, g: 200, b: 200 },
  },
  topBannerTextLine2: {
    position: { x: 70, y: 155 },
    width: 176,
    textColor: { r: 30, g: 30, b: 30 },
    blendColor: { r: 200, g: 200, b: 200 },
  },
  topFileNameText: {
    position: { x: 18, y: 170 },
    width: 220,
    textColor: { r: 30, g: 30, b: 30 },
    blendColor: { r: 200, g: 200, b: 200 },
  },
  topCover: { position: { x: 75, y: 18 } },
} satisfies EffectiveCustomLauncherLayoutV1;

export function resolveCustomLauncherLayoutV1(
  overrides: CustomLauncherLayoutOverridesV1 = {},
): EffectiveCustomLauncherLayoutV1 {
  return {
    topIcon: overrides.topIcon ?? customLauncherLayoutDefaultsV1.topIcon,
    topBannerTextLine0: overrides.topBannerTextLine0 ?? customLauncherLayoutDefaultsV1.topBannerTextLine0,
    topBannerTextLine1: overrides.topBannerTextLine1 ?? customLauncherLayoutDefaultsV1.topBannerTextLine1,
    topBannerTextLine2: overrides.topBannerTextLine2 ?? customLauncherLayoutDefaultsV1.topBannerTextLine2,
    topFileNameText: overrides.topFileNameText ?? customLauncherLayoutDefaultsV1.topFileNameText,
    topCover: overrides.topCover ?? customLauncherLayoutDefaultsV1.topCover,
  };
}

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
  sceneSources,
  license: { spdx: "Zlib", attribution: "Copyright (c) 2025 LNH team", noticeSha256: layoutSources[6].sha256 },
  fixture: {
    source: fixture,
    bundle: false,
    rule: "Import only hash-admitted launcher bytes; never bundle launcher artwork.",
  },
  layouts: {
    "horizontal-grid": { source: layoutSources[2].path, bounds: [0, 42, 256, 150], padding: [10, 0], spacing: [4, 4] },
    "vertical-grid": { source: layoutSources[3].path, bounds: [42, 0, 214, 192], padding: [0, 3], spacing: [9, 3] },
    "banner-list": { source: layoutSources[4].path, bounds: [42, 0, 214, 192], padding: [0, 3], spacing: [0, 3] },
    coverflow: { source: layoutSources[5].path, topCover: false },
  },
  composition: {
    appBar: { extent: 42, buttonSize: 32 },
    gridCell: { itemSize: 44, textureOffset: [-2, -2], textureSize: [48, 48], iconOffset: [6, 6], iconSize: 32 },
    bannerCell: {
      itemSize: [203, 44],
      textureOffset: [-3, -2],
      textureSize: [209, 49],
      iconOffset: [6, 6],
      iconSize: 32,
    },
    top: {
      statusHeight: 16,
      cover: [75, 18, 106, 96],
      customIcon: [24, 132],
      customLines: [
        [70, 126],
        [70, 141],
        [70, 155],
      ],
      customFilename: [18, 170],
      materialIcon: [24, 128],
      materialLines: [
        [70, 122],
        [70, 137],
        [70, 151],
      ],
      materialFilename: [18, 168],
    },
    customCoverflow: { reflectionRows: 20 },
    materialCoverflow: {
      y: 56,
      selected: [46, 106],
      next: [156, 54],
      smallWidth: 36,
      spacing: 4,
      radius: 18,
      clip: [6, 250],
    },
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
