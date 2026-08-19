import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
// prettier-ignore
import { createProject, createProjectV2, createProjectV3, createVisualDocumentV3, currentProject, currentProjectV3, type ProjectStateV1, type ProjectStateV3 } from "../../../packages/theme-core/src/index.js";
import { CUSTOM_VISUAL_ROLES_V1, customDiagnosticV1 } from "../../../packages/dspico-contract/src/index.js";
// prettier-ignore
import {
  createStudioApi,
  createStudioHandler,
  isStudioUrl,
  isTrustedStudioUrl,
  selectStudioRendererUrl,
  WINDOW_SECURITY,
  ProjectDialogCancelled,
  type StudioDependencies,
} from "./studio-ipc.js";
import { customAuthoringSnapshotV3 } from "./custom-authoring-v3.js";
import { importPng } from "./png-import.js";
import { PortableProjectStore } from "./portable-project-store.js";

const metadata = { name: "Material Blue", description: "An offline Material theme", author: "Ada" };
const importInput = {
  source: "https://example.test/a.png",
  author: "Ada",
  credit: "Ada",
  license: "CC-BY-4.0",
  terms: "Attribution required",
  notice: "Copyright Ada",
  intendedUse: "Custom theme background",
  rightsToExport: true,
} as const;
const importedPng = {
  sourceSha256: "a".repeat(64),
  sourceBytes: new Uint8Array([1, 2, 3]),
  originalName: "a.png",
  width: 32,
  height: 24,
  pixels: new Uint8Array(32 * 24 * 4),
  normalizationPolicy: "rgba8-straight-top-left-v1" as const,
  provenance: { ...importInput, originalName: "a.png" },
  referenceOnly: false,
};
const exportResult = (destination: string, files: string[] = []) => ({
  destination,
  files,
  reportSha256: "report",
  zipSha256: "zip",
  revealId: "latest-export",
  folderName: "theme" as const,
  zipName: "theme.zip" as const,
});
const event = {
  sender: { id: 7, session: { id: "session" }, mainFrame: { url: "app://studio/index.html" } },
  senderFrame: { url: "app://studio/index.html" },
};
event.senderFrame = event.sender.mainFrame;

// prettier-ignore
const trusted = { webContents: event.sender, session: event.sender.session, origin: "app://studio" } as const;
const customState = () =>
  createProjectV3({
    projectId: "custom",
    metadata,
    themeKind: "custom",
    legacyComposition: createProjectV2({ projectId: "custom", metadata, themeKind: "custom" }),
  });
const dependencies = (calls: string[]): StudioDependencies => ({
  importPng: async () => importedPng,
  open: async () => ({
    state: createProject({ projectId: "opened", metadata, targetProfileId: "dspico-launcher-v1" }),
    orphans: [],
  }),
  openCustom: async () => ({
    state: customState(),
    orphans: [],
  }),
  save: async () => void calls.push("store:atomic-commit"),
  saveCustom: async () => void calls.push("store:atomic-custom-commit"),
  hydrateCustom: async (project) => ({
    images: {},
    visualSources: {},
    visualDocuments: Object.fromEntries(
      CUSTOM_VISUAL_ROLES_V1.map((role) => [role, project.visualDocuments?.[role] ?? createVisualDocumentV3(role)]),
    ) as ReturnType<typeof customAuthoringSnapshotV3>["visualDocuments"],
    sounds: {},
  }),
  validate: () => ({ diagnostics: [], canExport: true }),
  validateCustom: () => ({ diagnostics: [], canExport: false }),
  export: async () => exportResult("theme.json", ["theme.json"]),
  exportCustom: async () => exportResult("custom", ["topbg.bin"]),
});

