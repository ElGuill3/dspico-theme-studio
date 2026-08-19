import { describe, expect, it } from "vitest";
import { createLauncherParityProject } from "./parity-history-v1.js";
import { migrateLegacyMaterial } from "./parity-migration-v1.js";
import { createPreviewModel } from "./preview.js";

describe("Material preview fidelity", () => {
  it("labels only consumed fields as backed and the rest as approximation", () => {
    const project = createLauncherParityProject({
      projectId: "preview",
      metadata: { name: "Preview", description: "Offline Material", author: "Author" },
      primaryColor: { r: 1, g: 2, b: 3 },
      darkTheme: true,
    });
    const preview = createPreviewModel(project, "home");
    expect(preview.scenes.every(({ tokens }) => tokens.primaryColor)).toBe(true);
    expect(preview.fidelity).toEqual([
      { label: "launcher-vector-backed", properties: ["dimensions", "primaryColor", "darkTheme"] },
      { label: "Chromium approximation", properties: ["font rasterization", "palette", "blending", "timing", "audio"] },
    ]);
    expect(preview.previewAffectsExport).toBe(false);
  });

  it("shows preserved legacy migration data as non-exported preview state", () => {
    const source = JSON.stringify({
      formatVersion: 1,
      projectId: "legacy-preview",
      metadata: { name: "Legacy", description: "Legacy preview", author: "Author" },
      tokens: { accent: { r: 8, g: 9, b: 10 }, background: "#000000", darkTheme: false },
      scenes: [{ id: "home-top", screen: "top", mode: "home", overrides: {} }],
    });
    const project = migrateLegacyMaterial(source, {
      accent: "map-primary-color",
      background: "preserve",
      scenes: "preserve",
    }).candidate;
    const preview = createPreviewModel(project, "home");

    expect(preview.legacyEvidence).toEqual([
      expect.objectContaining({
        label: "preserved legacy migration data",
        exported: false,
        sourceHash: project.evidence.legacy?.sourceHash,
        sourceBytes: project.evidence.legacy?.sourceBytes,
        formatVersion: 1,
        exclusions: expect.arrayContaining(["background", "scenes"]),
      }),
    ]);
    expect(preview.fidelity.map(({ label }) => label)).toEqual(["launcher-vector-backed", "Chromium approximation"]);
  });
});
