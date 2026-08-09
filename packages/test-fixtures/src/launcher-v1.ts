const evidence = (path: string, sha256: string) => ({ path, sha256 });
// prettier-ignore
export const launcherV1Fixture = {
  profileId: "dspico-launcher-v1",
  tag: "v1.3.0",
  launcherCommit: "b087565651c83081dd65552863f5efc2f28e489c",
  manifestSha256: "068f1efdc2bda015bacc70a94473ac79c0754938ff96823368206b13bf5ceb46",
  sources: [
    evidence("docs/Themes.md", "cc1b928dba9b713e6d24429fa29fbcabed7c63e88e80a9d5d9af14dfa79fe50e"),
    evidence("arm9/source/themes/ThemeInfoFactory.thumb.cpp", "256dc9086480c15799000a2381c72ac3bb809432e28bfe717dab884ea60e96fb"),
    evidence("arm9/source/themes/custom/CustomTheme.cpp", "87923dee4e14457188300fae9143e7bfc0dba2861295bbbe6a070bc0e8310350"),
    evidence("arm9/source/romBrowser/Theme/custom/CustomRomBrowserViewFactory.cpp", "0784aee3590b9bc5e5250106512198d58e4420b0e0af1d0276f56a3e57fb368c"),
    evidence("arm9/source/bgm/BgmService.cpp", "e54fe7e0e66cd6abefe908f7d90c8d003169b9db9a7277b90895e6e8e2a41b0e"),
    evidence("_pico/themes/material/theme.json", "8699d6364ad4d18f409c6aeec804265af1f32648d169591ba7bea18ffc47ce49"),
    evidence("_pico/themes/raspberry/theme.json", "9bb3914d539a87776c7ad38010eaeca7417515e12d7d1b09a710277cdb2073b2"),
    evidence("_pico/themes/raspberry/gridcellSelectedPltt.bin", "3fa4d127eb5e9403ef2e7e6631e1e4d54c8dae0d9b6d10741ca6038fe8d0c4c2"),
  ],
  visualFiles: ["topbg.bin", "bottombg.bin", "gridcell.bin", "gridcellSelected.bin", "gridcellPltt.bin", "gridcellSelectedPltt.bin", "bannerListCell.bin", "bannerListCellSelected.bin", "bannerListCellPltt.bin", "bannerListCellSelectedPltt.bin", "scrim.bin", "scrimPltt.bin"],
  rules: {
    materialType: "material",
    color: { min: 0, max: 255 },
    darkTheme: "boolean",
    defaults: { coverStartScalePercent: 100, coverFinalAlpha: 12, scrimFinalAlpha: 14 },
    ranges: { coverStartScalePercent: [1, 200], alpha: [0, 31] },
  },
  materialExample: {
    type: "material",
    name: "Material Design 3",
    description: "Theme based on Google's Material Design 3.",
    author: "Gericom",
    primaryColor: { r: 138, g: 217, b: 255 },
    darkTheme: false,
  },
} as const;
