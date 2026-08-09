export type LauncherEvidenceV1 = {
  kind: "source" | "fixture";
  ref: string;
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
export const THEME_SOUNDS_V1_FILES = ["sounds/navigation.wav", "sounds/launch.wav"] as const;

// prettier-ignore
const evidence = {
  metadata: { kind: "source", ref: "docs/Themes.md", sha256: "cc1b928dba9b713e6d24429fa29fbcabed7c63e88e80a9d5d9af14dfa79fe50e" },
  type: { kind: "source", ref: "arm9/source/themes/ThemeInfoFactory.thumb.cpp", sha256: "256dc9086480c15799000a2381c72ac3bb809432e28bfe717dab884ea60e96fb" },
  custom: { kind: "source", ref: "arm9/source/themes/custom/CustomTheme.cpp", sha256: "87923dee4e14457188300fae9143e7bfc0dba2861295bbbe6a070bc0e8310350" },
  visualLoader: { kind: "source", ref: "arm9/source/romBrowser/Theme/custom/CustomRomBrowserViewFactory.cpp", sha256: "0784aee3590b9bc5e5250106512198d58e4420b0e0af1d0276f56a3e57fb368c" },
  audio: { kind: "source", ref: "arm9/source/bgm/BgmService.cpp", sha256: "e54fe7e0e66cd6abefe908f7d90c8d003169b9db9a7277b90895e6e8e2a41b0e" },
  materialFixture: { kind: "fixture", ref: "_pico/themes/material/theme.json", sha256: "8699d6364ad4d18f409c6aeec804265af1f32648d169591ba7bea18ffc47ce49" },
  customFixture: { kind: "fixture", ref: "_pico/themes/raspberry/theme.json", sha256: "9bb3914d539a87776c7ad38010eaeca7417515e12d7d1b09a710277cdb2073b2" },
  selectedPalette: { kind: "fixture", ref: "_pico/themes/raspberry/gridcellSelectedPltt.bin", sha256: "3fa4d127eb5e9403ef2e7e6631e1e4d54c8dae0d9b6d10741ca6038fe8d0c4c2" },
} as const satisfies Record<string, LauncherEvidenceV1>;

// prettier-ignore
export const LAUNCHER_V1_VISUAL_FILES = [
  "topbg.bin", "bottombg.bin", "gridcell.bin", "gridcellSelected.bin", "gridcellPltt.bin", "gridcellSelectedPltt.bin",
  "bannerListCell.bin", "bannerListCellSelected.bin", "bannerListCellPltt.bin", "bannerListCellSelectedPltt.bin",
  "scrim.bin", "scrimPltt.bin",
] as const;

const visualProfile = {
  profileId: "dspico-launcher-v1",
  tag: "v1.3.0",
  launcherCommit: "b087565651c83081dd65552863f5efc2f28e489c",
  manifestSha256: "068f1efdc2bda015bacc70a94473ac79c0754938ff96823368206b13bf5ceb46",
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
