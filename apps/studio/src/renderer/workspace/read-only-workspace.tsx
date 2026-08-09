import { useEffect, useRef, useState } from "react";
import {
  CUSTOM_VISUAL_DOCUMENTS_V1,
  CUSTOM_VISUAL_ROLES_V1,
  validTextContentV1,
  type CustomVisualRoleV1,
  type CustomVisualSourceV1,
} from "../../../../../packages/dspico-contract/src/index.js";
import type {
  LayerV2,
  ShapeLayerV3,
  TextLayerV3,
  DocumentGuideV3,
  VisualDocumentOperationV3,
  VisualLayerV3,
  ThemeProjectV2,
  VisualDocumentV3,
} from "../../../../../packages/theme-core/src/index.js";
import type { ImportedPngV1 } from "../../png-import.js";
import { shortcutTitle } from "../shortcuts.js";
import {
  MAX_BATCH_LAYER_EDITS_V3,
  MAX_DOCUMENT_GUIDES_V3,
  MAX_DOCUMENT_LAYERS_V3,
} from "../../../../../packages/theme-core/src/limits-v3.js";
import {
  fitImageToArtboard,
  fitViewport,
  firstPngFile,
  gestureAuthorityKey,
  freezeLayerClipboardSnapshot,
  clipboardMediaIsReachable,
  allocateCanonicalLayerId,
  alignLayerSelectionQ16,
  alignLayerToDocumentQ16,
  cropHandleAtPoint,
  keyboardMoveDelta,
  layerAtPoint,
  layerVisualBoundsQ16,
  paintWorkspaceSurface,
  panViewport,
  pointerTransformQ16,
  pointerSelectionTranslationQ16,
  resizeHandleAtPoint,
  resolveGuideDrop,
  RESIZE_HANDLES,
  rulerTicks,
  snapLayerTransformQ16,
  snapSelectionTranslationQ16,
  distributeLayerSelectionQ16,
  duplicateLayerOffsetQ16,
  layerSelectionUnitCount,
  layerAndGroupIds,
  layerShortcut,
  isLayerEditingTarget,
  shouldHandleLayerPaste,
  reorderLayerBlock,
  rotateLayerSelectionQuarterTurn,
  reconcileGroupedLayerSelection,
  translateLayerPositionsQ16,
  transitionDeletionSelection,
  transitionInsertionSelection,
  translateLayersIntoDocumentQ16,
  updateGroupedLayerSelection,
  pointerCrop,
  visualDocumentSurface,
  type CropHandle,
  type WorkspaceSurface,
  type DocumentViewport,
  type LayerAlignment,
  type SnapGuide,
  type ResizeHandle,
  type LayerSelection,
  type LayerClipboardSnapshot,
  type EphemeralDeletionSelection,
  type EphemeralInsertionSelection,
  zoomViewportAtPoint,
  normalizeViewport,
} from "./workspace-model.js";

const isShapeLayerV3 = (layer: VisualLayerV3 | undefined): layer is ShapeLayerV3 => layer?.kind === "shape";
const isTextLayerV3 = (layer: VisualLayerV3 | undefined): layer is TextLayerV3 => layer?.kind === "text";
const isImageLayerV3 = (layer: VisualLayerV3 | undefined): layer is LayerV2 =>
  Boolean(layer && !isShapeLayerV3(layer) && !isTextLayerV3(layer));
const layerLockedV3 = (layer: Pick<VisualLayerV3, "locked">): boolean => layer.locked ?? false;
const LOCKED_EDIT_EXPLANATION = "Locked layers cannot be edited, but visibility may still be toggled.";

