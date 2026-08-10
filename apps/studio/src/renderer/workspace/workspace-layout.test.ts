import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_LAYOUT,
  LEGACY_WORKSPACE_LAYOUT_PREFERENCE,
  loadWorkspaceLayout,
  parseWorkspaceLayout,
  resetWorkspaceLayout,
  saveWorkspaceLayout,
  toggleWorkspaceFocus,
  visibleWorkspaceLayout,
  WORKSPACE_LAYOUT_PREFERENCE,
  workspaceLayoutFromStorageEvent,
  type WorkspaceLayoutState,
} from "./workspace-layout.js";

describe("workspace layout", () => {
  it("accepts only the exact v2 schema", () => {
    const expected = { dockOpen: false, dockTab: "preview" as const, previewMode: "banner-list" as const };
    expect(parseWorkspaceLayout(JSON.stringify({ version: 2, layout: expected }))).toEqual(expected);
    for (const invalid of [
      "{",
      JSON.stringify({ version: 3, layout: expected }),
      JSON.stringify({ version: 2, layout: expected, extra: true }),
      JSON.stringify({ version: 2, layout: { ...expected, extra: true } }),
      JSON.stringify({ version: 2, layout: { ...expected, dockTab: "audio" } }),
    ])
      expect(parseWorkspaceLayout(invalid)).toEqual(DEFAULT_WORKSPACE_LAYOUT);
  });

  it("migrates current v1 panel preferences into one dock", () => {
    const legacy = (panels: Record<string, boolean>) => JSON.stringify({ version: 1, panels });
    expect(parseWorkspaceLayout(null, legacy({ layers: false, inspector: true, preview: true }))).toEqual({
      dockOpen: true,
      dockTab: "properties",
      previewMode: "coverflow",
    });
    expect(parseWorkspaceLayout(null, legacy({ layers: false, inspector: false, preview: false }))).toEqual({
      dockOpen: false,
      dockTab: "preview",
      previewMode: "coverflow",
    });
  });

  it("loads legacy storage and persists only strict v2 preferences", () => {
    const values = new Map<string, string>([
      [
        LEGACY_WORKSPACE_LAYOUT_PREFERENCE,
        JSON.stringify({ version: 1, panels: { layers: true, inspector: true, preview: true } }),
      ],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    expect(loadWorkspaceLayout(storage).dockTab).toBe("layers");
    saveWorkspaceLayout(storage, { dockOpen: true, dockTab: "preview", previewMode: "banner-list" });
    expect(JSON.parse(values.get(WORKSPACE_LAYOUT_PREFERENCE)!)).toEqual({
      version: 2,
      layout: { dockOpen: true, dockTab: "preview", previewMode: "banner-list" },
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

  it("accepts only matching v2 storage events", () => {
    const storage = {} as Storage;
    const layout = { dockOpen: true, dockTab: "preview" as const, previewMode: "coverflow" as const };
    expect(
      workspaceLayoutFromStorageEvent(
        { key: WORKSPACE_LAYOUT_PREFERENCE, newValue: JSON.stringify({ version: 2, layout }), storageArea: storage },
        storage,
      ),
    ).toEqual(layout);
    expect(
      workspaceLayoutFromStorageEvent({ key: "other", newValue: null, storageArea: storage }, storage),
    ).toBeUndefined();
  });

  it("keeps focus modes transient and restores the exact dock state", () => {
    const initial: WorkspaceLayoutState = {
      normal: { dockOpen: true, dockTab: "properties", previewMode: "banner-list" },
    };
    const canvas = toggleWorkspaceFocus(initial, "canvas");
    expect(visibleWorkspaceLayout(canvas)).toMatchObject({ dockOpen: false, toolbarVisible: false });
    expect(toggleWorkspaceFocus(canvas, "canvas")).toEqual(initial);
    const dock = toggleWorkspaceFocus(initial, "dock");
    expect(visibleWorkspaceLayout(dock)).toMatchObject({ dockOpen: false, toolbarVisible: true });
    expect(resetWorkspaceLayout().normal).toEqual(DEFAULT_WORKSPACE_LAYOUT);
  });
});
