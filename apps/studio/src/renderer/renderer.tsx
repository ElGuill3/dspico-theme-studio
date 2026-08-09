import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { type CustomVisualRoleV1 } from "../../../../packages/dspico-contract/src/index.js";
import type { MaterialProjectV1, VisualDocumentOperationV3 } from "../../../../packages/theme-core/src/index.js";
import { metadataErrorV3, type MetadataFieldV3 } from "../../../../packages/theme-core/src/limits-v3.js";
import { createPreviewModel, type PreviewModel } from "../../../../packages/theme-core/src/preview.js";
import {
  createCustomRenderPlan,
  type RenderSurfacePlanV1,
} from "../../../../packages/theme-core/src/render-plan-v2.js";
import type { StudioApi, StudioResult } from "../studio-ipc.js";
import type { ThemeSoundRoleV1, WavRecipeV1 } from "../../../../packages/dspico-contract/src/theme-sounds-v1.js";
import { CustomAssetBench } from "./custom-asset-bench.js";
import { CustomOutputRail } from "./custom-output-rail.js";
import { AudioWorkbench } from "./audio-workbench.js";
import { DraftAuthority, type DraftEdit } from "./draft-authority.js";
import { CreatorWorkspace, importedLayerSize } from "./workspace/read-only-workspace.js";
import { paintWorkspaceSurface, visualDocumentSurface } from "./workspace/workspace-model.js";
import { compileEffectiveCustomVisualsV3 } from "../custom-visuals-v3.js";
import { manualSdGuidance } from "./export-guidance.js";
import { isCancellation, safeErrorMessage } from "../app-resilience.js";
import { HelpDialog } from "./help-dialog.js";
import { dismissOnboarding, onboardingDismissed, suppressGlobalShortcut } from "./shortcuts.js";
import { GlobalFailureCapture, StudioErrorBoundary } from "./recovery-shell.js";

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
  images = {},
  launcherView,
  renderSurface,
  scene,
  screen,
}: {
  images?: NonNullable<StudioResult["customAuthoring"]>["images"];
  launcherView: LauncherView;
  renderSurface?: RenderSurfacePlanV1;
  scene?: PreviewModel["scenes"][number];
  screen: Screen;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const background = validHex(scene?.tokens.background) ? scene.tokens.background : colorDefaults.background;
  const accent = validHex(scene?.tokens.accent) ? scene.tokens.accent : colorDefaults.accent;
  const foreground = validHex(scene?.tokens.foreground) ? scene.tokens.foreground : colorDefaults.foreground;
  const primary = scene?.tokens.primaryColor as { r?: unknown; g?: unknown; b?: unknown } | undefined;
  const materialColor =
    primary && [primary.r, primary.g, primary.b].every((value) => Number.isInteger(value))
      ? `#${[primary.r, primary.g, primary.b].map((value) => Number(value).toString(16).padStart(2, "0")).join("")}`
      : undefined;
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (context) {
      const sources = new Map();
      for (const [sha256, image] of Object.entries(images)) {
        sources.set(sha256, image);
      }
      paintWorkspaceSurface(
        context,
        renderSurface ? undefined : { background: materialColor ?? background, accent: materialColor ?? accent },
        false,
        renderSurface,
        undefined,
        sources,
      );
    }
  }, [accent, background, images, materialColor, renderSurface]);
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
            "--screen-bg": materialColor ?? background,
            "--screen-accent": materialColor ?? accent,
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

