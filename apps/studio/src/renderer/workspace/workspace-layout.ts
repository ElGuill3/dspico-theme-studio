export type WorkspaceDockTab = "layers" | "properties" | "preview";
export type WorkspacePreviewMode = "horizontal-grid" | "vertical-grid" | "banner-list" | "coverflow";
export type WorkspaceLayout = {
  dockOpen: boolean;
  dockTab: WorkspaceDockTab;
  previewMode: WorkspacePreviewMode;
  dockWidth: number;
  editSplit: number;
};
export type WorkspaceFocus = "canvas" | "dock";
export type WorkspaceLayoutState = { normal: WorkspaceLayout; focus?: WorkspaceFocus };

export const WORKSPACE_LAYOUT_PREFERENCE = "dspico:workspace-layout:v3";
export const V2_WORKSPACE_LAYOUT_PREFERENCE = "dspico:workspace-layout:v2";
export const LEGACY_WORKSPACE_LAYOUT_PREFERENCE = "dspico:workspace-layout:v1";
export const MIN_WORKSPACE_DOCK_WIDTH = 260;
export const MAX_WORKSPACE_DOCK_WIDTH = 520;
export const MIN_WORKSPACE_EDIT_SPLIT = 25;
export const MAX_WORKSPACE_EDIT_SPLIT = 75;
export const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayout = Object.freeze({
  dockOpen: true,
  dockTab: "layers",
  previewMode: "coverflow",
  dockWidth: 320,
  editSplit: 50,
});

export const clampWorkspaceDockWidth = (value: number): number =>
  Math.min(
    MAX_WORKSPACE_DOCK_WIDTH,
    Math.max(MIN_WORKSPACE_DOCK_WIDTH, Math.round(Number.isFinite(value) ? value : DEFAULT_WORKSPACE_LAYOUT.dockWidth)),
  );
export const clampWorkspaceEditSplit = (value: number): number =>
  Math.min(
    MAX_WORKSPACE_EDIT_SPLIT,
    Math.max(MIN_WORKSPACE_EDIT_SPLIT, Math.round(Number.isFinite(value) ? value : DEFAULT_WORKSPACE_LAYOUT.editSplit)),
  );

export const dockWidthAfterKey = (value: number, key: string): number | undefined => {
  if (key === "ArrowLeft") return clampWorkspaceDockWidth(value + 16);
  if (key === "ArrowRight") return clampWorkspaceDockWidth(value - 16);
  if (key === "Home") return MIN_WORKSPACE_DOCK_WIDTH;
  if (key === "End") return MAX_WORKSPACE_DOCK_WIDTH;
};

export const editSplitAfterKey = (value: number, key: string): number | undefined => {
  if (key === "ArrowUp") return clampWorkspaceEditSplit(value - 5);
  if (key === "ArrowDown") return clampWorkspaceEditSplit(value + 5);
  if (key === "Home") return MIN_WORKSPACE_EDIT_SPLIT;
  if (key === "End") return MAX_WORKSPACE_EDIT_SPLIT;
};

