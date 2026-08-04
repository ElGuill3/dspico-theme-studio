const evidence = (path: string, sha256: string) => ({ path, sha256 });
export const launcherV1Fixture = {
  profileId: "dspico-launcher-v1",
  launcherCommit: "f3ae63279ab72bc6c83124c752ec79f3247db437",
  branch: "feat/theme-launch-transition",
  sources: [
    evidence("docs/Themes.md", "d0b12dfbfcba6e70b01c19a23244a25094f46ad5ef355886345ed089cd627c81"),
    evidence(
      "arm9/source/themes/ThemeInfoFactory.thumb.cpp",
      "ca621fca760e64fb24d47b697fe1366122462257b1105666f6c7280516d5a380",
    ),
    evidence(
      "arm9/source/themes/LaunchTransitionStyle.h",
      "d87ebda8405531963eea156a82f2bdbe9dccbf72461aa5801fc6c3d7f87b93fe",
    ),
    evidence(
      "arm9/source/themes/material/MaterialColorSchemeFactory.cpp",
      "d3f9c459521f1813f89d709f29c44d588a9be34459ac0c477286706e53c6a04e",
    ),
    evidence("_pico/themes/material/theme.json", "8699d6364ad4d18f409c6aeec804265af1f32648d169591ba7bea18ffc47ce49"),
  ],
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
