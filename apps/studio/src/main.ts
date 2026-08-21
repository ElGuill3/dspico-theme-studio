import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from "electron";
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  compileThemeExport,
  compositeProfileSha256V1,
  customDiagnosticV1,
  sha256,
  validateTheme,
} from "../../../packages/dspico-contract/src/index.js";
import { CODEC_POLICY_V1 } from "../../../packages/dspico-contract/src/codecs-v1-3.js";
import { LAUNCHER_V1_PROFILE } from "../../../packages/dspico-contract/src/profile-v1-3.js";
import {
  saveProject,
  saveProjectV3,
  type MaterialProjectV1,
  type ProjectStateV1,
  type ProjectStateV3,
  type ThemeProjectV3,
} from "../../../packages/theme-core/src/index.js";
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
import { AtomicHandoffWriter, HANDOFF_LABEL } from "./handoff-writer.js";
import {
  compileCustomPublicationV3,
  customAuthoringSnapshotV3,
  diagnoseCustomPublicationV3,
  type CustomAuthoringSnapshotV3,
} from "./custom-authoring-v3.js";
import { openProjectFolder, prepareNewProjectFolder, ProjectDialogCancelled } from "./project-folder.js";
import { ExportRevealCapability } from "./export-reveal.js";
import {
  CLOSE_DECISION_CHANNEL,
  CrashFrequency,
  DRAFT_STATE_CHANNEL,
  DraftCloseHandshake,
  LIFECYCLE_CHANNEL,
  safeErrorMessage,
  settleNativeAction,
  type CloseDraftAcknowledgement,
} from "./app-resilience.js";

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const e2eRoot = process.env.DSPICO_STUDIO_E2E_ROOT ? path.resolve(process.env.DSPICO_STUDIO_E2E_ROOT) : undefined;
const e2eSaveDelayMs = e2eRoot ? Math.max(0, Number(process.env.DSPICO_STUDIO_E2E_SAVE_DELAY_MS) || 0) : 0;
const e2eSaveDelayMarker = e2eRoot ? path.join(e2eRoot, ".dspico-e2e-delay-save") : undefined;
const e2eSaveBlockedMarker = e2eRoot ? path.join(e2eRoot, ".dspico-e2e-save-blocked") : undefined;
const viteDevServerUrl =
  typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === "string" ? MAIN_WINDOW_VITE_DEV_SERVER_URL : undefined;
const rendererUrl = selectStudioRendererUrl(viteDevServerUrl, Boolean(e2eRoot));
const rendererOrigin = rendererUrl.startsWith("app://") ? "app://studio" : new URL(rendererUrl).origin;
if (e2eRoot) app.disableHardwareAcceleration();

