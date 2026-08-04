import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { _electron as electron } from "playwright";

type BrowserStudio = {
  edit(operation: { version: 1; type: "set-token"; key: string; value: number }): Promise<unknown>;
};

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const projectName = (page: Page) => page.locator("dt", { hasText: "Project" }).locator("..").locator("dd");

test("completes the offline Material lifecycle through the hardened Electron boundary", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dspico-studio-e2e-"));
  await mkdir(path.join(root, "export"));
  const electronApp = await electron.launch({
    args: [
      "--no-sandbox",
      "--headless",
      "--disable-gpu",
      "--ozone-platform=headless",
      path.resolve("dist/apps/studio/src/main.js"),
    ],
    env: { ...process.env, DSPICO_STUDIO_E2E_ROOT: root, ELECTRON_DISABLE_SANDBOX: "1" },
  });
  try {
    const page = await electronApp.firstWindow();
    await expect(page).toHaveURL("app://studio/index.html");
    await expect(page.getByRole("heading", { name: "DSpico Theme Studio" })).toBeVisible();
    await expect(page.getByText("Create or open a local project to begin authoring.")).toBeVisible();
    await expect(page.locator('[data-launcher-overlay="coverflow-top"]')).toBeVisible();
    await expect(page.locator('[data-launcher-overlay="coverflow-bottom"]')).toBeVisible();
    expect(
      await page.locator("[data-launcher-overlay]").evaluateAll((overlays) =>
        overlays.map((overlay) => ({
          ariaHidden: overlay.getAttribute("aria-hidden"),
          pointerEvents: getComputedStyle(overlay).pointerEvents,
          tabIndex: (overlay as HTMLElement).tabIndex,
        })),
      ),
    ).toEqual([
      { ariaHidden: "true", pointerEvents: "none", tabIndex: -1 },
      { ariaHidden: "true", pointerEvents: "none", tabIndex: -1 },
    ]);

    const denied = await page.evaluate(async () => {
      const global = globalThis as typeof globalThis & { studio: BrowserStudio; process?: unknown; require?: unknown };
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
      api: ["create", "edit", "export", "open", "redo", "save", "undo", "validate"],
      connectBlocked: true,
      inlineScriptBlocked: true,
      nodeProcess: "undefined",
      nodeRequire: "undefined",
      popupBlocked: true,
    });

    await page.getByLabel("Name").fill("Original E2E theme");
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
    await page.getByRole("button", { name: "Open" }).click();
    await expect(projectName(page)).toHaveText("Edited E2E theme");
    await expect(page.getByLabel("Global background hex")).toHaveValue("#123456");
    await expect(page.getByLabel("Top background hex")).toHaveValue("#654321");

    const previewView = page.getByRole("group", { name: "Preview view" });
    const coverflow = previewView.getByRole("button", { name: "Coverflow" });
    const bannerList = previewView.getByRole("button", { name: "Banner list" });
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
    expect(await readFile(path.join(root, "project.json"))).toEqual(projectBefore);
    expect(await readFile(path.join(root, "export/theme/report.json"))).toEqual(reportBefore);
    expect(await readFile(path.join(root, "export/theme.zip"))).toEqual(zipBefore);
    await expect(page.locator("dt", { hasText: "Diagnostics" }).locator("..").locator("dd")).toHaveText(
      diagnosticsBefore ?? "",
    );
    await expect(receipt).toHaveText(receiptBefore ?? "");
    await expect(page.getByText("Local theme exported.")).toBeVisible();
  } finally {
    await electronApp.close();
    await rm(root, { recursive: true, force: true });
  }
});
