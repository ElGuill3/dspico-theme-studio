import { admitLauncherPreviewFixtureV1, LAUNCHER_PREVIEW_AUTHORITY_V1 } from "./authority.js";

export type LauncherFixtureV1 = {
  version: 1;
  palette: Uint8Array;
  names: readonly ["Neutral One", "Neutral Two", "Neutral Three"];
  selectedIndex: 1;
  status: { nickname: "Studio"; batteryPercent: 100 };
  source: typeof LAUNCHER_PREVIEW_AUTHORITY_V1.fixture.source;
};

export function importLauncherPaletteFixtureV1(sourceBytes: Uint8Array): LauncherFixtureV1 {
  return {
    version: 1,
    palette: admitLauncherPreviewFixtureV1(sourceBytes),
    names: ["Neutral One", "Neutral Two", "Neutral Three"],
    selectedIndex: 1,
    status: { nickname: "Studio", batteryPercent: 100 },
    source: LAUNCHER_PREVIEW_AUTHORITY_V1.fixture.source,
  };
}