type Screen = "top" | "bottom";
type Commit = (operation: VisualDocumentOperationV3, announcement: string) => void;
type PropertyKey = "x" | "y" | "width" | "height" | "cropX" | "cropY" | "cropWidth" | "cropHeight" | "opacity";
const propertyFields: readonly {
  key: PropertyKey;
  label: string;
  min?: number;
  max?: number;
}[] = [
  { key: "x", label: "X" },
  { key: "y", label: "Y" },
  { key: "width", label: "Width", min: 1 },
  { key: "height", label: "Height", min: 1 },
  { key: "cropX", label: "Crop x", min: 0 },
  { key: "cropY", label: "Crop y", min: 0 },
  { key: "cropWidth", label: "Crop width", min: 1 },
  { key: "cropHeight", label: "Crop height", min: 1 },
  { key: "opacity", label: "Opacity", min: 0, max: 100 },
] as const;
const propertyDraft = (layer: VisualLayerV3): Record<PropertyKey, string> => ({
  x: String(layer.xQ16 / 65536),
  y: String(layer.yQ16 / 65536),
  width: String(layer.widthQ16 / 65536),
  height: String(layer.heightQ16 / 65536),
  cropX: String(isImageLayerV3(layer) ? layer.crop.x : 0),
  cropY: String(isImageLayerV3(layer) ? layer.crop.y : 0),
  cropWidth: String(isImageLayerV3(layer) ? layer.crop.width : 1),
  cropHeight: String(isImageLayerV3(layer) ? layer.crop.height : 1),
  opacity: String(Math.round((layer.opacity * 100) / 65536)),
});
function LayerInspector({
  layer,
  selectedLayers,
  screen,
  commit,
  announce,
  documentSize,
}: {
  layer: VisualLayerV3;
  selectedLayers: VisualLayerV3[];
  screen: Screen;
  commit: Commit;
  announce(message: string): void;
  documentSize: { width: number; height: number };
}) {
  const [name, setName] = useState(layer.name);
  const locked = selectedLayers.some(layerLockedV3);
  const [draft, setDraft] = useState(() => propertyDraft(layer));
  const [fill, setFill] = useState(isShapeLayerV3(layer) ? layer.fill : "#000000");
  const [text, setText] = useState(() =>
    isTextLayerV3(layer)
      ? {
          content: layer.content,
          fill: layer.fill,
          scale: String(layer.scale),
          alignment: layer.alignment,
        }
      : {
          content: "",
          fill: "#ffffff",
          scale: "1",
          alignment: "left" as const,
        },
  );
  useEffect(() => {
    setName(layer.name);
    setDraft(propertyDraft(layer));
    setFill(isShapeLayerV3(layer) ? layer.fill : "#000000");
    setText(
      isTextLayerV3(layer)
        ? {
            content: layer.content,
            fill: layer.fill,
            scale: String(layer.scale),
            alignment: layer.alignment,
          }
        : { content: "", fill: "#ffffff", scale: "1", alignment: "left" },
    );
  }, [layer]);
  const rename = () => {
    const next = name.trim();
    if (!next || next === layer.name) return setName(layer.name);
    commit(
      {
        version: 2,
        type: "rename-layer",
        screen,
        layerId: layer.id,
        name: next,
      },
      `${layer.name} renamed to ${next}.`,
    );
  };
  const rotate = (rotation: 0 | 90 | 180 | 270) =>
    commit(
      selectedLayers.length === 1
        ? {
            version: 3,
            type: "set-layer-rotation",
            layerId: layer.id,
            rotation,
          }
        : {
            version: 3,
            type: "set-layer-rotations",
            rotations: selectedLayers.map(({ id }) => ({
              layerId: id,
              rotation,
            })),
          },
      selectedLayers.length === 1
        ? `${layer.name} rotated to ${rotation} degrees.`
        : `${selectedLayers.length} layers rotated to ${rotation} degrees.`,
    );
  const rotateBy = (delta: -90 | 90) => {
    const rotations = rotateLayerSelectionQuarterTurn(selectedLayers, delta);
    commit(
      rotations.length === 1
        ? { version: 3, type: "set-layer-rotation", ...rotations[0]! }
        : { version: 3, type: "set-layer-rotations", rotations },
      rotations.length === 1
        ? `${layer.name} rotated to ${rotations[0]!.rotation} degrees.`
        : `${selectedLayers.length} layers rotated ${delta < 0 ? "left" : "right"}.`,
    );
  };
  const align = (alignment: LayerAlignment) => {
    if (selectedLayers.length > 1) {
      const positions = alignLayerSelectionQ16(selectedLayers, alignment),
        changed = positions.some((position) => {
          const current = selectedLayers.find(({ id }) => id === position.layerId)!;
          return position.xQ16 !== current.xQ16 || position.yQ16 !== current.yQ16;
        });
      if (!changed) return announce(`Selection is already aligned ${alignment.replace("-", " ")}.`);
      commit(
        { version: 3, type: "set-layer-positions", positions },
        `${selectedLayers.length} layers aligned ${alignment.replace("-", " ")} within the selection.`,
      );
      return;
    }
    const position = alignLayerToDocumentQ16(layer, documentSize, alignment);
    if (position.xQ16 === layer.xQ16 && position.yQ16 === layer.yQ16) {
      announce(`${layer.name} is already aligned ${alignment.replace("-", " ")}.`);
      return;
    }
    commit(
      {
        version: 2,
        type: "move-layer",
        screen,
        layerId: layer.id,
        ...position,
      },
      `${layer.name} aligned ${alignment.replace("-", " ")} at ${position.xQ16 / 65536}, ${position.yQ16 / 65536}.`,
    );
  };
  const distribute = (axis: "horizontal" | "vertical") => {
    const positions = distributeLayerSelectionQ16(selectedLayers, axis);
    if (!positions.length) {
      announce(
        layerSelectionUnitCount(selectedLayers) < 3
          ? `Select at least 3 layers to distribute ${axis} spacing.`
          : `The selection cannot be distributed ${axis}ly without overlap, or already has equal spacing.`,
      );
      return;
    }
    commit(
      { version: 3, type: "set-layer-positions", positions },
      `${selectedLayers.length} layers distributed with equal ${axis} spacing.`,
    );
  };
  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Object.fromEntries(Object.entries(draft).map(([key, entry]) => [key, Number(entry)])) as Record<
      PropertyKey,
      number
    >;
    const valid =
      Object.values(value).every(Number.isSafeInteger) &&
      value.width > 0 &&
      value.height > 0 &&
      (!isImageLayerV3(layer) ||
        (value.cropX >= 0 &&
          value.cropY >= 0 &&
          value.cropWidth > 0 &&
          value.cropHeight > 0 &&
          value.cropX + value.cropWidth <= layer.width &&
          value.cropY + value.cropHeight <= layer.height)) &&
      value.opacity >= 0 &&
      value.opacity <= 100;
    if (!valid) return announce(`${layer.name} properties are outside valid bounds.`);
    commit(
      {
        version: 2,
        type: "set-layer-properties",
        screen,
        layerId: layer.id,
        xQ16: value.x * 65536,
        yQ16: value.y * 65536,
        widthQ16: value.width * 65536,
        heightQ16: value.height * 65536,
        opacity: Math.round((value.opacity * 65536) / 100),
        crop: {
          x: value.cropX,
          y: value.cropY,
          width: value.cropWidth,
          height: value.cropHeight,
        },
      },
      `${layer.name} properties updated.`,
    );
  };
  return (
    <aside className="layer-inspector" aria-labelledby="layer-inspector-title">
      <div className="editor-panel-heading">
        <span>Inspector</span>
        <strong id="layer-inspector-title">{layer.name}</strong>
      </div>
      {locked && <p className="locked-explanation">{LOCKED_EDIT_EXPLANATION}</p>}
      <form onSubmit={apply}>
        <fieldset className="layer-inspector-fields" disabled={locked}>
          <label className="layer-name-field">
            <span>Name</span>
            <input
              aria-label={`Rename ${layer.name}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={rename}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  rename();
                }
              }}
            />
          </label>
          {propertyFields
            .filter(({ key }) => isImageLayerV3(layer) || !key.startsWith("crop"))
            .map(({ key, label, min, max }) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  type="number"
                  aria-label={label}
                  required
                  step="1"
                  min={min}
                  max={max}
                  value={draft[key]}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          <fieldset className="rotation-controls">
            <legend>Rotation</legend>
            <button type="button" aria-label={`Rotate ${layer.name} left`} onClick={() => rotateBy(-90)}>
              Rotate left
            </button>
            <select
              aria-label="Layer rotation"
              value={layer.rotation ?? 0}
              onChange={(event) => rotate(Number(event.target.value) as 0 | 90 | 180 | 270)}
            >
              <option value="0">0°</option>
              <option value="90">90°</option>
              <option value="180">180°</option>
              <option value="270">270°</option>
            </select>
            <button type="button" aria-label={`Rotate ${layer.name} right`} onClick={() => rotateBy(90)}>
              Rotate right
            </button>
          </fieldset>
          <fieldset className="alignment-controls">
            <legend>{selectedLayers.length > 1 ? "Align within selection" : "Align to document"}</legend>
            {(["left", "horizontal-center", "right", "top", "vertical-center", "bottom"] as const).map((alignment) => (
              <button
                key={alignment}
                type="button"
                aria-label={`Align ${selectedLayers.length > 1 ? `${selectedLayers.length} selected layers` : layer.name} ${alignment.replace("-", " ")} ${selectedLayers.length > 1 ? "within selection" : "to document"}`}
                onClick={() => align(alignment)}
              >
                {alignment.replace("horizontal-", "H ").replace("vertical-", "V ")}
              </button>
            ))}
          </fieldset>
          <fieldset className="distribution-controls">
            <legend>Equal spacing</legend>
            <button
              type="button"
              aria-label="Distribute selected layers with equal horizontal spacing"
              disabled={layerSelectionUnitCount(selectedLayers) < 3}
              onClick={() => distribute("horizontal")}
            >
              Horizontal
            </button>
            <button
              type="button"
              aria-label="Distribute selected layers with equal vertical spacing"
              disabled={layerSelectionUnitCount(selectedLayers) < 3}
              onClick={() => distribute("vertical")}
            >
              Vertical
            </button>
          </fieldset>
          {isShapeLayerV3(layer) && (
            <label className="shape-fill-field">
              <span>Fill</span>
              <span>
                <input
                  type="color"
                  aria-label="Fill color picker"
                  value={fill}
                  onChange={(event) => {
                    setFill(event.target.value);
                    commit(
                      {
                        version: 3,
                        type: "set-shape-fill",
                        layerId: layer.id,
                        fill: event.target.value,
                      },
                      `${layer.name} fill updated.`,
                    );
                  }}
                />
                <input
                  aria-label="Fill color hex"
                  pattern="#[0-9a-f]{6}"
                  value={fill}
                  onChange={(event) => setFill(event.target.value)}
                  onBlur={(event) => {
                    const fill = event.currentTarget.value;
                    if (/^#[0-9a-f]{6}$/.test(fill) && fill !== layer.fill)
                      commit(
                        {
                          version: 3,
                          type: "set-shape-fill",
                          layerId: layer.id,
                          fill,
                        },
                        `${layer.name} fill updated.`,
                      );
                    else setFill(layer.fill);
                  }}
                />
              </span>
            </label>
          )}
          {isTextLayerV3(layer) && (
            <>
              <label className="text-content-field">
                <span>Content</span>
                <textarea
                  aria-label="Text content"
                  rows={4}
                  maxLength={512}
                  value={text.content}
                  onChange={(event) =>
                    setText((current) => ({
                      ...current,
                      content: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="text-fill-field">
                <span>Text color</span>
                <input
                  aria-label="Text color hex"
                  pattern="#[0-9a-f]{6}"
                  value={text.fill}
                  onChange={(event) =>
                    setText((current) => ({
                      ...current,
                      fill: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Pixel size</span>
                <input
                  type="number"
                  aria-label="Text pixel size"
                  required
                  min="1"
                  max="16"
                  step="1"
                  value={text.scale}
                  onChange={(event) =>
                    setText((current) => ({
                      ...current,
                      scale: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Alignment</span>
                <select
                  aria-label="Text alignment"
                  value={text.alignment}
                  onChange={(event) =>
                    setText((current) => ({
                      ...current,
                      alignment: event.target.value as TextLayerV3["alignment"],
                    }))
                  }
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  const scale = Number(text.scale);
                  if (
                    !validTextContentV1(text.content) ||
                    !/^#[0-9a-f]{6}$/.test(text.fill) ||
                    !Number.isInteger(scale) ||
                    scale < 1 ||
                    scale > 16
                  )
                    return announce(`${layer.name} text properties are outside valid bounds.`);
                  commit(
                    {
                      version: 3,
                      type: "set-text-properties",
                      layerId: layer.id,
                      content: text.content,
                      fill: text.fill,
                      scale,
                      alignment: text.alignment,
                    },
                    `${layer.name} updated.`,
                  );
                }}
              >
                Apply text
              </button>
            </>
          )}
          <button type="submit">Apply</button>
        </fieldset>
      </form>
    </aside>
  );
}

function LayerRow({
  layer,
  index,
  count,
  selected,
  active,
  onSelect,
  onMove,
  onKeyMove,
  onToggle,
  onLock,
  onRemove,
  protectedByLock,
  selectRef,
}: {
  layer: VisualLayerV3;
  index: number;
  count: number;
  selected: boolean;
  active: boolean;
  onSelect(event: React.MouseEvent<HTMLButtonElement>): void;
  onMove(toIndex: number): void;
  onKeyMove(event: React.KeyboardEvent): void;
  onToggle(): void;
  onLock(): void;
  onRemove(): void;
  protectedByLock: boolean;
  selectRef(node: HTMLButtonElement | null): void;
}) {
  return (
    <div
      className="creator-layer-row"
      role="option"
      aria-selected={selected}
      data-selected={selected}
      data-locked={layerLockedV3(layer)}
    >
      <button
        ref={selectRef}
        className="layer-select"
        aria-current={active}
        aria-label={`Select ${layer.name}${layer.groupId ? ", grouped" : ""}${layerLockedV3(layer) ? ", locked" : ""}`}
        onClick={onSelect}
        onKeyDown={onKeyMove}
      >
        <span aria-hidden="true">{layer.visible ? "●" : "○"}</span>
        <span>{layer.name}</span>
        {layer.groupId && <span className="layer-group-label">Group</span>}
      </button>
      <div className="layer-quick-actions">
        <button aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`} onClick={onToggle}>
          {layer.visible ? "Hide" : "Show"}
        </button>
        <button
          aria-label={`${layerLockedV3(layer) ? "Unlock" : "Lock"} ${layer.name}`}
          aria-pressed={layerLockedV3(layer)}
          onClick={onLock}
        >
          {layerLockedV3(layer) ? "Unlock" : "Lock"}
        </button>
        <button
          aria-label={`Move ${layer.name} up`}
          disabled={protectedByLock || index === count - 1}
          onClick={() => onMove(index + 1)}
        >
          ↑
        </button>
        <button
          aria-label={`Move ${layer.name} down`}
          disabled={protectedByLock || index === 0}
          onClick={() => onMove(index - 1)}
        >
          ↓
        </button>
        <button aria-label={`Delete ${layer.name}`} disabled={protectedByLock} onClick={onRemove}>
          ×
        </button>
      </div>
    </div>
  );
}

type SurfaceProps = {
  renderSurface?: WorkspaceSurface;
  documentKey: string;
  authorityVersion: number;
  label: string;
  width: number;
  height: number;
  screen: Screen;
  viewport: DocumentViewport;
  onViewport(viewport: DocumentViewport, announcement?: string): void;
  grid: boolean;
  snap: boolean;
  snapGrid: 1 | 2 | 4 | 8;
  documentGuides: DocumentGuideV3[];
  layers: VisualLayerV3[];
  images: Record<string, ImportedPngV1>;
  selection: LayerSelection;
  onSelect(id?: string, toggle?: boolean): void;
  onDelete(): void;
  onImport(file: File): Promise<void>;
  onPasteLayers(): void;
  commit: Commit;
  announce(message: string): void;
};

type CanvasGesture =
  | {
      key: string;
      layers: VisualLayerV3[];
      start: { x: number; y: number };
      end: { x: number; y: number };
      mode: "move";
    }
  | {
      key: string;
      layer: VisualLayerV3;
      start: { x: number; y: number };
      end: { x: number; y: number };
      mode: "resize";
      handle: ResizeHandle;
    }
  | {
      key: string;
      layer: LayerV2;
      start: { x: number; y: number };
      end: { x: number; y: number };
      mode: "crop";
      handle: CropHandle;
    };
type GuideGesture = {
  key: string;
  pointerId: number;
  owner: HTMLElement;
  guide: DocumentGuideV3;
  originalPosition: number;
  add: boolean;
};

function GuideRow({
  guide,
  maximum,
  locked,
  onCommit,
  onDelete,
}: {
  guide: DocumentGuideV3;
  maximum: number;
  locked: boolean;
  onCommit(position: number): void;
  onDelete(): void;
}) {
  const [draft, setDraft] = useState(String(guide.position));
  useEffect(() => setDraft(String(guide.position)), [guide.position]);
  const apply = () => {
    const position = Math.round(Number(draft));
    if (!Number.isFinite(position) || position < 0 || position > maximum) return setDraft(String(guide.position));
    if (position !== guide.position) onCommit(position);
  };
  return (
    <label>
      {guide.axis === "x" ? "Vertical" : "Horizontal"}
      <input
        aria-label={`${guide.axis === "x" ? "Vertical" : "Horizontal"} guide position`}
        type="number"
        min="0"
        max={maximum}
        disabled={locked}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={apply}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            apply();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setDraft(String(guide.position));
          }
        }}
      />
      <button type="button" disabled={locked} aria-label={`Delete guide at ${guide.position}`} onClick={onDelete}>
        Delete
      </button>
    </label>
  );
}

