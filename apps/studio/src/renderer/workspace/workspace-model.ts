import type {
  LayerV2,
  ImageLayerV3,
  ShapeLayerV3,
  TextLayerV3,
  VisualLayerV3,
} from "../../../../../packages/theme-core/src/index.js";
import {
  compositeCustomLayersV1,
  imageSourcePixelAtQ16V1,
  rotatedBoundsQ16V1,
  shapeContainsPixelCenterV1,
  textLayerContainsPixelCenterV1,
  unrotatePointQ16V1,
  type NormalizedRgbaAssetV1,
  type QuarterTurnV1,
} from "../../../../../packages/dspico-contract/src/index.js";

const isShapeLayerV3 = (layer: VisualLayerV3): layer is ShapeLayerV3 => layer.kind === "shape";
const isTextLayerV3 = (layer: VisualLayerV3): layer is TextLayerV3 => layer.kind === "text";
const isImageLayerV3 = (layer: VisualLayerV3): layer is LayerV2 => !isShapeLayerV3(layer) && !isTextLayerV3(layer);

export const SURFACE_SIZE = Object.freeze({ width: 256, height: 192 });
export const CUSTOM_PREVIEW_LABELS = Object.freeze({
  postCodec: "Decoded post-codec output",
  fidelity: "Chromium approximation",
  limitation: "hardware-unknown",
  palette: "locked palette",
} as const);

export type WorkspaceFocus = "dual" | "top" | "bottom";
type DestinationQ16 = { x: number; y: number; width: number; height: number };
export type WorkspaceLayer =
  | {
      kind?: "image";
      id: string;
      order: number;
      asset: LayerV2["asset"];
      opacity: number;
      rotation?: QuarterTurnV1;
      source: LayerV2["crop"];
      destinationQ16: DestinationQ16;
    }
  | {
      kind: "shape";
      id: string;
      order: number;
      shape: ShapeLayerV3["shape"];
      cornerRadiusQ16?: number;
      fill: string;
      opacity: number;
      rotation?: QuarterTurnV1;
      destinationQ16: DestinationQ16;
    }
  | {
      kind: "text";
      id: string;
      order: number;
      content: string;
      fill: string;
      scale: number;
      alignment: TextLayerV3["alignment"];
      opacity: number;
      rotation?: QuarterTurnV1;
      destinationQ16: DestinationQ16;
    };
export type WorkspaceSurface = {
  screen: "top" | "bottom";
  width: number;
  height: number;
  layers: WorkspaceLayer[];
};
export const visualDocumentSurface = (
  document: { width: number; height: number; layers: readonly VisualLayerV3[] },
  assigned?: { sourceSha256: string; width: number; height: number },
  screen: "top" | "bottom" = "top",
  fillOverrides: ReadonlyMap<string, string> = new Map(),
  opacityOverrides: ReadonlyMap<string, number> = new Map(),
): WorkspaceSurface => {
  const layers = document.layers.length
    ? document.layers
    : assigned
      ? [
          {
            kind: "image" as const,
            id: "assigned-role-fallback",
            name: "Assigned role asset",
            visible: true,
            opacity: 65536,
            asset: { path: "", sha256: assigned.sourceSha256 },
            xQ16: 0,
            yQ16: 0,
            width: assigned.width,
            height: assigned.height,
            widthQ16: document.width * 65536,
            heightQ16: document.height * 65536,
            crop: {
              x: 0,
              y: 0,
              width: assigned.width,
              height: assigned.height,
            },
          },
        ]
      : [];
  return {
    screen,
    width: document.width,
    height: document.height,
    layers: layers.flatMap((layer, order) =>
      layer.visible
        ? [
            {
              id: layer.id,
              order,
              ...(isShapeLayerV3(layer)
                ? {
                    kind: "shape" as const,
                    shape: layer.shape,
                    ...(layer.cornerRadiusQ16 === undefined ? {} : { cornerRadiusQ16: layer.cornerRadiusQ16 }),
                    fill: fillOverrides.get(layer.id) ?? layer.fill,
                  }
                : isTextLayerV3(layer)
                  ? {
                      kind: "text" as const,
                      content: layer.content,
                      fill: fillOverrides.get(layer.id) ?? layer.fill,
                      scale: layer.scale,
                      alignment: layer.alignment,
                    }
                  : {
                      kind: "image" as const,
                      asset: layer.asset,
                      source: layer.crop,
                    }),
              opacity: opacityOverrides.get(layer.id) ?? layer.opacity,
              rotation: layer.rotation ?? 0,
              destinationQ16: {
                x: layer.xQ16,
                y: layer.yQ16,
                width: layer.widthQ16,
                height: layer.heightQ16,
              },
            },
          ]
        : [],
    ),
  };
};
export const MIN_VIEWPORT_ZOOM = 25;
export const MAX_VIEWPORT_ZOOM = 1600;
export type DocumentViewport = {
  zoom: number;
  panX: number;
  panY: number;
  showGuides: boolean;
  lockGuides: boolean;
};
export type WorkspaceView = {
  focus: WorkspaceFocus;
  gap: 96;
  grid: boolean;
  zoom: number;
};
export type WorkspaceViewAction =
  | { type: "focus"; screen: WorkspaceFocus }
  | { type: "grid"; value: boolean }
  | { type: "zoom"; value: WorkspaceView["zoom"] };

export const initialWorkspaceView: WorkspaceView = Object.freeze({
  focus: "dual",
  gap: 96,
  grid: false,
  zoom: 100,
});

export const updateWorkspaceView = (view: WorkspaceView, action: WorkspaceViewAction): WorkspaceView => {
  if (action.type === "focus") return { ...view, focus: action.screen };
  if (action.type === "grid") return { ...view, grid: action.value };
  return { ...view, zoom: action.value };
};
const finite = (value: number, fallback = 0): number => (Number.isFinite(value) ? value : fallback);
export const normalizeZoom = (value: number): number =>
  Math.min(MAX_VIEWPORT_ZOOM, Math.max(MIN_VIEWPORT_ZOOM, Math.round(finite(value, 100) * 100) / 100));
export const normalizeViewport = (value: Partial<DocumentViewport> = {}): DocumentViewport => ({
  zoom: normalizeZoom(value.zoom ?? 100),
  panX: finite(value.panX ?? 0),
  panY: finite(value.panY ?? 0),
  showGuides: value.showGuides ?? true,
  lockGuides: value.lockGuides ?? false,
});
export const zoomViewportAtPoint = (
  viewport: DocumentViewport,
  zoom: number,
  pointer: { x: number; y: number },
  baseScale = 1,
): DocumentViewport => {
  const current = normalizeViewport(viewport),
    nextZoom = normalizeZoom(zoom),
    oldScale = (baseScale * current.zoom) / 100,
    nextScale = (baseScale * nextZoom) / 100,
    documentX = (finite(pointer.x) - current.panX) / oldScale,
    documentY = (finite(pointer.y) - current.panY) / oldScale;
  return normalizeViewport({
    ...current,
    zoom: nextZoom,
    panX: finite(pointer.x) - documentX * nextScale,
    panY: finite(pointer.y) - documentY * nextScale,
  });
};
export const panViewport = (viewport: DocumentViewport, deltaX: number, deltaY: number): DocumentViewport =>
  normalizeViewport({
    ...viewport,
    panX: viewport.panX + finite(deltaX),
    panY: viewport.panY + finite(deltaY),
  });
