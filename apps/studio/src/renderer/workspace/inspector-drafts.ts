import type {
  LayerV2,
  ShapeLayerV3,
  TextLayerV3,
  VisualLayerV3,
} from "../../../../../packages/theme-core/src/index.js";

export type InspectorPropertyKey =
  "x" | "y" | "width" | "height" | "cropX" | "cropY" | "cropWidth" | "cropHeight" | "opacity" | "cornerRadius";

export type InspectorDraft = {
  name: string;
  properties: Record<InspectorPropertyKey, string>;
  fill: string;
  text: {
    content: string;
    fill: string;
    scale: string;
    alignment: TextLayerV3["alignment"];
  };
};

export type InspectorDraftEntry = { revision: string; draft: InspectorDraft };
export type InspectorDraftCache = Map<string, InspectorDraftEntry>;

const isShape = (layer: VisualLayerV3): layer is ShapeLayerV3 => layer.kind === "shape";
const isText = (layer: VisualLayerV3): layer is TextLayerV3 => layer.kind === "text";
const isImage = (layer: VisualLayerV3): layer is LayerV2 => !isShape(layer) && !isText(layer);

export const inspectorDraftKey = (projectId: string, document: string, layerId: string): string =>
  `${projectId}\0${document}\0${layerId}`;

export const inspectorLayerRevision = (layer: VisualLayerV3): string => JSON.stringify(layer);

export const createInspectorDraft = (layer: VisualLayerV3): InspectorDraft => ({
  name: layer.name,
  properties: {
    x: String(layer.xQ16 / 65536),
    y: String(layer.yQ16 / 65536),
    width: String(layer.widthQ16 / 65536),
    height: String(layer.heightQ16 / 65536),
    cropX: String(isImage(layer) ? layer.crop.x : 0),
    cropY: String(isImage(layer) ? layer.crop.y : 0),
    cropWidth: String(isImage(layer) ? layer.crop.width : 1),
    cropHeight: String(isImage(layer) ? layer.crop.height : 1),
    opacity: String(Math.round((layer.opacity * 100) / 65536)),
    cornerRadius: String(isShape(layer) && layer.shape === "rectangle" ? (layer.cornerRadiusQ16 ?? 0) / 65536 : 0),
  },
  fill: isShape(layer) ? layer.fill : "#000000",
  text: isText(layer)
    ? {
        content: layer.content,
        fill: layer.fill,
        scale: String(layer.scale),
        alignment: layer.alignment,
      }
    : { content: "", fill: "#ffffff", scale: "1", alignment: "left" },
});

export const readInspectorDraft = (cache: InspectorDraftCache, key: string, layer: VisualLayerV3): InspectorDraft => {
  const entry = cache.get(key);
  return entry?.revision === inspectorLayerRevision(layer) ? entry.draft : createInspectorDraft(layer);
};

export const cacheInspectorDraft = (
  cache: InspectorDraftCache,
  key: string,
  layer: VisualLayerV3,
  draft: InspectorDraft,
): InspectorDraftCache => {
  const next = new Map(cache);
  next.set(key, { revision: inspectorLayerRevision(layer), draft });
  return next;
};

export const pruneInspectorDrafts = (
  cache: InspectorDraftCache,
  revisions: ReadonlyMap<string, string>,
): InspectorDraftCache => new Map([...cache].filter(([key, entry]) => revisions.get(key) === entry.revision));
