import { describe, expect, it, vi } from "vitest";
import {
  focusAfterLayerRemoval,
  SURFACE_SIZE,
  initialWorkspaceView,
  paintWorkspaceSurface,
  pointerTranslationQ16,
  updateWorkspaceView,
} from "./workspace-model.js";

describe("read-only workspace model", () => {
  it("keeps focus, zoom, and grid as local presentation state", () => {
    const focused = updateWorkspaceView(initialWorkspaceView, { type: "focus", screen: "bottom" });
    const zoomed = updateWorkspaceView(focused, { type: "zoom", value: 150 });
    const gridded = updateWorkspaceView(zoomed, { type: "grid", value: true });

    expect(initialWorkspaceView).toEqual({ focus: "dual", gap: 96, grid: false, zoom: 100 });
    expect(gridded).toEqual({ focus: "bottom", gap: 96, grid: true, zoom: 150 });
    expect(SURFACE_SIZE).toEqual({ width: 256, height: 192 });
  });

  it("paints a bounded Canvas surface without making Canvas authoritative", () => {
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: "",
      globalAlpha: 1,
      strokeStyle: "",
      lineWidth: 0,
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    };

    paintWorkspaceSurface(context, { background: "#10243a", accent: "#f04491" }, false);

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 256, 192);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 256, 192);
    expect(context.stroke).not.toHaveBeenCalled();
  });

  it("paints shared-plan layers in deterministic order", () => {
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: "",
      globalAlpha: 1,
      strokeStyle: "",
      lineWidth: 0,
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    };
    const surface = {
      screen: "top" as const,
      width: 256 as const,
      height: 192 as const,
      layers: [
        {
          id: "first",
          order: 0,
          asset: { path: "a", sha256: "a" },
          opacity: 65536,
          source: { x: 0, y: 0, width: 1, height: 1 },
          destinationQ16: { x: 65536, y: 131072, width: 196608, height: 262144 },
        },
        {
          id: "last",
          order: 1,
          asset: { path: "b", sha256: "b" },
          opacity: 32768,
          source: { x: 0, y: 0, width: 1, height: 1 },
          destinationQ16: { x: 327680, y: 393216, width: 458752, height: 524288 },
        },
      ],
    };

    paintWorkspaceSurface(context, { background: "#000000", accent: "#ffffff" }, false, surface);

    expect(context.fillRect).toHaveBeenNthCalledWith(4, 1, 2, 3, 4);
    expect(context.fillRect).toHaveBeenNthCalledWith(5, 5, 6, 7, 8);
    expect(context.globalAlpha).toBe(1);
  });

  it("derives one fixed-point destination from a completed pointer gesture", () => {
    expect(pointerTranslationQ16({ xQ16: 2 * 65536, yQ16: 3 * 65536 }, { x: 10, y: 20 }, { x: 14, y: 18 })).toEqual({
      xQ16: 6 * 65536,
      yQ16: 65536,
    });
  });

  it("restores focus to the next layer, previous layer, then Add", () => {
    expect(focusAfterLayerRemoval(["a", "b", "c"], "b")).toBe("c");
    expect(focusAfterLayerRemoval(["a", "b"], "b")).toBe("a");
    expect(focusAfterLayerRemoval(["a"], "a")).toBeUndefined();
  });
});