export const fitViewport = (
  documentSize: { width: number; height: number },
  containerSize: { width: number; height: number },
  padding = 32,
): DocumentViewport => {
  const availableWidth = Math.max(1, finite(containerSize.width) - padding * 2),
    availableHeight = Math.max(1, finite(containerSize.height) - padding * 2),
    zoom = normalizeZoom(Math.min(availableWidth / documentSize.width, availableHeight / documentSize.height) * 100),
    scale = zoom / 100;
  return normalizeViewport({
    zoom,
    panX: (finite(containerSize.width) - documentSize.width * scale) / 2,
    panY: (finite(containerSize.height) - documentSize.height * scale) / 2,
  });
};
export type RulerTick = { position: number; major: boolean; label?: string };
export const rulerTicks = (length: number, zoom: number): RulerTick[] => {
  const scale = normalizeZoom(zoom) / 100,
    steps = [1, 2, 4, 8, 16, 32, 64, 128],
    minor = steps.find((step) => step * scale >= 7) ?? 128,
    major = steps.find((step) => step >= minor && step * scale >= 42) ?? 128,
    ticks: RulerTick[] = [];
  for (let position = 0; position <= length; position += minor)
    ticks.push({
      position,
      major: position % major === 0,
      ...(position % major === 0 ? { label: String(position) } : {}),
    });
  if (ticks.at(-1)?.position !== length) ticks.push({ position: length, major: true, label: String(length) });
  return ticks;
};
export const resolveGuideDrop = (
  axis: "x" | "y",
  pointer: { x: number; y: number },
  bounds: { left: number; top: number; right: number; bottom: number },
  displayScale: number,
  maximum: number,
  removalGutter = 24,
): { remove: true } | { remove: false; position: number } => {
  if (
    pointer.x < bounds.left - removalGutter ||
    pointer.x > bounds.right + removalGutter ||
    pointer.y < bounds.top - removalGutter ||
    pointer.y > bounds.bottom + removalGutter
  )
    return { remove: true };
  const value = axis === "x" ? pointer.x - bounds.left : pointer.y - bounds.top;
  return {
    remove: false,
    position: Math.max(0, Math.min(maximum, Math.round(value / Math.max(Number.EPSILON, displayScale)))),
  };
};
const safeInteger = (value: bigint): number =>
  Number(
    value < BigInt(Number.MIN_SAFE_INTEGER)
      ? BigInt(Number.MIN_SAFE_INTEGER)
      : value > BigInt(Number.MAX_SAFE_INTEGER)
        ? BigInt(Number.MAX_SAFE_INTEGER)
        : value,
  );
const pointerDelta = (value: number): number =>
  Number.isFinite(value)
    ? Math.max(
        -Math.floor(Number.MAX_SAFE_INTEGER / 65536),
        Math.min(Math.floor(Number.MAX_SAFE_INTEGER / 65536), Math.round(value)),
      )
    : 0;
export const pointerTranslationQ16 = (
  origin: { xQ16: number; yQ16: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) => ({
  xQ16: safeInteger(BigInt(origin.xQ16) + BigInt(pointerDelta(end.x - start.x)) * 65536n),
  yQ16: safeInteger(BigInt(origin.yQ16) + BigInt(pointerDelta(end.y - start.y)) * 65536n),
});
export type TransformMode = "move" | "resize";
export const gestureAuthorityKey = (documentKey: string, authorityVersion: number): string =>
  `${documentKey}\0${authorityVersion}`;
export const RESIZE_HANDLES = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
export type ResizeHandle = (typeof RESIZE_HANDLES)[number];
export const layerVisualBoundsQ16 = (
  layer: Pick<VisualLayerV3, "xQ16" | "yQ16" | "widthQ16" | "heightQ16" | "rotation">,
) =>
  rotatedBoundsQ16V1(
    {
      x: layer.xQ16,
      y: layer.yQ16,
      width: layer.widthQ16,
      height: layer.heightQ16,
    },
    layer.rotation ?? 0,
  );
export type LayerSelection = { ids: string[]; active?: string };
export const ID_ALLOCATION_ERROR = "Could not allocate a fresh layer or group ID.";
export const allocateCanonicalLayerId = (
  used: Set<string>,
  prefix = "",
  random: () => string = () => crypto.randomUUID(),
  attempts = 32,
): string => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = `${prefix}${random()}`;
    if (candidate.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(candidate) && !used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  throw new Error(ID_ALLOCATION_ERROR);
};
export const layerAndGroupIds = (layers: readonly Pick<VisualLayerV3, "id" | "groupId">[]): Set<string> =>
  new Set(layers.flatMap(({ id, groupId }) => [id, ...(groupId ? [groupId] : [])]));
export const reorderLayerBlock = (
  layers: readonly Pick<VisualLayerV3, "id" | "groupId">[],
  layerId: string,
  direction: -1 | 1,
): { layerIds: string[]; toIndex: number } | undefined => {
  const source = layers.find(({ id }) => id === layerId);
  if (!source) return undefined;
  const moving = source.groupId ? layers.filter(({ groupId }) => groupId === source.groupId) : [source],
    movingIds = new Set(moving.map(({ id }) => id)),
    first = Math.min(...moving.map((layer) => layers.indexOf(layer))),
    last = Math.max(...moving.map((layer) => layers.indexOf(layer))),
    neighbor = layers[direction > 0 ? last + 1 : first - 1];
  if (!neighbor) return undefined;
  const destination = neighbor.groupId ? layers.filter(({ groupId }) => groupId === neighbor.groupId) : [neighbor],
    remaining = layers.filter(({ id }) => !movingIds.has(id)),
    destinationIndexes = destination.map((layer) => remaining.indexOf(layer)).filter((index) => index >= 0),
    toIndex = direction > 0 ? Math.max(...destinationIndexes) + 1 : Math.min(...destinationIndexes);
  return { layerIds: moving.map(({ id }) => id), toIndex };
};
export type LayerShortcut = "copy" | "duplicate" | "group" | "ungroup" | "lock" | "unlock";
export const isLayerEditingTarget = (target: { tagName?: string; isContentEditable?: boolean } | null): boolean =>
  Boolean(
    target?.isContentEditable ||
    (typeof target?.tagName === "string" && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName.toUpperCase())),
  );
export const shouldHandleLayerPaste = (target: { tagName?: string; isContentEditable?: boolean } | null): boolean =>
  !isLayerEditingTarget(target);
