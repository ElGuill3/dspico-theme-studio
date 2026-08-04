import { describe, expect, it } from "vitest";
import { createProject, currentProject, type ProjectStateV1 } from "../../../packages/theme-core/src/index.js";
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
const event = {
  sender: { id: 7, session: { id: "session" }, mainFrame: { url: "app://studio/index.html" } },
  senderFrame: { url: "app://studio/index.html" },
};
event.senderFrame = event.sender.mainFrame;

// prettier-ignore
const trusted = { webContents: event.sender, session: event.sender.session, origin: "app://studio" } as const;
const dependencies = (calls: string[]): StudioDependencies => ({
  open: async () => ({
    state: createProject({ projectId: "opened", metadata, targetProfileId: "dspico-launcher-v1" }),
    orphans: [],
  }),
  save: async () => void calls.push("store:atomic-commit"),
  validate: () => ({ diagnostics: [], canExport: true }),
  export: async () => ({ destination: "theme.json", files: ["theme.json"], reportSha256: "report", zipSha256: "zip" }),
});

describe("secure studio IPC sequences", () => {
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
});
