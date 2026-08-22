import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_LAYOUT,
  LEGACY_WORKSPACE_LAYOUT_PREFERENCE,
  MAX_WORKSPACE_DOCK_WIDTH,
  MAX_WORKSPACE_EDIT_SPLIT,
  MIN_WORKSPACE_DOCK_WIDTH,
  MIN_WORKSPACE_EDIT_SPLIT,
  V2_WORKSPACE_LAYOUT_PREFERENCE,
  loadWorkspaceLayout,
  parseWorkspaceLayout,
  resetWorkspaceLayout,
  saveWorkspaceLayout,
  dockWidthAfterKey,
  editSplitAfterKey,
  toggleWorkspaceFocus,
  visibleWorkspaceLayout,
  WORKSPACE_LAYOUT_PREFERENCE,
  workspaceLayoutFromStorageEvent,
  type WorkspaceLayout,
  type WorkspaceLayoutState,
} from "./workspace-layout.js";

const layout = (overrides: Partial<WorkspaceLayout> = {}): WorkspaceLayout => ({
  ...DEFAULT_WORKSPACE_LAYOUT,
  ...overrides,
});
const stored = (version: number, value: WorkspaceLayout | Record<string, unknown>) =>
  JSON.stringify({ version, layout: value });

describe("workspace layout", () => {
  it("accepts the exact v3 schema and clamps persisted dimensions", () => {
    expect(parseWorkspaceLayout(stored(3, layout({ dockOpen: false, dockTab: "preview" })))).toEqual(
      layout({ dockOpen: false, dockTab: "preview" }),
    );
    expect(parseWorkspaceLayout(stored(3, layout({ dockWidth: 100, editSplit: 99 })))).toEqual(
      layout({ dockWidth: MIN_WORKSPACE_DOCK_WIDTH, editSplit: MAX_WORKSPACE_EDIT_SPLIT }),
    );
    expect(parseWorkspaceLayout(stored(3, layout({ dockWidth: 999, editSplit: -4 })))).toEqual(
      layout({ dockWidth: MAX_WORKSPACE_DOCK_WIDTH, editSplit: MIN_WORKSPACE_EDIT_SPLIT }),
    );
  });

  it("rejects malformed, extra, and nonnumeric v3 values", () => {
    const expected = layout({ dockOpen: false, dockTab: "preview", previewMode: "banner-list" });
    for (const invalid of [
      "{",
      stored(4, expected),
      JSON.stringify({ version: 3, layout: expected, extra: true }),
      stored(3, { ...expected, extra: true }),
      stored(3, { ...expected, dockTab: "audio" }),
      stored(3, { ...expected, dockWidth: "320" }),
      stored(3, { ...expected, editSplit: null }),
    ])
      expect(parseWorkspaceLayout(invalid)).toEqual(DEFAULT_WORKSPACE_LAYOUT);
  });

  it("migrates strict v2 preferences with new dock defaults", () => {
    const v2 = JSON.stringify({
      version: 2,
      layout: { dockOpen: false, dockTab: "properties", previewMode: "vertical-grid" },
    });
    expect(parseWorkspaceLayout(v2)).toEqual(
      layout({ dockOpen: false, dockTab: "properties", previewMode: "vertical-grid" }),
    );
    expect(parseWorkspaceLayout(null, v2)).toEqual(
      layout({ dockOpen: false, dockTab: "properties", previewMode: "vertical-grid" }),
    );
    expect(
      parseWorkspaceLayout(
        null,
        JSON.stringify({
          version: 2,
          layout: { dockOpen: true, dockTab: "layers", previewMode: "coverflow", extra: true },
        }),
      ),
    ).toEqual(DEFAULT_WORKSPACE_LAYOUT);
  });

  it("migrates v1 panel preferences deterministically", () => {
    const legacy = (panels: Record<string, boolean>) => JSON.stringify({ version: 1, panels });
    expect(parseWorkspaceLayout(null, null, legacy({ layers: false, inspector: true, preview: true }))).toEqual(
      layout({ dockTab: "properties" }),
    );
    expect(parseWorkspaceLayout(null, null, legacy({ layers: false, inspector: false, preview: false }))).toEqual(
      layout({ dockOpen: false, dockTab: "preview" }),
    );
    expect(parseWorkspaceLayout(null, null, legacy({ layers: true, inspector: true, preview: true }))).toEqual(
      DEFAULT_WORKSPACE_LAYOUT,
    );
    expect(
      parseWorkspaceLayout(
        null,
        null,
        JSON.stringify({
          version: 1,
          panels: { layers: true, inspector: true, preview: true, extra: false },
        }),
      ),
    ).toEqual(DEFAULT_WORKSPACE_LAYOUT);
  });

  it("loads old keys and persists only strict v3 preferences", () => {
    const values = new Map<string, string>([
      [WORKSPACE_LAYOUT_PREFERENCE, JSON.stringify({ version: 3, layout: { invalid: true } })],
      [
        V2_WORKSPACE_LAYOUT_PREFERENCE,
        JSON.stringify({
          version: 2,
          layout: { dockOpen: true, dockTab: "properties", previewMode: "horizontal-grid" },
        }),
      ],
      [
        LEGACY_WORKSPACE_LAYOUT_PREFERENCE,
        JSON.stringify({ version: 1, panels: { layers: true, inspector: true, preview: true } }),
      ],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    expect(loadWorkspaceLayout(storage)).toEqual(layout({ dockTab: "properties", previewMode: "horizontal-grid" }));
    const next = layout({
      dockOpen: false,
      dockTab: "preview",
      previewMode: "banner-list",
      dockWidth: 444,
      editSplit: 65,
    });
    saveWorkspaceLayout(storage, next);
    expect(JSON.parse(values.get(WORKSPACE_LAYOUT_PREFERENCE)!)).toEqual({ version: 3, layout: next });
    saveWorkspaceLayout(storage, layout({ dockWidth: 1, editSplit: 99 }));
    expect(JSON.parse(values.get(WORKSPACE_LAYOUT_PREFERENCE)!)).toEqual({
      version: 3,
      layout: layout({ dockWidth: MIN_WORKSPACE_DOCK_WIDTH, editSplit: MAX_WORKSPACE_EDIT_SPLIT }),
    });
  });

  it("falls back safely when storage fails", () => {
    expect(
      loadWorkspaceLayout({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toEqual(DEFAULT_WORKSPACE_LAYOUT);
    expect(() =>
      saveWorkspaceLayout(
        {
          setItem: () => {
            throw new Error("full");
          },
        },
        DEFAULT_WORKSPACE_LAYOUT,
      ),
    ).not.toThrow();
  });

  it("synchronizes v3 and migrated v2 storage events from the same storage area", () => {
    const storage = {} as Storage;
    const next = layout({ dockOpen: false, dockTab: "preview", dockWidth: 430, editSplit: 60 });
    expect(
      workspaceLayoutFromStorageEvent(
        { key: WORKSPACE_LAYOUT_PREFERENCE, newValue: stored(3, next), storageArea: storage },
        storage,
      ),
    ).toEqual(next);
    expect(
      workspaceLayoutFromStorageEvent(
        {
          key: V2_WORKSPACE_LAYOUT_PREFERENCE,
          newValue: JSON.stringify({
            version: 2,
            layout: { dockOpen: false, dockTab: "properties", previewMode: "vertical-grid" },
          }),
          storageArea: storage,
        },
        storage,
      ),
    ).toEqual(layout({ dockOpen: false, dockTab: "properties", previewMode: "vertical-grid" }));
    expect(
      workspaceLayoutFromStorageEvent({ key: "other", newValue: null, storageArea: storage }, storage),
    ).toBeUndefined();
    expect(
      workspaceLayoutFromStorageEvent(
        { key: WORKSPACE_LAYOUT_PREFERENCE, newValue: stored(3, next), storageArea: {} as Storage },
        storage,
      ),
    ).toBeUndefined();
  });

  it("resizes the right dock and edit split with directional keyboard controls", () => {
    expect(dockWidthAfterKey(320, "ArrowLeft")).toBe(336);
    expect(dockWidthAfterKey(320, "ArrowRight")).toBe(304);
    expect(dockWidthAfterKey(320, "Home")).toBe(MIN_WORKSPACE_DOCK_WIDTH);
    expect(dockWidthAfterKey(320, "End")).toBe(MAX_WORKSPACE_DOCK_WIDTH);
    expect(dockWidthAfterKey(320, "ArrowUp")).toBeUndefined();
    expect(editSplitAfterKey(50, "ArrowUp")).toBe(45);
    expect(editSplitAfterKey(50, "ArrowDown")).toBe(55);
    expect(editSplitAfterKey(25, "ArrowUp")).toBe(MIN_WORKSPACE_EDIT_SPLIT);
    expect(editSplitAfterKey(75, "ArrowDown")).toBe(MAX_WORKSPACE_EDIT_SPLIT);
  });

  it("keeps focus modes transient and restores the exact dock state", () => {
    const initial: WorkspaceLayoutState = {
      normal: layout({ dockTab: "properties", previewMode: "banner-list", dockWidth: 410, editSplit: 65 }),
    };
    const canvas = toggleWorkspaceFocus(initial, "canvas");
    expect(visibleWorkspaceLayout(canvas)).toMatchObject({ dockOpen: false, toolbarVisible: false });
    expect(toggleWorkspaceFocus(canvas, "canvas")).toEqual(initial);
    const dock = toggleWorkspaceFocus(initial, "dock");
    expect(visibleWorkspaceLayout(dock)).toMatchObject({ dockOpen: false, toolbarVisible: true });
    expect(toggleWorkspaceFocus(dock, "dock")).toEqual(initial);
    expect(resetWorkspaceLayout().normal).toEqual(DEFAULT_WORKSPACE_LAYOUT);
  });
});
