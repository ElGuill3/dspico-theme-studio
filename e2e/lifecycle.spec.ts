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

    await page.getByLabel("name").fill("Original E2E theme");
    await page.getByRole("button", { name: "New project" }).click();
    await expect(projectName(page)).toHaveText("Original E2E theme");
    await page.getByLabel("name").fill("Edited E2E theme");
    await page.getByRole("button", { name: "Apply name" }).click();
    await expect(projectName(page)).toHaveText("Edited E2E theme");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(projectName(page)).toHaveText("Original E2E theme");
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(projectName(page)).toHaveText("Edited E2E theme");
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Open" }).click();
    await expect(projectName(page)).toHaveText("Edited E2E theme");

    await page.evaluate(async () => {
      const studio = (globalThis as typeof globalThis & { studio: BrowserStudio }).studio;
      await studio.edit({ version: 1, type: "set-token", key: "coverStartScalePercent", value: 100 });
      await studio.edit({ version: 1, type: "set-token", key: "coverFinalAlpha", value: 12 });
      await studio.edit({ version: 1, type: "set-token", key: "scrimFinalAlpha", value: 14 });
    });
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
  } finally {
    await electronApp.close();
    await rm(root, { recursive: true, force: true });
  }
});