export const layerShortcut = (event: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  editing?: boolean;
}): LayerShortcut | undefined => {
  if (event.editing || event.repeat || !(event.ctrlKey || event.metaKey)) return undefined;
  const key = event.key.toLowerCase();
  if (key === "l" && event.altKey) return event.shiftKey ? "unlock" : "lock";
  if (key === "c") return "copy";
  if (key === "d") return "duplicate";
  if (key === "g") return event.shiftKey ? "ungroup" : "group";
  return undefined;
};
export const rotateLayerSelectionQuarterTurn = (
  layers: readonly Pick<VisualLayerV3, "id" | "rotation">[],
  delta: -90 | 90,
) =>
  layers.map(({ id, rotation }) => ({
    layerId: id,
    rotation: (((rotation ?? 0) + delta + 360) % 360) as 0 | 90 | 180 | 270,
  }));
export type LayerClipboardSnapshot = Readonly<{
  projectId: string;
  layers: readonly VisualLayerV3[];
}>;
export const freezeLayerClipboardSnapshot = (
  projectId: string,
  layers: readonly VisualLayerV3[],
): LayerClipboardSnapshot => {
  const copy = structuredClone(layers);
  for (const layer of copy) {
    if (isImageLayerV3(layer)) {
      Object.freeze(layer.asset);
      Object.freeze(layer.crop);
    }
    Object.freeze(layer);
  }
  return Object.freeze({ projectId, layers: Object.freeze(copy) });
};
export const clipboardMediaIsReachable = (
  layers: readonly VisualLayerV3[],
  imageHashes: ReadonlySet<string>,
): boolean => layers.every((layer) => !isImageLayerV3(layer) || imageHashes.has(layer.asset.sha256));
const layerSelectionUnit = (layers: readonly VisualLayerV3[], id: string): VisualLayerV3[] => {
  const layer = layers.find((candidate) => candidate.id === id);
  return layer?.groupId ? layers.filter(({ groupId }) => groupId === layer.groupId) : layer ? [layer] : [];
};
export const layerSelectionUnitCount = (layers: readonly VisualLayerV3[]): number =>
  new Set(layers.map((layer) => layer.groupId ?? `layer:${layer.id}`)).size;
export const updateGroupedLayerSelection = (
  selection: LayerSelection,
  layers: readonly VisualLayerV3[],
  id?: string,
  toggle = false,
  limit = Number.MAX_SAFE_INTEGER,
): LayerSelection => {
  if (!id) return { ids: [] };
  const unit = layerSelectionUnit(layers, id);
  if (!unit.length) return selection;
  const unitIds = unit.map((layer) => layer.id),
    selected = new Set(selection.ids),
    hasUnit = unitIds.some((candidate) => selected.has(candidate));
  if (!toggle) return { ids: unitIds, active: id };
  if (hasUnit) {
    const removed = new Set(unitIds),
      ids = selection.ids.filter((candidate) => !removed.has(candidate)),
      active = selection.active && !removed.has(selection.active) ? selection.active : ids.at(-1);
    return { ids, ...(active ? { active } : {}) };
  }
  if (selection.ids.length + unitIds.length > limit) return selection;
  return { ids: [...selection.ids, ...unitIds], active: id };
};
export const updateLayerSelection = (
  selection: LayerSelection,
  id?: string,
  toggle = false,
  limit = Number.MAX_SAFE_INTEGER,
): LayerSelection => {
  if (!id) return { ids: [] };
  if (!toggle) return { ids: [id], active: id };
  const index = selection.ids.indexOf(id);
  if (index < 0) return selection.ids.length >= limit ? selection : { ids: [...selection.ids, id], active: id };
  const ids = selection.ids.filter((candidate) => candidate !== id);
  if (selection.active !== id) return { ids, ...(selection.active ? { active: selection.active } : {}) };
  const active = ids[index] ?? ids[index - 1];
  return { ids, ...(active ? { active } : {}) };
};
export type EphemeralDeletionSelection = {
  before: LayerSelection;
  after: LayerSelection;
  missing: boolean;
};
export type EphemeralInsertionSelection = {
  before: LayerSelection;
  after: LayerSelection;
  insertedIds: string[];
  present: boolean;
};
export const transitionInsertionSelection = (
  record: EphemeralInsertionSelection,
  layers: readonly Pick<VisualLayerV3, "id">[],
): { record: EphemeralInsertionSelection; selection?: LayerSelection } => {
  const ids = new Set(layers.map(({ id }) => id)),
    present = record.insertedIds.every((id) => ids.has(id));
  if (present === record.present) return { record };
  return {
    record: { ...record, present },
    selection: present ? record.after : record.before,
  };
};
export const transitionDeletionSelection = (
  record: EphemeralDeletionSelection,
  layers: readonly Pick<VisualLayerV3, "id">[],
): { record: EphemeralDeletionSelection; selection?: LayerSelection } => {
  const ids = new Set(layers.map(({ id }) => id)),
    missing = record.before.ids.some((id) => !ids.has(id));
  if (missing === record.missing) return { record };
  return {
    record: { ...record, missing },
    selection: missing ? record.after : record.before,
  };
};
export const reconcileLayerSelection = (
  selection: LayerSelection,
  layers: readonly Pick<VisualLayerV3, "id" | "visible">[],
): LayerSelection => {
  const visible = new Set(layers.filter(({ visible }) => visible).map(({ id }) => id)),
    ids = selection.ids.filter((id, index) => visible.has(id) && selection.ids.indexOf(id) === index);
  if (selection.active && ids.includes(selection.active)) return { ids, active: selection.active };
  const activeIndex = selection.active ? selection.ids.indexOf(selection.active) : selection.ids.length,
    active =
      ids.find((id) => selection.ids.indexOf(id) >= activeIndex) ??
      [...ids].reverse().find((id) => selection.ids.indexOf(id) < activeIndex);
  return { ids, ...(active ? { active } : {}) };
};
export const reconcileGroupedLayerSelection = (
  selection: LayerSelection,
  layers: readonly VisualLayerV3[],
): LayerSelection => {
  const existing = new Map(layers.map((layer) => [layer.id, layer])),
    selected = selection.ids.flatMap((id) => existing.get(id) ?? []),
    visibleUnits = new Set(
      selected.filter(({ visible }) => visible).map((layer) => layer.groupId ?? `layer:${layer.id}`),
    ),
    seen = new Set<string>(),
    ids = selection.ids.flatMap((id) => {
      const layer = existing.get(id),
        unit = layer?.groupId ?? (layer ? `layer:${layer.id}` : "");
      if (!layer || !visibleUnits.has(unit) || seen.has(unit)) return [];
      seen.add(unit);
      return layer.groupId
        ? layers.filter(({ groupId }) => groupId === layer.groupId).map((member) => member.id)
        : [id];
    }),
    active = selection.active && ids.includes(selection.active) ? selection.active : ids.at(-1);
  return { ids, ...(active ? { active } : {}) };
};
export type VisualBoundsQ16 = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export const selectionVisualBoundsQ16 = (
  layers: readonly Pick<VisualLayerV3, "xQ16" | "yQ16" | "widthQ16" | "heightQ16" | "rotation">[],
): VisualBoundsQ16 | undefined => {
  if (!layers.length) return undefined;
  const bounds = layers.map(layerVisualBoundsQ16),
    x = Math.min(...bounds.map((value) => value.x)),
    y = Math.min(...bounds.map((value) => value.y)),
    right = Math.max(...bounds.map((value) => value.x + value.width)),
    bottom = Math.max(...bounds.map((value) => value.y + value.height));
  return { x, y, width: right - x, height: bottom - y };
};
export const translateLayersIntoDocumentQ16 = (
  layers: readonly VisualLayerV3[],
  documentSize: { width: number; height: number },
  desiredPixels: number,
): { xQ16: number; yQ16: number; inPlace: boolean } => {
  const bounds = selectionVisualBoundsQ16(layers);
  if (!bounds) return { xQ16: 0, yQ16: 0, inPlace: true };
  const documentWidth = documentSize.width * 65536,
    documentHeight = documentSize.height * 65536,
    desired = desiredPixels * 65536,
    axis = (start: number, size: number, limit: number) =>
      size <= limit ? Math.max(0, Math.min(limit - size, start + desired)) - start : -start,
    xQ16 = axis(bounds.x, bounds.width, documentWidth),
    yQ16 = axis(bounds.y, bounds.height, documentHeight);
  return { xQ16, yQ16, inPlace: xQ16 === 0 && yQ16 === 0 };
};
export const duplicateLayerOffsetQ16 = (
  layers: readonly VisualLayerV3[],
  documentSize: { width: number; height: number },
  pixels = 8,
) => {
  const bounds = selectionVisualBoundsQ16(layers);
  if (!bounds || bounds.width > documentSize.width * 65536 || bounds.height > documentSize.height * 65536)
    return { xQ16: 0, yQ16: 0, inPlace: true };
  const forward = translateLayersIntoDocumentQ16(layers, documentSize, pixels);
  return forward.inPlace ? translateLayersIntoDocumentQ16(layers, documentSize, -pixels) : forward;
};
export const pointerSelectionTranslationQ16 = (start: { x: number; y: number }, end: { x: number; y: number }) => ({
  xQ16: pointerDelta(end.x - start.x) * 65536,
  yQ16: pointerDelta(end.y - start.y) * 65536,
});
export const keyboardMoveDelta = (key: string, shiftKey = false, repeat = false): [number, number] | undefined => {
  if (repeat) return undefined;
  const delta = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }[key] as [number, number] | undefined;
  if (!delta) return undefined;
  const step = shiftKey ? 10 : 1;
  return [delta[0] * step, delta[1] * step];
};
export const translateLayerPositionsQ16 = (layers: readonly VisualLayerV3[], delta: { xQ16: number; yQ16: number }) =>
  layers.map((layer) => ({
    layerId: layer.id,
    xQ16: safeInteger(BigInt(layer.xQ16) + BigInt(delta.xQ16)),
    yQ16: safeInteger(BigInt(layer.yQ16) + BigInt(delta.yQ16)),
  }));
