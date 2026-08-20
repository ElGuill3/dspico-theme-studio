import { admitLauncherPreviewFixtureV1, LAUNCHER_PREVIEW_AUTHORITY_V1 } from "./authority.js";

export type LauncherFixtureV1 = {
  version: 1;
  palette: Uint8Array;
  names: readonly string[];
  selectedIndex: number;
  status: { nickname: string; batteryPercent: number };
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

export const neutralLauncherFixtureV1 = (): LauncherFixtureV1 => ({
  version: 1,
  palette: new Uint8Array(),
  names: ["Neutral One", "Neutral Two", "Neutral Three", "Neutral Four", "Neutral Five"],
  selectedIndex: 2,
  status: { nickname: "Studio", batteryPercent: 100 },
  source: LAUNCHER_PREVIEW_AUTHORITY_V1.fixture.source,
});
