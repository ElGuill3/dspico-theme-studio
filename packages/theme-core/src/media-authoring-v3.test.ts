import { describe, expect, it } from "vitest";
import {
  applyOperationV3,
  collectMediaReferencesV3,
  confirmRolesV3,
  createMediaRefV3,
  createProjectV3,
  currentProjectV3,
  openProjectV3,
  saveProjectV3,
  type MediaAssetV3,
} from "./index.js";

const metadata = { name: "Theme", description: "Offline theme", author: "Author" };

describe("V3 immutable media authoring", () => {
  it("keeps source identity immutable until an explicit role confirmation", () => {
    const bytes = Uint8Array.of(1, 2, 3, 4);
    const media = createMediaRefV3(bytes, "image/png");
    const asset: MediaAssetV3 = {
      id: media.sha256,
      media,
      role: "top-background",
      provenance: { source: "fixture", rightsToExport: true },
      rightsToExport: true,
    };
    // prettier-ignore
    const state = createProjectV3({ projectId: "v3", metadata, themeKind: "custom", assets: [asset] });
    expect(currentProjectV3(state).confirmedRoles).toEqual([]);
    // prettier-ignore
    const confirmed = confirmRolesV3(state, { "top-background": media.sha256 });
    // prettier-ignore
    expect(currentProjectV3(confirmed).roleAssignments["top-background"]).toBe(media.sha256);
    expect(currentProjectV3(confirmed).confirmedRoles).toEqual(["top-background"]);
    // prettier-ignore
    expect(() => confirmRolesV3(state, { "bottom-background": "missing" })).toThrow("media");
  });

  it("persists the redo tail and cursor while truncating it on a new branch", () => {
    const bytes = Uint8Array.of(137, 80, 78, 71, 1);
    const media = createMediaRefV3(bytes, "image/png");
    const imported = applyOperationV3(createProjectV3({ projectId: "history", metadata }), {
      version: 3,
      type: "import-layer",
      asset: { id: "image", media, provenance: {}, rightsToExport: true },
      composition: { layer: "imported" },
    });
    const undone = { ...imported, cursor: 0, project: currentProjectV3({ ...imported, cursor: 0 }) };

    const reopened = openProjectV3(saveProjectV3(undone));
    expect(reopened).toMatchObject({ cursor: 0, operations: [{ type: "import-layer" }] });
    expect(collectMediaReferencesV3(reopened)).toContainEqual(media);
    const redone = { ...reopened, cursor: 1, project: currentProjectV3({ ...reopened, cursor: 1 }) };
    expect(redone.project).toMatchObject({ assets: [{ id: "image" }], legacyComposition: { layer: "imported" } });

    const branched = applyOperationV3(reopened, { version: 3, type: "set-metadata", field: "name", value: "Branched" });
    expect(branched.operations).toEqual([{ version: 3, type: "set-metadata", field: "name", value: "Branched" }]);
    expect(collectMediaReferencesV3(branched)).not.toContainEqual(media);
  });

  it("opens prior V3 files whose cursor already ends a truncated operation list", () => {
    const state = applyOperationV3(createProjectV3({ projectId: "legacy-history", metadata }), {
      version: 3,
      type: "set-metadata",
      field: "name",
      value: "Saved before durable redo",
    });
    const prior = JSON.parse(saveProjectV3(state)) as Record<string, unknown>;
    expect(prior).not.toHaveProperty("historyCursor");

    expect(openProjectV3(`${JSON.stringify(prior)}\n`)).toMatchObject({ cursor: 1, operations: state.operations });
  });

  it("keeps role documents independent and durable through undo, redo, and reopen", () => {
    const layer = (id: string, width: number, height: number) => ({
      id,
      name: id,
      visible: true,
      opacity: 65536,
      asset: { path: `assets/${id}.png`, sha256: id.padEnd(64, "0") },
      xQ16: 0,
      yQ16: 0,
      width,
      height,
      widthQ16: width * 65536,
      heightQ16: height * 65536,
      crop: { x: 0, y: 0, width, height },
    });
    let state = createProjectV3({ projectId: "documents", metadata, themeKind: "custom" });
    state = applyOperationV3(state, {
      version: 3,
      type: "edit-visual-document",
      role: "grid-cell",
      operation: { version: 2, type: "add-layer", screen: "top", layer: layer("grid", 64, 64) },
    });
    state = applyOperationV3(state, {
      version: 3,
      type: "edit-visual-document",
      role: "banner-cell",
      operation: { version: 2, type: "add-layer", screen: "top", layer: layer("banner", 256, 49) },
    });

    expect(state.project.visualDocuments).toMatchObject({
      "grid-cell": { width: 64, height: 64, layers: [{ id: "grid" }] },
      "banner-cell": { width: 256, height: 49, layers: [{ id: "banner" }] },
    });
    const undone = { ...state, cursor: 1, project: currentProjectV3({ ...state, cursor: 1 }) };
    expect(undone.project.visualDocuments?.["grid-cell"]?.layers).toHaveLength(1);
    expect(undone.project.visualDocuments?.["banner-cell"]).toBeUndefined();
    const reopened = openProjectV3(saveProjectV3(undone));
    const redone = { ...reopened, cursor: 2, project: currentProjectV3({ ...reopened, cursor: 2 }) };
    expect(redone.project.visualDocuments?.["banner-cell"]?.layers).toHaveLength(1);
  });

  it("rejects unknown roles in direct and persisted V3 operations", () => {
    const state = createProjectV3({ projectId: "roles", metadata });
    expect(() =>
      applyOperationV3(state, {
        version: 3,
        type: "assign-role",
        role: "not-a-role",
        mediaSha256: "a".repeat(64),
      } as never),
    ).toThrow("Invalid V3 operation");

    const persisted = JSON.parse(saveProjectV3(state)) as { operations: unknown[]; cursor: number };
    persisted.operations.push({
      version: 3,
      type: "edit-visual-document",
      role: "not-a-role",
      operation: { version: 2, type: "remove-layer", screen: "top", layerId: "layer" },
    });
    persisted.cursor = 1;
    expect(() => openProjectV3(`${JSON.stringify(persisted)}\n`)).toThrow("strict V3 validation");

    const malformedProject = JSON.parse(saveProjectV3(state)) as {
      initial: { roleAssignments: Record<string, string> };
    };
    malformedProject.initial.roleAssignments["not-a-role"] = "a".repeat(64);
    expect(() => openProjectV3(`${JSON.stringify(malformedProject)}\n`)).toThrow("strict V3 validation");
  });

  it("rejects unknown required roles during direct V3 construction", () => {
    expect(() =>
      createProjectV3({ projectId: "invalid-required-role", metadata, requiredRoles: ["not-a-role"] as never }),
    ).toThrow("V3 project input is not canonical");
  });
});
