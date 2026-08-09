import { describe, expect, it } from "vitest";
import { MigrationRefusalError, migrateLegacyMaterial, saveMigratedParityProject } from "./parity-migration-v1.js";

const legacy = JSON.stringify({
  formatVersion: 1,
  projectId: "legacy",
  metadata: { name: "Legacy", description: "Legacy material", author: "Author" },
  tokens: { accent: { r: 8, g: 9, b: 10 }, background: "#000000", darkTheme: false },
  scenes: [{ id: "home-top", screen: "top", mode: "home", overrides: { accent: "#fff" } }],
});

describe("non-destructive Material migration", () => {
  it("preserves source bytes and requires explicit decisions for ambiguous fields", () => {
    const result = migrateLegacyMaterial(legacy);
    expect(result.sourceBytes).toBe(legacy);
    expect(result.requiresConfirmation).toEqual(expect.arrayContaining(["accent", "background", "scenes"]));
    expect(() => saveMigratedParityProject(result)).toThrow(MigrationRefusalError);
  });

  it("maps only confirmed legacy data and refuses newer formats", () => {
    const result = migrateLegacyMaterial(legacy, {
      accent: "map-primary-color",
      background: "preserve",
      foreground: "drop",
      scenes: "preserve",
      transition: "drop",
    });
    const saved = saveMigratedParityProject(result);
    expect(JSON.parse(saved).material.primaryColor).toEqual({ r: 8, g: 9, b: 10 });
    expect(() => migrateLegacyMaterial('{"formatVersion":3}')).toThrow(MigrationRefusalError);
  });
});
