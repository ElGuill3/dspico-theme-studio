import { app, BrowserWindow, dialog, ipcMain, net, protocol } from "electron";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  compileThemeExport,
  compileCustomThemeExportV1,
  validateTheme,
  validateThemeProjectV2,
} from "../../../packages/dspico-contract/src/index.js";
import type {
  CommittedStateV2,
  MaterialProjectV1,
  ProjectStateV1,
  ThemeProjectV2,
} from "../../../packages/theme-core/src/index.js";
import { createCustomRenderPlan } from "../../../packages/theme-core/src/render-plan-v2.js";
import { ProjectFileSession } from "./project-file-session.js";
import {
  isStudioUrl,
  isTrustedStudioUrl,
  selectStudioRendererUrl,
  STUDIO_CHANNEL,
  WINDOW_SECURITY,
} from "./security.js";
import type { StudioDependencies } from "./studio-ipc.js";
import { importPng as decodePng, MAX_SOURCE_BYTES, type ImportedPngV1 } from "./png-import.js";
import type { PortableProjectStore } from "./portable-project-store.js";

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const e2eRoot = process.env.DSPICO_STUDIO_E2E_ROOT ? path.resolve(process.env.DSPICO_STUDIO_E2E_ROOT) : undefined;
const viteDevServerUrl =
  typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === "string" ? MAIN_WINDOW_VITE_DEV_SERVER_URL : undefined;
const rendererUrl = selectStudioRendererUrl(viteDevServerUrl, Boolean(e2eRoot));
const rendererOrigin = rendererUrl.startsWith("app://") ? "app://studio" : new URL(rendererUrl).origin;
if (e2eRoot) app.disableHardwareAcceleration();

const chooseProject = async (mode: "open" | "save"): Promise<string> => {
  if (e2eRoot) return path.join(e2eRoot, "project.json");
  if (mode === "open") {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "DSpico project", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePaths[0]) throw new Error("Project selection cancelled");
    return result.filePaths[0];
  }
  const result = await dialog.showSaveDialog({
    defaultPath: "project.json",
    filters: [{ name: "DSpico project", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) throw new Error("Project selection cancelled");
  return result.filePath;
};

const choosePng = async (): Promise<string> => {
  if (e2eRoot) return path.join(e2eRoot, "input.png");
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "PNG image", extensions: ["png"] }],
  });
  if (result.canceled || !result.filePaths[0]) throw new Error("PNG selection cancelled");
  return result.filePaths[0];
};

const projectFiles = new ProjectFileSession(chooseProject, async (root) => {
  const { ProjectStore } = await import("./project-store.js");
  return ProjectStore.openRoot(root);
});
const customAssets = new Map<string, { asset: ImportedPngV1; bytes: Uint8Array }>();
let customStore: PortableProjectStore | undefined;
// prettier-ignore
const openCustomStore = async (mode: "open" | "save") => {
  const projectPath = await chooseProject(mode); if (path.basename(projectPath) !== "project.json") throw new Error("Custom bundles require project.json at the root."); const { PortableProjectStore } = await import("./portable-project-store.js"); return PortableProjectStore.openRoot(path.dirname(projectPath));
};
const chooseExportRoot = async (): Promise<string> => {
  const result = e2eRoot
    ? { canceled: false, filePaths: [path.join(e2eRoot, "export")] }
    : await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  if (result.canceled || !result.filePaths[0]) throw new Error("Export cancelled");
  return result.filePaths[0];
};
const exportAuthorityRoot = async (): Promise<string> => {
  const root = e2eRoot
    ? path.join(e2eRoot, "private-export-recovery")
    : path.join(app.getPath("userData"), "export-recovery");
  await mkdir(root, { recursive: true, mode: 0o700 });
  return root;
};

