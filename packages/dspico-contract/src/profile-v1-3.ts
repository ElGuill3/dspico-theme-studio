export type LauncherEvidenceV1 = {
  path: string;
  blobOid: string;
  sha256: string;
};

export const DSPICO_V13_SUPPORTED_HOST = { platform: "linux", arch: "x64", id: "linux-x64" } as const;
export const THEME_SOUNDS_V1_CAPABILITY_ID = "dspico-theme-sounds-v1" as const;
export const THEME_SOUNDS_V1_TARGET_SHA256 =
  "12a357324cab401a8f100d50198b33bfeba93fbaf53261bc7456ebe863d96342" as const;
export const THEME_SOUNDS_V1_SOURCE_COMMITS = [
  "59e0af2f62cff26e1b4d21f500837d36c4d22810",
  "7a75b4d408b43b62201236576d00e1429d6c32aa",
] as const;
export const THEME_SOUNDS_V1_FILES = ["sounds/navigation.wav", "sounds/select.wav", "sounds/back.wav"] as const;

// prettier-ignore
const evidence = {
  metadata: { path: "docs/Themes.md", blobOid: "e629ecd40b25e0c9ab95f7442bb2cab9dafb6bfd", sha256: "d48bd9a9ee328fd5e85cf7bf78abf52dbfb4f9e991099b38a381d397b73204db" },
  type: { path: "arm9/source/themes/ThemeInfoFactory.thumb.cpp", blobOid: "323e065685893c484ca0772917674265c0b1f51c", sha256: "ca621fca760e64fb24d47b697fe1366122462257b1105666f6c7280516d5a380" },
  custom: { path: "arm9/source/themes/custom/CustomTheme.cpp", blobOid: "3463acf93c20071b78b34d73583d85d87f954f8c", sha256: "bfe4ed94c858315176cdbf6c3b3fe5735e3f48f7ad0a88c5f4c1a5110288ff92" },
  visualLoader: { path: "arm9/source/romBrowser/Theme/custom/CustomRomBrowserViewFactory.cpp", blobOid: "3b8f1941398e9fa04a49140505c87bd588f3e08f", sha256: "0784aee3590b9bc5e5250106512198d58e4420b0e0af1d0276f56a3e57fb368c" },
  audio: { path: "arm9/source/bgm/BgmService.cpp", blobOid: "b79bfef280a1061a0290f733bf969ee43b502a8d", sha256: "88b3ce05bf1ac2cda8a5c56cfbf5660913b8f7d61a4c681538ff535618c35dac" },
  materialFixture: { path: "_pico/themes/material/theme.json", blobOid: "b03719875c8b007a56153d52592964a242b4929d", sha256: "8699d6364ad4d18f409c6aeec804265af1f32648d169591ba7bea18ffc47ce49" },
  customFixture: { path: "_pico/themes/raspberry/theme.json", blobOid: "608ad862fc5eb223549b9b0690ee9a9b7e82c332", sha256: "50a8e4ac3f510e85bb6a5a9352bdf2ea03f57745a4fb6d61fac782a167657807" },
  selectedPalette: { path: "_pico/themes/raspberry/gridcellSelectedPltt.bin", blobOid: "77f11308df37270166543d78d4a1d6fb5d0db5b2", sha256: "3fa4d127eb5e9403ef2e7e6631e1e4d54c8dae0d9b6d10741ca6038fe8d0c4c2" },
} as const satisfies Record<string, LauncherEvidenceV1>;

// prettier-ignore
export const LAUNCHER_V1_VISUAL_FILES = [
  "topbg.bin", "bottombg.bin", "gridcell.bin", "gridcellSelected.bin", "gridcellPltt.bin", "gridcellSelectedPltt.bin",
  "bannerListCell.bin", "bannerListCellSelected.bin", "bannerListCellPltt.bin", "bannerListCellSelectedPltt.bin",
  "scrim.bin", "scrimPltt.bin",
] as const;

const visualProfile = {
  profileId: "dspico-launcher-v1",
  launcherCommit: "c648ce888f9b24a1a269795dd0391528e5d12251",
  manifestSha256: "44ae2fad3345a1ee9438ef2be7fad02cc038aa3c9bd20850d3ab406a0b872293",
  evidence: Object.values(evidence),
  visualFiles: LAUNCHER_V1_VISUAL_FILES,
} as const;

export const LAUNCHER_V1_PROFILE = {
  ...visualProfile,
  supportedHost: DSPICO_V13_SUPPORTED_HOST,
  fallback: false,
  components: {
    visual: visualProfile,
    themeSounds: {
      componentId: THEME_SOUNDS_V1_CAPABILITY_ID,
      supportedHost: DSPICO_V13_SUPPORTED_HOST,
      sourceCommits: THEME_SOUNDS_V1_SOURCE_COMMITS,
      targetSha256: THEME_SOUNDS_V1_TARGET_SHA256,
      files: THEME_SOUNDS_V1_FILES,
      channel: 2,
      perProjectReceiptRequired: false,
      hardwareParityClaimed: false,
    },
  },
} as const;

export const DSPICO_LAUNCHER_V1 = LAUNCHER_V1_PROFILE;