export const layerAtPoint = (
  layers: readonly VisualLayerV3[],
  point: { x: number; y: number },
  images: ReadonlyMap<string, NormalizedRgbaAssetV1> = new Map(),
): VisualLayerV3 | undefined =>
  [...layers].reverse().find((layer) => {
    if (!layer.visible || layer.opacity === 0) return false;
    const bounds = layerVisualBoundsQ16(layer),
      left = bounds.x / 65536,
      top = bounds.y / 65536,
      width = bounds.width / 65536,
      height = bounds.height / 65536;
    if (point.x < left || point.y < top || point.x > left + width || point.y > top + height) return false;
    if (isImageLayerV3(layer)) {
      const image = images.get(layer.asset.sha256);
      if (!image) return true;
      const sourcePixel = imageSourcePixelAtQ16V1(
        layer.crop,
        {
          x: layer.xQ16,
          y: layer.yQ16,
          width: layer.widthQ16,
          height: layer.heightQ16,
        },
        layer.rotation ?? 0,
        { x: Math.round(point.x * 65536), y: Math.round(point.y * 65536) },
      );
      return Boolean(sourcePixel && image.pixels[(sourcePixel.y * image.width + sourcePixel.x) * 4 + 3]);
    }
    if (isTextLayerV3(layer)) return true;
    const local = unrotatePointQ16V1(
      Math.round(point.x * 65536) - bounds.x,
      Math.round(point.y * 65536) - bounds.y,
      layer.widthQ16,
      layer.heightQ16,
      layer.rotation ?? 0,
    );
    return shapeContainsPixelCenterV1(
      layer.shape,
      local.x,
      local.y,
      layer.widthQ16,
      layer.heightQ16,
      layer.cornerRadiusQ16,
    );
  });
export const resizeHandleAtPoint = (
  layer: VisualLayerV3,
  point: { x: number; y: number },
  tolerance = 6,
): ResizeHandle | undefined => {
  const bounds = layerVisualBoundsQ16(layer),
    left = bounds.x / 65536,
    top = bounds.y / 65536,
    right = (bounds.x + bounds.width) / 65536,
    bottom = (bounds.y + bounds.height) / 65536,
    horizontal = Math.abs(point.x - left) <= tolerance ? "w" : Math.abs(point.x - right) <= tolerance ? "e" : "",
    vertical = Math.abs(point.y - top) <= tolerance ? "n" : Math.abs(point.y - bottom) <= tolerance ? "s" : "";
  if (horizontal && point.y >= top - tolerance && point.y <= bottom + tolerance)
    return `${vertical}${horizontal}` as ResizeHandle;
  if (vertical && point.x >= left - tolerance && point.x <= right + tolerance)
    return `${vertical}${horizontal}` as ResizeHandle;
  return undefined;
};
export const isResizeHandle = (layer: VisualLayerV3, point: { x: number; y: number }, tolerance = 6): boolean =>
  Boolean(resizeHandleAtPoint(layer, point, tolerance));