const exactKeys = (record: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(record).length === keys.length && keys.every((key) => Object.hasOwn(record, key));
const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
const validDockTab = (value: unknown): value is WorkspaceDockTab =>
  ["layers", "properties", "preview"].includes(String(value));
const validPreviewMode = (value: unknown): value is WorkspacePreviewMode =>
  ["horizontal-grid", "vertical-grid", "banner-list", "coverflow"].includes(String(value));

const parseStoredWorkspaceLayout = (value: string | null | undefined): WorkspaceLayout | undefined => {
  if (!value) return;
  try {
    const envelope = record(JSON.parse(value));
    if (!envelope) return;
    if (envelope.version === 3 && exactKeys(envelope, ["version", "layout"])) {
      const layout = record(envelope.layout);
      if (
        layout &&
        exactKeys(layout, ["dockOpen", "dockTab", "previewMode", "dockWidth", "editSplit"]) &&
        typeof layout.dockOpen === "boolean" &&
        validDockTab(layout.dockTab) &&
        validPreviewMode(layout.previewMode) &&
        typeof layout.dockWidth === "number" &&
        Number.isFinite(layout.dockWidth) &&
        typeof layout.editSplit === "number" &&
        Number.isFinite(layout.editSplit)
      )
        return {
          dockOpen: layout.dockOpen,
          dockTab: layout.dockTab,
          previewMode: layout.previewMode,
          dockWidth: clampWorkspaceDockWidth(layout.dockWidth),
          editSplit: clampWorkspaceEditSplit(layout.editSplit),
        };
      return;
    }
    if (envelope.version === 2 && exactKeys(envelope, ["version", "layout"])) {
      const layout = record(envelope.layout);
      if (
        layout &&
        exactKeys(layout, ["dockOpen", "dockTab", "previewMode"]) &&
        typeof layout.dockOpen === "boolean" &&
        validDockTab(layout.dockTab) &&
        validPreviewMode(layout.previewMode)
      )
        return { ...DEFAULT_WORKSPACE_LAYOUT, ...layout };
      return;
    }
    if (envelope.version === 1 && exactKeys(envelope, ["version", "panels"])) {
      const panels = record(envelope.panels);
      if (
        panels &&
        exactKeys(panels, ["layers", "inspector", "preview"]) &&
        [panels.layers, panels.inspector, panels.preview].every((item) => typeof item === "boolean")
      )
        return {
          ...DEFAULT_WORKSPACE_LAYOUT,
          dockOpen: Boolean(panels.layers || panels.inspector || panels.preview),
          dockTab: panels.layers ? "layers" : panels.inspector ? "properties" : "preview",
        };
    }
  } catch {
    /* Invalid local preferences never prevent startup. */
  }
};

export const parseWorkspaceLayout = (
  value: string | null,
  v2?: string | null,
  legacy?: string | null,
): WorkspaceLayout => {
  for (const candidate of [value, v2, legacy]) {
    const layout = parseStoredWorkspaceLayout(candidate);
    if (layout) return layout;
  }
  return { ...DEFAULT_WORKSPACE_LAYOUT };
};

export const loadWorkspaceLayout = (storage?: Pick<Storage, "getItem">): WorkspaceLayout => {
  try {
    return parseWorkspaceLayout(
      storage?.getItem(WORKSPACE_LAYOUT_PREFERENCE) ?? null,
      storage?.getItem(V2_WORKSPACE_LAYOUT_PREFERENCE) ?? null,
      storage?.getItem(LEGACY_WORKSPACE_LAYOUT_PREFERENCE) ?? null,
    );
  } catch {
    return { ...DEFAULT_WORKSPACE_LAYOUT };
  }
};

export const saveWorkspaceLayout = (storage: Pick<Storage, "setItem"> | undefined, layout: WorkspaceLayout): void => {
  try {
    storage?.setItem(
      WORKSPACE_LAYOUT_PREFERENCE,
      JSON.stringify({
        version: 3,
        layout: {
          ...layout,
          dockWidth: clampWorkspaceDockWidth(layout.dockWidth),
          editSplit: clampWorkspaceEditSplit(layout.editSplit),
        },
      }),
    );
  } catch {
    /* Local preferences remain optional when storage is unavailable. */
  }
};

export const workspaceLayoutFromStorageEvent = (
  event: Pick<StorageEvent, "key" | "newValue" | "storageArea">,
  storage: Storage | undefined,
): WorkspaceLayout | undefined =>
  storage &&
  event.storageArea === storage &&
  [WORKSPACE_LAYOUT_PREFERENCE, V2_WORKSPACE_LAYOUT_PREFERENCE, LEGACY_WORKSPACE_LAYOUT_PREFERENCE].includes(
    event.key ?? "",
  )
    ? parseWorkspaceLayout(event.newValue)
    : undefined;

export const visibleWorkspaceLayout = ({ normal, focus }: WorkspaceLayoutState) => ({
  ...normal,
  dockOpen: focus ? false : normal.dockOpen,
  toolbarVisible: focus !== "canvas",
});

export const toggleWorkspaceFocus = (state: WorkspaceLayoutState, focus: WorkspaceFocus): WorkspaceLayoutState =>
  state.focus === focus ? { normal: state.normal } : { normal: state.normal, focus };

export const resetWorkspaceLayout = (): WorkspaceLayoutState => ({ normal: { ...DEFAULT_WORKSPACE_LAYOUT } });
