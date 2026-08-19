const evidence = (path: string, blobOid: string, sha256: string) => ({ path, blobOid, sha256 });
// prettier-ignore
export const launcherV1Fixture = {
  profileId: "dspico-launcher-v1",
  launcherCommit: "c648ce888f9b24a1a269795dd0391528e5d12251",
  manifestSha256: "44ae2fad3345a1ee9438ef2be7fad02cc038aa3c9bd20850d3ab406a0b872293",
  sources: [
    evidence("docs/Themes.md", "e629ecd40b25e0c9ab95f7442bb2cab9dafb6bfd", "d48bd9a9ee328fd5e85cf7bf78abf52dbfb4f9e991099b38a381d397b73204db"),
    evidence("arm9/source/themes/ThemeInfoFactory.thumb.cpp", "323e065685893c484ca0772917674265c0b1f51c", "ca621fca760e64fb24d47b697fe1366122462257b1105666f6c7280516d5a380"),
    evidence("arm9/source/themes/custom/CustomTheme.cpp", "3463acf93c20071b78b34d73583d85d87f954f8c", "bfe4ed94c858315176cdbf6c3b3fe5735e3f48f7ad0a88c5f4c1a5110288ff92"),
    evidence("arm9/source/romBrowser/Theme/custom/CustomRomBrowserViewFactory.cpp", "3b8f1941398e9fa04a49140505c87bd588f3e08f", "0784aee3590b9bc5e5250106512198d58e4420b0e0af1d0276f56a3e57fb368c"),
    evidence("arm9/source/bgm/BgmService.cpp", "b79bfef280a1061a0290f733bf969ee43b502a8d", "88b3ce05bf1ac2cda8a5c56cfbf5660913b8f7d61a4c681538ff535618c35dac"),
    evidence("_pico/themes/material/theme.json", "b03719875c8b007a56153d52592964a242b4929d", "8699d6364ad4d18f409c6aeec804265af1f32648d169591ba7bea18ffc47ce49"),
    evidence("_pico/themes/raspberry/theme.json", "608ad862fc5eb223549b9b0690ee9a9b7e82c332", "50a8e4ac3f510e85bb6a5a9352bdf2ea03f57745a4fb6d61fac782a167657807"),
    evidence("_pico/themes/raspberry/gridcellSelectedPltt.bin", "77f11308df37270166543d78d4a1d6fb5d0db5b2", "3fa4d127eb5e9403ef2e7e6631e1e4d54c8dae0d9b6d10741ca6038fe8d0c4c2"),
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
