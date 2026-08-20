import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import { certifyCurrentVisual } from "./visual-receipt.js";
import { neutralPreviewPngV1 } from "../packages/test-fixtures/src/neutral-preview-png.js";

test("owns the viewport with one dock and an overlay project drawer", async () => {
  test.setTimeout(120_000);
  const root = await mkdtemp(path.join(os.tmpdir(), "dspico-workspace-e2e-"));
  const projectRoot = path.join(root, "custom-project");
  const screenshots = process.env.DSPICO_SCREENSHOT_DIR;
  await mkdir(projectRoot);
  await mkdir(path.join(root, "export"));
  await writeFile(path.join(root, "project-selection.txt"), projectRoot);
  await writeFile(
    path.join(root, "input.wav"),
    Buffer.from(
      "524946462800000057415645666d742010000000010001002256000044ac00000200100064617461040000000000e803",
      "hex",
    ),
  );
  await writeFile(path.join(root, "input.png"), neutralPreviewPngV1);
  const packagedExecutable = process.env.DSPICO_PACKAGED_EXECUTABLE;
  const app = await electron.launch({
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
    const page = await app.firstWindow();
    await page
      .getByRole("dialog", { name: "Build a theme in seven documents" })
      .getByRole("button", { name: "Close help" })
      .click();
    await expect(page.getByRole("heading", { name: "Pico Theme Creator" })).toHaveCount(0);
    await expect(page.getByAltText("Pico Theme Creator")).toBeVisible();
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({ path: path.join(screenshots, "launch.png") });
    }

    await page.getByRole("button", { name: "New custom", exact: true }).click();
    const workspace = page.getByRole("region", { name: "Theme canvas" });
    await expect(workspace).toBeVisible();
    expect(
      await page.evaluate(() => ({
        bodyOverflow: getComputedStyle(document.body).overflow,
        rootOverflow: getComputedStyle(document.documentElement).overflow,
        scroll: document.scrollingElement!.scrollHeight === document.scrollingElement!.clientHeight,
      })),
    ).toEqual({ bodyOverflow: "hidden", rootOverflow: "hidden", scroll: true });
    if ((await page.locator("#workspace-dock").count()) === 0)
      await page.getByRole("button", { name: "Open workspace dock" }).click();
    const dock = page.locator("#workspace-dock");
    const expectCustomPreviewProgress = async (started: number, placeholders: readonly string[]) => {
      const shell = dock.locator('.device-shell[data-preview-state="partial"]');
      await expect(dock.getByRole("heading", { name: "Preview unavailable" })).toHaveCount(0);
      await expect(dock.getByText("Preview in progress", { exact: true })).toBeVisible();
      await expect(dock.getByText(`${started} of 7 roles started`, { exact: true })).toBeVisible();
      await expect(dock.getByText(`Still placeholders: ${placeholders.join(", ")}`, { exact: true })).toBeVisible();
      await expect(dock.getByText("Draft preview is live", { exact: true })).toHaveCount(0);
      await expect(dock.locator("[data-fidelity]")).toHaveCount(0);
      await expect(dock.locator("[data-launcher-screen]")).toHaveCount(2);
      await expect(dock.locator("[data-launcher-chrome]")).toHaveCount(2);
      await expect(dock.locator("[data-preview-chrome]")).toHaveCount(1);
      await expect(shell).toHaveAttribute("data-placeholder-roles", placeholders.join(" "));
    };
    const roles = [
      "top-background",
      "bottom-background",
      "grid-cell",
      "grid-cell-selected",
      "banner-cell",
      "banner-cell-selected",
      "scrim",
    ];
    await dock.getByRole("tab", { name: "Preview" }).click();
    await expectCustomPreviewProgress(0, roles);
    const emptyEvidence = await dock.locator("[data-launcher-screen]").evaluateAll((canvases) =>
      canvases.map((canvas) => ({
        screen: canvas.getAttribute("data-launcher-screen"),
        evidence: canvas.getAttribute("data-canvas-evidence"),
      })),
    );
    expect(emptyEvidence.every(({ evidence }) => Boolean(evidence))).toBe(true);
    if (screenshots) await page.screenshot({ path: path.join(screenshots, "custom-preview-progress.png") });
    await dock.getByRole("tab", { name: "Layers" }).click();

    await workspace.getByRole("button", { name: "Import image" }).click();
    await expect(workspace.locator(".creator-layer-row")).toHaveCount(1);
    await dock.getByRole("tab", { name: "Preview" }).click();
    await expectCustomPreviewProgress(1, roles.slice(1));
    await expect(dock.locator('.device-shell[data-preview-state="partial"]')).toHaveAttribute(
      "data-started-roles",
      "top-background",
    );
    const oneRoleEvidence = await dock.locator("[data-launcher-screen]").evaluateAll((canvases) =>
      canvases.map((canvas) => ({
        screen: canvas.getAttribute("data-launcher-screen"),
        evidence: canvas.getAttribute("data-canvas-evidence"),
      })),
    );
    expect(oneRoleEvidence.find(({ screen }) => screen === "top")?.evidence).not.toBe(
      emptyEvidence.find(({ screen }) => screen === "top")?.evidence,
    );
    expect(oneRoleEvidence.find(({ screen }) => screen === "bottom")?.evidence).toBe(
      emptyEvidence.find(({ screen }) => screen === "bottom")?.evidence,
    );
    await dock.getByRole("tab", { name: "Layers" }).click();
    await workspace.getByRole("button", { name: "Add rectangle" }).click();
    await expect(workspace.locator(".creator-layer-row")).toHaveCount(2);
    await workspace.getByRole("button", { name: "Add ellipse" }).click();
    await expect(workspace.locator(".creator-layer-row")).toHaveCount(3);
    await workspace.getByRole("button", { name: "Add text" }).click();
    await expect(workspace.locator(".creator-layer-row")).toHaveCount(4);
    await expect(workspace.locator(".layer-thumbnail")).toHaveCount(4);
    await expect(workspace.locator('.creator-layer-row[data-selected="true"]')).toHaveCount(1);
    await workspace.getByRole("button", { name: "Hand pan tool" }).click();
    await expect(workspace.getByRole("button", { name: "Hand pan tool" })).toHaveAttribute("aria-pressed", "true");
    await expect(workspace.locator(".creator-layer-list").getByRole("button", { name: /^Select / })).toHaveCount(4);

    await expect(dock.getByRole("tabpanel")).toHaveCount(1);
    await dock.getByRole("tab", { name: "Properties" }).click();
    await expect(dock.getByRole("tabpanel")).toHaveCount(1);
    await dock.getByRole("tab", { name: "Preview" }).click();
    for (const view of ["Horizontal Grid", "Vertical Grid", "Coverflow", "Banner List"]) {
      await dock.getByRole("button", { name: view }).click();
      await expectCustomPreviewProgress(1, roles.slice(1));
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 900));
    await page.waitForFunction(() => innerWidth >= 1400);
    if (screenshots) await page.screenshot({ path: path.join(screenshots, "wide-editor-1440x900.png") });
    const stageBox = (await workspace.locator(".artboard-stage").boundingBox())!,
      toolsBox = (await workspace.locator(".tool-rail").boundingBox())!,
      dockBox = (await dock.boundingBox())!,
      collapseBox = (await dock.getByRole("button", { name: "Collapse workspace dock" }).boundingBox())!,
      constrained = stageBox.width;
    expect(toolsBox.x + toolsBox.width).toBeLessThanOrEqual(stageBox.x);
    expect(stageBox.x + stageBox.width).toBeLessThanOrEqual(dockBox.x);
    expect(Math.abs(collapseBox.x - dockBox.x)).toBeLessThanOrEqual(1);
    await dock.getByRole("button", { name: "Collapse workspace dock" }).click();
    await expect(dock).toHaveCount(0);
    const dockEdge = page.getByRole("button", { name: "Open workspace dock" });
    await expect(dockEdge).toBeVisible();
    const editorBox = (await workspace.locator(".creator-editor").boundingBox())!,
      dockEdgeBox = (await dockEdge.boundingBox())!;
    expect(Math.abs(dockEdgeBox.x + dockEdgeBox.width - (editorBox.x + editorBox.width))).toBeLessThanOrEqual(1);
    expect((await workspace.locator(".artboard-stage").boundingBox())!.width).toBeGreaterThan(constrained);
    if (screenshots) await page.screenshot({ path: path.join(screenshots, "wide-dock-closed.png") });
    await dockEdge.click();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#workspace-dock")).toHaveCount(0);
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#workspace-dock")).toBeVisible();
    await expect(
      page.getByRole("group", { name: "Preview mode" }).getByRole("button", { name: "Banner List" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Tab");
    await expect(page.locator(".tool-rail, #workspace-dock")).toHaveCount(0);
    await page.keyboard.press("Tab");
    await expect(page.locator(".tool-rail")).toBeVisible();

    await page.getByRole("button", { name: "Project", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Project" });
    await expect(drawer).toBeVisible();
    for (const tab of ["Details", "Assets", "Audio", "Export"]) {
      await drawer.getByRole("tab", { name: tab }).click();
      await expect(drawer.getByRole("tabpanel")).toHaveCount(1);
    }
    await drawer.getByRole("tab", { name: "Assets" }).click();
    for (const role of [
      "top-background",
      "bottom-background",
      "grid-cell",
      "grid-cell-selected",
      "banner-cell",
      "banner-cell-selected",
      "scrim",
    ]) {
      await drawer.getByRole("button", { name: `Assign ${role} PNG` }).click();
      await expect(drawer.getByRole("button", { name: `Replace ${role} PNG` })).toBeVisible();
    }
    await drawer.getByRole("tab", { name: "Audio" }).click();
    await drawer.locator('input[type="file"]').first().setInputFiles(path.join(root, "input.wav"));
    await expect(drawer.locator('[data-audio-role="navigation"]')).toHaveAttribute("data-state", "prepared");
    await drawer.getByRole("tab", { name: "Export" }).click();
    await drawer.getByRole("button", { name: "Run diagnostics" }).click();
    await expect(drawer.getByRole("button", { name: "Export theme" })).toBeDisabled();
    await drawer.getByRole("button", { name: "Close Project drawer" }).click();
    await expect(dock.locator("[data-launcher-screen]")).toHaveCount(2);
    await expect(dock.getByRole("heading", { name: "Preview unavailable" })).toHaveCount(0);
    await expect(dock.getByText("Preview in progress", { exact: true })).toHaveCount(0);
    await expect(dock.locator('.device-shell[data-preview-state="ready"]')).not.toHaveAttribute(
      "data-placeholder-roles",
    );
    await expect(dock.getByText("Draft preview is live", { exact: true })).toBeVisible();
    await expect(dock.locator("[data-fidelity]")).not.toHaveCount(0);
    await certifyCurrentVisual(page, projectRoot);
    await page.getByRole("button", { name: "Project", exact: true }).click();
    const certifiedDrawer = page.getByRole("dialog", { name: "Project" });
    await certifiedDrawer.getByRole("tab", { name: "Export" }).click();
    await certifiedDrawer.getByRole("button", { name: "Run diagnostics" }).click();
    await expect(certifiedDrawer.getByRole("button", { name: "Export theme" })).toBeEnabled();
    await certifiedDrawer.getByRole("button", { name: "Export theme" }).click();
    await expect(certifiedDrawer.getByTestId("export-summary")).toBeVisible();
    if (screenshots) await page.screenshot({ path: path.join(screenshots, "project-export-drawer.png") });
    await drawer.getByRole("tab", { name: "Details" }).click();
    const name = drawer.getByLabel("Name");
    await name.fill("Viewport typing");
    await name.press("Tab");
    await expect(page.locator(".tool-rail")).toBeVisible();
    await drawer.getByRole("button", { name: "Close Project drawer" }).focus();
    await page.keyboard.press("Tab");
    await expect(drawer.getByRole("tab", { name: "Details" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Project", exact: true })).toBeFocused();

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(800, 700));
    await page.waitForFunction(() => innerWidth <= 800);
    if ((await page.locator("#workspace-dock").count()) === 0)
      await page.getByRole("button", { name: "Open workspace dock" }).click();
    await expect(page.locator("#workspace-dock")).toHaveCSS("position", "absolute");
    expect(
      await page.evaluate(() => document.scrollingElement!.scrollHeight === document.scrollingElement!.clientHeight),
    ).toBe(true);
    if (screenshots) await page.screenshot({ path: path.join(screenshots, "narrow-800x700.png") });

    await page.getByRole("button", { name: "Save" }).click();
    const before = await readFile(path.join(projectRoot, "project.json"));
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.getByRole("button", { name: "Save" }).click();
    expect(await readFile(path.join(projectRoot, "project.json"))).toEqual(before);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
