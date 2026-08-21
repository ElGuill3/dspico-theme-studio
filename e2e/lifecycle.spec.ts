import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, truncate, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import { compositeCustomLayersV1 } from "../packages/dspico-contract/src/index.js";
import { launcherV1Fixture } from "../packages/test-fixtures/src/launcher-v1.js";
import { applyOperationV3, createProjectV2, createProjectV3 } from "../packages/theme-core/src/index.js";
import { PortableProjectStore } from "../apps/studio/src/portable-project-store.js";
import { closeElectronApp } from "../packages/test-fixtures/src/electron-app-close.js";
import { certifyCurrentVisual } from "./visual-receipt.js";
import { neutralPreviewPngV1, neutralPreviewPngVariantV1 } from "../packages/test-fixtures/src/neutral-preview-png.js";

test.describe.configure({ mode: "serial" });

type BrowserStudio = {
  edit(operation: { version: 1; type: "set-token"; key: string; value: unknown }): Promise<unknown>;
  setCustomMetadata(field: "name" | "description" | "author", value: string): Promise<unknown>;
  importPng(input: Record<string, string | boolean>): Promise<unknown>;
  export(target?: "material" | "custom"): Promise<{ canExport?: boolean; diagnostics?: unknown[] }>;
  open(): Promise<unknown>;
  openProject(): Promise<unknown>;
  restoreProject(): Promise<unknown>;
  revealExport(revealId: string, target: "folder" | "zip"): Promise<unknown>;
  validate(): Promise<{
    canExport?: boolean;
    diagnostics?: { fingerprint: string; location: { document: string; pointer: string }; message: string }[];
  }>;
  handoff(): Promise<{ handoff?: { zip?: boolean; files?: string[] } }>;
};

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
// prettier-ignore
const testWav = () => Buffer.from("524946462800000057415645666d742010000000010001002256000044ac00000200100064617461040000000000e803", "hex");
const projectName = (page: Page) => page.locator(".current-project");
const projectDrawer = (page: Page) => page.getByRole("dialog", { name: "Project" });
const openProjectDrawer = async (page: Page, tab: "Details" | "Assets" | "Audio" | "Export" = "Details") => {
  const drawer = projectDrawer(page);
  if (!(await drawer.isVisible())) await page.getByRole("button", { name: "Project", exact: true }).click();
  await drawer.getByRole("tab", { name: tab }).click();
  return drawer;
};
const closeProjectDrawer = async (page: Page) => {
  const drawer = projectDrawer(page);
  if (await drawer.isVisible()) await drawer.getByRole("button", { name: "Close Project drawer" }).click();
};
const showDockTab = async (page: Page, tab: "Layers" | "Properties" | "Preview") => {
  if ((await page.locator("#workspace-dock").count()) === 0)
    await page.getByRole("button", { name: "Open workspace dock" }).click();
  const dock = page.locator("#workspace-dock");
  await dock.getByRole("tab", { name: tab }).click();
  return dock;
};
const launcherCanvasEvidence = (page: Page) =>
  page.locator("[data-launcher-screen]").evaluateAll((canvases) =>
    canvases.map((canvas) => {
      const element = canvas as HTMLCanvasElement;
      const pixels = element.getContext("2d")!.getImageData(0, 0, 256, 192).data;
      let flat = true;
      for (let index = 4; index < pixels.length && flat; index += 4)
        flat =
          pixels[index] === pixels[0] &&
          pixels[index + 1] === pixels[1] &&
          pixels[index + 2] === pixels[2] &&
          pixels[index + 3] === pixels[3];
      return { width: element.width, height: element.height, flat };
    }),
  );
const createCustomFromChrome = async (page: Page) => {
  const menu = page.locator("details.new-menu > summary");
  if (await menu.count()) await menu.click();
  await page.getByRole("button", { name: "New Custom" }).click();
};
const closeOnboarding = async (page: Page) => {
  const onboarding = page.getByRole("dialog", { name: "Build a theme in seven documents" });
  if (await onboarding.isVisible()) await onboarding.getByRole("button", { name: "Close help" }).click();
};
const customState = async (root: string) => {
  const selected = await readFile(path.join(root, "project-selection.txt"), "utf8").catch(() => root);
  const state = JSON.parse(await readFile(path.join(selected.trim(), "project.json"), "utf8")) as {
    cursor: number;
    operations: { type?: string; role?: string; operation?: unknown }[];
  };
  const documentOperation = ({ type }: { type?: string }) =>
    type === "edit-visual-document" || type === "import-visual-layer";
  const documents = state.operations.filter(documentOperation);
  return {
    operations: documents.map(({ role, operation }) => ({
      role,
      ...(operation as object),
    })),
    cursor: state.operations.slice(0, state.cursor).filter(documentOperation).length,
  };
};
const exportFolderSnapshot = async (root: string): Promise<Map<string, Buffer>> => {
  const base = path.join(root, "export/theme"),
    files = new Map<string, Buffer>();
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else files.set(path.relative(base, absolute), await readFile(absolute));
    }
  };
  await walk(base);
  return files;
};

