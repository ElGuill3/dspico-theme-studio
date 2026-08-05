import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { MaterialProjectV1, OperationV2 } from "../../../../packages/theme-core/src/index.js";
import { createPreviewModel, type PreviewModel } from "../../../../packages/theme-core/src/preview.js";
import {
  createCustomRenderPlan,
  type RenderSurfacePlanV1,
} from "../../../../packages/theme-core/src/render-plan-v2.js";
import type { StudioApi, StudioResult } from "../studio-ipc.js";
import { DraftAuthority, type DraftEdit } from "./draft-authority.js";
import { ReadOnlyWorkspace } from "./workspace/read-only-workspace.js";
import { paintWorkspaceSurface } from "./workspace/workspace-model.js";

declare global {
  interface Window {
    studio: StudioApi;
  }
}

const metadataDefaults = {
  name: "My Material theme",
  description: "A focused theme for DSpico",
  author: "Theme author",
};
const colorDefaults = { background: "#10243a", foreground: "#f7fafc", accent: "#f04491" };
const colorKeys = ["background", "foreground", "accent"] as const;
const screens = ["top", "bottom"] as const;
const validHex = (value: unknown): value is string => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
type ColorKey = (typeof colorKeys)[number];
type Screen = (typeof screens)[number];
type LauncherView = "coverflow" | "banner-list";
type ScreenColors = Record<Screen, Partial<Record<ColorKey, string>>>;
type Draft = {
  metadata: MaterialProjectV1["metadata"];
  global: Record<ColorKey, string>;
  screens: Record<string, ScreenColors>;
};

const globalColor = (project: MaterialProjectV1, key: ColorKey) =>
  validHex(project.tokens[key]) ? project.tokens[key] : colorDefaults[key];

function draftFromProject(project: MaterialProjectV1): Draft {
  const modes = [...new Set(["home", ...project.scenes.map(({ mode }) => mode)])];
  return {
    metadata: { ...project.metadata },
    global: Object.fromEntries(colorKeys.map((key) => [key, globalColor(project, key)])) as Draft["global"],
    screens: Object.fromEntries(
      modes.map((mode) => [
        mode,
        Object.fromEntries(
          screens.map((screen) => {
            const scene = project.scenes.find((candidate) => candidate.mode === mode && candidate.screen === screen);
            return [
              screen,
              Object.fromEntries(
                colorKeys.flatMap((key) => (validHex(scene?.overrides[key]) ? [[key, scene.overrides[key]]] : [])),
              ),
            ];
          }),
        ),
      ]),
    ) as Draft["screens"],
  };
}

function effectiveGlobal(draft: Draft, project: MaterialProjectV1, key: ColorKey): string {
  return validHex(draft.global[key]) ? draft.global[key] : globalColor(project, key);
}

function previewProject(project: MaterialProjectV1, draft: Draft, mode: string): MaterialProjectV1 {
  const basePreview = createPreviewModel(project, mode);
  const scenes = project.scenes.map((scene) => ({ ...scene, overrides: { ...scene.overrides } }));
  for (const screen of screens) {
    const previewScene = basePreview.scenes.find((scene) => scene.screen === screen)!;
    let scene = scenes.find(({ id }) => id === previewScene.id);
    if (!scene) {
      scene = { id: previewScene.id, screen, mode: basePreview.mode, overrides: {} };
      scenes.push(scene);
    }
    for (const key of colorKeys) {
      const value = draft.screens[basePreview.mode]?.[screen]?.[key];
      if (validHex(value)) scene.overrides[key] = value;
    }
  }
  return {
    ...project,
    metadata: { ...draft.metadata },
    tokens: {
      ...project.tokens,
      ...Object.fromEntries(colorKeys.map((key) => [key, effectiveGlobal(draft, project, key)])),
    },
    scenes,
  };
}

