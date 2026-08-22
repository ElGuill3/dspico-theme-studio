import { describe, expect, it, vi } from "vitest";
import { applyOperationV3, createProjectV3, type VisualLayerV3 } from "../../../../../packages/theme-core/src/index.js";
import { compositeCustomLayersV1, imageSourcePixelAtQ16V1 } from "../../../../../packages/dspico-contract/src/index.js";
import { MAX_BATCH_LAYER_EDITS_V3 } from "../../../../../packages/theme-core/src/limits-v3.js";
import {
  focusAfterLayerRemoval,
  allocateCanonicalLayerId,
  alignLayerSelectionQ16,
  alignLayerToDocumentQ16,
  cropHandleAtPoint,
  clipboardMediaIsReachable,
  fitImageToArtboard,
  fitViewport,
  firstPngFile,
  freezeLayerClipboardSnapshot,
  gestureAuthorityKey,
  isResizeHandle,
  layerAtPoint,
  layerAndGroupIds,
  layerShortcut,
  isLayerEditingTarget,
  shouldHandleLayerPaste,
  layerVisualBoundsQ16,
  keyboardMoveDelta,
  reconcileLayerSelection,
  reorderLayerBlock,
  rotateLayerSelectionQuarterTurn,
  selectionVisualBoundsQ16,
  SURFACE_SIZE,
  initialWorkspaceView,
  normalizeViewport,
  panViewport,
  paintWorkspaceSurface,
  pointerTranslationQ16,
  pointerCrop,
  pointerTransformQ16,
  resizeHandleAtPoint,
  resolveGuideDrop,
  rulerTicks,
  RESIZE_HANDLES,
  snapLayerTransformQ16,
  snapSelectionTranslationQ16,
  distributeLayerSelectionQ16,
  duplicateLayerOffsetQ16,
  layerSelectionUnitCount,
  reconcileGroupedLayerSelection,
  translateLayerPositionsQ16,
  translateLayersIntoDocumentQ16,
  transitionDeletionSelection,
  transitionInsertionSelection,
  updateGroupedLayerSelection,
  updateLayerSelection,
  updateWorkspaceView,
  visualDocumentSurface,
  zoomViewportAtPoint,
} from "./workspace-model.js";