test("completes the offline Material and Custom lifecycles through the hardened Electron boundary", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(path.join(os.tmpdir(), "dspico-studio-e2e-"));
  const materialRoot = path.join(root, "material-project");
  const customRoot = path.join(root, "custom-project");
  const wrongTypeRoot = path.join(root, "wrong-type-project");
  await mkdir(materialRoot);
  await mkdir(customRoot);
  await mkdir(wrongTypeRoot);
  const wrongTypeStore = await PortableProjectStore.openRoot(wrongTypeRoot);
  await wrongTypeStore.saveV3(
    createProjectV3({
      projectId: "wrong-type",
      metadata: { name: "Wrong type", description: "Must remain untouched", author: "Test" },
    }),
  );
  await wrongTypeStore.close();
  await mkdir(path.join(root, "export"));
  await writeFile(path.join(root, "input.wav"), testWav());
  // prettier-ignore
  await writeFile(path.join(root, "input.png"), neutralPreviewPngV1);
  const packagedExecutable = process.env.DSPICO_PACKAGED_EXECUTABLE;
  const electronApp = await electron.launch({
    ...(packagedExecutable ? { executablePath: packagedExecutable } : {}),
    args: [
      "--no-sandbox",
      "--headless",
      "--disable-gpu",
      "--ozone-platform=headless",
      ...(packagedExecutable ? [] : [path.resolve("dist/apps/studio/src/main.js")]),
    ],
    env: {
      ...process.env,
      DSPICO_STUDIO_E2E_ROOT: root,
      DSPICO_STUDIO_E2E_ONBOARDING: "1",
      ELECTRON_DISABLE_SANDBOX: "1",
    },
  });
  try {
    const page = await electronApp.firstWindow();
    page.setDefaultTimeout(5_000);
    const workspace = page.getByRole("region", { name: "Theme canvas" });
    const previewView = page.getByRole("group", { name: "Preview mode" });
    const coverflow = previewView.getByRole("button", { name: "Coverflow" });
    const bannerList = previewView.getByRole("button", { name: "Banner List" });

    await test.step("Launch and shell boundary", async () => {
      const onboarding = page.getByRole("dialog", { name: "Build a theme in seven documents" });
      await expect(onboarding).toBeVisible();
      await expect(onboarding).toContainText("seven visual documents");
      await expect(onboarding).toContainText("Copy to SD manually");
      await onboarding.getByRole("button", { name: "Close help" }).click();
      await expect(onboarding).toBeHidden();
      const helpButton = page.getByRole("button", { name: "Help" });
      await helpButton.click();
      const help = page.getByRole("dialog", { name: "Help and shortcuts" });
      await expect(help).toContainText("Ctrl/Cmd + Z");
      await help.getByRole("button", { name: "Close help" }).click();
      await expect(helpButton).toBeFocused();
      await page.keyboard.press("?");
      await expect(help).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(help).toBeHidden();
      await expect(page).toHaveURL(/^app:\/\/studio\/index\.html/);
      await expect(page.getByRole("heading", { name: "Pico Theme Creator" })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Build every screen in one focused canvas." })).toBeVisible();
      await expect(page.getByRole("button", { name: "New custom", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Open project", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "New material", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Project", exact: true })).toHaveCount(0);
      await expect(workspace).toHaveCount(0);
      await expect(page.locator(".preview-panel, .utility-bar, .status")).toHaveCount(0);

      const denied = await page.evaluate(async () => {
        const global = globalThis as typeof globalThis & {
          studio: BrowserStudio;
          process?: unknown;
          require?: unknown;
        };
        let connectBlocked = false;
        const marker = "__dspicoInlineScriptRan";
        const script = document.createElement("script");
        script.textContent = `window.${marker} = true`;
        document.head.append(script);
        try {
          await fetch("https://example.com/");
        } catch {
          connectBlocked = true;
        }
        return {
          api: Object.keys(global.studio).sort(),
          connectBlocked,
          inlineScriptBlocked: !(global as unknown as Record<string, unknown>)[marker],
          nodeProcess: typeof global.process,
          nodeRequire: typeof global.require,
          popupBlocked: window.open("https://example.com/") === null,
        };
      });
      expect(denied).toEqual({
        api: [
          "closeDraftDecision",
          "create",
          "createCustom",
          "edit",
          "editCustom",
          "editVisualDocument",
          "export",
          "handoff",
          "importPng",
          "importPngBytes",
          "onPrepareClose",
          "open",
          "openCustom",
          "openProject",
          "prepareWav",
          "redo",
          "reloadEditor",
          "removeWav",
          "requestClose",
          "restorePreMigrationV3",
          "restoreProject",
          "revealExport",
          "save",
          "setCustomMetadata",
          "setDraftDirty",
          "undo",
          "validate",
        ],
        connectBlocked: true,
        inlineScriptBlocked: true,
        nodeProcess: "undefined",
        nodeRequire: "undefined",
        popupBlocked: true,
      });
      expect(denied.api).not.toEqual(expect.arrayContaining(["exportBcstm"]));
      await page.evaluate(() => {
        const link = document.createElement("a");
        link.dataset.testid = "untrusted-navigation";
        link.href = "https://example.com/navigation-denied";
        link.textContent = "Untrusted navigation";
        document.body.append(link);
      });
      await page.getByTestId("untrusted-navigation").click({ noWaitAfter: true });
      await page.waitForTimeout(100);
      await expect(page).toHaveURL(/^app:\/\/studio\/index\.html/);

      // prettier-ignore
      await expect(page.evaluate(() => (globalThis as typeof globalThis & { studio: BrowserStudio }).studio.importPng({ source: "https://example.test/pixel.png", author: "Ada", credit: "Ada", license: "CC-BY-4.0", terms: "Attribution required", notice: "Copyright Ada", intendedUse: "Custom theme background", rightsToExport: true }))).resolves.toHaveProperty("asset");
      await truncate(path.join(root, "input.png"), 16_777_217);
      // prettier-ignore
      await expect(page.evaluate(() => (globalThis as typeof globalThis & { studio: BrowserStudio }).studio.importPng({ source: "https://example.test/pixel.png", author: "Ada", credit: "Ada", license: "CC-BY-4.0", terms: "Attribution required", notice: "Copyright Ada", intendedUse: "Custom theme background", rightsToExport: true }))).rejects.toThrow("published limit");
    });

    await test.step("Material create, edit, and reopen", async () => {
      await writeFile(path.join(root, "project-selection.txt"), materialRoot);
      await page.getByRole("button", { name: "New material", exact: true }).click();
      await expect(workspace).toBeVisible();
      await showDockTab(page, "Preview");
      await expect(page.locator('[data-preview-chrome="device-frame"]')).toBeVisible();
      await expect(page.getByRole("heading", { name: "Preview unavailable" })).toHaveCount(0);
      await expect
        .poll(() => launcherCanvasEvidence(page))
        .toEqual([
          { width: 256, height: 192, flat: false },
          { width: 256, height: 192, flat: false },
        ]);
      await expect(workspace.locator("[data-workspace-surface]")).toHaveCount(1);
      const drawer = await openProjectDrawer(page);
      const name = drawer.getByLabel("Name");
      await expect(name).toBeVisible();
      await name.fill("Original E2E theme");
      await name.blur();
      await expect(projectName(page)).toHaveText("Original E2E theme");
      const launcherBuffers = () =>
        page.evaluate(() =>
          [...document.querySelectorAll<HTMLCanvasElement>("[data-launcher-screen]")].map((canvas) => {
            let hash = 2_166_136_261;
            for (const byte of canvas.getContext("2d")!.getImageData(0, 0, 256, 192).data)
              hash = Math.imul(hash ^ byte, 16_777_619);
            return hash >>> 0;
          }),
        );
      const initialBuffers = await launcherBuffers();
      await drawer.getByLabel("Primary color").fill("#123456");
      await expect
        .poll(async () => (await launcherBuffers()).every((hash, index) => hash !== initialBuffers[index]))
        .toBe(true);
      const recoloredBuffers = await launcherBuffers();
      await drawer.getByLabel("Dark theme").click();
      await expect
        .poll(async () => (await launcherBuffers()).every((hash, index) => hash !== recoloredBuffers[index]))
        .toBe(true);
      await expect(page.locator('[data-fidelity="material-fields"]')).toContainText("launcher-vector-backed");
      await expect(page.locator('[data-fidelity="raster"]')).toContainText("Chromium approximation");
      await closeProjectDrawer(page);
      await openProjectDrawer(page);
      await expect(drawer.getByLabel("Primary color")).toHaveValue("#123456");
      await drawer.getByLabel("Name").fill("Edited E2E theme");
      await drawer.getByLabel("Name").blur();
      await expect(projectName(page)).toHaveText("Edited E2E theme");
      await closeProjectDrawer(page);
      await page.getByRole("button", { name: "Undo" }).click();
      await expect(projectName(page)).toHaveText("Original E2E theme");
      await page.getByRole("button", { name: "Redo" }).click();
      await expect(projectName(page)).toHaveText("Edited E2E theme");
      await page.getByRole("button", { name: "Save" }).click();
      await page.getByRole("button", { name: "Open project" }).click();
      await expect(projectName(page)).toHaveText("Edited E2E theme");
      await openProjectDrawer(page);
      await expect(projectDrawer(page).getByLabel("Primary color")).toHaveValue("#123456");
      await expect(
        projectDrawer(page).locator("dt", { hasText: "Project location" }).locator("..").locator("dd"),
      ).toContainText("material-project");
      await closeProjectDrawer(page);

      const corruptRoot = path.join(root, "corrupt-project");
      await mkdir(corruptRoot);
      await writeFile(path.join(corruptRoot, "project.json"), "{");
      await writeFile(path.join(root, "project-selection.txt"), corruptRoot);
      await page.getByRole("button", { name: "Open project" }).click();
      await expect(page.getByText(/project.json is not valid JSON/)).toBeVisible();
      await expect(projectName(page)).toHaveText("Edited E2E theme");

      const wrongTypeBefore = await readFile(path.join(wrongTypeRoot, "project.json"));
      await writeFile(path.join(root, "project-selection.txt"), wrongTypeRoot);
      await expect(
        page.evaluate(() => (globalThis as typeof globalThis & { studio: BrowserStudio }).studio.open()),
      ).rejects.toThrow("not Material");
      await expect(projectName(page)).toHaveText("Edited E2E theme");
      await page.getByRole("button", { name: "Save" }).click();
      expect(await readFile(path.join(wrongTypeRoot, "project.json"))).toEqual(wrongTypeBefore);
      expect(await readFile(path.join(materialRoot, "project.json"), "utf8")).toContain("Edited E2E theme");

      await writeFile(path.join(root, "project-selection.txt"), "__CANCEL__");
      await page.getByRole("button", { name: "Open project" }).click();
      await expect(page.getByText("No folder selected. The current project was not changed.")).toBeVisible();
      await expect(page.getByText(/project.json is not valid JSON/)).toHaveCount(0);
      await expect(projectName(page)).toHaveText("Edited E2E theme");
      await writeFile(path.join(root, "project-selection.txt"), materialRoot);

      await expect(previewView.getByRole("button")).toHaveCount(4);
      for (const label of ["Horizontal Grid", "Vertical Grid", "Coverflow"]) {
        const control = previewView.getByRole("button", { name: label });
        await control.click();
        await expect(control).toHaveAttribute("aria-pressed", "true");
      }
      await bannerList.click();
      await expect(bannerList).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator("[data-launcher-screen]")).toHaveCount(2);
      await expect(page.locator('[data-mode="banner-list"]')).toHaveCount(2);
      await page.getByRole("button", { name: "Undo" }).click();
      await expect(projectName(page)).toHaveText("Original E2E theme");
      await page.getByRole("button", { name: "Redo" }).click();
      await expect(projectName(page)).toHaveText("Edited E2E theme");

      await page.evaluate(async () => {
        const studio = (globalThis as typeof globalThis & { studio: BrowserStudio }).studio;
        await studio.edit({
          version: 1,
          type: "set-token",
          key: "coverStartScalePercent",
          value: 100,
        });
        await studio.edit({
          version: 1,
          type: "set-token",
          key: "coverFinalAlpha",
          value: 12,
        });
        await studio.edit({
          version: 1,
          type: "set-token",
          key: "scrimFinalAlpha",
          value: 14,
        });
      });
      await page.getByRole("button", { name: "Save" }).click();
    });

    const materialExport = await test.step("Material diagnostics and export", async () => {
      const projectBefore = await readFile(path.join(materialRoot, "project.json"));
      const drawer = await openProjectDrawer(page, "Export");
      await drawer.getByRole("button", { name: "Run diagnostics" }).click();
      await expect(drawer.getByText("0 diagnostics", { exact: true })).toBeVisible();
      await expect(page.locator('[data-screen="top"]')).toBeVisible();
      await expect(page.locator('[data-screen="bottom"]')).toBeVisible();
      await expect(page.getByText("Geometry: launcher-vector-backed", { exact: true })).toBeVisible();
      await expect(page.getByText("Canvas raster: Chromium approximation", { exact: true })).toBeVisible();

      await drawer.getByRole("button", { name: "Export theme" }).click();
      const summary = drawer.getByTestId("export-summary");
      await expect(summary).toBeVisible();
      const reportHash = await summary.getAttribute("data-report-sha256");
      const zipHash = await summary.getAttribute("data-zip-sha256");
      const revealId = await summary.getAttribute("data-reveal-id");
      const reportBytes = await readFile(path.join(root, "export/theme/report.json"));
      const zipBytes = await readFile(path.join(root, "export/theme.zip"));
      const report = JSON.parse(reportBytes.toString()) as {
        files: { path: string; sha256: string }[];
        evidenceBoundary: { hardwareParityClaimed: boolean };
      };
      const themeBytes = await readFile(path.join(root, "export/theme/theme.json"));
      expect(reportHash).toBe(sha256(reportBytes));
      expect(zipHash).toBe(sha256(zipBytes));
      expect(report.evidenceBoundary.hardwareParityClaimed).toBe(false);
      expect(report.files).toEqual([
        {
          path: "theme.json",
          bytes: themeBytes.length,
          sha256: sha256(themeBytes),
        },
      ]);
      await expect(summary).toContainText("theme/theme.json · theme/report.json · theme.zip");
      await expect(summary).toContainText(path.join(root, "export"));
      await expect(summary).toContainText("theme/");
      await expect(summary).toContainText("theme.zip");
      await expect(summary).toContainText("/_pico/themes/theme/");
      await expect(summary).toContainText("Safely eject the SD card");
      await expect(summary).toContainText("hardwareParityClaimed remains false");
      await summary.getByRole("button", { name: "Reveal folder" }).click();
      await summary.getByRole("button", { name: "Reveal ZIP" }).click();
      await expect
        .poll(async () => readFile(path.join(root, "reveal.log"), "utf8"))
        .toBe("folder:theme\nzip:theme.zip\n");

      const reportBefore = await readFile(path.join(root, "export/theme/report.json"));
      const zipBefore = await readFile(path.join(root, "export/theme.zip"));
      const diagnosticsBefore = await drawer.getByText(/^\d+ diagnostics$/).textContent();
      const summaryBefore = await summary.textContent();
      await closeProjectDrawer(page);
      return {
        diagnosticsBefore,
        projectBefore,
        revealId,
        summary,
        summaryBefore,
        reportBefore,
        zipBefore,
      };
    });

    await test.step("Workspace dock, focus restoration, and local persistence", async () => {
      const artboard = workspace.locator(".artboard-stage"),
        projectBefore = await readFile(path.join(materialRoot, "project.json")),
        reportBefore = await readFile(path.join(root, "export/theme/report.json")),
        zipBefore = await readFile(path.join(root, "export/theme.zip"));

      let dock = await showDockTab(page, "Layers");
      await expect(dock.getByRole("tabpanel")).toHaveCount(1);
      await expect(dock.getByRole("tab", { name: "Layers" })).toHaveAttribute("aria-selected", "true");
      const constrainedWidth = (await artboard.boundingBox())!.width;
      await dock.getByRole("button", { name: "Collapse workspace dock" }).click();
      await expect(page.locator("#workspace-dock")).toHaveCount(0);
      await expect(workspace.locator(".workspace-canvas")).toBeFocused();
      expect((await artboard.boundingBox())!.width).toBeGreaterThan(constrainedWidth);

      dock = await showDockTab(page, "Preview");
      await bannerList.click();
      await expect(bannerList).toHaveAttribute("aria-pressed", "true");
      await dock.getByRole("button", { name: "Collapse workspace dock" }).click();
      await expect(page.locator("[data-launcher-screen]")).toHaveCount(0);
      dock = await showDockTab(page, "Preview");
      await expect(bannerList).toHaveAttribute("aria-pressed", "true");

      await bannerList.focus();
      await page.keyboard.press("Tab");
      await expect(page.locator(".tool-rail, #workspace-dock")).toHaveCount(0);
      await expect(workspace.locator(".workspace-canvas")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(page.locator(".tool-rail")).toBeVisible();
      await expect(page.locator("#workspace-dock")).toBeVisible();
      await expect(bannerList).toHaveAttribute("aria-pressed", "true");

      await page.locator("#workspace-dock").getByRole("button", { name: "Collapse workspace dock" }).focus();
      await page.keyboard.press("Shift+Tab");
      await expect(page.locator("#workspace-dock")).toHaveCount(0);
      await expect(page.locator(".tool-rail")).toBeVisible();
      await expect(workspace.locator(".workspace-canvas")).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(page.locator("#workspace-dock")).toBeVisible();

      const drawer = await openProjectDrawer(page);
      const metadata = drawer.getByLabel("Name");
      await metadata.focus();
      await page.keyboard.press("Shift+Tab");
      await expect(page.locator("#workspace-dock")).toBeVisible();
      await metadata.focus();
      await metadata.press("End");
      await metadata.type(" input");
      await expect(metadata).toHaveValue("Edited E2E theme input");
      await metadata.press("Escape");
      await closeProjectDrawer(page);

      await showDockTab(page, "Properties");
      await page.reload();
      await expect(page.getByRole("heading", { name: "Build every screen in one focused canvas." })).toBeVisible();
      await page.getByRole("button", { name: "Open project", exact: true }).click();
      await expect(workspace).toBeVisible();
      await expect(page.locator("#workspace-dock").getByRole("tab", { name: "Properties" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await page.evaluate(() =>
        dispatchEvent(new StorageEvent("storage", { key: "unrelated", newValue: null, storageArea: localStorage })),
      );
      await expect(page.locator("#workspace-dock").getByRole("tab", { name: "Properties" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await page.evaluate(() =>
        dispatchEvent(
          new StorageEvent("storage", {
            key: "dspico:workspace-layout:v2",
            newValue: JSON.stringify({
              version: 2,
              layout: { dockOpen: true, dockTab: "preview", previewMode: "banner-list" },
            }),
            storageArea: localStorage,
          }),
        ),
      );
      await expect(page.locator("#workspace-dock").getByRole("tab", { name: "Preview" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(bannerList).toHaveAttribute("aria-pressed", "true");
      await page.evaluate(() =>
        dispatchEvent(
          new StorageEvent("storage", {
            key: "dspico:workspace-layout:v2",
            newValue: "{",
            storageArea: localStorage,
          }),
        ),
      );
      await expect(page.locator("#workspace-dock").getByRole("tab", { name: "Layers" })).toHaveAttribute(
        "aria-selected",
        "true",
      );

      const exportDrawer = await openProjectDrawer(page, "Export");
      await exportDrawer.getByRole("button", { name: "Run diagnostics" }).click();
      await exportDrawer.getByRole("button", { name: "Export theme" }).click();
      await exportDrawer.getByTestId("export-summary").getByRole("button", { name: "Reveal ZIP" }).click();
      expect(await readFile(path.join(materialRoot, "project.json"))).toEqual(projectBefore);
      expect(await readFile(path.join(root, "export/theme/report.json"))).toEqual(reportBefore);
      expect(await readFile(path.join(root, "export/theme.zip"))).toEqual(zipBefore);
      await closeProjectDrawer(page);
    });

    await test.step("Responsive invariants", async () => {
      const screenshotRoot = process.env.DSPICO_SCREENSHOT_DIR;
      if (screenshotRoot) {
        await mkdir(screenshotRoot, { recursive: true });
        await showDockTab(page, "Preview");
        await coverflow.focus();
        await coverflow.press("Enter");
        await expect(coverflow).toHaveAttribute("aria-pressed", "true");
        await electronApp.evaluate(({ BrowserWindow }) => {
          const browserWindow = BrowserWindow.getAllWindows()[0];
          if (!browserWindow) throw new Error("Electron BrowserWindow is unavailable");
          browserWindow.setSize(1440, 900);
        });
        await page.screenshot({
          path: path.join(screenshotRoot, "coverflow-desktop.png"),
          fullPage: true,
        });
        await bannerList.focus();
        await bannerList.press(" ");
        await expect(bannerList).toHaveAttribute("aria-pressed", "true");
        await page.screenshot({
          path: path.join(screenshotRoot, "banner-list-desktop.png"),
          fullPage: true,
        });
      }
      await electronApp.evaluate(
        ({ BrowserWindow }, requestedSize) => {
          const browserWindow = BrowserWindow.getAllWindows()[0];
          if (!browserWindow) throw new Error("Electron BrowserWindow is unavailable");
          browserWindow.setSize(requestedSize.width, requestedSize.height);
        },
        { width: 375, height: 812 },
      );
      await page.waitForFunction(() => window.innerWidth <= 430);
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
      );
      if (screenshotRoot)
        await page.screenshot({
          path: path.join(screenshotRoot, "banner-list-mobile-375.png"),
          fullPage: true,
        });

      const windowDimensions = await electronApp.evaluate(({ BrowserWindow }) => {
        const browserWindow = BrowserWindow.getAllWindows()[0];
        if (!browserWindow) throw new Error("Electron BrowserWindow is unavailable");
        return {
          content: browserWindow.getContentSize(),
          outer: browserWindow.getSize(),
        };
      });
      const responsiveEvidence = await page.evaluate(() => {
        const viewportWidth = window.innerWidth;
        const contentWidth = document.documentElement.scrollWidth;
        const previewPanel = document.querySelector<HTMLElement>("#workspace-dock");
        return {
          contentWidth,
          mobileBreakpointActive: previewPanel !== null && getComputedStyle(previewPanel).position === "absolute",
          noHorizontalOverflow: contentWidth <= viewportWidth,
          launcherScreens: [...document.querySelectorAll<HTMLCanvasElement>("[data-launcher-screen]")].every(
            (screen) => screen.width === 256 && screen.height === 192,
          ),
          viewportHeight: window.innerHeight,
          viewportWidth,
        };
      });
      console.info("Electron responsive dimensions", {
        renderer: responsiveEvidence,
        window: windowDimensions,
      });
      expect(windowDimensions.outer).toEqual([375, 812]);
      expect(windowDimensions.content[0]).toBeLessThanOrEqual(windowDimensions.outer[0]);
      expect(responsiveEvidence.viewportWidth).toBe(windowDimensions.content[0]);
      expect(responsiveEvidence.viewportWidth).toBeGreaterThan(300);
      expect(responsiveEvidence.viewportWidth).toBeLessThanOrEqual(430);
      expect(responsiveEvidence).toMatchObject({
        mobileBreakpointActive: true,
        noHorizontalOverflow: true,
        launcherScreens: true,
      });
      expect(await readFile(path.join(materialRoot, "project.json"))).toEqual(materialExport.projectBefore);
      expect(await readFile(path.join(root, "export/theme/report.json"))).toEqual(materialExport.reportBefore);
      expect(await readFile(path.join(root, "export/theme.zip"))).toEqual(materialExport.zipBefore);
      const exportDrawer = await openProjectDrawer(page, "Export");
      await expect(exportDrawer.getByText(/^\d+ diagnostics$/)).toHaveText(materialExport.diagnosticsBefore ?? "");
      await expect(exportDrawer.getByTestId("export-summary")).toHaveText(materialExport.summaryBefore ?? "");
      await expect(page.getByText("Export ZIP revealed.")).toBeVisible();
      await closeProjectDrawer(page);
    });

    await test.step("Custom create, import, and render", async () => {
      await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 900));
      await page.waitForFunction(() => innerWidth >= 1400);
      await writeFile(path.join(root, "project-selection.txt"), customRoot);
      // prettier-ignore
      await writeFile(path.join(root, "input.png"), neutralPreviewPngV1);
      await createCustomFromChrome(page);
      await expect(
        page.evaluate(
          (id) => (globalThis as typeof globalThis & { studio: BrowserStudio }).studio.revealExport(id!, "folder"),
          materialExport.revealId,
        ),
      ).rejects.toThrow("no longer the latest");
      let drawer = await openProjectDrawer(page);
      await drawer.getByLabel("Name").fill("Edited Custom E2E");
      await drawer.getByLabel("Name").blur();
      await expect(page.getByText("Custom metadata saved.")).toBeVisible();
      await drawer.getByLabel("Description").fill("Custom metadata persisted through V3 history");
      await drawer.getByLabel("Description").blur();
      await drawer.getByLabel("Author").fill("Custom Author");
      const metadataSequence = await page.locator(".status").getAttribute("data-accepted-sequence");
      await drawer.getByLabel("Author").press("Enter");
      await expect(page.locator(".status")).not.toHaveAttribute("data-accepted-sequence", metadataSequence!);
      await expect(projectName(page)).toHaveText("Edited Custom E2E");
      await closeProjectDrawer(page);
      await page.getByRole("button", { name: "Undo" }).click();
      drawer = await openProjectDrawer(page);
      await expect(drawer.getByLabel("Author")).toHaveValue("Theme author");
      await closeProjectDrawer(page);
      await page.getByRole("button", { name: "Redo" }).click();
      drawer = await openProjectDrawer(page);
      await expect(drawer.getByLabel("Author")).toHaveValue("Custom Author");
      await closeProjectDrawer(page);
      await page.getByRole("button", { name: "Save" }).click();
      await page.getByRole("button", { name: "Open project" }).click();
      drawer = await openProjectDrawer(page);
      await expect(drawer.getByLabel("Name")).toHaveValue("Edited Custom E2E");
      await expect(drawer.getByLabel("Description")).toHaveValue("Custom metadata persisted through V3 history");
      await expect(drawer.getByLabel("Author")).toHaveValue("Custom Author");
      await drawer.getByRole("tab", { name: "Audio" }).click();
      await expect(drawer.getByTestId("bgm-workbench")).toContainText("BGM import is not available in this release");
      await expect(drawer.getByTestId("bgm-workbench").locator("audio")).toHaveCount(0);
      await expect(drawer.getByTestId("bgm-workbench").locator('input[accept*="bcstm"], textarea')).toHaveCount(0);
      expect(
        await page.evaluate(
          () => typeof (globalThis as typeof globalThis & { studio: Record<string, unknown> }).studio.importBcstm,
        ),
      ).toBe("undefined");
      for (const role of [
        "top-background",
        "bottom-background",
        "grid-cell",
        "grid-cell-selected",
        "banner-cell",
        "banner-cell-selected",
        "scrim",
      ]) {
        if (role === "top-background") await drawer.getByRole("tab", { name: "Assets" }).click();
        await drawer.getByRole("button", { name: `Assign ${role} PNG` }).click();
      }
      await drawer.getByRole("tab", { name: "Export" }).click();
      await expect(drawer.getByTestId("custom-output-rail")).toHaveAttribute("data-complete", "true");
      await expect(drawer.locator("[data-custom-output]")).toHaveCount(12);
      const outputRail = drawer.getByTestId("custom-output-rail");
      expect(await outputRail.getAttribute("data-total-bytes")).toBe("230496");
      expect(
        await page
          .locator("[data-custom-output]")
          .evaluateAll((outputs) =>
            outputs.every((output) => /^[a-f0-9]{64}$/.test(output.getAttribute("data-output-hash") ?? "")),
          ),
      ).toBe(true);
      await drawer.getByRole("tab", { name: "Assets" }).click();
      await expect(drawer.getByText("locked palette", { exact: true })).toBeVisible();
      await drawer.getByRole("tab", { name: "Export" }).click();
      await expect(outputRail.getByText("Decoded post-codec output", { exact: true })).toBeVisible();
      await expect(outputRail.getByText("Chromium approximation", { exact: true })).toBeVisible();
      await expect(outputRail.getByText("hardware-unknown", { exact: true })).toBeVisible();
      await drawer.getByRole("tab", { name: "Audio" }).click();
      const navigationAudio = drawer.locator('[data-audio-role="navigation"]');
      const selectAudio = drawer.locator('[data-audio-role="select"]');
      const backAudio = drawer.locator('[data-audio-role="back"]');
      await navigationAudio.locator('input[type="file"]').setInputFiles(path.join(root, "input.png"));
      await expect(page.locator(".status")).toContainText("WAV");
      await navigationAudio.locator('input[type="file"]').setInputFiles(path.join(root, "input.wav"));
      await expect(page.getByTestId("audio-workbench")).toBeVisible();
      await expect(
        page.locator('[data-audio-role="navigation"]').getByText("Desktop audition", { exact: true }),
      ).toBeVisible();
      await expect(page.locator('[data-audio-role="navigation"] [data-waveform]')).toBeVisible();
      await expect(page.locator('[data-audio-role="navigation"] audio')).toHaveAttribute(
        "data-audition",
        "Desktop audition",
      );
      await expect(page.locator('[data-audio-role="select"]')).toHaveAttribute("data-state", "omitted");
      await expect(backAudio).toHaveAttribute("data-state", "omitted");
      await navigationAudio.getByLabel("Gain (%)").fill("50");
      await navigationAudio.getByRole("button", { name: "Apply audio edits" }).click();
      await expect(page.locator(".status")).toContainText("navigation sound saved");
      await selectAudio.locator('input[type="file"]').setInputFiles(path.join(root, "input.wav"));
      await expect(selectAudio).toHaveAttribute("data-state", "prepared");
      await backAudio.locator('input[type="file"]').setInputFiles(path.join(root, "input.wav"));
      await expect(backAudio).toHaveAttribute("data-state", "prepared");
      await page.locator('[data-audio-role="navigation"] audio').evaluate((element) => {
        (element as HTMLAudioElement).pause = () => {
          element.setAttribute("data-paused-by-peer", "true");
        };
      });
      await page.locator('[data-audio-role="select"] audio').dispatchEvent("play");
      await expect(page.locator('[data-audio-role="navigation"] audio')).toHaveAttribute("data-paused-by-peer", "true");
      await navigationAudio.getByRole("button", { name: "Remove navigation sound" }).click();
      await expect(navigationAudio).toHaveAttribute("data-state", "omitted");
      await closeProjectDrawer(page);
      await page.getByRole("button", { name: "Undo" }).click();
      drawer = await openProjectDrawer(page, "Audio");
      await expect(navigationAudio).toHaveAttribute("data-state", "prepared");
      await closeProjectDrawer(page);
      await page.getByRole("button", { name: "Save" }).click();
      await page.getByRole("button", { name: "Open project" }).click();
      drawer = await openProjectDrawer(page, "Audio");
      await expect(drawer.locator('[data-audio-role="navigation"] [data-waveform]')).toBeVisible();
      await expect(drawer.locator('[data-audio-role="select"] [data-waveform]')).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/receipt|evidence/i);
      await closeProjectDrawer(page);
      await workspace.getByRole("button", { name: "top-background", exact: true }).click();
      await workspace.getByRole("button", { name: "Import image" }).click();
      await showDockTab(page, "Preview");
      await bannerList.click();
      const deviceTopCanvas = page.locator('[data-launcher-screen="top"]');
      await expect(deviceTopCanvas).toBeVisible();
      await expect(page.locator('[data-launcher-screen="bottom"]')).toBeVisible();
      await expect(page.getByRole("heading", { name: "Preview unavailable" })).toHaveCount(0);
      await expect
        .poll(() => launcherCanvasEvidence(page))
        .toEqual([
          { width: 256, height: 192, flat: false },
          { width: 256, height: 192, flat: false },
        ]);
      const renderEvidence = await page
        .locator('[data-workspace-surface="top-background"], [data-launcher-screen="top"]')
        .evaluateAll((canvases) =>
          canvases.map((canvas) => ({
            pixels: (canvas as HTMLCanvasElement).toDataURL(),
            width: (canvas as HTMLCanvasElement).width,
            height: (canvas as HTMLCanvasElement).height,
          })),
        );
      expect(renderEvidence.map(({ width, height }) => ({ width, height }))).toEqual([
        { width: 256, height: 192 },
        { width: 256, height: 192 },
      ]);
      drawer = await openProjectDrawer(page, "Export");
      await drawer.getByRole("button", { name: "Run diagnostics" }).click();
      await expect(drawer.getByText("1 diagnostics", { exact: true })).toBeVisible();
      await expect(drawer.getByRole("button", { name: "Export theme" })).toBeDisabled();
      await closeProjectDrawer(page);
      await certifyCurrentVisual(page, customRoot);
      drawer = await openProjectDrawer(page, "Export");
      await drawer.getByRole("button", { name: "Run diagnostics" }).click();
      await expect(drawer.getByText("0 diagnostics", { exact: true })).toBeVisible();
      await closeProjectDrawer(page);
      await showDockTab(page, "Layers");
      const layerControl = workspace.getByRole("button", {
        name: "Select input.png",
      });
      await expect(layerControl).toBeVisible();
      await layerControl.click();
      await expect(layerControl).toHaveAttribute("aria-current", "true");
      await showDockTab(page, "Properties");
      const inspectorX = workspace.getByLabel("X", { exact: true }),
        committedX = await inspectorX.inputValue(),
        operationCountBeforeDraft = (await customState(root)).operations.length;
      await inspectorX.fill("123");
      await page.locator("#workspace-dock").getByRole("button", { name: "Collapse workspace dock" }).click();
      await expect(page.locator("#workspace-dock")).toHaveCount(0);
      await showDockTab(page, "Properties");
      await expect(workspace.getByLabel("X", { exact: true })).toHaveValue("123");
      expect((await customState(root)).operations).toHaveLength(operationCountBeforeDraft);
      await workspace.getByLabel("X", { exact: true }).press("Escape");
      await expect(workspace.getByLabel("X", { exact: true })).toHaveValue(committedX);
      const canvas = workspace.locator('[data-workspace-surface="top-background"]');
      await canvas.scrollIntoViewIfNeeded();
      const bounds = (await canvas.boundingBox())!;
      // prettier-ignore
      await canvas.dispatchEvent("pointerdown", { pointerId: 1, clientX: bounds.x + bounds.width / 2, clientY: bounds.y + bounds.height / 2, buttons: 1 });
      // prettier-ignore
      await canvas.dispatchEvent("pointermove", { pointerId: 1, clientX: bounds.x + bounds.width / 2 + 10, clientY: bounds.y + bounds.height / 2 + 5, buttons: 1 });
      // prettier-ignore
      await canvas.dispatchEvent("pointermove", { pointerId: 1, clientX: bounds.x + bounds.width / 2 + 20, clientY: bounds.y + bounds.height / 2 + 10, buttons: 1 });
      await canvas.dispatchEvent("pointerup", {
        pointerId: 1,
        clientX: bounds.x + bounds.width / 2 + 20,
        clientY: bounds.y + bounds.height / 2 + 10,
      });
      await expect.poll(async () => (await customState(root)).operations.length).toBe(2);
      const moved = await customState(root);
      expect(moved.operations).toHaveLength(2);
      expect(moved.cursor).toBe(2);
    });

    await test.step("Custom history and properties", async () => {
      await showDockTab(page, "Layers");
      await page.getByRole("button", { name: "Save" }).click();
      await page.getByRole("button", { name: "Open project" }).click();
      await page.getByRole("button", { name: "Undo" }).click();
      await expect.poll(async () => (await customState(root)).cursor).toBe(1);
      await page.getByRole("button", { name: "Redo" }).click();
      await expect.poll(async () => (await customState(root)).cursor).toBe(2);
      await workspace.getByRole("button", { name: "Select input.png" }).press("ArrowRight");
      await expect.poll(async () => (await customState(root)).operations.length).toBe(3);

      await workspace.getByRole("button", { name: "Import image" }).click();
      await expect.poll(async () => (await customState(root)).operations.length).toBe(4);
      const topLayers = workspace.getByRole("listbox", {
        name: "top-background layers",
      });
      await expect(topLayers.getByRole("option")).toHaveCount(2);
      let controlled = topLayers.getByRole("option").nth(1);
      await controlled.getByRole("button", { name: "Hide input.png" }).press("Enter");
      await expect.poll(async () => (await customState(root)).operations.length).toBe(5);
      await expect(workspace.getByRole("status")).toHaveText("input.png hidden.");
      await controlled.getByRole("button", { name: "Select input.png" }).click();
      await expect(controlled).toHaveAttribute("aria-selected", "false");
      await controlled.getByRole("button", { name: "Show input.png" }).press("Enter");
      await expect.poll(async () => (await customState(root)).operations.length).toBe(6);
      await expect(controlled.getByRole("button", { name: "Hide input.png" })).toBeVisible();
      await controlled.getByRole("button", { name: "Select input.png" }).click();
      await expect(controlled).toHaveAttribute("aria-selected", "true");
      await showDockTab(page, "Properties");
      const rename = workspace.getByLabel("Rename input.png");
      await rename.fill("Overlay");
      await rename.press("Enter");
      await expect.poll(async () => (await customState(root)).operations.length).toBe(7);
      await expect(workspace.getByRole("status")).toHaveText("input.png renamed to Overlay.");
      await showDockTab(page, "Layers");
      controlled = topLayers.getByRole("option").filter({ hasText: "Overlay" });
      await controlled.getByRole("button", { name: "Move Overlay up" }).press("Enter");
      await expect.poll(async () => (await customState(root)).operations.length).toBe(8);
      await controlled.getByRole("button", { name: "Select Overlay" }).click();
      await controlled.getByRole("button", { name: "Delete Overlay" }).press("Enter");
      await expect.poll(async () => (await customState(root)).operations.length).toBe(9);
      await expect(workspace.getByRole("status")).toHaveText("Overlay deleted.");
      await expect(topLayers.getByRole("option")).toHaveCount(1);
      await expect(topLayers.getByRole("button", { name: "Select input.png" })).toBeFocused();
      await page.getByRole("button", { name: "Save" }).click();
      await page.getByRole("button", { name: "Open project" }).click();
      await page.getByRole("button", { name: "Undo" }).click();
      await expect.poll(async () => (await customState(root)).cursor).toBe(8);
      await showDockTab(page, "Layers");
      await expect(topLayers.getByRole("button", { name: "Select Overlay" })).toBeVisible();
      await page.getByRole("button", { name: "Redo" }).click();
      await expect.poll(async () => (await customState(root)).cursor).toBe(9);
      await expect(topLayers.getByRole("button", { name: "Select Overlay" })).toHaveCount(0);

      await topLayers.getByRole("button", { name: "Select input.png" }).click();
      await showDockTab(page, "Properties");
      for (const [label, value] of [
        ["X", "2"],
        ["Y", "3"],
        ["Width", "128"],
        ["Height", "96"],
        ["Crop x", "10"],
        ["Crop y", "10"],
        ["Crop width", "100"],
        ["Crop height", "80"],
        ["Opacity", "50"],
      ] as const)
        await workspace.getByLabel(label, { exact: true }).fill(value);
      await workspace.getByRole("button", { name: "Apply" }).press("Enter");
      await expect.poll(async () => (await customState(root)).operations.length).toBe(10);
      await expect(workspace.getByRole("status")).toHaveText("input.png properties updated.");
      const propertyOperation = (await customState(root)).operations.at(-1) as Record<string, unknown>;
      expect(propertyOperation).toMatchObject({
        type: "set-layer-properties",
        xQ16: 2 * 65536,
        yQ16: 3 * 65536,
        widthQ16: 128 * 65536,
        heightQ16: 96 * 65536,
        opacity: 32768,
        crop: { x: 10, y: 10, width: 100, height: 80 },
      });
      await page.getByRole("button", { name: "Save" }).click();
      await page.getByRole("button", { name: "Open project" }).click();
      await page.getByRole("button", { name: "Undo" }).click();
      await expect.poll(async () => (await customState(root)).cursor).toBe(9);
      await page.getByRole("button", { name: "Redo" }).click();
      await expect.poll(async () => (await customState(root)).cursor).toBe(10);
    });

    await test.step("Custom diagnostics and export", async () => {
      await workspace.getByRole("button", { name: "bottom-background", exact: true }).click();
      await workspace.getByRole("button", { name: "Import image" }).click();
      let drawer = await openProjectDrawer(page, "Export");
      await drawer.getByRole("button", { name: "Run diagnostics" }).click();
      await expect(drawer.getByText("1 diagnostics", { exact: true })).toBeVisible();
      await expect(drawer.getByRole("button", { name: "Export theme" })).toBeDisabled();
      await closeProjectDrawer(page);
      await certifyCurrentVisual(page, customRoot);
      drawer = await openProjectDrawer(page, "Export");
      await drawer.getByRole("button", { name: "Run diagnostics" }).click();
      await expect(drawer.getByText("0 diagnostics", { exact: true })).toBeVisible();
      await closeProjectDrawer(page);
      await workspace.getByRole("button", { name: "bottom-background", exact: true }).click();
      drawer = await openProjectDrawer(page, "Export");
      await rm(path.join(root, "export/theme"), {
        recursive: true,
        force: true,
      });
      await rm(path.join(root, "export/theme.zip"), { force: true });
      await expect(drawer.getByRole("button", { name: "Export theme" })).toBeEnabled();
      await expect(
        page.evaluate(() => (globalThis as typeof globalThis & { studio: BrowserStudio }).studio.export("custom")),
      ).resolves.toMatchObject({
        canExport: true,
        diagnostics: [],
      });
      await expect(readFile(path.join(root, "export/theme/theme.json"))).resolves.toBeTruthy();
      await expect(JSON.parse(await readFile(path.join(root, "export/theme/theme.json"), "utf8"))).toMatchObject({
        name: "Edited Custom E2E",
        description: "Custom metadata persisted through V3 history",
        author: "Custom Author",
      });
      await expect(readFile(path.join(root, "export/theme.zip"))).resolves.toBeTruthy();
      await closeProjectDrawer(page);
    });

    await test.step("Viewport rulers and persistent snapping guides stay export-neutral", async () => {
      await expect(workspace.getByRole("button", { name: "Toggle guides" })).toHaveAttribute("aria-pressed", "true");
      const railDrawer = await openProjectDrawer(page, "Export");
      const railBefore = await railDrawer
        .locator("[data-custom-output]")
        .evaluateAll((outputs) => outputs.map((output) => output.getAttribute("data-output-hash")));
      await closeProjectDrawer(page);
      const canvas = workspace.locator('[data-workspace-surface="bottom-background"]'),
        viewport = workspace.locator(".artboard-viewport"),
        operationCount = (await customState(root)).operations.length,
        browserBefore = await canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL()),
        folderBefore = await exportFolderSnapshot(root),
        zipBefore = await readFile(path.join(root, "export/theme.zip"));

      await expect(viewport.getByLabel(/Horizontal ruler/)).toBeVisible();
      await expect(viewport.getByLabel(/Vertical ruler/)).toBeVisible();
      expect(await viewport.locator(".artboard-ruler.horizontal span").allTextContents()).toEqual(
        expect.arrayContaining(["0", "256"]),
      );

      await canvas.scrollIntoViewIfNeeded();
      const beforeBox = (await canvas.boundingBox())!;
      const pointer = {
        x: Math.round(beforeBox.x + beforeBox.width * 0.37),
        y: Math.round(beforeBox.y + beforeBox.height * 0.42),
      };
      await page.mouse.move(pointer.x, pointer.y);
      await viewport.evaluate((node) =>
        node.addEventListener(
          "wheel",
          (event) => {
            const wheel = event as WheelEvent;
            node.setAttribute("data-wheel-client", `${wheel.clientX},${wheel.clientY}`);
          },
          { once: true },
        ),
      );
      const initialFitZoom = Number(await workspace.getByLabel("Exact zoom percentage").inputValue());
      await viewport.dispatchEvent("wheel", {
        clientX: pointer.x,
        clientY: pointer.y,
        ctrlKey: true,
        deltaY: -300,
      });
      await expect
        .poll(async () => Number(await workspace.getByLabel("Exact zoom percentage").inputValue()))
        .toBeCloseTo(Math.min(1600, initialFitZoom * 2), 2);
      await expect.poll(() => viewport.getAttribute("data-wheel-client")).not.toBeNull();
      const [wheelX, wheelY] = (await viewport.getAttribute("data-wheel-client"))!.split(",").map(Number),
        documentBefore = {
          x: (wheelX! - beforeBox.x) / (beforeBox.width / 256),
          y: (wheelY! - beforeBox.y) / (beforeBox.height / 192),
        },
        afterBox = (await canvas.boundingBox())!;
      expect((wheelX! - afterBox.x) / (afterBox.width / 256)).toBeCloseTo(documentBefore.x, 3);
      expect((wheelY! - afterBox.y) / (afterBox.height / 192)).toBeCloseTo(documentBefore.y, 3);
      for (let cycle = 0; cycle < 20; cycle += 1) {
        await viewport.dispatchEvent("wheel", { clientX: wheelX, clientY: wheelY, ctrlKey: true, deltaY: 300 });
        expect(Number(await workspace.getByLabel("Exact zoom percentage").inputValue())).toBeCloseTo(initialFitZoom, 2);
        await viewport.dispatchEvent("wheel", { clientX: wheelX, clientY: wheelY, ctrlKey: true, deltaY: -300 });
        expect(Number(await workspace.getByLabel("Exact zoom percentage").inputValue())).toBeCloseTo(
          Math.min(1600, initialFitZoom * 2),
          2,
        );
      }
      const repeatedBox = (await canvas.boundingBox())!;
      expect((wheelX! - repeatedBox.x) / (repeatedBox.width / 256)).toBeCloseTo(documentBefore.x, 3);
      expect((wheelY! - repeatedBox.y) / (repeatedBox.height / 192)).toBeCloseTo(documentBefore.y, 3);

      const panStart = await viewport.getAttribute("aria-label");
      const viewportBox = (await viewport.boundingBox())!;
      await viewport.dispatchEvent("wheel", {
        clientX: viewportBox.x + viewportBox.width / 2,
        clientY: viewportBox.y + viewportBox.height / 2,
        deltaX: 12,
        deltaY: 18,
      });
      await expect(viewport).not.toHaveAttribute("aria-label", panStart!);
      let box = (await canvas.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down({ button: "middle" });
      await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 12);
      await page.mouse.up({ button: "middle" });
      await page.keyboard.down("Space");
      const topRole = workspace.getByRole("button", { name: "top-background", exact: true });
      box = (await canvas.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 10, box.y + box.height / 2 + 8);
      await page.mouse.up();
      await page.keyboard.up("Space");
      expect((await customState(root)).operations).toHaveLength(operationCount);

      box = (await canvas.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down({ button: "middle" });
      await page.mouse.move(box.x + box.width / 2 + 14, box.y + box.height / 2 + 9);
      await workspace
        .getByRole("button", { name: "top-background", exact: true })
        .evaluate((button) => (button as HTMLButtonElement).click());
      await expect(workspace.locator('[data-workspace-surface="top-background"]')).toBeVisible();
      await page.mouse.up({ button: "middle" });
      await page.keyboard.press("Enter");
      expect((await customState(root)).operations).toHaveLength(operationCount);
      await workspace
        .getByRole("button", { name: "bottom-background", exact: true })
        .evaluate((button) => (button as HTMLButtonElement).click());
      await expect(workspace.locator('[data-workspace-surface="bottom-background"]')).toBeVisible();

      const zoom = workspace.getByLabel("Exact zoom percentage");
      await zoom.fill("200");
      await workspace
        .getByRole("button", { name: "top-background", exact: true })
        .evaluate((button) => (button as HTMLButtonElement).click());
      await expect(workspace.locator('[data-workspace-surface="top-background"]')).toBeVisible();
      await workspace.getByLabel("Exact zoom percentage").fill("400");
      await workspace
        .getByRole("button", { name: "bottom-background", exact: true })
        .evaluate((button) => (button as HTMLButtonElement).click());
      await expect(workspace.locator('[data-workspace-surface="bottom-background"]')).toBeVisible();
      await expect(workspace.getByLabel("Exact zoom percentage")).toHaveValue("200");
      await workspace
        .getByRole("button", { name: "100%", exact: true })
        .evaluate((button) => (button as HTMLButtonElement).click());
      await workspace.getByLabel("Exact zoom percentage").fill("200");

      const horizontalRuler = viewport.getByRole("button", {
          name: /Horizontal ruler/,
        }),
        verticalRuler = viewport.getByRole("button", {
          name: /Vertical ruler/,
        });
      await horizontalRuler.focus();
      await horizontalRuler.press("End");
      await expect(horizontalRuler).toHaveAccessibleName(/Vertical guide position 256/);
      await horizontalRuler.press("Enter");
      await expect(workspace.getByRole("button", { name: "Vertical guide at 256 pixels" })).toBeVisible();
      await verticalRuler.focus();
      await verticalRuler.press("Home");
      await expect(verticalRuler).toHaveAccessibleName(/Horizontal guide position 0/);
      await verticalRuler.press("Enter");
      await expect(workspace.getByRole("button", { name: "Horizontal guide at 0 pixels" })).toBeVisible();
      await page.getByRole("button", { name: "Undo" }).click();
      await expect(workspace.getByRole("button", { name: "Horizontal guide at 0 pixels" })).toHaveCount(0);
      await page.getByRole("button", { name: "Undo" }).click();
      await expect(workspace.locator(".document-guide")).toHaveCount(0);

      const rulerHistory = (await customState(root)).cursor,
        rulerBox = (await horizontalRuler.boundingBox())!;
      await horizontalRuler.dispatchEvent("pointerdown", {
        pointerId: 51,
        button: 0,
        buttons: 1,
        clientX: rulerBox.x + rulerBox.width / 2,
        clientY: rulerBox.y + rulerBox.height / 2,
      });
      await expect(horizontalRuler).toBeFocused();
      await horizontalRuler.dispatchEvent("pointermove", {
        pointerId: 51,
        button: 0,
        buttons: 1,
        clientX: rulerBox.x + rulerBox.width / 2 + 20,
        clientY: rulerBox.y + rulerBox.height / 2,
      });
      await page.keyboard.press("Escape");
      await horizontalRuler.dispatchEvent("pointerup", {
        pointerId: 51,
        button: 0,
      });
      expect((await customState(root)).cursor).toBe(rulerHistory);

      await horizontalRuler.dispatchEvent("pointerdown", {
        pointerId: 52,
        button: 0,
        buttons: 1,
        clientX: rulerBox.x + rulerBox.width / 2,
        clientY: rulerBox.y + rulerBox.height / 2,
      });
      await horizontalRuler.dispatchEvent("pointermove", {
        pointerId: 52,
        button: 0,
        buttons: 1,
        clientX: rulerBox.x + rulerBox.width / 2 + 20,
        clientY: rulerBox.y + rulerBox.height / 2,
      });
      await page.keyboard.press("Enter");
      await horizontalRuler.dispatchEvent("pointerup", {
        pointerId: 52,
        button: 0,
      });
      await expect.poll(async () => (await customState(root)).cursor).toBe(rulerHistory + 1);
      await expect(workspace.locator(".document-guide.vertical")).toHaveCount(1);
      await page.getByRole("button", { name: "Undo" }).click();
      await expect(workspace.locator(".document-guide")).toHaveCount(0);

      const canceledRulerHistory = (await customState(root)).cursor;
      await horizontalRuler.dispatchEvent("pointerdown", {
        pointerId: 53,
        button: 0,
        buttons: 1,
        clientX: rulerBox.x + rulerBox.width / 2,
        clientY: rulerBox.y + rulerBox.height / 2,
      });
      await horizontalRuler.dispatchEvent("pointermove", {
        pointerId: 53,
        button: 0,
        buttons: 1,
        clientX: rulerBox.x + rulerBox.width / 2 + 20,
        clientY: rulerBox.y + rulerBox.height / 2,
      });
      await page.evaluate(() => globalThis.dispatchEvent(new Event("blur")));
      await horizontalRuler.dispatchEvent("pointerup", {
        pointerId: 53,
        button: 0,
      });
      expect((await customState(root)).cursor).toBe(canceledRulerHistory);

      const currentViewportBox = (await viewport.boundingBox())!;
      await horizontalRuler.dispatchEvent("pointerdown", {
        pointerId: 54,
        button: 0,
        buttons: 1,
        clientX: rulerBox.x + rulerBox.width / 2,
        clientY: rulerBox.y + rulerBox.height / 2,
      });
      await horizontalRuler.dispatchEvent("pointermove", {
        pointerId: 54,
        button: 0,
        buttons: 1,
        clientX: currentViewportBox.x - 40,
        clientY: rulerBox.y + rulerBox.height / 2,
      });
      await horizontalRuler.dispatchEvent("pointerup", {
        pointerId: 54,
        button: 0,
        clientX: currentViewportBox.x - 40,
        clientY: rulerBox.y + rulerBox.height / 2,
      });
      expect((await customState(root)).cursor).toBe(canceledRulerHistory);

      await workspace.getByRole("spinbutton", { name: "Guide position", exact: true }).fill("40");
      await workspace.getByRole("button", { name: "Add vertical" }).click();
      await expect(workspace.locator(".document-guide.vertical")).toHaveCount(1);
      await page.getByRole("button", { name: "Undo" }).click();
      await expect(workspace.locator(".document-guide.vertical")).toHaveCount(0);
      await page.getByRole("button", { name: "Redo" }).click();
      await expect(workspace.locator(".document-guide.vertical")).toHaveCount(1);

      const verticalGuidePosition = workspace.getByRole("spinbutton", {
          name: "Vertical guide position",
          exact: true,
        }),
        guide = workspace.locator(".document-guide.vertical"),
        beforeGuideMove = (await customState(root)).cursor;
      await guide.hover();
      let guideBox = (await guide.boundingBox())!;
      await page.mouse.move(guideBox.x + guideBox.width / 2, guideBox.y + guideBox.height / 2);
      await page.mouse.down();
      await expect(guide).toBeFocused();
      await page.mouse.move(guideBox.x + guideBox.width / 2 + 16, guideBox.y + guideBox.height / 2);
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await expect(verticalGuidePosition).toHaveValue("40");
      expect((await customState(root)).cursor).toBe(beforeGuideMove);

      await guide.hover();
      guideBox = (await guide.boundingBox())!;
      await page.mouse.move(guideBox.x + guideBox.width / 2, guideBox.y + guideBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(guideBox.x + guideBox.width / 2 + 16, guideBox.y + guideBox.height / 2);
      await page.keyboard.press("Enter");
      await page.mouse.up();
      await expect(verticalGuidePosition).toHaveValue("48");
      await expect.poll(async () => (await customState(root)).cursor).toBe(beforeGuideMove + 1);

      const afterGuideMove = (await customState(root)).cursor;
      await guide.hover();
      guideBox = (await guide.boundingBox())!;
      await page.mouse.down();
      await page.mouse.move(guideBox.x + guideBox.width / 2 + 10, guideBox.y + guideBox.height / 2);
      await guide.dispatchEvent("lostpointercapture", { pointerId: 44 });
      await page.mouse.up();
      await expect(verticalGuidePosition).toHaveValue("48");
      expect((await customState(root)).cursor).toBe(afterGuideMove);

      await guide.hover();
      guideBox = (await guide.boundingBox())!;
      await page.mouse.down();
      await page.mouse.move(guideBox.x + guideBox.width / 2 + 10, guideBox.y + guideBox.height / 2);
      await workspace
        .getByRole("button", { name: "top-background", exact: true })
        .evaluate((button) => (button as HTMLButtonElement).click());
      await expect(workspace.locator('[data-workspace-surface="top-background"]')).toBeVisible();
      await page.keyboard.press("Enter");
      await page.mouse.up();
      expect((await customState(root)).cursor).toBe(afterGuideMove);
      await workspace
        .getByRole("button", { name: "bottom-background", exact: true })
        .evaluate((button) => (button as HTMLButtonElement).click());
      await expect(verticalGuidePosition).toHaveValue("48");
      await workspace.getByLabel("Lock guides").evaluate((input) => (input as HTMLInputElement).click());
      await expect(guide).toBeDisabled();
      await expect(workspace.getByRole("button", { name: "Delete guide at 48" })).toBeDisabled();
      const lockedGuideHistory = (await customState(root)).cursor;
      await guide.dispatchEvent("keydown", { key: "Delete" });
      expect((await customState(root)).cursor).toBe(lockedGuideHistory);
      await expect(guide).toHaveCount(1);
      await workspace.getByLabel("Lock guides").evaluate((input) => (input as HTMLInputElement).click());
      await workspace.getByRole("button", { name: "Toggle guides" }).click();
      await expect(guide).toHaveCount(0);

      const beforeHiddenRectangle = (await customState(root)).cursor;
      await workspace
        .getByRole("button", { name: "Add rectangle", exact: true })
        .evaluate((button) => (button as HTMLButtonElement).click());
      await expect.poll(async () => (await customState(root)).cursor).toBe(beforeHiddenRectangle + 1);
      await showDockTab(page, "Layers");
      await expect(workspace.getByRole("button", { name: "Select Rectangle" })).toHaveAttribute("aria-current", "true");
      box = (await canvas.boundingBox())!;
      await canvas.dispatchEvent("pointerdown", {
        pointerId: 30,
        button: 0,
        clientX: box.x + box.width / 2,
        clientY: box.y + box.height / 2,
        buttons: 1,
      });
      await canvas.dispatchEvent("pointermove", {
        pointerId: 30,
        button: 0,
        clientX: box.x + box.width / 2 - 30,
        clientY: box.y + box.height / 2,
        buttons: 1,
      });
      await canvas.dispatchEvent("pointerup", {
        pointerId: 30,
        button: 0,
        clientX: box.x + box.width / 2 - 30,
        clientY: box.y + box.height / 2,
      });
      await expect
        .poll(async () => (await customState(root)).operations.at(-1))
        .toMatchObject({ type: "move-layer", xQ16: 49 * 65536 });
      for (let index = 0; index < 2; index += 1) {
        const beforeUndo = (await customState(root)).cursor,
          undoSequence = await page.locator(".status").getAttribute("data-accepted-sequence");
        await page.getByRole("button", { name: "Undo" }).click();
        await expect(page.locator(".status")).not.toHaveAttribute("data-accepted-sequence", undoSequence!);
        await expect.poll(async () => (await customState(root)).cursor).toBe(beforeUndo - 1);
      }
      await workspace.getByRole("button", { name: "Toggle guides" }).click();
      await expect(workspace.locator(".document-guide.vertical")).toHaveCount(1);

      const beforeRectangle = (await customState(root)).cursor,
        rectangle = workspace.getByRole("button", { name: "Add rectangle", exact: true }),
        rectangleSequence = await page.locator(".status").getAttribute("data-accepted-sequence");
      await expect(rectangle).toBeEnabled();
      await rectangle.evaluate((button) => (button as HTMLButtonElement).click());
      await expect(page.locator(".status")).not.toHaveAttribute("data-accepted-sequence", rectangleSequence!);
      await expect.poll(async () => (await customState(root)).cursor).toBe(beforeRectangle + 1);
      await showDockTab(page, "Layers");
      await expect(workspace.getByRole("button", { name: "Select Rectangle" })).toHaveAttribute("aria-current", "true");
      await page.waitForTimeout(100);
      await expect(viewport).not.toHaveClass(/pan-ready|panning/);
      box = (await canvas.boundingBox())!;
      await canvas.dispatchEvent("pointerdown", {
        pointerId: 31,
        button: 0,
        clientX: box.x + box.width / 2,
        clientY: box.y + box.height / 2,
        buttons: 1,
      });
      await canvas.dispatchEvent("pointermove", {
        pointerId: 31,
        button: 0,
        clientX: box.x + box.width / 2 - 30,
        clientY: box.y + box.height / 2,
        buttons: 1,
      });
      await canvas.dispatchEvent("pointerup", {
        pointerId: 31,
        button: 0,
        clientX: box.x + box.width / 2 - 30,
        clientY: box.y + box.height / 2,
      });
      await expect
        .poll(async () => (await customState(root)).operations.at(-1))
        .toMatchObject({
          type: "move-layer",
          xQ16: 48 * 65536,
        });
      await page.getByRole("button", { name: "Undo" }).click();
      await page.getByRole("button", { name: "Undo" }).click();

      box = (await canvas.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down({ button: "middle" });
      await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 8);
      const panWorkspaceInstance = await workspace.getAttribute("data-workspace-instance");
      const panOpen = page.getByRole("button", { name: "Open project" }),
        panSequence = await page.locator(".status").getAttribute("data-accepted-sequence");
      await expect(panOpen).toBeEnabled();
      await panOpen.evaluate((button) => (button as HTMLButtonElement).click());
      await expect(page.locator(".status")).not.toHaveAttribute("data-accepted-sequence", panSequence!);
      await expect(workspace).not.toHaveAttribute("data-workspace-instance", panWorkspaceInstance!);
      await expect(workspace.getByLabel("Exact zoom percentage")).not.toHaveValue("0");
      await expect(topRole).toHaveAttribute("aria-pressed", "true");
      const replacedPanHistory = (await customState(root)).cursor;
      await page.mouse.up({ button: "middle" });
      await page.keyboard.press("Enter");
      expect((await customState(root)).cursor).toBe(replacedPanHistory);
      await workspace
        .getByRole("button", { name: "bottom-background", exact: true })
        .evaluate((button) => (button as HTMLButtonElement).click());
      await expect(verticalGuidePosition).toHaveValue("48");

      const replacementGuide = workspace.locator(".document-guide.vertical");
      await replacementGuide.hover();
      guideBox = (await replacementGuide.boundingBox())!;
      await page.mouse.down();
      await page.mouse.move(guideBox.x + guideBox.width / 2 + 12, guideBox.y + guideBox.height / 2);
      const guideWorkspaceInstance = await workspace.getAttribute("data-workspace-instance");
      const guideOpen = page.getByRole("button", { name: "Open project" }),
        guideSequence = await page.locator(".status").getAttribute("data-accepted-sequence");
      await expect(guideOpen).toBeEnabled();
      await guideOpen.evaluate((button) => (button as HTMLButtonElement).click());
      await expect(page.locator(".status")).not.toHaveAttribute("data-accepted-sequence", guideSequence!);
      await expect(workspace).not.toHaveAttribute("data-workspace-instance", guideWorkspaceInstance!);
      await expect(workspace.getByLabel("Exact zoom percentage")).not.toHaveValue("0");
      await expect(topRole).toHaveAttribute("aria-pressed", "true");
      const replacedGuideHistory = (await customState(root)).cursor;
      await page.keyboard.press("Enter");
      await page.mouse.up();
      expect((await customState(root)).cursor).toBe(replacedGuideHistory);
      await workspace
        .getByRole("button", { name: "bottom-background", exact: true })
        .evaluate((button) => (button as HTMLButtonElement).click());
      await expect(verticalGuidePosition).toHaveValue("48");

      await page.getByRole("button", { name: "Save" }).click();
      await page.getByRole("button", { name: "Open project" }).click();
      await expect(workspace.getByLabel("Exact zoom percentage")).not.toHaveValue("0");
      await expect(topRole).toHaveAttribute("aria-pressed", "true");
      await workspace
        .getByRole("button", { name: "bottom-background", exact: true })
        .evaluate((button) => (button as HTMLButtonElement).click());
      await expect(workspace.locator('[data-workspace-surface="bottom-background"]')).toBeVisible();
      await expect(verticalGuidePosition).toHaveValue("48");
      expect(await canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL())).toBe(browserBefore);

      await certifyCurrentVisual(page, customRoot);
      await expect(
        page.evaluate(() => (globalThis as typeof globalThis & { studio: BrowserStudio }).studio.export("custom")),
      ).resolves.toMatchObject({ canExport: true, diagnostics: [] });
      const finalRailDrawer = await openProjectDrawer(page, "Export");
      expect(
        await finalRailDrawer
          .locator("[data-custom-output]")
          .evaluateAll((outputs) => outputs.map((output) => output.getAttribute("data-output-hash"))),
      ).toEqual(railBefore);
      await closeProjectDrawer(page);
      expect(await exportFolderSnapshot(root)).toEqual(folderBefore);
      expect(await readFile(path.join(root, "export/theme.zip"))).toEqual(zipBefore);
    });
    await test.step("Draft close decision harness", async () => {
      const drawer = await openProjectDrawer(page);
      const name = drawer.getByLabel("Name");
      await name.fill("");
      await writeFile(path.join(root, "close-decision.txt"), "keep\n");
      await page.evaluate(() =>
        (
          globalThis as typeof globalThis & { studio: { requestClose(draftDirty?: boolean): void } }
        ).studio.requestClose(true),
      );
      await expect
        .poll(async () => {
          try {
            return await readFile(path.join(root, "close-decision.log"), "utf8");
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
            throw error;
          }
        })
        .toContain("keep");
      await page.evaluate(() =>
        (globalThis as typeof globalThis & { studio: { setDraftDirty(dirty: boolean): void } }).studio.setDraftDirty(
          false,
        ),
      );
      await page.waitForTimeout(100);
      await expect(page.getByRole("heading", { name: "Theme canvas" })).toBeVisible();
      await name.focus();
      await name.press("Escape");
      await expect(page.getByText("Custom metadata edit cancelled.")).toBeVisible();
      await page.waitForTimeout(600);
    });
    await test.step("Renderer failure recovery", async () => {
      await page.evaluate(() =>
        window.dispatchEvent(
          new ErrorEvent("error", { message: "private failure", error: new Error("private failure") }),
        ),
      );
      const recovery = page.getByRole("alert");
      await expect(recovery).toContainText("Committed work is saved");
      await expect(recovery.getByRole("button", { name: "Reload editor" })).toBeFocused();
      await page.evaluate(() => {
        Storage.prototype.setItem = () => {
          throw new DOMException("Storage unavailable");
        };
      });
      await recovery.getByRole("button", { name: "Reload and reopen project" }).click();
      await expect(page.getByRole("heading", { name: "Theme canvas" })).toBeVisible();
      await expect(page.getByText("Project reopened.")).toBeVisible();
    });
  } finally {
    await closeElectronApp(electronApp);
    await rm(root, { recursive: true, force: true });
  }
});

test("surfaces blocked diagnostics and recovers root-bound Custom saves on open", async () => {
  test.setTimeout(120_000);
  const metadata = { name: "Committed Custom", description: "Committed description", author: "Committed author" };
  const state = (name = metadata.name) =>
    createProjectV3({
      projectId: "recovery-custom",
      metadata: { ...metadata, name },
      themeKind: "custom",
      legacyComposition: createProjectV2({
        projectId: "recovery-custom",
        metadata: { ...metadata, name },
        themeKind: "custom",
      }),
    });
  const launch = async (root: string) => {
    const packagedExecutable = process.env.DSPICO_PACKAGED_EXECUTABLE;
    return electron.launch({
      ...(packagedExecutable ? { executablePath: packagedExecutable } : {}),
      args: [
        "--no-sandbox",
        "--headless",
        "--disable-gpu",
        "--ozone-platform=headless",
        ...(packagedExecutable ? [] : [path.resolve("dist/apps/studio/src/main.js")]),
      ],
      env: { ...process.env, DSPICO_STUDIO_E2E_ROOT: root, ELECTRON_DISABLE_SANDBOX: "1" },
    });
  };
  const interrupted = async (checkpoint: "v3-staged" | "v3-project-placed") => {
    const root = await mkdtemp(path.join(os.tmpdir(), `dspico-recovery-${checkpoint}-`)),
      oldState = state("Old committed"),
      nextState = applyOperationV3(oldState, {
        version: 3,
        type: "set-metadata",
        field: "name",
        value: "New committed",
      });
    const initial = await PortableProjectStore.openRoot(root);
    await initial.saveV3(oldState);
    await initial.close();
    const crashing = await PortableProjectStore.openRoot(root, {
      checkpoint: (phase) => {
        if (phase === checkpoint) throw new Error("injected crash");
      },
    });
    await expect(crashing.saveV3(nextState)).rejects.toThrow("injected crash");
    await crashing.close();
    return root;
  };
  const recoveryCase = async (checkpoint: "v3-staged" | "v3-project-placed", expectedName: string, message: RegExp) => {
    const root = await interrupted(checkpoint),
      app = await launch(root);
    try {
      const page = await app.firstWindow();
      page.setDefaultTimeout(5_000);
      await closeOnboarding(page);
      await page.getByRole("button", { name: "Open project" }).click();
      await expect(projectName(page)).toHaveText(expectedName);
      const drawer = await openProjectDrawer(page, "Export");
      const diagnostics = drawer.getByRole("list", { name: "Compatibility diagnostics" });
      await expect(diagnostics).toContainText("project.json");
      await expect(diagnostics).toContainText(message);
      await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
      expect(await readdir(path.join(root, ".studio"))).not.toContain("v3-journal.json");
    } finally {
      await closeElectronApp(app);
      await rm(root, { recursive: true, force: true });
    }
  };

  await recoveryCase("v3-staged", "Old committed", /keeping the previously committed project/i);
  await recoveryCase("v3-project-placed", "New committed", /keeping the already committed new project/i);

  const root = await mkdtemp(path.join(os.tmpdir(), "dspico-blocked-diagnostics-"));
  const initial = await PortableProjectStore.openRoot(root);
  await initial.saveV3(state());
  await initial.close();
  const app = await launch(root);
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(5_000);
    await closeOnboarding(page);
    await page.getByRole("button", { name: "Open project" }).click();
    let drawer = await openProjectDrawer(page, "Details");

    const operationCount = async () =>
      (JSON.parse(await readFile(path.join(root, "project.json"), "utf8")) as { operations: unknown[] }).operations
        .length;
    const name = drawer.getByLabel("Name"),
      description = drawer.getByLabel("Description"),
      author = drawer.getByLabel("Author");
    const beforeEscape = await operationCount();
    await name.fill("Cancelled metadata");
    await name.press("Escape");
    await expect(name).toHaveValue("Committed Custom");
    await name.blur();
    expect(await operationCount()).toBe(beforeEscape);

    await name.fill("History name");
    await name.blur();
    await description.fill("History description");
    await description.blur();
    await author.fill("History author");
    await author.blur();
    await expect
      .poll(async () => {
        const persisted = JSON.parse(await readFile(path.join(root, "project.json"), "utf8")) as {
          cursor: number;
          operations: unknown[];
        };
        return [persisted.cursor, persisted.operations.length];
      })
      .toEqual([3, 3]);
    const beforeUndo = JSON.parse(await readFile(path.join(root, "project.json"), "utf8")) as {
      cursor: number;
      operations: { type?: string; field?: string; value?: string }[];
    };
    const nameOperation = beforeUndo.operations.findIndex(
      ({ type, field, value }) => type === "set-metadata" && field === "name" && value === "History name",
    );
    expect(nameOperation).toBeGreaterThanOrEqual(0);
    const undoCount = beforeUndo.cursor - nameOperation;
    await name.fill("Focused draft must survive");
    for (let offset = 1; offset <= undoCount; offset += 1) {
      await name.fill(`Focused draft must survive ${offset}`);
      await expect(
        page.getByText("Custom metadata has unsaved changes. Blur the field or press Enter to save.", { exact: true }),
      ).toBeVisible();
      const undo = page.getByRole("button", { name: "Undo" });
      await expect(undo).toBeEnabled();
      const sequence = await page.locator(".status").getAttribute("data-accepted-sequence");
      await undo.evaluate((button) => (button as HTMLButtonElement).click());
      await expect(page.locator(".status")).not.toHaveAttribute("data-accepted-sequence", sequence!);
      await expect
        .poll(
          async () =>
            (JSON.parse(await readFile(path.join(root, "project.json"), "utf8")) as { cursor: number }).cursor,
        )
        .toBe(beforeUndo.cursor - offset);
    }
    await expect(name).toHaveValue(`Focused draft must survive ${undoCount}`);
    await name.blur();
    await expect(name).toHaveValue("Committed Custom");
    for (let offset = 1; offset <= undoCount; offset += 1) {
      await author.focus();
      await author.press("Escape");
      await author.blur();
      await expect(page.getByText("Custom metadata edit cancelled.", { exact: true })).toBeVisible();
      const redo = page.getByRole("button", { name: "Redo" });
      await expect(redo).toBeEnabled();
      const sequence = await page.locator(".status").getAttribute("data-accepted-sequence");
      await redo.evaluate((button) => (button as HTMLButtonElement).click());
      await expect(page.locator(".status")).not.toHaveAttribute("data-accepted-sequence", sequence!);
      await expect
        .poll(
          async () =>
            (JSON.parse(await readFile(path.join(root, "project.json"), "utf8")) as { cursor: number }).cursor,
        )
        .toBe(beforeUndo.cursor - undoCount + offset);
    }
    await expect(name).toHaveValue("History name");

    await description.fill("Draft across another editor operation");
    const beforeShape = (JSON.parse(await readFile(path.join(root, "project.json"), "utf8")) as { cursor: number })
      .cursor;
    await page
      .getByRole("button", { name: "Add rectangle" })
      .evaluate((button) => (button as HTMLButtonElement).click());
    await expect
      .poll(
        async () => (JSON.parse(await readFile(path.join(root, "project.json"), "utf8")) as { cursor: number }).cursor,
      )
      .toBe(beforeShape + 1);
    await expect(description).toHaveValue("Draft across another editor operation");
    await description.blur();
    await expect
      .poll(
        async () => (JSON.parse(await readFile(path.join(root, "project.json"), "utf8")) as { cursor: number }).cursor,
      )
      .toBe(beforeShape + 2);

    drawer = await openProjectDrawer(page, "Export");
    await drawer.getByRole("button", { name: "Run diagnostics" }).click();
    const diagnosticList = drawer.getByRole("list", { name: "Compatibility diagnostics" });
    await expect(diagnosticList).toBeVisible();
    await expect(diagnosticList).toContainText("/roleAssignments/bottom-background");
    await expect(diagnosticList).toContainText("Assign a PNG or add at least one layer");
    await expect(drawer.getByRole("button", { name: "Export theme" })).toBeDisabled();
    const results = await page.evaluate(async () => {
      const studio = (globalThis as typeof globalThis & { studio: BrowserStudio }).studio;
      return { validation: await studio.validate(), blocked: await studio.export("custom") };
    });
    expect(results.validation.canExport).toBe(false);
    expect(results.validation.diagnostics?.length).toBeGreaterThan(0);
    expect(results.blocked.diagnostics).toEqual(results.validation.diagnostics);
  } finally {
    await closeElectronApp(app);
    await rm(root, { recursive: true, force: true });
  }
});

test("publishes creator output as an equivalent folder and ZIP package", async () => {
  test.setTimeout(90_000);
  const root = await mkdtemp(path.join(os.tmpdir(), "dspico-publication-e2e-"));
  const projectRoot = path.join(root, "project");
  await mkdir(projectRoot);
  await writeFile(path.join(root, "project-selection.txt"), projectRoot);
  await mkdir(path.join(root, "export"));
  await writeFile(path.join(root, "input.wav"), testWav());
  await writeFile(path.join(root, "input.png"), neutralPreviewPngV1);
  const electronApp = await electron.launch({
    args: [
      "--no-sandbox",
      "--headless",
      "--disable-gpu",
      "--ozone-platform=headless",
      path.resolve("dist/apps/studio/src/main.js"),
    ],
    env: {
      ...process.env,
      DSPICO_STUDIO_E2E_ROOT: root,
      DSPICO_STUDIO_E2E_SAVE_DELAY_MS: "5000",
      ELECTRON_DISABLE_SANDBOX: "1",
    },
  });
  const storedManifest = (zip: Uint8Array) => {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength),
      entries: { path: string; bytes: number; sha256: string }[] = [];
    let offset = 0;
    while (offset + 30 <= zip.length && view.getUint32(offset, true) === 0x04034b50) {
      const size = view.getUint32(offset + 18, true),
        nameLength = view.getUint16(offset + 26, true),
        extraLength = view.getUint16(offset + 28, true);
      const nameStart = offset + 30,
        dataStart = nameStart + nameLength + extraLength;
      entries.push({
        path: new TextDecoder().decode(zip.slice(nameStart, dataStart - extraLength)),
        bytes: size,
        sha256: sha256(zip.slice(dataStart, dataStart + size)),
      });
      offset = dataStart + size;
    }
    return entries;
  };
  try {
    const page = await electronApp.firstWindow();
    page.setDefaultTimeout(5_000);
    await closeOnboarding(page);
    await createCustomFromChrome(page);
    let drawer = await openProjectDrawer(page, "Assets");
    for (const role of [
      "top-background",
      "bottom-background",
      "grid-cell",
      "grid-cell-selected",
      "banner-cell",
      "banner-cell-selected",
      "scrim",
    ])
      await drawer.getByRole("button", { name: `Assign ${role} PNG` }).click();
    drawer = await openProjectDrawer(page, "Audio");
    await drawer.locator('input[accept=".wav,audio/wav"]').first().setInputFiles(path.join(root, "input.wav"));
    const workspace = page.getByRole("region", { name: "Theme canvas" });
    const visualPaths = [
      "topbg.bin",
      "bottombg.bin",
      "gridcell.bin",
      "gridcellSelected.bin",
      "gridcellPltt.bin",
      "gridcellSelectedPltt.bin",
      "bannerListCell.bin",
      "bannerListCellSelected.bin",
      "bannerListCellPltt.bin",
      "bannerListCellSelectedPltt.bin",
      "scrim.bin",
      "scrimPltt.bin",
    ];
    drawer = await openProjectDrawer(page, "Export");
    await drawer.getByRole("button", { name: "Run diagnostics" }).click();
    await expect(drawer.getByText("1 diagnostics", { exact: true })).toBeVisible();
    const exportTheme = drawer.getByRole("button", { name: "Export theme" });
    await expect(exportTheme).toBeDisabled();
    const blocked = await page.evaluate(() =>
      (globalThis as typeof globalThis & { studio: BrowserStudio }).studio.export("custom"),
    );
    expect(blocked.canExport).toBe(false);
    expect(blocked.diagnostics).toHaveLength(1);
    expect(await readdir(path.join(root, "export"))).toEqual([]);
    await closeProjectDrawer(page);
    await certifyCurrentVisual(page, projectRoot);
    drawer = await openProjectDrawer(page, "Export");
    await drawer.getByRole("button", { name: "Run diagnostics" }).click();
    await expect(drawer.getByText("0 diagnostics", { exact: true })).toBeVisible();
    await expect(exportTheme).toBeEnabled();
    await exportTheme.click();
    await expect(drawer.getByTestId("export-summary")).toBeVisible();
    const fallbackRailHashes = Object.fromEntries(
      await drawer
        .locator("[data-custom-output]")
        .evaluateAll((outputs) =>
          outputs.map((output) => [
            output.getAttribute("data-custom-output")!,
            output.getAttribute("data-output-hash")!,
          ]),
        ),
    );
    const fallbackBytes = new Map(
      await Promise.all(
        visualPaths.map(
          async (filePath) => [filePath, await readFile(path.join(root, "export/theme", filePath))] as const,
        ),
      ),
    );
    await closeProjectDrawer(page);

    const imageBytes = [...(await readFile(path.join(root, "input.png")))];
    await workspace.getByRole("button", { name: "grid-cell", exact: true }).click();
    const gridCanvas = workspace.locator('[data-workspace-surface="grid-cell"]');
    await expect(gridCanvas).toHaveJSProperty("width", 64);
    await expect(gridCanvas).toHaveJSProperty("height", 64);
    await gridCanvas.evaluate((canvas, bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([Uint8Array.from(bytes)], "dropped.png", {
          type: "image/png",
        }),
      );
      canvas.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
    }, imageBytes);
    const gridLayers = workspace.getByRole("listbox", {
      name: "grid-cell layers",
    });
    await showDockTab(page, "Layers");
    await expect(gridLayers.getByRole("option")).toHaveCount(1);
    await expect(
      workspace.getByText("Authored document active. Its layers override the assigned role asset."),
    ).toBeVisible();
    const gridLayer = gridLayers.getByRole("button", {
      name: "Select dropped.png",
    });
    await gridLayer.click();
    await gridLayer.press("ArrowRight");
    await showDockTab(page, "Properties");
    await expect(workspace.getByLabel("X", { exact: true })).toHaveValue("1");
    const saveDelayMarker = path.join(root, ".dspico-e2e-delay-save"),
      saveBlockedMarker = path.join(root, ".dspico-e2e-save-blocked"),
      beforeMoveCursor = (await customState(root)).cursor;
    await writeFile(saveDelayMarker, "delay the next visual save");
    const originalGridPixels = await gridCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL()),
      gridBounds = (await gridCanvas.boundingBox())!;
    await page.mouse.move(gridBounds.x + gridBounds.width / 2, gridBounds.y + gridBounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      gridBounds.x + gridBounds.width / 2 - gridBounds.width / 64,
      gridBounds.y + gridBounds.height / 2,
    );
    await expect(gridCanvas).not.toHaveAttribute("data-snap-guides", "0");
    const movedGridPixels = await gridCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
    expect(movedGridPixels).not.toBe(originalGridPixels);
    await page.mouse.up();
    await expect
      .poll(() =>
        readFile(saveBlockedMarker).then(
          () => true,
          () => false,
        ),
      )
      .toBe(true);
    await page.evaluate(() => globalThis.dispatchEvent(new Event("blur")));
    expect(await gridCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL())).toBe(movedGridPixels);
    await expect(gridCanvas).toHaveAttribute("data-snap-guides", "0");
    await expect(workspace.getByRole("status")).toContainText("moved to");
    await expect(workspace.getByLabel("X", { exact: true })).toHaveValue("1");
    expect((await customState(root)).cursor).toBe(beforeMoveCursor);
    await rm(saveDelayMarker);
    await expect.poll(async () => (await customState(root)).cursor).toBe(beforeMoveCursor + 1);
    await expect(workspace.getByLabel("X", { exact: true })).toHaveValue("0");
    await expect
      .poll(() => gridCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL()))
      .toBe(movedGridPixels);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(async () => (await customState(root)).cursor).toBe(beforeMoveCursor);
    await expect(workspace.getByLabel("X", { exact: true })).toHaveValue("1");
    await expect
      .poll(() => gridCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL()))
      .toBe(originalGridPixels);
    await page.getByRole("button", { name: "Redo" }).click();
    await expect.poll(async () => (await customState(root)).cursor).toBe(beforeMoveCursor + 1);
    await expect(workspace.getByLabel("X", { exact: true })).toHaveValue("0");
    await expect
      .poll(() => gridCanvas.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL()))
      .toBe(movedGridPixels);
    await workspace.getByRole("button", { name: "Rotate dropped.png right" }).click();
    await expect(workspace.getByLabel("Layer rotation")).toHaveValue("90");
    await expect(workspace.getByRole("status")).toHaveText("dropped.png rotated to 90 degrees.");

    await workspace.getByRole("button", { name: "banner-cell", exact: true }).click();
    const bannerCanvas = workspace.locator('[data-workspace-surface="banner-cell"]');
    await expect(bannerCanvas).toHaveJSProperty("width", 256);
    await expect(bannerCanvas).toHaveJSProperty("height", 49);
    await bannerCanvas.evaluate((canvas, bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(bytes)], "pasted.png", { type: "image/png" }));
      canvas.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: transfer,
        }),
      );
    }, imageBytes);
    await showDockTab(page, "Layers");
    await expect(workspace.getByRole("listbox", { name: "banner-cell layers" }).getByRole("option")).toHaveCount(1);
    await certifyCurrentVisual(page, projectRoot);
    await workspace.getByRole("button", { name: "banner-cell", exact: true }).click();
    await showDockTab(page, "Layers");
    await page.evaluate(() => (globalThis as typeof globalThis & { studio: BrowserStudio }).studio.export("custom"));
    const beforeCropBytes = new Map(
      await Promise.all(
        visualPaths.map(
          async (filePath) => [filePath, await readFile(path.join(root, "export/theme", filePath))] as const,
        ),
      ),
    );
    const bannerLayer = workspace.getByRole("button", {
      name: "Select pasted.png",
    });
    await bannerLayer.click();
    await showDockTab(page, "Properties");
    await workspace.getByRole("button", { name: "Crop selected image" }).click();
    const bannerBounds = (await bannerCanvas.boundingBox())!,
      bannerLayerX = Number(await workspace.getByLabel("X", { exact: true }).inputValue()),
      bannerLeft = bannerBounds.x + (bannerLayerX * bannerBounds.width) / 256;
    await page.mouse.move(bannerLeft + 1, bannerBounds.y + bannerBounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bannerLeft + 12, bannerBounds.y + bannerBounds.height / 2);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(workspace.getByLabel("Crop x", { exact: true })).toHaveValue("0");
    await bannerCanvas.evaluate((canvas, layerX) => {
      const bounds = canvas.getBoundingClientRect(),
        options = {
          bubbles: true,
          pointerId: 91,
          clientX: bounds.left + (layerX * bounds.width) / 256 + 1,
          clientY: bounds.top + bounds.height / 2,
        };
      canvas.dispatchEvent(new PointerEvent("pointerdown", options));
      canvas.dispatchEvent(
        new PointerEvent("pointermove", {
          ...options,
          clientX: options.clientX + 17,
        }),
      );
    }, bannerLayerX);
    await workspace.getByRole("button", { name: "grid-cell", exact: true }).click();
    await workspace.getByRole("button", { name: "banner-cell", exact: true }).click();
    await showDockTab(page, "Layers");
    await bannerLayer.click();
    await showDockTab(page, "Properties");
    await expect(workspace.getByLabel("Crop x", { exact: true })).toHaveValue("0");
    await workspace.getByRole("button", { name: "Crop selected image" }).click();
    await page.mouse.move(bannerLeft + 1, bannerBounds.y + bannerBounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bannerLeft + 17, bannerBounds.y + bannerBounds.height / 2);
    await page.mouse.up();
    await expect(workspace.getByRole("status")).toHaveText(/pasted\.png cropped at -?\d+(?:\.\d+)?, -?\d+(?:\.\d+)?\./);
    await expect(workspace.getByLabel("Crop x", { exact: true })).not.toHaveValue("0");
    const beforeCropCursor = (await customState(root)).cursor,
      activeCropX = Number(await workspace.getByLabel("X", { exact: true }).inputValue()),
      activeCropLeft = bannerBounds.x + (activeCropX * bannerBounds.width) / 256;
    await page.mouse.move(activeCropLeft + 1, bannerBounds.y + bannerBounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(activeCropLeft + 9, bannerBounds.y + bannerBounds.height / 2);
    await page.getByRole("button", { name: "Undo" }).evaluate((button) => (button as HTMLButtonElement).click());
    await expect.poll(async () => (await customState(root)).cursor).toBe(beforeCropCursor - 1);
    await expect(workspace.getByLabel("Crop x", { exact: true })).toHaveValue("0");
    await page.mouse.up();
    await page.waitForTimeout(100);
    expect((await customState(root)).cursor).toBe(beforeCropCursor - 1);
    await expect(workspace.getByLabel("Crop x", { exact: true })).toHaveValue("0");
    await page.mouse.move(bannerLeft + 1, bannerBounds.y + bannerBounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bannerLeft + 9, bannerBounds.y + bannerBounds.height / 2);
    await page.getByRole("button", { name: "Redo" }).evaluate((button) => (button as HTMLButtonElement).click());
    await expect.poll(async () => (await customState(root)).cursor).toBe(beforeCropCursor);
    await expect(workspace.getByLabel("Crop x", { exact: true })).not.toHaveValue("0");
    await page.mouse.up();
    await page.waitForTimeout(100);
    expect((await customState(root)).cursor).toBe(beforeCropCursor);
    await expect(workspace.getByLabel("Crop x", { exact: true })).not.toHaveValue("0");
    await workspace.getByRole("button", { name: "Done cropping" }).click();
    await certifyCurrentVisual(page, projectRoot);
    await page.evaluate(() => (globalThis as typeof globalThis & { studio: BrowserStudio }).studio.export("custom"));
    const afterCropBytes = new Map(
      await Promise.all(
        visualPaths.map(
          async (filePath) => [filePath, await readFile(path.join(root, "export/theme", filePath))] as const,
        ),
      ),
    );
    expect(afterCropBytes.get("bannerListCell.bin")).not.toEqual(beforeCropBytes.get("bannerListCell.bin"));
    for (const filePath of visualPaths)
      if (filePath !== "bannerListCell.bin" && filePath !== "bannerListCellPltt.bin")
        expect(afterCropBytes.get(filePath), `${filePath} crop isolation`).toEqual(beforeCropBytes.get(filePath));

    await workspace.getByRole("button", { name: "grid-cell-selected", exact: true }).click();
    await workspace.getByRole("button", { name: "Add rectangle" }).click();
    await showDockTab(page, "Layers");
    await expect(workspace.getByRole("button", { name: "Select Rectangle" })).toHaveAttribute("aria-current", "true");
    await showDockTab(page, "Properties");
    const fill = workspace.getByLabel("Fill color hex");
    await fill.fill("#123456");
    await fill.press("Tab");
    await expect(workspace.getByRole("status")).toHaveText("Rectangle fill updated.");
    const westResize = workspace.getByRole("button", {
        name: "Resize Rectangle from w",
      }),
      beforeResizeX = await workspace.getByLabel("X", { exact: true }).inputValue(),
      westBounds = (await westResize.boundingBox())!;
    await page.mouse.move(westBounds.x + westBounds.width / 2, westBounds.y + westBounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(westBounds.x + westBounds.width / 2 + 12, westBounds.y + westBounds.height / 2);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(workspace.getByLabel("X", { exact: true })).toHaveValue(beforeResizeX);
    await westResize.focus();
    const beforeResizeCursor = (await customState(root)).cursor;
    await westResize.press("ArrowRight");
    await expect(westResize).toBeFocused();
    await expect(workspace.getByLabel("X", { exact: true })).toHaveValue("17");
    await expect(workspace.getByLabel("Width", { exact: true })).toHaveValue("31");
    await expect.poll(async () => (await customState(root)).cursor).toBe(beforeResizeCursor + 1);
    let activeResizeBounds = (await westResize.boundingBox())!;
    await page.mouse.move(
      activeResizeBounds.x + activeResizeBounds.width / 2,
      activeResizeBounds.y + activeResizeBounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(activeResizeBounds.x + activeResizeBounds.width / 2 + 8, activeResizeBounds.y);
    await page.getByRole("button", { name: "Undo" }).evaluate((button) => (button as HTMLButtonElement).click());
    await expect.poll(async () => (await customState(root)).cursor).toBe(beforeResizeCursor);
    await expect(workspace.getByLabel("X", { exact: true })).toHaveValue(beforeResizeX);
    await page.mouse.up();
    await page.waitForTimeout(100);
    expect((await customState(root)).cursor).toBe(beforeResizeCursor);
    await expect(workspace.getByLabel("X", { exact: true })).toHaveValue(beforeResizeX);
    activeResizeBounds = (await westResize.boundingBox())!;
    await page.mouse.move(
      activeResizeBounds.x + activeResizeBounds.width / 2,
      activeResizeBounds.y + activeResizeBounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(activeResizeBounds.x + activeResizeBounds.width / 2 + 8, activeResizeBounds.y);
    await page.getByRole("button", { name: "Redo" }).evaluate((button) => (button as HTMLButtonElement).click());
    await expect.poll(async () => (await customState(root)).cursor).toBe(beforeResizeCursor + 1);
    await page.mouse.up();
    await page.waitForTimeout(100);
    expect((await customState(root)).cursor).toBe(beforeResizeCursor + 1);
    await expect(workspace.getByLabel("X", { exact: true })).toHaveValue("17");
    await workspace.getByRole("button", { name: "Align Rectangle left" }).click();
    await expect(workspace.getByLabel("X", { exact: true })).toHaveValue("0");
    await expect(workspace.getByRole("status")).toContainText("Rectangle aligned left");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(workspace.getByLabel("X", { exact: true })).toHaveValue("17");
    await expect(workspace.getByLabel("Fill color hex")).toHaveValue("#123456");
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(workspace.getByLabel("X", { exact: true })).toHaveValue("0");
    await expect(workspace.getByLabel("Fill color hex")).toHaveValue("#123456");
    await workspace.getByRole("button", { name: "grid-cell", exact: true }).click();
    const unrelatedGridCanvas = workspace.locator('[data-workspace-surface="grid-cell"]');
    await unrelatedGridCanvas.focus();
    await unrelatedGridCanvas.press("Escape");
    const unrelatedGridRgba = await unrelatedGridCanvas.evaluate((canvas) => [
      ...(canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 64, 64).data,
    ]);
    await workspace.getByRole("button", { name: "grid-cell-selected", exact: true }).click();

    const setGeometry = async (x: string, y: string, width: string, height: string) => {
      await workspace.getByLabel("X", { exact: true }).fill(x);
      await workspace.getByLabel("Y", { exact: true }).fill(y);
      await workspace.getByLabel("Width", { exact: true }).fill(width);
      await workspace.getByLabel("Height", { exact: true }).fill(height);
      await workspace.getByRole("button", { name: "Apply", exact: true }).click();
    };
    await setGeometry("20", "5", "8", "8");
    await workspace.locator('[data-workspace-surface="grid-cell-selected"]').evaluate((canvas, bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(bytes)], "multi.png", { type: "image/png" }));
      canvas.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
    }, imageBytes);
    await showDockTab(page, "Layers");
    await workspace.getByRole("button", { name: "Select multi.png" }).click();
    await expect(workspace.getByRole("button", { name: "Select multi.png" })).toHaveAttribute("aria-current", "true");
    await showDockTab(page, "Properties");
    await setGeometry("0", "5", "8", "8");
    await workspace.getByRole("button", { name: "Add text" }).click();
    await setGeometry("45", "5", "8", "8");
    await showDockTab(page, "Layers");
    const imageOption = workspace.getByRole("option").filter({ hasText: "multi.png" }),
      rectangleOption = workspace.getByRole("option").filter({ hasText: "Rectangle" }),
      textOption = workspace.getByRole("option").filter({ hasText: "Text" });
    await workspace.getByRole("button", { name: "Select multi.png" }).click();
    await workspace.getByRole("button", { name: "Select Rectangle" }).click({ modifiers: ["Shift"] });
    await workspace.getByRole("button", { name: "Select Text" }).click({ modifiers: ["Control"] });
    await expect(imageOption).toHaveAttribute("aria-selected", "true");
    await expect(rectangleOption).toHaveAttribute("aria-selected", "true");
    await expect(textOption).toHaveAttribute("aria-selected", "true");
    await expect(workspace.locator("#layer-selection-count")).toHaveText("3 selected");
    await expect(workspace.locator(".canvas-resize-handle")).toHaveCount(0);
    await expect(workspace.getByRole("button", { name: "Crop selected image" })).toBeDisabled();
    const mixedCanvas = workspace.locator('[data-workspace-surface="grid-cell-selected"]'),
      textButton = workspace.getByRole("button", { name: "Select Text" }),
      beforeKeyboardMoveState = await customState(root),
      beforeKeyboardMove = beforeKeyboardMoveState.operations.length;
    await textButton.focus();
    await textButton.evaluate((button) => {
      button.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
      for (let repeat = 0; repeat < 8; repeat += 1)
        button.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "ArrowDown",
            repeat: true,
          }),
        );
    });
    await expect(textButton).toBeFocused();
    await expect.poll(async () => (await customState(root)).operations.length).toBe(beforeKeyboardMove + 1);
    await page.waitForTimeout(200);
    expect((await customState(root)).operations.length).toBe(beforeKeyboardMove + 1);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(async () => (await customState(root)).cursor).toBe(beforeKeyboardMoveState.cursor);
    await page.getByRole("button", { name: "Redo" }).click();
    await expect.poll(async () => (await customState(root)).cursor).toBe(beforeKeyboardMoveState.cursor + 1);
    await showDockTab(page, "Properties");
    const beforeDistributionState = await customState(root),
      beforeDistribution = beforeDistributionState.operations.length,
      movedOperation = beforeDistributionState.operations.at(-1) as unknown as {
        positions: { layerId: string; xQ16: number; yQ16: number }[];
      },
      movedRgba = await mixedCanvas.evaluate((canvas) => [
        ...(canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 64, 64).data,
      ]);
    await workspace
      .getByRole("button", {
        name: "Distribute selected layers with equal horizontal spacing",
      })
      .click();
    await expect.poll(async () => (await customState(root)).operations.length).toBe(beforeDistribution + 1);
    await expect(workspace.getByRole("status")).toHaveText("3 layers distributed with equal horizontal spacing.");
    const distributionOperation = (await customState(root)).operations.at(-1) as unknown as {
      type: string;
      positions: { layerId: string; xQ16: number; yQ16: number }[];
    };
    expect(distributionOperation.type).toBe("set-layer-positions");
    const movedY = movedOperation.positions[0]!.yQ16;
    expect(movedOperation.positions.every(({ yQ16 }) => yQ16 === movedY)).toBe(true);
    expect(distributionOperation.positions.map(({ xQ16, yQ16 }) => [xQ16, yQ16])).toEqual([
      [0, movedY],
      [Math.round(22.5 * 65536), movedY],
      [45 * 65536, movedY],
    ]);
    const [left, middle, right] = distributionOperation.positions;
    expect(middle!.xQ16 - left!.xQ16 - 8 * 65536).toBe(right!.xQ16 - middle!.xQ16 - 8 * 65536);
    expect([left!.xQ16, right!.xQ16 + 8 * 65536]).toEqual([0, 53 * 65536]);
    const readMixedRgba = () =>
      mixedCanvas.evaluate((canvas) => [
        ...(canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 64, 64).data,
      ]);
    await expect.poll(readMixedRgba).not.toEqual(movedRgba);
    const distributedRgba = await readMixedRgba();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect
      .poll(() =>
        mixedCanvas.evaluate((canvas) => [
          ...(canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 64, 64).data,
        ]),
      )
      .toEqual(movedRgba);
    await page.getByRole("button", { name: "Redo" }).click();
    await expect
      .poll(() =>
        mixedCanvas.evaluate((canvas) => [
          ...(canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 64, 64).data,
        ]),
      )
      .toEqual(distributedRgba);
    const beforeDelete = (await customState(root)).operations.length;
    await showDockTab(page, "Layers");
    await workspace.getByRole("button", { name: "Delete Text" }).press("Enter");
    await expect.poll(async () => (await customState(root)).operations.length).toBe(beforeDelete + 1);
    await expect(workspace.getByRole("status")).toHaveText("3 layers deleted.");
    await expect(workspace.getByRole("listbox", { name: "grid-cell-selected layers" }).getByRole("option")).toHaveCount(
      0,
    );
    await expect(workspace.getByRole("button", { name: "Import image" })).toBeFocused();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(workspace.getByRole("listbox", { name: "grid-cell-selected layers" }).getByRole("option")).toHaveCount(
      3,
    );
    await expect(workspace.locator("#layer-selection-count")).toHaveText("3 selected");
    await expect(imageOption).toHaveAttribute("aria-selected", "true");
    await expect(rectangleOption).toHaveAttribute("aria-selected", "true");
    await expect(textOption).toHaveAttribute("aria-selected", "true");
    await expect(textButton).toHaveAttribute("aria-current", "true");
    await expect(textButton).toBeFocused();
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(workspace.getByRole("listbox", { name: "grid-cell-selected layers" }).getByRole("option")).toHaveCount(
      0,
    );
    await expect(workspace.locator("#layer-selection-count")).toHaveText("0 selected");
    await expect(workspace.getByRole("button", { name: "Import image" })).toBeFocused();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(workspace.locator("#layer-selection-count")).toHaveText("3 selected");
    await expect(textButton).toHaveAttribute("aria-current", "true");
    await expect(textButton).toBeFocused();
    await mixedCanvas.focus();
    await mixedCanvas.press("Escape");
    await expect(workspace.locator("#layer-selection-count")).toHaveText("0 selected");
    const persistedRgba = await mixedCanvas.evaluate((canvas) => [
      ...(canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 64, 64).data,
    ]);
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Open project" }).click();
    await workspace.getByRole("button", { name: "grid-cell-selected", exact: true }).click();
    await showDockTab(page, "Layers");
    await expect(workspace.locator("#layer-selection-count")).toHaveText("0 selected");
    expect(
      await workspace
        .getByRole("listbox", { name: "grid-cell-selected layers" })
        .getByRole("option")
        .evaluateAll((options) => options.map((option) => option.getAttribute("aria-selected"))),
    ).toEqual(["false", "false", "false"]);
    await showDockTab(page, "Properties");
    await expect(workspace.getByText("Nothing selected", { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        workspace
          .locator('[data-workspace-surface="grid-cell-selected"]')
          .evaluate((canvas) => [...(canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 64, 64).data]),
      )
      .toEqual(persistedRgba);
    await workspace.getByRole("button", { name: "grid-cell", exact: true }).click();
    await expect
      .poll(() =>
        workspace
          .locator('[data-workspace-surface="grid-cell"]')
          .evaluate((canvas) => [...(canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 64, 64).data]),
      )
      .toEqual(unrelatedGridRgba);

    await workspace.getByRole("button", { name: "banner-cell-selected", exact: true }).click();
    const groupedCanvas = workspace.locator('[data-workspace-surface="banner-cell-selected"]');
    await groupedCanvas.evaluate((canvas, bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([Uint8Array.from(bytes)], "grouped.png", {
          type: "image/png",
        }),
      );
      canvas.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
    }, imageBytes);
    await workspace.getByRole("button", { name: "Add rectangle" }).click();
    await workspace.getByRole("button", { name: "Add text" }).click();
    await showDockTab(page, "Layers");
    await workspace.getByRole("button", { name: "Select grouped.png" }).click();
    await workspace.getByRole("button", { name: "Select Rectangle" }).click({ modifiers: ["Shift"] });
    await workspace.getByRole("button", { name: "Select Text" }).click({ modifiers: ["Control"] });
    const beforeGroupingRgba = await groupedCanvas.evaluate((canvas) => [
        ...(canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 256, 49).data,
      ]),
      beforeGrouping = (await customState(root)).operations.length;
    await groupedCanvas.focus();
    await page.keyboard.press("Control+g");
    await expect.poll(async () => (await customState(root)).operations.length).toBe(beforeGrouping + 1);
    await expect(workspace.locator(".layer-group-label")).toHaveCount(3);
    expect(
      await groupedCanvas.evaluate((canvas) => [
        ...(canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 256, 49).data,
      ]),
    ).toEqual(beforeGroupingRgba);
    await page.keyboard.press("Control+c");
    await expect(workspace.getByRole("status")).toHaveText("3 layers copied inside this project.");
    const beforeIgnoredShortcuts = (await customState(root)).operations.length;
    await showDockTab(page, "Properties");
    for (const editor of [workspace.getByLabel("X", { exact: true }), workspace.getByLabel("Text content")]) {
      await editor.focus();
      await page.keyboard.press("Control+c");
      await page.keyboard.press("Control+g");
      await page.keyboard.press("Control+Shift+g");
      await editor.evaluate((target) =>
        target.dispatchEvent(
          new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: new DataTransfer(),
          }),
        ),
      );
    }
    const contenteditable = workspace.locator('[data-testid="shortcut-contenteditable"]');
    await workspace.evaluate((rootElement) => {
      const target = document.createElement("div");
      target.contentEditable = "true";
      target.dataset.testid = "shortcut-contenteditable";
      rootElement.append(target);
    });
    await contenteditable.focus();
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+g");
    await page.keyboard.press("Control+Shift+g");
    await contenteditable.evaluate((target) =>
      target.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: new DataTransfer(),
        }),
      ),
    );
    await contenteditable.evaluate((target) => target.remove());
    expect((await customState(root)).operations.length).toBe(beforeIgnoredShortcuts);
    await showDockTab(page, "Layers");
    await expect(
      workspace.getByRole("listbox", { name: "banner-cell-selected layers" }).getByRole("option"),
    ).toHaveCount(3);
    const beforeGroupedMove = (await customState(root)).operations.length;
    await workspace.getByRole("button", { name: "Select Text, grouped" }).press("ArrowRight");
    await expect.poll(async () => (await customState(root)).operations.length).toBe(beforeGroupedMove + 1);
    expect((await customState(root)).operations.at(-1)).toMatchObject({
      type: "set-layer-positions",
      positions: [{ xQ16: expect.any(Number) }, { xQ16: expect.any(Number) }, { xQ16: expect.any(Number) }],
    });
    await certifyCurrentVisual(page, projectRoot);
    await workspace.getByRole("button", { name: "banner-cell-selected", exact: true }).click();
    await showDockTab(page, "Layers");
    await workspace.getByRole("button", { name: /^Select grouped\.png/ }).click();
    await workspace.getByRole("button", { name: /^Select Rectangle/ }).click({ modifiers: ["Shift"] });
    await workspace.getByRole("button", { name: /^Select Text/ }).click({ modifiers: ["Control"] });
    await page.evaluate(() => (globalThis as typeof globalThis & { studio: BrowserStudio }).studio.export("custom"));
    await showDockTab(page, "Properties");
    const beforeLockFolder = await exportFolderSnapshot(root),
      beforeLockZip = await readFile(path.join(root, "export/theme.zip")),
      beforeLockRgba = await groupedCanvas.evaluate((canvas) => [
        ...(canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 256, 49).data,
      ]),
      beforeLock = (await customState(root)).operations.length,
      beforeLockX = await workspace.getByLabel("X", { exact: true }).inputValue(),
      preLockBounds = (await groupedCanvas.boundingBox())!;
    await page.mouse.move(preLockBounds.x + preLockBounds.width / 2, preLockBounds.y + preLockBounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      preLockBounds.x + preLockBounds.width / 2 + 12,
      preLockBounds.y + preLockBounds.height / 2 + 8,
    );
    await groupedCanvas.focus();
    await page.keyboard.press("Control+Alt+l");
    await expect.poll(async () => (await customState(root)).operations.length).toBe(beforeLock + 1);
    await page.mouse.up();
    await page.waitForTimeout(100);
    expect((await customState(root)).operations.length).toBe(beforeLock + 1);
    await expect(workspace.getByLabel("X", { exact: true })).toHaveValue(beforeLockX);
    await expect(
      workspace.locator(".locked-explanation", {
        hasText: "Locked layers cannot be edited, but visibility may still be toggled.",
      }),
    ).toBeVisible();
    await expect(workspace.getByRole("status")).toContainText(
      "Locked layers cannot be edited, but visibility may still be toggled.",
    );
    await showDockTab(page, "Layers");
    await expect(workspace.locator('.creator-layer-row[data-locked="true"]')).toHaveCount(3);
    const beforeHiddenVisibility = (await customState(root)).operations.length;
    await workspace.getByRole("button", { name: "Hide Text" }).click();
    await expect.poll(async () => (await customState(root)).operations.length).toBe(beforeHiddenVisibility + 1);
    await expect(workspace.getByRole("status")).toHaveText("Text hidden.");
    await expect(workspace.getByRole("button", { name: "Show Text" })).toBeEnabled();
    await showDockTab(page, "Properties");
    await expect(workspace.getByLabel("Rename Text")).toBeDisabled();
    await expect(workspace.getByLabel("Text content")).toBeDisabled();
    await showDockTab(page, "Layers");
    await workspace.getByRole("button", { name: "Select Rectangle, grouped, locked" }).click();
    await showDockTab(page, "Properties");
    await expect(workspace.getByLabel("Rename Rectangle")).toBeDisabled();
    await expect(workspace.getByLabel("Opacity", { exact: true })).toBeDisabled();
    await expect(workspace.getByLabel("Fill color hex")).toBeDisabled();
    await expect(workspace.getByLabel("Layer rotation")).toBeDisabled();
    await expect(workspace.getByRole("button", { name: /Align 3 selected layers left/ })).toBeDisabled();
    await showDockTab(page, "Layers");
    await expect(workspace.getByRole("button", { name: "Group", exact: true })).toBeDisabled();
    await expect(workspace.getByRole("button", { name: "Ungroup", exact: true })).toBeDisabled();
    await expect(workspace.getByRole("button", { name: "Move Rectangle up" })).toBeDisabled();
    await expect(workspace.getByRole("button", { name: "Delete Rectangle" })).toBeDisabled();
    await expect(workspace.locator(".canvas-resize-handle")).toHaveCount(0);
    await workspace.getByRole("button", { name: "Show Text" }).click();
    await expect(workspace.getByRole("status")).toHaveText("Text shown.");
    await certifyCurrentVisual(page, projectRoot);
    await workspace.getByRole("button", { name: "banner-cell-selected", exact: true }).click();
    await showDockTab(page, "Layers");
    await workspace.getByRole("button", { name: "Select Rectangle, grouped, locked" }).click();
    await page.evaluate(() => (globalThis as typeof globalThis & { studio: BrowserStudio }).studio.export("custom"));
    expect(await exportFolderSnapshot(root)).toEqual(beforeLockFolder);
    expect(await readFile(path.join(root, "export/theme.zip"))).toEqual(beforeLockZip);
    await showDockTab(page, "Properties");
    const lockedX = await workspace.getByLabel("X", { exact: true }).inputValue(),
      lockedHistory = (await customState(root)).operations.length,
      lockedBounds = (await groupedCanvas.boundingBox())!;
    await page.mouse.move(lockedBounds.x + lockedBounds.width / 2, lockedBounds.y + lockedBounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(lockedBounds.x + lockedBounds.width / 2 + 12, lockedBounds.y + lockedBounds.height / 2 + 8);
    await page.mouse.up();
    await groupedCanvas.press("Delete");
    await expect(workspace.getByLabel("X", { exact: true })).toHaveValue(lockedX);
    expect((await customState(root)).operations.length).toBe(lockedHistory);
    expect(
      await groupedCanvas.evaluate((canvas) => [
        ...(canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 256, 49).data,
      ]),
    ).toEqual(beforeLockRgba);
    const beforeDuplicate = (await customState(root)).operations.length;
    await page.keyboard.press("Control+d");
    await expect.poll(async () => (await customState(root)).operations.length).toBe(beforeDuplicate + 1);
    await showDockTab(page, "Layers");
    await expect(
      workspace.getByRole("listbox", { name: "banner-cell-selected layers" }).getByRole("option"),
    ).toHaveCount(6);
    await expect(workspace.locator("#layer-selection-count")).toHaveText("3 selected, locked");
    await page.keyboard.press("Control+c");
    await expect(workspace.getByRole("status")).toHaveText("3 layers copied inside this project.");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(
      workspace.getByRole("listbox", { name: "banner-cell-selected layers" }).getByRole("option"),
    ).toHaveCount(3);
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(
      workspace.getByRole("listbox", { name: "banner-cell-selected layers" }).getByRole("option"),
    ).toHaveCount(6);
    await expect(workspace.locator("#layer-selection-count")).toHaveText("3 selected, locked");
    const beforeUnlock = (await customState(root)).operations.length,
      unlockSequence = await page.locator(".status").getAttribute("data-accepted-sequence");
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
    await page.keyboard.press("Control+Alt+Shift+l");
    await expect(page.locator(".status")).not.toHaveAttribute("data-accepted-sequence", unlockSequence!);
    await expect.poll(async () => (await customState(root)).operations.length).toBe(beforeUnlock + 1);
    await expect
      .poll(async () => {
        const operation = (await customState(root)).operations.at(-1) as {
          type?: string;
          locks?: { locked: boolean }[];
        };
        return [operation.type, operation.locks?.map(({ locked }) => locked)];
      })
      .toEqual(["set-layer-locks", [false, false, false]]);
    await expect(workspace.locator("#layer-selection-count")).toHaveText("3 selected");
    await expect(workspace.locator('.creator-layer-row[data-locked="true"]')).toHaveCount(3);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(workspace.locator('.creator-layer-row[data-locked="true"]')).toHaveCount(6);
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(workspace.locator('.creator-layer-row[data-locked="true"]')).toHaveCount(3);
    await workspace.getByRole("button", { name: "top-background", exact: true }).click();
    const topBeforePaste = await workspace
      .getByRole("listbox", { name: "top-background layers" })
      .getByRole("option")
      .count();
    await workspace.locator('[data-workspace-surface="top-background"]').evaluate((canvas) => {
      canvas.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: new DataTransfer(),
        }),
      );
    });
    await expect(workspace.getByRole("listbox", { name: "top-background layers" }).getByRole("option")).toHaveCount(
      topBeforePaste + 3,
    );
    await expect(workspace.locator("#layer-selection-count")).toHaveText("3 selected, locked");
    await expect(workspace.locator('.creator-layer-row[data-locked="true"]')).toHaveCount(3);
    const pastedPrimary = workspace
      .getByRole("listbox", { name: "top-background layers" })
      .locator('[aria-current="true"]');
    await expect(pastedPrimary).toBeFocused();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(workspace.getByRole("listbox", { name: "top-background layers" }).getByRole("option")).toHaveCount(
      topBeforePaste,
    );
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(workspace.getByRole("listbox", { name: "top-background layers" }).getByRole("option")).toHaveCount(
      topBeforePaste + 3,
    );
    await expect(workspace.locator("#layer-selection-count")).toHaveText("3 selected, locked");
    await workspace.locator('[data-workspace-surface="top-background"]').evaluate((canvas, bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([Uint8Array.from(bytes)], "image-wins.png", {
          type: "image/png",
        }),
      );
      canvas.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: transfer,
        }),
      );
    }, imageBytes);
    await expect(workspace.getByRole("listbox", { name: "top-background layers" }).getByRole("option")).toHaveCount(
      topBeforePaste + 4,
    );
    await expect(workspace.getByRole("button", { name: "Select image-wins.png" })).toBeVisible();
    await workspace.getByRole("button", { name: "banner-cell-selected", exact: true }).click();
    await page.keyboard.press("Control+Shift+g");
    await expect(workspace.locator(".layer-group-label")).toHaveCount(3);
    await expect(workspace.locator('.creator-layer-row[data-locked="true"]')).toHaveCount(3);
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Open project" }).click();
    await workspace.getByRole("button", { name: "banner-cell-selected", exact: true }).click();
    await expect(workspace.locator(".layer-group-label")).toHaveCount(3);
    await expect(workspace.locator('.creator-layer-row[data-locked="true"]')).toHaveCount(3);
    await expect(workspace.getByRole("button", { name: "Paste layers", exact: true })).toBeDisabled();

    await workspace.getByRole("button", { name: "bottom-background", exact: true }).click();
    const staleCanvas = workspace.locator('[data-workspace-surface="bottom-background"]'),
      staleLayers = workspace.getByRole("listbox", {
        name: "bottom-background layers",
      }),
      uniqueImageBytes = [...neutralPreviewPngVariantV1];
    await staleCanvas.evaluate((canvas, bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(bytes)], "stale.png", { type: "image/png" }));
      canvas.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: transfer,
        }),
      );
    }, uniqueImageBytes);
    await expect(staleLayers.getByRole("option")).toHaveCount(1);
    await workspace.getByRole("button", { name: "Select stale.png" }).click();
    await page.keyboard.press("Control+c");
    await expect(workspace.getByRole("status")).toHaveText("1 layer copied inside this project.");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(staleLayers.getByRole("option")).toHaveCount(0);
    await workspace.getByRole("button", { name: "Add rectangle" }).click();
    await expect(staleLayers.getByRole("option")).toHaveCount(1);
    const beforeStalePaste = (await customState(root)).operations.length;
    await staleCanvas.evaluate((canvas) =>
      canvas.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: new DataTransfer(),
        }),
      ),
    );
    await expect(workspace.getByRole("status")).toHaveText(
      "Nothing valid is available in the internal layer clipboard.",
    );
    expect((await customState(root)).operations.length).toBe(beforeStalePaste);
    await expect(staleLayers.getByRole("option")).toHaveCount(1);
    await workspace.getByRole("button", { name: "Delete Rectangle" }).click();
    await expect(staleLayers.getByRole("option")).toHaveCount(0);

    await workspace.getByRole("button", { name: "scrim", exact: true }).click();
    await workspace.getByRole("button", { name: "Add text" }).click();
    await expect(workspace.getByRole("button", { name: "Select Text" })).toHaveAttribute("aria-current", "true");
    await showDockTab(page, "Properties");
    await workspace.getByLabel("Text content").fill("A\n😀");
    await workspace.getByLabel("Text color hex").fill("#abcdef");
    await workspace.getByLabel("Text pixel size").fill("1");
    await workspace.getByLabel("Text alignment").selectOption("right");
    await workspace.getByRole("button", { name: "Apply text" }).click();
    await expect(workspace.getByRole("status")).toHaveText("Text updated.");
    await workspace.getByRole("button", { name: "Rotate Text right" }).click();
    await expect(workspace.getByLabel("Layer rotation")).toHaveValue("90");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(workspace.getByLabel("Layer rotation")).toHaveValue("0");
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(workspace.getByLabel("Layer rotation")).toHaveValue("90");
    const textX = Number(await workspace.getByLabel("X", { exact: true }).inputValue());
    await showDockTab(page, "Layers");
    await workspace.getByRole("button", { name: "Select Text" }).press("ArrowRight");
    await showDockTab(page, "Properties");
    await expect(workspace.getByLabel("X", { exact: true })).toHaveValue(String(textX + 1));
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(workspace.getByLabel("X", { exact: true })).toHaveValue(String(textX));
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(workspace.getByLabel("X", { exact: true })).toHaveValue(String(textX + 1));
    const scrimCanvas = workspace.locator('[data-workspace-surface="scrim"]');
    await scrimCanvas.focus();
    await scrimCanvas.press("Escape");
    await showDockTab(page, "Layers");
    await expect(workspace.getByRole("button", { name: "Select Text" })).not.toHaveAttribute("aria-current", "true");
    await showDockTab(page, "Properties");
    await expect(workspace.getByText("Nothing selected", { exact: true })).toBeVisible();
    await expect(scrimCanvas).toHaveAttribute("data-crop-mode", "false");
    const browserTextRgba = Uint8Array.from(
        await scrimCanvas.evaluate((canvas) => [
          ...(canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 8, 42).data,
        ]),
      ),
      expectedTextRgba = compositeCustomLayersV1(
        8,
        42,
        [
          {
            kind: "text",
            id: "e2e-text",
            order: 0,
            content: "A\n😀",
            fill: "#abcdef",
            scale: 1,
            alignment: "right",
            opacity: 65536,
            rotation: 90,
            destinationQ16: {
              x: (textX + 1) * 65536,
              y: Math.floor(42 / 4) * 65536,
              width: Math.floor(8 / 2) * 65536,
              height: Math.floor(42 / 2) * 65536,
            },
          },
        ],
        [],
      );
    expect(browserTextRgba).toEqual(expectedTextRgba);

    await workspace.getByRole("button", { name: "grid-cell", exact: true }).click();
    await showDockTab(page, "Layers");
    await gridLayer.click();
    await expect(gridLayer).toHaveAttribute("aria-current", "true");
    await workspace.getByRole("button", { name: "banner-cell", exact: true }).click();
    await page.getByRole("button", { name: "Save" }).click();
    const publicationSequence = await page.locator(".status").getAttribute("data-accepted-sequence");
    await page.getByRole("button", { name: "Open project" }).click();
    await expect(page.locator(".status")).not.toHaveAttribute("data-accepted-sequence", publicationSequence!);
    await workspace.getByRole("button", { name: "grid-cell-selected", exact: true }).click();
    await showDockTab(page, "Layers");
    await workspace.getByRole("button", { name: "Select Rectangle" }).click();
    await showDockTab(page, "Properties");
    await expect(workspace.getByLabel("Fill color hex")).toHaveValue("#123456");
    await workspace.getByRole("button", { name: "scrim", exact: true }).click();
    await showDockTab(page, "Layers");
    await workspace.getByRole("button", { name: "Select Text" }).click();
    await showDockTab(page, "Properties");
    await expect(workspace.getByLabel("Text content")).toHaveValue("A\n😀");
    await expect(workspace.getByLabel("Text color hex")).toHaveValue("#abcdef");
    await expect(workspace.getByLabel("Text pixel size")).toHaveValue("1");
    await expect(workspace.getByLabel("Text alignment")).toHaveValue("right");
    await expect(workspace.getByLabel("Layer rotation")).toHaveValue("90");
    await workspace.getByRole("button", { name: "grid-cell", exact: true }).click();
    await showDockTab(page, "Layers");
    await expect(workspace.getByRole("listbox", { name: "grid-cell layers" }).getByRole("option")).toHaveCount(1);
    await workspace.getByRole("button", { name: "Select dropped.png" }).click();
    await showDockTab(page, "Properties");
    await expect(workspace.getByLabel("Layer rotation")).toHaveValue("90");
    await workspace.getByRole("button", { name: "banner-cell", exact: true }).click();
    await showDockTab(page, "Layers");
    await expect(workspace.getByRole("listbox", { name: "banner-cell layers" }).getByRole("option")).toHaveCount(1);
    await workspace.getByRole("button", { name: "Select pasted.png" }).click();
    await showDockTab(page, "Properties");
    await expect(workspace.getByLabel("Crop x", { exact: true })).not.toHaveValue("0");
    drawer = await openProjectDrawer(page, "Export");
    const authoredRailHashes = Object.fromEntries(
      await drawer
        .locator("[data-custom-output]")
        .evaluateAll((outputs) =>
          outputs.map((output) => [
            output.getAttribute("data-custom-output")!,
            output.getAttribute("data-output-hash")!,
          ]),
        ),
    );

    await drawer.getByRole("button", { name: "Run diagnostics" }).click();
    await expect(drawer.getByText("1 diagnostics", { exact: true })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Export theme" })).toBeDisabled();
    await closeProjectDrawer(page);
    await certifyCurrentVisual(page, projectRoot);
    drawer = await openProjectDrawer(page, "Export");
    await drawer.getByRole("button", { name: "Run diagnostics" }).click();
    await expect(drawer.getByText("0 diagnostics", { exact: true })).toBeVisible();
    await drawer.getByRole("button", { name: "Export theme" }).click();
    await expect(drawer.getByTestId("export-summary")).toBeVisible();
    const reportBytes = await readFile(path.join(root, "export/theme/report.json"));
    const zipBytes = await readFile(path.join(root, "export/theme.zip"));
    const report = JSON.parse(reportBytes.toString()) as {
      compatibility: { evidence: { path: string; blobOid: string; sha256: string }[] };
      evidenceBoundary: unknown;
      files: { path: string; bytes: number; sha256: string }[];
    };
    expect(report.compatibility.evidence).toEqual(launcherV1Fixture.sources);
    expect(report.evidenceBoundary).toEqual({
      softwareFixtureOnly: true,
      hardwareParityClaimed: false,
    });
    expect(await readFile(path.join(root, "export/theme/sounds/navigation.wav"))).toEqual(testWav());
    expect(await readFile(path.join(root, "export/theme/gridcell.bin"))).not.toEqual(fallbackBytes.get("gridcell.bin"));
    expect(await readFile(path.join(root, "export/theme/gridcellSelected.bin"))).not.toEqual(
      fallbackBytes.get("gridcellSelected.bin"),
    );
    expect(await readFile(path.join(root, "export/theme/bannerListCell.bin"))).not.toEqual(
      fallbackBytes.get("bannerListCell.bin"),
    );
    const coupled = new Set([
      "topbg.bin",
      "gridcell.bin",
      "gridcellPltt.bin",
      "gridcellSelected.bin",
      "gridcellSelectedPltt.bin",
      "bannerListCell.bin",
      "bannerListCellPltt.bin",
      "bannerListCellSelected.bin",
      "bannerListCellSelectedPltt.bin",
      "scrim.bin",
      "scrimPltt.bin",
    ]);
    for (const filePath of visualPaths) {
      const authored = await readFile(path.join(root, "export/theme", filePath));
      expect(authoredRailHashes[filePath], `${filePath} rail/export parity`).toBe(sha256(authored));
      if (!coupled.has(filePath)) {
        expect(authored, filePath).toEqual(fallbackBytes.get(filePath));
        expect(authoredRailHashes[filePath], `${filePath} rail isolation`).toBe(fallbackRailHashes[filePath]);
      }
    }
    expect(storedManifest(zipBytes)).toEqual([
      ...report.files,
      {
        path: "report.json",
        bytes: reportBytes.length,
        sha256: sha256(reportBytes),
      },
    ]);
    expect(await drawer.getByTestId("export-summary").getAttribute("data-zip-sha256")).toBe(sha256(zipBytes));

    await closeProjectDrawer(page);
    await workspace.getByRole("button", { name: "scrim", exact: true }).click();
    await showDockTab(page, "Layers");
    const persistedText = workspace.getByRole("button", {
      name: "Select Text",
    });
    await persistedText.click();
    await workspace.getByRole("button", { name: "Delete Text" }).press("Enter");
    await expect(workspace.getByRole("status")).toHaveText("Text deleted.");
    await expect(workspace.getByRole("button", { name: "Import image" })).toBeFocused();
    await expect(persistedText).toHaveCount(0);
    await workspace.getByRole("button", { name: "banner-cell", exact: true }).click();
    const selectedBanner = workspace.getByRole("button", {
      name: "Select pasted.png",
    });
    await selectedBanner.click();
    await expect(selectedBanner).toHaveAttribute("aria-current", "true");
    await showDockTab(page, "Properties");
    await bannerCanvas.evaluate(
      (canvas, layer) => {
        const bounds = canvas.getBoundingClientRect(),
          options = {
            bubbles: true,
            pointerId: 92,
            clientX: bounds.left + ((layer.x + layer.width) * bounds.width) / 256,
            clientY: bounds.top + ((layer.y + layer.height / 2) * bounds.height) / 49,
          };
        canvas.dispatchEvent(new PointerEvent("pointerdown", options));
        canvas.dispatchEvent(
          new PointerEvent("pointermove", {
            ...options,
            clientX: options.clientX + 12,
          }),
        );
      },
      {
        x: Number(await workspace.getByLabel("X", { exact: true }).inputValue()),
        y: Number(await workspace.getByLabel("Y", { exact: true }).inputValue()),
        width: Number(await workspace.getByLabel("Width", { exact: true }).inputValue()),
        height: Number(await workspace.getByLabel("Height", { exact: true }).inputValue()),
      },
    );
    const replacementRoot = path.join(root, "replacement-project");
    await mkdir(replacementRoot);
    await writeFile(path.join(root, "project-selection.txt"), replacementRoot);
    await createCustomFromChrome(page);
    await bannerCanvas.dispatchEvent("pointerup", { pointerId: 92 });
    await expect(workspace.getByRole("button", { name: "top-background", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(workspace.getByRole("button", { name: "Select pasted.png" })).toHaveCount(0);
    await expect(workspace.locator('[aria-current="true"]')).toHaveCount(0);
  } finally {
    await closeElectronApp(electronApp);
    await rm(root, { recursive: true, force: true });
  }
});