function Artboard({
  renderSurface,
  documentKey,
  authorityVersion,
  label,
  width,
  height,
  screen,
  viewport,
  onViewport,
  grid,
  snap,
  snapGrid,
  documentGuides,
  layers,
  images,
  selection,
  onSelect,
  onDelete,
  onImport,
  onPasteLayers,
  commit,
  announce,
}: SurfaceProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewportElement = useRef<HTMLDivElement>(null);
  const planeElement = useRef<HTMLDivElement>(null);
  const drag = useRef<CanvasGesture | undefined>(undefined);
  const pan = useRef<{ pointerId: number; x: number; y: number; viewport: DocumentViewport } | undefined>(undefined);
  const authorityKey = gestureAuthorityKey(documentKey, authorityVersion);
  const [cropMode, setCropMode] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const selectedLayers = selection.ids.flatMap((id) => layers.find((layer) => layer.id === id) ?? []),
    selectedLayer = layers.find(({ id }) => id === selection.active),
    selectionLocked = selectedLayers.some(layerLockedV3),
    canCrop = selectedLayers.length === 1 && isImageLayerV3(selectedLayer) && !selectionLocked,
    displayScale = viewport.zoom / 100,
    displaySize = {
      width: width * displayScale,
      height: height * displayScale,
    };
  const [transient, setTransient] = useState<
    {
      id: string;
      xQ16: number;
      yQ16: number;
      widthQ16?: number;
      heightQ16?: number;
      crop?: LayerV2["crop"];
    }[]
  >();
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [guideDraft, setGuideDraft] = useState<DocumentGuideV3 | undefined>(undefined);
  const guideDrag = useRef<GuideGesture | undefined>(undefined);
  const [guidePosition, setGuidePosition] = useState("0");
  const [rulerPosition, setRulerPosition] = useState({ x: 0, y: 0 });
  const addVerticalGuide = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    drag.current = undefined;
    pan.current = undefined;
    guideDrag.current = undefined;
    setTransient(undefined);
    setGuides([]);
    setCropMode(false);
    setPanning(false);
    setGuideDraft(undefined);
  }, [documentKey]);
  useEffect(() => {
    drag.current = undefined;
    pan.current = undefined;
    guideDrag.current = undefined;
    setTransient(undefined);
    setGuides([]);
    setPanning(false);
    setGuideDraft(undefined);
  }, [authorityVersion]);
  useEffect(() => {
    if (!selectionLocked) return;
    drag.current = undefined;
    setTransient(undefined);
    setGuides([]);
    setCropMode(false);
  }, [selectionLocked]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
        if (event.code === "Space" && !editingTarget(event.target)) setSpaceHeld(true);
      },
      keyup = (event: KeyboardEvent) => {
        if (event.code === "Space") setSpaceHeld(false);
      },
      blur = () => {
        drag.current = undefined;
        pan.current = undefined;
        guideDrag.current = undefined;
        setSpaceHeld(false);
        setPanning(false);
        setGuideDraft(undefined);
        setTransient(undefined);
        setGuides([]);
      };
    globalThis.document.addEventListener("keydown", keydown);
    globalThis.document.addEventListener("keyup", keyup);
    globalThis.addEventListener("blur", blur);
    return () => {
      globalThis.document.removeEventListener("keydown", keydown);
      globalThis.document.removeEventListener("keyup", keyup);
      globalThis.removeEventListener("blur", blur);
    };
  }, []);
  useEffect(() => {
    const element = viewportElement.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const bounds = planeElement.current?.getBoundingClientRect();
        if (!bounds) return;
        const pointer = {
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
          },
          next = zoomViewportAtPoint(viewport, viewport.zoom * Math.pow(2, -event.deltaY / 300), pointer);
        onViewport(next, `Zoom ${next.zoom} percent.`);
      } else {
        const next = panViewport(viewport, -event.deltaX, -event.deltaY);
        onViewport(next, `Viewport panned to ${Math.round(next.panX)}, ${Math.round(next.panY)}.`);
      }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [onViewport, viewport]);
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    const sources = new Map();
    for (const [sha256, image] of Object.entries(images)) {
      sources.set(sha256, image);
    }
    paintWorkspaceSurface(
      context,
      undefined,
      grid,
      renderSurface,
      transient,
      sources,
      selection.ids,
      { width, height },
      cropMode,
      [],
      selectedLayers.filter(layerLockedV3).map(({ id }) => id),
    );
  }, [cropMode, grid, guides, height, images, renderSurface, selectedLayers, selection.ids, transient, width]);
  const clientPoint = (clientX: number, clientY: number) => {
    const bounds = canvas.current!.getBoundingClientRect();
    return {
      x: ((clientX - bounds.left) * width) / bounds.width,
      y: ((clientY - bounds.top) * height) / bounds.height,
    };
  };
  const point = (event: React.PointerEvent<HTMLElement>) => clientPoint(event.clientX, event.clientY);
  const cancelGesture = () => {
    const activeGuide = guideDrag.current;
    if (activeGuide)
      try {
        activeGuide.owner.releasePointerCapture(activeGuide.pointerId);
      } catch {
        /* The pointer may already be released or its owner may have unmounted. */
      }
    drag.current = undefined;
    pan.current = undefined;
    guideDrag.current = undefined;
    setTransient(undefined);
    setGuides([]);
    setPanning(false);
    setGuideDraft(undefined);
  };
  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button === 1 || (event.button === 0 && spaceHeld)) {
      event.preventDefault();
      pan.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        viewport,
      };
      setPanning(true);
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    const start = point(event);
    if (cropMode && isImageLayerV3(selectedLayer) && !layerLockedV3(selectedLayer)) {
      const handle = cropHandleAtPoint(selectedLayer, start, 6 / displayScale);
      if (handle)
        drag.current = {
          key: authorityKey,
          layer: selectedLayer,
          start,
          end: start,
          mode: "crop",
          handle,
        };
      event.currentTarget.focus();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* Synthetic probes have no active pointer. */
      }
      return;
    }
    const handle =
        selectedLayers.length === 1 && selectedLayer
          ? resizeHandleAtPoint(selectedLayer, start, 6 / displayScale)
          : undefined,
      layer = handle ? selectedLayer : layerAtPoint(layers, start, new Map(Object.entries(images)));
    if (!layer) return onSelect(undefined, false);
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      onSelect(layer.id, true);
      event.currentTarget.focus();
      return;
    }
    const movingLayers = selection.ids.includes(layer.id)
      ? selectedLayers
      : layer.groupId
        ? layers.filter(({ groupId }) => groupId === layer.groupId)
        : [layer];
    if (!selection.ids.includes(layer.id)) onSelect(layer.id, false);
    if (movingLayers.some(layerLockedV3)) {
      announce("Unlock the complete selection before transforming it.");
      event.currentTarget.focus();
      return;
    }
    drag.current = handle
      ? { key: authorityKey, layer, start, end: start, mode: "resize", handle }
      : {
          key: authorityKey,
          layers: movingLayers,
          start,
          end: start,
          mode: "move",
        };
    event.currentTarget.focus();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* Synthetic probes have no active pointer. */
    }
  };
  const updateGesture = (end: { x: number; y: number }) => {
    if (!drag.current || drag.current.key !== authorityKey) return;
    drag.current.end = end;
    if (drag.current.mode === "move") {
      const raw = pointerSelectionTranslationQ16(drag.current.start, drag.current.end),
        snapped = snapSelectionTranslationQ16(
          drag.current.layers,
          raw,
          layers,
          { width, height },
          {
            enabled: snap,
            grid: snapGrid,
            displayScale,
            guides: viewport.showGuides ? documentGuides : [],
          },
        );
      setGuides(snapped.guides);
      setTransient(
        translateLayerPositionsQ16(drag.current.layers, snapped).map((position) => ({
          id: position.layerId,
          ...position,
        })),
      );
      return;
    }
    const raw =
        drag.current.mode === "crop"
          ? pointerCrop(drag.current.layer, drag.current.start, drag.current.end, drag.current.handle)
          : pointerTransformQ16(
              drag.current.layer,
              drag.current.start,
              drag.current.end,
              drag.current.mode,
              drag.current.mode === "resize" ? drag.current.handle : undefined,
            ),
      snapped =
        drag.current.mode === "crop"
          ? { ...raw, guides: [] }
          : snapLayerTransformQ16(
              drag.current.layer,
              raw,
              drag.current.mode,
              layers,
              { width, height },
              {
                enabled: snap,
                grid: snapGrid,
                displayScale,
                guides: viewport.showGuides ? documentGuides : [],
              },
              drag.current.mode === "resize" ? drag.current.handle : undefined,
            );
    setGuides(snapped.guides);
    setTransient([
      {
        id: drag.current.layer.id,
        ...snapped,
      },
    ]);
  };
  const pointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (pan.current?.pointerId === event.pointerId) {
      if (event.buttons === 0) return cancelGesture();
      const next = panViewport(pan.current.viewport, event.clientX - pan.current.x, event.clientY - pan.current.y);
      onViewport(next, `Viewport panned to ${Math.round(next.panX)}, ${Math.round(next.panY)}.`);
      return;
    }
    updateGesture(point(event));
  };
  const finishGesture = (end?: { x: number; y: number }) => {
    if (!drag.current || drag.current.key !== authorityKey) return;
    const gesture = drag.current,
      finalPoint = end ?? gesture.end;
    if (gesture.mode === "move") {
      const raw = pointerSelectionTranslationQ16(gesture.start, finalPoint),
        transform = snapSelectionTranslationQ16(
          gesture.layers,
          raw,
          layers,
          { width, height },
          {
            enabled: snap,
            grid: snapGrid,
            displayScale,
            guides: viewport.showGuides ? documentGuides : [],
          },
        ),
        positions = translateLayerPositionsQ16(gesture.layers, transform),
        changed = positions.some((position) => {
          const layer = gesture.layers.find(({ id }) => id === position.layerId)!;
          return position.xQ16 !== layer.xQ16 || position.yQ16 !== layer.yQ16;
        });
      cancelGesture();
      if (changed)
        commit(
          gesture.layers.length === 1
            ? {
                version: 2,
                type: "move-layer",
                screen,
                layerId: positions[0]!.layerId,
                xQ16: positions[0]!.xQ16,
                yQ16: positions[0]!.yQ16,
              }
            : { version: 3, type: "set-layer-positions", positions },
          gesture.layers.length === 1
            ? `${gesture.layers[0]!.name} moved to ${positions[0]!.xQ16 / 65536}, ${positions[0]!.yQ16 / 65536}.`
            : `${gesture.layers.length} layers moved.`,
        );
      return;
    }
    const raw: {
        xQ16: number;
        yQ16: number;
        widthQ16: number;
        heightQ16: number;
        crop?: LayerV2["crop"];
      } =
        gesture.mode === "crop"
          ? pointerCrop(gesture.layer, gesture.start, finalPoint, gesture.handle)
          : pointerTransformQ16(
              gesture.layer,
              gesture.start,
              finalPoint,
              gesture.mode,
              gesture.mode === "resize" ? gesture.handle : undefined,
            ),
      transform =
        gesture.mode === "crop"
          ? raw
          : snapLayerTransformQ16(
              gesture.layer,
              raw,
              gesture.mode,
              layers,
              { width, height },
              {
                enabled: snap,
                grid: snapGrid,
                displayScale,
                guides: viewport.showGuides ? documentGuides : [],
              },
              gesture.mode === "resize" ? gesture.handle : undefined,
            );
    cancelGesture();
    if (
      transform.xQ16 !== gesture.layer.xQ16 ||
      transform.yQ16 !== gesture.layer.yQ16 ||
      transform.widthQ16 !== gesture.layer.widthQ16 ||
      transform.heightQ16 !== gesture.layer.heightQ16
    )
      commit(
        {
          version: 2,
          type: "set-layer-properties",
          screen,
          layerId: gesture.layer.id,
          xQ16: transform.xQ16,
          yQ16: transform.yQ16,
          widthQ16: transform.widthQ16,
          heightQ16: transform.heightQ16,
          opacity: gesture.layer.opacity,
          crop:
            gesture.mode === "crop"
              ? (transform as { crop: LayerV2["crop"] }).crop
              : !isImageLayerV3(gesture.layer)
                ? { x: 0, y: 0, width: 1, height: 1 }
                : gesture.layer.crop,
        },
        `${gesture.layer.name} ${gesture.mode === "crop" ? "cropped" : "resized"} at ${transform.xQ16 / 65536}, ${transform.yQ16 / 65536}.`,
      );
  };
  const finishPointer = (event: React.PointerEvent<HTMLElement>) => {
    if (pan.current?.pointerId === event.pointerId) return cancelGesture();
    finishGesture(point(event));
  };
  const resizeWithKeyboard = (layer: VisualLayerV3, handle: ResizeHandle, delta: [number, number]) => {
    const raw = pointerTransformQ16(layer, { x: 0, y: 0 }, { x: delta[0], y: delta[1] }, "resize", handle),
      transform = snapLayerTransformQ16(
        layer,
        raw,
        "resize",
        layers,
        { width, height },
        {
          enabled: snap,
          grid: snapGrid,
          displayScale,
          guides: viewport.showGuides ? documentGuides : [],
        },
        handle,
      );
    if (
      transform.xQ16 === layer.xQ16 &&
      transform.yQ16 === layer.yQ16 &&
      transform.widthQ16 === layer.widthQ16 &&
      transform.heightQ16 === layer.heightQ16
    )
      return;
    commit(
      {
        version: 2,
        type: "set-layer-properties",
        screen,
        layerId: layer.id,
        xQ16: transform.xQ16,
        yQ16: transform.yQ16,
        widthQ16: transform.widthQ16,
        heightQ16: transform.heightQ16,
        opacity: layer.opacity,
        crop: isImageLayerV3(layer) ? layer.crop : { x: 0, y: 0, width: 1, height: 1 },
      },
      `${layer.name} resized at ${transform.xQ16 / 65536}, ${transform.yQ16 / 65536}.`,
    );
  };
  const importFile = (file?: File) => {
    if (!file) return;
    if (file.type !== "image/png" && !file.name.toLowerCase().endsWith(".png"))
      return announce("Drop or paste a PNG image.");
    void onImport(file);
  };
  const freshGuideId = () => {
    const used = new Set(documentGuides.map(({ id }) => id));
    for (let index = 1; index <= MAX_DOCUMENT_GUIDES_V3 + 1; index += 1)
      if (!used.has(`guide-${index}`)) return `guide-${index}`;
    return undefined;
  };
  const setDocumentGuides = (next: DocumentGuideV3[], message: string) => {
    if (next.length > MAX_DOCUMENT_GUIDES_V3)
      return announce(`A document is limited to ${MAX_DOCUMENT_GUIDES_V3} guides.`);
    commit({ version: 3, type: "set-guides", guides: next }, message);
  };
  const addGuide = (axis: "x" | "y", rawPosition = Number(guidePosition)) => {
    const id = freshGuideId(),
      maximum = axis === "x" ? width : height,
      position = Math.round(rawPosition);
    if (!id) return announce(`A document is limited to ${MAX_DOCUMENT_GUIDES_V3} guides.`);
    if (!Number.isFinite(rawPosition) || position < 0 || position > maximum)
      return announce(`Guide position must be an integer from 0 to ${maximum}.`);
    setDocumentGuides(
      [...documentGuides, { id, axis, position }],
      `${axis === "x" ? "Vertical" : "Horizontal"} guide added at ${position}.`,
    );
  };
  const removeGuide = (id: string) => {
    setDocumentGuides(
      documentGuides.filter((guide) => guide.id !== id),
      "Guide deleted.",
    );
    queueMicrotask(() => addVerticalGuide.current?.focus());
  };
  const guidePoint = (axis: "x" | "y", clientX: number, clientY: number) => {
    const bounds = canvas.current!.getBoundingClientRect();
    return axis === "x" ? (clientX - bounds.left) / displayScale : (clientY - bounds.top) / displayScale;
  };
  const startGuideDrag = (event: React.PointerEvent<HTMLElement>, guide: DocumentGuideV3) => {
    if (viewport.lockGuides) return announce("Unlock guides before dragging or deleting them.");
    event.preventDefault();
    event.currentTarget.focus();
    guideDrag.current = {
      key: authorityKey,
      pointerId: event.pointerId,
      owner: event.currentTarget,
      guide,
      originalPosition: guide.position,
      add: false,
    };
    setGuideDraft(guide);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* Synthetic probes have no active pointer. */
    }
  };
  const moveGuideDrag = (event: React.PointerEvent<HTMLElement>) => {
    const active = guideDrag.current;
    if (!active || active.key !== authorityKey || active.pointerId !== event.pointerId) return;
    if (event.buttons === 0) return cancelGesture();
    const maximum = active.guide.axis === "x" ? width : height,
      position = Math.max(
        0,
        Math.min(maximum, Math.round(guidePoint(active.guide.axis, event.clientX, event.clientY))),
      );
    active.guide = { ...active.guide, position };
    if (active.add)
      setRulerPosition((current) => ({
        ...current,
        [active.guide.axis]: position,
      }));
    setGuideDraft(active.guide);
    announce(`${active.guide.axis === "x" ? "Vertical" : "Horizontal"} guide at ${position}.`);
  };
  const commitGuideDrag = () => {
    const active = guideDrag.current;
    if (!active || active.key !== authorityKey || (!active.add && viewport.lockGuides)) return cancelGesture();
    guideDrag.current = undefined;
    setGuideDraft(undefined);
    try {
      active.owner.releasePointerCapture(active.pointerId);
    } catch {
      /* Keyboard commit or a released pointer has no capture to release. */
    }
    if (active.add) {
      if (documentGuides.some(({ id }) => id === active.guide.id)) return;
      setDocumentGuides([...documentGuides, active.guide], `Guide added at ${active.guide.position}.`);
    } else if (active.guide.position !== active.originalPosition) {
      setDocumentGuides(
        documentGuides.map((guide) => (guide.id === active.guide.id ? active.guide : guide)),
        `Guide moved to ${active.guide.position}.`,
      );
    }
  };
  const finishGuideDrag = (event: React.PointerEvent<HTMLElement>) => {
    const active = guideDrag.current;
    if (!active || active.key !== authorityKey || active.pointerId !== event.pointerId) return;
    const drop = resolveGuideDrop(
        active.guide.axis,
        { x: event.clientX, y: event.clientY },
        canvas.current!.getBoundingClientRect(),
        displayScale,
        active.guide.axis === "x" ? width : height,
      ),
      maximum = active.guide.axis === "x" ? width : height;
    if (drop.remove) {
      cancelGesture();
      if (!active.add) removeGuide(active.guide.id);
      return;
    }
    active.guide = {
      ...active.guide,
      position: Math.max(0, Math.min(maximum, drop.position)),
    };
    commitGuideDrag();
  };
  const startRulerGuide = (event: React.PointerEvent<HTMLElement>, axis: "x" | "y") => {
    if (documentGuides.length >= MAX_DOCUMENT_GUIDES_V3)
      return announce(`A document is limited to ${MAX_DOCUMENT_GUIDES_V3} guides.`);
    const id = freshGuideId();
    if (!id) return;
    const maximum = axis === "x" ? width : height,
      guide = {
        id,
        axis,
        position: Math.max(0, Math.min(maximum, Math.round(guidePoint(axis, event.clientX, event.clientY)))),
      };
    event.preventDefault();
    event.currentTarget.focus();
    setRulerPosition((current) => ({ ...current, [axis]: guide.position }));
    guideDrag.current = {
      key: authorityKey,
      pointerId: event.pointerId,
      owner: event.currentTarget,
      guide,
      originalPosition: guide.position,
      add: true,
    };
    setGuideDraft(guide);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* Synthetic probes have no active pointer. */
    }
  };
  const guideGestureKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!guideDrag.current) return false;
    if (event.key === "Escape") {
      event.preventDefault();
      cancelGesture();
      announce("Guide move canceled.");
      return true;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commitGuideDrag();
      return true;
    }
    return false;
  };
  const rulerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, axis: "x" | "y") => {
    if (guideGestureKeyDown(event)) return;
    const maximum = axis === "x" ? width : height,
      current = rulerPosition[axis],
      step = event.shiftKey ? 10 : 1;
    let position = current;
    if (event.key === "Home") position = 0;
    else if (event.key === "End") position = maximum;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") position = Math.max(0, current - step);
    else if (event.key === "ArrowRight" || event.key === "ArrowDown") position = Math.min(maximum, current + step);
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      addGuide(axis, current);
      return;
    } else return;
    event.preventDefault();
    setRulerPosition((value) => ({ ...value, [axis]: position }));
    announce(`${axis === "x" ? "Vertical" : "Horizontal"} guide position ${position}. Press Enter to add.`);
  };
  const visibleGuides = viewport.showGuides
      ? [...documentGuides.filter(({ id }) => id !== guideDraft?.id), ...(guideDraft ? [guideDraft] : [])]
      : [],
    horizontalTicks = rulerTicks(width, viewport.zoom),
    verticalTicks = rulerTicks(height, viewport.zoom);
  return (
    <div className="artboard-stage">
      <div className="artboard-label">
        <strong>{label}</strong>
        <span>
          {width} × {height} px
        </span>
        <div className="viewport-controls" role="group" aria-label="Viewport zoom and fit">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() =>
              onViewport(
                zoomViewportAtPoint(viewport, viewport.zoom / 2, {
                  x: 0,
                  y: 0,
                }),
                `Zoom ${Math.round(viewport.zoom / 2)} percent.`,
              )
            }
          >
            −
          </button>
          <label>
            <span className="sr-only">Exact zoom percentage</span>
            <input
              aria-label="Exact zoom percentage"
              type="number"
              min="25"
              max="1600"
              step="1"
              value={viewport.zoom}
              onChange={(event) =>
                onViewport(
                  zoomViewportAtPoint(viewport, Number(event.target.value), {
                    x: 0,
                    y: 0,
                  }),
                )
              }
            />
          </label>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() =>
              onViewport(
                zoomViewportAtPoint(viewport, viewport.zoom * 2, {
                  x: 0,
                  y: 0,
                }),
                `Zoom ${Math.round(viewport.zoom * 2)} percent.`,
              )
            }
          >
            +
          </button>
          <button
            type="button"
            onClick={() =>
              onViewport(normalizeViewport({ ...viewport, zoom: 100, panX: 0, panY: 0 }), "Zoom 100 percent.")
            }
          >
            100%
          </button>
          <button
            type="button"
            data-fit-view="true"
            onClick={() => {
              const bounds = planeElement.current?.getBoundingClientRect();
              if (!bounds) return;
              onViewport(fitViewport({ width, height }, bounds), "Fit to view.");
            }}
          >
            Fit
          </button>
        </div>
        <button
          type="button"
          aria-pressed={cropMode}
          disabled={!canCrop}
          onClick={() => setCropMode((active) => !active)}
        >
          {cropMode ? "Done cropping" : "Crop image"}
        </button>
      </div>
      <div
        ref={viewportElement}
        className={`artboard-viewport${spaceHeld ? " pan-ready" : ""}${panning ? " panning" : ""}`}
        aria-label={`Viewport at ${viewport.zoom} percent, pan ${Math.round(viewport.panX)}, ${Math.round(viewport.panY)}`}
      >
        <div className="ruler-corner" aria-hidden="true" />
        <button
          type="button"
          className="artboard-ruler horizontal"
          aria-label={`Horizontal ruler, 0 to ${width} pixels. Vertical guide position ${rulerPosition.x}. Use arrow keys, Home, or End to choose a position; press Enter to add.`}
          onPointerDown={(event) => startRulerGuide(event, "x")}
          onPointerMove={moveGuideDrag}
          onPointerUp={finishGuideDrag}
          onPointerCancel={cancelGesture}
          onLostPointerCapture={cancelGesture}
          onKeyDown={(event) => rulerKeyDown(event, "x")}
        >
          {horizontalTicks.map((tick) => (
            <span
              key={tick.position}
              className={tick.major ? "major" : "minor"}
              style={{ left: viewport.panX + tick.position * displayScale }}
            >
              {tick.label}
            </span>
          ))}
        </button>
        <button
          type="button"
          className="artboard-ruler vertical"
          aria-label={`Vertical ruler, 0 to ${height} pixels. Horizontal guide position ${rulerPosition.y}. Use arrow keys, Home, or End to choose a position; press Enter to add.`}
          onPointerDown={(event) => startRulerGuide(event, "y")}
          onPointerMove={moveGuideDrag}
          onPointerUp={finishGuideDrag}
          onPointerCancel={cancelGesture}
          onLostPointerCapture={cancelGesture}
          onKeyDown={(event) => rulerKeyDown(event, "y")}
        >
          {verticalTicks.map((tick) => (
            <span
              key={tick.position}
              className={tick.major ? "major" : "minor"}
              style={{ top: viewport.panY + tick.position * displayScale }}
            >
              {tick.label}
            </span>
          ))}
        </button>
        <div ref={planeElement} className="artboard-plane">
          <div
            className="artboard-canvas-frame"
            style={{
              ...displaySize,
              transform: `translate(${viewport.panX}px, ${viewport.panY}px)`,
            }}
          >
            <canvas
              ref={canvas}
              className="workspace-canvas"
              data-workspace-surface={documentKey.slice(documentKey.indexOf(":") + 1)}
              data-crop-mode={cropMode}
              data-snap-guides={guides.length}
              width={width}
              height={height}
              style={{ width: "100%", height: "100%" }}
              tabIndex={0}
              role="img"
              aria-label={`${label} visual editor artboard, ${width} by ${height} pixels`}
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={finishPointer}
              onPointerCancel={cancelGesture}
              onLostPointerCapture={cancelGesture}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                importFile(firstPngFile([...event.dataTransfer.files]));
              }}
              onPaste={(event) => {
                event.stopPropagation();
                const image = firstPngFile([...event.clipboardData.files], [...event.clipboardData.items]);
                if (image) importFile(image);
                else onPasteLayers();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  const active = Boolean(drag.current);
                  cancelGesture();
                  if (!active) {
                    setCropMode(false);
                    onSelect(undefined, false);
                  }
                  return;
                }
                if (event.key === "Enter" && drag.current) {
                  event.preventDefault();
                  finishGesture();
                  return;
                }
                if ((event.key === "Delete" || event.key === "Backspace") && selection.ids.length) {
                  event.preventDefault();
                  onDelete();
                  return;
                }
                if (event.repeat && event.key.startsWith("Arrow")) {
                  event.preventDefault();
                  return;
                }
                const movingLayers = selectedLayers,
                  delta = keyboardMoveDelta(event.key, event.shiftKey, event.repeat);
                if (!movingLayers.length || !delta) return;
                event.preventDefault();
                if (movingLayers.some(layerLockedV3)) {
                  announce("Unlock the complete selection before moving it.");
                  return;
                }
                const positions = translateLayerPositionsQ16(movingLayers, {
                  xQ16: delta[0] * 65536,
                  yQ16: delta[1] * 65536,
                });
                commit(
                  movingLayers.length === 1
                    ? {
                        version: 2,
                        type: "move-layer",
                        screen,
                        ...positions[0]!,
                      }
                    : { version: 3, type: "set-layer-positions", positions },
                  `${movingLayers.length} layer${movingLayers.length === 1 ? "" : "s"} moved.`,
                );
              }}
            />
            {selectedLayers.length === 1 &&
              selectedLayer &&
              !selectionLocked &&
              !cropMode &&
              RESIZE_HANDLES.map((handle) => {
                const bounds = layerVisualBoundsQ16(selectedLayer),
                  left = (bounds.x / 65536) * displayScale,
                  top = (bounds.y / 65536) * displayScale,
                  right = ((bounds.x + bounds.width) / 65536) * displayScale,
                  bottom = ((bounds.y + bounds.height) / 65536) * displayScale,
                  x = handle.includes("w") ? left : handle.includes("e") ? right : (left + right) / 2,
                  y = handle.includes("n") ? top : handle.includes("s") ? bottom : (top + bottom) / 2;
                return (
                  <button
                    key={handle}
                    type="button"
                    className="canvas-resize-handle"
                    data-resize-handle={handle}
                    aria-label={`Resize ${selectedLayer.name} from ${handle}`}
                    style={{ left: x, top: y }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      const start = point(event);
                      drag.current = {
                        key: authorityKey,
                        layer: selectedLayer,
                        start,
                        end: start,
                        mode: "resize",
                        handle,
                      };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) pointerMove(event);
                    }}
                    onPointerUp={finishPointer}
                    onPointerCancel={cancelGesture}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelGesture();
                        return;
                      }
                      if (event.repeat && event.key.startsWith("Arrow")) {
                        event.preventDefault();
                        return;
                      }
                      const delta = keyboardMoveDelta(event.key, event.shiftKey, event.repeat);
                      if (!delta) return;
                      event.preventDefault();
                      resizeWithKeyboard(selectedLayer, handle, delta);
                    }}
                  />
                );
              })}
          </div>
          {visibleGuides.map((guide) => (
            <button
              key={guide.id}
              type="button"
              className={`document-guide ${guide.axis === "x" ? "vertical" : "horizontal"}${guides.some(({ guideId }) => guideId === guide.id) ? " active" : ""}`}
              style={
                guide.axis === "x"
                  ? { left: viewport.panX + guide.position * displayScale }
                  : { top: viewport.panY + guide.position * displayScale }
              }
              aria-label={`${guide.axis === "x" ? "Vertical" : "Horizontal"} guide at ${guide.position} pixels${viewport.lockGuides ? ", locked" : ""}`}
              disabled={viewport.lockGuides}
              onPointerDown={(event) => startGuideDrag(event, guide)}
              onPointerMove={moveGuideDrag}
              onPointerUp={finishGuideDrag}
              onPointerCancel={cancelGesture}
              onLostPointerCapture={cancelGesture}
              onKeyDown={(event) => {
                if (guideGestureKeyDown(event)) return;
                if ((event.key === "Delete" || event.key === "Backspace") && !viewport.lockGuides) {
                  event.preventDefault();
                  removeGuide(guide.id);
                }
              }}
            />
          ))}
          {guides
            .filter(({ guideId }) => !guideId)
            .map((guide) => (
              <span
                key={`${guide.axis}:${guide.positionQ16}`}
                className={`snap-guide ${guide.axis === "x" ? "vertical" : "horizontal"}`}
                style={
                  guide.axis === "x"
                    ? {
                        left: viewport.panX + (guide.positionQ16 / 65536) * displayScale,
                      }
                    : {
                        top: viewport.panY + (guide.positionQ16 / 65536) * displayScale,
                      }
                }
                aria-hidden="true"
              />
            ))}
        </div>
      </div>
      <div className="guide-controls" aria-label="Document guides">
        <label>
          Position
          <input
            aria-label="Guide position"
            type="number"
            min="0"
            max={Math.max(width, height)}
            step="1"
            value={guidePosition}
            onChange={(event) => setGuidePosition(event.target.value)}
          />
        </label>
        <button ref={addVerticalGuide} type="button" onClick={() => addGuide("x")}>
          Add vertical
        </button>
        <button type="button" onClick={() => addGuide("y")}>
          Add horizontal
        </button>
        <button
          type="button"
          disabled={!documentGuides.length || viewport.lockGuides}
          onClick={() => setDocumentGuides([], "Guides cleared.")}
        >
          Clear guides
        </button>
        {documentGuides.map((guide) => (
          <GuideRow
            key={guide.id}
            guide={guide}
            maximum={guide.axis === "x" ? width : height}
            locked={viewport.lockGuides}
            onCommit={(position) =>
              setDocumentGuides(
                documentGuides.map((item) => (item.id === guide.id ? { ...item, position } : item)),
                `Guide moved to ${position}.`,
              )
            }
            onDelete={() => removeGuide(guide.id)}
          />
        ))}
      </div>
      <p>
        {cropMode
          ? "Drag a cyan crop edge or corner. Enter commits; Escape cancels."
          : "Drop or paste a PNG. Drag artwork to move it; arrow keys move once per key press. Escape clears selection."}
      </p>
    </div>
  );
}