describe("read-only workspace model", () => {
  const layer = (id: string, x: number, y: number, width: number, height: number) => ({
    id,
    name: id,
    visible: true,
    opacity: 65536,
    asset: { path: id, sha256: id },
    xQ16: x * 65536,
    yQ16: y * 65536,
    width,
    height,
    widthQ16: width * 65536,
    heightQ16: height * 65536,
    crop: { x: 0, y: 0, width, height },
  });
  it("keeps focus, zoom, and grid as local presentation state", () => {
    const focused = updateWorkspaceView(initialWorkspaceView, {
      type: "focus",
      screen: "bottom",
    });
    const zoomed = updateWorkspaceView(focused, { type: "zoom", value: 150 });
    const gridded = updateWorkspaceView(zoomed, { type: "grid", value: true });

    expect(initialWorkspaceView).toEqual({
      focus: "dual",
      gap: 96,
      grid: false,
      zoom: 100,
    });
    expect(gridded).toEqual({
      focus: "bottom",
      gap: 96,
      grid: true,
      zoom: 150,
    });
    expect(SURFACE_SIZE).toEqual({ width: 256, height: 192 });
  });

  it("normalizes viewport math and preserves the pointer document coordinate while zooming", () => {
    const viewport = normalizeViewport({ zoom: 100, panX: 20, panY: -10 }),
      pointer = { x: 170, y: 65 },
      before = {
        x: (pointer.x - viewport.panX) / (viewport.zoom / 100),
        y: (pointer.y - viewport.panY) / (viewport.zoom / 100),
      },
      zoomed = zoomViewportAtPoint(viewport, 400, pointer),
      after = {
        x: (pointer.x - zoomed.panX) / (zoomed.zoom / 100),
        y: (pointer.y - zoomed.panY) / (zoomed.zoom / 100),
      };
    expect(after).toEqual(before);
    expect(zoomViewportAtPoint(viewport, Number.NaN, pointer).zoom).toBe(100);
    expect(zoomViewportAtPoint(viewport, 9999, pointer).zoom).toBe(1600);
    expect(panViewport(viewport, Number.POSITIVE_INFINITY, 3.333333)).toMatchObject({ panX: 20, panY: -6.666667 });
  });

  it("preserves an intrinsic pointer anchor through 1,000 min, max, and 100 percent zoom cycles", () => {
    const pointer = { x: 173.25, y: 81.75 },
      initial = normalizeViewport({ zoom: 100, panX: 19.125, panY: -7.875 }),
      anchor = {
        x: (pointer.x - initial.panX) / (initial.zoom / 100),
        y: (pointer.y - initial.panY) / (initial.zoom / 100),
      };
    let viewport = initial;
    for (let cycle = 0; cycle < 1_000; cycle += 1)
      for (const zoom of [25, 1600, 100]) viewport = zoomViewportAtPoint(viewport, zoom, pointer);
    const after = {
      x: (pointer.x - viewport.panX) / (viewport.zoom / 100),
      y: (pointer.y - viewport.panY) / (viewport.zoom / 100),
    };
    expect(Math.abs(after.x - anchor.x)).toBeLessThan(1e-10);
    expect(Math.abs(after.y - anchor.y)).toBeLessThan(1e-10);
  });

  it("fits documents in bounded containers and emits legible ruler ticks at zoom extremes", () => {
    expect(fitViewport({ width: 256, height: 192 }, { width: 320, height: 256 }, 32)).toMatchObject({
      zoom: 100,
      panX: 32,
      panY: 32,
    });
    expect(fitViewport({ width: 256, height: 192 }, { width: 1, height: 1 }).zoom).toBe(25);
    for (const zoom of [25, 1600]) {
      const ticks = rulerTicks(256, zoom);
      expect(ticks[0]).toEqual({ position: 0, major: true, label: "0" });
      expect(ticks.at(-1)).toEqual({
        position: 256,
        major: true,
        label: "256",
      });
      expect(ticks.filter(({ major }) => major).every(({ label }) => label !== undefined)).toBe(true);
    }
  });

  it("clamps guide drops and removes only beyond the explicit gutter", () => {
    const bounds = { left: 100, top: 50, right: 612, bottom: 434 };
    expect(resolveGuideDrop("x", { x: 196, y: 100 }, bounds, 2, 256)).toEqual({
      remove: false,
      position: 48,
    });
    expect(resolveGuideDrop("y", { x: 110, y: 49 }, bounds, 2, 192)).toEqual({
      remove: false,
      position: 0,
    });
    expect(resolveGuideDrop("x", { x: 75, y: 100 }, bounds, 2, 256)).toEqual({
      remove: true,
    });
    expect(resolveGuideDrop("y", { x: 110, y: 459 }, bounds, 2, 192)).toEqual({
      remove: true,
    });
  });

  it("paints a bounded Canvas surface without making Canvas authoritative", () => {
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: "",
      globalAlpha: 1,
      imageSmoothingEnabled: true,
      strokeStyle: "",
      lineWidth: 0,
      drawImage: vi.fn(),
      ellipse: vi.fn(),
      fill: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
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
      imageSmoothingEnabled: true,
      strokeStyle: "",
      lineWidth: 0,
      drawImage: vi.fn(),
      ellipse: vi.fn(),
      fill: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
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
          destinationQ16: {
            x: 65536,
            y: 131072,
            width: 196608,
            height: 262144,
          },
        },
        {
          id: "last",
          order: 1,
          asset: { path: "b", sha256: "b" },
          opacity: 32768,
          source: { x: 0, y: 0, width: 1, height: 1 },
          destinationQ16: {
            x: 327680,
            y: 393216,
            width: 458752,
            height: 524288,
          },
        },
      ],
    };

    paintWorkspaceSurface(context, { background: "#000000", accent: "#ffffff" }, false, surface, undefined, new Map(), [
      "first",
    ]);

    expect(context.fillRect).toHaveBeenNthCalledWith(4, 1, 2, 3, 4);
    expect(context.fillRect).toHaveBeenNthCalledWith(5, 5, 6, 7, 8);
    expect(context.strokeRect).not.toHaveBeenCalled();
    expect(context.globalAlpha).toBe(1);
  });

  it("derives one fixed-point destination from a completed pointer gesture", () => {
    expect(pointerTranslationQ16({ xQ16: 2 * 65536, yQ16: 3 * 65536 }, { x: 10, y: 20 }, { x: 14, y: 18 })).toEqual({
      xQ16: 6 * 65536,
      yQ16: 65536,
    });
  });

  it("invalidates gesture snapshots when document authority changes", () => {
    const started = gestureAuthorityKey("project:role", 7);
    expect(gestureAuthorityKey("project:role", 7)).toBe(started);
    expect(gestureAuthorityKey("project:role", 8)).not.toBe(started);
    expect(gestureAuthorityKey("other:role", 7)).not.toBe(started);
  });

  it("moves once per physical arrow key and ignores browser auto-repeat", () => {
    expect(keyboardMoveDelta("ArrowRight")).toEqual([1, 0]);
    expect(keyboardMoveDelta("ArrowUp", true)).toEqual([0, -10]);
    expect(keyboardMoveDelta("ArrowRight", false, true)).toBeUndefined();
    expect(keyboardMoveDelta("Enter")).toBeUndefined();
  });

  it("toggles an ordered selection without range semantics and falls back around the active layer", () => {
    let selection = updateLayerSelection({ ids: [] }, "first", true);
    selection = updateLayerSelection(selection, "third", true);
    selection = updateLayerSelection(selection, "second", true);
    expect(selection).toEqual({
      ids: ["first", "third", "second"],
      active: "second",
    });
    expect(updateLayerSelection(selection, "third", true)).toEqual({
      ids: ["first", "second"],
      active: "second",
    });
    expect(updateLayerSelection(selection, "second", true)).toEqual({
      ids: ["first", "third"],
      active: "third",
    });
    expect(updateLayerSelection(selection, "first")).toEqual({
      ids: ["first"],
      active: "first",
    });
  });

  it("rejects the 257th selection before a batch command can reach history", () => {
    let selection = { ids: [] as string[] };
    for (let index = 0; index < MAX_BATCH_LAYER_EDITS_V3; index += 1)
      selection = updateLayerSelection(selection, `layer-${index}`, true, MAX_BATCH_LAYER_EDITS_V3);
    const rejected = updateLayerSelection(selection, "layer-256", true, MAX_BATCH_LAYER_EDITS_V3);
    expect(rejected).toBe(selection);
    expect(rejected.ids).toHaveLength(256);
    expect(rejected.ids).not.toContain("layer-256");
  });

  it("allocates canonical layer and group IDs across collisions in one batch", () => {
    const used = new Set(["existing", "group-existing"]),
      candidates = ["existing", "fresh-layer", "existing", "fresh-second"],
      random = () => candidates.shift()!;
    expect(allocateCanonicalLayerId(used, "", random)).toBe("fresh-layer");
    expect(allocateCanonicalLayerId(used, "", random)).toBe("fresh-second");
    const groups = ["existing", "new-group"],
      group = allocateCanonicalLayerId(used, "group-", () => groups.shift()!);
    expect(group).toBe("group-new-group");
    expect(used).toEqual(new Set(["existing", "group-existing", "fresh-layer", "fresh-second", group]));
  });

  it("fails ID allocation deterministically only after bounded repeated collisions", () => {
    let calls = 0;
    expect(() =>
      allocateCanonicalLayerId(
        new Set(["collision"]),
        "",
        () => {
          calls += 1;
          return "collision";
        },
        4,
      ),
    ).toThrow("Could not allocate a fresh layer or group ID.");
    expect(calls).toBe(4);
  });

  it("retries layer and group collisions before one accepted batch history operation", () => {
    const metadata = {
      name: "IDs",
      description: "Collision-safe IDs",
      author: "Ada",
    };
    let state = createProjectV3({
      projectId: "allocator-history",
      metadata,
      themeKind: "custom",
    });
    for (const id of ["existing-a", "existing-b"])
      state = applyOperationV3(state, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "add-shape-layer",
          layer: {
            kind: "shape",
            shape: "rectangle",
            fill: "#000000",
            id,
            name: id,
            visible: true,
            opacity: 65536,
            xQ16: 0,
            yQ16: 0,
            widthQ16: 65536,
            heightQ16: 65536,
          },
        },
      });
    state = applyOperationV3(state, {
      version: 3,
      type: "edit-visual-document",
      role: "scrim",
      operation: {
        version: 3,
        type: "set-layer-groups",
        memberships: [
          { layerId: "existing-a", groupId: "group-existing" },
          { layerId: "existing-b", groupId: "group-existing" },
        ],
      },
    });
    const current = state.project.visualDocuments!.scrim!.layers,
      used = layerAndGroupIds(current),
      layerCandidates = ["existing-a", "copy-a", "copy-a", "copy-b"],
      groupCandidates = ["existing", "copy"],
      first = allocateCanonicalLayerId(used, "", () => layerCandidates.shift()!),
      second = allocateCanonicalLayerId(used, "", () => layerCandidates.shift()!),
      groupId = allocateCanonicalLayerId(used, "group-", () => groupCandidates.shift()!),
      inserted = applyOperationV3(state, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "insert-layers",
          toIndex: current.length,
          layers: [
            { ...current[0]!, id: first, groupId },
            { ...current[1]!, id: second, groupId },
          ],
        },
      });
    expect(inserted.operations).toHaveLength(state.operations.length + 1);
    expect(
      inserted.project.visualDocuments!.scrim!.layers.slice(-2).map(({ id, groupId: group }) => [id, group]),
    ).toEqual([
      ["copy-a", "group-copy"],
      ["copy-b", "group-copy"],
    ]);
  });

  it.each([
    {
      name: "singleton forward",
      layers: [layer("a", 0, 0, 1, 1), layer("b", 0, 0, 1, 1), layer("c", 0, 0, 1, 1)],
      id: "b",
      direction: 1,
      expected: ["a", "c", "b"],
    },
    {
      name: "singleton backward",
      layers: [layer("a", 0, 0, 1, 1), layer("b", 0, 0, 1, 1), layer("c", 0, 0, 1, 1)],
      id: "b",
      direction: -1,
      expected: ["b", "a", "c"],
    },
    {
      name: "source group forward",
      layers: [
        { ...layer("a", 0, 0, 1, 1), groupId: "g1" },
        { ...layer("b", 0, 0, 1, 1), groupId: "g1", visible: false },
        layer("c", 0, 0, 1, 1),
      ],
      id: "a",
      direction: 1,
      expected: ["c", "a", "b"],
    },
    {
      name: "source group backward",
      layers: [
        layer("a", 0, 0, 1, 1),
        { ...layer("b", 0, 0, 1, 1), groupId: "g1" },
        { ...layer("c", 0, 0, 1, 1), groupId: "g1" },
      ],
      id: "c",
      direction: -1,
      expected: ["b", "c", "a"],
    },
    {
      name: "before destination group",
      layers: [
        layer("a", 0, 0, 1, 1),
        { ...layer("b", 0, 0, 1, 1), groupId: "g2" },
        { ...layer("c", 0, 0, 1, 1), groupId: "g2" },
        layer("d", 0, 0, 1, 1),
      ],
      id: "d",
      direction: -1,
      expected: ["a", "d", "b", "c"],
    },
    {
      name: "after destination group",
      layers: [
        layer("a", 0, 0, 1, 1),
        { ...layer("b", 0, 0, 1, 1), groupId: "g2" },
        { ...layer("c", 0, 0, 1, 1), groupId: "g2" },
        layer("d", 0, 0, 1, 1),
      ],
      id: "a",
      direction: 1,
      expected: ["b", "c", "a", "d"],
    },
    {
      name: "multiple groups",
      layers: [
        { ...layer("a", 0, 0, 1, 1), groupId: "g1" },
        { ...layer("b", 0, 0, 1, 1), groupId: "g1" },
        { ...layer("c", 0, 0, 1, 1), groupId: "g2" },
        { ...layer("d", 0, 0, 1, 1), groupId: "g2" },
      ],
      id: "a",
      direction: 1,
      expected: ["c", "d", "a", "b"],
    },
  ] as const)("reorders atomic blocks: $name", ({ layers, id, direction, expected }) => {
    const operation = reorderLayerBlock(layers, id, direction),
      moving = new Set(operation!.layerIds),
      remaining = layers.filter((entry) => !moving.has(entry.id)),
      result = [
        ...remaining.slice(0, operation!.toIndex),
        ...layers.filter((entry) => moving.has(entry.id)),
        ...remaining.slice(operation!.toIndex),
      ];
    expect(result.map(({ id: resultId }) => resultId)).toEqual(expected);
  });

  it("does not reorder beyond the first or last atomic block", () => {
    const layers = [layer("first", 0, 0, 1, 1), layer("last", 0, 0, 1, 1)];
    expect(reorderLayerBlock(layers, "first", -1)).toBeUndefined();
    expect(reorderLayerBlock(layers, "last", 1)).toBeUndefined();
  });

  it("ignores layer shortcuts in text editors and resolves them outside", () => {
    for (const target of [{ tagName: "input" }, { tagName: "textarea" }, { tagName: "div", isContentEditable: true }]) {
      expect(isLayerEditingTarget(target)).toBe(true);
      expect(shouldHandleLayerPaste(target)).toBe(false);
      for (const modifier of [{ ctrlKey: true }, { metaKey: true }])
        for (const key of ["c", "v", "g"])
          expect(
            layerShortcut({
              key,
              ...modifier,
              shiftKey: key === "g",
              editing: true,
            }),
          ).toBeUndefined();
    }
    expect(layerShortcut({ key: "c", ctrlKey: true })).toBe("copy");
    expect(layerShortcut({ key: "d", metaKey: true })).toBe("duplicate");
    expect(layerShortcut({ key: "g", ctrlKey: true })).toBe("group");
    expect(layerShortcut({ key: "g", metaKey: true, shiftKey: true })).toBe("ungroup");
    expect(layerShortcut({ key: "l", ctrlKey: true, altKey: true })).toBe("lock");
    expect(layerShortcut({ key: "l", metaKey: true, altKey: true, shiftKey: true })).toBe("unlock");
    expect(layerShortcut({ key: "l", ctrlKey: true, altKey: true, editing: true })).toBeUndefined();
    expect(isLayerEditingTarget({ tagName: "button" })).toBe(false);
  });

  it("computes the same quarter turn per member without changing geometry", () => {
    const layers = [
        { ...layer("a", 1, 2, 3, 4), rotation: 0 as const },
        { ...layer("b", 7, 8, 5, 6), rotation: 180 as const },
      ],
      rotations = rotateLayerSelectionQuarterTurn(layers, 90);
    expect(rotations).toEqual([
      { layerId: "a", rotation: 90 },
      { layerId: "b", rotation: 270 },
    ]);
    expect(
      layers.map(({ xQ16, yQ16, widthQ16, heightQ16 }) => ({
        xQ16,
        yQ16,
        widthQ16,
        heightQ16,
      })),
    ).toEqual([
      {
        xQ16: 65536,
        yQ16: 2 * 65536,
        widthQ16: 3 * 65536,
        heightQ16: 4 * 65536,
      },
      {
        xQ16: 7 * 65536,
        yQ16: 8 * 65536,
        widthQ16: 5 * 65536,
        heightQ16: 6 * 65536,
      },
    ]);
    expect(layerAndGroupIds(layers)).toEqual(new Set(["a", "b"]));
  });

  it("selects and toggles complete groups atomically, including hidden members", () => {
    const layers = [
      { ...layer("first", 0, 0, 2, 2), groupId: "group-a" },
      { ...layer("hidden", 2, 0, 2, 2), groupId: "group-a", visible: false },
      layer("solo", 4, 0, 2, 2),
    ];
    const grouped = updateGroupedLayerSelection({ ids: [] }, layers, "first");
    expect(grouped).toEqual({ ids: ["first", "hidden"], active: "first" });
    expect(updateGroupedLayerSelection(grouped, layers, "hidden", true)).toEqual({ ids: [] });
    const mixed = updateGroupedLayerSelection(grouped, layers, "solo", true);
    expect(mixed).toEqual({ ids: ["first", "hidden", "solo"], active: "solo" });
    expect(reconcileGroupedLayerSelection(mixed, layers)).toEqual(mixed);
    expect(
      reconcileGroupedLayerSelection(
        grouped,
        layers.map((entry) => ({ ...entry, visible: false })),
      ),
    ).toEqual({
      ids: [],
    });
  });

  it("restores the exact insertion selection through undo and redo", () => {
    const record = {
      before: { ids: ["source"], active: "source" },
      after: { ids: ["copy-a", "copy-b"], active: "copy-b" },
      insertedIds: ["copy-a", "copy-b"],
      present: false,
    };
    const redone = transitionInsertionSelection(record, [{ id: "source" }, { id: "copy-a" }, { id: "copy-b" }]);
    expect(redone).toEqual({
      record: { ...record, present: true },
      selection: record.after,
    });
    expect(transitionInsertionSelection(redone.record, [{ id: "source" }])).toEqual({
      record,
      selection: record.before,
    });
  });

  it("uses deterministic duplicate and paste offsets with safe clamp and in-place fallback", () => {
    const source = [layer("source", 90, 90, 10, 10)];
    expect(duplicateLayerOffsetQ16(source, { width: 100, height: 100 })).toEqual({
      xQ16: -8 * 65536,
      yQ16: -8 * 65536,
      inPlace: false,
    });
    expect(
      duplicateLayerOffsetQ16([layer("full", 0, 0, 100, 100)], {
        width: 100,
        height: 100,
      }),
    ).toEqual({
      xQ16: 0,
      yQ16: 0,
      inPlace: true,
    });
    expect(
      duplicateLayerOffsetQ16([layer("oversized", 10, 10, 120, 20)], {
        width: 100,
        height: 100,
      }),
    ).toEqual({
      xQ16: 0,
      yQ16: 0,
      inPlace: true,
    });
    const first = translateLayersIntoDocumentQ16([layer("paste", 1, 2, 10, 10)], { width: 100, height: 100 }, 8),
      second = translateLayersIntoDocumentQ16([layer("paste", 1, 2, 10, 10)], { width: 100, height: 100 }, 16);
    expect(first).toMatchObject({ xQ16: 8 * 65536, yQ16: 8 * 65536 });
    expect(second).toMatchObject({ xQ16: 16 * 65536, yQ16: 16 * 65536 });
  });

  it("reconciles hidden, deleted, reordered, and missing layers deterministically", () => {
    const selection = { ids: ["first", "second", "third"], active: "second" };
    expect(
      reconcileLayerSelection(selection, [
        { id: "third", visible: true },
        { id: "first", visible: true },
        { id: "second", visible: false },
      ]),
    ).toEqual({ ids: ["first", "third"], active: "third" });
    expect(reconcileLayerSelection(selection, [{ id: "first", visible: true }])).toEqual({
      ids: ["first"],
      active: "first",
    });
    expect(reconcileLayerSelection(selection, [])).toEqual({ ids: [] });
  });

  it("restores deletion selection and primary on undo, then reapplies fallback on redo", () => {
    const before = { ids: ["first", "third", "second"], active: "second" },
      after = { ids: ["remaining"], active: "remaining" },
      initial = { before, after, missing: false };
    const deleted = transitionDeletionSelection(initial, [{ id: "remaining" }]);
    expect(deleted).toEqual({
      record: { before, after, missing: true },
      selection: after,
    });
    const undone = transitionDeletionSelection(deleted.record, [
      { id: "first" },
      { id: "second" },
      { id: "third" },
      { id: "remaining" },
    ]);
    expect(undone).toEqual({ record: initial, selection: before });
    expect(transitionDeletionSelection(undone.record, [{ id: "remaining" }])).toEqual({
      record: { before, after, missing: true },
      selection: after,
    });
  });

  it("selects the topmost visible layer and recognizes resize handles", () => {
    const bottom = layer("bottom", 0, 0, 40, 40);
    const top = layer("top", 10, 10, 20, 20);
    expect(layerAtPoint([bottom, top], { x: 15, y: 15 })?.id).toBe("top");
    expect(layerAtPoint([bottom, { ...top, visible: false }], { x: 15, y: 15 })?.id).toBe("bottom");
    expect(isResizeHandle(top, { x: 30, y: 30 })).toBe(true);
    expect(isResizeHandle(top, { x: 20, y: 20 })).toBe(false);
    expect(
      RESIZE_HANDLES.map((handle) => [
        handle,
        resizeHandleAtPoint(
          top,
          {
            n: { x: 20, y: 10 },
            ne: { x: 30, y: 10 },
            e: { x: 30, y: 20 },
            se: { x: 30, y: 30 },
            s: { x: 20, y: 30 },
            sw: { x: 10, y: 30 },
            w: { x: 10, y: 20 },
            nw: { x: 10, y: 10 },
          }[handle],
          1,
        ),
      ]),
    ).toEqual(RESIZE_HANDLES.map((handle) => [handle, handle]));
  });

  it("hit-tests ellipse pixels instead of its transparent bounding-box corners", () => {
    const ellipse = {
      kind: "shape" as const,
      shape: "ellipse" as const,
      fill: "#00ff00",
      id: "ellipse",
      name: "Ellipse",
      visible: true,
      opacity: 65536,
      xQ16: 10 * 65536,
      yQ16: 10 * 65536,
      widthQ16: 20 * 65536,
      heightQ16: 20 * 65536,
    };
    expect(layerAtPoint([ellipse], { x: 10, y: 10 })).toBeUndefined();
    expect(layerAtPoint([ellipse], { x: 20, y: 20 })).toBe(ellipse);
  });

  it("hit-tests rounded rectangles through the shared pixel-center containment", () => {
    const rounded = {
      kind: "shape" as const,
      shape: "rectangle" as const,
      cornerRadiusQ16: 4 * 65536,
      fill: "#00ff00",
      id: "rounded",
      name: "Rounded rectangle",
      visible: true,
      opacity: 65536,
      xQ16: 10 * 65536,
      yQ16: 10 * 65536,
      widthQ16: 8 * 65536,
      heightQ16: 8 * 65536,
    };
    expect(layerAtPoint([rounded], { x: 10, y: 10 })).toBeUndefined();
    expect(layerAtPoint([rounded], { x: 14, y: 14 })).toBe(rounded);
  });

  it("uses rotated visual bounds for hit testing and resize handles", () => {
    const rotated = {
      ...layer("rotated", 10, 20, 12, 4),
      rotation: 90 as const,
    };
    expect(layerVisualBoundsQ16(rotated)).toEqual({
      x: 14 * 65536,
      y: 16 * 65536,
      width: 4 * 65536,
      height: 12 * 65536,
    });
    expect(layerAtPoint([rotated], { x: 15, y: 17 })).toBe(rotated);
    expect(layerAtPoint([rotated], { x: 11, y: 21 })).toBeUndefined();
    expect(isResizeHandle(rotated, { x: 18, y: 28 })).toBe(true);
  });

  it.each([0, 90, 180, 270] as const)(
    "lets lower layers through a cropped transparent image hole at %s degrees",
    (rotation) => {
      const top = {
          ...layer("top-alpha", 10, 10, 4, 4),
          width: 4,
          height: 4,
          crop: { x: 1, y: 1, width: 2, height: 2 },
          rotation,
        },
        lower = {
          kind: "shape" as const,
          shape: "rectangle" as const,
          fill: "#ffffff",
          id: "lower",
          name: "Lower",
          visible: true,
          opacity: 65536,
          xQ16: 8 * 65536,
          yQ16: 8 * 65536,
          widthQ16: 8 * 65536,
          heightQ16: 8 * 65536,
        },
        rgba = new Uint8Array(4 * 4 * 4).fill(255),
        image = {
          role: "top-background" as const,
          sourceSha256: "top-alpha",
          width: 4,
          height: 4,
          pixels: rgba,
          provenance: { source: "test", rightsToExport: true },
          normalizationPolicy: "rgba8-straight-top-left-v1" as const,
        };
      rgba[(1 * 4 + 2) * 4 + 3] = 0;
      const points = Array.from({ length: 64 }, (_, index) => ({
          x: (index % 8) + 8.5,
          y: Math.floor(index / 8) + 8.5,
        })),
        transparent = points.find((point) => {
          const source = imageSourcePixelAtQ16V1(
            top.crop,
            {
              x: top.xQ16,
              y: top.yQ16,
              width: top.widthQ16,
              height: top.heightQ16,
            },
            rotation,
            { x: point.x * 65536, y: point.y * 65536 },
          );
          return source?.x === 2 && source.y === 1;
        })!,
        opaque = points.find((point) => {
          const source = imageSourcePixelAtQ16V1(
            top.crop,
            {
              x: top.xQ16,
              y: top.yQ16,
              width: top.widthQ16,
              height: top.heightQ16,
            },
            rotation,
            { x: point.x * 65536, y: point.y * 65536 },
          );
          return source?.x === 1 && source.y === 1;
        })!;
      expect(transparent).toBeDefined();
      expect(opaque).toBeDefined();
      expect(layerAtPoint([lower, top], transparent, new Map([[image.sourceSha256, image]]))?.id).toBe("lower");
      expect(layerAtPoint([lower, top], opaque, new Map([[image.sourceSha256, image]]))?.id).toBe("top-alpha");
    },
  );

  it("snaps moves to grid, document edges and centers at zoom-normalized thresholds", () => {
    const subject = layer("subject", 3, 5, 10, 10);
    const at100 = snapLayerTransformQ16(
      subject,
      {
        xQ16: 1 * 65536,
        yQ16: 90 * 65536,
        widthQ16: 10 * 65536,
        heightQ16: 10 * 65536,
      },
      "move",
      [subject],
      { width: 256, height: 192 },
      { enabled: true, grid: 4, displayScale: 1 },
    );
    expect(at100.xQ16).toBe(0);
    expect(at100.yQ16).toBe(91 * 65536);
    expect(at100.guides).toEqual(
      expect.arrayContaining([
        { axis: "x", positionQ16: 0 },
        { axis: "y", positionQ16: 96 * 65536 },
      ]),
    );
    const at200 = snapLayerTransformQ16(
      subject,
      {
        xQ16: 3 * 65536,
        yQ16: 5 * 65536,
        widthQ16: 10 * 65536,
        heightQ16: 10 * 65536,
      },
      "move",
      [subject],
      { width: 256, height: 192 },
      { enabled: true, grid: 4, displayScale: 2, thresholdPx: 5 },
    );
    expect(at200.xQ16).toBe(4 * 65536);
  });

  it("snaps to visible layer bounds with stable equal-distance ambiguity", () => {
    const subject = layer("subject", 10, 10, 10, 10),
      target = layer("target", 24, 10, 10, 10),
      snapped = snapLayerTransformQ16(
        subject,
        {
          xQ16: 13 * 65536,
          yQ16: 10 * 65536,
          widthQ16: 10 * 65536,
          heightQ16: 10 * 65536,
        },
        "move",
        [subject, target],
        { width: 256, height: 192 },
        { enabled: true, grid: 8, displayScale: 1 },
      );
    expect(snapped.xQ16).toBe(14 * 65536);
    expect(snapped.guides).toContainEqual({
      axis: "x",
      positionQ16: 24 * 65536,
    });
    const ambiguous = snapLayerTransformQ16(
      subject,
      {
        xQ16: 13 * 65536,
        yQ16: 10 * 65536,
        widthQ16: 10 * 65536,
        heightQ16: 10 * 65536,
      },
      "move",
      [subject, layer("left-target", 2, 10, 10, 10), layer("right-target", 24, 10, 10, 10)],
      { width: 256, height: 192 },
      { enabled: true, grid: 8, displayScale: 1 },
    );
    expect(ambiguous.xQ16).toBe(12 * 65536);
    expect(ambiguous.guides.some(({ axis }) => axis === "x")).toBe(true);
  });

  it("ranks document and layer snaps before visible guides, and visible guides before grid at every zoom", () => {
    const moving = layer("moving", 1001, 5, 2, 2);
    for (const displayScale of [0.25, 1, 16]) {
      const guideOverGrid = snapSelectionTranslationQ16(
        [moving],
        { xQ16: 0, yQ16: 0 },
        [moving],
        { width: 5000, height: 192 },
        {
          enabled: true,
          grid: 8,
          displayScale,
          thresholdPx: 64,
          guides: [{ id: "guide-x", axis: "x", position: 1004 }],
        },
      );
      expect(guideOverGrid.xQ16).toBe(65536);
      expect(guideOverGrid.guides.find(({ axis }) => axis === "x")?.guideId).toBe("guide-x");

      const documentOverGuide = snapSelectionTranslationQ16(
        [layer("edge", 1, 5, 2, 2)],
        { xQ16: 0, yQ16: 0 },
        [],
        { width: 256, height: 192 },
        {
          enabled: true,
          grid: 8,
          displayScale,
          thresholdPx: 64,
          guides: [{ id: "same-distance", axis: "x", position: 4 }],
        },
      );
      expect(documentOverGuide.xQ16).toBe(-65536);
      expect(documentOverGuide.guides.find(({ axis }) => axis === "x")?.guideId).toBeUndefined();
    }
  });

  it("uses aggregate rotated bounds for group translation and excludes selected snap targets", () => {
    const first = { ...layer("first", 10, 10, 20, 10), rotation: 90 as const },
      second = layer("second", 30, 8, 8, 8),
      target = layer("target", 43, 8, 4, 8),
      aggregate = selectionVisualBoundsQ16([first, second])!;
    expect(aggregate).toEqual({
      x: 15 * 65536,
      y: 5 * 65536,
      width: 23 * 65536,
      height: 20 * 65536,
    });
    const snapped = snapSelectionTranslationQ16(
      [first, second],
      { xQ16: 4 * 65536, yQ16: 0 },
      [first, second, target],
      { width: 100, height: 100 },
      { enabled: true, grid: 8, displayScale: 1 },
    );
    expect(snapped.xQ16).toBe(5 * 65536);
    expect(snapped.guides).toContainEqual({
      axis: "x",
      positionQ16: 43 * 65536,
    });
    const translated = translateLayerPositionsQ16([first, second], snapped);
    expect(translated.map(({ xQ16 }) => xQ16)).toEqual([15 * 65536, 35 * 65536]);
    expect(translated[1]!.yQ16 - translated[0]!.yQ16).toBe(second.yQ16 - first.yQ16);
  });

  it("snaps rotated resize bounds while preserving their visual top-left", () => {
    const subject = {
        ...layer("subject", 10, 10, 20, 10),
        rotation: 90 as const,
      },
      raw = pointerTransformQ16(subject, { x: 25, y: 25 }, { x: 28, y: 28 }, "resize"),
      snapped = snapLayerTransformQ16(
        subject,
        raw,
        "resize",
        [subject],
        { width: 40, height: 40 },
        {
          enabled: true,
          grid: 4,
          displayScale: 1,
        },
      );
    expect(layerVisualBoundsQ16({ ...subject, ...snapped }).x).toBe(layerVisualBoundsQ16(subject).x);
    expect(layerVisualBoundsQ16({ ...subject, ...snapped }).y).toBe(layerVisualBoundsQ16(subject).y);
    expect(snapped.guides.length).toBeGreaterThan(0);
  });

  it.each([
    ["left", { xQ16: -5 * 65536, yQ16: 10 * 65536 }],
    ["horizontal-center", { xQ16: 40 * 65536, yQ16: 10 * 65536 }],
    ["right", { xQ16: 85 * 65536, yQ16: 10 * 65536 }],
    ["top", { xQ16: 10 * 65536, yQ16: 5 * 65536 }],
    ["vertical-center", { xQ16: 10 * 65536, yQ16: 45 * 65536 }],
    ["bottom", { xQ16: 10 * 65536, yQ16: 85 * 65536 }],
  ] as const)("aligns rotated visual bounds %s", (alignment, expected) => {
    const subject = {
      ...layer("subject", 10, 10, 20, 10),
      rotation: 90 as const,
    };
    expect(alignLayerToDocumentQ16(subject, { width: 100, height: 100 }, alignment)).toEqual(expected);
  });

  it.each(["left", "horizontal-center", "right", "top", "vertical-center", "bottom"] as const)(
    "aligns a mixed rotated selection %s to its aggregate bounds",
    (alignment) => {
      const layers = [{ ...layer("rotated", 10, 10, 20, 10), rotation: 90 as const }, layer("plain", 40, 30, 8, 6)],
        positions = alignLayerSelectionQ16(layers, alignment),
        aligned = layers.map((entry) => ({
          ...entry,
          ...positions.find(({ layerId }) => layerId === entry.id)!,
        })),
        bounds = aligned.map(layerVisualBoundsQ16),
        aggregate = selectionVisualBoundsQ16(layers)!;
      if (alignment === "left") expect(bounds.map(({ x }) => x)).toEqual([aggregate.x, aggregate.x]);
      if (alignment === "right")
        expect(bounds.map(({ x, width }) => x + width)).toEqual([
          aggregate.x + aggregate.width,
          aggregate.x + aggregate.width,
        ]);
      if (alignment === "top") expect(bounds.map(({ y }) => y)).toEqual([aggregate.y, aggregate.y]);
      if (alignment === "bottom")
        expect(bounds.map(({ y, height }) => y + height)).toEqual([
          aggregate.y + aggregate.height,
          aggregate.y + aggregate.height,
        ]);
      if (alignment === "horizontal-center")
        expect(new Set(bounds.map(({ x, width }) => x + Math.round(width / 2))).size).toBe(1);
      if (alignment === "vertical-center")
        expect(new Set(bounds.map(({ y, height }) => y + Math.round(height / 2))).size).toBe(1);
    },
  );

  it("aligns and distributes groups as rigid units", () => {
    const grouped = [
        { ...layer("a", 0, 0, 2, 2), groupId: "group" },
        { ...layer("b", 4, 1, 2, 2), groupId: "group" },
        layer("middle", 12, 0, 2, 2),
        layer("last", 24, 0, 2, 2),
      ],
      aligned = alignLayerSelectionQ16(grouped, "top"),
      a = aligned.find(({ layerId }) => layerId === "a")!,
      b = aligned.find(({ layerId }) => layerId === "b")!;
    expect(b.yQ16 - a.yQ16).toBe(grouped[1]!.yQ16 - grouped[0]!.yQ16);
    expect(layerSelectionUnitCount(grouped)).toBe(3);
    const distributed = distributeLayerSelectionQ16(grouped, "horizontal"),
      nextA = distributed.find(({ layerId }) => layerId === "a")!,
      nextB = distributed.find(({ layerId }) => layerId === "b")!;
    expect(nextB.xQ16 - nextA.xQ16).toBe(grouped[1]!.xQ16 - grouped[0]!.xQ16);
  });

  it("distributes equal horizontal and vertical Q16 gaps with deterministic odd remainders and ties", () => {
    const horizontal = [
        layer("z", 0, 0, 3, 2),
        layer("a", 0, 4, 2, 2),
        layer("middle", 5, 8, 2, 2),
        { ...layer("last", 13, 12, 3, 2), xQ16: 13 * 65536 + 1 },
      ],
      positions = distributeLayerSelectionQ16(horizontal, "horizontal");
    expect(positions.map(({ layerId, xQ16 }) => [layerId, xQ16])).toEqual([
      ["a", 0],
      ["z", 4 * 65536 + 1],
      ["middle", 9 * 65536 + 1],
      ["last", 13 * 65536 + 1],
    ]);
    const vertical = horizontal.map((entry, index) => ({
      ...entry,
      xQ16: index * 65536,
      yQ16: entry.xQ16,
      widthQ16: entry.heightQ16,
      heightQ16: entry.widthQ16,
    }));
    expect(distributeLayerSelectionQ16(vertical, "vertical").map(({ yQ16 }) => yQ16)).toEqual(
      positions.map(({ xQ16 }) => xQ16),
    );
  });

  it("does not distribute fewer than three, negative-gap, or already-equal layouts", () => {
    expect(distributeLayerSelectionQ16([layer("a", 0, 0, 2, 2), layer("b", 4, 0, 2, 2)], "horizontal")).toEqual([]);
    expect(
      distributeLayerSelectionQ16(
        [layer("a", 0, 0, 10, 2), layer("b", 4, 0, 10, 2), layer("c", 8, 0, 10, 2)],
        "horizontal",
      ),
    ).toEqual([]);
    expect(
      distributeLayerSelectionQ16(
        [layer("a", 0, 0, 2, 2), layer("b", 4, 0, 2, 2), layer("c", 8, 0, 2, 2)],
        "horizontal",
      ),
    ).toEqual([]);
  });

  it("hit-tests a text layout box even when its content is empty", () => {
    const empty = {
      kind: "text" as const,
      content: "",
      fill: "#ffffff",
      scale: 1,
      alignment: "left" as const,
      id: "empty-text",
      name: "Empty text",
      visible: true,
      opacity: 65536,
      xQ16: 2 * 65536,
      yQ16: 3 * 65536,
      widthQ16: 10 * 65536,
      heightQ16: 8 * 65536,
    };
    expect(layerAtPoint([empty], { x: 5, y: 5 })).toBe(empty);
    expect(layerAtPoint([empty], { x: 13, y: 5 })).toBeUndefined();
    expect(cropHandleAtPoint(empty, { x: 2, y: 3 })).toBeUndefined();
  });

  it("maps crop edge and corner drags to bounded source and destination geometry", () => {
    const image = {
      ...layer("image", 10, 20, 100, 50),
      width: 200,
      height: 100,
    };
    expect(cropHandleAtPoint(image, { x: 10, y: 20 })).toBe("nw");
    expect(pointerCrop(image, { x: 10, y: 20 }, { x: 30, y: 30 }, "nw")).toEqual({
      xQ16: 30 * 65536,
      yQ16: 30 * 65536,
      widthQ16: 80 * 65536,
      heightQ16: 40 * 65536,
      crop: { x: 20, y: 10, width: 80, height: 40 },
    });
    expect(pointerCrop(image, { x: 10, y: 20 }, { x: 1000, y: 1000 }, "nw").crop).toEqual({
      x: 99,
      y: 49,
      width: 1,
      height: 1,
    });
    expect(
      cropHandleAtPoint(
        {
          ...image,
          kind: "shape",
          shape: "rectangle",
          fill: "#ffffff",
        } as never,
        { x: 10, y: 20 },
      ),
    ).toBeUndefined();
  });

  it("maps rotated visual crop handles back to canonical image crop axes", () => {
    const image = {
      ...layer("rotated-crop", 10, 20, 100, 50),
      width: 200,
      height: 100,
      rotation: 90 as const,
    };
    const bounds = layerVisualBoundsQ16(image);
    expect(cropHandleAtPoint(image, { x: bounds.x / 65536, y: bounds.y / 65536 })).toBe("nw");
    const cropped = pointerCrop(image, { x: 35, y: -5 }, { x: 35, y: 5 }, "nw");
    expect(cropped.crop.x).toBeGreaterThan(0);
    expect(cropped.crop.y).toBe(0);
    expect(cropped.crop.x + cropped.crop.width).toBeLessThanOrEqual(image.width);
  });

  it.each(["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const)(
    "keeps one-pixel destination and bounded source geometry for extreme %s crop drags",
    (handle) => {
      const image = {
          ...layer("large-source", 0, 0, 10_000, 10_000),
          widthQ16: 65536,
          heightQ16: 65536,
        },
        horizontal = handle.includes("w") ? Number.MAX_VALUE : handle.includes("e") ? -Number.MAX_VALUE : 0,
        vertical = handle.includes("n") ? Number.MAX_VALUE : handle.includes("s") ? -Number.MAX_VALUE : 0,
        result = pointerCrop(image, { x: 0, y: 0 }, { x: horizontal, y: vertical }, handle);
      expect([
        result.xQ16,
        result.yQ16,
        result.widthQ16,
        result.heightQ16,
        result.crop.x,
        result.crop.y,
        result.crop.width,
        result.crop.height,
      ]).toSatisfy((values: number[]) => values.every(Number.isSafeInteger));
      expect(result.widthQ16).toBeGreaterThanOrEqual(65536);
      expect(result.heightQ16).toBeGreaterThanOrEqual(65536);
      expect(result.crop.width).toBeGreaterThan(0);
      expect(result.crop.height).toBeGreaterThan(0);
      expect(result.crop.x).toBeGreaterThanOrEqual(0);
      expect(result.crop.y).toBeGreaterThanOrEqual(0);
      expect(result.crop.x + result.crop.width).toBeLessThanOrEqual(image.width);
      expect(result.crop.y + result.crop.height).toBeLessThanOrEqual(image.height);
    },
  );

  it("resizes from the bottom-right with a one-pixel minimum", () => {
    const subject = layer("layer", 4, 6, 20, 10);
    expect(pointerTransformQ16(subject, { x: 24, y: 16 }, { x: 31, y: 20 }, "resize")).toEqual({
      xQ16: 4 * 65536,
      yQ16: 6 * 65536,
      widthQ16: 27 * 65536,
      heightQ16: 14 * 65536,
    });
    expect(pointerTransformQ16(subject, { x: 24, y: 16 }, { x: -20, y: -20 }, "resize")).toMatchObject({
      widthQ16: 65536,
      heightQ16: 65536,
    });
  });

  it.each([
    ["image", 0],
    ["image", 90],
    ["shape", 0],
    ["shape", 90],
    ["text", 0],
    ["text", 90],
  ] as const)("resizes every visual handle with opposite anchors preserved for %s at %s degrees", (kind, rotation) => {
    const base = layer("subject", 10, 20, 12, 8),
      subject = {
        ...base,
        rotation,
        ...(kind === "shape"
          ? {
              kind: "shape" as const,
              shape: "rectangle" as const,
              fill: "#ffffff",
            }
          : {}),
        ...(kind === "text"
          ? {
              kind: "text" as const,
              content: "A",
              fill: "#ffffff",
              scale: 1,
              alignment: "left" as const,
            }
          : {}),
      } as VisualLayerV3,
      before = layerVisualBoundsQ16(subject);
    for (const handle of RESIZE_HANDLES) {
      const result = pointerTransformQ16(subject, { x: 0, y: 0 }, { x: 2, y: 3 }, "resize", handle),
        after = layerVisualBoundsQ16({ ...subject, ...result });
      expect(result.widthQ16, `${kind} ${rotation} ${handle} width`).toBeGreaterThanOrEqual(65536);
      expect(result.heightQ16, `${kind} ${rotation} ${handle} height`).toBeGreaterThanOrEqual(65536);
      if (!handle.includes("w")) expect(after.x, `${handle} left anchor`).toBe(before.x);
      if (!handle.includes("e")) expect(after.x + after.width, `${handle} right anchor`).toBe(before.x + before.width);
      if (!handle.includes("n")) expect(after.y, `${handle} top anchor`).toBe(before.y);
      if (!handle.includes("s"))
        expect(after.y + after.height, `${handle} bottom anchor`).toBe(before.y + before.height);
    }
  });

  it.each(RESIZE_HANDLES)("keeps %s resize geometry canonical under extreme drags", (handle) => {
    const subject = {
        ...layer("extreme", 10, 20, 12, 8),
        rotation: 270 as const,
      },
      result = pointerTransformQ16(
        subject,
        { x: 0, y: 0 },
        {
          x: handle.includes("w") ? Number.MAX_VALUE : handle.includes("e") ? -Number.MAX_VALUE : 0,
          y: handle.includes("n") ? Number.MAX_VALUE : handle.includes("s") ? -Number.MAX_VALUE : 0,
        },
        "resize",
        handle,
      );
    expect(Object.values(result).every(Number.isSafeInteger)).toBe(true);
    expect(result.widthQ16).toBeGreaterThanOrEqual(65536);
    expect(result.heightQ16).toBeGreaterThanOrEqual(65536);
    expect(Number.isSafeInteger(result.xQ16 + result.widthQ16)).toBe(true);
    expect(Number.isSafeInteger(result.yQ16 + result.heightQ16)).toBe(true);
  });

  it.each(RESIZE_HANDLES)("snaps the active axes and emits minimal guides for %s resize", (handle) => {
    const subject = {
        ...layer("snap-handle", 10, 10, 10, 10),
        rotation: 90 as const,
      },
      raw = pointerTransformQ16(subject, { x: 0, y: 0 }, { x: 1, y: 1 }, "resize", handle),
      snapped = snapLayerTransformQ16(
        subject,
        raw,
        "resize",
        [subject],
        { width: 32, height: 32 },
        { enabled: true, grid: 4, displayScale: 1 },
        handle,
      );
    expect(snapped.widthQ16).toBeGreaterThanOrEqual(65536);
    expect(snapped.heightQ16).toBeGreaterThanOrEqual(65536);
    expect(new Set(snapped.guides.map(({ axis }) => axis))).toEqual(
      new Set([
        ...(handle.includes("w") || handle.includes("e") ? ["x"] : []),
        ...(handle.includes("n") || handle.includes("s") ? ["y"] : []),
      ]),
    );
  });

  it.each(RESIZE_HANDLES)("rejects a %s snap that would cross the opposite edge", (handle) => {
    const subject = {
        ...layer("subject", 10, 10, 10, 10),
        kind: "shape" as const,
        shape: "rectangle" as const,
        fill: "#ffffff",
      },
      before = layerVisualBoundsQ16(subject),
      target = layer(
        "target",
        handle.includes("w") ? 20 : handle.includes("e") ? 6 : 0,
        handle.includes("n") ? 20 : handle.includes("s") ? 6 : 0,
        4,
        4,
      ),
      raw = pointerTransformQ16(
        subject,
        { x: 0, y: 0 },
        {
          x: handle.includes("w") ? 100 : handle.includes("e") ? -100 : 0,
          y: handle.includes("n") ? 100 : handle.includes("s") ? -100 : 0,
        },
        "resize",
        handle,
      ),
      snapped = snapLayerTransformQ16(
        subject,
        raw,
        "resize",
        [subject, target],
        { width: 256, height: 192 },
        { enabled: true, grid: 1, displayScale: 1 },
        handle,
      ),
      after = layerVisualBoundsQ16({ ...subject, ...snapped });

    expect(after.width).toBeGreaterThanOrEqual(65536);
    expect(after.height).toBeGreaterThanOrEqual(65536);
    if (!handle.includes("w")) expect(after.x).toBe(before.x);
    if (!handle.includes("e")) expect(after.x + after.width).toBe(before.x + before.width);
    if (!handle.includes("n")) expect(after.y).toBe(before.y);
    if (!handle.includes("s")) expect(after.y + after.height).toBe(before.y + before.height);
  });

  it.each([
    ["zero", 0, 0],
    ["sub-pixel", 0.25, 0],
    ["crossed", -10, 0],
    ["zero rotated", 0, 90],
    ["sub-pixel rotated", 0.25, 90],
    ["crossed rotated", -10, 90],
  ] as const)("keeps a %s rounded resize above the compositor minimum", (_case, offset, rotation) => {
    const subject = {
        ...layer("rounded", 10, 10, 12, 8),
        kind: "shape" as const,
        shape: "rectangle" as const,
        cornerRadiusQ16: 4 * 65536,
        fill: "#ffffff",
        rotation,
      },
      before = layerVisualBoundsQ16(subject),
      top = before.y / 65536,
      bottom = (before.y + before.height) / 65536,
      target = layer("target", 0, top - 4, 4, 4),
      raw = pointerTransformQ16(subject, { x: 0, y: bottom }, { x: 0, y: top + offset }, "resize", "s"),
      snapped = snapLayerTransformQ16(
        subject,
        raw,
        "resize",
        [subject, target],
        { width: 256, height: 192 },
        { enabled: true, grid: 1, displayScale: 1 },
        "s",
      ),
      snappedBounds = layerVisualBoundsQ16({ ...subject, ...snapped }),
      cornerRadiusQ16 = Math.min(
        subject.cornerRadiusQ16,
        Math.floor(Math.min(snapped.widthQ16, snapped.heightQ16) / 2),
      );

    expect(layerVisualBoundsQ16({ ...subject, ...raw }).height).toBe(65536);
    expect(snappedBounds.height).toBeGreaterThanOrEqual(65536);
    expect(snappedBounds.y).toBe(before.y);
    expect(snapped.guides).not.toContainEqual({ axis: "y", positionQ16: before.y });
    expect(() =>
      compositeCustomLayersV1(
        256,
        192,
        [
          {
            kind: "shape",
            id: subject.id,
            order: 0,
            shape: subject.shape,
            cornerRadiusQ16,
            fill: subject.fill,
            opacity: subject.opacity,
            rotation: subject.rotation,
            destinationQ16: {
              x: snapped.xQ16,
              y: snapped.yQ16,
              width: snapped.widthQ16,
              height: snapped.heightQ16,
            },
          },
        ],
        [],
      ),
    ).not.toThrow();
  });

  it("fits imported images inside the 256 by 192 artboard without scaling small images up", () => {
    expect(fitImageToArtboard(512, 192)).toEqual({ width: 256, height: 96 });
    expect(fitImageToArtboard(32, 24)).toEqual({ width: 32, height: 24 });
    expect(fitImageToArtboard(256, 128, { width: 64, height: 64 })).toEqual({
      width: 64,
      height: 32,
    });
  });

  it("paints the selected role document at its contract dimensions", () => {
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: "",
      globalAlpha: 1,
      imageSmoothingEnabled: true,
      strokeStyle: "",
      lineWidth: 0,
      drawImage: vi.fn(),
      ellipse: vi.fn(),
      fill: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
    };

    paintWorkspaceSurface(context, undefined, false, undefined, undefined, new Map(), undefined, {
      width: 8,
      height: 42,
    });

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 8, 42);
  });

  it("uses identical pixel-center ellipse edges in preview and export", () => {
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: "",
      globalAlpha: 1,
      imageSmoothingEnabled: true,
      strokeStyle: "",
      lineWidth: 0,
      drawImage: vi.fn(),
      ellipse: vi.fn(),
      fill: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
    };
    paintWorkspaceSurface(
      context,
      undefined,
      false,
      {
        screen: "top",
        width: 4,
        height: 4,
        layers: [
          {
            kind: "shape",
            id: "ellipse",
            order: 0,
            shape: "ellipse",
            fill: "#00ff00",
            opacity: 65536,
            destinationQ16: { x: 0, y: 0, width: 4 * 65536, height: 4 * 65536 },
          },
        ],
      },
      undefined,
      new Map(),
      undefined,
      { width: 4, height: 4 },
    );
    const previewPixels = context.fillRect.mock.calls.map(([x, y]) => y * 4 + x),
      exported = compositeCustomLayersV1(
        4,
        4,
        [
          {
            kind: "shape",
            id: "ellipse",
            order: 0,
            shape: "ellipse",
            fill: "#00ff00",
            opacity: 65536,
            destinationQ16: { x: 0, y: 0, width: 4 * 65536, height: 4 * 65536 },
          },
        ],
        [],
      ),
      exportedPixels = Array.from({ length: 16 }, (_, pixel) => pixel).filter((pixel) => exported[pixel * 4 + 3]);
    expect(previewPixels).toEqual(exportedPixels);
  });

  it("uses identical rounded rectangle edges in preview and export", () => {
    const context = {
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        fillStyle: "",
        globalAlpha: 1,
        imageSmoothingEnabled: true,
        strokeStyle: "",
        lineWidth: 0,
        drawImage: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        strokeRect: vi.fn(),
      },
      layer = {
        kind: "shape" as const,
        id: "rounded",
        order: 0,
        shape: "rectangle" as const,
        cornerRadiusQ16: 2 * 65536,
        fill: "#00ff00",
        opacity: 65536,
        destinationQ16: { x: 0, y: 0, width: 4 * 65536, height: 4 * 65536 },
      };
    paintWorkspaceSurface(
      context,
      undefined,
      false,
      { screen: "top", width: 4, height: 4, layers: [layer] },
      undefined,
      new Map(),
      undefined,
      { width: 4, height: 4 },
    );
    const previewPixels = context.fillRect.mock.calls.map(([x, y]) => y * 4 + x),
      exported = compositeCustomLayersV1(4, 4, [layer], []),
      exportedPixels = Array.from({ length: 16 }, (_, pixel) => pixel).filter((pixel) => exported[pixel * 4 + 3]);
    expect(previewPixels).toEqual(exportedPixels);
  });

  it("uses identical glyph pixels in preview and export", () => {
    const context = {
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        fillStyle: "",
        globalAlpha: 1,
        imageSmoothingEnabled: true,
        strokeStyle: "",
        lineWidth: 0,
        drawImage: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        strokeRect: vi.fn(),
      },
      layer = {
        kind: "text" as const,
        id: "caption",
        order: 0,
        content: "A\n😀",
        fill: "#abcdef",
        scale: 1,
        alignment: "center" as const,
        opacity: 32768,
        destinationQ16: { x: 0, y: 0, width: 12 * 65536, height: 16 * 65536 },
      };
    paintWorkspaceSurface(
      context,
      undefined,
      false,
      { screen: "top", width: 12, height: 16, layers: [layer] },
      undefined,
      new Map(),
      undefined,
      { width: 12, height: 16 },
    );
    const previewPixels = context.fillRect.mock.calls.map(([x, y]) => y * 12 + x),
      exported = compositeCustomLayersV1(12, 16, [layer], []),
      exportedPixels = Array.from({ length: 12 * 16 }, (_, pixel) => pixel).filter((pixel) => exported[pixel * 4 + 3]);
    expect(previewPixels).toEqual(exportedPixels);
    expect(new Set(exportedPixels).size).toBeGreaterThan(10);
  });

  it("previews an assigned asset only until the document has authored layers", () => {
    const assigned = { sourceSha256: "assigned", width: 256, height: 192 };
    const fallback = visualDocumentSurface({ width: 64, height: 64, layers: [] }, assigned);
    const authored = visualDocumentSurface(
      { width: 64, height: 64, layers: [layer("authored", 0, 0, 16, 16)] },
      assigned,
    );

    expect(fallback.layers).toMatchObject([{ id: "assigned-role-fallback", asset: { sha256: "assigned" } }]);
    expect(authored.layers).toMatchObject([{ id: "authored", asset: { sha256: "authored" } }]);
  });

  it("applies a local fill override without mutating the authoritative layer", () => {
    const shape = {
        kind: "shape" as const,
        shape: "rectangle" as const,
        cornerRadiusQ16: 2 * 65536,
        fill: "#111111",
        id: "shape",
        name: "Shape",
        visible: true,
        opacity: 65536,
        xQ16: 0,
        yQ16: 0,
        widthQ16: 4 * 65536,
        heightQ16: 4 * 65536,
      },
      preview = visualDocumentSurface(
        { width: 4, height: 4, layers: [shape] },
        undefined,
        "top",
        new Map([[shape.id, "#abcdef"]]),
        new Map([[shape.id, 32768]]),
      );

    expect(preview.layers[0]).toMatchObject({
      id: shape.id,
      fill: "#abcdef",
      cornerRadiusQ16: 2 * 65536,
      opacity: 32768,
    });
    expect(shape.fill).toBe("#111111");
    expect(shape.opacity).toBe(65536);
  });

  it("keeps group-only and lock-only metadata out of the render surface", () => {
    const plain = [layer("a", 0, 0, 4, 4), layer("b", 4, 0, 4, 4)],
      metadataOnly = plain.map((entry) => ({
        ...entry,
        groupId: "group-render",
        locked: true,
      }));
    expect(visualDocumentSurface({ width: 8, height: 4, layers: metadataOnly })).toEqual(
      visualDocumentSurface({ width: 8, height: 4, layers: plain }),
    );
  });

  it("selects PNG files from drop files or clipboard items", () => {
    const text = new File(["text"], "notes.txt", { type: "text/plain" });
    const dropped = new File(["png"], "drop.PNG", { type: "" });
    const pasted = new File(["png"], "paste.png", { type: "image/png" });

    expect(firstPngFile([text, dropped])).toBe(dropped);
    expect(firstPngFile([text], [{ type: "image/png", getAsFile: () => pasted }])).toBe(pasted);
    expect(firstPngFile([text], [{ type: "text/plain", getAsFile: () => text }])).toBeUndefined();
  });

  it("captures an immutable reference-only layer clipboard snapshot", () => {
    const original = layer("clipboard", 1, 2, 3, 4),
      snapshot = freezeLayerClipboardSnapshot("project", [original]);
    original.xQ16 = 99;
    original.asset.path = "changed";
    expect(snapshot).toMatchObject({
      projectId: "project",
      layers: [
        {
          id: "clipboard",
          xQ16: 65536,
          asset: { path: "clipboard", sha256: "clipboard" },
        },
      ],
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.layers)).toBe(true);
    expect(Object.isFrozen(snapshot.layers[0])).toBe(true);
    expect(snapshot.layers[0]).not.toHaveProperty("bytes");
    expect((snapshot.layers[0] as { asset: object }).asset).not.toHaveProperty("bytes");
  });

  it("rejects clipboard image references after source media becomes unreachable", () => {
    const image = layer("clipboard-media", 0, 0, 1, 1);
    expect(clipboardMediaIsReachable([image], new Set(["clipboard-media"]))).toBe(true);
    expect(clipboardMediaIsReachable([image], new Set())).toBe(false);
    expect(
      clipboardMediaIsReachable(
        [
          {
            ...image,
            kind: "shape",
            shape: "rectangle",
            fill: "#000000",
          } as VisualLayerV3,
        ],
        new Set(),
      ),
    ).toBe(true);
  });

  it("restores focus to the next layer, previous layer, then Add", () => {
    expect(focusAfterLayerRemoval(["a", "b", "c"], "b")).toBe("c");
    expect(focusAfterLayerRemoval(["a", "b"], "b")).toBe("a");
    expect(focusAfterLayerRemoval(["a"], "a")).toBeUndefined();
  });
});
