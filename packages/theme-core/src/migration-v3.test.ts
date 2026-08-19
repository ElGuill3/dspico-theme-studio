import { describe, expect, it } from "vitest";
import {
  applyOperationV3,
  createProject,
  createProjectV2,
  createMediaRefV3,
  createProjectV3,
  migrateLegacyMaterial,
  migrateProfileV3,
  migrateProjectToV3,
  saveProjectV3,
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

  it("rejects incompatible Launch and Select operations across the redo tail but retains equal convergence", () => {
    const sound = (role: "navigation" | "select", value: number) => {
      const media = createMediaRefV3(Uint8Array.of(82, 73, 70, 70, value), "audio/wav");
      return {
        version: 3,
        type: "set-theme-sound",
        role: `${role}-sound`,
        asset: { id: `wav:${role}`, media, role: `${role}-sound`, provenance: {}, rightsToExport: true },
      } as const;
    };
    const source = (select: ReturnType<typeof sound>) => {
      const state = applyOperationV3(
        applyOperationV3(createProjectV3({ projectId: "redo", metadata }), sound("navigation", 1)),
        select,
      );
      const persisted = JSON.parse(saveProjectV3({ ...state, cursor: 0 })) as Record<string, any>;
      persisted.initial.profile.manifestSha256 = "068f1efdc2bda015bacc70a94473ac79c0754938ff96823368206b13bf5ceb46";
      persisted.operations[0].role = "launch-sound";
      persisted.operations[0].asset.role = "launch-sound";
      persisted.operations[0].asset.id = "wav:launch";
      return `${JSON.stringify(persisted)}\n`;
    };

    expect(() => migrateProfileV3(source(sound("select", 2)))).toThrow("operation collision");
    expect(migrateProfileV3(source(sound("select", 1))).state.operations).toHaveLength(2);
  });
});