const dependencies: StudioDependencies = {
  importPng: async (provenance) => {
    const sourcePath = await choosePng();
    const { size } = await stat(sourcePath);
    if (size > MAX_SOURCE_BYTES) throw new Error("PNG source size exceeds the published limit.");
    const bytes = await readFile(sourcePath);
    const asset = decodePng(new Uint8Array(bytes), { ...provenance, originalName: path.basename(sourcePath) });
    customAssets.set(asset.sourceSha256, { asset, bytes: new Uint8Array(bytes) });
    return asset;
  },
  // prettier-ignore
  openCustom: async () => { customAssets.clear(); customStore = await openCustomStore("open"); const opened = await customStore.open(); if (!opened.canEdit) throw new Error("Custom bundle is read-only because an asset is missing or corrupt."); return { state: opened.state, orphans: opened.orphans }; },
  open: () => projectFiles.open(),
  save: (state: ProjectStateV1, options) => projectFiles.save(state, options),
  saveCustom: async (state: CommittedStateV2, options) => {
    if (options?.newProject || !customStore) customStore = await openCustomStore("save");
    await customStore.save(
      state,
      [...customAssets].map(([sha256, value]) => ({ sha256, bytes: value.bytes })),
    );
  },
  validate: (project: MaterialProjectV1) =>
    validateTheme(
      { type: "material", darkTheme: false, ...project.metadata, ...project.tokens },
      project.acknowledgments,
    ),
  validateCustom: (project: ThemeProjectV2) => validateThemeProjectV2(project, project.acknowledgments),
  exportCustom: async (project: ThemeProjectV2) => {
    if (!customStore) throw new Error("Open or create a Custom project first");
    const records = [
      ...new Map(
        (project.assets as Omit<ImportedPngV1, "pixels">[]).map((record) => [record.sourceSha256, record]),
      ).values(),
    ];
    const sources = await Promise.all(
      records.map(async (record) => {
        const cached = customAssets.get(record.sourceSha256)?.asset;
        const asset = cached ?? decodePng(await customStore!.readAsset(record.sourceSha256), record.provenance);
        return {
          sourceSha256: asset.sourceSha256,
          width: asset.width,
          height: asset.height,
          normalizationPolicy: asset.normalizationPolicy,
          pixels: asset.pixels,
        };
      }),
    );
    const plan = compileCustomThemeExportV1(project, createCustomRenderPlan(project), sources, project.acknowledgments);
    const destination = await chooseExportRoot();
    const { AtomicExportWriter } = await import("./export-writer.js");
    await (
      await AtomicExportWriter.openRoot(destination, { authorityRoot: await exportAuthorityRoot() })
    ).commitBundle("theme", plan.files, "theme.zip", plan.zipBytes);
    return {
      destination,
      files: ["theme/theme.json", "theme/topbg.bin", "theme/bottombg.bin", "theme/report.json", "theme.zip"],
      reportSha256: plan.reportSha256,
      zipSha256: createHash("sha256").update(plan.zipBytes).digest("hex"),
    };
  },
  export: async (project: MaterialProjectV1) => {
    const destination = await chooseExportRoot();
    const theme = { type: "material", darkTheme: false, ...project.metadata, ...project.tokens };
    const plan = compileThemeExport(theme, project.acknowledgments);
    const { AtomicExportWriter } = await import("./export-writer.js");
    const writer = await AtomicExportWriter.openRoot(destination, { authorityRoot: await exportAuthorityRoot() });
    await writer.commitBundle("theme", plan.files, "theme.zip", plan.zipBytes);
    return {
      destination,
      files: ["theme/theme.json", "theme/report.json", "theme.zip"],
      reportSha256: plan.reportSha256,
      zipSha256: createHash("sha256").update(plan.zipBytes).digest("hex"),
    };
  },
};

const createWindow = async (): Promise<void> => {
  const { createStudioHandler } = await import("./studio-ipc.js");
  const window = new BrowserWindow({
    height: 768,
    show: !e2eRoot,
    width: 1180,
    webPreferences: { ...WINDOW_SECURITY, offscreen: Boolean(e2eRoot), preload: path.join(__dirname, "preload.js") },
  });
  window.webContents.session.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (details, callback) =>
    callback({ cancel: !isTrustedStudioUrl(details.url, rendererOrigin) }),
  );
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedStudioUrl(url, rendererOrigin)) event.preventDefault();
  });
  window.webContents.on("will-frame-navigate", (event) => {
    if (!isTrustedStudioUrl(event.url, rendererOrigin)) event.preventDefault();
  });
  window.webContents.on("will-redirect", (event) => {
    if (!isTrustedStudioUrl(event.url, rendererOrigin)) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  ipcMain.handle(
    STUDIO_CHANNEL,
    createStudioHandler(
      { webContents: window.webContents, session: window.webContents.session, origin: rendererOrigin },
      dependencies,
    ),
  );
  void window.loadURL(rendererUrl);
};

void app.whenReady().then(async () => {
  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    if (!isStudioUrl(request.url)) return new Response("Not found", { status: 404 });
    const file = path.join(
      __dirname,
      "../renderer/main_window",
      decodeURIComponent(url.pathname.slice(1) || "index.html"),
    );
    return net.fetch(pathToFileURL(file).toString());
  });
  if (process.argv.includes("--bootstrap-check")) {
    process.stdout.write("DSpico Theme Studio bootstrap ready\n");
    return void setTimeout(() => app.quit(), 500);
  }
  await createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
