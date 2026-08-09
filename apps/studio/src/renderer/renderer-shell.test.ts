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

  it("keeps identity edits coalesced while routing local image bytes through trusted IPC", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");

    expect(renderer).toContain('const colorKeys = ["background", "foreground", "accent"] as const');
    expect(renderer).toContain("new DraftAuthority");
    expect(renderer).toContain('data-testid="export-summary"');
    expect(renderer).toContain("window.studio.importPngBytes");
  });

  it("labels only primaryColor and darkTheme as active Material authority", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");
    const preview = readFileSync(path.join(root, "packages/theme-core/src/preview.ts"), "utf8");
    expect(renderer).toContain("Only these two fields are consumed by the pinned launcher profile.");
    expect(renderer).toContain("Preserved legacy migration data");
    expect(preview).toContain('properties: ["dimensions", "primaryColor", "darkTheme"]');
    expect(preview).not.toContain('"Material colors"');
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

  it("wires an accessible creator Canvas workspace and inert preview chrome", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");
    const workspace = readFileSync(path.join(rendererRoot, "workspace/read-only-workspace.tsx"), "utf8");
    const css = readFileSync(path.join(rendererRoot, "studio.css"), "utf8");

    expect(renderer).toContain("<CreatorWorkspace");
    expect(workspace).toContain("width={width}");
    expect(workspace).toContain("height={height}");
    expect(workspace).toMatch(/role="group" aria-label="Visual document"/);
    expect(workspace).toContain("onPaste=");
    expect(workspace).toContain("onDrop=");
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
    expect(renderer).toMatch(/className="editor-region"[\s\S]*<CreatorWorkspace[\s\S]*className="preview-panel"/);
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
    expect(workspace).toContain("event.metaKey");
    expect(workspace).toContain("event.repeat");
    expect(workspace).toContain("MAX_BATCH_LAYER_EDITS_V3");
    expect(workspace).toContain("Selection is limited to");
    expect(workspace).toContain('className="layer-select"');
    expect(workspace).toContain("set-layer-visibility");
    expect(workspace).toContain("reorder-layer");
    expect(workspace).toContain("remove-layer");
  });

  it("uses a project-local layer clipboard and exposes compact group commands", () => {
    const workspace = readFileSync(path.join(rendererRoot, "workspace/read-only-workspace.tsx"), "utf8");
    for (const label of ["Group", "Ungroup", "Duplicate", "Copy", "Paste"]) expect(workspace).toContain(label);
    expect(workspace).toContain("freezeLayerClipboardSnapshot");
    expect(workspace).toContain("MAX_DOCUMENT_LAYERS_V3");
    expect(workspace).toContain("firstPngFile");
    expect(workspace).toMatch(/if \(image\)[\s\S]{0,80}onImport/);
    expect(workspace).not.toContain("navigator.clipboard");
    expect(workspace).toContain("editingTarget(event.target)");
    expect(workspace).toContain('title={shortcutTitle("duplicate")}');
    expect(workspace).toContain('title={shortcutTitle("ungroup")}');
  });

  it("exposes keyboard-operable persistent layer locks without enabling locked edits", () => {
    const workspace = readFileSync(path.join(rendererRoot, "workspace/read-only-workspace.tsx"), "utf8");
    for (const label of ["Lock selection", "Unlock selection", "Unlock the complete selection"])
      expect(workspace).toContain(label);
    expect(workspace).toContain('type: "set-layer-locks"');
    expect(workspace).toContain("aria-pressed={layerLockedV3(layer)}");
    expect(workspace).toContain("disabled={protectedByLock}");
    expect(workspace).toContain("Locked layers cannot be edited, but visibility may still be toggled.");
    expect(workspace).toContain("editingTarget(event.target)");
  });

  it("invalidates active gestures before authoritative commands can resolve", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8"),
      workspace = readFileSync(path.join(rendererRoot, "workspace/read-only-workspace.tsx"), "utf8");
    expect(renderer).toContain("setWorkspaceAuthority((authority) => authority + 1)");
    expect(renderer).toContain("authorityVersion={workspaceAuthority}");
    expect(workspace).toContain("gestureAuthorityKey(documentKey, authorityVersion)");
    expect(workspace).toContain("drag.current.key !== authorityKey");
  });

  it("exposes validated selected-layer properties beside Canvas controls", () => {
    const workspace = readFileSync(path.join(rendererRoot, "workspace/read-only-workspace.tsx"), "utf8");

    for (const label of ["X", "Y", "Width", "Height", "Crop x", "Crop y", "Crop width", "Crop height", "Opacity"])
      expect(workspace).toContain(`label: "${label}"`);
    expect(workspace).toContain("set-layer-properties");
    expect(workspace).toContain("Apply");
    expect(workspace).toContain("resizeHandleAtPoint");
    expect(workspace).toContain("RESIZE_HANDLES.map");
    expect(workspace).toContain('className="canvas-resize-handle"');
    expect(workspace).toContain('addShape("rectangle")');
    expect(workspace).toContain('addShape("ellipse")');
    expect(workspace).toContain('aria-label="Fill color picker"');
    expect(workspace).toContain('aria-label="Fill color hex"');
    expect(workspace).toContain('aria-label="Add text"');
    expect(workspace).toContain('aria-label="Text content"');
    expect(workspace).toContain('aria-label="Text color hex"');
    expect(workspace).toContain('aria-label="Text pixel size"');
    expect(workspace).toContain('aria-label="Text alignment"');
    expect(workspace).toContain('aria-label="Layer rotation"');
    expect(workspace).toContain("Rotate left");
    expect(workspace).toContain("Rotate right");
    expect(workspace).toContain('aria-label="Enable snapping"');
    expect(workspace).toContain('aria-label="Snap grid size"');
    expect(workspace).toContain("Align to document");
    expect(workspace).toContain("data-snap-guides");
    expect(workspace).toContain("Crop image");
    expect(workspace).toContain("pointerCrop");
    expect(workspace).toContain('event.key === "Escape"');
    expect(workspace).toContain('event.key === "Enter"');
  });

  it("keeps zoom, pan, rulers, and guide preferences outside the Canvas raster", () => {
    const workspace = readFileSync(path.join(rendererRoot, "workspace/read-only-workspace.tsx"), "utf8");
    for (const label of [
      'aria-label="Zoom out"',
      'aria-label="Zoom in"',
      "Exact zoom percentage",
      "100%",
      "Fit",
      'aria-label="Show guides"',
      'aria-label="Lock guides"',
      "Add vertical",
      "Add horizontal",
      "Clear guides",
    ])
      expect(workspace).toContain(label);
    expect(workspace).toContain('className="artboard-ruler horizontal"');
    expect(workspace).toContain('className="artboard-ruler vertical"');
    expect(workspace).toContain("rulerKeyDown");
    expect(workspace).toContain("guideGestureKeyDown");
    expect(workspace).toContain('event.key === "Home"');
    expect(workspace).toContain('event.key === "End"');
    expect(workspace).not.toContain('role="slider"');
    expect(workspace).toContain("className={`document-guide");
    expect(workspace).toContain("event.button === 1");
    expect(workspace).toContain('event.code === "Space"');
    expect(workspace).toContain("event.ctrlKey || event.metaKey");
    expect(workspace).toContain("fitViewport");
    expect(workspace).toContain("zoomViewportAtPoint");
    expect(workspace).toMatch(/paintWorkspaceSurface\([\s\S]*?cropMode,\s*\[\],/);
  });

  it("feeds role documents to the shared workspace and a pure Custom plan to device Canvas", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");
    const workspace = readFileSync(path.join(rendererRoot, "workspace/read-only-workspace.tsx"), "utf8");

    expect(renderer).toContain("createCustomRenderPlan(customProject)");
    expect(renderer).toContain("renderSurface={customRenderPlan");
    expect(workspace).toContain("visualDocuments");
    expect(workspace).toContain("CUSTOM_VISUAL_ROLES_V1.map");
    expect(workspace).not.toContain("LauncherView");
  });

  it("exposes path-precise diagnostics for Material and Custom projects", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");

    expect(renderer).toMatch(/disabled=\{!loaded \|\| busy\}[\s\S]{0,120}run\("Validation complete\."/);
    expect(renderer).toMatch(
      /disabled=\{!loaded \|\| busy \|\| result\?\.canExport !== true\}[\s\S]{0,180}window\.studio\.export/,
    );
    expect(renderer).toContain("result.diagnostics.map");
    expect(renderer).toContain("diagnostic.location.document");
    expect(renderer).toContain("diagnostic.location.pointer");
    expect(renderer).toContain("diagnostic.message");
  });

  it("uses one folder-oriented open action and capability-based export reveal", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");
    const preload = readFileSync(path.join(root, "apps/studio/src/preload.ts"), "utf8");
    expect(renderer).toContain("New Material");
    expect(renderer).toContain("New Custom");
    expect(renderer).toContain("Open project");
    expect(renderer).not.toContain(">Open custom<");
    expect(renderer).toContain('aria-label="Project folder"');
    expect(renderer).toContain("Reveal folder");
    expect(renderer).toContain("Reveal ZIP");
    expect(preload).toContain('call({ kind: "reveal-export", revealId, target })');
    expect(preload).not.toMatch(/revealExport:.*path/);
  });

  it("keeps WAV authoring while presenting BGM as unavailable without evidence JSON controls", () => {
    const audio = readFileSync(path.join(rendererRoot, "audio-workbench.tsx"), "utf8");
    const preload = readFileSync(path.join(root, "apps/studio/src/preload.ts"), "utf8");
    expect(audio).toContain('accept=".wav,audio/wav"');
    expect(audio).toContain("BGM import is not available in this release");
    expect(audio).not.toMatch(/receipt/i);
    expect(audio).not.toContain(".bcstm");
    expect(preload).not.toContain("import-bcstm");
    expect(preload).not.toContain("record-receipt");
    for (const label of [
      "Trim start (ms)",
      "Trim end (ms)",
      "Fade in (ms)",
      "Fade out (ms)",
      "Gain (%)",
      "Remove {role} sound",
    ])
      expect(audio).toContain(label);
    expect(audio).toContain("element.pause()");
    expect(audio).toContain("URL.revokeObjectURL");
    expect(audio).toContain("playback does not claim hardware parity");
  });

  it("exposes one accessible onboarding/help source and stable renderer recovery", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");
    const help = readFileSync(path.join(rendererRoot, "help-dialog.tsx"), "utf8");
    const shortcuts = readFileSync(path.join(rendererRoot, "shortcuts.ts"), "utf8");
    const recovery = readFileSync(path.join(rendererRoot, "recovery-shell.tsx"), "utf8");
    expect(renderer).toContain("onboardingDismissed(localStorage)");
    expect(renderer).toMatch(/<HelpDialog\s+mode=\{helpMode\}/);
    expect(help).toContain('role="dialog" aria-modal="true"');
    expect(help).toContain('event.key === "Escape"');
    expect(help).toContain("SHORTCUTS.filter");
    expect(shortcuts).toContain('id: "guides"');
    expect(recovery).toContain('window.addEventListener("unhandledrejection"');
    expect(recovery).toContain("Committed work is saved in the project folder");
  });
});