describe("secure studio IPC sequences", () => {
  it("opens either validated project type through one command and reports only the folder label", async () => {
    const handler = createStudioHandler(trusted, {
      ...dependencies([]),
      openProject: async () => ({ type: "custom", state: customState(), orphans: [], location: "my-theme" }),
    });
    const opened = await createStudioApi((_channel, request) => handler(event, request)).openProject();
    expect(opened).toMatchObject({ customProject: { themeKind: "custom" }, projectLocation: "my-theme" });
    expect(opened).not.toHaveProperty("project");
  });

  it("restores the active project exactly once when main authorizes recovery", async () => {
    let restoreRequested = true;
    const handler = createStudioHandler(trusted, {
      ...dependencies([]),
      consumeRecoveryRestore: () => {
        const requested = restoreRequested;
        restoreRequested = false;
        return requested;
      },
    });
    const api = createStudioApi((_channel, request) => handler(event, request));
    await api.open();
    await expect(api.restoreProject()).resolves.toMatchObject({ project: { projectId: "opened" } });
    await expect(api.restoreProject()).resolves.toEqual({ cancelled: true });
  });

  it("routes pre-migration restore through the production authority and clears the active state", async () => {
    let restored = 0;
    const handler = createStudioHandler(trusted, {
      ...dependencies([]),
      restorePreMigrationV3: async () => void (restored += 1),
    });
    const api = createStudioApi((_channel, request) => handler(event, request));
    await api.openCustom();
    await expect(api.restorePreMigrationV3()).resolves.toEqual({ restored: true });
    expect(restored).toBe(1);
    await expect(api.validate()).rejects.toThrow("Open or create a project first");
  });

  it("treats project dialog cancellation as a non-error and preserves the active project", async () => {
    const handler = createStudioHandler(trusted, {
      ...dependencies([]),
      save: async () => {
        throw new ProjectDialogCancelled();
      },
    });
    const api = createStudioApi((_channel, request) => handler(event, request));
    expect((await api.open()).project?.projectId).toBe("opened");
    await expect(api.create({ projectId: "replacement", metadata })).resolves.toEqual({ cancelled: true });
    expect((await api.validate()).project?.projectId).toBe("opened");
  });

  it("keeps the active project when unified opening rejects corrupt content", async () => {
    let attempts = 0;
    const handler = createStudioHandler(trusted, {
      ...dependencies([]),
      openProject: async () => {
        attempts += 1;
        if (attempts === 2)
          throw new Error("project.json is not valid JSON. Restore a valid project file and try again.");
        return {
          type: "material",
          state: createProject({ projectId: "safe", metadata, targetProfileId: "dspico-launcher-v1" }),
          orphans: [],
          location: "safe-folder",
        };
      },
    });
    const api = createStudioApi((_channel, request) => handler(event, request));
    expect((await api.openProject()).project?.projectId).toBe("safe");
    await expect(api.openProject()).rejects.toThrow("not valid JSON");
    expect((await api.validate()).project?.projectId).toBe("safe");
  });

  it("allows reveal by opaque latest-export identity but rejects renderer paths", async () => {
    const calls: unknown[] = [];
    const handler = createStudioHandler(trusted, {
      ...dependencies([]),
      revealExport: async (id, target) => void calls.push([id, target]),
    });
    const api = createStudioApi((_channel, request) => handler(event, request));
    await expect(api.revealExport("latest-export", "folder")).resolves.toEqual({ revealed: true });
    await expect(
      handler(event, { kind: "reveal-export", revealId: "latest-export", target: "folder", path: "/tmp/other" }),
    ).rejects.toThrow("Invalid IPC payload");
    expect(calls).toEqual([["latest-export", "folder"]]);
  });

  it("accepts dropped PNG bytes without exposing a renderer filesystem path", async () => {
    let direct: { originalName: string; sourceBytes: Uint8Array } | undefined;
    const handler = createStudioHandler(trusted, {
      ...dependencies([]),
      importPng: async (_provenance, input) => {
        direct = input;
        return importedPng;
      },
    });
    const api = createStudioApi((_channel, request) => handler(event, request));

    await api.createCustom({ projectId: "custom", metadata });
    await api.importPngBytes({ ...importInput, originalName: "drop.png", sourceBytes: new Uint8Array([8, 9]) });

    expect(direct).toEqual({ originalName: "drop.png", sourceBytes: new Uint8Array([8, 9]) });
  });

  it("rejects an untrusted visual intendedUse before import or persistence", async () => {
    let imported = false;
    const calls: string[] = [];
    const handler = createStudioHandler(trusted, {
      ...dependencies(calls),
      importPng: async () => {
        imported = true;
        return importedPng;
      },
    });
    const api = createStudioApi((_channel, request) => handler(event, request));
    await api.createCustom({ projectId: "custom", metadata });
    calls.length = 0;

    await expect(api.importPng({ ...importInput, intendedUse: "Custom visual role: not-a-role" })).rejects.toThrow(
      "Unknown Custom visual role",
    );
    expect(imported).toBe(false);
    expect(calls).toEqual([]);
  });

  it("rejects an invalid visual document role in a raw IPC operation", async () => {
    const handler = createStudioHandler(trusted, dependencies([]));
    await expect(
      handler(event, {
        kind: "edit-visual-document",
        role: "not-a-role",
        operation: { version: 2, type: "remove-layer", screen: "top", layerId: "layer" },
      }),
    ).rejects.toThrow("Invalid IPC payload");
  });

  it("rejects invalid shape kind, color, opacity, and geometry in raw IPC", async () => {
    const handler = createStudioHandler(trusted, dependencies([])),
      base = {
        kind: "shape",
        shape: "rectangle",
        fill: "#00ff00",
        id: "shape",
        name: "Shape",
        visible: true,
        opacity: 65536,
        xQ16: 0,
        yQ16: 0,
        widthQ16: 65536,
        heightQ16: 65536,
      };
    for (const layer of [
      { ...base, kind: "plugin" },
      { ...base, fill: "#FFFFFF" },
      { ...base, opacity: 65537 },
      { ...base, widthQ16: 0 },
      { ...base, xQ16: Number.NaN },
    ])
      await expect(
        handler(event, {
          kind: "edit-visual-document",
          role: "grid-cell",
          operation: { version: 3, type: "add-shape-layer", layer },
        }),
      ).rejects.toThrow("Invalid IPC payload");
  });

  it("rejects malformed text payloads at raw IPC", async () => {
    const handler = createStudioHandler(trusted, dependencies([])),
      base = {
        kind: "text",
        content: "Caption",
        fill: "#ffffff",
        scale: 1,
        alignment: "left",
        id: "text",
        name: "Text",
        visible: true,
        opacity: 65536,
        xQ16: 0,
        yQ16: 0,
        widthQ16: 20 * 65536,
        heightQ16: 8 * 65536,
      };
    for (const layer of [
      { ...base, content: "x".repeat(257) },
      { ...base, content: "bad\rcontrol" },
      { ...base, fill: "#FFFFFF" },
      { ...base, scale: 0 },
      { ...base, alignment: "justify" },
      { ...base, xQ16: Number.NaN },
      { ...base, extra: true },
    ])
      await expect(
        handler(event, {
          kind: "edit-visual-document",
          role: "banner-cell",
          operation: { version: 3, type: "add-text-layer", layer },
        }),
      ).rejects.toThrow("Invalid IPC payload");
  });

  it.each([45, -90, 360, null])("rejects invalid rotation %s in raw IPC", async (rotation) => {
    const handler = createStudioHandler(trusted, dependencies([]));
    await expect(
      handler(event, {
        kind: "edit-visual-document",
        role: "scrim",
        operation: { version: 3, type: "set-layer-rotation", layerId: "layer", rotation },
      }),
    ).rejects.toThrow("Invalid IPC payload");
  });

  it("persists one V2 layer move across reopen, Undo, and Redo", async () => {
    let saved: ProjectStateV3 | undefined;
    const adapter: StudioDependencies = {
      ...dependencies([]),
      openCustom: async () => ({ state: saved!, orphans: [] }),
      saveCustom: async (state) => void (saved = state),
    };
    const handler = createStudioHandler(trusted, adapter);
    const api = createStudioApi((_channel, request) => handler(event, request));
    await api.createCustom({ projectId: "custom", metadata });
    await api.importPng(importInput);
    const asset = { path: `assets/sha256/${"a".repeat(64)}.png`, sha256: "a".repeat(64) };
    // prettier-ignore
    const added = await api.editCustom({ version: 2, type: "add-layer", screen: "top", layer: { id: "layer-a", name: "Artwork", visible: true, opacity: 65536, asset, xQ16: 0, yQ16: 0, width: 32, height: 24, widthQ16: 32 * 65536, heightQ16: 24 * 65536, crop: { x: 0, y: 0, width: 32, height: 24 } } });
    expect(added.customProject?.assets).toContainEqual(
      expect.objectContaining({
        sourceSha256: asset.sha256,
        provenance: expect.objectContaining({ rightsToExport: true }),
      }),
    );
    await api.editCustom({
      version: 2,
      type: "move-layer",
      screen: "top",
      layerId: "layer-a",
      xQ16: 65536,
      yQ16: 131072,
    });
    await api.openCustom();
    expect((await api.undo()).customProject?.documents[0]?.layers[0]).toMatchObject({ xQ16: 0, yQ16: 0 });
    expect((await api.redo()).customProject?.documents[0]?.layers[0]).toMatchObject({ xQ16: 65536, yQ16: 131072 });
  });
  it("persists Custom metadata as one V3 operation across undo, redo, and reopen", async () => {
    let saved: ProjectStateV3 | undefined;
    const handler = createStudioHandler(trusted, {
      ...dependencies([]),
      openCustom: async () => ({ state: saved!, orphans: [] }),
      saveCustom: async (state) => void (saved = state),
    });
    const api = createStudioApi((_channel, request) => handler(event, request));
    await api.createCustom({ projectId: "custom", metadata });

    const edited = await api.setCustomMetadata("name", "Edited Custom");
    expect(saved?.operations).toEqual([{ version: 3, type: "set-metadata", field: "name", value: "Edited Custom" }]);
    expect(edited.customProject?.metadata.name).toBe("Edited Custom");
    expect((await api.undo()).customProject?.metadata.name).toBe(metadata.name);
    expect((await api.redo()).customProject?.metadata.name).toBe("Edited Custom");
    expect((await api.openCustom()).customProject?.metadata.name).toBe("Edited Custom");
  });

  it("serializes rapid Custom metadata undo and redo without losing history", async () => {
    let saved: ProjectStateV3 | undefined;
    const handler = createStudioHandler(trusted, {
      ...dependencies([]),
      saveCustom: async (state) => void (saved = state),
    });
    const api = createStudioApi((_channel, request) => handler(event, request));
    await api.createCustom({ projectId: "custom", metadata });
    for (let index = 0; index < 12; index += 1) await api.setCustomMetadata("name", `Custom ${index}`);
    await Promise.all(Array.from({ length: 12 }, () => api.undo()));
    expect(saved?.cursor).toBe(0);
    expect(saved?.project.metadata.name).toBe(metadata.name);
    await Promise.all(Array.from({ length: 12 }, () => api.redo()));
    expect(saved?.cursor).toBe(12);
    expect(saved?.project.metadata.name).toBe("Custom 11");
  });

  it("keeps unresolved recovery state read-only and returns the same blocker on validation", async () => {
    const calls: string[] = [],
      diagnostic = customDiagnosticV1(
        "bundle.v3-recovery-ambiguous",
        "bundle",
        ".studio/v3-journal.json",
        "Restore a backup copy and reopen it.",
      );
    const handler = createStudioHandler(trusted, {
      ...dependencies(calls),
      openCustom: async () => ({
        state: customState(),
        orphans: [".studio/v3-journal.json"],
        diagnostics: [diagnostic],
        canEdit: false,
      }),
    });
    const api = createStudioApi((_channel, request) => handler(event, request));
    const opened = await api.openCustom();
    expect(opened).toMatchObject({ canEdit: false, canExport: false, diagnostics: [diagnostic] });
    const edit = await api.setCustomMetadata("name", "Must not save");
    expect(edit.diagnostics).toEqual([diagnostic]);
    expect((await api.validate()).diagnostics).toEqual([diagnostic]);
    expect(calls).toEqual([]);
  });

  it.each([
    { kind: "set-custom-metadata", field: "unknown", value: "Value" },
    { kind: "set-custom-metadata", field: "name", value: " padded" },
    { kind: "set-custom-metadata", field: "author", value: "bad\u0000author" },
    { kind: "set-custom-metadata", field: "description", value: "x".repeat(1025) },
    { kind: "set-custom-metadata", field: "name", value: "😀".repeat(129) },
    { kind: "set-custom-metadata", field: "name", value: "Value", extra: true },
  ])("rejects invalid Custom metadata IPC payload %j", async (request) => {
    const handler = createStudioHandler(trusted, dependencies([]));
    await expect(handler(event, request)).rejects.toThrow("Invalid IPC payload");
  });
  it("imports media and its layer as one undoable V3 history entry", async () => {
    let saved: ProjectStateV3 | undefined;
    const handler = createStudioHandler(trusted, {
      ...dependencies([]),
      saveCustom: async (state) => void (saved = state),
    });
    const api = createStudioApi((_channel, request) => handler(event, request));
    await api.createCustom({ projectId: "custom", metadata });
    await api.importPng(importInput);
    const asset = { path: `assets/sha256/${"a".repeat(64)}.png`, sha256: "a".repeat(64) };

    // prettier-ignore
    await api.editCustom({ version: 2, type: "add-layer", screen: "top", layer: { id: "layer-a", name: "Artwork", visible: true, opacity: 65536, asset, xQ16: 0, yQ16: 0, width: 32, height: 24, widthQ16: 32 * 65536, heightQ16: 24 * 65536, crop: { x: 0, y: 0, width: 32, height: 24 } } });

    expect(saved?.operations).toHaveLength(1);
    expect(saved?.operations[0]?.type).toBe("import-layer");
    expect(currentProjectV3(saved!).assets).toHaveLength(1);
    const undone = await api.undo();
    expect(undone.customProject?.documents[0]?.layers).toEqual([]);
    expect(currentProjectV3(saved!).assets).toEqual([]);
    expect((await api.redo()).customProject?.documents[0]?.layers).toHaveLength(1);
  });

  it("persists an imported role document layer as one isolated V3 history entry", async () => {
    let saved: ProjectStateV3 | undefined;
    const handler = createStudioHandler(trusted, {
      ...dependencies([]),
      saveCustom: async (state) => void (saved = state),
    });
    const api = createStudioApi((_channel, request) => handler(event, request));
    await api.createCustom({ projectId: "custom", metadata });
    await api.importPng(importInput);
    const asset = { path: `assets/sha256/${"a".repeat(64)}.png`, sha256: "a".repeat(64) };
    // prettier-ignore
    const added = await api.editVisualDocument("grid-cell", { version: 2, type: "add-layer", screen: "top", layer: { id: "grid-layer", name: "Grid", visible: true, opacity: 65536, asset, xQ16: 0, yQ16: 0, width: 32, height: 24, widthQ16: 32 * 65536, heightQ16: 24 * 65536, crop: { x: 0, y: 0, width: 32, height: 24 } } });

    expect(saved?.operations).toHaveLength(1);
    expect(saved?.operations[0]).toMatchObject({ type: "import-visual-layer", role: "grid-cell" });
    expect(added.customAuthoring?.visualDocuments["grid-cell"].layers).toHaveLength(1);
    expect(added.customAuthoring?.visualDocuments["banner-cell"].layers).toEqual([]);
    expect((await api.undo()).customAuthoring?.visualDocuments["grid-cell"].layers).toEqual([]);
    expect((await api.redo()).customAuthoring?.visualDocuments["grid-cell"].layers).toHaveLength(1);
  });

  it("persists one native shape operation across undo, redo, and reopen", async () => {
    let saved: ProjectStateV3 | undefined;
    const handler = createStudioHandler(trusted, {
      ...dependencies([]),
      openCustom: async () => ({ state: saved!, orphans: [] }),
      saveCustom: async (state) => void (saved = state),
    });
    const api = createStudioApi((_channel, request) => handler(event, request));
    await api.createCustom({ projectId: "custom", metadata });
    const added = await api.editVisualDocument("scrim", {
      version: 3,
      type: "add-shape-layer",
      layer: {
        kind: "shape",
        shape: "ellipse",
        fill: "#00ff00",
        id: "shape",
        name: "Ellipse",
        visible: true,
        opacity: 32768,
        xQ16: 0,
        yQ16: 0,
        widthQ16: 8 * 65536,
        heightQ16: 42 * 65536,
      },
    });

    expect(saved?.operations).toHaveLength(1);
    expect(added.customAuthoring?.visualDocuments.scrim.layers[0]).toMatchObject({
      kind: "shape",
      fill: "#00ff00",
    });
    expect((await api.undo()).customAuthoring?.visualDocuments.scrim.layers).toEqual([]);
    expect((await api.redo()).customAuthoring?.visualDocuments.scrim.layers).toHaveLength(1);
    expect((await api.openCustom()).customAuthoring?.visualDocuments.scrim.layers[0]).toMatchObject({
      kind: "shape",
      opacity: 32768,
    });
    const rotated = await api.editVisualDocument("scrim", {
      version: 3,
      type: "set-layer-rotation",
      layerId: "shape",
      rotation: 90,
    });
    expect(rotated.customAuthoring?.visualDocuments.scrim.layers[0]).toMatchObject({ rotation: 90 });
    expect((await api.undo()).customAuthoring?.visualDocuments.scrim.layers[0]).not.toHaveProperty("rotation");
    expect((await api.redo()).customAuthoring?.visualDocuments.scrim.layers[0]).toMatchObject({ rotation: 90 });
    expect((await api.openCustom()).customAuthoring?.visualDocuments.scrim.layers[0]).toMatchObject({ rotation: 90 });
  });

  it("persists text edits across undo, redo, and reopen", async () => {
    let saved: ProjectStateV3 | undefined;
    const handler = createStudioHandler(trusted, {
      ...dependencies([]),
      openCustom: async () => ({ state: saved!, orphans: [] }),
      saveCustom: async (state) => void (saved = state),
    });
    const api = createStudioApi((_channel, request) => handler(event, request));
    await api.createCustom({ projectId: "custom", metadata });
    await api.editVisualDocument("banner-cell", {
      version: 3,
      type: "add-text-layer",
      layer: {
        kind: "text",
        content: "Caption",
        fill: "#ffffff",
        scale: 1,
        alignment: "left",
        id: "text",
        name: "Text",
        visible: true,
        opacity: 65536,
        xQ16: 0,
        yQ16: 0,
        widthQ16: 40 * 65536,
        heightQ16: 16 * 65536,
      },
    });
    await api.editVisualDocument("banner-cell", {
      version: 3,
      type: "set-text-properties",
      layerId: "text",
      content: "Edited\n😀",
      fill: "#123456",
      scale: 2,
      alignment: "right",
    });
    expect((await api.undo()).customAuthoring?.visualDocuments["banner-cell"].layers[0]).toMatchObject({
      content: "Caption",
      alignment: "left",
    });
    expect((await api.redo()).customAuthoring?.visualDocuments["banner-cell"].layers[0]).toMatchObject({
      content: "Edited\n😀",
      fill: "#123456",
      scale: 2,
      alignment: "right",
    });
    expect((await api.openCustom()).customAuthoring?.visualDocuments["banner-cell"].layers[0]).toMatchObject({
      content: "Edited\n😀",
    });
  });

  it("hydrates redo media after reopening a saved undone project", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dspico-studio-ipc-"));
    const store = await PortableProjectStore.openRoot(root);
    try {
      const sourceBytes = new Uint8Array(
        await readFile(
          path.join(process.cwd(), "apps/studio/src/renderer/assets/launcher-preview/banner-list-top.png"),
        ),
      );
      const imported = importPng(sourceBytes, { ...importInput, originalName: "banner-list-top.png" });
      let media = new Map<string, Uint8Array>();
      const handler = createStudioHandler(trusted, {
        ...dependencies([]),
        importPng: async () => imported,
        saveCustom: async (state, _options, sources = []) => {
          for (const source of sources) media.set(source.sha256, source.bytes);
          await store.saveV3(state, sources);
        },
        openCustom: async () => {
          const opened = await store.openV3();
          media = opened.media;
          return { state: opened.state, orphans: opened.orphans };
        },
        hydrateCustom: async (project) => customAuthoringSnapshotV3(project, media),
      });
      const api = createStudioApi((_channel, request) => handler(event, request));

      await api.createCustom({ projectId: "custom", metadata });
      await api.importPng(importInput);
      const asset = { path: `assets/sha256/${imported.sourceSha256}.png`, sha256: imported.sourceSha256 };
      // prettier-ignore
      await api.editCustom({ version: 2, type: "add-layer", screen: "top", layer: { id: "layer-a", name: "Artwork", visible: true, opacity: 65536, asset, xQ16: 0, yQ16: 0, width: imported.width, height: imported.height, widthQ16: imported.width * 65536, heightQ16: imported.height * 65536, crop: { x: 0, y: 0, width: imported.width, height: imported.height } } });
      await api.undo();
      await api.save();

      const reopened = await api.openCustom();
      expect(reopened.customProject?.documents[0]?.layers).toEqual([]);
      expect(reopened.customAuthoring?.images).toEqual({});
      const redone = await api.redo();
      expect(redone.customProject?.documents[0]?.layers).toHaveLength(1);
      expect(redone.customAuthoring?.images[imported.sourceSha256]).toMatchObject({
        sourceSha256: imported.sourceSha256,
      });
    } finally {
      await store.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("clears imported asset approvals when switching projects", async () => {
    const handler = createStudioHandler(trusted, dependencies([]));
    const api = createStudioApi((_channel, request) => handler(event, request));
    await api.createCustom({ projectId: "project-a", metadata });
    await api.importPng(importInput);
    await api.createCustom({ projectId: "project-b", metadata });
    const asset = { path: `assets/sha256/${"a".repeat(64)}.png`, sha256: "a".repeat(64) };

    await expect(
      // prettier-ignore
      api.editCustom({ version: 2, type: "add-layer", screen: "top", layer: { id: "layer-a", name: "Artwork", visible: true, opacity: 65536, asset, xQ16: 0, yQ16: 0, width: 32, height: 24, widthQ16: 32 * 65536, heightQ16: 24 * 65536, crop: { x: 0, y: 0, width: 32, height: 24 } } }),
    ).rejects.toThrow("not approved");
  });
  it("locks down the renderer window and accepts only the studio application origin", () => {
    expect(WINDOW_SECURITY).toEqual({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    });
    expect(isStudioUrl("app://studio/index.html")).toBe(true);
    for (const url of ["https://x", "file:///x", "app://evil/x", "app://studio/%2e%2e%2fx"])
      expect(isStudioUrl(url)).toBe(false);
  });
  it("uses the Forge development server without weakening the renderer origin boundary", () => {
    const devServerUrl = "http://localhost:5173";

    expect(selectStudioRendererUrl(devServerUrl, false)).toBe(devServerUrl);
    expect(selectStudioRendererUrl(devServerUrl, true)).toBe("app://studio/index.html");
    expect(selectStudioRendererUrl(undefined, false)).toBe("app://studio/index.html");
    expect(isTrustedStudioUrl("http://localhost:5173/index.html", devServerUrl)).toBe(true);
    expect(isTrustedStudioUrl("http://localhost:5174/index.html", devServerUrl)).toBe(false);
    expect(isTrustedStudioUrl("https://evil.example/index.html", devServerUrl)).toBe(false);
  });
  it("runs renderer through preload, trust validation, core, and atomic store before returning", async () => {
    const calls: string[] = [];
    const handler = createStudioHandler(trusted, dependencies(calls), () => calls.push("main:validate"));
    const api = createStudioApi(async (_channel, request) => {
      calls.push("preload:invoke");
      const result = await handler(event, request);
      calls.push("preload:return");
      return result;
    });

    await api.create({ projectId: "local", metadata });
    calls.push("renderer:edit");
    await api.edit({ version: 1, type: "set-token", key: "darkTheme", value: false });

    // prettier-ignore
    expect(calls).toEqual(["preload:invoke", "main:validate", "store:atomic-commit", "preload:return", "renderer:edit", "preload:invoke", "main:validate", "store:atomic-commit", "preload:return"]);
  });

  it("runs validation before the writer and returns a publication summary", async () => {
    const calls: string[] = [];
    const adapter: StudioDependencies = {
      ...dependencies([]),
      save: async () => undefined,
      validate: () => {
        calls.push("contract:validate");
        return { diagnostics: [], canExport: true };
      },
      export: async () => {
        calls.push("writer:commit");
        return exportResult("theme.json", ["theme.json"]);
      },
    };
    const handler = createStudioHandler(trusted, adapter);
    const api = createStudioApi((_channel, request) => handler(event, request));
    await api.create({ projectId: "local", metadata });
    calls.length = 0;

    expect(await api.export()).toMatchObject({ publication: { destination: "theme.json" } });
    expect(calls).toEqual(["contract:validate", "writer:commit"]);
  });

  it("rejects a publication target that does not match the committed project kind", async () => {
    const calls: string[] = [];
    const handler = createStudioHandler(trusted, {
      ...dependencies(calls),
      export: async () => {
        calls.push("writer:material");
        return exportResult("theme");
      },
    });
    const api = createStudioApi((_channel, request) => handler(event, request));
    await api.create({ projectId: "local", metadata });
    calls.length = 0;

    await expect(api.export("custom")).rejects.toThrow("target");
    expect(calls).toEqual([]);
  });

  it("blocks incomplete Custom export after readiness validation and before publication", async () => {
    const calls: string[] = [];
    const adapter: StudioDependencies = {
      ...dependencies([]),
      validateCustom: () => {
        calls.push("contract:validate-custom");
        return { diagnostics: [], canExport: false };
      },
      exportCustom: async () => {
        calls.push("writer:custom-commit");
        throw new Error("Custom writer must not be reached");
      },
    };
    const handler = createStudioHandler(trusted, adapter);
    const api = createStudioApi((_channel, request) => handler(event, request));
    await api.createCustom({ projectId: "custom", metadata });
    calls.length = 0;

    const preloadExport = api.export as (target?: "material" | "custom") => Promise<{
      canExport?: boolean;
      diagnostics?: { ruleId: string; message: string }[];
    }>;
    const validation = await api.validate();
    const blocked = await preloadExport("custom");
    expect(blocked).toMatchObject({
      canExport: false,
      diagnostics: [expect.objectContaining({ ruleId: "custom.export-blocked" })],
    });
    expect(blocked.diagnostics).toEqual(validation.diagnostics);
    expect(calls).toEqual(["contract:validate-custom", "contract:validate-custom"]);

    await expect(handler(event, { kind: "export" })).resolves.toMatchObject({
      customProject: { themeKind: "custom" },
      canExport: false,
      diagnostics: [expect.objectContaining({ ruleId: "custom.export-blocked" })],
    });
    expect(calls).toEqual(["contract:validate-custom", "contract:validate-custom", "contract:validate-custom"]);
  });

  it("routes a separate cartridge-test handoff and does not invoke publication", async () => {
    const calls: string[] = [];
    const adapter: StudioDependencies = {
      ...dependencies([]),
      handoffCustom: async () => {
        calls.push("writer:handoff");
        return { destination: "handoff", files: ["README.md"], label: "NOT READY — CARTRIDGE TEST ONLY", zip: false };
      },
      exportCustom: async () => {
        calls.push("writer:export");
        throw new Error("publication must remain separate");
      },
    };
    const handler = createStudioHandler(trusted, adapter);
    const api = createStudioApi((_channel, request) => handler(event, request));
    await api.createCustom({ projectId: "custom", metadata });
    calls.length = 0;
    await expect(api.handoff()).resolves.toMatchObject({ handoff: { zip: false } });
    expect(calls).toEqual(["writer:handoff"]);
  });

  it("publishes Custom only after the readiness gate passes", async () => {
    const calls: string[] = [];
    const adapter: StudioDependencies = {
      ...dependencies([]),
      validateCustom: () => {
        calls.push("contract:validate-custom");
        return { diagnostics: [], canExport: true };
      },
      exportCustom: async () => {
        calls.push("writer:custom-commit");
        return exportResult("custom", ["theme/theme.json"]);
      },
    };
    const handler = createStudioHandler(trusted, adapter);
    const api = createStudioApi((_channel, request) => handler(event, request));
    await api.createCustom({ projectId: "custom", metadata });
    calls.length = 0;

    await expect(api.export("custom")).resolves.toMatchObject({ publication: { destination: "custom" } });
    expect(calls).toEqual(["contract:validate-custom", "writer:custom-commit"]);
  });

  it("rejects renderer layer registration without a main-approved import", async () => {
    const handler = createStudioHandler(trusted, dependencies([]));
    const api = createStudioApi((_channel, request) => handler(event, request));
    await api.createCustom({ projectId: "custom", metadata });
    const asset = { path: `assets/sha256/${"a".repeat(64)}.png`, sha256: "a".repeat(64) };
    // prettier-ignore
    await expect(api.editCustom({ version: 2, type: "add-layer", screen: "top", layer: { id: "forged", name: "Forged", visible: true, opacity: 65536, asset, xQ16: 0, yQ16: 0, width: 32, height: 24, widthQ16: 32 * 65536, heightQ16: 24 * 65536, crop: { x: 0, y: 0, width: 32, height: 24 } } })).rejects.toThrow("main process");
  });

  it("routes only approved PNG metadata to the main-owned importer", async () => {
    let received: unknown;
    const adapter: StudioDependencies = {
      ...dependencies([]),
      importPng: async (input) => {
        received = input;
        throw new Error("test import boundary");
      },
    };
    const handler = createStudioHandler(trusted, adapter);
    const api = createStudioApi((_channel, request) => handler(event, request));
    await expect(
      api.importPng({
        source: "https://example.test/pixel.png",
        author: "Ada",
        credit: "Ada",
        license: "CC-BY-4.0",
        terms: "Attribution required",
        notice: "Copyright Ada",
        intendedUse: "Custom theme background",
        rightsToExport: true,
      }),
    ).rejects.toThrow("test import boundary");
    expect(received).toMatchObject({ source: "https://example.test/pixel.png", rightsToExport: true });
  });

  it("rejects a filesystem path nested in PNG provenance before dispatch", async () => {
    let called = false;
    // prettier-ignore
    const handler = createStudioHandler(trusted, { ...dependencies([]), importPng: async () => { called = true; throw new Error("import called"); } });
    // prettier-ignore
    const request = { kind: "import-png", provenance: { source: "/tmp/theme.png", author: "Ada", credit: "Ada", license: "CC-BY-4.0", terms: "Attribution required", notice: "Copyright Ada", intendedUse: "Custom theme background", rightsToExport: true } };
    await expect(handler(event, request)).rejects.toThrow("Invalid IPC payload");
    expect(called).toBe(false);
  });

  it("publishes a mutation only after its durable save succeeds", async () => {
    let rejectNextSave = false;
    const adapter: StudioDependencies = {
      ...dependencies([]),
      save: async () => {
        if (rejectNextSave) {
          rejectNextSave = false;
          throw new Error("simulated save failure");
        }
      },
    };
    const handler = createStudioHandler(trusted, adapter);
    const api = createStudioApi((_channel, request) => handler(event, request));

    await api.create({ projectId: "original", metadata });
    rejectNextSave = true;
    await expect(
      api.edit({ version: 1, type: "set-metadata", field: "name", value: "Uncommitted edit" }),
    ).rejects.toThrow("simulated save failure");

    expect((await api.validate()).project?.metadata.name).toBe(metadata.name);
  });

  it("persists a deterministic screen override for a project with no scenes", async () => {
    let saved: ProjectStateV1 | undefined;
    const adapter: StudioDependencies = {
      ...dependencies([]),
      save: async (state) => {
        saved = state;
      },
    };
    const handler = createStudioHandler(trusted, adapter);
    const api = createStudioApi((_channel, request) => handler(event, request));
    await api.create({ projectId: "empty", metadata });

    const result = await api.edit({
      version: 1,
      type: "set-scene-token",
      sceneId: "home:bottom",
      screen: "bottom",
      mode: "home",
      key: "background",
      value: "#224466",
    });

    expect(result.project?.scenes).toEqual([
      { id: "home:bottom", screen: "bottom", mode: "home", overrides: { background: "#224466" } },
    ]);
    expect(currentProject(saved!).scenes).toEqual(result.project?.scenes);
  });

  it("keeps create, undo, and redo state unchanged when their saves fail", async () => {
    let rejectNextSave = false;
    const adapter: StudioDependencies = {
      ...dependencies([]),
      save: async () => {
        if (rejectNextSave) {
          rejectNextSave = false;
          throw new Error("simulated save failure");
        }
      },
    };
    const handler = createStudioHandler(trusted, adapter);
    const api = createStudioApi((_channel, request) => handler(event, request));
    await api.create({ projectId: "original", metadata });
    await api.edit({ version: 1, type: "set-metadata", field: "name", value: "Committed edit" });

    rejectNextSave = true;
    await expect(
      api.create({ projectId: "replacement", metadata: { ...metadata, name: "Replacement" } }),
    ).rejects.toThrow("simulated save failure");
    expect((await api.validate()).project?.metadata.name).toBe("Committed edit");

    rejectNextSave = true;
    await expect(api.undo()).rejects.toThrow("simulated save failure");
    expect((await api.validate()).project?.metadata.name).toBe("Committed edit");

    await api.undo();
    rejectNextSave = true;
    await expect(api.redo()).rejects.toThrow("simulated save failure");
    expect((await api.validate()).project?.metadata.name).toBe(metadata.name);
  });

  it("serializes concurrent saves and derives each mutation from the last committed state", async () => {
    let activeSaves = 0;
    let maximumActiveSaves = 0;
    let releaseFirstEdit: (() => void) | undefined;
    const firstEditBlocked = new Promise<void>((resolve) => {
      releaseFirstEdit = resolve;
    });
    const savedNames: string[] = [];
    const adapter: StudioDependencies = {
      ...dependencies([]),
      save: async (state: ProjectStateV1) => {
        activeSaves += 1;
        maximumActiveSaves = Math.max(maximumActiveSaves, activeSaves);
        const name = currentProject(state).metadata.name;
        if (name === "First edit") await firstEditBlocked;
        savedNames.push(name);
        activeSaves -= 1;
      },
    };
    const handler = createStudioHandler(trusted, adapter);
    const api = createStudioApi((_channel, request) => handler(event, request));
    await api.create({ projectId: "original", metadata });

    const first = api.edit({ version: 1, type: "set-metadata", field: "name", value: "First edit" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = api.edit({ version: 1, type: "set-metadata", field: "author", value: "Second author" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(activeSaves).toBe(1);
    releaseFirstEdit?.();
    await Promise.all([first, second]);

    expect(maximumActiveSaves).toBe(1);
    expect(savedNames).toEqual([metadata.name, "First edit", "First edit"]);
    expect((await api.validate()).project?.metadata).toMatchObject({ name: "First edit", author: "Second author" });
  });

  it.each([
    { ...event, sender: { ...event.sender, id: 8 } },
    { ...event, senderFrame: { url: "app://studio/index.html" } },
    { ...event, sender: { ...event.sender, session: { id: "other" } } },
    { ...event, senderFrame: { url: "https://evil.example" } },
  ])("rejects an untrusted sender before dispatch", async (untrusted) => {
    const handler = createStudioHandler(trusted, {} as StudioDependencies);
    await expect(handler(untrusted, { kind: "open" })).rejects.toThrow("Untrusted IPC sender");
  });

  it.each([
    { kind: "open", path: "/tmp/project.json" },
    { kind: "open", url: "https://example.test/theme.png" },
    { kind: "open", converter: "png-to-bmp" },
    { kind: "import-png", path: "/tmp/theme.png" },
  ])("rejects renderer-supplied privileged primitive %j", async (request) => {
    const handler = createStudioHandler(trusted, dependencies([]));
    await expect(handler(event, request)).rejects.toThrow("Invalid IPC payload");
  });
});