const chooseProjectRoot = async (mode: "open" | "create"): Promise<string | undefined> => {
  if (e2eRoot) {
    const simulated = await readFile(path.join(e2eRoot, "project-selection.txt"), "utf8").catch(() => e2eRoot);
    return simulated.trim() === "__CANCEL__" ? undefined : path.resolve(simulated.trim());
  }
  const result = await dialog.showOpenDialog({
    title: mode === "open" ? "Open project" : "Choose an empty project folder",
    properties:
      mode === "open" ? ["openFile", "openDirectory"] : ["openDirectory", "createDirectory", "promptToCreate"],
    ...(mode === "open" ? { filters: [{ name: "DSpico project", extensions: ["json"] }] } : {}),
  });
  return result.canceled ? undefined : result.filePaths[0];
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

const customAssets = new Map<string, { asset: ImportedPngV1; bytes: Uint8Array }>();
const customMedia = new Map<string, Uint8Array>();
let materialStore: import("./project-store.js").ProjectStore | undefined;
let customStore: PortableProjectStore | undefined;
let customAuthoringCache: CustomAuthoringSnapshotV3 | undefined;
let recoveryRestoreRequested = false;
const replaceProjectAuthority = async (
  candidate:
    | { type: "material"; store: import("./project-store.js").ProjectStore }
    | { type: "custom"; store: PortableProjectStore; media: Map<string, Uint8Array> },
) => {
  await Promise.allSettled([materialStore?.close(), customStore?.close()].filter(Boolean));
  materialStore = candidate.type === "material" ? candidate.store : undefined;
  customStore = candidate.type === "custom" ? candidate.store : undefined;
  customAssets.clear();
  customMedia.clear();
  customAuthoringCache = undefined;
  if (candidate.type === "custom") for (const [sha256, bytes] of candidate.media) customMedia.set(sha256, bytes);
  exportReveal.clear();
};
const openSelectedProject = async (expected?: "material" | "custom") => {
  const selected = await chooseProjectRoot("open");
  if (!selected) return undefined;
  const detected = await openProjectFolder(selected);
  if (expected && detected.type !== expected) {
    await detected.authority.close();
    throw new Error(
      `The selected project is ${detected.type === "material" ? "Material" : "Custom"}, not ${expected === "material" ? "Material" : "Custom"}. Use Open project.`,
    );
  }
  if (detected.type === "material") {
    const { ProjectStore } = await import("./project-store.js");
    const candidateStore = await ProjectStore.openAuthority(detected.authority);
    try {
      const opened = await candidateStore.open("project.json");
      return {
        type: "material" as const,
        ...opened,
        location: detected.label,
        commit: () => replaceProjectAuthority({ type: "material", store: candidateStore }),
        discard: () => candidateStore.close(),
      };
    } catch (error) {
      await candidateStore.close();
      throw error;
    }
  }
  const { PortableProjectStore } = await import("./portable-project-store.js");
  const candidateStore = await PortableProjectStore.openAuthority(detected.authority);
  try {
    const opened = await candidateStore.openV3();
    const media = new Map(opened.media);
    const customAuthoring = await customAuthoringSnapshotV3(opened.state.project, media);
    return {
      type: "custom" as const,
      state: opened.state,
      orphans: opened.orphans,
      canEdit: opened.canEdit,
      diagnostics: opened.diagnostics.map((item) =>
        customDiagnosticV1(
          `bundle.${item.code}`,
          "bundle",
          item.path,
          item.message,
          item.blocking ? "error" : "warning",
        ),
      ),
      customAuthoring,
      location: detected.label,
      commit: async () => {
        await replaceProjectAuthority({ type: "custom", store: candidateStore, media });
        customAuthoringCache = customAuthoring;
      },
      discard: () => candidateStore.close(),
    };
  } catch (error) {
    await candidateStore.close();
    throw error;
  }
};
const chooseExportRoot = async (): Promise<string> => {
  const result = e2eRoot
    ? { canceled: false, filePaths: [path.join(e2eRoot, "export")] }
    : await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  if (result.canceled || !result.filePaths[0]) throw new Error("Export cancelled");
  return result.filePaths[0];
};
const chooseHandoffRoot = async (): Promise<string> => {
  const result = e2eRoot
    ? { canceled: false, filePaths: [path.join(e2eRoot, "handoff")] }
    : await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  if (result.canceled || !result.filePaths[0]) throw new Error("Cartridge-test handoff cancelled");
  return result.filePaths[0];
};
const exportAuthorityRoot = async (): Promise<string> => {
  const root = e2eRoot
    ? path.join(e2eRoot, "private-export-recovery")
    : path.join(app.getPath("userData"), "export-recovery");
  await mkdir(root, { recursive: true, mode: 0o700 });
  return root;
};
const exportReveal = new ExportRevealCapability((candidate) => shell.showItemInFolder(candidate));
const revealExport = async (id: string, target: "folder" | "zip"): Promise<void> => {
  await exportReveal.reveal(id, target);
  if (e2eRoot)
    await appendFile(path.join(e2eRoot, "reveal.log"), `${target}:${target === "folder" ? "theme" : "theme.zip"}\n`);
};
const materialTheme = (project: MaterialProjectV1) => {
  return {
    type: "material",
    ...project.metadata,
    primaryColor: project.tokens.primaryColor,
    darkTheme: project.tokens.darkTheme,
  };
};
const customPublication = async (project: ThemeProjectV3, requireVisualReceipt = true) => {
  if (!customStore) throw new Error("Open or create a Custom project first");
  return compileCustomPublicationV3(project, customMedia, { requireVisualReceipt });
};

const publicationHandoffCustom = async (project: ThemeProjectV3) => {
  const publication = await customPublication(project, false);
  const files = publication.files.map((file) => ({
    path: file.path,
    sha256: sha256(file.bytes),
    bytes: file.bytes.length,
  }));
  const metadata = new TextEncoder().encode(
    `${JSON.stringify({ version: 1, label: HANDOFF_LABEL, ready: false, compatibilityClaimed: false, profile: { id: LAUNCHER_V1_PROFILE.profileId, commit: LAUNCHER_V1_PROFILE.launcherCommit, sha256: compositeProfileSha256V1() }, codecPolicy: CODEC_POLICY_V1, files, instructions: "Test these candidate bytes on the observed target and record the physical test results separately." })}\n`,
  );
  const instructions = new TextEncoder().encode(
    `${HANDOFF_LABEL}\nThis folder is a physical-test candidate only. It is not a ready export, ZIP, compatibility claim, or installation.\n`,
  );
  const destination = await chooseHandoffRoot();
  await mkdir(destination, { recursive: true });
  return (await AtomicHandoffWriter.openRoot(destination)).commit([
    { path: "README.md", bytes: instructions },
    { path: "handoff.json", bytes: metadata },
    ...publication.files,
  ]);
};

const dependencies: StudioDependencies = {
  consumeRecoveryRestore: () => {
    const requested = recoveryRestoreRequested;
    recoveryRestoreRequested = false;
    return requested;
  },
  importPng: async (provenance, direct) => {
    const sourcePath = direct ? undefined : await choosePng();
    const bytes = direct?.sourceBytes ?? new Uint8Array(await readFile(sourcePath!));
    if (bytes.byteLength > MAX_SOURCE_BYTES) throw new Error("PNG source size exceeds the published limit.");
    if (sourcePath && (await stat(sourcePath)).size !== bytes.byteLength)
      throw new Error("PNG source changed while reading.");
    const asset = decodePng(bytes, { ...provenance, originalName: direct?.originalName ?? path.basename(sourcePath!) });
    customAssets.set(asset.sourceSha256, { asset, bytes: new Uint8Array(bytes) });
    customMedia.set(asset.sourceSha256, new Uint8Array(bytes));
    return asset;
  },
  openProject: openSelectedProject,
  restorePreMigrationV3: async () => {
    if (!customStore) throw new Error("Open a migrated Custom project before restoring its pre-migration source.");
    const restored = customStore;
    await restored.restorePreMigrationV3();
    await restored.close();
    customStore = undefined;
    customAssets.clear();
    customMedia.clear();
    exportReveal.clear();
  },
  openCustom: async () => {
    const opened = await openSelectedProject("custom");
    if (!opened) throw new ProjectDialogCancelled();
    return opened as Extract<NonNullable<Awaited<ReturnType<typeof openSelectedProject>>>, { type: "custom" }>;
  },
  open: async () => {
    const opened = await openSelectedProject("material");
    if (!opened) throw new ProjectDialogCancelled();
    return opened as Extract<NonNullable<Awaited<ReturnType<typeof openSelectedProject>>>, { type: "material" }>;
  },
  save: async (state: ProjectStateV1, options) => {
    if (options?.newProject) {
      const selected = await chooseProjectRoot("create");
      if (!selected) throw new ProjectDialogCancelled();
      const project = await prepareNewProjectFolder(selected);
      const { ProjectStore } = await import("./project-store.js");
      try {
        await project.authority.claimProjectJson(Buffer.from(saveProject(state)));
        const candidate = await ProjectStore.openAuthority(project.authority);
        await candidate.open("project.json");
        await replaceProjectAuthority({ type: "material", store: candidate });
        return { location: project.label };
      } catch (error) {
        await project.authority.close().catch(() => undefined);
        throw error;
      }
    }
    if (!materialStore) throw new Error("Open or create a Material project first.");
    await materialStore.save("project.json", state);
  },
  saveCustom: async (state: ProjectStateV3, options, media = []) => {
    if (
      e2eSaveDelayMs &&
      e2eSaveDelayMarker &&
      e2eSaveBlockedMarker &&
      (await readFile(e2eSaveDelayMarker).then(
        () => true,
        () => false,
      ))
    )
      try {
        await writeFile(e2eSaveBlockedMarker, "visual save is blocked");
        const deadline = Date.now() + e2eSaveDelayMs;
        while (
          Date.now() < deadline &&
          (await readFile(e2eSaveDelayMarker).then(
            () => true,
            () => false,
          ))
        )
          await new Promise((resolve) => setTimeout(resolve, 10));
      } finally {
        await rm(e2eSaveBlockedMarker, { force: true });
      }
    if (options?.newProject) {
      const selected = await chooseProjectRoot("create");
      if (!selected) throw new ProjectDialogCancelled();
      const project = await prepareNewProjectFolder(selected);
      const { PortableProjectStore } = await import("./portable-project-store.js");
      try {
        await project.authority.claimProjectJson(Buffer.from(saveProjectV3(state)));
        const candidate = await PortableProjectStore.openAuthority(project.authority);
        await candidate.openV3();
        const nextMedia = new Map(media.map((item) => [item.sha256, item.bytes]));
        await candidate.saveV3(
          state,
          [...nextMedia].map(([sha256, bytes]) => ({ sha256, bytes })),
        );
        await replaceProjectAuthority({ type: "custom", store: candidate, media: nextMedia });
        return { location: project.label };
      } catch (error) {
        await project.authority.close().catch(() => undefined);
        throw error;
      }
    }
    if (!customStore) throw new Error("Open or create a Custom project first.");
    const nextMedia = new Map(customMedia);
    for (const item of media) nextMedia.set(item.sha256, item.bytes);
    await customStore.saveV3(
      state,
      [...nextMedia].map(([sha256, bytes]) => ({ sha256, bytes })),
    );
    customMedia.clear();
    for (const [sha256, bytes] of nextMedia) customMedia.set(sha256, bytes);
  },
  hydrateCustom: async (project) =>
    (customAuthoringCache = customAuthoringSnapshotV3(project, customMedia, customAuthoringCache)),
  validate: (project: MaterialProjectV1) => validateTheme(materialTheme(project), project.acknowledgments),
  validateCustom: async (project: ThemeProjectV3) => {
    const diagnostics = diagnoseCustomPublicationV3(project, customMedia);
    return { diagnostics, canExport: diagnostics.every(({ severity }) => severity !== "error") };
  },
  handoffCustom: publicationHandoffCustom,
  revealExport,
  exportCustom: async (project: ThemeProjectV3) => {
    const plan = await customPublication(project);
    const destination = await chooseExportRoot();
    const { AtomicExportWriter } = await import("./export-writer.js");
    await (
      await AtomicExportWriter.openRoot(destination, { authorityRoot: await exportAuthorityRoot() })
    ).commitBundle("theme", plan.files, "theme.zip", plan.zipBytes);
    const published = await exportReveal.publish(destination);
    return {
      destination,
      revealId: published.id,
      folderName: published.folderName,
      zipName: published.zipName,
      files: [
        "theme/theme.json",
        ...plan.files.filter(({ path }) => path !== "theme.json").map(({ path }) => `theme/${path}`),
        "theme.zip",
      ],
      reportSha256: plan.reportSha256,
      zipSha256: createHash("sha256").update(plan.zipBytes).digest("hex"),
    };
  },
  export: async (project: MaterialProjectV1) => {
    const destination = await chooseExportRoot();
    const theme = materialTheme(project);
    const plan = compileThemeExport(theme, project.acknowledgments);
    const { AtomicExportWriter } = await import("./export-writer.js");
    const writer = await AtomicExportWriter.openRoot(destination, { authorityRoot: await exportAuthorityRoot() });
    await writer.commitBundle("theme", plan.files, "theme.zip", plan.zipBytes);
    const published = await exportReveal.publish(destination);
    return {
      destination,
      revealId: published.id,
      folderName: published.folderName,
      zipName: published.zipName,
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
    minHeight: 640,
    minWidth: 320,
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
  const failures = new CrashFrequency();
  const close = new DraftCloseHandshake();
  let unresponsiveDialog = false;
  let recoveryDialog = false;
  const reloadOffer = async (message: string) => {
    if (recoveryDialog || !failures.record() || window.isDestroyed()) return;
    recoveryDialog = true;
    try {
      await settleNativeAction(
        dialog.showMessageBox(window, {
          type: "error",
          title: "Editor recovery",
          message,
          detail:
            "Committed changes are already saved. A field draft that had not committed may need to be entered again.",
          buttons: ["Reload editor", "Keep window open"],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        }),
        (choice) => {
          if (choice.response === 0 && !window.isDestroyed()) window.webContents.reload();
        },
        () => undefined,
      );
    } finally {
      recoveryDialog = false;
    }
  };
  window.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason !== "clean-exit") void reloadOffer("The editor stopped unexpectedly.");
  });
  window.webContents.on("unresponsive", () => {
    if (unresponsiveDialog) return;
    unresponsiveDialog = true;
    void reloadOffer("The editor is not responding.").finally(() => {
      unresponsiveDialog = false;
    });
  });
  window.webContents.on("responsive", () => {
    unresponsiveDialog = false;
  });
  window.webContents.on("did-fail-load", (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) void reloadOffer("The editor page could not be loaded.");
  });
  const trustedSender = (event: Electron.IpcMainEvent) => event.sender === window.webContents;
  ipcMain.on(DRAFT_STATE_CHANNEL, (event, dirty: unknown) => {
    if (trustedSender(event) && typeof dirty === "boolean") close.update(dirty);
  });
  const confirmDraftClose = (unresponsive = false) => {
    if (e2eRoot) {
      void settleNativeAction(
        readFile(path.join(e2eRoot, "close-decision.txt"), "utf8"),
        async (decision) => {
          const normalized = decision.trim();
          if (normalized !== "keep" && normalized !== "discard") throw new Error("Unknown close decision");
          await appendFile(path.join(e2eRoot, "close-decision.log"), `${normalized}\n`);
          if (normalized === "discard") {
            close.discard();
            window.close();
          } else close.keepEditing();
        },
        () => close.keepEditing(),
      );
      return;
    }
    void settleNativeAction(
      dialog.showMessageBox(window, {
        type: "warning",
        title: "Field draft not committed",
        message: unresponsive ? "The editor did not respond. Close anyway?" : "Close without this field draft?",
        detail: unresponsive
          ? "The editor could not confirm whether its active field draft committed. Committed project files remain saved."
          : "Committed project changes are saved. Only the active field draft may need to be entered again.",
        buttons: ["Keep editing", "Discard field draft and close"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      }),
      ({ response }) => {
        if (response === 1) {
          close.discard();
          window.close();
        } else close.keepEditing();
      },
      () => close.keepEditing(),
    );
  };
  ipcMain.on(CLOSE_DECISION_CHANNEL, (event, acknowledgement: unknown) => {
    if (!trustedSender(event) || !acknowledgement || typeof acknowledgement !== "object") return;
    const status = (acknowledgement as { status?: unknown }).status;
    if (status !== "committing" && status !== "clean" && status !== "invalid") return;
    const decision = close.acknowledge(status as CloseDraftAcknowledgement["status"]);
    if (decision === "close") return window.close();
    if (decision === "confirm") confirmDraftClose();
  });
  ipcMain.on(LIFECYCLE_CHANNEL, (event, request: unknown) => {
    if (!trustedSender(event) || !request || typeof request !== "object") return;
    const value = request as { type?: unknown; reopenProject?: unknown; draftDirty?: unknown };
    if (value.type === "close" && typeof value.draftDirty === "boolean") {
      close.update(value.draftDirty);
      if (e2eRoot && value.draftDirty) {
        confirmDraftClose();
        return;
      }
      return void setTimeout(() => window.close(), 0);
    }
    if (value.type === "reload" && typeof value.reopenProject === "boolean") {
      recoveryRestoreRequested = value.reopenProject;
      window.webContents.reload();
    }
  });
  window.on("close", (event) => {
    const decision = close.begin();
    if (decision === "close") return;
    event.preventDefault();
    if (decision === "prepare") {
      window.webContents.send(LIFECYCLE_CHANNEL, { type: "prepare-close" });
      setTimeout(() => {
        if (close.noResponse() === "unresponsive" && !window.isDestroyed()) confirmDraftClose(true);
      }, 1_500);
    }
  });
  const handler = createStudioHandler(
    { webContents: window.webContents, session: window.webContents.session, origin: rendererOrigin },
    dependencies,
  );
  ipcMain.handle(STUDIO_CHANNEL, async (event, request) => {
    try {
      return await handler(event, request);
    } catch (error) {
      throw new Error(safeErrorMessage(error));
    }
  });
  try {
    await window.loadURL(
      e2eRoot && process.env.DSPICO_STUDIO_E2E_ONBOARDING === "1" ? `${rendererUrl}?onboarding=1` : rendererUrl,
    );
  } catch (error) {
    await reloadOffer(safeErrorMessage(error));
  }
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