function PhysicalPreview({
  launcherView,
  renderSurface,
  scene,
  screen,
}: {
  launcherView: LauncherView;
  renderSurface?: RenderSurfacePlanV1;
  scene?: PreviewModel["scenes"][number];
  screen: Screen;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const background = validHex(scene?.tokens.background) ? scene.tokens.background : colorDefaults.background;
  const accent = validHex(scene?.tokens.accent) ? scene.tokens.accent : colorDefaults.accent;
  const foreground = validHex(scene?.tokens.foreground) ? scene.tokens.foreground : colorDefaults.foreground;
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (context) paintWorkspaceSurface(context, { background, accent }, false, renderSurface);
  }, [accent, background, renderSurface]);
  return (
    <section className={`physical-preview ${screen}-preview`} aria-label={`${screen} screen preview`}>
      <div className="screen-heading">
        <strong>{screen} display</strong>
        <span>256×192</span>
      </div>
      <div
        className={`ds-screen ${screen}`}
        data-mode={scene?.mode ?? "empty"}
        data-screen={screen}
        style={
          {
            "--screen-bg": background,
            "--screen-accent": accent,
            "--screen-ink": foreground,
          } as React.CSSProperties
        }
      >
        {renderSurface && (
          <canvas
            ref={canvas}
            className="device-render-canvas"
            data-render-plan-screen={screen}
            width={renderSurface.width}
            height={renderSurface.height}
            role="img"
            aria-label={`${screen} custom theme render`}
          />
        )}
        <span
          aria-hidden="true"
          className={`launcher-overlay ${launcherView}-${screen}`}
          data-launcher-overlay={`${launcherView}-${screen}`}
        />
      </div>
    </section>
  );
}

type ColorFieldProps = {
  label: string;
  value: string;
  disabled: boolean;
  onChange(value: string): void;
  onBlur(): void;
  field: string;
};

