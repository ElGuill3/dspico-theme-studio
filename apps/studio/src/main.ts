import { app, BrowserWindow, dialog, ipcMain, net, protocol } from "electron";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compileThemeExport, validateTheme } from "../../../packages/dspico-contract/src/index.js";
import type { MaterialProjectV1, ProjectStateV1 } from "../../../packages/theme-core/src/index.js";
import { ProjectFileSession } from "./project-file-session.js";
import {
  isStudioUrl,
  isTrustedStudioUrl,
  selectStudioRendererUrl,
  STUDIO_CHANNEL,
  WINDOW_SECURITY,
} from "./security.js";
import type { StudioDependencies } from "./studio-ipc.js";

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

const projectFiles = new ProjectFileSession(chooseProject, async (root) => {
  const { ProjectStore } = await import("./project-store.js");
  return ProjectStore.openRoot(root);
});

const dependencies: StudioDependencies = {
  open: () => projectFiles.open(),
  save: (state: ProjectStateV1, options) => projectFiles.save(state, options),
  validate: (project: MaterialProjectV1) =>
    validateTheme(
      { type: "material", darkTheme: false, ...project.metadata, ...project.tokens },
      project.acknowledgments,
    ),
  export: async (project: MaterialProjectV1) => {
    const result = e2eRoot
      ? { canceled: false, filePaths: [path.join(e2eRoot, "export")] }
      : await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
    if (result.canceled || !result.filePaths[0]) throw new Error("Export cancelled");
    const theme = { type: "material", darkTheme: false, ...project.metadata, ...project.tokens };
    const plan = compileThemeExport(theme, project.acknowledgments);
    const { AtomicExportWriter } = await import("./export-writer.js");
    const writer = await AtomicExportWriter.openRoot(result.filePaths[0]);
    await writer.commitBundle("theme", plan.files, "theme.zip", plan.zipBytes);
    return {
      destination: result.filePaths[0],
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
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedStudioUrl(url, rendererOrigin)) event.preventDefault();
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
