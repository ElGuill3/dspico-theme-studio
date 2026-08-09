import { describe, expect, it } from "vitest";
import {
  applyOperationV3,
  collectMediaReferencesV3,
  createMediaRefV3,
  createImageLayerV3,
  createDocumentGuideV3,
  createProjectV3,
  createShapeLayerV3,
  createTextLayerV3,
  currentProjectV3,
  openProjectV3,
  saveProjectV3,
  V3_VISUAL_ROLES,
  MAX_BATCH_LAYER_EDITS_V3,
  MAX_DOCUMENT_GUIDES_V3,
  type LayerV2,
  type OperationV3,
} from "./index.js";

const metadata = {
  name: "Shapes",
  description: "Shape history",
  author: "Ada",
};
const shape = () =>
  createShapeLayerV3({
    id: "shape",
    name: "Rectangle",
    shape: "rectangle",
    fill: "#12abef",
    visible: true,
    opacity: 32768,
    xQ16: 65536,
    yQ16: 131072,
    widthQ16: 10 * 65536,
    heightQ16: 12 * 65536,
  });
const text = () =>
  createTextLayerV3({
    id: "text",
    name: "Caption",
    content: "Hello\n😀",
    fill: "#abcdef",
    scale: 2,
    alignment: "center",
    visible: true,
    opacity: 32768,
    xQ16: 65536,
    yQ16: 131072,
    widthQ16: 40 * 65536,
    heightQ16: 32 * 65536,
  });
const operationEnvelopes = (): OperationV3[] => {
  const media = createMediaRefV3(Uint8Array.of(1), "image/png"),
    asset = {
      id: "media",
      media,
      provenance: { source: "test" },
      rightsToExport: true,
    },
    image: LayerV2 = {
      kind: "image",
      id: "image",
      name: "Image",
      visible: true,
      opacity: 65536,
      asset: { path: media.path, sha256: media.sha256 },
      xQ16: 0,
      yQ16: 0,
      width: 1,
      height: 1,
      widthQ16: 65536,
      heightQ16: 65536,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    },
    addImage = {
      version: 2,
      type: "add-layer",
      screen: "top",
      layer: image,
    } as const;
  return [
    { version: 3, type: "set-metadata", field: "name", value: "Name" },
    { version: 3, type: "add-media", asset },
    { version: 3, type: "import-layer", asset, composition: {} },
    {
      version: 3,
      type: "assign-role",
      role: "scrim",
      mediaSha256: media.sha256,
    },
    { version: 3, type: "confirm-role", role: "scrim" },
    {
      version: 3,
      type: "set-component-evidence",
      component: "visual",
      receipt: {},
    },
    { version: 3, type: "set-legacy-composition", composition: {} },
    {
      version: 3,
      type: "edit-visual-document",
      role: "scrim",
      operation: { version: 3, type: "add-text-layer", layer: text() },
    },
    {
      version: 3,
      type: "import-visual-layer",
      role: "scrim",
      operation: addImage,
      asset,
    },
    { version: 3, type: "acknowledge", fingerprint: "fingerprint" },
  ];
};

