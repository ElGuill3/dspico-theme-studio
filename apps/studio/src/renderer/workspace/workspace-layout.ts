export type WorkspaceDockTab = "layers" | "properties" | "preview";
export type WorkspacePreviewMode = "horizontal-grid" | "vertical-grid" | "banner-list" | "coverflow";
export type WorkspaceLayout = {
  dockOpen: boolean;
  dockTab: WorkspaceDockTab;
  previewMode: WorkspacePreviewMode;
};
export type WorkspaceFocus = "canvas" | "dock";
export type WorkspaceLayoutState = { normal: WorkspaceLayout; focus?: WorkspaceFocus };

export const WORKSPACE_LAYOUT_PREFERENCE = "dspico:workspace-layout:v2";
export const LEGACY_WORKSPACE_LAYOUT_PREFERENCE = "dspico:workspace-layout:v1";
export const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayout = Object.freeze({
  dockOpen: true,
  dockTab: "layers",
  previewMode: "coverflow",
});

const validLayout = (value: unknown): value is WorkspaceLayout => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 3 &&
    typeof record.dockOpen === "boolean" &&
    ["layers", "properties", "preview"].includes(String(record.dockTab)) &&
    ["horizontal-grid", "vertical-grid", "banner-list", "coverflow"].includes(String(record.previewMode))
  );
};

export const parseWorkspaceLayout = (value: string | null, legacy?: string | null): WorkspaceLayout => {
  try {
    const parsed = value ? (JSON.parse(value) as { version?: unknown; layout?: unknown }) : undefined;
    if (parsed && Object.keys(parsed).length === 2 && parsed.version === 2 && validLayout(parsed.layout))
      return { ...parsed.layout };
  } catch {
    /* Fall through to the legacy preference. */
  }
  try {
    const parsed = legacy ? (JSON.parse(legacy) as { version?: unknown; panels?: unknown }) : undefined;
    const panels = parsed?.panels as Record<string, unknown> | undefined;
    if (
      parsed &&
      Object.keys(parsed).length === 2 &&
      parsed.version === 1 &&
      panels &&
      Object.keys(panels).length === 3 &&
      [panels.layers, panels.inspector, panels.preview].every((item) => typeof item === "boolean")
    )
      return {
        dockOpen: Boolean(panels.layers || panels.inspector || panels.preview),
        dockTab: panels.layers ? "layers" : panels.inspector ? "properties" : "preview",
        previewMode: "coverflow",
      };
  } catch {
    /* Invalid local preferences never prevent startup. */
  }
  return { ...DEFAULT_WORKSPACE_LAYOUT };
};

export const loadWorkspaceLayout = (storage?: Pick<Storage, "getItem">): WorkspaceLayout => {
  try {
    return parseWorkspaceLayout(
      storage?.getItem(WORKSPACE_LAYOUT_PREFERENCE) ?? null,
      storage?.getItem(LEGACY_WORKSPACE_LAYOUT_PREFERENCE) ?? null,
    );
  } catch {
    return { ...DEFAULT_WORKSPACE_LAYOUT };
  }
};

export const saveWorkspaceLayout = (storage: Pick<Storage, "setItem"> | undefined, layout: WorkspaceLayout): void => {
  try {
    storage?.setItem(WORKSPACE_LAYOUT_PREFERENCE, JSON.stringify({ version: 2, layout }));
  } catch {
    /* Local preferences remain optional when storage is unavailable. */
  }
};

export const workspaceLayoutFromStorageEvent = (
  event: Pick<StorageEvent, "key" | "newValue" | "storageArea">,
  storage: Storage | undefined,
): WorkspaceLayout | undefined =>
  storage && event.storageArea === storage && event.key === WORKSPACE_LAYOUT_PREFERENCE
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
