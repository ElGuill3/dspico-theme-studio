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
    expect(renderer).toMatch(/event\.key === "Enter" && !event\.shiftKey[\s\S]{0,100}commitCustomMetadata\(field\)/);
    expect(renderer).toMatch(/event\.key === "Enter"\)[\s\S]{0,100}commitCustomMetadata\(field\)/);
  });

  it("labels only primaryColor and darkTheme as active Material authority", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");
    const preview = readFileSync(path.join(root, "packages/theme-core/src/preview.ts"), "utf8");
    expect(renderer).toContain("Only primary color and dark theme are consumed by the pinned launcher profile.");
    expect(renderer).toContain("scene migration values remain preserved but are not exported");
    expect(preview).toContain('properties: ["dimensions", "primaryColor", "darkTheme"]');
    expect(preview).not.toContain('"Material colors"');
  });

  it("uses a local package-driven launcher compositor without screenshot overlays", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");
    const css = readFileSync(path.join(rendererRoot, "studio.css"), "utf8");

    expect(renderer).toContain("workspaceLayout.normal.previewMode");
    expect(renderer).toContain('role="group" aria-label="Preview mode"');
    for (const label of ["Horizontal Grid", "Vertical Grid", "Banner List", "Coverflow"])
      expect(renderer).toContain(label);
    expect(renderer).toContain("renderLauncherPreview");
    expect(renderer).toContain("visualPackage.files");
    expect(renderer).toContain('kind: "material"');
    expect(renderer).toContain('data-fidelity="material-fields"');
    expect(renderer).toContain("frame.metadata.fidelity.materialFields");
    expect(renderer).toContain("data-preview-state={launcherPreview.kind}");
    expect(renderer).toContain("1:1 pixels");
    expect(renderer).toContain('data-pixel-scale={logicalPixels ? "1" : "device"}');
    expect(css).toMatch(/\.device-shell \{[\s\S]*?width: min\(350px, 100%, calc\(\(100vh - 205px\) \* 0\.9344\)\);/);
    expect(css).not.toContain("width: min(270px, 100%)");
    expect(css).toMatch(/\.device-shell\.logical-pixels \{[\s\S]*?width: 256px;[\s\S]*?aspect-ratio: auto;/);
    expect(css).toMatch(/\.logical-pixels \.device-render-canvas \{[\s\S]*?width: 256px;[\s\S]*?height: 192px;/);
    expect(renderer).not.toContain("material.primitives");
    expect(renderer).not.toMatch(/setLauncherView[\s\S]{0,120}window\.studio/);
    expect(renderer).not.toContain("scene.content");
    expect(renderer).not.toMatch(/launcher[-_]overlay/);
    expect(css).not.toContain("launcher-preview/");
    expect(readFileSync(path.join(root, "vite.renderer.config.mts"), "utf8")).toContain("assetsInlineLimit: 0");
    expect(readFileSync(path.join(root, "vite.e2e.config.mts"), "utf8")).toContain("assetsInlineLimit: 0");
  });

  it("captures dark-theme input before asynchronous Material preview persistence", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");

    expect(renderer).toContain("darkTheme: tokens.darkTheme");
    expect(renderer).toMatch(/aria-label="Dark theme"[\s\S]{0,500}const darkTheme = event\.target\.checked/);
    expect(renderer).toMatch(/const darkTheme = event\.target\.checked[\s\S]{0,500}value: darkTheme/);
  });

  it("wires an accessible creator Canvas workspace and inert preview chrome", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");
    const workspace = readFileSync(path.join(rendererRoot, "workspace/read-only-workspace.tsx"), "utf8");
    const css = readFileSync(path.join(rendererRoot, "studio.css"), "utf8");

    expect(renderer).toContain("<CreatorWorkspace");
    expect(workspace).toContain("width={width}");
    expect(workspace).toContain("height={height}");
    expect(workspace).toContain('aria-label="Theme documents"');
    expect(workspace).toContain("onPaste=");
    expect(workspace).toContain("onDrop=");
    expect(renderer).toContain('data-preview-chrome="device-frame"');
    expect(renderer).toContain('aria-hidden="true"');
    expect(css).toContain("--workspace-gap: 96px");
    expect(css).toContain("pointer-events: none");
  });

  it("uses a launch screen before rendering the full-viewport editor shell", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");
    const css = readFileSync(path.join(rendererRoot, "studio.css"), "utf8");

    expect(renderer).toContain('className="project-launch"');
    expect(renderer).toContain("{!loaded ? (");
    expect(renderer).toContain("<ProjectDrawer");
    expect(renderer).toContain("dockOpen={visibleLayout.dockOpen}");
    expect(renderer).toContain("toolbarVisible={visibleLayout.toolbarVisible}");
    expect(css).toMatch(/html,\s*body,\s*#root \{[\s\S]*?height: 100dvh;[\s\S]*?overflow: hidden;/);
    expect(css).toMatch(/\.studio-shell \{[\s\S]*?height: 100dvh;/);
    expect(css).toMatch(/\.creator-workspace \{[\s\S]*?grid-template-rows:/);
    expect(css).toContain(".project-drawer-content");
    expect(css).not.toMatch(/gradient\(/);
  });

  it("keeps the artboard first, stacks edit panels, and uses Preview as the alternate dock view", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8"),
      workspace = readFileSync(path.join(rendererRoot, "workspace/read-only-workspace.tsx"), "utf8"),
      css = readFileSync(path.join(rendererRoot, "studio.css"), "utf8"),
      artboard = workspace.indexOf("<Artboard"),
      dock = workspace.indexOf('id="workspace-dock"'),
      layers = workspace.indexOf('id="dock-panel-layers"'),
      properties = workspace.indexOf('id="dock-panel-properties"');
    expect(artboard).toBeGreaterThan(0);
    expect(artboard).toBeLessThan(dock);
    expect(workspace).toContain('role="group" aria-label="Workspace panels"');
    expect(workspace).toContain('dockTab !== "preview"');
    expect(workspace).toContain('dockTab === "preview"');
    expect(workspace).toContain("compact-${dockTab}");
    expect(layers).toBeGreaterThan(dock);
    expect(layers).toBeLessThan(properties);
    expect(workspace).not.toContain('role="tabpanel"');
    expect(renderer).toContain('pendingPanelFocus.current = "artboard"');
    expect(renderer).toContain("document.getElementById(`dock-panel-${pending}`)");
    expect(renderer).toContain('document.querySelector<HTMLElement>(".workspace-canvas")');
    expect(css).toContain(".dock-edit-stack");
  });

  it("keeps Inspector drafts outside dock view content and synchronizes layout storage events", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8"),
      workspace = readFileSync(path.join(rendererRoot, "workspace/read-only-workspace.tsx"), "utf8");
    expect(workspace).toContain("useState<InspectorDraftCache>");
    expect(workspace).toContain("readInspectorDraft(inspectorDrafts");
    expect(workspace).toContain("pruneInspectorDrafts(current, revisions)");
    expect(renderer).toContain("workspaceLayoutFromStorageEvent(event, layoutStorage)");
    expect(renderer).toContain('globalThis.addEventListener("storage", storage)');
    expect(renderer).toContain('globalThis.removeEventListener("storage", storage)');
  });

  it("makes dock width and edit split accessible, keyboard-resizable, and pointer-safe", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8"),
      workspace = readFileSync(path.join(rendererRoot, "workspace/read-only-workspace.tsx"), "utf8"),
      css = readFileSync(path.join(rendererRoot, "studio.css"), "utf8");
    expect(workspace.match(/role="separator"/g)).toHaveLength(2);
    expect(workspace).toContain('aria-orientation="vertical"');
    expect(workspace).toContain('aria-orientation="horizontal"');
    expect(workspace).toContain("aria-valuemin={MIN_WORKSPACE_DOCK_WIDTH}");
    expect(workspace).toContain("aria-valuemax={MAX_WORKSPACE_EDIT_SPLIT}");
    expect(workspace).toContain("aria-valuenow={dockWidth}");
    expect(workspace).toContain("aria-valuenow={editSplit}");
    expect(workspace).toContain("dockWidthAfterKey(dockWidth, event.key)");
    expect(workspace).toContain("editSplitAfterKey(editSplit, event.key)");
    expect(workspace).toContain("setPointerCapture(event.pointerId)");
    expect(workspace).toContain("onPointerCancel=");
    expect(workspace).toContain("onLostPointerCapture=");
    expect(workspace).toContain('globalThis.addEventListener("blur", stop)');
    expect(workspace).toContain('globalThis.document.body.classList.add("workspace-resizing")');
    expect(workspace).toContain('globalThis.document.body.classList.remove("workspace-resizing")');
    expect(workspace).toContain('"--workspace-dock-width"');
    expect(workspace).toContain('"--dock-edit-split"');
    expect(renderer).toContain("dockWidth={visibleLayout.dockWidth}");
    expect(renderer).toContain("editSplit={visibleLayout.editSplit}");
    expect(renderer).toContain("dockWidth: clampWorkspaceDockWidth(dockWidth)");
    expect(renderer).toContain("editSplit: clampWorkspaceEditSplit(editSplit)");
    expect(renderer).toContain(
      "else if (event.shiftKey && visible.dockOpen) pendingPanelFocus.current = visible.dockTab",
    );
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) var(--workspace-dock-width)");
    expect(css).toContain("flex: var(--dock-edit-split) 1 0");
    expect(css).toMatch(/\.layers-panel,\s*\.layer-inspector,\s*\.dock-preview \{[^}]*overflow-y: auto;/);
  });

  it("keeps the source-local logo in the launch card and removes branding from editor chrome", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8"),
      brand = readFileSync(path.join(rendererRoot, "brand-mark.tsx"), "utf8"),
      logo = readFileSync(path.join(rendererRoot, "assets/pico-theme-creator.svg"), "utf8");
    expect(renderer.match(/<BrandMark/g)).toHaveLength(1);
    expect(renderer).toContain('label="Pico Theme Creator"');
    expect(renderer).not.toContain("<h1>Pico Theme Creator</h1>");
    expect(brand).toContain('alt={label ?? ""}');
    expect(logo).toContain("Abstract dual-screen clamshell");
    expect(logo).toContain("#53d5e4");
    expect(logo).toContain("#ef4c9a");
    expect(logo).not.toMatch(/nintendo|ds xl/i);
  });

  it("routes toolbar actions through the existing workspace operations once", () => {
    const workspace = readFileSync(path.join(rendererRoot, "workspace/read-only-workspace.tsx"), "utf8");
    expect(workspace).toMatch(/aria-label="Import image"[\s\S]{0,220}onClick=\{\(\) => onAdd\(role\)\}/);
    expect(workspace).toMatch(/aria-label="Add rectangle"[\s\S]{0,220}addShape\("rectangle"\)/);
    expect(workspace).toMatch(/aria-label="Add ellipse"[\s\S]{0,220}addShape\("ellipse"\)/);
    expect(workspace).toMatch(/aria-label="Add text"[\s\S]{0,220}onClick=\{addText\}/);
    expect(workspace).toContain('aria-pressed={activeTool === "crop"}');
    expect(workspace).toContain('aria-pressed={activeTool === "hand"}');
  });

  it("keeps project administration in a focus-trapped internally scrolling drawer", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8"),
      drawer = readFileSync(path.join(rendererRoot, "project-drawer.tsx"), "utf8"),
      css = readFileSync(path.join(rendererRoot, "studio.css"), "utf8");
    expect(renderer).toContain('tab: "details"');
    expect(renderer).toContain('tab: "export"');
    expect(renderer).toContain("Optional compatibility sources");
    expect(drawer).toContain('role="dialog"');
    expect(drawer).toContain('role="tablist"');
    expect(drawer).toContain('event.key !== "Tab"');
    expect(drawer).toContain('event.key === "Escape"');
    expect(drawer).toContain("returnTo?.focus()");
    expect(css).toMatch(/\.project-drawer-content \{[\s\S]*?overflow: auto;/);
  });

  it("keeps tools left and the dock on the right, with a right-side narrow overlay", () => {
    const css = readFileSync(path.join(rendererRoot, "studio.css"), "utf8"),
      workspace = readFileSync(path.join(rendererRoot, "workspace/read-only-workspace.tsx"), "utf8"),
      collapseControl = workspace.indexOf('aria-label="Collapse workspace dock"'),
      dockTabs = workspace.indexOf('{(["layers", "properties", "preview"] as const)');
    expect(collapseControl).toBeGreaterThan(-1);
    expect(collapseControl).toBeLessThan(dockTabs);
    expect(css).toMatch(
      /\.creator-editor\.toolbar-visible\.dock-visible \{[^}]*grid-template-columns: 52px minmax\(0, 1fr\) var\(--workspace-dock-width\);/,
    );
    expect(css).toMatch(/\.workspace-dock \{[^}]*grid-column: 2;[^}]*border-left:/);
    expect(css).toMatch(/\.creator-editor\.toolbar-visible\.dock-visible \.workspace-dock \{[^}]*grid-column: 3;/);
    expect(css).toMatch(/\.dock-edge-tab \{[^}]*grid-column: 2;[^}]*border-left:/);
    expect(css).toMatch(/\.creator-editor\.toolbar-visible \.dock-edge-tab \{[^}]*grid-column: 3;/);
    expect(css).toMatch(
      /@media \(max-width: 1100px\)[\s\S]*?\.creator-editor \.workspace-dock[\s\S]*?position: absolute;/,
    );
    expect(css).toMatch(/@media \(max-width: 1100px\)[\s\S]*?\.creator-editor \.workspace-dock[^}]*right: 0;/);
    expect(css).toMatch(
      /@media \(max-width: 1100px\)[\s\S]*?\.dock-edit-stack\.compact-layers > \.layer-inspector,[\s\S]*?\.dock-edit-stack\.compact-properties > \.layers-panel[^}]*display: none;/,
    );
    expect(css).toMatch(/@media \(max-width: 1100px\)[\s\S]*?\.dock-stack-separator[^}]*display: none;/);
    expect(css).toMatch(/body,\s*#root[\s\S]*?overflow: hidden;/);
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
    expect(workspace).toContain("aria-label={ariaLabel}");
    expect(workspace).toContain('ariaLabel="Fill color hex"');
    expect(workspace).toContain('aria-label="Add text"');
    expect(workspace).toContain('aria-label="Text content"');
    expect(workspace).toContain('ariaLabel="Text color hex"');
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
      'aria-label="Toggle guides"',
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

  it("feeds role documents to the shared workspace and one compiled package to device Canvas", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");
    const workspace = readFileSync(path.join(rendererRoot, "workspace/read-only-workspace.tsx"), "utf8");

    expect(renderer).toContain("compileCustomVisualPackageV1(sources)");
    expect(renderer).toContain("visualCompositionCache.current");
    expect(renderer).toContain("customPreview={customPreview}");
    expect(renderer).toContain("renderLauncherPreview");
    expect(workspace).toContain("visualDocuments");
    expect(workspace).toContain("CUSTOM_VISUAL_ROLES_V1.map");
    expect(workspace).not.toContain("LauncherView");
  });

  it("exposes path-precise diagnostics for Material and Custom projects", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");

    expect(renderer).toMatch(/disabled=\{busy\}[\s\S]{0,120}run\("Validation complete\."/);
    expect(renderer).toMatch(/disabled=\{busy \|\| result\?\.canExport !== true\}[\s\S]{0,220}window\.studio\.export/);
    expect(renderer).toContain("result.diagnostics.map");
    expect(renderer).toContain("diagnostic.location.document");
    expect(renderer).toContain("diagnostic.location.pointer");
    expect(renderer).toContain("diagnostic.message");
  });

  it("uses one folder-oriented open action and capability-based export reveal", () => {
    const renderer = readFileSync(path.join(rendererRoot, "renderer.tsx"), "utf8");
    const preload = readFileSync(path.join(root, "apps/studio/src/preload.ts"), "utf8");
    expect(renderer).toContain("Material theme");
    expect(renderer).toContain("Custom theme");
    expect(renderer).toContain("Open project");
    expect(renderer).not.toContain(">Open custom<");
    expect(renderer).toContain("Project location");
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
    expect(shortcuts).toContain('id: "focus"');
    expect(shortcuts).toContain('id: "editor-focus"');
    expect(recovery).toContain('window.addEventListener("unhandledrejection"');
    expect(recovery).toContain("Committed work is saved in the project folder");
  });
});
