import { describe, expect, it } from "vitest";
import {
  createProject,
  createProjectV2,
  migrateLegacyMaterial,
  migrateProjectToV3,
  saveLauncherParityProject,
  saveProject,
  saveProjectV2,
} from "./index.js";

const metadata = { name: "Theme", description: "Offline theme", author: "Author" };

describe("V3 legacy migration", () => {
  it("migrates V1 and keeps the exact source bytes and hash", () => {
    // prettier-ignore
    const source = saveProject(createProject({ projectId: "v1", metadata, targetProfileId: "dspico-launcher-v1" }));
    const result = migrateProjectToV3(source);
    expect(result.sourceFormat).toBe("v1");
    expect(result.sourceBytes).toBe(source);
    expect(result.candidate.project.legacyEvidence?.sourceBytes).toBe(source);
    expect(result.requiresConfirmation).toEqual([]);
  });

  it("preserves V2 compositions and requires role confirmation instead of flattening", () => {
    const state = createProjectV2({ projectId: "v2", metadata, themeKind: "custom" });
    const source = saveProjectV2(state);
    const result = migrateProjectToV3(source);
    expect(result.sourceFormat).toBe("v2");
    expect(result.candidate.project.legacyComposition).toBeDefined();
    expect(result.requiresConfirmation.length).toBeGreaterThan(0);
  });

  it("migrates LauncherParityProjectV1 as an immutable legacy source", () => {
    const source = JSON.stringify({
      formatVersion: 1,
      projectId: "parity",
      metadata,
      tokens: { primaryColor: { r: 1, g: 2, b: 3 }, darkTheme: true },
    });
    const parity = migrateLegacyMaterial(source).candidate;
    const result = migrateProjectToV3(saveLauncherParityProject(parity));
    expect(result.sourceFormat).toBe("parity");
    expect(result.candidate.project.legacyEvidence?.sourceFormat).toBe("parity");
  });
});
