import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  compileCustomVisualPackageV1,
  CUSTOM_VISUAL_ROLES_V1,
  type CustomVisualRoleV1,
} from "../../../../packages/dspico-contract/src/index.js";
import type {
  MaterialProjectV1,
  SetCustomLauncherLayoutV3,
  VisualDocumentOperationV3,
} from "../../../../packages/theme-core/src/index.js";
import { metadataErrorV3, type MetadataFieldV3 } from "../../../../packages/theme-core/src/limits-v3.js";
import { createPreviewModel, type PreviewModel } from "../../../../packages/theme-core/src/preview.js";
import type { CustomLauncherLayoutDtoV1, StudioApi, StudioResult } from "../studio-ipc.js";
import type { ThemeSoundRoleV1, WavRecipeV1 } from "../../../../packages/dspico-contract/src/theme-sounds-v1.js";
import { CustomAssetBench } from "./custom-asset-bench.js";
import { CustomOutputRail } from "./custom-output-rail.js";
import { AudioWorkbench } from "./audio-workbench.js";
import { BrandMark } from "./brand-mark.js";
import { DraftAuthority, type DraftEdit } from "./draft-authority.js";
import { ProjectDrawer, type ProjectDrawerTab } from "./project-drawer.js";
import { CreatorWorkspace, importedLayerSize, type CreatorWorkspaceHandle } from "./workspace/read-only-workspace.js";
import {
  clampWorkspaceDockWidth,
  clampWorkspaceEditSplit,
  loadWorkspaceLayout,
  saveWorkspaceLayout,
  toggleWorkspaceFocus,
  visibleWorkspaceLayout,
  workspaceLayoutFromStorageEvent,
  type WorkspaceDockTab,
  type WorkspaceLayoutState,
} from "./workspace/workspace-layout.js";
import { effectiveCustomVisualSourcesV3, type EffectiveCustomVisualCacheV3 } from "../custom-visuals-v3.js";
import { manualSdGuidance } from "./export-guidance.js";
import { flushDraftsForClose, isCancellation, safeErrorMessage } from "../app-resilience.js";
import { HelpDialog } from "./help-dialog.js";
import { dismissOnboarding, onboardingDismissed, suppressGlobalShortcut } from "./shortcuts.js";
import { GlobalFailureCapture, StudioErrorBoundary } from "./recovery-shell.js";
import type {
  CustomVisualPackageV1,
  CustomVisualSourceV1,
} from "../../../../packages/dspico-contract/src/custom-v1-3.js";
import { neutralLauncherFixtureV1 } from "./launcher-preview/fixture.js";
import {
  renderLauncherPreview,
  renderPartialCustomLauncherPreview,
  type LauncherPreviewFrameV1,
} from "./launcher-preview/render-launcher-preview.js";
import { CustomLauncherLayoutEditor } from "./custom-launcher-layout-editor.js";

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
type LauncherView = "horizontal-grid" | "vertical-grid" | "banner-list" | "coverflow";
type CustomLauncherPreviewState =
  | { kind: "not-custom" }
  | {
      kind: "partial";
      sources: readonly CustomVisualSourceV1[];
      startedRoles: readonly CustomVisualRoleV1[];
      placeholderRoles: readonly CustomVisualRoleV1[];
    }
  | { kind: "invalid" }
  | { kind: "ready"; visualPackage: CustomVisualPackageV1 };
type LauncherPreviewState =
  | { kind: "invalid" }
  | {
      kind: "partial";
      frame: LauncherPreviewFrameV1;
      startedRoles: readonly CustomVisualRoleV1[];
      placeholderRoles: readonly CustomVisualRoleV1[];
    }
  | { kind: "ready"; frame: LauncherPreviewFrameV1 };
const launcherViews: readonly { id: LauncherView; label: string }[] = [
  { id: "horizontal-grid", label: "Horizontal Grid" },
  { id: "vertical-grid", label: "Vertical Grid" },
  { id: "banner-list", label: "Banner List" },
  { id: "coverflow", label: "Coverflow" },
];
type ScreenColors = Record<Screen, Partial<Record<ColorKey, string>>>;
type Draft = {
  metadata: MaterialProjectV1["metadata"];
  global: Record<ColorKey, string>;
  screens: Record<string, ScreenColors>;
};

const localPreferenceStorage = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
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
  frame,
  screen,
  editor,
}: {
  frame: LauncherPreviewFrameV1;
  screen: Screen;
  editor?: ReactNode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const bytes = frame[screen];
  const modeLabel = launcherViews.find(({ id }) => id === frame.mode)?.label ?? frame.mode;
  const evidence = bytes.reduce((hash, byte) => Math.imul(hash ^ byte, 16_777_619) >>> 0, 2_166_136_261).toString(16);
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    context.putImageData(new ImageData(new Uint8ClampedArray(bytes), 256, 192), 0, 0);
  }, [bytes]);
  return (
    <section className={`physical-preview ${screen}-preview`} aria-label={`${screen} screen preview`}>
      <div className="screen-heading">
        <strong>{screen} display</strong>
        <span>256×192</span>
      </div>
      <div className={`ds-screen ${screen}`} data-mode={frame.mode} data-screen={screen}>
        <canvas
          ref={canvas}
          className="device-render-canvas"
          data-launcher-screen={screen}
          data-canvas-evidence={evidence}
          width={256}
          height={192}
          role="img"
          aria-label={`${screen} launcher screen, ${modeLabel} mode`}
        />
        {editor}
      </div>
    </section>
  );
}