const validClipboardLayer = (value: unknown): value is VisualLayerV3 => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const layer = value as Partial<VisualLayerV3>,
    record = value as Record<string, unknown>,
    id = (candidate: unknown) =>
      typeof candidate === "string" &&
      candidate.length > 0 &&
      candidate.length <= 128 &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(candidate),
    geometry =
      id(layer.id) &&
      typeof layer.name === "string" &&
      layer.name.length > 0 &&
      typeof layer.visible === "boolean" &&
      [layer.opacity, layer.xQ16, layer.yQ16, layer.widthQ16, layer.heightQ16].every(Number.isSafeInteger) &&
      Number(layer.opacity) >= 0 &&
      Number(layer.opacity) <= 65536 &&
      Number(layer.widthQ16) > 0 &&
      Number(layer.heightQ16) > 0 &&
      [0, 90, 180, 270].includes(layer.rotation ?? 0) &&
      (layer.locked === undefined || typeof layer.locked === "boolean") &&
      (layer.groupId === undefined || id(layer.groupId));
  if (!geometry) return false;
  const common = [
    "id",
    "name",
    "visible",
    "opacity",
    "rotation",
    "groupId",
    "locked",
    "xQ16",
    "yQ16",
    "widthQ16",
    "heightQ16",
  ];
  if (record.kind === "shape")
    return (
      (record.shape === "rectangle" || record.shape === "ellipse") &&
      typeof record.fill === "string" &&
      /^#[0-9a-f]{6}$/.test(record.fill) &&
      Object.keys(layer).every((key) => [...common, "kind", "shape", "fill"].includes(key))
    );
  if (record.kind === "text")
    return (
      validTextContentV1(record.content) &&
      typeof record.fill === "string" &&
      /^#[0-9a-f]{6}$/.test(record.fill) &&
      Number.isInteger(record.scale) &&
      Number(record.scale) >= 1 &&
      Number(record.scale) <= 16 &&
      typeof record.alignment === "string" &&
      ["left", "center", "right"].includes(record.alignment) &&
      Object.keys(layer).every((key) => [...common, "kind", "content", "fill", "scale", "alignment"].includes(key))
    );
  const image = layer as Partial<LayerV2>;
  return (
    (image.kind === undefined || image.kind === "image") &&
    Boolean(image.asset && typeof image.asset.path === "string" && typeof image.asset.sha256 === "string") &&
    [image.width, image.height, image.crop?.x, image.crop?.y, image.crop?.width, image.crop?.height].every(
      Number.isSafeInteger,
    ) &&
    Number(image.width) > 0 &&
    Number(image.height) > 0 &&
    Number(image.crop?.width) > 0 &&
    Number(image.crop?.height) > 0 &&
    Number(image.crop?.x) >= 0 &&
    Number(image.crop?.y) >= 0 &&
    Number(image.crop?.x) + Number(image.crop?.width) <= Number(image.width) &&
    Number(image.crop?.y) + Number(image.crop?.height) <= Number(image.height) &&
    Object.keys(layer).every((key) => [...common, "kind", "asset", "width", "height", "crop"].includes(key))
  );
};
const editingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && isLayerEditingTarget(target);
const mutatedLayerIds = (operation: VisualDocumentOperationV3): string[] => {
  if (operation.version === 2)
    return operation.type === "add-layer" || operation.type === "set-layer-visibility" || !("layerId" in operation)
      ? []
      : [operation.layerId];
  if (
    operation.type === "add-shape-layer" ||
    operation.type === "add-text-layer" ||
    operation.type === "insert-layers" ||
    operation.type === "set-layer-locks" ||
    operation.type === "set-guides"
  )
    return [];
  if (operation.type === "set-layer-positions") return operation.positions.map(({ layerId }) => layerId);
  if (operation.type === "remove-layers" || operation.type === "reorder-layers") return operation.layerIds;
  if (operation.type === "set-layer-groups") return operation.memberships.map(({ layerId }) => layerId);
  if (operation.type === "set-layer-rotations") return operation.rotations.map(({ layerId }) => layerId);
  return [operation.layerId];
};

