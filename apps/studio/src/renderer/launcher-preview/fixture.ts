import { admitLauncherPreviewFixtureV1, LAUNCHER_PREVIEW_AUTHORITY_V1 } from "./authority.js";

export type LauncherFixtureV1 = {
  version: 1;
  palette: Uint8Array;
  names: readonly string[];
  selectedIndex: number;
  status: { nickname: string; batteryPercent: number; dateTime?: string; speakerLevel?: number };
  source: typeof LAUNCHER_PREVIEW_AUTHORITY_V1.fixture.source;
};

export function importLauncherPaletteFixtureV1(sourceBytes: Uint8Array): LauncherFixtureV1 {
  return {
    version: 1,
    palette: admitLauncherPreviewFixtureV1(sourceBytes),
    names: ["Neutral One", "Neutral Two", "Neutral Three"],
    selectedIndex: 1,
    status: { nickname: "Studio", batteryPercent: 100, dateTime: "08/20 14:35", speakerLevel: 2 },
    source: LAUNCHER_PREVIEW_AUTHORITY_V1.fixture.source,
  };
}

export const neutralLauncherFixtureV1 = (): LauncherFixtureV1 => ({
  version: 1,
  palette: new Uint8Array(),
  names: ["Alpha Quest", "Blue Harbor", "Circuit Run", "Delta Falls", "Ember Path"],
  selectedIndex: 2,
  status: { nickname: "Studio", batteryPercent: 100, dateTime: "08/20 14:35", speakerLevel: 2 },
  source: LAUNCHER_PREVIEW_AUTHORITY_V1.fixture.source,
});
