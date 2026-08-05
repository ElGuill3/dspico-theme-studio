import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rendererRoot = path.join(process.cwd(), "apps/studio/src/renderer");
const root = process.cwd();

describe("renderer shell", () => {
  it("loads CSS as a stylesheet while keeping inline styles forbidden", () => {
    const html = readFileSync(path.join(rendererRoot, "index.html"), "utf8");
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");

    expect(html).toContain("style-src 'self'");
    expect(html).not.toContain("'unsafe-inline'");
    expect(html).toContain('<link rel="stylesheet" href="./studio.css" />');
    expect(renderer).not.toContain('import "./studio.css"');
  });

  it("keeps live authoring bounded to identity fields and coalesced persistence", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");

    expect(renderer).toContain('const colorKeys = ["background", "foreground", "accent"] as const');
    expect(renderer).toContain("new DraftAuthority");
    expect(renderer).toContain('type: "set-scene-token"');
    expect(renderer).toContain('data-testid="export-receipt"');
    expect(renderer).not.toMatch(/image import|audio|custom icon|asset ingestion/i);
  });

  it("keeps launcher view selection local to the preview compositor", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");
    const css = readFileSync(path.join(rendererRoot, "studio.css"), "utf8");

    expect(renderer).toContain('useState<LauncherView>("coverflow")');
    expect(renderer).toContain('role="group" aria-labelledby="launcher-view-label"');
    expect(renderer).toContain('aria-pressed={launcherView === "coverflow"}');
    expect(renderer).toContain('aria-pressed={launcherView === "banner-list"}');
    expect(renderer).toContain("data-launcher-overlay={`${launcherView}-${screen}`}");
    expect(renderer).not.toMatch(/setLauncherView[\s\S]{0,120}window\.studio/);
    expect(renderer).not.toContain("scene.content");
    expect(renderer).not.toContain("launcher-items");
    expect(css).toContain('url("./assets/launcher-preview/coverflow-top.png")');
    expect(css).toContain('url("./assets/launcher-preview/coverflow-bottom.png")');
    expect(css).toContain('url("./assets/launcher-preview/banner-list-top.png")');
    expect(css).toContain('url("./assets/launcher-preview/banner-list-bottom.png")');
    expect(css).toContain("pointer-events: none");
    expect(readFileSync(path.join(root, "vite.renderer.config.mts"), "utf8")).toContain("assetsInlineLimit: 0");
    expect(readFileSync(path.join(root, "vite.e2e.config.mts"), "utf8")).toContain("assetsInlineLimit: 0");
  });

  it("wires an accessible read-only Canvas workspace and inert preview chrome", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");
    const workspace = readFileSync(path.join(rendererRoot, "workspace/read-only-workspace.tsx"), "utf8");
    const css = readFileSync(path.join(rendererRoot, "studio.css"), "utf8");

    expect(renderer).toContain("<ReadOnlyWorkspace");
    expect(workspace).toContain("width={SURFACE_SIZE.width}");
    expect(workspace).toContain("height={SURFACE_SIZE.height}");
    expect(workspace).toMatch(/role="group"[\s\S]{0,120}aria-label="Workspace view"/);
    expect(workspace).toContain('aria-label="Show pixel grid"');
    expect(renderer).toContain('data-preview-chrome="device-frame"');
    expect(renderer).toContain('aria-hidden="true"');
    expect(css).toContain("--workspace-gap: 96px");
    expect(css).toContain("pointer-events: none");
  });

  it("prioritizes the editor beside a persistent preview and keeps settings compact", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");
    const css = readFileSync(path.join(rendererRoot, "studio.css"), "utf8");

    expect(renderer.indexOf('className="editor-region"')).toBeLessThan(renderer.indexOf('className="preview-panel"'));
    expect(renderer).toMatch(/<details className="project-settings">\s*<summary>Project settings<\/summary>/);
    expect(renderer).toContain('className="inspector" aria-labelledby="project-settings-title"');
    expect(renderer).toMatch(/className="editor-region"[\s\S]*<ReadOnlyWorkspace[\s\S]*className="preview-panel"/);
    expect(renderer).toMatch(/target\?\.closest\("details"\)\?\.setAttribute\("open", ""\);[\s\S]*target\?\.focus\(\)/);
    expect(css).toMatch(/\.studio-shell \{[\s\S]*?width: 100%;/);
    expect(css).toMatch(/\.workspace \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(390px, 32vw\);/);
    expect(css).toMatch(/\.inspector \{[\s\S]*?top: 69px;[\s\S]*?bottom: 14px;[\s\S]*?overflow-y: auto;/);
    expect(css).toMatch(/\.preview-panel \{[\s\S]*?position: sticky;/);
    expect(css).toContain("summary:focus-visible");
  });

  it("keeps layer manipulation in independent accessible DOM controls", () => {
    const workspace = readFileSync(path.join(rendererRoot, "workspace/read-only-workspace.tsx"), "utf8");

    expect(workspace).toContain('aria-live="polite"');
    expect(workspace).toContain("aria-label={`Rename ${layer.name}`}");
    expect(workspace).toContain("set-layer-visibility");
    expect(workspace).toContain("reorder-layer");
    expect(workspace).toContain("remove-layer");
  });

  it("exposes validated layer properties without Canvas controls", () => {
    const workspace = readFileSync(path.join(rendererRoot, "workspace/read-only-workspace.tsx"), "utf8");

    for (const label of [
      "Layer x",
      "Layer y",
      "Layer width",
      "Layer height",
      "Crop x",
      "Crop y",
      "Crop width",
      "Crop height",
      "Opacity",
    ])
      expect(workspace).toContain(`label: "${label}"`);
    expect(workspace).toContain("set-layer-properties");
    expect(workspace).toContain("Apply properties");
  });

  it("feeds one pure Custom render plan to workspace and device Canvas", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");
    const workspace = readFileSync(path.join(rendererRoot, "workspace/read-only-workspace.tsx"), "utf8");

    expect(renderer).toContain("createCustomRenderPlan(customProject)");
    expect(renderer).toContain("renderSurface={customRenderPlan");
    expect(workspace).toContain("renderPlan");
    expect(workspace).not.toContain("LauncherView");
  });

  it("exposes path-precise diagnostics for Material and Custom projects", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");

    expect(renderer).toMatch(/disabled=\{!loaded \|\| busy\}[\s\S]{0,120}run\("Validation complete\."/);
    expect(renderer).toMatch(/disabled=\{!loaded \|\| busy\}[\s\S]{0,120}window\.studio\.export/);
    expect(renderer).toContain("result.diagnostics.map");
    expect(renderer).toContain("diagnostic.location.document");
    expect(renderer).toContain("diagnostic.location.pointer");
    expect(renderer).toContain("diagnostic.message");
  });
});
