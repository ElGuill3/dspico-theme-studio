import { describe, expect, it } from "vitest";
import type { ShapeLayerV3 } from "../../../../../packages/theme-core/src/index.js";
import {
  cacheInspectorDraft,
  createInspectorDraft,
  inspectorDraftKey,
  inspectorLayerRevision,
  pruneInspectorDrafts,
  readInspectorDraft,
} from "./inspector-drafts.js";

const layer = (x = 64): ShapeLayerV3 => ({
  kind: "shape",
  shape: "rectangle",
  fill: "#4ed8e8",
  id: "layer-1",
  name: "Rectangle",
  visible: true,
  locked: false,
  opacity: 65536,
  rotation: 0,
  xQ16: x * 65536,
  yQ16: 0,
  widthQ16: 32 * 65536,
  heightQ16: 32 * 65536,
});

describe("Inspector draft cache", () => {
  it("retains an uncommitted draft while the authoritative layer is unchanged", () => {
    const source = layer(),
      key = inspectorDraftKey("project", "top-background", source.id),
      draft = createInspectorDraft(source);
    draft.properties.x = "123";
    const cache = cacheInspectorDraft(new Map(), key, source, draft);
    expect(readInspectorDraft(cache, key, source).properties.x).toBe("123");
  });

  it("invalidates a draft after commit, undo, or another authoritative layer change", () => {
    const source = layer(),
      changed = layer(96),
      key = inspectorDraftKey("project", "top-background", source.id),
      draft = createInspectorDraft(source);
    draft.properties.x = "123";
    const cache = cacheInspectorDraft(new Map(), key, source, draft);
    expect(readInspectorDraft(cache, key, changed).properties.x).toBe("96");
  });

  it("prunes deleted layers and drafts from replaced projects", () => {
    const source = layer(),
      retainedKey = inspectorDraftKey("project", "top-background", source.id),
      removedKey = inspectorDraftKey("old-project", "top-background", source.id),
      draft = createInspectorDraft(source);
    let cache = cacheInspectorDraft(new Map(), retainedKey, source, draft);
    cache = cacheInspectorDraft(cache, removedKey, source, draft);
    expect(pruneInspectorDrafts(cache, new Map([[retainedKey, inspectorLayerRevision(source)]])).has(removedKey)).toBe(
      false,
    );
  });
});