function DevicePreview({
  launcherView,
  onLauncherView,
  customPreview,
  customLauncherLayout,
  customLauncherLayoutStatus,
  onCustomLauncherLayoutCommit,
  preview,
  busy,
}: {
  launcherView: LauncherView;
  onLauncherView(view: LauncherView): void;
  customPreview: CustomLauncherPreviewState;
  customLauncherLayout?: CustomLauncherLayoutDtoV1;
  customLauncherLayoutStatus?: "committed" | "conflict";
  onCustomLauncherLayoutCommit(expectedAuthoritySha256: string, operation: SetCustomLauncherLayoutV3): Promise<boolean>;
  preview?: PreviewModel;
  busy: boolean;
}) {
  const [logicalPixels, setLogicalPixels] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [inspectorHost, setInspectorHost] = useState<HTMLDivElement | null>(null);
  const expandToggle = useRef<HTMLButtonElement>(null);
  const previewSurface = useRef<HTMLDivElement>(null);
  const restoreExpandFocus = useRef(false);
  useEffect(() => {
    if (!expanded && restoreExpandFocus.current) {
      restoreExpandFocus.current = false;
      expandToggle.current?.focus();
    }
  }, [expanded]);
  useEffect(() => {
    if (!expanded) return;
    document.body.classList.add("launcher-preview-expanded");
    const inertSiblings: Array<[HTMLElement, boolean]> = [];
    let active: HTMLElement | null = previewSurface.current;
    while (active?.parentElement) {
      const parent = active.parentElement;
      for (const sibling of parent.children) {
        if (!(sibling instanceof HTMLElement) || sibling === active) continue;
        inertSiblings.push([sibling, sibling.inert]);
        sibling.inert = true;
      }
      if (parent === document.body) break;
      active = parent;
    }
    const exit = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      restoreExpandFocus.current = true;
      setExpanded(false);
    };
    globalThis.addEventListener("keydown", exit);
    return () => {
      document.body.classList.remove("launcher-preview-expanded");
      for (const [sibling, inert] of inertSiblings) sibling.inert = inert;
      globalThis.removeEventListener("keydown", exit);
    };
  }, [expanded]);
  const launcherPreview = useMemo<LauncherPreviewState>(() => {
    if (customPreview.kind === "invalid") return { kind: "invalid" };
    try {
      if (customPreview.kind === "partial")
        return {
          kind: "partial",
          frame: renderPartialCustomLauncherPreview({
            sources: customPreview.sources,
            mode: launcherView,
            fixture: neutralLauncherFixtureV1(),
            committedLayout: customLauncherLayout,
          }),
          startedRoles: customPreview.startedRoles,
          placeholderRoles: customPreview.placeholderRoles,
        };
      const tokens = preview?.scenes[0]?.tokens;
      const color = tokens?.primaryColor as { r?: unknown; g?: unknown; b?: unknown } | undefined;
      const theme =
        customPreview.kind === "ready"
          ? { kind: "custom" as const, files: customPreview.visualPackage.files }
          : color && [color.r, color.g, color.b].every(Number.isInteger) && typeof tokens?.darkTheme === "boolean"
            ? {
                kind: "material" as const,
                primaryColor: color as { r: number; g: number; b: number },
                darkTheme: tokens.darkTheme,
              }
            : undefined;
      if (!theme) return { kind: "invalid" };
      const frame = renderLauncherPreview({
        theme,
        mode: launcherView,
        fixture: neutralLauncherFixtureV1(),
        committedLayout: customLauncherLayout,
      });
      return { kind: "ready", frame };
    } catch {
      return { kind: "invalid" };
    }
  }, [customLauncherLayout, customPreview, launcherView, preview]);
  const oneToOne = logicalPixels && !expanded;
  return (
    <div
      ref={previewSurface}
      className={`device-preview${expanded ? " expanded" : ""}`}
      data-preview-expanded={expanded}
      role={expanded ? "dialog" : undefined}
      aria-labelledby={expanded ? "launcher-preview-title" : undefined}
      aria-modal={expanded || undefined}
    >
      <div className="preview-toolbar">
        <div>
          <span>Device</span>
          <h2 id="launcher-preview-title">Live preview</h2>
        </div>
        <div className="preview-actions">
          <button
            ref={expandToggle}
            type="button"
            className="expand-preview-toggle"
            aria-label={expanded ? "Exit expanded preview" : "Expand preview"}
            aria-pressed={expanded}
            onClick={() => {
              if (expanded) restoreExpandFocus.current = true;
              setExpanded((active) => !active);
            }}
          >
            {expanded ? "Exit expanded preview" : "Expand preview"}
          </button>
        </div>
      </div>
      <div className="mode-switcher" role="group" aria-label="Preview mode">
        {launcherViews.map(({ id, label }) => (
          <button
            type="button"
            className={launcherView === id ? "active" : ""}
            aria-pressed={launcherView === id}
            disabled={busy}
            key={id}
            onClick={() => onLauncherView(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="preview-display-options">
        <button
          type="button"
          className="pixel-scale-toggle"
          aria-pressed={logicalPixels}
          onClick={() => setLogicalPixels((active) => !active)}
        >
          1:1 pixels
        </button>
      </div>
      {launcherPreview.kind !== "invalid" ? (
        <>
          <div className="device-stage">
            <div
              className={`device-shell${oneToOne ? " logical-pixels" : ""}`}
              aria-label="DSpico dual-screen device preview"
              data-pixel-scale={oneToOne ? "1" : "device"}
              data-preview-state={launcherPreview.kind}
              data-started-roles={
                launcherPreview.kind === "partial" ? launcherPreview.startedRoles.join(" ") : undefined
              }
              data-placeholder-roles={
                launcherPreview.kind === "partial" ? launcherPreview.placeholderRoles.join(" ") : undefined
              }
            >
              <span className="device-chrome" data-preview-chrome="device-frame" aria-hidden="true" />
              <PhysicalPreview
                frame={launcherPreview.frame}
                screen="top"
                editor={
                  customLauncherLayout && customPreview.kind !== "not-custom" ? (
                    <CustomLauncherLayoutEditor
                      committedLayout={customLauncherLayout}
                      commitStatus={customLauncherLayoutStatus}
                      disabled={busy}
                      inspectorHost={inspectorHost}
                      mode={launcherPreview.frame.mode}
                      onCommit={onCustomLauncherLayoutCommit}
                    />
                  ) : undefined
                }
              />
              <PhysicalPreview frame={launcherPreview.frame} screen="bottom" />
            </div>
          </div>
          <div
            className="preview-caption"
            data-preview-status={launcherPreview.kind}
            role={launcherPreview.kind === "partial" ? "status" : undefined}
            aria-live={launcherPreview.kind === "partial" ? "polite" : undefined}
            aria-atomic={launcherPreview.kind === "partial" ? "true" : undefined}
          >
            <span className={`state-dot ${launcherPreview.kind === "ready" ? "ready" : ""}`} aria-hidden="true" />
            {launcherPreview.kind === "partial" ? (
              <p>
                <strong>Preview in progress</strong>
                <span>{`${launcherPreview.startedRoles.length} of ${CUSTOM_VISUAL_ROLES_V1.length} roles started`}</span>
                <span>{`Still placeholders: ${launcherPreview.placeholderRoles.join(", ")}`}</span>
              </p>
            ) : (
              <>
                <p>
                  <strong>Draft preview is live</strong>
                </p>
                <div className="fidelity-tags">
                  <span data-fidelity="geometry">Geometry: {launcherPreview.frame.metadata.fidelity.geometry}</span>
                  {launcherPreview.frame.metadata.fidelity.materialFields && (
                    <span data-fidelity="material-fields">
                      Material fields: {launcherPreview.frame.metadata.fidelity.materialFields}
                    </span>
                  )}
                  <span data-fidelity="raster">Canvas raster: {launcherPreview.frame.metadata.fidelity.raster}</span>
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="device-stage">
          <section
            className="preview-empty-state"
            data-preview-state={launcherPreview.kind}
            aria-labelledby="launcher-preview-unavailable-title"
            aria-live="polite"
            aria-atomic="true"
          >
            <h3 id="launcher-preview-unavailable-title">Preview unavailable</h3>
            <p>Launcher preview could not be rendered. Run project diagnostics and review the reported errors.</p>
          </section>
        </div>
      )}
      <div ref={setInspectorHost} className="custom-launcher-layout-inspector-host" />
    </div>
  );
}

function Studio() {
  const [result, setResult] = useState<StudioResult>({});
  const [status, setStatus] = useState("Create or open a local project to begin.");
  const [mode, setMode] = useState("home");
  const [layoutStorage] = useState(localPreferenceStorage);
  const [workspaceLayout, setWorkspaceLayout] = useState<WorkspaceLayoutState>(() => ({
    normal: loadWorkspaceLayout(layoutStorage),
  }));
  const launcherView: LauncherView = workspaceLayout.normal.previewMode;
  const [projectDrawer, setProjectDrawer] = useState<{ open: boolean; tab: ProjectDrawerTab }>({
    open: false,
    tab: "details",
  });
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>({ metadata: metadataDefaults, global: colorDefaults, screens: {} });
  const [customMetadata, setCustomMetadata] = useState({ ...metadataDefaults });
  const [workspaceIdentity, setWorkspaceIdentity] = useState(0);
  const [workspaceAuthority, setWorkspaceAuthority] = useState(0);
  const [helpMode, setHelpMode] = useState<"onboarding" | "help" | undefined>(() => {
    try {
      if (
        new URLSearchParams(location.search).get("onboarding") === "1" &&
        sessionStorage.getItem("dspico:e2e-onboarding-shown") !== "true"
      ) {
        sessionStorage.setItem("dspico:e2e-onboarding-shown", "true");
        return "onboarding";
      }
      return onboardingDismissed(localStorage) ? undefined : "onboarding";
    } catch {
      return "onboarding";
    }
  });
  const resultRef = useRef(result);
  const draftRef = useRef(draft);
  const customMetadataRef = useRef(customMetadata);
  const customMetadataFocus = useRef<Partial<Record<MetadataFieldV3, string>>>({});
  const customMetadataConflicts = useRef(new Set<MetadataFieldV3>());
  const cancelledCustomMetadata = useRef(new Set<MetadataFieldV3>());
  const customMetadataCommits = useRef(new Map<MetadataFieldV3, Promise<boolean>>());
  const modeRef = useRef(mode);
  const requestSequence = useRef(0);
  const acceptedSequence = useRef(0);
  const mounted = useRef(true);
  const authorityRef = useRef<DraftAuthority | null>(null);
  const diagnosticsRef = useRef<HTMLUListElement>(null);
  const looseDrafts = useRef(new Set<HTMLElement>());
  const pendingPanelFocus = useRef<WorkspaceDockTab | "artboard" | undefined>(undefined);
  const visualCompositionCache = useRef<EffectiveCustomVisualCacheV3>(new Map());
  const creatorWorkspace = useRef<CreatorWorkspaceHandle>(null);
  const workspaceVisualDraftDirty = useRef(false);

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
  useEffect(() => saveWorkspaceLayout(layoutStorage, workspaceLayout.normal), [layoutStorage, workspaceLayout.normal]);
  useEffect(() => {
    const storage = (event: StorageEvent) => {
      const layout = workspaceLayoutFromStorageEvent(event, layoutStorage);
      if (!layout) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        !layout.dockOpen &&
        document.getElementById("workspace-dock")?.contains(active)
      )
        pendingPanelFocus.current = "artboard";
      setWorkspaceLayout({ normal: layout });
    };
    globalThis.addEventListener("storage", storage);
    return () => globalThis.removeEventListener("storage", storage);
  }, [layoutStorage]);
  useEffect(() => {
    const pending = pendingPanelFocus.current;
    if (!pending) return;
    const target =
      pending === "artboard"
        ? document.querySelector<HTMLElement>(".workspace-canvas")
        : (document.getElementById(`dock-panel-${pending}`) ?? document.getElementById(`dock-tab-${pending}`));
    target?.focus();
    pendingPanelFocus.current = undefined;
  }, [workspaceLayout]);
  useEffect(() => {
    if (result?.diagnostics?.length) diagnosticsRef.current?.focus();
  }, [result?.diagnostics]);
  const acceptResult = (next: StudioResult, sequence: number, resynchronize: boolean, replaceProject = false) => {
    if (!mounted.current || sequence < acceptedSequence.current) return;
    acceptedSequence.current = sequence;
    resultRef.current = next;
    setResult(next);
    if (replaceProject) {
      visualCompositionCache.current.clear();
      looseDrafts.current.clear();
      window.studio.setDraftDirty(false);
      setWorkspaceIdentity((identity) => identity + 1);
    }
    if (resynchronize && next.customProject) {
      if (replaceProject) {
        customMetadataFocus.current = {};
        customMetadataConflicts.current.clear();
        cancelledCustomMetadata.current.clear();
      }
      setCustomMetadata((current) => {
        const updated = { ...current };
        for (const field of ["name", "description", "author"] as const) {
          const baseline = customMetadataFocus.current[field],
            dirty = baseline !== undefined && current[field] !== baseline;
          if (dirty) {
            if (next.customProject!.metadata[field] !== baseline) customMetadataConflicts.current.add(field);
          } else updated[field] = next.customProject!.metadata[field];
        }
        customMetadataRef.current = updated;
        return updated;
      });
    }
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
      (current.diagnostics === undefined && current.publication === undefined && current.canExport === undefined)
    )
      return;
    const next = { ...current, diagnostics: undefined, publication: undefined, canExport: undefined };
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
        setStatus(`${safeErrorMessage(error)} Draft was not saved.`);
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

  const run = async (
    label: string,
    action: () => Promise<StudioResult>,
    resynchronize = false,
    replaceProject = false,
    invalidateWorkspaceAuthority = true,
    flushWorkspaceVisualDrafts = true,
  ) => {
    if (flushWorkspaceVisualDrafts && (await creatorWorkspace.current?.flushPendingVisualDrafts()) === false)
      return false;
    if (invalidateWorkspaceAuthority) setWorkspaceAuthority((authority) => authority + 1);
    if (authority.invalidFields().length > 0) {
      await authority.run(action);
      return false;
    }
    setBusy(true);
    try {
      let sequence = 0;
      const outcome = await authority.run(() => {
        sequence = ++requestSequence.current;
        return action();
      });
      if (!outcome.ran) return false;
      const next = outcome.value;
      if (next.cancelled) {
        if (mounted.current) setStatus("No folder selected. The current project was not changed.");
        return false;
      }
      if (resynchronize) authority.reset();
      acceptResult(next, sequence, resynchronize, replaceProject);
      if (mounted.current) setStatus(label);
      return true;
    } catch (error) {
      if (mounted.current)
        setStatus(
          isCancellation(error) ? "Action cancelled. The current project was not changed." : safeErrorMessage(error),
        );
      return false;
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const commitCustomLauncherLayout = async (expectedAuthoritySha256: string, operation: SetCustomLauncherLayoutV3) => {
    const saved = await run(
      "Launcher layout saved.",
      () => window.studio.setCustomLauncherLayout(expectedAuthoritySha256, operation),
      false,
      false,
      false,
      false,
    );
    if (saved && resultRef.current?.customLauncherLayoutStatus === "conflict" && mounted.current)
      setStatus("Layout conflict. Latest committed layout restored.");
    return saved;
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const editing = suppressGlobalShortcut(event.target) || suppressGlobalShortcut(document.activeElement);
      if (!editing && ((event.key === "?" && !event.ctrlKey && !event.metaKey) || event.key === "F1")) {
        event.preventDefault();
        setHelpMode("help");
      }
      if (
        !editing &&
        Boolean(resultRef.current?.project || resultRef.current?.customProject) &&
        !document.querySelector('[role="dialog"]') &&
        event.key === "Tab" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        setWorkspaceLayout((current) => {
          const next = toggleWorkspaceFocus(current, event.shiftKey ? "dock" : "canvas"),
            visible = visibleWorkspaceLayout(next),
            active = document.activeElement;
          if (
            active instanceof HTMLElement &&
            !visible.dockOpen &&
            document.getElementById("workspace-dock")?.contains(active)
          )
            pendingPanelFocus.current = "artboard";
          else if (event.shiftKey && visible.dockOpen) pendingPanelFocus.current = visible.dockTab;
          return next;
        });
        setStatus(event.shiftKey ? "Dock toggled." : "Tools and dock toggled.");
      }
      if (
        !editing &&
        !document.querySelector('[role="dialog"]') &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z" &&
        !event.repeat
      ) {
        event.preventDefault();
        void run(
          event.shiftKey ? "Redone." : "Undone.",
          event.shiftKey ? window.studio.redo : window.studio.undo,
          true,
        );
      }
    };
    window.addEventListener("keydown", keydown);
    void window.studio
      .restoreProject()
      .then((next) => {
        if (next.cancelled) return;
        const sequence = ++requestSequence.current;
        acceptResult(next, sequence, true, true);
        if (mounted.current) setStatus("Project reopened.");
      })
      .catch((error) => {
        if (mounted.current) setStatus(safeErrorMessage(error));
      });
    return () => window.removeEventListener("keydown", keydown);
  }, []);

  const updateMetadata = (field: keyof Draft["metadata"], value: string) => {
    patchDraft(`metadata.${field}`, value);
    if (resultRef.current?.project) {
      authority.schedule(`metadata.${field}`, { version: 1, type: "set-metadata", field, value }, modeRef.current);
    }
  };
  const updateCustomMetadata = (field: MetadataFieldV3, value: string) => {
    customMetadataRef.current = { ...customMetadataRef.current, [field]: value };
    setCustomMetadata(customMetadataRef.current);
    invalidateArtifacts();
    setStatus("Custom metadata has unsaved changes. Blur the field or press Enter to save.");
  };
  const focusCustomMetadata = (field: MetadataFieldV3) => {
    customMetadataFocus.current[field] =
      resultRef.current?.customProject?.metadata[field] ?? customMetadataRef.current[field];
    customMetadataConflicts.current.delete(field);
    cancelledCustomMetadata.current.delete(field);
  };
  const cancelCustomMetadata = (field: MetadataFieldV3) => {
    const committed = resultRef.current?.customProject?.metadata[field] ?? customMetadataFocus.current[field];
    if (committed !== undefined) {
      customMetadataRef.current = { ...customMetadataRef.current, [field]: committed };
      setCustomMetadata(customMetadataRef.current);
    }
    customMetadataConflicts.current.delete(field);
    cancelledCustomMetadata.current.add(field);
    setStatus("Custom metadata edit cancelled.");
  };
  const commitCustomMetadata = async (field: MetadataFieldV3) => {
    const inFlight = customMetadataCommits.current.get(field);
    if (inFlight) {
      await inFlight;
      return;
    }
    if (cancelledCustomMetadata.current.delete(field)) {
      delete customMetadataFocus.current[field];
      return;
    }
    const value = customMetadataRef.current[field],
      baseline = customMetadataFocus.current[field],
      committed = resultRef.current?.customProject?.metadata[field];
    if (customMetadataConflicts.current.has(field) || (baseline !== undefined && committed !== baseline)) {
      if (committed !== undefined) {
        customMetadataRef.current = { ...customMetadataRef.current, [field]: committed };
        setCustomMetadata(customMetadataRef.current);
      }
      customMetadataConflicts.current.delete(field);
      delete customMetadataFocus.current[field];
      setStatus("Custom metadata changed through another history action. The committed value was restored.");
      return;
    }
    const error = metadataErrorV3(field, value);
    if (error) {
      setStatus(error);
      return;
    }
    if (resultRef.current?.customProject?.metadata[field] === value) {
      delete customMetadataFocus.current[field];
      return;
    }
    customMetadataConflicts.current.delete(field);
    delete customMetadataFocus.current[field];
    const persistence = run("Custom metadata saved.", () => window.studio.setCustomMetadata(field, value));
    customMetadataCommits.current.set(field, persistence);
    let succeeded: boolean;
    try {
      succeeded = await persistence;
    } finally {
      customMetadataCommits.current.delete(field);
    }
    if (!succeeded) {
      customMetadataFocus.current[field] = baseline ?? committed ?? value;
      return;
    }
  };

  const draftDirty = () =>
    authority.hasDrafts() ||
    workspaceVisualDraftDirty.current ||
    Object.keys(customMetadataFocus.current).length > 0 ||
    looseDrafts.current.size > 0;
  const updateWorkspaceVisualDraftDirty = (dirty: boolean) => {
    workspaceVisualDraftDirty.current = dirty;
    window.studio.setDraftDirty(draftDirty());
  };
  useEffect(() => {
    window.studio.setDraftDirty(false);
    const changed = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        if (!target.matches('[type="color"], [type="checkbox"], [type="file"], [data-managed-draft]'))
          looseDrafts.current.add(target);
        window.studio.setDraftDirty(draftDirty());
      }
    };
    const committed = (event: Event) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.matches("[data-draft-field]") || (!target.closest("form") && !target.closest(".audio-recipe")))
      )
        looseDrafts.current.delete(target);
      window.setTimeout(() => window.studio.setDraftDirty(draftDirty()), 500);
    };
    const clicked = (event: MouseEvent) => {
      const button = event.target instanceof Element ? event.target.closest("button") : null;
      if (button && /^(Apply|Cancel)/.test(button.textContent?.trim() ?? "")) {
        looseDrafts.current.clear();
        window.setTimeout(() => window.studio.setDraftDirty(draftDirty()), 500);
      }
    };
    document.addEventListener("input", changed, true);
    document.addEventListener("focusout", committed, true);
    document.addEventListener("click", clicked, true);
    const removeClose = window.studio.onPrepareClose(() => {
      window.studio.closeDraftDecision({ status: "committing" });
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
      void (async () => {
        for (const field of Object.keys(customMetadataFocus.current) as MetadataFieldV3[])
          await commitCustomMetadata(field);
        const closeStatus = await flushDraftsForClose(
          [
            () => authority.flush(),
            () =>
              creatorWorkspace.current?.flushPendingVisualDrafts() ??
              Promise.resolve(!workspaceVisualDraftDirty.current),
          ],
          draftDirty,
        );
        const dirty = closeStatus === "invalid";
        window.studio.setDraftDirty(dirty);
        window.studio.closeDraftDecision({ status: closeStatus });
      })().catch(() => {
        window.studio.setDraftDirty(true);
        window.studio.closeDraftDecision({ status: "invalid" });
      });
    });
    return () => {
      document.removeEventListener("input", changed, true);
      document.removeEventListener("focusout", committed, true);
      document.removeEventListener("click", clicked, true);
      removeClose();
    };
  }, [authority]);

  const addImportedLayer = (role: CustomVisualRoleV1, asset: NonNullable<StudioResult["asset"]>) => {
    const document = resultRef.current?.customAuthoring?.visualDocuments[role];
    if (!document) throw new Error(`The ${role} document is unavailable.`);
    const ordinal = document.layers.length;
    const size = importedLayerSize(asset.width, asset.height, document);
    return window.studio.editVisualDocument(role, {
      version: 2,
      type: "add-layer",
      screen: "top",
      layer: {
        kind: "image",
        id: `${role}-${asset.sourceSha256.slice(0, 12)}-${ordinal}`,
        name: asset.originalName,
        visible: true,
        opacity: 65536,
        asset: { path: `assets/sha256/${asset.sourceSha256}.png`, sha256: asset.sourceSha256 },
        xQ16: Math.round((document.width - size.width) / 2) * 65536,
        yQ16: Math.round((document.height - size.height) / 2) * 65536,
        width: asset.width,
        height: asset.height,
        widthQ16: size.width * 65536,
        heightQ16: size.height * 65536,
        crop: { x: 0, y: 0, width: asset.width, height: asset.height },
      },
    });
  };
  const layerProvenance = (role: CustomVisualRoleV1, source: string) => {
    const author = draftRef.current.metadata.author;
    return {
      source,
      author,
      credit: author,
      license: "User supplied",
      terms: "User supplied",
      notice: "User supplied artwork",
      intendedUse: `${role} composition layer`,
      rightsToExport: true,
    };
  };
  const addLayer = (role: CustomVisualRoleV1) =>
    void run("Image imported.", async () => {
      const imported = await window.studio.importPng(layerProvenance(role, "Local PNG selected in Studio"));
      if (!imported.asset) throw new Error("PNG import returned no image.");
      return addImportedLayer(role, imported.asset);
    });
  const importLayer = async (role: CustomVisualRoleV1, file: File) => {
    await run("Image imported.", async () => {
      const imported = await window.studio.importPngBytes({
        ...layerProvenance(role, "Local PNG dropped or pasted in Studio"),
        originalName: file.name || "Pasted image.png",
        sourceBytes: new Uint8Array(await file.arrayBuffer()),
      });
      if (!imported.asset) throw new Error("PNG import returned no image.");
      return addImportedLayer(role, imported.asset);
    });
  };
  const editLayer = (role: CustomVisualRoleV1, operation: VisualDocumentOperationV3, skipPendingVisualDrafts = false) =>
    run(
      "Layer updated.",
      () => window.studio.editVisualDocument(role, operation),
      false,
      false,
      operation.type === "set-layer-locks",
      !skipPendingVisualDrafts,
    );

  const assignVisual = (role: CustomVisualRoleV1) =>
    void run(
      `The ${role} PNG was assigned.`,
      () =>
        window.studio.importPng({
          source: "Local user-selected PNG",
          author: draftRef.current.metadata.author,
          credit: draftRef.current.metadata.author,
          license: "User supplied",
          terms: "User supplied",
          notice: "User supplied artwork",
          intendedUse: `Custom visual role: ${role}`,
          rightsToExport: true,
        }),
      true,
    );
  const prepareSound = async (
    role: ThemeSoundRoleV1,
    sourceBytes: Uint8Array,
    originalName: string,
    recipe: WavRecipeV1,
  ) => {
    await run(
      `${role} sound saved for Desktop audition.`,
      () =>
        window.studio.prepareWav({
          role,
          sourceBytes,
          recipe,
          provenance: {
            originalName,
            source: "Local WAV selected in Studio",
            author: draftRef.current.metadata.author,
            credit: draftRef.current.metadata.author,
            license: "User supplied",
            terms: "User supplied",
            notice: "User supplied audio",
            intendedUse: `Theme ${role} sound`,
            rightsToExport: true,
          },
        }),
      true,
    );
  };
  const removeSound = async (role: ThemeSoundRoleV1) => {
    await run(`${role} sound removed.`, () => window.studio.removeWav(role), true);
  };
  const reveal = async (target: "folder" | "zip") => {
    const publication = resultRef.current?.publication;
    if (!publication) return;
    try {
      await window.studio.revealExport(publication.revealId, target);
      setStatus(target === "folder" ? "Export folder revealed." : "Export ZIP revealed.");
    } catch (error) {
      setStatus(safeErrorMessage(error));
    }
  };

  const project = result?.project;
  const customProject = result?.customProject;
  const visualSources = result?.customAuthoring?.visualSources ?? {};
  const customPreview = useMemo<CustomLauncherPreviewState>(() => {
    const authoring = result?.customAuthoring;
    if (!authoring) return { kind: "not-custom" };
    try {
      const sources = effectiveCustomVisualSourcesV3(authoring, visualCompositionCache.current),
        startedRoles = sources.map(({ role }) => role);
      if (startedRoles.length < CUSTOM_VISUAL_ROLES_V1.length)
        return {
          kind: "partial",
          sources,
          startedRoles,
          placeholderRoles: CUSTOM_VISUAL_ROLES_V1.filter((role) => !startedRoles.includes(role)),
        };
      return { kind: "ready", visualPackage: compileCustomVisualPackageV1(sources) };
    } catch {
      return { kind: "invalid" };
    }
  }, [result?.customAuthoring]);
  const visualPackage = customPreview.kind === "ready" ? customPreview.visualPackage : undefined;
  const preview = project ? createPreviewModel(previewProject(project, draft, mode), mode) : undefined;
  const loaded = Boolean(project || customProject);
  const visibleLayout = visibleWorkspaceLayout(workspaceLayout);
  const selectDockTab = (dockTab: WorkspaceDockTab) => {
    pendingPanelFocus.current = dockTab;
    setWorkspaceLayout((current) => ({ normal: { ...current.normal, dockOpen: true, dockTab } }));
  };
  const closeDock = () => {
    pendingPanelFocus.current = "artboard";
    setWorkspaceLayout((current) => ({ normal: { ...current.normal, dockOpen: false } }));
    setStatus("Workspace dock hidden.");
  };
  const setLauncherView = (previewMode: LauncherView) =>
    setWorkspaceLayout((current) => ({ normal: { ...current.normal, previewMode } }));
  const setDockWidth = (dockWidth: number) =>
    setWorkspaceLayout((current) => ({
      ...current,
      normal: { ...current.normal, dockWidth: clampWorkspaceDockWidth(dockWidth) },
    }));
  const setEditSplit = (editSplit: number) =>
    setWorkspaceLayout((current) => ({
      ...current,
      normal: { ...current.normal, editSplit: clampWorkspaceEditSplit(editSplit) },
    }));
  const displayedMetadata = customProject ? customMetadata : draft.metadata;
  const sdGuidance = result?.publication
    ? manualSdGuidance(result.publication.folderName, result.publication.zipName, result.publication.files)
    : undefined;

  return (
    <main className={`studio-shell${loaded ? " editor-open" : ""}`}>
      <header className="studio-header">
        {loaded ? (
          <nav className="project-actions" aria-label="Project actions">
            <span className="current-project" title={result?.projectLocation}>
              {displayedMetadata.name}
            </span>
            <details className="new-menu">
              <summary>New</summary>
              <button
                aria-label="New Custom"
                disabled={busy}
                onClick={(event) => {
                  event.currentTarget.closest("details")?.removeAttribute("open");
                  run(
                    "Custom project created.",
                    () =>
                      window.studio.createCustom({ projectId: "local-custom", metadata: draftRef.current.metadata }),
                    true,
                    true,
                  );
                }}
              >
                Custom theme
              </button>
              <button
                aria-label="New Material"
                disabled={busy}
                onClick={(event) => {
                  event.currentTarget.closest("details")?.removeAttribute("open");
                  run(
                    "Local project created.",
                    () => window.studio.create({ projectId: "local-material", metadata: draftRef.current.metadata }),
                    true,
                    true,
                  );
                }}
              >
                Material theme
              </button>
            </details>
            <button
              aria-label="Open project"
              disabled={busy}
              onClick={() => run("Project opened.", window.studio.openProject, true, true)}
            >
              Open
            </button>
            <button
              disabled={!loaded || busy || result?.canEdit === false}
              onClick={() => run("Project saved.", window.studio.save)}
            >
              Save
            </button>
            <button
              disabled={busy || result?.canEdit === false}
              onClick={() => run("Undone.", window.studio.undo, true)}
            >
              Undo
            </button>
            <button
              disabled={busy || result?.canEdit === false}
              onClick={() => run("Redone.", window.studio.redo, true)}
            >
              Redo
            </button>
            <button type="button" onClick={() => setProjectDrawer((current) => ({ ...current, open: true }))}>
              Project
            </button>
            <button type="button" onClick={() => setProjectDrawer({ open: true, tab: "export" })}>
              Export
            </button>
            <button type="button" onClick={() => setHelpMode("help")}>
              Help
            </button>
          </nav>
        ) : (
          <button className="header-help" type="button" onClick={() => setHelpMode("help")}>
            Help
          </button>
        )}
      </header>

      {!loaded ? (
        <section className="project-launch" aria-labelledby="project-launch-title">
          <div className="launch-card">
            <BrandMark label="Pico Theme Creator" size={72} />
            <span>DSteam theme workshop</span>
            <h2 id="project-launch-title">Build every screen in one focused canvas.</h2>
            <p>Compose seven authored theme documents, preview them on a dual-screen device, and export locally.</p>
            <div className="launch-actions">
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  run(
                    "Custom project created.",
                    () =>
                      window.studio.createCustom({ projectId: "local-custom", metadata: draftRef.current.metadata }),
                    true,
                    true,
                  )
                }
              >
                New custom
              </button>
              <button disabled={busy} onClick={() => run("Project opened.", window.studio.openProject, true, true)}>
                Open project
              </button>
              <button
                className="tertiary"
                disabled={busy}
                onClick={() =>
                  run(
                    "Local project created.",
                    () => window.studio.create({ projectId: "local-material", metadata: draftRef.current.metadata }),
                    true,
                    true,
                  )
                }
              >
                New material
              </button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <div className="workspace">
            <section className="editor-region" aria-label="Theme composition workspace">
              <CreatorWorkspace
                key={workspaceIdentity}
                ref={creatorWorkspace}
                instance={workspaceIdentity}
                customProject={customProject}
                authorityVersion={workspaceAuthority}
                images={result?.customAuthoring?.images}
                visualDocuments={result?.customAuthoring?.visualDocuments}
                visualSources={visualSources}
                readOnly={result?.canEdit === false}
                toolbarVisible={visibleLayout.toolbarVisible}
                dockOpen={visibleLayout.dockOpen}
                dockTab={visibleLayout.dockTab}
                dockWidth={visibleLayout.dockWidth}
                editSplit={visibleLayout.editSplit}
                onDockTab={selectDockTab}
                onDockWidth={setDockWidth}
                onEditSplit={setEditSplit}
                onCloseDock={closeDock}
                preview={
                  <DevicePreview
                    launcherView={launcherView}
                    onLauncherView={setLauncherView}
                    customPreview={customPreview}
                    customLauncherLayout={result?.customLauncherLayout}
                    customLauncherLayoutStatus={result?.customLauncherLayoutStatus}
                    onCustomLauncherLayoutCommit={commitCustomLauncherLayout}
                    preview={preview}
                    busy={busy}
                  />
                }
                status={status}
                acceptedSequence={acceptedSequence.current}
                onAdd={addLayer}
                onImport={importLayer}
                onPendingVisualDraftChange={updateWorkspaceVisualDraftDirty}
                onOperation={editLayer}
              />
            </section>
          </div>
        </>
      )}
      {loaded && projectDrawer.open && (
        <ProjectDrawer
          tab={projectDrawer.tab}
          onTab={(tab) => setProjectDrawer({ open: true, tab })}
          onClose={() => setProjectDrawer((current) => ({ ...current, open: false }))}
          panels={{
            details: (
              <div className="drawer-form">
                <p>Project identity and local storage details. These controls do not change the canvas layout.</p>
                {(["name", "description", "author"] as const).map((field) => (
                  <label key={field}>
                    <span>{field}</span>
                    {field === "description" ? (
                      <textarea
                        aria-label="Description"
                        rows={3}
                        value={displayedMetadata[field]}
                        disabled={result?.canEdit === false}
                        onChange={(event) =>
                          customProject
                            ? updateCustomMetadata(field, event.target.value)
                            : updateMetadata(field, event.target.value)
                        }
                        onFocus={() => customProject && focusCustomMetadata(field)}
                        onKeyDown={(event) => {
                          if (!customProject) return;
                          if (event.key === "Escape") {
                            event.preventDefault();
                            event.stopPropagation();
                            cancelCustomMetadata(field);
                            return;
                          }
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            void commitCustomMetadata(field);
                          }
                        }}
                        onBlur={() =>
                          void (customProject ? commitCustomMetadata(field) : authority.flushField(`metadata.${field}`))
                        }
                      />
                    ) : (
                      <input
                        aria-label={field[0]!.toUpperCase() + field.slice(1)}
                        value={displayedMetadata[field]}
                        disabled={result?.canEdit === false}
                        onChange={(event) =>
                          customProject
                            ? updateCustomMetadata(field, event.target.value)
                            : updateMetadata(field, event.target.value)
                        }
                        onFocus={() => customProject && focusCustomMetadata(field)}
                        onKeyDown={(event) => {
                          if (!customProject) return;
                          if (event.key === "Escape") {
                            event.preventDefault();
                            event.stopPropagation();
                            cancelCustomMetadata(field);
                            return;
                          }
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void commitCustomMetadata(field);
                          }
                        }}
                        onBlur={() =>
                          void (customProject ? commitCustomMetadata(field) : authority.flushField(`metadata.${field}`))
                        }
                      />
                    )}
                  </label>
                ))}
                <dl>
                  <div>
                    <dt>Project location</dt>
                    <dd>{result?.projectLocation ?? "Not saved yet"}</dd>
                  </div>
                  <div>
                    <dt>Format</dt>
                    <dd>{customProject ? "Custom authored documents" : "Material"}</dd>
                  </div>
                </dl>
                {project && (
                  <div className="material-settings">
                    <h3>Material launcher settings</h3>
                    <p>Only primary color and dark theme are consumed by the pinned launcher profile.</p>
                    <p>
                      Background, foreground, accent, and scene migration values remain preserved but are not exported.
                    </p>
                    <label>
                      Primary color{" "}
                      <input
                        aria-label="Primary color"
                        type="color"
                        disabled={busy}
                        value={(() => {
                          const color = project.tokens.primaryColor as
                              { r?: unknown; g?: unknown; b?: unknown } | undefined,
                            channels = [color?.r, color?.g, color?.b];
                          return channels.every(Number.isInteger)
                            ? `#${channels.map((value) => Number(value).toString(16).padStart(2, "0")).join("")}`
                            : "#000000";
                        })()}
                        onChange={(event) => {
                          const value = event.target.value;
                          void run("Primary color saved.", () =>
                            window.studio.edit({
                              version: 1,
                              type: "set-token",
                              key: "primaryColor",
                              value: {
                                r: Number.parseInt(value.slice(1, 3), 16),
                                g: Number.parseInt(value.slice(3, 5), 16),
                                b: Number.parseInt(value.slice(5, 7), 16),
                              },
                            }),
                          );
                        }}
                      />
                    </label>
                    <label>
                      <input
                        aria-label="Dark theme"
                        type="checkbox"
                        checked={project.tokens.darkTheme === true}
                        onChange={(event) => {
                          const darkTheme = event.target.checked;
                          void run("Dark theme saved.", () =>
                            window.studio.edit({
                              version: 1,
                              type: "set-token",
                              key: "darkTheme",
                              value: darkTheme,
                            }),
                          );
                        }}
                      />{" "}
                      Dark theme
                    </label>
                  </div>
                )}
              </div>
            ),
            assets: customProject ? (
              <div className="drawer-assets">
                <h3>Optional compatibility sources</h3>
                <p>
                  Authored documents are primary. Assign these PNGs only as fallback sources for compatible exports.
                </p>
                <CustomAssetBench
                  sources={visualSources}
                  onAssign={(role) => void assignVisual(role)}
                  disabled={busy || result?.canEdit === false}
                />
              </div>
            ) : (
              <p>Compatibility source assignments are available for Custom projects.</p>
            ),
            audio: customProject ? (
              <AudioWorkbench
                initialSounds={result.customAuthoring?.sounds}
                presentRoles={result.soundRoles}
                onPrepare={prepareSound}
                onRemove={removeSound}
                onError={(error) => setStatus(safeErrorMessage(error))}
                disabled={busy || result?.canEdit === false}
              />
            ) : (
              <p>Audio authoring is available for Custom projects.</p>
            ),
            export: (
              <div className="drawer-export">
                <header className="export-heading">
                  <span>Export check</span>
                  <h3>Validate before packaging</h3>
                  <p>Review compatibility diagnostics, then create the local folder and ZIP.</p>
                </header>
                <div className="export-summary">
                  <span data-label="Diagnostics">{result?.diagnostics?.length ?? "Not run"} diagnostics</span>
                  <span data-label="Compiled size">
                    {visualPackage?.totalBytes?.toLocaleString() ?? 0} visual bytes
                  </span>
                </div>
                {result?.diagnostics && result.diagnostics.length > 0 && (
                  <ul
                    ref={diagnosticsRef}
                    className="diagnostic-list"
                    aria-label="Compatibility diagnostics"
                    tabIndex={0}
                  >
                    {result.diagnostics.map((diagnostic) => (
                      <li key={diagnostic.fingerprint}>
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
                {customProject && <CustomOutputRail visualPackage={visualPackage} />}
                <div className="checks">
                  <button disabled={busy} onClick={() => run("Validation complete.", window.studio.validate)}>
                    Run diagnostics
                  </button>
                  <button
                    className="primary"
                    disabled={busy || result?.canExport !== true}
                    onClick={() =>
                      run("Local theme exported.", () => window.studio.export(customProject ? "custom" : "material"))
                    }
                  >
                    Export theme
                  </button>
                </div>
                {result?.publication && (
                  <output
                    data-testid="export-summary"
                    data-reveal-id={result.publication.revealId}
                    data-report-sha256={result.publication.reportSha256}
                    data-zip-sha256={result.publication.zipSha256}
                  >
                    <strong>Export ready</strong>
                    <span>{result.publication.destination}</span>
                    <span>{result.publication.folderName}/</span>
                    <span>{result.publication.zipName}</span>
                    <span>{result.publication.files.join(" · ")}</span>
                    <code>Report SHA-256: {result.publication.reportSha256}</code>
                    <code>ZIP SHA-256: {result.publication.zipSha256}</code>
                    <div className="reveal-actions">
                      <button onClick={() => void reveal("folder")}>Reveal folder</button>
                      <button onClick={() => void reveal("zip")}>Reveal ZIP</button>
                    </div>
                    {sdGuidance && (
                      <section className="sd-guidance">
                        <strong>Copy to an SD card manually</strong>
                        <ol>
                          {sdGuidance.steps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                        {sdGuidance.bgm && <p>{sdGuidance.bgm}</p>}
                        <p>{sdGuidance.boundary}</p>
                        <p>{sdGuidance.report}</p>
                      </section>
                    )}
                  </output>
                )}
              </div>
            ),
          }}
        />
      )}
      {helpMode && (
        <HelpDialog
          mode={helpMode}
          onClose={() => {
            if (helpMode === "onboarding") {
              try {
                dismissOnboarding(localStorage);
              } catch {
                /* Preference storage is optional. */
              }
            }
            setHelpMode(undefined);
          }}
        />
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StudioErrorBoundary>
    <GlobalFailureCapture>
      <Studio />
    </GlobalFailureCapture>
  </StudioErrorBoundary>,
);