describe("V3 visual layers", () => {
  it("persists bounded document guides as one undoable metadata operation", () => {
    const initial = createProjectV3({
        projectId: "guides",
        metadata,
        themeKind: "custom",
      }),
      guided = applyOperationV3(initial, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "set-guides",
          guides: [
            { id: "guide-x", axis: "x", position: 0 },
            { id: "guide-y", axis: "y", position: 32 },
          ],
        },
      });

    expect(guided.project.visualDocuments?.scrim?.guides).toEqual([
      { id: "guide-x", axis: "x", position: 0 },
      { id: "guide-y", axis: "y", position: 32 },
    ]);
    expect(currentProjectV3({ ...guided, cursor: 0 }).visualDocuments?.scrim).toBeUndefined();
    expect(openProjectV3(saveProjectV3(guided)).project.visualDocuments?.scrim?.guides).toEqual(
      guided.project.visualDocuments?.scrim?.guides,
    );
  });

  it("constructs only canonical bounded document guides", () => {
    expect(createDocumentGuideV3({ id: "guide", axis: "x", position: 256 }, { width: 256, height: 192 })).toEqual({
      id: "guide",
      axis: "x",
      position: 256,
    });
    for (const guide of [
      { id: "bad id", axis: "x", position: 1 },
      { id: "guide", axis: "z", position: 1 },
      { id: "guide", axis: "y", position: 193 },
      { id: "guide", axis: "x", position: Number.NaN },
    ])
      expect(() => createDocumentGuideV3(guide as never, { width: 256, height: 192 })).toThrow("not canonical");
  });

  it("defaults old documents to no guides and rejects malformed guide state at every history boundary", () => {
    const initial = createProjectV3({
      projectId: "guide-validation",
      metadata,
      themeKind: "custom",
    });
    for (const guides of [
      [{ id: "bad id", axis: "x", position: 1 }],
      [
        { id: "duplicate", axis: "x", position: 1 },
        { id: "duplicate", axis: "y", position: 1 },
      ],
      [{ id: "outside-x", axis: "x", position: 257 }],
      [{ id: "outside-y", axis: "y", position: 193 }],
      [{ id: "fraction", axis: "x", position: 1.5 }],
      Array.from({ length: MAX_DOCUMENT_GUIDES_V3 + 1 }, (_, index) => ({
        id: `guide-${index}`,
        axis: "x",
        position: 0,
      })),
    ])
      expect(() =>
        applyOperationV3(initial, {
          version: 3,
          type: "edit-visual-document",
          role: "top-background",
          operation: { version: 3, type: "set-guides", guides } as never,
        }),
      ).toThrow();

    const legacy = JSON.parse(saveProjectV3(initial));
    legacy.initial.visualDocuments = {
      "top-background": {
        role: "top-background",
        width: 256,
        height: 192,
        layers: [],
      },
    };
    const reopened = openProjectV3(JSON.stringify(legacy));
    expect(reopened.project.visualDocuments?.["top-background"]?.guides).toEqual([]);
  });
  it("constructs only canonical shape layers", () => {
    expect(shape()).toMatchObject({
      kind: "shape",
      shape: "rectangle",
      fill: "#12abef",
    });
    for (const patch of [
      { fill: "#ABCDEF" },
      { fill: "red" },
      { shape: "path" },
      { opacity: 65537 },
      { widthQ16: 0 },
      { xQ16: Number.NaN },
    ])
      expect(() => createShapeLayerV3({ ...shape(), ...patch } as never)).toThrow("not canonical");
  });

  it("stores a shape edit as one durable undoable operation", () => {
    const initial = createProjectV3({
        projectId: "shape-history",
        metadata,
        themeKind: "custom",
      }),
      added = applyOperationV3(initial, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: { version: 3, type: "add-shape-layer", layer: shape() },
      }),
      edited = applyOperationV3(added, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 2,
          type: "set-layer-properties",
          screen: "top",
          layerId: "shape",
          xQ16: 2 * 65536,
          yQ16: 3 * 65536,
          widthQ16: 7 * 65536,
          heightQ16: 8 * 65536,
          opacity: 65536,
          crop: { x: 0, y: 0, width: 1, height: 1 },
        },
      });

    expect(edited.operations).toHaveLength(2);
    expect(currentProjectV3({ ...edited, cursor: 1 }).visualDocuments?.scrim?.layers[0]).toMatchObject({
      xQ16: 65536,
      widthQ16: 10 * 65536,
    });
    expect(openProjectV3(saveProjectV3(edited)).project.visualDocuments?.scrim?.layers[0]).toMatchObject({
      kind: "shape",
      xQ16: 2 * 65536,
      widthQ16: 7 * 65536,
      fill: "#12abef",
    });
  });

  it("moves and removes multiple layers in one strictly validated history operation", () => {
    const initial = createProjectV3({
        projectId: "batch-history",
        metadata,
        themeKind: "custom",
      }),
      first = applyOperationV3(initial, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: { version: 3, type: "add-shape-layer", layer: shape() },
      }),
      added = applyOperationV3(first, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: { version: 3, type: "add-text-layer", layer: text() },
      }),
      moved = applyOperationV3(added, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "set-layer-positions",
          positions: [
            { layerId: "shape", xQ16: 10, yQ16: 20 },
            { layerId: "text", xQ16: 30, yQ16: 40 },
          ],
        },
      });
    expect(moved.operations).toHaveLength(3);
    expect(moved.project.visualDocuments?.scrim?.layers).toMatchObject([
      { id: "shape", xQ16: 10, yQ16: 20 },
      { id: "text", xQ16: 30, yQ16: 40 },
    ]);
    expect(currentProjectV3({ ...moved, cursor: 2 }).visualDocuments?.scrim?.layers).toMatchObject([
      { id: "shape", xQ16: 65536 },
      { id: "text", xQ16: 65536 },
    ]);
    const removed = applyOperationV3(moved, {
      version: 3,
      type: "edit-visual-document",
      role: "scrim",
      operation: {
        version: 3,
        type: "remove-layers",
        layerIds: ["shape", "text"],
      },
    });
    expect(removed.operations).toHaveLength(4);
    expect(removed.project.visualDocuments?.scrim?.layers).toEqual([]);
    expect(openProjectV3(saveProjectV3(removed)).project.visualDocuments?.scrim?.layers).toEqual([]);
  });

  it("groups, regroups, ungroups, persists, and undoes without moving pixels", () => {
    let state = createProjectV3({
      projectId: "groups",
      metadata,
      themeKind: "custom",
    });
    for (const layer of [shape(), text()])
      state = applyOperationV3(state, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation:
          layer.kind === "shape"
            ? { version: 3, type: "add-shape-layer", layer }
            : { version: 3, type: "add-text-layer", layer },
      });
    const grouped = applyOperationV3(state, {
      version: 3,
      type: "edit-visual-document",
      role: "scrim",
      operation: {
        version: 3,
        type: "set-layer-groups",
        memberships: [
          { layerId: "shape", groupId: "group-first" },
          { layerId: "text", groupId: "group-first" },
        ],
      },
    });
    expect(grouped.project.visualDocuments?.scrim?.layers).toMatchObject([
      { id: "shape", groupId: "group-first", xQ16: 65536 },
      { id: "text", groupId: "group-first", xQ16: 65536 },
    ]);
    expect(() =>
      applyOperationV3(grouped, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "set-layer-positions",
          positions: [{ layerId: "shape", xQ16: 0, yQ16: 0 }],
        },
      }),
    ).toThrow("Grouped layer operation is incomplete");
    expect(currentProjectV3({ ...grouped, cursor: grouped.cursor - 1 }).visualDocuments?.scrim?.layers).toEqual(
      state.project.visualDocuments?.scrim?.layers,
    );
    const regrouped = applyOperationV3(grouped, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "set-layer-groups",
          memberships: [
            { layerId: "shape", groupId: "group-second" },
            { layerId: "text", groupId: "group-second" },
          ],
        },
      }),
      ungrouped = applyOperationV3(regrouped, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "set-layer-groups",
          memberships: [{ layerId: "shape" }, { layerId: "text" }],
        },
      });
    expect(openProjectV3(saveProjectV3(regrouped)).project.visualDocuments?.scrim?.layers).toMatchObject([
      { groupId: "group-second" },
      { groupId: "group-second" },
    ]);
    expect(openProjectV3(saveProjectV3(ungrouped)).project.visualDocuments?.scrim?.layers).toEqual(
      state.project.visualDocuments?.scrim?.layers,
    );
  });

  it("inserts fresh ordered copies atomically and reorders a complete group as one operation", () => {
    let state = createProjectV3({
      projectId: "insert",
      metadata,
      themeKind: "custom",
    });
    for (const layer of [shape(), text()])
      state = applyOperationV3(state, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation:
          layer.kind === "shape"
            ? { version: 3, type: "add-shape-layer", layer }
            : { version: 3, type: "add-text-layer", layer },
      });
    const inserted = applyOperationV3(state, {
      version: 3,
      type: "edit-visual-document",
      role: "scrim",
      operation: {
        version: 3,
        type: "insert-layers",
        toIndex: 1,
        layers: [
          {
            ...shape(),
            id: "copy-shape",
            groupId: "copy-group",
            xQ16: 9 * 65536,
          },
          {
            ...text(),
            id: "copy-text",
            groupId: "copy-group",
            xQ16: 9 * 65536,
          },
        ],
      },
    });
    expect(inserted.operations).toHaveLength(state.operations.length + 1);
    expect(inserted.project.visualDocuments?.scrim?.layers.map(({ id }) => id)).toEqual([
      "shape",
      "copy-shape",
      "copy-text",
      "text",
    ]);
    const reordered = applyOperationV3(inserted, {
      version: 3,
      type: "edit-visual-document",
      role: "scrim",
      operation: {
        version: 3,
        type: "reorder-layers",
        layerIds: ["copy-shape", "copy-text"],
        toIndex: 2,
      },
    });
    expect(reordered.project.visualDocuments?.scrim?.layers.map(({ id }) => id)).toEqual([
      "shape",
      "text",
      "copy-shape",
      "copy-text",
    ]);
  });

  it("rejects direct reorder operations that split a destination group", () => {
    let state = createProjectV3({
      projectId: "split-reorder",
      metadata,
      themeKind: "custom",
    });
    for (const id of ["a", "b", "c", "d"])
      state = applyOperationV3(state, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "add-shape-layer",
          layer: { ...shape(), id },
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
          { layerId: "b", groupId: "destination" },
          { layerId: "c", groupId: "destination" },
        ],
      },
    });
    expect(() =>
      applyOperationV3(state, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "reorder-layers",
          layerIds: ["a"],
          toIndex: 1,
        },
      }),
    ).toThrow("Layer reorder splits a group");
    expect(() =>
      applyOperationV3(state, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 2,
          type: "reorder-layer",
          screen: "top",
          layerId: "a",
          toIndex: 1,
        },
      }),
    ).toThrow("Layer reorder splits a group");
  });

  it("rotates every grouped member by one quarter turn in one operation without moving centers", () => {
    let state = createProjectV3({
      projectId: "group-rotation",
      metadata,
      themeKind: "custom",
    });
    for (const layer of [shape(), { ...text(), rotation: 180 as const }])
      state = applyOperationV3(state, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation:
          layer.kind === "shape"
            ? { version: 3, type: "add-shape-layer", layer }
            : { version: 3, type: "add-text-layer", layer },
      });
    state = applyOperationV3(state, {
      version: 3,
      type: "edit-visual-document",
      role: "scrim",
      operation: {
        version: 3,
        type: "set-layer-groups",
        memberships: [
          { layerId: "shape", groupId: "rotation-group" },
          { layerId: "text", groupId: "rotation-group" },
        ],
      },
    });
    const before = state.project.visualDocuments!.scrim!.layers.map(({ xQ16, yQ16, widthQ16, heightQ16 }) => ({
        centerX: xQ16 + widthQ16 / 2,
        centerY: yQ16 + heightQ16 / 2,
        xQ16,
        yQ16,
      })),
      rotated = applyOperationV3(state, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "set-layer-rotations",
          rotations: [
            { layerId: "shape", rotation: 90 },
            { layerId: "text", rotation: 270 },
          ],
        },
      });
    expect(rotated.operations).toHaveLength(state.operations.length + 1);
    expect(rotated.project.visualDocuments!.scrim!.layers.map(({ rotation }) => rotation)).toEqual([90, 270]);
    expect(
      rotated.project.visualDocuments!.scrim!.layers.map(({ xQ16, yQ16, widthQ16, heightQ16 }) => ({
        centerX: xQ16 + widthQ16 / 2,
        centerY: yQ16 + heightQ16 / 2,
        xQ16,
        yQ16,
      })),
    ).toEqual(before);
  });

  it("accepts pasted image references only when the current project owns the media", () => {
    const media = createMediaRefV3(Uint8Array.of(7), "image/png"),
      asset = {
        id: "owned-media",
        media,
        provenance: { source: "test" },
        rightsToExport: true,
      },
      image: LayerV2 = {
        id: "pasted-image",
        name: "Pasted image",
        visible: true,
        opacity: 65536,
        asset: { path: media.path, sha256: media.sha256 },
        xQ16: 0,
        yQ16: 0,
        width: 1,
        height: 1,
        widthQ16: 65536,
        heightQ16: 65536,
        crop: { x: 0, y: 0, width: 1, height: 1 },
      },
      empty = createProjectV3({
        projectId: "media-ownership",
        metadata,
        themeKind: "custom",
      }),
      operation: OperationV3 = {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "insert-layers",
          toIndex: 0,
          layers: [image],
        },
      };
    expect(() => applyOperationV3(empty, operation)).toThrow("Unknown layer media");
    const owned = applyOperationV3(empty, {
      version: 3,
      type: "add-media",
      asset,
    });
    expect(applyOperationV3(owned, operation).project.visualDocuments?.scrim?.layers[0]).toMatchObject({
      id: "pasted-image",
      asset: image.asset,
    });
  });

  it.each([
    {
      version: 3,
      type: "set-layer-groups",
      memberships: [{ layerId: "shape", groupId: "bad group" }],
    },
    {
      version: 3,
      type: "set-layer-groups",
      memberships: [{ layerId: "shape", groupId: "g", extra: true }],
    },
    {
      version: 3,
      type: "insert-layers",
      toIndex: 0,
      layers: [{ ...shape(), id: "bad id" }],
    },
    {
      version: 3,
      type: "insert-layers",
      toIndex: 0,
      layers: [{ ...shape() }, { ...shape() }],
    },
    {
      version: 3,
      type: "set-layer-rotations",
      rotations: [{ layerId: "shape", rotation: 45 }],
    },
  ] as const)("rejects malformed group and insertion operation %#", (operation) => {
    const state = createProjectV3({
      projectId: "bad-groups",
      metadata,
      themeKind: "custom",
    });
    expect(() =>
      applyOperationV3(state, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation,
      } as never),
    ).toThrow("Invalid V3 operation");
  });

  it("rejects singleton group membership and partial grouped deletion at replay", () => {
    const initial = createProjectV3({
        projectId: "group-cardinality",
        metadata,
        themeKind: "custom",
      }),
      added = applyOperationV3(initial, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: { version: 3, type: "add-shape-layer", layer: shape() },
      });
    expect(() =>
      applyOperationV3(added, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "set-layer-groups",
          memberships: [{ layerId: "shape", groupId: "singleton" }],
        },
      }),
    ).toThrow("Invalid visual document");
  });

  it.each([
    { version: 3, type: "set-layer-positions", positions: [] },
    {
      version: 3,
      type: "set-layer-positions",
      positions: [{ layerId: "shape", xQ16: 0, yQ16: 0, extra: true }],
    },
    {
      version: 3,
      type: "set-layer-positions",
      positions: [
        { layerId: "shape", xQ16: 0, yQ16: 0 },
        { layerId: "shape", xQ16: 1, yQ16: 1 },
      ],
    },
    { version: 3, type: "remove-layers", layerIds: [] },
    { version: 3, type: "remove-layers", layerIds: ["shape", "shape"] },
  ] as const)("rejects malformed bounded batch operation %#", (operation) => {
    const state = createProjectV3({
      projectId: "bad-batch",
      metadata,
      themeKind: "custom",
    });
    expect(() =>
      applyOperationV3(state, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation,
      } as never),
    ).toThrow("Invalid V3 operation");
  });

  it("rejects a 257-entry batch at the direct history boundary", () => {
    const state = createProjectV3({
        projectId: "oversized-batch",
        metadata,
        themeKind: "custom",
      }),
      positions = Array.from({ length: MAX_BATCH_LAYER_EDITS_V3 + 1 }, (_, index) => ({
        layerId: `layer-${index}`,
        xQ16: index,
        yQ16: index,
      }));
    expect(() =>
      applyOperationV3(state, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: { version: 3, type: "set-layer-positions", positions },
      }),
    ).toThrow("Invalid V3 operation");
    expect(() =>
      applyOperationV3(state, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "remove-layers",
          layerIds: positions.map(({ layerId }) => layerId),
        },
      }),
    ).toThrow("Invalid V3 operation");
  });

  it.each([0, 90, 180, 270] as const)("persists and replays one %s degree rotation operation", (rotation) => {
    const initial = createProjectV3({
        projectId: `rotation-${rotation}`,
        metadata,
        themeKind: "custom",
      }),
      added = applyOperationV3(initial, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: { version: 3, type: "add-shape-layer", layer: shape() },
      }),
      rotated = applyOperationV3(added, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "set-layer-rotation",
          layerId: "shape",
          rotation,
        },
      });
    expect(rotated.operations).toHaveLength(2);
    expect(currentProjectV3({ ...rotated, cursor: 1 }).visualDocuments?.scrim?.layers[0]?.rotation ?? 0).toBe(0);
    expect(openProjectV3(saveProjectV3(rotated)).project.visualDocuments?.scrim?.layers[0]?.rotation).toBe(rotation);
  });

  it("constructs, edits, persists, undoes, and redoes canonical text layers", () => {
    expect(text()).toMatchObject({
      kind: "text",
      content: "Hello\n😀",
      scale: 2,
      alignment: "center",
    });
    const initial = createProjectV3({
        projectId: "text-history",
        metadata,
        themeKind: "custom",
      }),
      added = applyOperationV3(initial, {
        version: 3,
        type: "edit-visual-document",
        role: "banner-cell",
        operation: { version: 3, type: "add-text-layer", layer: text() },
      }),
      edited = applyOperationV3(added, {
        version: 3,
        type: "edit-visual-document",
        role: "banner-cell",
        operation: {
          version: 3,
          type: "set-text-properties",
          layerId: "text",
          content: "",
          fill: "#123456",
          scale: 1,
          alignment: "right",
        },
      });
    expect(currentProjectV3({ ...edited, cursor: 1 }).visualDocuments?.["banner-cell"]?.layers[0]).toMatchObject({
      content: "Hello\n😀",
      alignment: "center",
    });
    expect(currentProjectV3({ ...edited, cursor: 2 }).visualDocuments?.["banner-cell"]?.layers[0]).toMatchObject({
      content: "",
      fill: "#123456",
      alignment: "right",
    });
    expect(openProjectV3(saveProjectV3(edited)).project.visualDocuments?.["banner-cell"]?.layers[0]).toEqual(
      currentProjectV3(edited).visualDocuments?.["banner-cell"]?.layers[0],
    );
  });

  it("authors independent text documents for all seven visual roles", () => {
    const initial = createProjectV3({
        projectId: "seven-text-documents",
        metadata,
        themeKind: "custom",
      }),
      state = V3_VISUAL_ROLES.reduce(
        (current, role, index) =>
          applyOperationV3(current, {
            version: 3,
            type: "edit-visual-document",
            role,
            operation: {
              version: 3,
              type: "add-text-layer",
              layer: {
                ...text(),
                id: `text-${role}`,
                content: `${index}:${role}`,
              },
            },
          }),
        initial,
      ),
      reopened = openProjectV3(saveProjectV3(state));
    expect(Object.keys(reopened.project.visualDocuments ?? {}).sort()).toEqual([...V3_VISUAL_ROLES].sort());
    for (const [index, role] of V3_VISUAL_ROLES.entries())
      expect(reopened.project.visualDocuments?.[role]?.layers).toMatchObject([
        { kind: "text", id: `text-${role}`, content: `${index}:${role}` },
      ]);
    expect(currentProjectV3({ ...state, cursor: state.cursor - 1 }).visualDocuments?.scrim).toBeUndefined();
  });

  it("keeps coincident layer IDs isolated across role documents", () => {
    const initial = createProjectV3({
        projectId: "coincident-role-ids",
        metadata,
        themeKind: "custom",
      }),
      first = applyOperationV3(initial, {
        version: 3,
        type: "edit-visual-document",
        role: "grid-cell",
        operation: {
          version: 3,
          type: "add-shape-layer",
          layer: { ...shape(), id: "shared-id" },
        },
      }),
      second = applyOperationV3(first, {
        version: 3,
        type: "edit-visual-document",
        role: "grid-cell-selected",
        operation: {
          version: 3,
          type: "add-shape-layer",
          layer: { ...shape(), id: "shared-id" },
        },
      }),
      moved = applyOperationV3(second, {
        version: 3,
        type: "edit-visual-document",
        role: "grid-cell",
        operation: {
          version: 3,
          type: "set-layer-positions",
          positions: [{ layerId: "shared-id", xQ16: 9 * 65536, yQ16: 7 * 65536 }],
        },
      });
    expect(moved.project.visualDocuments?.["grid-cell"]?.layers[0]).toMatchObject({
      id: "shared-id",
      xQ16: 9 * 65536,
      yQ16: 7 * 65536,
    });
    expect(moved.project.visualDocuments?.["grid-cell-selected"]?.layers[0]).toMatchObject({
      id: "shared-id",
      xQ16: 65536,
      yQ16: 2 * 65536,
    });
  });

  it("rejects malformed text at constructor, history, and open boundaries", () => {
    for (const patch of [
      { content: "x".repeat(257) },
      { content: new Array(9).fill("x").join("\n") },
      { content: "bad\rcontrol" },
      { fill: "#FFFFFF" },
      { scale: 0 },
      { scale: 1.5 },
      { alignment: "justify" },
      { opacity: Number.NaN },
      { widthQ16: 0 },
    ])
      expect(() => createTextLayerV3({ ...text(), ...patch } as never)).toThrow("not canonical");
    const state = createProjectV3({
      projectId: "invalid-text",
      metadata,
      themeKind: "custom",
    });
    expect(() =>
      applyOperationV3(state, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "add-text-layer",
          layer: { ...text(), extra: true },
        } as never,
      }),
    ).toThrow("Invalid V3 operation");
    const persisted = JSON.parse(saveProjectV3(state));
    persisted.operations = [
      {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "set-text-properties",
          layerId: "text",
          content: "x",
          fill: "red",
          scale: 1,
          alignment: "left",
        },
      },
    ];
    persisted.cursor = 1;
    expect(() => openProjectV3(JSON.stringify(persisted))).toThrow("strict V3 validation");
  });

  it.each(operationEnvelopes())("rejects unknown keys on $type at direct, save, and open boundaries", (operation) => {
    const state = createProjectV3({
        projectId: `closed-${operation.type}`,
        metadata,
        themeKind: "custom",
      }),
      contaminated = { ...operation, unknown: true } as never;
    expect(() => applyOperationV3(state, contaminated)).toThrow("Invalid V3 operation");
    expect(() => saveProjectV3({ ...state, operations: [contaminated], cursor: 0 })).toThrow(
      "Project state is not canonical V3",
    );
    const persisted = JSON.parse(saveProjectV3(state));
    persisted.operations = [contaminated];
    expect(() => openProjectV3(JSON.stringify(persisted))).toThrow("strict V3 validation");
  });

  it("reopens image-only V3 history without requiring a discriminator", () => {
    const image: LayerV2 = {
      id: "legacy-image",
      name: "Legacy image",
      visible: true,
      opacity: 65536,
      asset: { path: "assets/sha256/a.png", sha256: "a" },
      xQ16: 0,
      yQ16: 0,
      width: 4,
      height: 3,
      widthQ16: 4 * 65536,
      heightQ16: 3 * 65536,
      crop: { x: 1, y: 1, width: 2, height: 2 },
    };
    const state = createProjectV3({
        projectId: "legacy-v3",
        metadata,
        themeKind: "custom",
      }),
      persisted = {
        ...state,
        project: undefined,
        operations: [
          {
            version: 3,
            type: "edit-visual-document",
            role: "grid-cell",
            operation: {
              version: 2,
              type: "add-layer",
              screen: "top",
              layer: image,
            },
          },
        ],
        cursor: 1,
      };
    delete (persisted as { project?: unknown }).project;

    expect(
      openProjectV3(`${JSON.stringify(persisted)}\n`).project.visualDocuments?.["grid-cell"]?.layers[0],
    ).toMatchObject({
      kind: "image",
      crop: image.crop,
      asset: image.asset,
    });
    expect(
      openProjectV3(`${JSON.stringify(persisted)}\n`).project.visualDocuments?.["grid-cell"]?.layers[0]?.rotation ?? 0,
    ).toBe(0);
    expect(
      openProjectV3(`${JSON.stringify(persisted)}\n`).project.visualDocuments?.["grid-cell"]?.layers[0]?.locked,
    ).toBe(false);
  });

  it("defaults every layer kind to unlocked and rejects non-boolean lock state", () => {
    const image = {
      kind: "image" as const,
      id: "image",
      name: "Image",
      visible: true,
      opacity: 65536,
      asset: { path: "image.png", sha256: "image" },
      xQ16: 0,
      yQ16: 0,
      width: 1,
      height: 1,
      widthQ16: 65536,
      heightQ16: 65536,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    };
    expect([shape(), text(), createImageLayerV3(image)].map(({ locked }) => locked)).toEqual([false, false, false]);
    expect(() => createShapeLayerV3({ ...shape(), locked: "yes" } as never)).toThrow("not canonical");
    expect(() => createTextLayerV3({ ...text(), locked: 1 } as never)).toThrow("not canonical");
    expect(() => createImageLayerV3({ ...image, locked: null } as never)).toThrow("not canonical");
  });

  it("locks complete groups atomically while allowing visibility and preserving undo", () => {
    let state = createProjectV3({
      projectId: "locks",
      metadata,
      themeKind: "custom",
    });
    for (const layer of [shape(), { ...text(), visible: false }])
      state = applyOperationV3(state, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation:
          layer.kind === "shape"
            ? { version: 3, type: "add-shape-layer", layer }
            : { version: 3, type: "add-text-layer", layer },
      });
    state = applyOperationV3(state, {
      version: 3,
      type: "edit-visual-document",
      role: "scrim",
      operation: {
        version: 3,
        type: "set-layer-groups",
        memberships: [
          { layerId: "shape", groupId: "group" },
          { layerId: "text", groupId: "group" },
        ],
      },
    });
    const locked = applyOperationV3(state, {
      version: 3,
      type: "edit-visual-document",
      role: "scrim",
      operation: {
        version: 3,
        type: "set-layer-locks",
        locks: [
          { layerId: "shape", locked: true },
          { layerId: "text", locked: true },
        ],
      },
    });
    expect(locked.project.visualDocuments?.scrim?.layers.map(({ locked: value }) => value)).toEqual([true, true]);
    expect(currentProjectV3({ ...locked, cursor: locked.cursor - 1 }).visualDocuments?.scrim?.layers).toMatchObject([
      { locked: false },
      { locked: false },
    ]);
    const visible = applyOperationV3(locked, {
      version: 3,
      type: "edit-visual-document",
      role: "scrim",
      operation: {
        version: 2,
        type: "set-layer-visibility",
        screen: "top",
        layerId: "text",
        visible: true,
      },
    });
    expect(visible.project.visualDocuments?.scrim?.layers[1]).toMatchObject({
      locked: true,
      visible: true,
    });
    for (const operation of [
      {
        version: 3,
        type: "set-layer-positions",
        positions: [
          { layerId: "shape", xQ16: 0, yQ16: 0 },
          { layerId: "text", xQ16: 0, yQ16: 0 },
        ],
      },
      { version: 3, type: "remove-layers", layerIds: ["shape", "text"] },
      {
        version: 3,
        type: "reorder-layers",
        layerIds: ["shape", "text"],
        toIndex: 0,
      },
      {
        version: 3,
        type: "set-layer-groups",
        memberships: [{ layerId: "shape" }, { layerId: "text" }],
      },
      {
        version: 3,
        type: "set-layer-rotations",
        rotations: [
          { layerId: "shape", rotation: 90 },
          { layerId: "text", rotation: 90 },
        ],
      },
      { version: 3, type: "set-shape-fill", layerId: "shape", fill: "#000000" },
      {
        version: 3,
        type: "set-text-properties",
        layerId: "text",
        content: "Locked",
        fill: "#ffffff",
        scale: 1,
        alignment: "left",
      },
    ] as const)
      expect(() =>
        applyOperationV3(locked, {
          version: 3,
          type: "edit-visual-document",
          role: "scrim",
          operation: operation as never,
        }),
      ).toThrow("Locked layers cannot be edited");
  });

  it("lets a hidden locked member protect every mutation of its unlocked group sibling", () => {
    let state = createProjectV3({
      projectId: "hidden-group-lock",
      metadata,
      themeKind: "custom",
    });
    for (const layer of [shape(), { ...text(), visible: false }])
      state = applyOperationV3(state, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation:
          layer.kind === "shape"
            ? { version: 3, type: "add-shape-layer", layer }
            : { version: 3, type: "add-text-layer", layer },
      });
    state = applyOperationV3(state, {
      version: 3,
      type: "edit-visual-document",
      role: "scrim",
      operation: {
        version: 3,
        type: "set-layer-groups",
        memberships: [
          { layerId: "shape", groupId: "protected" },
          { layerId: "text", groupId: "protected" },
        ],
      },
    });
    const hiddenLocked = applyOperationV3(state, {
      version: 3,
      type: "edit-visual-document",
      role: "scrim",
      operation: {
        version: 3,
        type: "set-layer-locks",
        locks: [
          { layerId: "shape", locked: false },
          { layerId: "text", locked: true },
        ],
      },
    });
    for (const operation of [
      {
        version: 2,
        type: "rename-layer",
        screen: "top",
        layerId: "shape",
        name: "Bypass",
      },
      {
        version: 2,
        type: "set-layer-properties",
        screen: "top",
        layerId: "shape",
        xQ16: 0,
        yQ16: 0,
        widthQ16: 65536,
        heightQ16: 65536,
        opacity: 1,
        crop: { x: 0, y: 0, width: 1, height: 1 },
      },
      { version: 3, type: "set-shape-fill", layerId: "shape", fill: "#000000" },
      {
        version: 3,
        type: "set-layer-rotation",
        layerId: "shape",
        rotation: 90,
      },
      {
        version: 3,
        type: "set-layer-positions",
        positions: [{ layerId: "shape", xQ16: 0, yQ16: 0 }],
      },
      { version: 3, type: "remove-layers", layerIds: ["shape"] },
      { version: 3, type: "reorder-layers", layerIds: ["shape"], toIndex: 0 },
      {
        version: 3,
        type: "set-layer-groups",
        memberships: [{ layerId: "shape" }, { layerId: "text" }],
      },
    ] as const)
      expect(() =>
        applyOperationV3(hiddenLocked, {
          version: 3,
          type: "edit-visual-document",
          role: "scrim",
          operation: operation as never,
        }),
      ).toThrow("Locked layers cannot be edited");
    const shown = applyOperationV3(hiddenLocked, {
      version: 3,
      type: "edit-visual-document",
      role: "scrim",
      operation: {
        version: 2,
        type: "set-layer-visibility",
        screen: "top",
        layerId: "text",
        visible: true,
      },
    });
    expect(shown.project.visualDocuments?.scrim?.layers[1]).toMatchObject({
      locked: true,
      visible: true,
    });
    const swapped = applyOperationV3(state, {
      version: 3,
      type: "edit-visual-document",
      role: "scrim",
      operation: {
        version: 3,
        type: "set-layer-locks",
        locks: [
          { layerId: "shape", locked: true },
          { layerId: "text", locked: false },
        ],
      },
    });
    expect(() =>
      applyOperationV3(swapped, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "set-text-properties",
          layerId: "text",
          content: "Bypass",
          fill: "#000000",
          scale: 1,
          alignment: "right",
        },
      }),
    ).toThrow("Locked layers cannot be edited");
  });

  it("strictly validates bounded lock batches at history and open boundaries", () => {
    const state = createProjectV3({
      projectId: "invalid-locks",
      metadata,
      themeKind: "custom",
    });
    const operation = {
      version: 3,
      type: "edit-visual-document",
      role: "scrim",
      operation: {
        version: 3,
        type: "set-layer-locks",
        locks: [{ layerId: "shape", locked: "yes" }],
      },
    } as never;
    expect(() => applyOperationV3(state, operation)).toThrow("Invalid V3 operation");
    const persisted = JSON.parse(saveProjectV3(state));
    persisted.operations = [operation];
    persisted.cursor = 1;
    expect(() => openProjectV3(JSON.stringify(persisted))).toThrow("strict V3 validation");
  });

  it("rejects every single-layer mutation while preserving locked copies independently", () => {
    const initial = createProjectV3({
        projectId: "locked-copy",
        metadata,
        themeKind: "custom",
      }),
      added = applyOperationV3(initial, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "add-shape-layer",
          layer: { ...shape(), locked: true },
        },
      });
    for (const operation of [
      {
        version: 2,
        type: "move-layer",
        screen: "top",
        layerId: "shape",
        xQ16: 0,
        yQ16: 0,
      },
      {
        version: 2,
        type: "rename-layer",
        screen: "top",
        layerId: "shape",
        name: "Renamed",
      },
      { version: 2, type: "remove-layer", screen: "top", layerId: "shape" },
      {
        version: 2,
        type: "reorder-layer",
        screen: "top",
        layerId: "shape",
        toIndex: 0,
      },
      {
        version: 2,
        type: "set-layer-properties",
        screen: "top",
        layerId: "shape",
        xQ16: 0,
        yQ16: 0,
        widthQ16: 65536,
        heightQ16: 65536,
        opacity: 1,
        crop: { x: 0, y: 0, width: 1, height: 1 },
      },
      {
        version: 3,
        type: "set-layer-rotation",
        layerId: "shape",
        rotation: 90,
      },
    ] as const)
      expect(() =>
        applyOperationV3(added, {
          version: 3,
          type: "edit-visual-document",
          role: "scrim",
          operation: operation as never,
        }),
      ).toThrow("Locked layers cannot be edited");
    const inserted = applyOperationV3(added, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "insert-layers",
          layers: [
            {
              ...added.project.visualDocuments!.scrim!.layers[0]!,
              id: "shape-copy",
            },
          ],
          toIndex: 1,
        },
      }),
      unlockedCopy = applyOperationV3(inserted, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "set-layer-locks",
          locks: [{ layerId: "shape-copy", locked: false }],
        },
      });
    expect(unlockedCopy.project.visualDocuments?.scrim?.layers).toMatchObject([
      { id: "shape", locked: true },
      { id: "shape-copy", locked: false },
    ]);
  });

  it("rejects invalid rotation at constructor, history, save, and open boundaries", () => {
    expect(() => createShapeLayerV3({ ...shape(), rotation: 45 } as never)).toThrow("not canonical");
    expect(() => createTextLayerV3({ ...text(), rotation: -90 } as never)).toThrow("not canonical");
    expect(() =>
      createImageLayerV3({
        kind: "image",
        id: "image",
        name: "Image",
        visible: true,
        opacity: 65536,
        rotation: 45,
        asset: { path: "image.png", sha256: "image" },
        xQ16: 0,
        yQ16: 0,
        width: 1,
        height: 1,
        widthQ16: 65536,
        heightQ16: 65536,
        crop: { x: 0, y: 0, width: 1, height: 1 },
      } as never),
    ).toThrow("not canonical");
    const state = createProjectV3({
      projectId: "invalid-rotation",
      metadata,
      themeKind: "custom",
    });
    const bad = {
      version: 3,
      type: "edit-visual-document",
      role: "scrim",
      operation: {
        version: 3,
        type: "set-layer-rotation",
        layerId: "shape",
        rotation: 360,
      },
    } as never;
    expect(() => applyOperationV3(state, bad)).toThrow("Invalid V3 operation");
    expect(() => saveProjectV3({ ...state, operations: [bad] })).toThrow("not canonical V3");
    const persisted = JSON.parse(saveProjectV3(state));
    persisted.operations = [bad];
    expect(() => openProjectV3(JSON.stringify(persisted))).toThrow("strict V3 validation");
  });

  it("rejects invalid shape operations at history and open boundaries", () => {
    const state = createProjectV3({
      projectId: "invalid-shape",
      metadata,
      themeKind: "custom",
    });
    expect(() =>
      applyOperationV3(state, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "add-shape-layer",
          layer: { ...shape(), fill: "#FFFFFF" },
        },
      }),
    ).toThrow("Invalid V3 operation");
    const persisted = JSON.parse(saveProjectV3(state));
    persisted.operations = [
      {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "set-shape-fill",
          layerId: "shape",
          fill: "transparent",
        },
      },
    ];
    persisted.cursor = 1;
    expect(() => openProjectV3(JSON.stringify(persisted))).toThrow("strict V3 validation");
    expect(() =>
      applyOperationV3(state, {
        version: 3,
        type: "import-visual-layer",
        role: "scrim",
        operation: { version: 3, type: "add-shape-layer", layer: shape() },
        asset: {} as never,
      } as never),
    ).toThrow("Invalid V3 operation");
  });

  it("rejects malformed snapshots before save", () => {
    const state = createProjectV3({
        projectId: "snapshot-save",
        metadata,
        themeKind: "custom",
      }),
      project = structuredClone(state.project);
    project.visualDocuments = {
      scrim: {
        role: "scrim",
        width: 8,
        height: 42,
        layers: [{ ...shape(), fill: "#FFFFFF" }],
      },
    };
    expect(() => saveProjectV3({ ...state, snapshots: [{ revision: 1, project }] })).toThrow(
      "Project state is not canonical V3",
    );
  });

  it("rejects malformed snapshots before open", () => {
    const persisted = JSON.parse(
      saveProjectV3(
        createProjectV3({
          projectId: "snapshot-open",
          metadata,
          themeKind: "custom",
        }),
      ),
    );
    persisted.snapshots = [{ revision: 1, project: null }];
    expect(() => openProjectV3(JSON.stringify(persisted))).toThrow("Project format failed strict V3 validation");
  });

  it("rejects extended snapshot envelopes before save, open, and direct media traversal", () => {
    const state = createProjectV3({
        projectId: "snapshot-exact-keys",
        metadata,
        themeKind: "custom",
      }),
      snapshot = {
        revision: 0,
        project: structuredClone(state.project),
        extra: true,
      },
      malformed = { ...state, snapshots: [snapshot] };
    expect(() => saveProjectV3(malformed as never)).toThrow("Project state is not canonical V3");
    expect(() => collectMediaReferencesV3(malformed as never)).toThrow("Project state is not canonical V3");

    const persisted = JSON.parse(saveProjectV3(state));
    persisted.snapshots = [snapshot];
    expect(() => openProjectV3(JSON.stringify(persisted))).toThrow("Project format failed strict V3 validation");
  });
});