const layerGeometryFromVisualBounds = (
  layer: VisualLayerV3,
  bounds: { x: number; y: number; width: number; height: number },
) => {
  const odd = layer.rotation === 90 || layer.rotation === 270,
    widthQ16 = odd ? bounds.height : bounds.width,
    heightQ16 = odd ? bounds.width : bounds.height,
    zero = rotatedBoundsQ16V1({ x: 0, y: 0, width: widthQ16, height: heightQ16 }, layer.rotation ?? 0),
    xQ16 = Math.max(Number.MIN_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER - widthQ16, bounds.x - zero.x)),
    yQ16 = Math.max(Number.MIN_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER - heightQ16, bounds.y - zero.y));
  return { xQ16, yQ16, widthQ16, heightQ16 };
};
export const pointerTransformQ16 = (
  layer: VisualLayerV3,
  start: { x: number; y: number },
  end: { x: number; y: number },
  mode: TransformMode,
  handle: ResizeHandle = "se",
) => {
  if (mode === "move")
    return {
      ...pointerTranslationQ16(layer, start, end),
      widthQ16: layer.widthQ16,
      heightQ16: layer.heightQ16,
    };
  const bounds = layerVisualBoundsQ16(layer),
    oldLeft = BigInt(bounds.x),
    oldTop = BigInt(bounds.y),
    oldRight = oldLeft + BigInt(bounds.width),
    oldBottom = oldTop + BigInt(bounds.height),
    deltaX = BigInt(pointerDelta(end.x - start.x)) * 65536n,
    deltaY = BigInt(pointerDelta(end.y - start.y)) * 65536n,
    min = 65536n,
    max = BigInt(Number.MAX_SAFE_INTEGER),
    left = handle.includes("w")
      ? safeInteger([oldLeft + deltaX, oldRight - min, oldRight - max].sort((a, b) => (a < b ? -1 : 1))[1]!)
      : bounds.x,
    right = handle.includes("e")
      ? safeInteger([oldRight + deltaX, oldLeft + min, oldLeft + max].sort((a, b) => (a < b ? -1 : 1))[1]!)
      : bounds.x + bounds.width,
    top = handle.includes("n")
      ? safeInteger([oldTop + deltaY, oldBottom - min, oldBottom - max].sort((a, b) => (a < b ? -1 : 1))[1]!)
      : bounds.y,
    bottom = handle.includes("s")
      ? safeInteger([oldBottom + deltaY, oldTop + min, oldTop + max].sort((a, b) => (a < b ? -1 : 1))[1]!)
      : bounds.y + bounds.height;
  return layerGeometryFromVisualBounds(layer, {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  });
};

export type SnapGuide = {
  axis: "x" | "y";
  positionQ16: number;
  guideId?: string;
};
export type SnapResult = ReturnType<typeof pointerTransformQ16> & {
  guides: SnapGuide[];
};
type SnapCandidate = {
  delta: number;
  positionQ16: number;
  priority: number;
  guideId?: string;
};
const closestSnap = (deltas: SnapCandidate[], thresholdQ16: number) => {
  const eligible = deltas.filter(({ delta }) => Math.abs(delta) <= thresholdQ16);
  if (!eligible.length) return undefined;
  return eligible.sort(
    (left, right) =>
      left.priority - right.priority ||
      Math.abs(left.delta) - Math.abs(right.delta) ||
      left.positionQ16 - right.positionQ16 ||
      left.delta - right.delta,
  )[0];
};
const boundsCenters = (value: VisualBoundsQ16) => ({
  x: [value.x, Math.round(value.x + value.width / 2), value.x + value.width],
  y: [value.y, Math.round(value.y + value.height / 2), value.y + value.height],
});
export const snapSelectionTranslationQ16 = (
  selectedLayers: readonly VisualLayerV3[],
  delta: { xQ16: number; yQ16: number },
  layers: readonly VisualLayerV3[],
  documentSize: { width: number; height: number },
  options: {
    enabled: boolean;
    grid: 1 | 2 | 4 | 8;
    displayScale: number;
    thresholdPx?: number;
    guides?: readonly { id: string; axis: "x" | "y"; position: number }[];
  },
) => {
  const original = selectionVisualBoundsQ16(selectedLayers);
  if (!original || !options.enabled) return { ...delta, guides: [] as SnapGuide[] };
  const moving = boundsCenters({
      ...original,
      x: original.x + delta.xQ16,
      y: original.y + delta.yQ16,
    }),
    selectedIds = new Set(selectedLayers.map(({ id }) => id)),
    targets = layers
      .filter(({ id, visible }) => visible && !selectedIds.has(id))
      .map(layerVisualBoundsQ16)
      .map(boundsCenters),
    documentTargets = {
      x: [0, documentSize.width * 32768, documentSize.width * 65536],
      y: [0, documentSize.height * 32768, documentSize.height * 65536],
    },
    candidates = (axis: "x" | "y") => {
      const structural = moving[axis].flatMap((source) =>
          documentTargets[axis].map((positionQ16) => ({
            delta: positionQ16 - source,
            positionQ16,
            priority: 0,
          })),
        ),
        layerDeltas = targets.flatMap((target) =>
          moving[axis].flatMap((source) =>
            target[axis].map((positionQ16) => ({
              delta: positionQ16 - source,
              positionQ16,
              priority: 0,
            })),
          ),
        ),
        guideDeltas = (options.guides ?? [])
          .filter((guide) => guide.axis === axis)
          .flatMap((guide) =>
            moving[axis].map((source) => ({
              delta: guide.position * 65536 - source,
              positionQ16: guide.position * 65536,
              priority: 1,
              guideId: guide.id,
            })),
          ),
        gridQ16 = options.grid * 65536,
        gridTarget = Math.round(moving[axis][0]! / gridQ16) * gridQ16;
      return [
        ...structural,
        ...layerDeltas,
        ...guideDeltas,
        {
          delta: gridTarget - moving[axis][0]!,
          positionQ16: gridTarget,
          priority: 2,
        },
      ];
    },
    thresholdQ16 = Math.round(((options.thresholdPx ?? 5) * 65536) / options.displayScale),
    xSnap = closestSnap(candidates("x"), thresholdQ16),
    ySnap = closestSnap(candidates("y"), thresholdQ16),
    guides: SnapGuide[] = [];
  if (xSnap)
    guides.push({
      axis: "x",
      positionQ16: xSnap.positionQ16,
      ...(xSnap.guideId ? { guideId: xSnap.guideId } : {}),
    });
  if (ySnap)
    guides.push({
      axis: "y",
      positionQ16: ySnap.positionQ16,
      ...(ySnap.guideId ? { guideId: ySnap.guideId } : {}),
    });
  return {
    xQ16: delta.xQ16 + (xSnap?.delta ?? 0),
    yQ16: delta.yQ16 + (ySnap?.delta ?? 0),
    guides,
  };
};
export const snapLayerTransformQ16 = (
  layer: VisualLayerV3,
  transform: ReturnType<typeof pointerTransformQ16>,
  mode: TransformMode,
  layers: readonly VisualLayerV3[],
  documentSize: { width: number; height: number },
  options: {
    enabled: boolean;
    grid: 1 | 2 | 4 | 8;
    displayScale: number;
    thresholdPx?: number;
    guides?: readonly { id: string; axis: "x" | "y"; position: number }[];
  },
  handle: ResizeHandle = "se",
): SnapResult => {
  if (!options.enabled) return { ...transform, guides: [] };
  const candidate = { ...layer, ...transform },
    bounds = layerVisualBoundsQ16(candidate),
    centers = (value: { x: number; y: number; width: number; height: number }) => ({
      x: [value.x, Math.round(value.x + value.width / 2), value.x + value.width],
      y: [value.y, Math.round(value.y + value.height / 2), value.y + value.height],
    }),
    moving = centers(bounds),
    documentTargets = {
      x: [0, documentSize.width * 32768, documentSize.width * 65536],
      y: [0, documentSize.height * 32768, documentSize.height * 65536],
    },
    otherTargets = layers
      .filter((other) => other.id !== layer.id && other.visible)
      .map(layerVisualBoundsQ16)
      .map(centers),
    deltas = (axis: "x" | "y") => {
      const sourceIndexes =
          mode === "move"
            ? [0, 1, 2]
            : axis === "x"
              ? handle.includes("w")
                ? [0]
                : handle.includes("e")
                  ? [2]
                  : []
              : handle.includes("n")
                ? [0]
                : handle.includes("s")
                  ? [2]
                  : [],
        sources = sourceIndexes.map((index) => moving[axis][index]!),
        structural = sources.flatMap((source) =>
          documentTargets[axis].map((positionQ16) => ({
            delta: positionQ16 - source,
            positionQ16,
            priority: 0,
          })),
        ),
        layerDeltas = otherTargets.flatMap((target) =>
          sources.flatMap((source) =>
            target[axis].map((positionQ16) => ({
              delta: positionQ16 - source,
              positionQ16,
              priority: 0,
            })),
          ),
        ),
        guideDeltas = (options.guides ?? [])
          .filter((guide) => guide.axis === axis)
          .flatMap((guide) =>
            sources.map((source) => ({
              delta: guide.position * 65536 - source,
              positionQ16: guide.position * 65536,
              priority: 1,
              guideId: guide.id,
            })),
          ),
        gridQ16 = options.grid * 65536,
        gridSource = sources[0],
        gridTarget = gridSource === undefined ? undefined : Math.round(gridSource / gridQ16) * gridQ16;
      return [
        ...structural,
        ...layerDeltas,
        ...guideDeltas,
        ...(gridSource === undefined
          ? []
          : [
              {
                delta: gridTarget! - gridSource,
                positionQ16: gridTarget!,
                priority: 2,
              },
            ]),
      ];
    },
    thresholdQ16 = Math.round(((options.thresholdPx ?? 5) * 65536) / options.displayScale),
    xSnap = closestSnap(deltas("x"), thresholdQ16),
    ySnap = closestSnap(deltas("y"), thresholdQ16),
    guides: SnapGuide[] = [];
  if (xSnap)
    guides.push({
      axis: "x",
      positionQ16: xSnap.positionQ16,
      ...(xSnap.guideId ? { guideId: xSnap.guideId } : {}),
    });
  if (ySnap)
    guides.push({
      axis: "y",
      positionQ16: ySnap.positionQ16,
      ...(ySnap.guideId ? { guideId: ySnap.guideId } : {}),
    });
  if (mode === "move")
    return {
      ...transform,
      xQ16: transform.xQ16 + (xSnap?.delta ?? 0),
      yQ16: transform.yQ16 + (ySnap?.delta ?? 0),
      guides,
    };
  const left = bounds.x + (handle.includes("w") ? (xSnap?.delta ?? 0) : 0),
    top = bounds.y + (handle.includes("n") ? (ySnap?.delta ?? 0) : 0),
    right = bounds.x + bounds.width + (handle.includes("e") ? (xSnap?.delta ?? 0) : 0),
    bottom = bounds.y + bounds.height + (handle.includes("s") ? (ySnap?.delta ?? 0) : 0);
  return {
    ...layerGeometryFromVisualBounds(layer, {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    }),
    guides,
  };
};

