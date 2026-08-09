import { describe, expect, it } from "vitest";
import { validateTheme } from "../../dspico-contract/src/index.js";
import {
  applyLauncherParityOperation,
  createLauncherParityProject,
  currentLauncherParityProject,
  openLauncherParityProject,
  saveLauncherParityProject,
} from "./parity-history-v1.js";
import { migrateLegacyMaterial } from "./parity-migration-v1.js";

const created = () =>
  createLauncherParityProject({
    projectId: "material-1",
    metadata: { name: "Theme", description: "Offline Material", author: "Author" },
    primaryColor: { r: 12, g: 34, b: 56 },
    darkTheme: false,
  });

describe("LauncherParityProjectV1 history", () => {
  it("replays metadata and launcher-consumed Material fields", () => {
    const state = applyLauncherParityOperation(
      applyLauncherParityOperation(created(), { version: 1, type: "set-primary-color", value: { r: 1, g: 2, b: 3 } }),
      { version: 1, type: "set-dark-theme", value: true },
    );
    expect(currentLauncherParityProject(state)).toMatchObject({
      material: { primaryColor: { r: 1, g: 2, b: 3 }, darkTheme: true },
    });
    expect(state.history.operations).toHaveLength(2);
  });

  it("round-trips canonical bytes and preserves replay identity", () => {
    const state = applyLauncherParityOperation(created(), {
      version: 1,
      type: "set-metadata",
      field: "name",
      value: "Replayed",
    });
    const bytes = saveLauncherParityProject(state);
    const reopened = openLauncherParityProject(bytes);
    expect(saveLauncherParityProject(reopened)).toBe(bytes);
    expect(currentLauncherParityProject(reopened)).toEqual(currentLauncherParityProject(state));
  });

  it("replays migration decisions and warning acknowledgments together", () => {
    const migrated = migrateLegacyMaterial(
      JSON.stringify({
        formatVersion: 1,
        projectId: "legacy-replay",
        metadata: { name: "Legacy", description: "Short", author: "Author" },
        tokens: { accent: { r: 8, g: 9, b: 10 }, background: "#000000", darkTheme: false },
      }),
      { accent: "map-primary-color", background: "preserve" },
    );
    const warning = validateTheme(migrated.candidate).diagnostics.find(({ severity }) => severity === "warning");
    expect(warning).toBeDefined();
    const state = applyLauncherParityOperation(
      applyLauncherParityOperation(migrated.candidate, {
        version: 1,
        type: "set-migration-decision",
        field: "background",
        decision: "preserve",
      }),
      { version: 1, type: "acknowledge", fingerprint: warning!.fingerprint },
    );
    const bytes = saveLauncherParityProject(state);
    const reopened = openLauncherParityProject(bytes);

    expect(saveLauncherParityProject(reopened)).toBe(bytes);
    expect(reopened.evidence.legacy?.mappings.background).toBe("preserve");
    expect(validateTheme(reopened).acknowledgedFingerprints).toEqual([warning!.fingerprint]);
  });
});
