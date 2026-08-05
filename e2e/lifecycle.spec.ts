import { createHash } from "node:crypto";
import { copyFile, mkdtemp, mkdir, readFile, rm, truncate } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { _electron as electron } from "playwright";

type BrowserStudio = {
  edit(operation: { version: 1; type: "set-token"; key: string; value: number }): Promise<unknown>;
  importPng(input: Record<string, string | boolean>): Promise<unknown>;
};

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const projectName = (page: Page) => page.locator("dt", { hasText: "Project" }).locator("..").locator("dd");
const customState = async (root: string) =>
  JSON.parse(await readFile(path.join(root, "project.json"), "utf8")) as { cursor: number; operations: unknown[] };

test("completes the offline Material and Custom lifecycles through the hardened Electron boundary", async () => {
  test.setTimeout(90_000);
  const root = await mkdtemp(path.join(os.tmpdir(), "dspico-studio-e2e-"));
  await mkdir(path.join(root, "export"));
  // prettier-ignore
  await copyFile(path.resolve("apps/studio/src/renderer/assets/launcher-preview/coverflow-bottom.png"), path.join(root, "input.png"));
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
    env: { ...process.env, DSPICO_STUDIO_E2E_ROOT: root, ELECTRON_DISABLE_SANDBOX: "1" },
  });
  try {
    const page = await electronApp.firstWindow();
    page.setDefaultTimeout(5_000);
    const projectSettings = page.locator("details.project-settings > summary");
    const workspace = page.getByRole("region", { name: "Canvas workspace" });
    const previewView = page.getByRole("group", { name: "Preview view" });
    const coverflow = previewView.getByRole("button", { name: "Coverflow" });
    const bannerList = previewView.getByRole("button", { name: "Banner list" });

    await test.step("Launch and shell boundary", async () => {
      await expect(page).toHaveURL("app://studio/index.html");
      await expect(page.getByRole("heading", { name: "DSpico Theme Studio" })).toBeVisible();
      await expect(page.getByText("Create or open a local project to begin authoring.")).toBeVisible();
      await expect(projectSettings).toBeVisible();
      await expect(projectSettings).toHaveText("Project settings");
      await expect(page.locator('[data-launcher-overlay="coverflow-top"]')).toBeVisible();
      await expect(page.locator('[data-launcher-overlay="coverflow-bottom"]')).toBeVisible();
      await expect(page.locator('[data-preview-chrome="device-frame"]')).toBeVisible();
      expect(
        await page.locator("[data-launcher-overlay], [data-preview-chrome]").evaluateAll((chrome) =>
          chrome.map((overlay) => ({
            ariaHidden: overlay.getAttribute("aria-hidden"),
            pointerEvents: getComputedStyle(overlay).pointerEvents,
            tabIndex: (overlay as HTMLElement).tabIndex,
          })),
        ),
      ).toEqual([
        { ariaHidden: "true", pointerEvents: "none", tabIndex: -1 },
        { ariaHidden: "true", pointerEvents: "none", tabIndex: -1 },
        { ariaHidden: "true", pointerEvents: "none", tabIndex: -1 },
      ]);

      await expect(workspace).toBeVisible();
      await expect(workspace.locator("canvas")).toHaveCount(2);
      expect(
        await workspace.locator("canvas").evaluateAll((canvases) =>
          canvases.map((canvas) => ({
            height: (canvas as HTMLCanvasElement).height,
            width: (canvas as HTMLCanvasElement).width,
          })),
        ),
      ).toEqual([
        { height: 192, width: 256 },
        { height: 192, width: 256 },
      ]);
      await workspace.getByRole("button", { name: "Bottom focus" }).click();
      await expect(workspace.locator('[data-workspace-surface="top"]')).toHaveCount(0);
      await expect(workspace.locator('[data-workspace-surface="bottom"]')).toBeVisible();
      await workspace.getByRole("button", { name: "Dual" }).click();
      await expect(workspace.locator("canvas")).toHaveCount(2);
      await expect(workspace.locator(".workspace-surfaces")).toHaveAttribute("data-workspace-gap", "96");

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
          "create",
          "createCustom",
          "edit",
          "editCustom",
          "export",
          "importPng",
          "open",
          "openCustom",
          "redo",
          "save",
          "undo",
          "validate",
        ],
        connectBlocked: true,
        inlineScriptBlocked: true,
        nodeProcess: "undefined",
        nodeRequire: "undefined",
        popupBlocked: true,
      });
      await page.evaluate(() => {
        const link = document.createElement("a");
        link.dataset.testid = "untrusted-navigation";
        link.href = "https://example.com/navigation-denied";
        link.textContent = "Untrusted navigation";
        document.body.append(link);
      });
      await page.getByTestId("untrusted-navigation").click({ noWaitAfter: true });
      await page.waitForTimeout(100);
      await expect(page).toHaveURL("app://studio/index.html");

      // prettier-ignore
      await expect(page.evaluate(() => (globalThis as typeof globalThis & { studio: BrowserStudio }).studio.importPng({ source: "https://example.test/pixel.png", author: "Ada", credit: "Ada", license: "CC-BY-4.0", terms: "Attribution required", notice: "Copyright Ada", intendedUse: "Custom theme background", rightsToExport: true }))).resolves.toHaveProperty("asset");
      await truncate(path.join(root, "input.png"), 16_777_217);
      // prettier-ignore
      await expect(page.evaluate(() => (globalThis as typeof globalThis & { studio: BrowserStudio }).studio.importPng({ source: "https://example.test/pixel.png", author: "Ada", credit: "Ada", license: "CC-BY-4.0", terms: "Attribution required", notice: "Copyright Ada", intendedUse: "Custom theme background", rightsToExport: true }))).rejects.toThrow("published limit");
    });

    await test.step("Material create, edit, and reopen", async () => {
      const name = page.getByLabel("Name");
      await projectSettings.click();
      await expect(name).toBeVisible();
      await name.fill("Original E2E theme");
      await page.getByRole("button", { name: "New project" }).click();
      await expect(projectName(page)).toHaveText("Original E2E theme");
      await page.getByLabel("Global background hex").fill("#123456");
      await expect(page.locator('[data-screen="bottom"]')).toHaveCSS("background-color", "rgb(18, 52, 86)");
      await page.getByLabel("Global background hex").blur();
      await page.getByLabel("Top background hex").fill("#654321");
      await expect(page.locator('[data-screen="top"]')).toHaveCSS("background-color", "rgb(101, 67, 33)");
      await page.getByLabel("Top background hex").blur();
      await expect(page.getByText("Changes saved atomically.")).toBeVisible();
      await page.getByLabel("Name").fill("Edited E2E theme");
      await page.getByLabel("Name").blur();
      await expect(projectName(page)).toHaveText("Edited E2E theme");
      await page.getByRole("button", { name: "Undo" }).click();
      await expect(projectName(page)).toHaveText("Original E2E theme");
      await page.getByRole("button", { name: "Redo" }).click();
      await expect(projectName(page)).toHaveText("Edited E2E theme");
      await page.getByRole("button", { name: "Save" }).click();
      await page.getByRole("button", { name: "Open", exact: true }).click();
      await expect(projectName(page)).toHaveText("Edited E2E theme");
      await expect(page.getByLabel("Global background hex")).toHaveValue("#123456");
      await expect(page.getByLabel("Top background hex")).toHaveValue("#654321");

      await expect(coverflow).toHaveAttribute("aria-pressed", "true");
      await bannerList.click();
      await expect(bannerList).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator('[data-launcher-overlay="banner-list-top"]')).toBeVisible();
      await expect(page.locator('[data-launcher-overlay="banner-list-bottom"]')).toBeVisible();
      await page.getByRole("button", { name: "Undo" }).click();
      await expect(projectName(page)).toHaveText("Original E2E theme");
      await page.getByRole("button", { name: "Redo" }).click();
      await expect(projectName(page)).toHaveText("Edited E2E theme");

      await page.evaluate(async () => {
        const studio = (globalThis as typeof globalThis & { studio: BrowserStudio }).studio;
        await studio.edit({ version: 1, type: "set-token", key: "coverStartScalePercent", value: 100 });
        await studio.edit({ version: 1, type: "set-token", key: "coverFinalAlpha", value: 12 });
        await studio.edit({ version: 1, type: "set-token", key: "scrimFinalAlpha", value: 14 });
      });
      await page.getByRole("button", { name: "Save" }).click();
    });

    const materialExport = await test.step("Material diagnostics and export", async () => {
      const projectBefore = await readFile(path.join(root, "project.json"));
      await page.getByRole("button", { name: "Run diagnostics" }).click();
      await expect(page.locator("dt", { hasText: "Diagnostics" }).locator("..").locator("dd")).toHaveText("0");
      await expect(page.locator('[data-screen="top"]')).toBeVisible();
      await expect(page.locator('[data-screen="bottom"]')).toBeVisible();
      await expect(page.getByText("launcher-vector-backed", { exact: true })).toBeVisible();
      await expect(page.getByText("Chromium approximation", { exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Export theme" }).click();
      const receipt = page.getByTestId("export-receipt");
      await expect(receipt).toBeVisible();
      const reportHash = await receipt.getAttribute("data-report-sha256");
      const zipHash = await receipt.getAttribute("data-zip-sha256");
      const reportBytes = await readFile(path.join(root, "export/theme/report.json"));
      const zipBytes = await readFile(path.join(root, "export/theme.zip"));
      const report = JSON.parse(reportBytes.toString()) as { files: { path: string; sha256: string }[] };
      const themeBytes = await readFile(path.join(root, "export/theme/theme.json"));
      expect(reportHash).toBe(sha256(reportBytes));
      expect(zipHash).toBe(sha256(zipBytes));
      expect(report.files).toEqual([{ path: "theme.json", bytes: themeBytes.length, sha256: sha256(themeBytes) }]);
      await expect(receipt).toContainText("theme/theme.json · theme/report.json · theme.zip");

      const reportBefore = await readFile(path.join(root, "export/theme/report.json"));
      const zipBefore = await readFile(path.join(root, "export/theme.zip"));
      const diagnosticsBefore = await page
        .locator("dt", { hasText: "Diagnostics" })
        .locator("..")
        .locator("dd")
        .textContent();
      const receiptBefore = await receipt.textContent();
      return { diagnosticsBefore, projectBefore, receipt, receiptBefore, reportBefore, zipBefore };
    });

    await test.step("Responsive invariants", async () => {
      const screenshotRoot = process.env.DSPICO_SCREENSHOT_DIR;
      if (screenshotRoot) {
        await mkdir(screenshotRoot, { recursive: true });
        await coverflow.focus();
        await coverflow.press("Enter");
        await expect(coverflow).toHaveAttribute("aria-pressed", "true");
        await page.setViewportSize({ width: 1180, height: 768 });
        await page.screenshot({ path: path.join(screenshotRoot, "coverflow-desktop.png"), fullPage: true });
        await bannerList.focus();
        await bannerList.press(" ");
        await expect(bannerList).toHaveAttribute("aria-pressed", "true");
        await page.screenshot({ path: path.join(screenshotRoot, "banner-list-desktop.png"), fullPage: true });
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
        await page.screenshot({ path: path.join(screenshotRoot, "banner-list-mobile-375.png"), fullPage: true });

      const windowDimensions = await electronApp.evaluate(({ BrowserWindow }) => {
        const browserWindow = BrowserWindow.getAllWindows()[0];
        if (!browserWindow) throw new Error("Electron BrowserWindow is unavailable");
        return { content: browserWindow.getContentSize(), outer: browserWindow.getSize() };
      });
      const responsiveEvidence = await page.evaluate(() => {
        const viewportWidth = window.innerWidth;
        const contentWidth = document.documentElement.scrollWidth;
        const previewPanel = document.querySelector<HTMLElement>(".preview-panel");
        return {
          contentWidth,
          mobileBreakpointActive: previewPanel !== null && getComputedStyle(previewPanel).position === "static",
          noHorizontalOverflow: contentWidth <= viewportWidth,
          overlayAlignment: [...document.querySelectorAll<HTMLElement>("[data-launcher-overlay]")].every((overlay) => {
            const overlayBounds = overlay.getBoundingClientRect();
            const screenBounds = overlay.parentElement!.getBoundingClientRect();
            return (
              Math.abs(overlayBounds.x - screenBounds.x) < 0.01 &&
              Math.abs(overlayBounds.y - screenBounds.y) < 0.01 &&
              Math.abs(overlayBounds.width - screenBounds.width) < 0.01 &&
              Math.abs(overlayBounds.height - screenBounds.height) < 0.01
            );
          }),
          viewportHeight: window.innerHeight,
          viewportWidth,
        };
      });
      console.info("Electron responsive dimensions", { renderer: responsiveEvidence, window: windowDimensions });
      expect(windowDimensions.outer).toEqual([375, 812]);
      expect(windowDimensions.content[0]).toBeLessThanOrEqual(windowDimensions.outer[0]);
      expect(responsiveEvidence.viewportWidth).toBe(windowDimensions.content[0]);
      expect(responsiveEvidence.viewportWidth).toBeGreaterThan(300);
      expect(responsiveEvidence.viewportWidth).toBeLessThanOrEqual(430);
      expect(responsiveEvidence).toMatchObject({
        mobileBreakpointActive: true,
        noHorizontalOverflow: true,
        overlayAlignment: true,
      });
      expect(await readFile(path.join(root, "project.json"))).toEqual(materialExport.projectBefore);
      expect(await readFile(path.join(root, "export/theme/report.json"))).toEqual(materialExport.reportBefore);
      expect(await readFile(path.join(root, "export/theme.zip"))).toEqual(materialExport.zipBefore);
      await expect(page.locator("dt", { hasText: "Diagnostics" }).locator("..").locator("dd")).toHaveText(
        materialExport.diagnosticsBefore ?? "",
      );
      await expect(materialExport.receipt).toHaveText(materialExport.receiptBefore ?? "");
      await expect(page.getByText("Local theme exported.")).toBeVisible();
      await projectSettings.click();
    });

    await test.step("Custom create, import, and render", async () => {
      // prettier-ignore
      await copyFile(path.resolve("apps/studio/src/renderer/assets/launcher-preview/coverflow-bottom.png"), path.join(root, "input.png"));
      await page.getByRole("button", { name: "New custom" }).click();
      await page.getByRole("button", { name: "Add top layer" }).click();
      const deviceTopCanvas = page.locator('[data-render-plan-screen="top"]');
      await expect(deviceTopCanvas).toBeVisible();
      await expect(page.locator('[data-render-plan-screen="bottom"]')).toBeVisible();
      const deviceTopOverlay = page.locator('[data-screen="top"] [data-launcher-overlay]');
      await expect(deviceTopOverlay).toBeVisible();
      expect(await deviceTopOverlay.getAttribute("data-launcher-overlay")).toBe("banner-list-top");
      const renderEvidence = await page
        .locator('[data-workspace-surface="top"], [data-render-plan-screen="top"]')
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
      expect(renderEvidence[0]?.pixels).toBe(renderEvidence[1]?.pixels);
      await projectSettings.click();
      await page.getByRole("button", { name: "Run diagnostics" }).click();
      await expect(page.locator("dt", { hasText: "Diagnostics" }).locator("..").locator("dd")).toHaveText("1");
      await expect(page.locator('[data-diagnostic-rule="custom.source-required"]')).toContainText(
        "project.json/documents/1/layers",
      );
      await projectSettings.click();
      const layerControl = workspace.getByRole("button", { name: "Select input.png" });
      await expect(layerControl).toBeVisible();
      await layerControl.click();
      await expect(layerControl).toHaveAttribute("aria-current", "true");
      const canvas = workspace.locator('[data-workspace-surface="top"]');
      await canvas.scrollIntoViewIfNeeded();
      const bounds = (await canvas.boundingBox())!;
      // prettier-ignore
      await canvas.dispatchEvent("pointerdown", { pointerId: 1, clientX: bounds.x + 8, clientY: bounds.y + 8, buttons: 1 });
      // prettier-ignore
      await canvas.dispatchEvent("pointermove", { pointerId: 1, clientX: bounds.x + 18, clientY: bounds.y + 13, buttons: 1 });
      // prettier-ignore
      await canvas.dispatchEvent("pointermove", { pointerId: 1, clientX: bounds.x + 28, clientY: bounds.y + 18, buttons: 1 });
      await canvas.dispatchEvent("pointerup", { pointerId: 1, clientX: bounds.x + 28, clientY: bounds.y + 18 });
      await expect.poll(async () => (await customState(root)).operations.length).toBe(2);
      const moved = await customState(root);
      expect(moved.operations).toHaveLength(2);
      expect(moved.cursor).toBe(2);
    });

    await test.step("Custom history and properties", async () => {
      await page.getByRole("button", { name: "Save" }).click();
      await page.getByRole("button", { name: "Open custom" }).click();
      await page.getByRole("button", { name: "Undo" }).click();
      await expect.poll(async () => (await customState(root)).cursor).toBe(1);
      await page.getByRole("button", { name: "Redo" }).click();
      await expect.poll(async () => (await customState(root)).cursor).toBe(2);
      await workspace.getByRole("button", { name: "Select input.png" }).press("ArrowRight");
      await expect.poll(async () => (await customState(root)).operations.length).toBe(3);

      await page.getByRole("button", { name: "Add top layer" }).click();
      await expect.poll(async () => (await customState(root)).operations.length).toBe(4);
      const topLayers = workspace.getByRole("list", { name: "top layers" });
      await expect(topLayers.getByRole("listitem")).toHaveCount(2);
      let controlled = topLayers.getByRole("listitem").nth(1);
      await controlled.getByRole("button", { name: "Hide" }).press("Enter");
      await expect.poll(async () => (await customState(root)).operations.length).toBe(5);
      await expect(workspace.getByRole("status")).toHaveText("input.png hidden.");
      const rename = controlled.getByLabel("Rename input.png");
      await rename.fill("Overlay");
      await rename.press("Enter");
      await expect.poll(async () => (await customState(root)).operations.length).toBe(6);
      await expect(workspace.getByRole("status")).toHaveText("input.png renamed to Overlay.");
      controlled = topLayers.getByRole("listitem").filter({ hasText: "Overlay" });
      await controlled.getByRole("button", { name: "Move Overlay down" }).press("Enter");
      await expect.poll(async () => (await customState(root)).operations.length).toBe(7);
      await controlled.getByRole("button", { name: "Select Overlay" }).click();
      await controlled.getByRole("button", { name: "Delete Overlay" }).press("Enter");
      await expect.poll(async () => (await customState(root)).operations.length).toBe(8);
      await expect(workspace.getByRole("status")).toHaveText("Overlay deleted.");
      await expect(topLayers.getByRole("button", { name: "Select input.png" })).toBeFocused();
      await page.getByRole("button", { name: "Save" }).click();
      await page.getByRole("button", { name: "Open custom" }).click();
      await page.getByRole("button", { name: "Undo" }).click();
      await expect.poll(async () => (await customState(root)).cursor).toBe(7);
      await expect(topLayers.getByRole("button", { name: "Select Overlay" })).toBeVisible();
      await page.getByRole("button", { name: "Redo" }).click();
      await expect.poll(async () => (await customState(root)).cursor).toBe(8);
      await expect(topLayers.getByRole("button", { name: "Select Overlay" })).toHaveCount(0);

      const properties = topLayers.getByRole("listitem").getByText("Properties", { exact: true });
      await properties.click();
      for (const [label, value] of [
        ["Layer x", "2"],
        ["Layer y", "3"],
        ["Layer width", "128"],
        ["Layer height", "96"],
        ["Crop x", "10"],
        ["Crop y", "10"],
        ["Crop width", "100"],
        ["Crop height", "80"],
        ["Opacity", "50"],
      ] as const)
        await topLayers.getByLabel(label).fill(value);
      await topLayers.getByRole("button", { name: "Apply properties" }).press("Enter");
      await expect.poll(async () => (await customState(root)).operations.length).toBe(9);
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
      await page.getByRole("button", { name: "Open custom" }).click();
      await page.getByRole("button", { name: "Undo" }).click();
      await expect.poll(async () => (await customState(root)).cursor).toBe(8);
      await page.getByRole("button", { name: "Redo" }).click();
      await expect.poll(async () => (await customState(root)).cursor).toBe(9);
    });

    await test.step("Custom diagnostics and export", async () => {
      await page.getByRole("button", { name: "Add bottom layer" }).click();
      await projectSettings.click();
      await page.getByRole("button", { name: "Run diagnostics" }).click();
      await expect(page.locator("dt", { hasText: "Diagnostics" }).locator("..").locator("dd")).toHaveText("0");
      await page.getByRole("button", { name: "Export theme" }).click();
      await expect(page.getByTestId("export-receipt")).toContainText(
        "theme/theme.json · theme/topbg.bin · theme/bottombg.bin · theme/report.json · theme.zip",
      );
      expect((await readFile(path.join(root, "export/theme/topbg.bin"))).length).toBe(98_304);
      expect((await readFile(path.join(root, "export/theme/bottombg.bin"))).length).toBe(98_304);
      const customReport = JSON.parse(await readFile(path.join(root, "export/theme/report.json"), "utf8")) as {
        sources: string[];
        lineage: unknown[];
      };
      expect(customReport.sources).toEqual([sha256(await readFile(path.join(root, "input.png")))]);
      expect(customReport.lineage).toHaveLength(2);
    });
  } finally {
    await electronApp.close();
    await rm(root, { recursive: true, force: true });
  }
});
