import { describe, expect, it } from "vitest";
// prettier-ignore
import { createProject, createProjectV2, currentProject, type CommittedStateV2, type ProjectStateV1 } from "../../../packages/theme-core/src/index.js";
// prettier-ignore
import {
  createStudioApi,
  createStudioHandler,
  isStudioUrl,
  isTrustedStudioUrl,
  selectStudioRendererUrl,
  WINDOW_SECURITY,
  type StudioDependencies,
} from "./studio-ipc.js";

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
  originalName: "a.png",
  width: 32,
  height: 24,
  pixels: new Uint8Array(32 * 24 * 4),
  normalizationPolicy: "rgba8-straight-top-left-v1" as const,
  provenance: { ...importInput, originalName: "a.png" },
  referenceOnly: false,
};
const event = {
  sender: { id: 7, session: { id: "session" }, mainFrame: { url: "app://studio/index.html" } },
  senderFrame: { url: "app://studio/index.html" },
};
event.senderFrame = event.sender.mainFrame;

// prettier-ignore
const trusted = { webContents: event.sender, session: event.sender.session, origin: "app://studio" } as const;
const dependencies = (calls: string[]): StudioDependencies => ({
  importPng: async () => importedPng,
  open: async () => ({
    state: createProject({ projectId: "opened", metadata, targetProfileId: "dspico-launcher-v1" }),
    orphans: [],
  }),
  openCustom: async () => ({
    state: createProjectV2({ projectId: "custom", metadata, themeKind: "custom" }),
    orphans: [],
  }),
  save: async () => void calls.push("store:atomic-commit"),
  saveCustom: async () => void calls.push("store:atomic-custom-commit"),
  validate: () => ({ diagnostics: [], canExport: true }),
  validateCustom: () => ({ diagnostics: [], canExport: false }),
  export: async () => ({ destination: "theme.json", files: ["theme.json"], reportSha256: "report", zipSha256: "zip" }),
  exportCustom: async () => ({
    destination: "custom",
    files: ["topbg.bin"],
    reportSha256: "custom-report",
    zipSha256: "custom-zip",
  }),
});

describe("secure studio IPC sequences", () => {
  it("persists one V2 layer move across reopen, Undo, and Redo", async () => {
    let saved: CommittedStateV2 | undefined;
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

  it("runs validation before the writer and returns a receipt", async () => {
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
        return { destination: "theme.json", files: ["theme.json"], reportSha256: "report", zipSha256: "zip" };
      },
    };
    const handler = createStudioHandler(trusted, adapter);
    const api = createStudioApi((_channel, request) => handler(event, request));
    await api.create({ projectId: "local", metadata });
    calls.length = 0;

    expect(await api.export()).toMatchObject({ receipt: { destination: "theme.json" } });
    expect(calls).toEqual(["contract:validate", "writer:commit"]);
  });

  it("returns pure Custom diagnostics and routes Custom export separately from Material", async () => {
    const calls: string[] = [];
    const adapter: StudioDependencies = {
      ...dependencies([]),
      validateCustom: () => {
        calls.push("contract:validate-custom");
        return { diagnostics: [], canExport: false };
      },
      exportCustom: async () => {
        calls.push("contract:export-custom");
        return { destination: "custom", files: ["topbg.bin"], reportSha256: "report", zipSha256: "zip" };
      },
    };
    const handler = createStudioHandler(trusted, adapter);
    const api = createStudioApi((_channel, request) => handler(event, request));
    await api.createCustom({ projectId: "custom", metadata });

    expect(await api.validate()).toMatchObject({ customProject: { themeKind: "custom" }, canExport: false });
    expect(await api.export()).toMatchObject({ receipt: { destination: "custom", files: ["topbg.bin"] } });
    expect(calls).toEqual(["contract:validate-custom", "contract:validate-custom", "contract:export-custom"]);
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