export type LayerAlignment = "left" | "horizontal-center" | "right" | "top" | "vertical-center" | "bottom";
export const alignLayerToDocumentQ16 = (
  layer: VisualLayerV3,
  documentSize: { width: number; height: number },
  alignment: LayerAlignment,
) => {
  const bounds = layerVisualBoundsQ16(layer),
    documentWidth = documentSize.width * 65536,
    documentHeight = documentSize.height * 65536,
    deltaX =
      alignment === "left"
        ? -bounds.x
        : alignment === "right"
          ? documentWidth - bounds.x - bounds.width
          : alignment === "horizontal-center"
            ? Math.round((documentWidth - bounds.width) / 2) - bounds.x
            : 0,
    deltaY =
      alignment === "top"
        ? -bounds.y
        : alignment === "bottom"
          ? documentHeight - bounds.y - bounds.height
          : alignment === "vertical-center"
            ? Math.round((documentHeight - bounds.height) / 2) - bounds.y
            : 0;
  return { xQ16: layer.xQ16 + deltaX, yQ16: layer.yQ16 + deltaY };
};
export const alignLayerSelectionQ16 = (layers: readonly VisualLayerV3[], alignment: LayerAlignment) => {
  const aggregate = selectionVisualBoundsQ16(layers);
  if (!aggregate) return [];
  const units = [...new Set(layers.map((layer) => layer.groupId ?? `layer:${layer.id}`))].map((id) => {
    const members = layers.filter((layer) => (layer.groupId ?? `layer:${layer.id}`) === id);
    return { members, bounds: selectionVisualBoundsQ16(members)! };
  });
  return units.flatMap(({ members, bounds }) => {
    const deltaX =
        alignment === "left"
          ? aggregate.x - bounds.x
          : alignment === "right"
            ? aggregate.x + aggregate.width - bounds.x - bounds.width
            : alignment === "horizontal-center"
              ? Math.round(aggregate.x + aggregate.width / 2 - bounds.x - bounds.width / 2)
              : 0,
      deltaY =
        alignment === "top"
          ? aggregate.y - bounds.y
          : alignment === "bottom"
            ? aggregate.y + aggregate.height - bounds.y - bounds.height
            : alignment === "vertical-center"
              ? Math.round(aggregate.y + aggregate.height / 2 - bounds.y - bounds.height / 2)
              : 0;
    return members.map((layer) => ({
      layerId: layer.id,
      xQ16: safeInteger(BigInt(layer.xQ16) + BigInt(deltaX)),
      yQ16: safeInteger(BigInt(layer.yQ16) + BigInt(deltaY)),
    }));
  });
};
export const distributeLayerSelectionQ16 = (layers: readonly VisualLayerV3[], axis: "horizontal" | "vertical") => {
  const units = [...new Set(layers.map((layer) => layer.groupId ?? `layer:${layer.id}`))].map((id) => {
    const members = layers.filter((layer) => (layer.groupId ?? `layer:${layer.id}`) === id);
    return { id, members, bounds: selectionVisualBoundsQ16(members)! };
  });
  if (units.length < 3) return [];
  const entries = units.sort((left, right) => {
      const start = axis === "horizontal" ? "x" : "y";
      return left.bounds[start] - right.bounds[start] || left.id.localeCompare(right.id);
    }),
    start = axis === "horizontal" ? "x" : "y",
    size = axis === "horizontal" ? "width" : "height",
    span = entries.at(-1)!.bounds[start] + entries.at(-1)!.bounds[size] - entries[0]!.bounds[start],
    content = entries.reduce((total, entry) => total + entry.bounds[size], 0),
    available = span - content;
  if (available < 0) return [];
  const count = entries.length - 1,
    gap = Math.floor(available / count),
    remainder = available % count;
  let cursor = entries[0]!.bounds[start],
    changed = false;
  const positions = entries.flatMap(({ members, bounds }, index) => {
    const delta = cursor - bounds[start];
    changed ||= delta !== 0;
    cursor += bounds[size] + gap + (index < remainder ? 1 : 0);
    return members.map((layer) => ({
      layerId: layer.id,
      xQ16: safeInteger(BigInt(layer.xQ16) + BigInt(axis === "horizontal" ? delta : 0)),
      yQ16: safeInteger(BigInt(layer.yQ16) + BigInt(axis === "vertical" ? delta : 0)),
    }));
  });
  return changed ? positions : [];
};
export type CropHandle = ResizeHandle;
const roundRatio = (numerator: bigint, denominator: bigint): bigint =>
  numerator < 0n ? -((-numerator + denominator / 2n) / denominator) : (numerator + denominator / 2n) / denominator;