export function CreatorWorkspace({
  customProject,
  authorityVersion,
  instance,
  images = {},
  visualDocuments,
  visualSources = {},
  readOnly = false,
  onAdd,
  onImport,
  onOperation,
}: {
  customProject?: ThemeProjectV2;
  authorityVersion: number;
  instance: number;
  images?: Record<string, ImportedPngV1>;
  visualDocuments?: Record<CustomVisualRoleV1, VisualDocumentV3>;
  visualSources?: Partial<Record<CustomVisualRoleV1, CustomVisualSourceV1>>;
  readOnly?: boolean;
  onAdd(role: CustomVisualRoleV1): void;
  onImport(role: CustomVisualRoleV1, file: File): Promise<void>;
  onOperation(role: CustomVisualRoleV1, operation: VisualDocumentOperationV3): void;
}) {
  const [role, setRole] = useState<CustomVisualRoleV1>("top-background");
  const [viewports, setViewports] = useState<Partial<Record<CustomVisualRoleV1, DocumentViewport>>>({});
  const [grid, setGrid] = useState(false);
  const [snap, setSnap] = useState(true);
  const [snapGrid, setSnapGrid] = useState<1 | 2 | 4 | 8>(1);
  const [selections, setSelections] = useState<Partial<Record<CustomVisualRoleV1, LayerSelection>>>({});
  const [announcement, setAnnouncement] = useState("");
  const pendingSelection = useRef<{ role: CustomVisualRoleV1; ids: string[] } | undefined>(undefined);
  const pendingFocus = useRef<{ role: CustomVisualRoleV1; removed: string[]; target?: string } | undefined>(undefined);
  const deletionSelections = useRef<Partial<Record<CustomVisualRoleV1, EphemeralDeletionSelection[]>>>({});
  const insertionSelections = useRef<Partial<Record<CustomVisualRoleV1, EphemeralInsertionSelection[]>>>({});
  const clipboard = useRef<{
    snapshot?: LayerClipboardSnapshot;
    pasteCount: number;
  }>({ pasteCount: 0 });
  const selectionFocus = useRef<{ role: CustomVisualRoleV1; target?: string } | undefined>(undefined);
  const layerButtons = useRef(new Map<string, HTMLButtonElement>());
  const addLayerButton = useRef<HTMLButtonElement>(null);
  const document = visualDocuments?.[role];
  const viewport = viewports[role] ?? normalizeViewport({ zoom: 150 });
  const layers = document?.layers ?? [];
  const selection = selections[role] ?? { ids: [] };
  const selectedLayers = selection.ids.flatMap((id) => layers.find((layer) => layer.id === id) ?? []);
  const selectedLayer = layers.find(({ id }) => id === selection.active);
  const selectionLocked = selectedLayers.some(layerLockedV3);
  const assigned = visualSources[role];
  const width = document?.width ?? CUSTOM_VISUAL_DOCUMENTS_V1[role].width;
  const height = document?.height ?? CUSTOM_VISUAL_DOCUMENTS_V1[role].height;
  const renderSurface: WorkspaceSurface = visualDocumentSurface({ width, height, layers }, assigned);
  const commit: Commit = (operation, message) => {
    if (readOnly) {
      setAnnouncement("This project is read-only until recovery diagnostics are resolved.");
      return;
    }
    const targets = new Set(mutatedLayerIds(operation));
    for (const target of [...targets]) {
      const groupId = layers.find(({ id }) => id === target)?.groupId;
      if (groupId) for (const member of layers) if (member.groupId === groupId) targets.add(member.id);
    }
    if (layers.some(({ id, locked }) => targets.has(id) && locked)) {
      setAnnouncement(LOCKED_EDIT_EXPLANATION);
      return;
    }
    onOperation(role, operation);
    setAnnouncement(message);
  };
  useEffect(() => {
    if (
      pendingSelection.current?.role === role &&
      pendingSelection.current.ids.every((id) => layers.some((layer) => layer.id === id))
    )
      pendingSelection.current = undefined;
    let candidate = selection;
    const records = deletionSelections.current[role] ?? [];
    for (const [index, record] of records.entries()) {
      const transition = transitionDeletionSelection(record, layers);
      records[index] = transition.record;
      if (transition.selection) {
        candidate = transition.selection;
        selectionFocus.current = { role, target: transition.selection.active };
      }
    }
    const insertions = insertionSelections.current[role] ?? [];
    for (const [index, record] of insertions.entries()) {
      const transition = transitionInsertionSelection(record, layers);
      insertions[index] = transition.record;
      if (transition.selection) {
        candidate = transition.selection;
        selectionFocus.current = { role, target: transition.selection.active };
      }
    }
    const pending = pendingSelection.current?.role === role ? pendingSelection.current.ids : [],
      reconciled = reconcileGroupedLayerSelection(
        candidate,
        pending.length ? [...layers, ...pending.map((id) => ({ id, visible: true }) as VisualLayerV3)] : layers,
      );
    if (reconciled.active !== selection.active || reconciled.ids.join("\0") !== selection.ids.join("\0"))
      setSelections((current) => ({ ...current, [role]: reconciled }));
  }, [layers, role, selection.active, selection.ids]);
  useEffect(() => {
    const pending = selectionFocus.current;
    if (!pending || pending.role !== role) return;
    (pending.target ? layerButtons.current.get(pending.target) : addLayerButton.current)?.focus();
    selectionFocus.current = undefined;
  }, [layers, role, selection.active]);
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending || pending.role !== role || pending.removed.some((id) => layers.some((layer) => layer.id === id)))
      return;
    (pending.target ? layerButtons.current.get(pending.target) : addLayerButton.current)?.focus();
    pendingFocus.current = undefined;
  }, [layers, role]);
  useEffect(() => {
    pendingSelection.current = undefined;
    pendingFocus.current = undefined;
    deletionSelections.current = {};
    insertionSelections.current = {};
    clipboard.current = { pasteCount: 0 };
    selectionFocus.current = undefined;
    setSelections({});
    setViewports({});
    setRole("top-background");
  }, [customProject?.projectId]);
  const updateViewport = (next: DocumentViewport, message?: string) => {
    setViewports((current) => ({
      ...current,
      [role]: normalizeViewport(next),
    }));
    if (message) setAnnouncement(message);
  };
  const remove = (layer?: VisualLayerV3) => {
    const layerIds =
      layer && !selection.ids.includes(layer.id)
        ? layer.groupId
          ? layers.filter(({ groupId }) => groupId === layer.groupId).map(({ id }) => id)
          : [layer.id]
        : selection.ids;
    if (!layerIds.length) return;
    if (layerIds.some((id) => layers.find((candidate) => candidate.id === id)?.locked === true)) {
      setAnnouncement("Unlock the complete selection before deleting it.");
      return;
    }
    if (layerIds.length > MAX_BATCH_LAYER_EDITS_V3) {
      setAnnouncement(`Select no more than ${MAX_BATCH_LAYER_EDITS_V3} layers for a batch command.`);
      return;
    }
    const removed = new Set(layerIds),
      firstIndex = Math.min(...layerIds.map((id) => layers.findIndex((candidate) => candidate.id === id))),
      remaining = layers.filter(({ id }) => !removed.has(id)),
      target = remaining[Math.min(firstIndex, remaining.length - 1)]?.id,
      after = target ? { ids: [target], active: target } : { ids: [] };
    deletionSelections.current[role] = [
      ...(deletionSelections.current[role] ?? []),
      {
        before: {
          ids: [...selection.ids],
          ...(selection.active ? { active: selection.active } : {}),
        },
        after,
        missing: false,
      },
    ].slice(-200);
    pendingFocus.current = { role, removed: layerIds, target };
    setSelections((current) => ({ ...current, [role]: after }));
    commit(
      { version: 3, type: "remove-layers", layerIds },
      layerIds.length === 1
        ? `${layers.find(({ id }) => id === layerIds[0])?.name ?? "Layer"} deleted.`
        : `${layerIds.length} layers deleted.`,
    );
  };
  const allocationFailed = (error: unknown): void => {
    setAnnouncement(error instanceof Error ? error.message : "Could not allocate a fresh layer or group ID.");
  };
  const addShape = (shape: "rectangle" | "ellipse") => {
    let id: string;
    try {
      id = allocateCanonicalLayerId(layerAndGroupIds(layers));
    } catch (error) {
      allocationFailed(error);
      return;
    }
    const layer = {
      kind: "shape" as const,
      shape,
      fill: "#4ed8e8",
      id,
      name: shape === "rectangle" ? "Rectangle" : "Ellipse",
      visible: true,
      locked: false,
      opacity: 65536,
      rotation: 0 as const,
      xQ16: Math.floor(width / 4) * 65536,
      yQ16: Math.floor(height / 4) * 65536,
      widthQ16: Math.max(1, Math.floor(width / 2)) * 65536,
      heightQ16: Math.max(1, Math.floor(height / 2)) * 65536,
    };
    pendingSelection.current = { role, ids: [id] };
    commit({ version: 3, type: "add-shape-layer", layer }, `${layer.name} added.`);
    setSelections((current) => ({
      ...current,
      [role]: { ids: [id], active: id },
    }));
  };
  const addText = () => {
    let id: string;
    try {
      id = allocateCanonicalLayerId(layerAndGroupIds(layers));
    } catch (error) {
      allocationFailed(error);
      return;
    }
    const layer: TextLayerV3 = {
      kind: "text",
      content: "Text",
      fill: "#ffffff",
      scale: 1,
      alignment: "left",
      id,
      name: "Text",
      visible: true,
      locked: false,
      opacity: 65536,
      rotation: 0,
      xQ16: Math.floor(width / 4) * 65536,
      yQ16: Math.floor(height / 4) * 65536,
      widthQ16: Math.max(1, Math.floor(width / 2)) * 65536,
      heightQ16: Math.max(1, Math.min(32, Math.floor(height / 2))) * 65536,
    };
    pendingSelection.current = { role, ids: [id] };
    commit({ version: 3, type: "add-text-layer", layer }, "Text added.");
    setSelections((current) => ({
      ...current,
      [role]: { ids: [id], active: id },
    }));
  };
  const select = (id?: string, toggle = false) => {
    const next = updateGroupedLayerSelection(selection, layers, id, toggle, MAX_BATCH_LAYER_EDITS_V3);
    if (next === selection && id && !selection.ids.includes(id)) {
      setAnnouncement(`Selection is limited to ${MAX_BATCH_LAYER_EDITS_V3} layers.`);
      return;
    }
    setSelections((current) => ({ ...current, [role]: next }));
    setAnnouncement(`${next.ids.length} layer${next.ids.length === 1 ? "" : "s"} selected.`);
  };
  const orderedSelection = () => layers.filter(({ id }) => selection.ids.includes(id));
  const setLocks = (source: readonly VisualLayerV3[], locked: boolean) => {
    if (!source.length || source.every((layer) => layerLockedV3(layer) === locked)) return;
    commit(
      {
        version: 3,
        type: "set-layer-locks",
        locks: source.map(({ id }) => ({ layerId: id, locked })),
      },
      `${source.length} layer${source.length === 1 ? "" : "s"} ${locked ? "locked" : "unlocked"}.${locked ? ` ${LOCKED_EDIT_EXPLANATION}` : ""}`,
    );
  };
  const freshCopies = (source: readonly VisualLayerV3[], delta: { xQ16: number; yQ16: number }) => {
    const groups = new Map<string, string>(),
      used = layerAndGroupIds(layers);
    return source.map((layer) => {
      const copy = structuredClone(layer);
      copy.id = allocateCanonicalLayerId(used);
      copy.xQ16 += delta.xQ16;
      copy.yQ16 += delta.yQ16;
      if (copy.groupId) {
        if (!groups.has(copy.groupId)) groups.set(copy.groupId, allocateCanonicalLayerId(used, "group-"));
        copy.groupId = groups.get(copy.groupId)!;
      }
      return copy;
    });
  };
  const recordInsertion = (before: LayerSelection, copies: readonly VisualLayerV3[]) => {
    const after = {
      ids: copies.map(({ id }) => id),
      active: copies.at(-1)!.id,
    };
    insertionSelections.current[role] = [
      ...(insertionSelections.current[role] ?? []),
      { before, after, insertedIds: [...after.ids], present: false },
    ].slice(-200);
    pendingSelection.current = { role, ids: [...after.ids] };
    selectionFocus.current = { role, target: after.active };
    setSelections((current) => ({ ...current, [role]: after }));
  };
  const duplicate = () => {
    const source = orderedSelection();
    if (!source.length) return;
    if (layers.length + source.length > MAX_DOCUMENT_LAYERS_V3)
      return setAnnouncement(`A document is limited to ${MAX_DOCUMENT_LAYERS_V3} layers.`);
    const offset = duplicateLayerOffsetQ16(source, { width, height });
    let copies: VisualLayerV3[];
    try {
      copies = freshCopies(source, offset);
    } catch (error) {
      allocationFailed(error);
      return;
    }
    const before = {
      ids: [...selection.ids],
      ...(selection.active ? { active: selection.active } : {}),
    };
    recordInsertion(before, copies);
    commit(
      {
        version: 3,
        type: "insert-layers",
        layers: copies,
        toIndex: Math.max(...source.map((item) => layers.indexOf(item))) + 1,
      },
      offset.inPlace
        ? `${copies.length} layer${copies.length === 1 ? "" : "s"} duplicated in place; no safe offset exists.`
        : `${copies.length} layer${copies.length === 1 ? "" : "s"} duplicated.`,
    );
  };
  const copy = () => {
    const source = orderedSelection();
    if (!customProject || !source.length) return;
    const groups = new Map<string, string>(),
      used = layerAndGroupIds(layers);
    let snapshot: VisualLayerV3[];
    try {
      snapshot = source.map((layer) => {
        const item = structuredClone(layer);
        if (item.groupId) {
          if (!groups.has(item.groupId)) groups.set(item.groupId, allocateCanonicalLayerId(used, "group-"));
          item.groupId = groups.get(item.groupId)!;
        }
        return item;
      });
    } catch (error) {
      allocationFailed(error);
      return;
    }
    clipboard.current = {
      snapshot: freezeLayerClipboardSnapshot(customProject.projectId, snapshot),
      pasteCount: 0,
    };
    setAnnouncement(`${snapshot.length} layer${snapshot.length === 1 ? "" : "s"} copied inside this project.`);
  };
  const validClipboard = () => {
    const snapshot = clipboard.current.snapshot;
    if (!snapshot || !customProject || snapshot.projectId !== customProject.projectId) return undefined;
    if (!snapshot.layers.length || snapshot.layers.length > MAX_BATCH_LAYER_EDITS_V3) return undefined;
    if (new Set(snapshot.layers.map(({ id }) => id)).size !== snapshot.layers.length) return undefined;
    if (!snapshot.layers.every(validClipboardLayer)) return undefined;
    if (!clipboardMediaIsReachable(snapshot.layers, new Set(Object.keys(images)))) return undefined;
    const groups = new Map<string, number>();
    for (const layer of snapshot.layers)
      if (layer.groupId) groups.set(layer.groupId, (groups.get(layer.groupId) ?? 0) + 1);
    return [...groups.values()].every((count) => count >= 2) ? snapshot : undefined;
  };
  const paste = () => {
    const snapshot = validClipboard();
    if (!snapshot) return setAnnouncement("Nothing valid is available in the internal layer clipboard.");
    if (layers.length + snapshot.layers.length > MAX_DOCUMENT_LAYERS_V3)
      return setAnnouncement(`A document is limited to ${MAX_DOCUMENT_LAYERS_V3} layers.`);
    const pasteCount = clipboard.current.pasteCount + 1,
      offset = translateLayersIntoDocumentQ16(snapshot.layers, { width, height }, (((pasteCount - 1) % 8) + 1) * 8);
    let copies: VisualLayerV3[];
    try {
      copies = freshCopies(snapshot.layers, offset);
    } catch (error) {
      allocationFailed(error);
      return;
    }
    const before = {
      ids: [...selection.ids],
      ...(selection.active ? { active: selection.active } : {}),
    };
    clipboard.current.pasteCount = pasteCount;
    recordInsertion(before, copies);
    commit(
      {
        version: 3,
        type: "insert-layers",
        layers: copies,
        toIndex: layers.length,
      },
      `${copies.length} layer${copies.length === 1 ? "" : "s"} pasted into ${role}.`,
    );
  };
  const group = () => {
    const source = orderedSelection();
    if (source.length < 2) return;
    if (source.some(layerLockedV3)) return setAnnouncement("Unlock the complete selection before grouping it.");
    let groupId: string;
    try {
      groupId = allocateCanonicalLayerId(layerAndGroupIds(layers), "group-");
    } catch (error) {
      allocationFailed(error);
      return;
    }
    commit(
      {
        version: 3,
        type: "set-layer-groups",
        memberships: source.map(({ id }) => ({ layerId: id, groupId })),
      },
      `${source.length} layers grouped.`,
    );
  };
  const ungroup = () => {
    const groupIds = new Set(orderedSelection().flatMap(({ groupId }) => (groupId ? [groupId] : []))),
      members = layers.filter(({ groupId }) => groupId && groupIds.has(groupId));
    if (!members.length) return;
    if (members.some(layerLockedV3)) return setAnnouncement("Unlock the complete selection before ungrouping it.");
    commit(
      {
        version: 3,
        type: "set-layer-groups",
        memberships: members.map(({ id }) => ({ layerId: id })),
      },
      `${groupIds.size} group${groupIds.size === 1 ? "" : "s"} ungrouped.`,
    );
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!editingTarget(event.target) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          return updateViewport(
            zoomViewportAtPoint(viewport, viewport.zoom * 2, { x: 0, y: 0 }),
            `Zoom ${Math.min(1600, viewport.zoom * 2)} percent.`,
          );
        }
        if (event.key === "-") {
          event.preventDefault();
          return updateViewport(
            zoomViewportAtPoint(viewport, viewport.zoom / 2, { x: 0, y: 0 }),
            `Zoom ${Math.max(25, viewport.zoom / 2)} percent.`,
          );
        }
        if (event.key === "0") {
          event.preventDefault();
          if (event.shiftKey)
            return globalThis.document.querySelector<HTMLButtonElement>('[data-fit-view="true"]')?.click();
          return updateViewport(normalizeViewport({ ...viewport, zoom: 100, panX: 0, panY: 0 }), "Zoom 100 percent.");
        }
      }
      const shortcut = layerShortcut({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        repeat: event.repeat,
        editing: editingTarget(event.target),
      });
      if (shortcut === "duplicate" && selection.ids.length) duplicate();
      else if (shortcut === "copy" && selection.ids.length) copy();
      else if (shortcut === "unlock") setLocks(orderedSelection(), false);
      else if (shortcut === "lock") setLocks(orderedSelection(), true);
      else if (shortcut === "ungroup") ungroup();
      else if (shortcut === "group") group();
      else return;
      event.preventDefault();
    };
    const onPaste = (event: ClipboardEvent) => {
      if (event.target instanceof HTMLElement && !shouldHandleLayerPaste(event.target)) return;
      const image = event.clipboardData
        ? firstPngFile([...event.clipboardData.files], [...event.clipboardData.items])
        : undefined;
      event.preventDefault();
      if (image) {
        if (!readOnly) void onImport(role, image);
      } else paste();
    };
    globalThis.document.addEventListener("keydown", keydown);
    globalThis.document.addEventListener("paste", onPaste);
    return () => {
      globalThis.document.removeEventListener("keydown", keydown);
      globalThis.document.removeEventListener("paste", onPaste);
    };
  });
  return (
    <section className="creator-workspace" data-workspace-instance={instance} aria-labelledby="creator-workspace-title">
      <header className="creator-toolbar">
        <div>
          <span>Visual editor</span>
          <h2 id="creator-workspace-title">Theme canvas</h2>
        </div>
        <div className="creator-tools">
          <div className="document-switcher" role="group" aria-label="Visual document">
            {CUSTOM_VISUAL_ROLES_V1.map((item) => (
              <button
                key={item}
                className={role === item ? "active" : ""}
                aria-pressed={role === item}
                onClick={() => setRole(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <label className="grid-toggle">
            <input
              aria-label="Show guides"
              type="checkbox"
              checked={viewport.showGuides}
              onChange={(event) =>
                updateViewport(
                  { ...viewport, showGuides: event.target.checked },
                  event.target.checked ? "Guides shown." : "Guides hidden; hidden guides do not snap.",
                )
              }
            />{" "}
            Show guides
          </label>
          <label className="grid-toggle">
            <input
              aria-label="Lock guides"
              type="checkbox"
              checked={viewport.lockGuides}
              onChange={(event) =>
                updateViewport(
                  { ...viewport, lockGuides: event.target.checked },
                  event.target.checked ? "Guides locked." : "Guides unlocked.",
                )
              }
            />{" "}
            Lock guides
          </label>
          <label className="grid-toggle">
            <input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} /> Grid
          </label>
          <label className="grid-toggle">
            <input
              aria-label="Enable snapping"
              type="checkbox"
              checked={snap}
              onChange={(event) => setSnap(event.target.checked)}
            />{" "}
            Snap
          </label>
          <label>
            <span>Snap grid</span>
            <select
              aria-label="Snap grid size"
              value={snapGrid}
              onChange={(event) => setSnapGrid(Number(event.target.value) as 1 | 2 | 4 | 8)}
            >
              {[1, 2, 4, 8].map((size) => (
                <option key={size} value={size}>
                  {size} px
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      <div className="creator-editor">
        <aside className="layers-panel" aria-labelledby="layers-title">
          <div className="editor-panel-heading">
            <span>Stack</span>
            <strong id="layers-title">Layers</strong>
            <span id="layer-selection-count">
              {selection.ids.length} selected{selectionLocked ? ", locked" : ""}
            </span>
          </div>
          <div className="layer-command-tools" role="group" aria-label="Layer commands">
            <button
              disabled={selection.ids.length < 2 || selectionLocked}
              title={shortcutTitle("group")}
              onClick={group}
            >
              Group
            </button>
            <button
              disabled={selectionLocked || !selectedLayers.some(({ groupId }) => Boolean(groupId))}
              title={shortcutTitle("ungroup")}
              onClick={ungroup}
            >
              Ungroup
            </button>
            <button disabled={!selection.ids.length} title={shortcutTitle("duplicate")} onClick={duplicate}>
              Duplicate
            </button>
            <button disabled={!selection.ids.length} title={shortcutTitle("copy")} onClick={copy}>
              Copy
            </button>
            <button
              disabled={!selection.ids.length || selectedLayers.every(layerLockedV3)}
              title={shortcutTitle("lock")}
              onClick={() => setLocks(orderedSelection(), true)}
            >
              Lock selection
            </button>
            <button
              disabled={!selection.ids.length || selectedLayers.every((layer) => !layerLockedV3(layer))}
              title={shortcutTitle("unlock")}
              onClick={() => setLocks(orderedSelection(), false)}
            >
              Unlock selection
            </button>
            <button
              disabled={
                !validClipboard() ||
                layers.length + (clipboard.current.snapshot?.layers.length ?? 0) > MAX_DOCUMENT_LAYERS_V3
              }
              title={shortcutTitle("paste")}
              onClick={paste}
            >
              Paste
            </button>
          </div>
          <div
            className="creator-layer-list"
            role="listbox"
            aria-label={`${role} layers`}
            aria-describedby="layer-selection-count"
            aria-multiselectable="true"
          >
            {[...layers].reverse().map((layer) => {
              const index = layers.indexOf(layer),
                rowGroup = layer.groupId ? layers.filter(({ groupId }) => groupId === layer.groupId) : [layer],
                protectedByLock = rowGroup.some(layerLockedV3);
              return (
                <LayerRow
                  key={layer.id}
                  layer={layer}
                  index={index}
                  count={layers.length}
                  protectedByLock={protectedByLock}
                  selected={selection.ids.includes(layer.id)}
                  active={selection.active === layer.id}
                  onSelect={(event) => {
                    select(layer.id, event.shiftKey || event.ctrlKey || event.metaKey);
                  }}
                  onMove={(toIndex) => {
                    const reorder = reorderLayerBlock(layers, layer.id, toIndex > index ? 1 : -1);
                    if (!reorder) return;
                    commit(
                      { version: 3, type: "reorder-layers", ...reorder },
                      `${reorder.layerIds.length} layer${reorder.layerIds.length === 1 ? "" : "s"} reordered.`,
                    );
                  }}
                  onKeyMove={(event) => {
                    if (event.repeat && event.key.startsWith("Arrow")) {
                      event.preventDefault();
                      return;
                    }
                    const delta = keyboardMoveDelta(event.key, event.shiftKey, event.repeat);
                    if (!delta) return;
                    event.preventDefault();
                    const movingLayers = selection.ids.includes(layer.id)
                        ? selectedLayers
                        : layer.groupId
                          ? layers.filter(({ groupId }) => groupId === layer.groupId)
                          : [layer],
                      positions = translateLayerPositionsQ16(movingLayers, {
                        xQ16: delta[0] * 65536,
                        yQ16: delta[1] * 65536,
                      });
                    if (movingLayers.some(layerLockedV3)) {
                      setAnnouncement("Unlock the complete selection before moving it.");
                      return;
                    }
                    commit(
                      movingLayers.length === 1
                        ? {
                            version: 2,
                            type: "move-layer",
                            screen: "top",
                            ...positions[0]!,
                          }
                        : {
                            version: 3,
                            type: "set-layer-positions",
                            positions,
                          },
                      `${movingLayers.length} layer${movingLayers.length === 1 ? "" : "s"} moved.`,
                    );
                  }}
                  onToggle={() =>
                    commit(
                      {
                        version: 2,
                        type: "set-layer-visibility",
                        screen: "top",
                        layerId: layer.id,
                        visible: !layer.visible,
                      },
                      `${layer.name} ${layer.visible ? "hidden" : "shown"}.`,
                    )
                  }
                  onLock={() => setLocks(rowGroup, !rowGroup.every(layerLockedV3))}
                  onRemove={() => remove(layer)}
                  selectRef={(node) => {
                    if (node) layerButtons.current.set(layer.id, node);
                    else layerButtons.current.delete(layer.id);
                  }}
                />
              );
            })}
            {!layers.length && (
              <p className="empty-layers">
                {assigned
                  ? "Using the assigned role asset. Import or paste a PNG to author an override."
                  : "Import, drop, or paste a PNG to start this document."}
              </p>
            )}
            {layers.length > 0 && assigned && (
              <p className="document-authority">
                Authored document active. Its layers override the assigned role asset.
              </p>
            )}
          </div>
          <div className="add-layer-tools">
            <button
              ref={addLayerButton}
              className="primary add-layer"
              disabled={!customProject || readOnly}
              onClick={() => onAdd(role)}
            >
              Import PNG
            </button>
            <button disabled={!customProject} onClick={() => addShape("rectangle")}>
              Rectangle
            </button>
            <button disabled={!customProject} onClick={() => addShape("ellipse")}>
              Ellipse
            </button>
            <button aria-label="Add text" disabled={!customProject} onClick={addText}>
              Text
            </button>
          </div>
        </aside>
        <Artboard
          renderSurface={renderSurface}
          documentKey={`${customProject?.projectId ?? "none"}:${role}`}
          authorityVersion={authorityVersion}
          label={`${role} artboard`}
          width={width}
          height={height}
          screen="top"
          viewport={viewport}
          onViewport={updateViewport}
          grid={grid}
          snap={snap}
          snapGrid={snapGrid}
          documentGuides={document?.guides ?? []}
          layers={layers}
          images={images}
          selection={selection}
          onSelect={select}
          onDelete={() => remove()}
          onImport={(file) => (readOnly ? Promise.resolve() : onImport(role, file))}
          onPasteLayers={paste}
          commit={commit}
          announce={setAnnouncement}
        />
        {selectedLayer ? (
          <LayerInspector
            layer={selectedLayer}
            selectedLayers={selectedLayers}
            screen="top"
            commit={commit}
            announce={setAnnouncement}
            documentSize={{ width, height }}
          />
        ) : (
          <aside className="layer-inspector empty">
            <div className="editor-panel-heading">
              <span>Inspector</span>
              <strong>Nothing selected</strong>
            </div>
            <p>Select a layer on the canvas or in the stack.</p>
          </aside>
        )}
      </div>
      <p className="workspace-announcement" role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}

export const importedLayerSize = fitImageToArtboard;