function Studio() {
  const [result, setResult] = useState<StudioResult>();
  const [status, setStatus] = useState("Create or open a local project to begin.");
  const [mode, setMode] = useState("home");
  const [launcherView, setLauncherView] = useState<LauncherView>("coverflow");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>({ metadata: metadataDefaults, global: colorDefaults, screens: {} });
  const [customMetadata, setCustomMetadata] = useState({ ...metadataDefaults });
  const [customMetadataErrors, setCustomMetadataErrors] = useState<Partial<Record<MetadataFieldV3, string>>>({});
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
  useEffect(() => {
    if (result?.diagnostics?.length) diagnosticsRef.current?.focus();
  }, [result?.diagnostics]);
  const acceptResult = (next: StudioResult, sequence: number, resynchronize: boolean, replaceProject = false) => {
    if (!mounted.current || sequence < acceptedSequence.current) return;
    acceptedSequence.current = sequence;
    resultRef.current = next;
    setResult(next);
    if (replaceProject) {
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
      setCustomMetadataErrors((current) => {
        const updated = { ...current };
        for (const field of ["name", "description", "author"] as const)
          if (customMetadataFocus.current[field] === undefined) delete updated[field];
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
  ) => {
    setWorkspaceAuthority((authority) => authority + 1);
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
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const editing = suppressGlobalShortcut(event.target) || suppressGlobalShortcut(document.activeElement);
      if (!editing && ((event.key === "?" && !event.ctrlKey && !event.metaKey) || event.key === "F1")) {
        event.preventDefault();
        setHelpMode("help");
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
    setCustomMetadataErrors((current) => ({ ...current, [field]: metadataErrorV3(field, value) }));
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
    setCustomMetadataErrors((current) => ({ ...current, [field]: undefined }));
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
      setCustomMetadataErrors((current) => ({ ...current, [field]: undefined }));
      setStatus("Custom metadata changed through another history action. The committed value was restored.");
      return;
    }
    const error = metadataErrorV3(field, value);
    setCustomMetadataErrors((current) => ({ ...current, [field]: error }));
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
    authority.hasDrafts() || Object.keys(customMetadataFocus.current).length > 0 || looseDrafts.current.size > 0;
  useEffect(() => {
    window.studio.setDraftDirty(false);
    const changed = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        if (!target.matches('[type="color"], [type="checkbox"], [type="file"]')) looseDrafts.current.add(target);
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
        const saved = await authority.flush();
        const dirty = !saved || draftDirty();
        window.studio.setDraftDirty(dirty);
        window.studio.closeDraftDecision({ status: dirty ? "invalid" : "clean" });
      })().catch(() => window.studio.closeDraftDecision({ status: "invalid" }));
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
  const editLayer = (role: CustomVisualRoleV1, operation: VisualDocumentOperationV3) =>
    void run("Layer updated.", () => window.studio.editVisualDocument(role, operation));

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
  const customRenderPlan = customProject
    ? result?.customAuthoring
      ? {
          ...createCustomRenderPlan(customProject),
          screens: (["top", "bottom"] as const).map((screen) => {
            const role = `${screen}-background` as const;
            return visualDocumentSurface(
              result.customAuthoring!.visualDocuments[role],
              result.customAuthoring!.visualSources[role],
              screen,
            ) as RenderSurfacePlanV1;
          }),
        }
      : createCustomRenderPlan(customProject)
    : undefined;
  const visualPackage = result?.customAuthoring
    ? (() => {
        try {
          return compileEffectiveCustomVisualsV3(result.customAuthoring);
        } catch {
          return undefined;
        }
      })()
    : undefined;
  const preview = project ? createPreviewModel(previewProject(project, draft, mode), mode) : undefined;
  const livePreview = Boolean(preview || customRenderPlan);
  const loaded = Boolean(project || customProject);
  const displayedMetadata = customProject ? customMetadata : draft.metadata;
  const sdGuidance = result?.publication
    ? manualSdGuidance(result.publication.folderName, result.publication.zipName, result.publication.files)
    : undefined;

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
                true,
              )
            }
          >
            New Material
          </button>
          {/* prettier-ignore */}
          <button disabled={busy} onClick={() => run("Custom project created.", () => window.studio.createCustom({ projectId: "local-custom", metadata: draftRef.current.metadata }), true, true)}>New Custom</button>
          <button disabled={busy} onClick={() => run("Project opened.", window.studio.openProject, true, true)}>
            Open project
          </button>
          <button
            disabled={!loaded || busy || result?.canEdit === false}
            onClick={() => run("Project saved.", window.studio.save)}
          >
            Save
          </button>
          <button type="button" onClick={() => setHelpMode("help")}>
            Help
          </button>
        </nav>
        <span className="target-label">dspico-launcher-v1</span>
      </header>

      <div className="utility-bar">
        <span className="history-label">History</span>
        <button
          disabled={!loaded || busy || result?.canEdit === false}
          onClick={() => run("Undone.", window.studio.undo, true)}
        >
          Undo
        </button>
        <button
          disabled={!loaded || busy || result?.canEdit === false}
          onClick={() => run("Redone.", window.studio.redo, true)}
        >
          Redo
        </button>
        {result?.projectLocation && (
          <span className="project-location" aria-label="Project folder">
            {result.projectLocation}
          </span>
        )}
        <p className="status" data-accepted-sequence={acceptedSequence.current} aria-live="polite">
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
                      value={displayedMetadata.name}
                      disabled={result?.canEdit === false || (busy && !customProject)}
                      data-draft-field="metadata.name"
                      aria-invalid={Boolean(customProject && customMetadataErrors.name)}
                      aria-describedby={
                        customProject && customMetadataErrors.name ? "custom-metadata-name-error" : undefined
                      }
                      onChange={(event) =>
                        customProject
                          ? updateCustomMetadata("name", event.target.value)
                          : updateMetadata("name", event.target.value)
                      }
                      onFocus={() => {
                        if (customProject) focusCustomMetadata("name");
                      }}
                      onBlur={() =>
                        void (customProject ? commitCustomMetadata("name") : authority.flushField("metadata.name"))
                      }
                      onKeyDown={(event) => {
                        if (customProject && event.key === "Escape") {
                          event.preventDefault();
                          cancelCustomMetadata("name");
                          return;
                        }
                        if (customProject && event.key === "Enter") {
                          event.preventDefault();
                          void commitCustomMetadata("name");
                        }
                      }}
                    />
                    {customProject && customMetadataErrors.name && (
                      <span id="custom-metadata-name-error" className="field-error" role="alert">
                        {customMetadataErrors.name}
                      </span>
                    )}
                  </label>
                  <label>
                    <span>Description</span>
                    <textarea
                      aria-label="Description"
                      value={displayedMetadata.description}
                      disabled={result?.canEdit === false || (busy && !customProject)}
                      data-draft-field="metadata.description"
                      aria-invalid={Boolean(customProject && customMetadataErrors.description)}
                      aria-describedby={
                        customProject && customMetadataErrors.description
                          ? "custom-metadata-description-error"
                          : undefined
                      }
                      rows={3}
                      onChange={(event) =>
                        customProject
                          ? updateCustomMetadata("description", event.target.value)
                          : updateMetadata("description", event.target.value)
                      }
                      onFocus={() => {
                        if (customProject) focusCustomMetadata("description");
                      }}
                      onBlur={() =>
                        void (customProject
                          ? commitCustomMetadata("description")
                          : authority.flushField("metadata.description"))
                      }
                      onKeyDown={(event) => {
                        if (customProject && event.key === "Escape") {
                          event.preventDefault();
                          cancelCustomMetadata("description");
                          return;
                        }
                        if (customProject && event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void commitCustomMetadata("description");
                        }
                      }}
                    />
                    {customProject && customMetadataErrors.description && (
                      <span id="custom-metadata-description-error" className="field-error" role="alert">
                        {customMetadataErrors.description}
                      </span>
                    )}
                  </label>
                  <label>
                    <span>Author</span>
                    <input
                      aria-label="Author"
                      value={displayedMetadata.author}
                      disabled={result?.canEdit === false || (busy && !customProject)}
                      data-draft-field="metadata.author"
                      aria-invalid={Boolean(customProject && customMetadataErrors.author)}
                      aria-describedby={
                        customProject && customMetadataErrors.author ? "custom-metadata-author-error" : undefined
                      }
                      onChange={(event) =>
                        customProject
                          ? updateCustomMetadata("author", event.target.value)
                          : updateMetadata("author", event.target.value)
                      }
                      onFocus={() => {
                        if (customProject) focusCustomMetadata("author");
                      }}
                      onBlur={() =>
                        void (customProject ? commitCustomMetadata("author") : authority.flushField("metadata.author"))
                      }
                      onKeyDown={(event) => {
                        if (customProject && event.key === "Escape") {
                          event.preventDefault();
                          cancelCustomMetadata("author");
                          return;
                        }
                        if (customProject && event.key === "Enter") {
                          event.preventDefault();
                          void commitCustomMetadata("author");
                        }
                      }}
                    />
                    {customProject && customMetadataErrors.author && (
                      <span id="custom-metadata-author-error" className="field-error" role="alert">
                        {customMetadataErrors.author}
                      </span>
                    )}
                  </label>
                </section>
                <section className="control-group" aria-labelledby="material-title">
                  <h2 id="material-title">Launcher Material</h2>
                  <p>Only these two fields are consumed by the pinned launcher profile.</p>
                  <label>
                    <span>Primary color</span>
                    <input
                      aria-label="Primary color"
                      type="color"
                      disabled={!project || busy}
                      value={(() => {
                        const color = project?.tokens.primaryColor as
                          { r?: unknown; g?: unknown; b?: unknown } | undefined;
                        return color && [color.r, color.g, color.b].every((value) => Number.isInteger(value))
                          ? `#${[color.r, color.g, color.b].map((value) => Number(value).toString(16).padStart(2, "0")).join("")}`
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
                      disabled={!project || busy}
                      checked={project?.tokens.darkTheme === true}
                      onChange={(event) =>
                        void run("Dark theme saved.", () =>
                          window.studio.edit({
                            version: 1,
                            type: "set-token",
                            key: "darkTheme",
                            value: event.target.checked,
                          }),
                        )
                      }
                    />
                    <span>Dark theme</span>
                  </label>
                  <details>
                    <summary>Preserved legacy migration data</summary>
                    <p>Background, foreground, accent, and scene values are retained but not exported.</p>
                  </details>
                </section>
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
                    <ul
                      ref={diagnosticsRef}
                      className="diagnostic-list"
                      aria-label="Compatibility diagnostics"
                      aria-live="assertive"
                      tabIndex={0}
                    >
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
                      disabled={!loaded || busy || result?.canExport !== true}
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
                      <strong>
                        {customProject ? `${customProject.metadata.name} export summary` : "Export summary"}
                      </strong>
                      <dl className="export-destination">
                        <div>
                          <dt>Destination</dt>
                          <dd>{result.publication.destination}</dd>
                        </div>
                        <div>
                          <dt>Folder</dt>
                          <dd>{result.publication.folderName}/</dd>
                        </div>
                        <div>
                          <dt>ZIP</dt>
                          <dd>{result.publication.zipName}</dd>
                        </div>
                      </dl>
                      <span>{result.publication.files.join(" · ")}</span>
                      <code>Report SHA-256: {result.publication.reportSha256}</code>
                      <code>ZIP SHA-256: {result.publication.zipSha256}</code>
                      <div className="reveal-actions" aria-label="Reveal exported files">
                        <button type="button" onClick={() => void reveal("folder")}>
                          Reveal folder
                        </button>
                        <button type="button" onClick={() => void reveal("zip")}>
                          Reveal ZIP
                        </button>
                      </div>
                      <section className="sd-guidance" aria-labelledby="sd-guidance-title">
                        <strong id="sd-guidance-title">Copy to an SD card manually</strong>
                        <ol>
                          {sdGuidance!.steps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                        {sdGuidance!.bgm && <p>{sdGuidance!.bgm}</p>}
                        <p>{sdGuidance!.boundary}</p>
                        <p>{sdGuidance!.report}</p>
                      </section>
                    </output>
                  )}
                </section>
              </section>
            </details>
          </div>
          <CreatorWorkspace
            key={workspaceIdentity}
            instance={workspaceIdentity}
            customProject={customProject}
            authorityVersion={workspaceAuthority}
            images={result?.customAuthoring?.images}
            visualDocuments={result?.customAuthoring?.visualDocuments}
            visualSources={visualSources}
            readOnly={result?.canEdit === false}
            onAdd={addLayer}
            onImport={importLayer}
            onOperation={editLayer}
          />
          {customProject && (
            <details className="custom-visual-tools">
              <summary>Visual outputs and audio</summary>
              <div>
                <CustomAssetBench
                  sources={visualSources}
                  onAssign={(role) => void assignVisual(role)}
                  disabled={busy || result?.canEdit === false}
                />
                <CustomOutputRail visualPackage={visualPackage} />
                <AudioWorkbench
                  initialSounds={result.customAuthoring?.sounds}
                  presentRoles={result.soundRoles}
                  onPrepare={prepareSound}
                  onRemove={removeSound}
                  onError={(error) => setStatus(safeErrorMessage(error))}
                  disabled={busy || result?.canEdit === false}
                />
              </div>
            </details>
          )}
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
                images={result?.customAuthoring?.images}
                launcherView={launcherView}
                renderSurface={customRenderPlan?.screens[0]}
                scene={preview?.scenes[0]}
                screen="top"
              />
              <PhysicalPreview
                images={result?.customAuthoring?.images}
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