const destinationDelta = (
  sourceDelta: number,
  destinationQ16: number,
  sourceSize: number,
  lower: number,
  upper: number,
): number =>
  Math.max(
    lower,
    Math.min(upper, safeInteger(roundRatio(BigInt(sourceDelta) * BigInt(destinationQ16), BigInt(sourceSize)))),
  );
export const cropHandleAtPoint = (
  layer: VisualLayerV3,
  point: { x: number; y: number },
  tolerance = 6,
): CropHandle | undefined => {
  if (!isImageLayerV3(layer)) return undefined;
  const bounds = layerVisualBoundsQ16(layer),
    left = bounds.x / 65536,
    top = bounds.y / 65536,
    right = (bounds.x + bounds.width) / 65536,
    bottom = (bounds.y + bounds.height) / 65536,
    horizontal = Math.abs(point.x - left) <= tolerance ? "w" : Math.abs(point.x - right) <= tolerance ? "e" : "",
    vertical = Math.abs(point.y - top) <= tolerance ? "n" : Math.abs(point.y - bottom) <= tolerance ? "s" : "";
  if (horizontal && point.y >= top - tolerance && point.y <= bottom + tolerance)
    return `${vertical}${horizontal}` as CropHandle;
  if (vertical && point.x >= left - tolerance && point.x <= right + tolerance)
    return `${vertical}${horizontal}` as CropHandle;
  return undefined;
};
export const pointerCrop = (
  layer: ImageLayerV3,
  start: { x: number; y: number },
  end: { x: number; y: number },
  handle: CropHandle,
) => {
  const visualHorizontal = pointerDelta(end.x - start.x),
    visualVertical = pointerDelta(end.y - start.y),
    rotation = layer.rotation ?? 0,
    horizontal =
      rotation === 90
        ? visualVertical
        : rotation === 180
          ? -visualHorizontal
          : rotation === 270
            ? -visualVertical
            : visualHorizontal,
    vertical =
      rotation === 90
        ? -visualHorizontal
        : rotation === 180
          ? -visualVertical
          : rotation === 270
            ? visualHorizontal
            : visualVertical,
    directions = [...handle].map((direction) =>
      rotation === 90
        ? ({ n: "w", e: "n", s: "e", w: "s" } as const)[direction as "n" | "e" | "s" | "w"]
        : rotation === 180
          ? ({ n: "s", e: "w", s: "n", w: "e" } as const)[direction as "n" | "e" | "s" | "w"]
          : rotation === 270
            ? ({ n: "e", e: "s", s: "w", w: "n" } as const)[direction as "n" | "e" | "s" | "w"]
            : direction,
    ),
    localHandle =
      `${directions.includes("n") ? "n" : directions.includes("s") ? "s" : ""}${directions.includes("w") ? "w" : directions.includes("e") ? "e" : ""}` as CropHandle,
    widthQ16 = Math.max(65536, layer.widthQ16),
    heightQ16 = Math.max(65536, layer.heightQ16),
    sourceDeltaX = safeInteger(roundRatio(BigInt(horizontal) * BigInt(layer.crop.width) * 65536n, BigInt(widthQ16))),
    sourceDeltaY = safeInteger(roundRatio(BigInt(vertical) * BigInt(layer.crop.height) * 65536n, BigInt(heightQ16))),
    sourceX = localHandle.includes("w")
      ? Math.max(-layer.crop.x, Math.min(layer.crop.width - 1, sourceDeltaX))
      : localHandle.includes("e")
        ? Math.max(-(layer.crop.width - 1), Math.min(layer.width - layer.crop.x - layer.crop.width, sourceDeltaX))
        : 0,
    sourceY = localHandle.includes("n")
      ? Math.max(-layer.crop.y, Math.min(layer.crop.height - 1, sourceDeltaY))
      : localHandle.includes("s")
        ? Math.max(-(layer.crop.height - 1), Math.min(layer.height - layer.crop.y - layer.crop.height, sourceDeltaY))
        : 0,
    destinationX = localHandle.includes("w")
      ? destinationDelta(
          sourceX,
          widthQ16,
          layer.crop.width,
          Math.max(Number.MIN_SAFE_INTEGER - layer.xQ16, widthQ16 - Number.MAX_SAFE_INTEGER),
          widthQ16 - 65536,
        )
      : localHandle.includes("e")
        ? destinationDelta(sourceX, widthQ16, layer.crop.width, 65536 - widthQ16, Number.MAX_SAFE_INTEGER - widthQ16)
        : 0,
    destinationY = localHandle.includes("n")
      ? destinationDelta(
          sourceY,
          heightQ16,
          layer.crop.height,
          Math.max(Number.MIN_SAFE_INTEGER - layer.yQ16, heightQ16 - Number.MAX_SAFE_INTEGER),
          heightQ16 - 65536,
        )
      : localHandle.includes("s")
        ? destinationDelta(
            sourceY,
            heightQ16,
            layer.crop.height,
            65536 - heightQ16,
            Number.MAX_SAFE_INTEGER - heightQ16,
          )
        : 0;
  return {
    xQ16: layer.xQ16 + (localHandle.includes("w") ? destinationX : 0),
    yQ16: layer.yQ16 + (localHandle.includes("n") ? destinationY : 0),
    widthQ16: widthQ16 + (localHandle.includes("e") ? destinationX : localHandle.includes("w") ? -destinationX : 0),
    heightQ16: heightQ16 + (localHandle.includes("s") ? destinationY : localHandle.includes("n") ? -destinationY : 0),
    crop: {
      x: layer.crop.x + (localHandle.includes("w") ? sourceX : 0),
      y: layer.crop.y + (localHandle.includes("n") ? sourceY : 0),
      width: layer.crop.width + (localHandle.includes("e") ? sourceX : localHandle.includes("w") ? -sourceX : 0),
      height: layer.crop.height + (localHandle.includes("s") ? sourceY : localHandle.includes("n") ? -sourceY : 0),
    },
  };
};
export const fitImageToArtboard = (
  width: number,
  height: number,
  artboard: { width: number; height: number } = SURFACE_SIZE,
) => {
  const scale = Math.min(1, artboard.width / width, artboard.height / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};
export const firstPngFile = (
  files: readonly File[],
  items: readonly Pick<DataTransferItem, "type" | "getAsFile">[] = [],
): File | undefined =>
  files.find((file) => file.type === "image/png" || file.name.toLowerCase().endsWith(".png")) ??
  items.find((item) => item.type === "image/png")?.getAsFile() ??
  undefined;
export const focusAfterLayerRemoval = (ids: readonly string[], removed: string): string | undefined => {
  const index = ids.indexOf(removed);
  return index < 0 ? undefined : (ids[index + 1] ?? ids[index - 1]);
};

type SurfaceContext = Pick<
  CanvasRenderingContext2D,
  | "beginPath"
  | "clearRect"
  | "fillRect"
  | "fillStyle"
  | "globalAlpha"
  | "imageSmoothingEnabled"
  | "lineTo"
  | "lineWidth"
  | "moveTo"
  | "drawImage"
  | "stroke"
  | "strokeRect"
  | "strokeStyle"
> & { putImageData?: CanvasRenderingContext2D["putImageData"] };

export function paintWorkspaceSurface(
  context: SurfaceContext,
  palette: { background: string; accent: string } | undefined,
  grid: boolean,
  surface?: WorkspaceSurface,
  transient?:
    | {
        id: string;
        xQ16: number;
        yQ16: number;
        widthQ16?: number;
        heightQ16?: number;
        crop?: LayerV2["crop"];
      }
    | readonly {
        id: string;
        xQ16: number;
        yQ16: number;
        widthQ16?: number;
        heightQ16?: number;
        crop?: LayerV2["crop"];
      }[],
  images: ReadonlyMap<string, NormalizedRgbaAssetV1> = new Map(),
  _selected: readonly string[] = [],
  size: { width: number; height: number } = SURFACE_SIZE,
  _cropMode = false,
  guides: readonly SnapGuide[] = [],
  _lockedSelected: readonly string[] = [],
): void {
  void _selected;
  void _cropMode;
  void _lockedSelected;
  context.clearRect(0, 0, size.width, size.height);
  context.imageSmoothingEnabled = false;
  if (palette) {
    context.fillStyle = palette.background;
    context.fillRect(0, 0, size.width, size.height);
    context.fillStyle = palette.accent;
    context.fillRect(0, 0, SURFACE_SIZE.width, 3);
    context.fillRect(0, size.height - 3, size.width, 3);
  }
  const transients = Array.isArray(transient) ? transient : transient ? [transient] : [];
  const plannedLayers = (surface?.layers ?? []).map((layer) => {
    const layerTransient = transients.find(({ id }) => id === layer.id);
    const destination = layerTransient
      ? {
          ...layer.destinationQ16,
          x: layerTransient.xQ16,
          y: layerTransient.yQ16,
          width: layerTransient.widthQ16 ?? layer.destinationQ16.width,
          height: layerTransient.heightQ16 ?? layer.destinationQ16.height,
        }
      : layer.destinationQ16;
    return {
      ...layer,
      destinationQ16: destination,
      ...(layer.kind === "shape" && layer.cornerRadiusQ16 !== undefined
        ? {
            cornerRadiusQ16: Math.min(
              layer.cornerRadiusQ16,
              Math.floor(Math.min(destination.width, destination.height) / 2),
            ),
          }
        : {}),
      ...(layerTransient?.crop && (layer.kind === "image" || layer.kind === undefined)
        ? { source: layerTransient.crop }
        : {}),
    };
  });
  if (surface && context.putImageData) {
    const pixels = compositeCustomLayersV1(size.width, size.height, plannedLayers, [...images.values()]);
    context.putImageData(new ImageData(new Uint8ClampedArray(pixels), size.width, size.height), 0, 0);
  }
  for (const layer of surface && context.putImageData ? [] : (surface?.layers ?? [])) {
    const layerTransient = transients.find(({ id }) => id === layer.id);
    const destination = layerTransient
      ? {
          ...layer.destinationQ16,
          x: layerTransient.xQ16,
          y: layerTransient.yQ16,
          width: layerTransient.widthQ16 ?? layer.destinationQ16.width,
          height: layerTransient.heightQ16 ?? layer.destinationQ16.height,
        }
      : layer.destinationQ16;
    context.globalAlpha = layer.opacity / 65536;
    const image = layer.kind === "image" || layer.kind === undefined ? images.get(layer.asset.sha256) : undefined;
    if (image && (layer.kind === "image" || layer.kind === undefined)) continue;
    else if (layer.kind === "shape") {
      context.fillStyle = layer.fill;
      const bounds = rotatedBoundsQ16V1(destination, layer.rotation ?? 0);
      for (let y = 0; y < size.height; y += 1)
        for (let x = 0; x < size.width; x += 1) {
          const local = unrotatePointQ16V1(
              x * 65536 + 32768 - bounds.x,
              y * 65536 + 32768 - bounds.y,
              destination.width,
              destination.height,
              layer.rotation ?? 0,
            ),
            relativeX = local.x,
            relativeY = local.y;
          if (
            shapeContainsPixelCenterV1(
              layer.shape,
              relativeX,
              relativeY,
              destination.width,
              destination.height,
              layer.cornerRadiusQ16,
            )
          )
            context.fillRect(x, y, 1, 1);
        }
    } else if (layer.kind === "text") {
      context.fillStyle = layer.fill;
      const bounds = rotatedBoundsQ16V1(destination, layer.rotation ?? 0);
      for (let y = 0; y < size.height; y += 1)
        for (let x = 0; x < size.width; x += 1) {
          const local = unrotatePointQ16V1(
              x * 65536 + 32768 - bounds.x,
              y * 65536 + 32768 - bounds.y,
              destination.width,
              destination.height,
              layer.rotation ?? 0,
            ),
            relativeX = local.x,
            relativeY = local.y;
          if (
            textLayerContainsPixelCenterV1(
              layer.content,
              layer.scale,
              layer.alignment,
              relativeX,
              relativeY,
              destination.width,
              destination.height,
            )
          )
            context.fillRect(x, y, 1, 1);
        }
    } else
      context.fillRect(
        destination.x / 65536,
        destination.y / 65536,
        destination.width / 65536,
        destination.height / 65536,
      );
  }
  context.globalAlpha = 1;
  if (grid) {
    context.beginPath();
    context.strokeStyle = "rgba(255, 255, 255, 0.18)";
    context.lineWidth = 1;
    for (let x = 16.5; x < size.width; x += 16) {
      context.moveTo(x, 0);
      context.lineTo(x, size.height);
    }
    for (let y = 16.5; y < size.height; y += 16) {
      context.moveTo(0, y);
      context.lineTo(size.width, y);
    }
    context.stroke();
  }
  for (const guide of guides) {
    context.beginPath();
    context.strokeStyle = "#ff4fa3";
    context.lineWidth = 1;
    if (guide.axis === "x") {
      const x = guide.positionQ16 / 65536 + 0.5;
      context.moveTo(x, 0);
      context.lineTo(x, size.height);
    } else {
      const y = guide.positionQ16 / 65536 + 0.5;
      context.moveTo(0, y);
      context.lineTo(size.width, y);
    }
    context.stroke();
  }
}