function ColorField({ label, value, disabled, onChange, onBlur, field }: ColorFieldProps) {
  const valid = validHex(value);
  return (
    <label className={`color-field${valid ? "" : " invalid"}`}>
      <span>{label}</span>
      <span className="color-inputs">
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={valid ? value : colorDefaults.background}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
        <input
          className="hex-input"
          data-draft-field={field}
          aria-label={`${label} hex`}
          value={value}
          disabled={disabled}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
      </span>
      {!valid && <small role="alert">Use a six-digit hex value, such as #10243a.</small>}
    </label>
  );
}

function Studio() {
  const [result, setResult] = useState<StudioResult>();
  const [status, setStatus] = useState("Create or open a local project to begin.");
  const [mode, setMode] = useState("home");
  const [launcherView, setLauncherView] = useState<LauncherView>("coverflow");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>({ metadata: metadataDefaults, global: colorDefaults, screens: {} });
  const resultRef = useRef(result);
  const draftRef = useRef(draft);
  const modeRef = useRef(mode);
  const requestSequence = useRef(0);
  const acceptedSequence = useRef(0);
  const mounted = useRef(true);
  const authorityRef = useRef<DraftAuthority | null>(null);

  useEffect(() => {
    const denyExternalNavigation = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (anchor && new URL(anchor.href).origin !== window.location.origin) event.preventDefault();
    };
    document.addEventListener("click", denyExternalNavigation, true);
    return () => document.removeEventListener("click", denyExternalNavigation, true);
  }, []);
  useEffect(() => {
    resultRef.current = result;
  }, [result]);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const acceptResult = (next: StudioResult, sequence: number, resynchronize: boolean) => {
    if (!mounted.current || sequence < acceptedSequence.current) return;
    acceptedSequence.current = sequence;
    resultRef.current = next;
    setResult(next);
    if (resynchronize && next.project) {
      const nextDraft = draftFromProject(next.project);
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      const preview = createPreviewModel(next.project, modeRef.current);
      modeRef.current = preview.mode;
      setMode(preview.mode);
    }
  };

  const persistedField = (field: string, project: MaterialProjectV1, editMode: string): string | undefined => {
    const [scope, first, second] = field.split(".");
    if (scope === "metadata") return project.metadata[first as keyof MaterialProjectV1["metadata"]];
    if (scope === "global") return globalColor(project, first as ColorKey);
    const scene = project.scenes.find(
      ({ mode: candidateMode, screen }) => candidateMode === editMode && screen === first,
    );
    const value = scene?.overrides[second as ColorKey];
    return validHex(value) ? value : undefined;
  };

  const patchDraft = (field: string, value: string | undefined) => {
    setDraft((current) => {
      const [scope, first, second] = field.split(".");
      if (scope === "metadata") return { ...current, metadata: { ...current.metadata, [first]: value ?? "" } };
      if (scope === "global")
        return { ...current, global: { ...current.global, [first]: value ?? colorDefaults[first as ColorKey] } };
      const editMode = scope.slice("scene:".length);
      const modeScreens = current.screens[editMode] ?? { top: {}, bottom: {} };
      return {
        ...current,
        screens: {
          ...current.screens,
          [editMode]: {
            ...modeScreens,
            [first]: { ...modeScreens[first as Screen], [second!]: value },
          },
        },
      };
    });
  };

  const invalidateArtifacts = () => {
    const current = resultRef.current;
    if (
      !current ||
      (current.diagnostics === undefined && current.receipt === undefined && current.canExport === undefined)
    )
      return;
    const next = { ...current, diagnostics: undefined, receipt: undefined, canExport: undefined };
    resultRef.current = next;
    setResult(next);
  };

  const persistDraft = async (_field: string, edit: DraftEdit) => {
    const sequence = ++requestSequence.current;
    setStatus("Saving local changes…");
    const next = await window.studio.edit(edit.operation);
    acceptResult(next, sequence, false);
    if (mounted.current) setStatus("Changes saved atomically.");
  };

  if (!authorityRef.current) {
    authorityRef.current = new DraftAuthority({
      persist: persistDraft,
      onDraftChange: invalidateArtifacts,
      onInvalid: ([field]) => {
        setStatus("Fix the invalid hex value before continuing. The first invalid field is focused.");
        const target = document.querySelector<HTMLElement>(`[data-draft-field="${field}"]`);
        target?.closest("details")?.setAttribute("open", "");
        target?.focus();
      },
      onFailure: (field, edit, error, isLatest) => {
        if (!mounted.current) return;
        const project = resultRef.current?.project;
        if (project && isLatest) patchDraft(field, persistedField(field, project, edit.mode));
        setStatus(error instanceof Error ? `${error.message} Draft was not saved.` : "The draft was not saved.");
      },
    });
  }
  const authority = authorityRef.current;

  useEffect(
    () => () => {
      mounted.current = false;
      authority.dispose();
    },
    [authority],
  );

  const run = async (label: string, action: () => Promise<StudioResult>, resynchronize = false) => {
    if (authority.invalidFields().length > 0) {
      await authority.run(action);
      return;
    }
    setBusy(true);
    try {
      let sequence = 0;
      const outcome = await authority.run(() => {
        sequence = ++requestSequence.current;
        return action();
      });
      if (!outcome.ran) return;
      const next = outcome.value;
      if (resynchronize) authority.reset();
      acceptResult(next, sequence, resynchronize);
      if (mounted.current) setStatus(label);
    } catch (error) {
      if (mounted.current) setStatus(error instanceof Error ? error.message : "The action could not be completed.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const updateMetadata = (field: keyof Draft["metadata"], value: string) => {
    patchDraft(`metadata.${field}`, value);
    if (resultRef.current?.project) {
      authority.schedule(`metadata.${field}`, { version: 1, type: "set-metadata", field, value }, modeRef.current);
    }
  };

  const updateGlobal = (key: ColorKey, value: string) => {
    patchDraft(`global.${key}`, value);
    authority.schedule(
      `global.${key}`,
      { version: 1, type: "set-token", key, value },
      modeRef.current,
      validHex(value),
    );
  };

  const updateScreen = (screen: Screen, key: ColorKey, value: string) => {
    const project = resultRef.current?.project;
    if (!project) return;
    const activeMode = createPreviewModel(project, modeRef.current).mode;
    const scene = createPreviewModel(project, activeMode).scenes.find((candidate) => candidate.screen === screen)!;
    const field = `scene:${activeMode}.${screen}.${key}`;
    patchDraft(field, value);
    authority.schedule(
      field,
      { version: 1, type: "set-scene-token", sceneId: scene.id, screen, mode: activeMode, key, value },
      activeMode,
      validHex(value),
    );
  };

  // prettier-ignore
  const addLayer = (screen: Screen) => void run("Layer added.", async () => {
    const author = draftRef.current.metadata.author, imported = await window.studio.importPng({ source: "Local user-selected PNG", author, credit: author, license: "User supplied", terms: "User supplied", notice: "User supplied artwork", intendedUse: `${screen} theme background`, rightsToExport: true }), asset = imported.asset!, ordinal = resultRef.current?.customProject?.documents.find((document) => document.screen === screen)?.layers.length ?? 0;
    return window.studio.editCustom({ version: 2, type: "add-layer", screen, layer: { id: `${screen}-${asset.sourceSha256.slice(0, 12)}-${ordinal}`, name: asset.originalName, visible: true, opacity: 65536, asset: { path: `assets/sha256/${asset.sourceSha256}.png`, sha256: asset.sourceSha256 }, xQ16: 0, yQ16: 0, width: asset.width, height: asset.height, widthQ16: asset.width * 65536, heightQ16: asset.height * 65536, crop: { x: 0, y: 0, width: asset.width, height: asset.height } } });
  });
  const editLayer = (operation: OperationV2) => void run("Layer updated.", () => window.studio.editCustom(operation));

  const project = result?.project;
  const customProject = result?.customProject;
  const customRenderPlan = customProject ? createCustomRenderPlan(customProject) : undefined;
  const preview = project ? createPreviewModel(previewProject(project, draft, mode), mode) : undefined;
  const livePreview = Boolean(preview || customRenderPlan);
  const loaded = Boolean(project || customProject);

  return (
    <main className="studio-shell">
      <header className="studio-header">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="brand-copy">
          <h1 aria-label="DSpico Theme Studio">Pico Theme Creator</h1>
          <p>Identity workshop</p>
        </div>
        <nav className="project-actions" aria-label="Project actions">
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              run(
                "Local project created.",
                () => window.studio.create({ projectId: "local-material", metadata: draftRef.current.metadata }),
                true,
              )
            }
          >
            New project
          </button>
          <button disabled={busy} onClick={() => run("Project opened.", window.studio.open, true)}>
            Open
          </button>
          {/* prettier-ignore */}
          <button disabled={busy} onClick={() => run("Custom project created.", () => window.studio.createCustom({ projectId: "local-custom", metadata: draftRef.current.metadata }), true)}>New custom</button>
          <button disabled={busy} onClick={() => run("Custom project opened.", window.studio.openCustom, true)}>
            Open custom
          </button>
          <button disabled={!loaded || busy} onClick={() => run("Project saved.", window.studio.save)}>
            Save
          </button>
        </nav>
        <span className="target-label">dspico-launcher-v1</span>
      </header>

      <div className="utility-bar">
        <span className="history-label">History</span>
        <button disabled={!loaded || busy} onClick={() => run("Undone.", window.studio.undo, true)}>
          Undo
        </button>
        <button disabled={!loaded || busy} onClick={() => run("Redone.", window.studio.redo, true)}>
          Redo
        </button>
        <p className="status" aria-live="polite">
          <span aria-hidden="true" />
          {status}
        </p>
      </div>

      <div className="workspace">
        <section className="editor-region" aria-labelledby="editor-region-title">
          <div className="editor-region-bar">
            <div>
              <span>Authoring workspace</span>
              <h2 id="editor-region-title">Composition</h2>
            </div>
            <details className="project-settings">
              <summary>Project settings</summary>
              <section className="inspector" aria-labelledby="project-settings-title">
                <div className="inspector-heading">
                  <div>
                    <span>Inspector</span>
                    <h2 id="project-settings-title">Project settings</h2>
                  </div>
                  <strong>{project?.metadata.name ?? customProject?.metadata.name ?? "No project loaded"}</strong>
                </div>
                <section className="control-group" aria-labelledby="general-title">
                  <h2 id="general-title">General</h2>
                  <label>
                    <span>Name</span>
                    <input
                      aria-label="Name"
                      value={draft.metadata.name}
                      disabled={busy || Boolean(customProject)}
                      data-draft-field="metadata.name"
                      onChange={(event) => updateMetadata("name", event.target.value)}
                      onBlur={() => void authority.flushField("metadata.name")}
                    />
                  </label>
                  <label>
                    <span>Description</span>
                    <textarea
                      aria-label="Description"
                      value={draft.metadata.description}
                      disabled={busy || Boolean(customProject)}
                      data-draft-field="metadata.description"
                      rows={3}
                      onChange={(event) => updateMetadata("description", event.target.value)}
                      onBlur={() => void authority.flushField("metadata.description")}
                    />
                  </label>
                  <label>
                    <span>Author</span>
                    <input
                      aria-label="Author"
                      value={draft.metadata.author}
                      disabled={busy || Boolean(customProject)}
                      data-draft-field="metadata.author"
                      onChange={(event) => updateMetadata("author", event.target.value)}
                      onBlur={() => void authority.flushField("metadata.author")}
                    />
                  </label>
                </section>
                <section className="control-group" aria-labelledby="global-title">
                  <h2 id="global-title">Global colors</h2>
                  <p>Shared by both screens until an override is set.</p>
                  {colorKeys.map((key) => (
                    <ColorField
                      key={key}
                      label={`Global ${key}`}
                      value={draft.global[key]}
                      disabled={!project || busy}
                      field={`global.${key}`}
                      onChange={(value) => updateGlobal(key, value)}
                      onBlur={() => void authority.flushField(`global.${key}`)}
                    />
                  ))}
                </section>
                {screens.map((screen) => (
                  <section className="control-group screen-group" aria-labelledby={`${screen}-title`} key={screen}>
                    <h2 id={`${screen}-title`}>{screen === "top" ? "Top screen" : "Bottom screen"}</h2>
                    <p>
                      Overrides for the active <strong>{preview?.mode ?? mode}</strong> mode.
                    </p>
                    {colorKeys.map((key) => {
                      const value = project
                        ? (draft.screens[preview?.mode ?? mode]?.[screen]?.[key] ??
                          effectiveGlobal(draft, project, key))
                        : colorDefaults[key];
                      return (
                        <ColorField
                          key={key}
                          label={`${screen} ${key}`}
                          value={value}
                          disabled={!project || busy}
                          field={`scene:${preview?.mode ?? mode}.${screen}.${key}`}
                          onChange={(next) => updateScreen(screen, key, next)}
                          onBlur={() => void authority.flushField(`scene:${preview?.mode ?? mode}.${screen}.${key}`)}
                        />
                      );
                    })}
                  </section>
                ))}
                <section className="delivery-panel" aria-labelledby="delivery-title">
                  <div>
                    <span>Project delivery</span>
                    <h2 id="delivery-title">Diagnostics &amp; export</h2>
                  </div>
                  <dl>
                    <div>
                      <dt>Project</dt>
                      <dd>{project?.metadata.name ?? customProject?.metadata.name ?? "Not loaded"}</dd>
                    </div>
                    <div>
                      <dt>Diagnostics</dt>
                      <dd>{result?.diagnostics?.length ?? "Not run"}</dd>
                    </div>
                  </dl>
                  {result?.diagnostics && result.diagnostics.length > 0 && (
                    <ul className="diagnostic-list" aria-label="Compatibility diagnostics">
                      {result.diagnostics.map((diagnostic) => (
                        <li key={diagnostic.fingerprint} data-diagnostic-rule={diagnostic.ruleId}>
                          <strong>{diagnostic.severity}</strong>
                          <code>
                            {diagnostic.location.document}
                            {diagnostic.location.pointer || "/"}
                          </code>
                          <span>{diagnostic.message}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="checks">
                    <button
                      disabled={!loaded || busy}
                      onClick={() => run("Validation complete.", window.studio.validate)}
                    >
                      Run diagnostics
                    </button>
                    <button
                      className="primary"
                      disabled={!loaded || busy}
                      onClick={() => run("Local theme exported.", window.studio.export)}
                    >
                      Export theme
                    </button>
                  </div>
                  {result?.receipt && (
                    <output
                      data-testid="export-receipt"
                      data-report-sha256={result.receipt.reportSha256}
                      data-zip-sha256={result.receipt.zipSha256}
                    >
                      <strong>Export receipt</strong>
                      <span>{result.receipt.files.join(" · ")}</span>
                      <code>{result.receipt.reportSha256}</code>
                    </output>
                  )}
                </section>
              </section>
            </details>
          </div>
          {/* prettier-ignore */}
          <ReadOnlyWorkspace scenes={preview?.scenes} customProject={customProject} renderPlan={customRenderPlan} onAdd={addLayer} onOperation={editLayer} />
        </section>

        <aside className="preview-panel" aria-labelledby="preview-title">
          <div className="preview-toolbar">
            <div>
              <span>Live device</span>
              <h2 id="preview-title">DSi XL preview</h2>
            </div>
            <div className="preview-controls">
              {preview && (
                <div className="preview-control">
                  <span id="scene-mode-label">Theme scene</span>
                  <div className="mode-switcher" role="group" aria-labelledby="scene-mode-label">
                    {preview.modes.map((item) => (
                      <button
                        className={item === preview.mode ? "active" : ""}
                        aria-pressed={item === preview.mode}
                        disabled={busy}
                        key={item}
                        onClick={() => setMode(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="preview-control">
                <span id="launcher-view-label">Preview view</span>
                <div className="mode-switcher" role="group" aria-labelledby="launcher-view-label">
                  <button
                    className={launcherView === "coverflow" ? "active" : ""}
                    aria-pressed={launcherView === "coverflow"}
                    onClick={() => setLauncherView("coverflow")}
                  >
                    Coverflow
                  </button>
                  <button
                    className={launcherView === "banner-list" ? "active" : ""}
                    aria-pressed={launcherView === "banner-list"}
                    onClick={() => setLauncherView("banner-list")}
                  >
                    Banner list
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="device-stage">
            <div className="device-shell" aria-label="DSpico dual-screen device preview">
              <span className="device-chrome" data-preview-chrome="device-frame" aria-hidden="true" />
              <PhysicalPreview
                launcherView={launcherView}
                renderSurface={customRenderPlan?.screens[0]}
                scene={preview?.scenes[0]}
                screen="top"
              />
              <PhysicalPreview
                launcherView={launcherView}
                renderSurface={customRenderPlan?.screens[1]}
                scene={preview?.scenes[1]}
                screen="bottom"
              />
            </div>
          </div>
          <div className="preview-caption">
            <span className={livePreview ? "state-dot ready" : "state-dot"} aria-hidden="true" />
            <p>
              <strong>{livePreview ? "Draft preview is live" : "Preview ready"}</strong>
              {livePreview
                ? "Local edits appear immediately; validated exports remain authoritative."
                : "Create or open a local project to begin authoring."}
            </p>
            {livePreview && (
              <div className="fidelity-tags">
                <span>launcher-vector-backed</span>
                <span>Chromium approximation</span>
              </div>
            )}
          </div>
        </aside>
      </div>
      <footer>
        <span>DSpico Theme Studio</span>
        <span>Local files only · Material authoring · No cloud or AI services</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Studio />);
