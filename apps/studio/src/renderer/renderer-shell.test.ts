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
});
