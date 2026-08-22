import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
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
import { createDraftStateAggregator, DraftAuthority } from "../draft-authority.js";
import { shortcutTitle } from "../shortcuts.js";
import {
  createLatestFrameQueue,
  findFillPreviewLayer,
  normalizeHexColor,
  type FillPreviewTarget,
  type LatestFrameQueue,
} from "./fill-preview.js";
import {
  cacheInspectorDraft,
  createInspectorDraft,
  inspectorDraftKey,
  inspectorLayerRevision,
  pruneInspectorDrafts,
  readInspectorDraft,
  type InspectorDraft,
  type InspectorDraftCache,
  type InspectorPropertyKey,
} from "./inspector-drafts.js";
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
  selectionVisualBoundsQ16,
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
import {
  MAX_WORKSPACE_DOCK_WIDTH,
  MAX_WORKSPACE_EDIT_SPLIT,
  MIN_WORKSPACE_DOCK_WIDTH,
  MIN_WORKSPACE_EDIT_SPLIT,
  clampWorkspaceDockWidth,
  clampWorkspaceEditSplit,
  dockWidthAfterKey,
  editSplitAfterKey,
} from "./workspace-layout.js";

const isShapeLayerV3 = (layer: VisualLayerV3 | undefined): layer is ShapeLayerV3 => layer?.kind === "shape";
const isTextLayerV3 = (layer: VisualLayerV3 | undefined): layer is TextLayerV3 => layer?.kind === "text";
const isImageLayerV3 = (layer: VisualLayerV3 | undefined): layer is LayerV2 =>
  Boolean(layer && !isShapeLayerV3(layer) && !isTextLayerV3(layer));
const layerLockedV3 = (layer: Pick<VisualLayerV3, "locked">): boolean => layer.locked ?? false;
const LOCKED_EDIT_EXPLANATION = "Locked layers cannot be edited, but visibility may still be toggled.";
const INVALID_FILL_MESSAGE = "Fill color must use six hexadecimal digits, for example #1a2b3c.";

type Screen = "top" | "bottom";
type Commit = (operation: VisualDocumentOperationV3, announcement: string) => Promise<boolean>;
const propertyFields: readonly {
  key: InspectorPropertyKey;
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

function HexColorInput({
  value,
  ariaLabel,
  className,
  disabled,
  stopEscapePropagation = false,
  onCommit,
  onInvalid,
}: {
  value: string;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  stopEscapePropagation?: boolean;
  onCommit(value: string): void;
  onInvalid(): void;
}) {
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (globalThis.document.activeElement !== input.current) setDraft(value);
  }, [value]);
  const commit = () => {
    const normalized = normalizeHexColor(draft);
    if (!normalized) {
      setDraft(value);
      onInvalid();
      return;
    }
    setDraft(normalized);
    onCommit(normalized);
  };
  return (
    <input
      ref={input}
      type="text"
      className={className}
      aria-label={ariaLabel}
      autoCapitalize="none"
      autoComplete="off"
      maxLength={7}
      pattern="#?[0-9a-fA-F]{6}"
      spellCheck={false}
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          if (stopEscapePropagation) event.stopPropagation();
          setDraft(value);
        }
      }}
    />
  );
}

function LayerInspector({
  layer,
  selectedLayers,
  screen,
  commit,
  announce,
  documentSize,
  onClose,
  draft,
  onDraft,
  onFillChange,
  onFillCommit,
}: {
  layer: VisualLayerV3;
  selectedLayers: VisualLayerV3[];
  screen: Screen;
  commit: Commit;
  announce(message: string): void;
  documentSize: { width: number; height: number };
  onClose(): void;
  draft: InspectorDraft;
  onDraft(draft: InspectorDraft): void;
  onFillChange(fill: string): void;
  onFillCommit(): Promise<boolean>;
}) {
  const locked = selectedLayers.some(layerLockedV3);
  const fillCommit = useRef(onFillCommit);
  fillCommit.current = onFillCommit;
  useEffect(
    () => () => {
      void fillCommit.current();
    },
    [],
  );
  const rename = () => {
    const next = draft.name.trim();
    if (!next || next === layer.name) return onDraft({ ...draft, name: layer.name });
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
  const commitCornerRadius = () => {
    if (!isShapeLayerV3(layer) || layer.shape !== "rectangle") return;
    const value = Number(draft.properties.cornerRadius),
      radiusQ16 = Math.round(value * 65536);
    if (!Number.isFinite(value) || !Number.isSafeInteger(radiusQ16) || radiusQ16 < 0) {
      onDraft({
        ...draft,
        properties: { ...draft.properties, cornerRadius: String((layer.cornerRadiusQ16 ?? 0) / 65536) },
      });
      announce("Corner radius must be a non-negative number.");
      return;
    }
    const clamped = Math.min(radiusQ16, Math.floor(Math.min(layer.widthQ16, layer.heightQ16) / 2));
    onDraft({ ...draft, properties: { ...draft.properties, cornerRadius: String(clamped / 65536) } });
    if (clamped === (layer.cornerRadiusQ16 ?? 0)) return;
    commit(
      {
        version: 3,
        type: "set-shape-corner-radius",
        layerId: layer.id,
        cornerRadiusQ16: clamped,
      },
      `${layer.name} corner radius updated.`,
    );
  };
  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Object.fromEntries(
      Object.entries(draft.properties)
        .filter(([key]) => key !== "cornerRadius")
        .map(([key, entry]) => [key, Number(entry)]),
    ) as Record<InspectorPropertyKey, number>;
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
    const xQ16 = value.x * 65536,
      yQ16 = value.y * 65536,
      widthQ16 = value.width * 65536,
      heightQ16 = value.height * 65536,
      opacity = Math.round((value.opacity * 65536) / 100),
      crop = { x: value.cropX, y: value.cropY, width: value.cropWidth, height: value.cropHeight },
      changed =
        xQ16 !== layer.xQ16 ||
        yQ16 !== layer.yQ16 ||
        widthQ16 !== layer.widthQ16 ||
        heightQ16 !== layer.heightQ16 ||
        opacity !== layer.opacity ||
        (isImageLayerV3(layer) &&
          (crop.x !== layer.crop.x ||
            crop.y !== layer.crop.y ||
            crop.width !== layer.crop.width ||
            crop.height !== layer.crop.height));
    if (!changed) return announce(`${layer.name} properties are already up to date.`);
    commit(
      {
        version: 2,
        type: "set-layer-properties",
        screen,
        layerId: layer.id,
        xQ16,
        yQ16,
        widthQ16,
        heightQ16,
        opacity,
        crop,
      },
      `${layer.name} properties updated.`,
    );
  };
  return (
    <>
      <div className="editor-panel-heading">
        <span>Inspector</span>
        <strong id="layer-inspector-title">{layer.name}</strong>
        <button
          type="button"
          data-panel-close="inspector"
          aria-label="Close Inspector panel"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClose}
        >
          Close
        </button>
      </div>
      {locked && <p className="locked-explanation">{LOCKED_EDIT_EXPLANATION}</p>}
      <form
        onSubmit={apply}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          onDraft(createInspectorDraft(layer));
          announce(`${layer.name} draft reset.`);
        }}
      >
        <fieldset className="layer-inspector-fields" disabled={locked}>
          <label className="layer-name-field">
            <span>Name</span>
            <input
              aria-label={`Rename ${layer.name}`}
              value={draft.name}
              onChange={(event) => onDraft({ ...draft, name: event.target.value })}
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
                  value={draft.properties[key]}
                  onChange={(event) =>
                    onDraft({
                      ...draft,
                      properties: { ...draft.properties, [key]: event.target.value },
                    })
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
            <>
              {layer.shape === "rectangle" && (
                <label>
                  <span>Corner radius</span>
                  <input
                    type="number"
                    aria-label="Corner radius"
                    min="0"
                    max={Math.floor(Math.min(layer.widthQ16, layer.heightQ16) / 2) / 65536}
                    step="0.5"
                    value={draft.properties.cornerRadius}
                    onChange={(event) =>
                      onDraft({
                        ...draft,
                        properties: { ...draft.properties, cornerRadius: event.target.value },
                      })
                    }
                    onBlur={commitCornerRadius}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                    }}
                  />
                </label>
              )}
              <label className="shape-fill-field">
                <span>Fill</span>
                <span>
                  <input
                    type="color"
                    aria-label="Fill color picker"
                    value={draft.fill}
                    onChange={(event) => onFillChange(event.target.value)}
                    onBlur={() => void onFillCommit()}
                  />
                  <HexColorInput
                    ariaLabel="Fill color hex"
                    value={draft.fill}
                    onCommit={(fill) => {
                      onFillChange(fill);
                      void onFillCommit();
                    }}
                    onInvalid={() => announce(INVALID_FILL_MESSAGE)}
                  />
                </span>
              </label>
            </>
          )}
          {isTextLayerV3(layer) && (
            <>
              <label className="text-content-field">
                <span>Content</span>
                <textarea
                  aria-label="Text content"
                  rows={4}
                  maxLength={512}
                  value={draft.text.content}
                  onChange={(event) => onDraft({ ...draft, text: { ...draft.text, content: event.target.value } })}
                />
              </label>
              <label className="text-fill-field">
                <span>Text color</span>
                <HexColorInput
                  ariaLabel="Text color hex"
                  value={draft.text.fill}
                  onCommit={(fill) => onDraft({ ...draft, text: { ...draft.text, fill } })}
                  onInvalid={() => announce(INVALID_FILL_MESSAGE)}
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
                  value={draft.text.scale}
                  onChange={(event) => onDraft({ ...draft, text: { ...draft.text, scale: event.target.value } })}
                />
              </label>
              <label>
                <span>Alignment</span>
                <select
                  aria-label="Text alignment"
                  value={draft.text.alignment}
                  onChange={(event) =>
                    onDraft({
                      ...draft,
                      text: { ...draft.text, alignment: event.target.value as TextLayerV3["alignment"] },
                    })
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
                  const scale = Number(draft.text.scale),
                    fill = normalizeHexColor(draft.text.fill);
                  if (
                    !validTextContentV1(draft.text.content) ||
                    !fill ||
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
                      content: draft.text.content,
                      fill,
                      scale,
                      alignment: draft.text.alignment,
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
    </>
  );
}

function LayerThumbnail({ layer, image }: { layer: VisualLayerV3; image?: ImportedPngV1 }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current || !image || !isImageLayerV3(layer)) return;
    const context = canvas.current.getContext("2d");
    if (!context) return;
    const size = 32,
      preview = context.createImageData(size, size),
      crop = layer.crop;
    for (let y = 0; y < size; y += 1)
      for (let x = 0; x < size; x += 1) {
        const sourceX = Math.max(0, Math.min(image.width - 1, crop.x + Math.floor((x * crop.width) / size))),
          sourceY = Math.max(0, Math.min(image.height - 1, crop.y + Math.floor((y * crop.height) / size))),
          source = (sourceY * image.width + sourceX) * 4,
          target = (y * size + x) * 4;
        preview.data[target] = image.pixels[source]!;
        preview.data[target + 1] = image.pixels[source + 1]!;
        preview.data[target + 2] = image.pixels[source + 2]!;
        preview.data[target + 3] = Math.round((image.pixels[source + 3]! * layer.opacity) / 65536);
      }
    context.putImageData(preview, 0, 0);
  }, [image, layer]);
  if (isShapeLayerV3(layer))
    return (
      <span
        className={`layer-thumbnail shape ${layer.shape}`}
        style={{ backgroundColor: layer.fill, opacity: layer.opacity / 65536 }}
        aria-hidden="true"
      />
    );
  if (isTextLayerV3(layer))
    return (
      <span
        className="layer-thumbnail text"
        style={{ color: layer.fill, opacity: layer.opacity / 65536 }}
        aria-hidden="true"
      >
        T
      </span>
    );
  return <canvas ref={canvas} className="layer-thumbnail image" width={32} height={32} aria-hidden="true" />;
}

function LayerRow({
  layer,
  image,
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
  image?: ImportedPngV1;
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
        <LayerThumbnail layer={layer} image={image} />
        <span className="layer-label">
          <span>{layer.name}</span>
          {layer.groupId && <span className="layer-group-label">Group</span>}
        </span>
      </button>
      <div className="layer-quick-actions">
        <button
          aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
          title={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
          onClick={onToggle}
        >
          <ToolIcon name={layer.visible ? "visible" : "hidden"} />
        </button>
        <button
          aria-label={`${layerLockedV3(layer) ? "Unlock" : "Lock"} ${layer.name}`}
          title={`${layerLockedV3(layer) ? "Unlock" : "Lock"} ${layer.name}`}
          aria-pressed={layerLockedV3(layer)}
          onClick={onLock}
        >
          <ToolIcon name={layerLockedV3(layer) ? "unlock" : "lock"} />
        </button>
        <button
          aria-label={`Move ${layer.name} up`}
          title={`Move ${layer.name} up`}
          disabled={protectedByLock || index === count - 1}
          onClick={() => onMove(index + 1)}
        >
          <ToolIcon name="up" />
        </button>
        <button
          aria-label={`Move ${layer.name} down`}
          title={`Move ${layer.name} down`}
          disabled={protectedByLock || index === 0}
          onClick={() => onMove(index - 1)}
        >
          <ToolIcon name="down" />
        </button>
        <button
          aria-label={`Delete ${layer.name}`}
          title={`Delete ${layer.name}`}
          disabled={protectedByLock}
          onClick={onRemove}
        >
          <ToolIcon name="delete" />
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
  autoFit: boolean;
  onAutoFit(viewport: DocumentViewport, announcement?: string): void;
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
  activeTool: EditingTool;
  onTool(tool: EditingTool): void;
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
type TransientLayerTransform = {
  id: string;
  xQ16: number;
  yQ16: number;
  widthQ16?: number;
  heightQ16?: number;
  crop?: LayerV2["crop"];
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
  autoFit,
  onAutoFit,
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
  activeTool,
  onTool,
}: SurfaceProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewportElement = useRef<HTMLDivElement>(null);
  const planeElement = useRef<HTMLDivElement>(null);
  const viewportRef = useRef(viewport);
  const autoFitRef = useRef(autoFit);
  const onAutoFitRef = useRef(onAutoFit);
  viewportRef.current = viewport;
  autoFitRef.current = autoFit;
  onAutoFitRef.current = onAutoFit;
  const manualViewport = (next: DocumentViewport, message?: string) => {
    autoFitRef.current = false;
    onViewport(next, message);
  };
  const drag = useRef<CanvasGesture | undefined>(undefined);
  const commitSerial = useRef(0);
  const pendingTransform = useRef<number | undefined>(undefined);
  const pan = useRef<{ pointerId: number; x: number; y: number; viewport: DocumentViewport } | undefined>(undefined);
  const authorityKey = gestureAuthorityKey(documentKey, authorityVersion);
  const cropMode = activeTool === "crop";
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const [hoveredLayerId, setHoveredLayerId] = useState<string>();
  const selectedLayers = selection.ids.flatMap((id) => layers.find((layer) => layer.id === id) ?? []),
    selectedLayer = layers.find(({ id }) => id === selection.active),
    hoveredLayer = layers.find(({ id }) => id === hoveredLayerId),
    selectionLocked = selectedLayers.some(layerLockedV3),
    displayScale = viewport.zoom / 100,
    displaySize = {
      width: width * displayScale,
      height: height * displayScale,
    };
  const [transient, setTransient] = useState<TransientLayerTransform[]>();
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [guideDraft, setGuideDraft] = useState<DocumentGuideV3 | undefined>(undefined);
  const guideDrag = useRef<GuideGesture | undefined>(undefined);
  const [guidePosition, setGuidePosition] = useState("0");
  const [rulerPosition, setRulerPosition] = useState({ x: 0, y: 0 });
  const addVerticalGuide = useRef<HTMLButtonElement>(null);
  const displaySelectedLayers = selectedLayers.map((layer) => {
      const pending = transient?.find(({ id }) => id === layer.id);
      return pending
        ? {
            ...layer,
            xQ16: pending.xQ16,
            yQ16: pending.yQ16,
            widthQ16: pending.widthQ16 ?? layer.widthQ16,
            heightQ16: pending.heightQ16 ?? layer.heightQ16,
          }
        : layer;
    }),
    selectionBounds = selectionVisualBoundsQ16(displaySelectedLayers);
  useEffect(() => {
    commitSerial.current += 1;
    pendingTransform.current = undefined;
    drag.current = undefined;
    pan.current = undefined;
    guideDrag.current = undefined;
    setTransient(undefined);
    setGuides([]);
    setPanning(false);
    setGuideDraft(undefined);
    setHoveredLayerId(undefined);
  }, [documentKey]);
  useEffect(() => {
    commitSerial.current += 1;
    pendingTransform.current = undefined;
    drag.current = undefined;
    pan.current = undefined;
    guideDrag.current = undefined;
    setTransient(undefined);
    setGuides([]);
    setPanning(false);
    setGuideDraft(undefined);
    setHoveredLayerId(undefined);
  }, [authorityVersion]);
  useEffect(() => {
    if (!selectionLocked) return;
    commitSerial.current += 1;
    pendingTransform.current = undefined;
    drag.current = undefined;
    setTransient(undefined);
    setGuides([]);
    setHoveredLayerId(undefined);
    onTool("select");
  }, [onTool, selectionLocked]);
  useEffect(() => {
    if (activeTool !== "select") setHoveredLayerId(undefined);
  }, [activeTool]);
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
        setHoveredLayerId(undefined);
        if (pendingTransform.current === undefined) setTransient(undefined);
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
      const currentViewport = viewportRef.current;
      if (event.ctrlKey || event.metaKey) {
        const bounds = planeElement.current?.getBoundingClientRect();
        if (!bounds) return;
        const pointer = {
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
          },
          next = zoomViewportAtPoint(currentViewport, currentViewport.zoom * Math.pow(2, -event.deltaY / 300), pointer);
        manualViewport(next, `Zoom ${next.zoom} percent.`);
      } else {
        const next = panViewport(currentViewport, -event.deltaX, -event.deltaY);
        manualViewport(next, `Viewport panned to ${Math.round(next.panX)}, ${Math.round(next.panY)}.`);
      }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [onViewport, viewport]);
  useEffect(() => {
    const plane = planeElement.current;
    if (!plane || !autoFit) return;
    const fit = () => {
      if (!autoFitRef.current) return;
      const bounds = plane.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const next = fitViewport({ width, height }, bounds),
        current = viewportRef.current;
      if (next.zoom === current.zoom && next.panX === current.panX && next.panY === current.panY) return;
      onAutoFitRef.current(next);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(plane);
    return () => observer.disconnect();
  }, [autoFit, documentKey, height, width]);
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
    setHoveredLayerId(undefined);
  };
  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    setHoveredLayerId(undefined);
    if (event.button === 1 || (event.button === 0 && (spaceHeld || activeTool === "hand"))) {
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
    if (pendingTransform.current !== undefined) {
      announce("Wait for the current transform to finish saving.");
      return;
    }
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
      setHoveredLayerId(undefined);
      if (event.buttons === 0) return cancelGesture();
      const next = panViewport(pan.current.viewport, event.clientX - pan.current.x, event.clientY - pan.current.y);
      manualViewport(next, `Viewport panned to ${Math.round(next.panX)}, ${Math.round(next.panY)}.`);
      return;
    }
    if (drag.current) {
      setHoveredLayerId(undefined);
      updateGesture(point(event));
      return;
    }
    if (activeTool !== "select" || event.buttons !== 0 || guideDrag.current || pendingTransform.current !== undefined) {
      setHoveredLayerId(undefined);
      return;
    }
    const layer = layerAtPoint(layers, point(event), new Map(Object.entries(images)));
    setHoveredLayerId((current) => (current === layer?.id ? current : layer?.id));
  };
  const persistTransform = (
    finalTransient: TransientLayerTransform[],
    operation: VisualDocumentOperationV3,
    message: string,
  ) => {
    cancelGesture();
    const serial = ++commitSerial.current;
    pendingTransform.current = serial;
    setTransient(finalTransient);
    const settle = (succeeded: boolean) => {
      if (pendingTransform.current !== serial) return;
      pendingTransform.current = undefined;
      setTransient(undefined);
      if (!succeeded) announce("Transform was not saved; authoritative geometry restored.");
    };
    void commit(operation, message).then(settle, () => settle(false));
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
      if (!changed) {
        cancelGesture();
        return;
      }
      persistTransform(
        positions.map((position) => ({ id: position.layerId, ...position })),
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
    if (
      transform.xQ16 === gesture.layer.xQ16 &&
      transform.yQ16 === gesture.layer.yQ16 &&
      transform.widthQ16 === gesture.layer.widthQ16 &&
      transform.heightQ16 === gesture.layer.heightQ16
    ) {
      cancelGesture();
      return;
    }
    persistTransform(
      [{ id: gesture.layer.id, ...transform }],
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
    setHoveredLayerId(undefined);
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
    setHoveredLayerId(undefined);
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
    <div className={`artboard-stage${viewport.showGuides ? " guides-visible" : ""}`}>
      <div className="artboard-label">
        <strong>{label}</strong>
        <span>
          {width} × {height} px
        </span>
        <button
          className="sr-only"
          type="button"
          data-fit-view="true"
          onClick={() => {
            const bounds = planeElement.current?.getBoundingClientRect();
            if (bounds) onAutoFit(fitViewport({ width, height }, bounds), "Fit to view.");
          }}
        >
          Fit
        </button>
      </div>
      <div
        ref={viewportElement}
        className={`artboard-viewport${spaceHeld || activeTool === "hand" ? " pan-ready" : ""}${panning ? " panning" : ""}`}
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
              onPointerLeave={() => setHoveredLayerId(undefined)}
              onPointerUp={finishPointer}
              onPointerCancel={cancelGesture}
              onLostPointerCapture={() => {
                if (pendingTransform.current === undefined) cancelGesture();
              }}
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
                    onTool("select");
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
            {selectionBounds && (
              <span
                className={`canvas-selection-outline${selectionLocked ? " locked" : ""}`}
                aria-hidden="true"
                style={{
                  left: (selectionBounds.x / 65536) * displayScale,
                  top: (selectionBounds.y / 65536) * displayScale,
                  width: (selectionBounds.width / 65536) * displayScale,
                  height: (selectionBounds.height / 65536) * displayScale,
                }}
              />
            )}
            {hoveredLayer &&
              (() => {
                const bounds = layerVisualBoundsQ16(hoveredLayer);
                return (
                  <span
                    className="canvas-hover-outline"
                    aria-hidden="true"
                    style={{
                      left: (bounds.x / 65536) * displayScale,
                      top: (bounds.y / 65536) * displayScale,
                      width: (bounds.width / 65536) * displayScale,
                      height: (bounds.height / 65536) * displayScale,
                    }}
                  >
                    <span>{hoveredLayer.name}</span>
                  </span>
                );
              })()}
            {selectedLayers.length === 1 &&
              selectedLayer &&
              !selectionLocked &&
              !cropMode &&
              RESIZE_HANDLES.map((handle) => {
                const bounds = selectionBounds!,
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
                      setHoveredLayerId(undefined);
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
            {selectedLayers.length === 1 &&
              selectedLayer &&
              !selectionLocked &&
              cropMode &&
              RESIZE_HANDLES.map((handle) => {
                const bounds = selectionBounds!,
                  left = (bounds.x / 65536) * displayScale,
                  top = (bounds.y / 65536) * displayScale,
                  right = ((bounds.x + bounds.width) / 65536) * displayScale,
                  bottom = ((bounds.y + bounds.height) / 65536) * displayScale,
                  x = handle.includes("w") ? left : handle.includes("e") ? right : (left + right) / 2,
                  y = handle.includes("n") ? top : handle.includes("s") ? bottom : (top + bottom) / 2;
                return (
                  <span key={handle} className="canvas-crop-handle" aria-hidden="true" style={{ left: x, top: y }} />
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
      (record.cornerRadiusQ16 === undefined ||
        (record.shape === "rectangle" &&
          Number.isSafeInteger(record.cornerRadiusQ16) &&
          Number(record.cornerRadiusQ16) >= 0 &&
          Number(record.cornerRadiusQ16) <=
            Math.floor(Math.min(Number(layer.widthQ16), Number(layer.heightQ16)) / 2))) &&
      typeof record.fill === "string" &&
      /^#[0-9a-f]{6}$/.test(record.fill) &&
      Object.keys(layer).every((key) => [...common, "kind", "shape", "cornerRadiusQ16", "fill"].includes(key))
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

export type EditingTool = "select" | "crop" | "hand";
export type CreatorDockTab = "layers" | "properties" | "preview";

const TOOL_ICON_PATHS = {
  select: "m5 3 13 9-6 2-3 6z",
  import: "M4 15v4h16v-4M12 4v11m-4-4 4 4 4-4",
  rectangle: "M4 5h16v14H4z",
  ellipse: "M20 12a8 7 0 1 1-16 0 8 7 0 0 1 16 0",
  text: "M5 5h14M12 5v14m-4 0h8",
  crop: "M7 3v14a2 2 0 0 0 2 2h12M3 7h14a2 2 0 0 1 2 2v12",
  hand: "M7 12V7a2 2 0 0 1 4 0v4-6a2 2 0 0 1 4 0v6-4a2 2 0 0 1 4 0v7c0 5-3 7-7 7-3 0-5-2-7-5l-2-3a2 2 0 0 1 4-1z",
  guides: "M4 3v18M3 7h18M8 3v4m4-4v4m4-4v4M4 12h4m-4 5h4",
  visible: "M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5zM14.5 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0",
  hidden:
    "m4 4 16 16M10 7.3A10 10 0 0 1 12 7c6 0 9.5 5 9.5 5a15 15 0 0 1-2.4 2.7M14 16.7a10 10 0 0 1-2 .3c-6 0-9.5-5-9.5-5a15 15 0 0 1 2.4-2.7",
  lock: "M7 10h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2M8 10V7a4 4 0 0 1 8 0v3",
  unlock: "M7 10h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2M8 10V7a4 4 0 0 1 7.5-2",
  up: "m6 14 6-6 6 6",
  down: "m6 10 6 6 6-6",
  delete: "M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5",
  group: "M3 7h8v8H3zM13 9h8v8h-8zM5 4h14M5 20h14",
  ungroup: "M3 7h8v8H3zM13 9h8v8h-8zM5 4 3 6m16-2 2 2M5 20l-2-2m16 2 2-2",
  duplicate: "M8 8h11v11H8zM16 8V5H5v11h3",
  copy: "M8 8h11v12H8zM5 16H3V4h11v2",
  paste: "M9 5h6m-7 2H5v14h14V7h-3M9 3h6v5H9z",
  collapse: "M4 4v16m6-14 6 6-6 6m-5-6h11",
  expand: "M20 4v16M14 6l-6 6 6 6M8 12h11",
} as const;

function ToolIcon({ name }: { name: keyof typeof TOOL_ICON_PATHS }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={TOOL_ICON_PATHS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type CreatorWorkspaceHandle = { flushPendingVisualDrafts(): Promise<boolean> };
type CreatorWorkspaceProps = {
  customProject?: ThemeProjectV2;
  authorityVersion: number;
  instance: number;
  images?: Record<string, ImportedPngV1>;
  visualDocuments?: Record<CustomVisualRoleV1, VisualDocumentV3>;
  visualSources?: Partial<Record<CustomVisualRoleV1, CustomVisualSourceV1>>;
  readOnly?: boolean;
  toolbarVisible: boolean;
  dockOpen: boolean;
  dockTab: CreatorDockTab;
  dockWidth: number;
  editSplit: number;
  onDockTab(tab: CreatorDockTab): void;
  onDockWidth(width: number): void;
  onEditSplit(split: number): void;
  onCloseDock(): void;
  preview: React.ReactNode;
  status: string;
  acceptedSequence: number;
  onAdd(role: CustomVisualRoleV1): void;
  onImport(role: CustomVisualRoleV1, file: File): Promise<void>;
  onPendingVisualDraftChange(pending: boolean): void;
  onOperation(
    role: CustomVisualRoleV1,
    operation: VisualDocumentOperationV3,
    skipPendingVisualDrafts?: boolean,
  ): Promise<boolean>;
};
type VisualPersistence = { persist(): Promise<boolean>; announcement?: string };
type WorkspaceResize =
  | { kind: "dock"; owner: HTMLElement; pointerId: number; right: number }
  | { kind: "split"; owner: HTMLElement; pointerId: number; top: number; height: number };
const stopWorkspaceResize = (state: { current: WorkspaceResize | undefined }, pointerId?: number) => {
  const active = state.current;
  if (!active || (pointerId !== undefined && active.pointerId !== pointerId)) return;
  if (active.owner.hasPointerCapture(active.pointerId)) active.owner.releasePointerCapture(active.pointerId);
  state.current = undefined;
  globalThis.document.body.classList.remove("workspace-resizing");
};
type QueuedFillPreview = FillPreviewTarget & {
  role: CustomVisualRoleV1;
  field: string;
  revision: number;
  fill: string;
};
type QueuedOpacityPreview = {
  projectId: string;
  role: CustomVisualRoleV1;
  layerId: string;
  field: string;
  revision: number;
  opacity: number;
};

export const CreatorWorkspace = forwardRef<CreatorWorkspaceHandle, CreatorWorkspaceProps>(function CreatorWorkspace(
  {
    customProject,
    authorityVersion,
    instance,
    images = {},
    visualDocuments,
    visualSources = {},
    readOnly = false,
    toolbarVisible,
    dockOpen,
    dockTab,
    dockWidth,
    editSplit,
    onDockTab,
    onDockWidth,
    onEditSplit,
    onCloseDock,
    preview,
    status,
    acceptedSequence,
    onAdd,
    onImport,
    onPendingVisualDraftChange,
    onOperation,
  },
  ref,
) {
  const [role, setRole] = useState<CustomVisualRoleV1>("top-background");
  const [viewports, setViewports] = useState<Partial<Record<CustomVisualRoleV1, DocumentViewport>>>({});
  const [autoFitRoles, setAutoFitRoles] = useState<Partial<Record<CustomVisualRoleV1, boolean>>>({});
  const [grid, setGrid] = useState(false);
  const [snap, setSnap] = useState(true);
  const [snapGrid, setSnapGrid] = useState<1 | 2 | 4 | 8>(1);
  const [activeTool, setActiveTool] = useState<EditingTool>("select");
  const [selections, setSelections] = useState<Partial<Record<CustomVisualRoleV1, LayerSelection>>>({});
  const [inspectorDrafts, setInspectorDrafts] = useState<InspectorDraftCache>(new Map());
  const [fillOverrides, setFillOverrides] = useState(new Map<string, { revision: number; fill: string }>());
  const [opacityOverrides, setOpacityOverrides] = useState(new Map<string, { revision: number; opacity: number }>());
  const [announcement, setAnnouncement] = useState("");
  const workspaceResize = useRef<WorkspaceResize | undefined>(undefined);
  useEffect(() => {
    const stop = () => stopWorkspaceResize(workspaceResize);
    globalThis.addEventListener("blur", stop);
    return () => {
      globalThis.removeEventListener("blur", stop);
      stop();
    };
  }, []);
  const startDockResize = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const dock = event.currentTarget.closest<HTMLElement>(".workspace-dock");
    if (!dock) return;
    event.preventDefault();
    stopWorkspaceResize(workspaceResize);
    event.currentTarget.setPointerCapture(event.pointerId);
    workspaceResize.current = {
      kind: "dock",
      owner: event.currentTarget,
      pointerId: event.pointerId,
      right: dock.getBoundingClientRect().right,
    };
    globalThis.document.body.classList.add("workspace-resizing");
  };
  const startSplitResize = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const stack = event.currentTarget.closest<HTMLElement>(".dock-edit-stack");
    if (!stack) return;
    event.preventDefault();
    stopWorkspaceResize(workspaceResize);
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = stack.getBoundingClientRect();
    workspaceResize.current = {
      kind: "split",
      owner: event.currentTarget,
      pointerId: event.pointerId,
      top: bounds.top,
      height: bounds.height,
    };
    globalThis.document.body.classList.add("workspace-resizing");
  };
  const resizeFromPointer = (event: React.PointerEvent<HTMLElement>) => {
    const active = workspaceResize.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (active.kind === "dock") onDockWidth(clampWorkspaceDockWidth(active.right - event.clientX));
    else if (active.height > 0)
      onEditSplit(clampWorkspaceEditSplit(((event.clientY - active.top) / active.height) * 100));
  };
  const visualDraftsMounted = useRef(true);
  const fillContext = useRef({
    projectId: customProject?.projectId,
    role,
    layers: visualDocuments?.[role]?.layers ?? [],
  });
  fillContext.current = {
    projectId: customProject?.projectId,
    role,
    layers: visualDocuments?.[role]?.layers ?? [],
  };
  const fillPreviewQueue = useRef<LatestFrameQueue<QueuedFillPreview> | null>(null);
  if (!fillPreviewQueue.current)
    fillPreviewQueue.current = createLatestFrameQueue((preview) => {
      const layer = visualDraftsMounted.current ? findFillPreviewLayer(preview, fillContext.current) : undefined;
      if (!isShapeLayerV3(layer) && !isTextLayerV3(layer)) return;
      setInspectorDrafts((current) => {
        const draft = readInspectorDraft(current, preview.field, layer);
        return cacheInspectorDraft(
          current,
          preview.field,
          layer,
          isShapeLayerV3(layer)
            ? { ...draft, fill: preview.fill }
            : { ...draft, text: { ...draft.text, fill: preview.fill } },
        );
      });
      setFillOverrides((current) =>
        new Map(current).set(preview.field, { revision: preview.revision, fill: preview.fill }),
      );
    });
  const opacityPreviewQueue = useRef<LatestFrameQueue<QueuedOpacityPreview> | null>(null);
  if (!opacityPreviewQueue.current)
    opacityPreviewQueue.current = createLatestFrameQueue((preview) => {
      const context = fillContext.current,
        layer =
          visualDraftsMounted.current && context.projectId === preview.projectId && context.role === preview.role
            ? context.layers.find(({ id }) => id === preview.layerId)
            : undefined;
      if (!layer) return;
      setInspectorDrafts((current) => {
        const draft = readInspectorDraft(current, preview.field, layer);
        return cacheInspectorDraft(current, preview.field, layer, {
          ...draft,
          properties: {
            ...draft.properties,
            opacity: String(Math.round((preview.opacity * 100) / 65536)),
          },
        });
      });
      setOpacityOverrides((current) =>
        new Map(current).set(preview.field, { revision: preview.revision, opacity: preview.opacity }),
      );
    });
  const pendingVisualDraftChange = useRef(onPendingVisualDraftChange);
  pendingVisualDraftChange.current = onPendingVisualDraftChange;
  const draftState = useRef<ReturnType<typeof createDraftStateAggregator> | null>(null);
  if (!draftState.current)
    draftState.current = createDraftStateAggregator((dirty) => pendingVisualDraftChange.current(dirty));
  const fillAuthority = useRef<DraftAuthority<VisualPersistence> | null>(null);
  if (!fillAuthority.current)
    fillAuthority.current = new DraftAuthority<VisualPersistence>({
      persist: (_field, edit) => edit.operation.persist(),
      onDraftChange: () => undefined,
      onDraftStateChange: (dirty) => draftState.current!("fill", dirty),
      onInvalid: () => undefined,
      onSuccess: (field, edit, isLatest) => {
        if (!visualDraftsMounted.current || !isLatest) return;
        if (edit.operation.announcement) setAnnouncement(edit.operation.announcement);
        setFillOverrides((current) => {
          if (current.get(field)?.revision !== edit.revision) return current;
          const next = new Map(current);
          next.delete(field);
          return next;
        });
      },
      onFailure: (field, edit, _error, isLatest) => {
        if (!visualDraftsMounted.current || !isLatest) return;
        setFillOverrides((current) => {
          if (current.get(field)?.revision !== edit.revision) return current;
          const next = new Map(current);
          next.delete(field);
          return next;
        });
        setInspectorDrafts((current) => {
          const next = new Map(current);
          next.delete(field);
          return next;
        });
        setAnnouncement("Fill was not saved; the authoritative color was restored.");
      },
    });
  const opacityAuthority = useRef<DraftAuthority<VisualPersistence> | null>(null);
  if (!opacityAuthority.current)
    opacityAuthority.current = new DraftAuthority<VisualPersistence>(
      {
        persist: (_field, edit) => edit.operation.persist(),
        onDraftChange: () => undefined,
        onDraftStateChange: (dirty) => draftState.current!("opacity", dirty),
        onInvalid: () => undefined,
        onSuccess: (field, edit, isLatest) => {
          if (!visualDraftsMounted.current || !isLatest) return;
          setOpacityOverrides((current) => {
            if (current.get(field)?.revision !== edit.revision) return current;
            const next = new Map(current);
            next.delete(field);
            return next;
          });
        },
        onFailure: (field, edit, _error, isLatest) => {
          if (!visualDraftsMounted.current || !isLatest) return;
          setOpacityOverrides((current) => {
            if (current.get(field)?.revision !== edit.revision) return current;
            const next = new Map(current);
            next.delete(field);
            return next;
          });
          setInspectorDrafts((current) => {
            const next = new Map(current);
            next.delete(field);
            return next;
          });
          setAnnouncement("Opacity was not saved; the authoritative value was restored.");
        },
      },
      null,
    );
  useImperativeHandle(
    ref,
    () => ({
      flushPendingVisualDrafts: async () => {
        fillPreviewQueue.current?.flush();
        opacityPreviewQueue.current?.flush();
        const outcomes = await Promise.all([
          fillAuthority.current?.flush() ?? Promise.resolve(true),
          opacityAuthority.current?.flush() ?? Promise.resolve(true),
        ]);
        return outcomes.every(Boolean);
      },
    }),
    [],
  );
  useEffect(() => {
    visualDraftsMounted.current = true;
    return () => {
      visualDraftsMounted.current = false;
      fillPreviewQueue.current?.cancel();
      opacityPreviewQueue.current?.cancel();
      fillAuthority.current?.dispose();
      opacityAuthority.current?.dispose();
    };
  }, []);
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
  const viewport = viewports[role] ?? normalizeViewport();
  const autoFit = autoFitRoles[role] ?? true;
  const layers = document?.layers ?? [];
  const selection = selections[role] ?? { ids: [] };
  const selectedLayers = selection.ids.flatMap((id) => layers.find((layer) => layer.id === id) ?? []);
  const selectedLayer = layers.find(({ id }) => id === selection.active);
  const selectedDraftKey =
    customProject && selectedLayer ? inspectorDraftKey(customProject.projectId, role, selectedLayer.id) : undefined;
  const authoritativeSelectedDraft =
    selectedLayer && selectedDraftKey
      ? readInspectorDraft(inspectorDrafts, selectedDraftKey, selectedLayer)
      : undefined;
  const selectedFillOverride = selectedDraftKey ? fillOverrides.get(selectedDraftKey)?.fill : undefined;
  const selectedOpacityOverride = selectedDraftKey ? opacityOverrides.get(selectedDraftKey)?.opacity : undefined;
  const selectedOpacityPercent = Math.round(
    ((selectedOpacityOverride ?? selectedLayer?.opacity ?? 65536) * 100) / 65536,
  );
  const selectedDraft = (() => {
    if (!authoritativeSelectedDraft || !selectedLayer) return authoritativeSelectedDraft;
    let next =
      selectedOpacityOverride === undefined
        ? authoritativeSelectedDraft
        : {
            ...authoritativeSelectedDraft,
            properties: {
              ...authoritativeSelectedDraft.properties,
              opacity: String(Math.round((selectedOpacityOverride * 100) / 65536)),
            },
          };
    if (!selectedFillOverride) return next;
    if (isShapeLayerV3(selectedLayer)) next = { ...next, fill: selectedFillOverride };
    else if (isTextLayerV3(selectedLayer)) next = { ...next, text: { ...next.text, fill: selectedFillOverride } };
    return next;
  })();
  const selectionLocked = selectedLayers.some(layerLockedV3);
  const canCrop = selectedLayers.length === 1 && isImageLayerV3(selectedLayer) && !selectionLocked;
  const assigned = visualSources[role];
  const width = document?.width ?? CUSTOM_VISUAL_DOCUMENTS_V1[role].width;
  const height = document?.height ?? CUSTOM_VISUAL_DOCUMENTS_V1[role].height;
  const roleFillOverrides = new Map(
    customProject
      ? layers.flatMap((layer) => {
          const fill = fillOverrides.get(inspectorDraftKey(customProject.projectId, role, layer.id))?.fill;
          return fill ? [[layer.id, fill] as const] : [];
        })
      : [],
  );
  const roleOpacityOverrides = new Map(
    customProject
      ? layers.flatMap((layer) => {
          const opacity = opacityOverrides.get(inspectorDraftKey(customProject.projectId, role, layer.id))?.opacity;
          return opacity === undefined ? [] : [[layer.id, opacity] as const];
        })
      : [],
  );
  const renderSurface: WorkspaceSurface = visualDocumentSurface(
    { width, height, layers },
    assigned,
    "top",
    roleFillOverrides,
    roleOpacityOverrides,
  );
  const updateInspectorDraft = (next: InspectorDraft) => {
    if (!selectedLayer || !selectedDraftKey) return;
    setInspectorDrafts((current) => cacheInspectorDraft(current, selectedDraftKey, selectedLayer, next));
  };
  const commit: Commit = async (operation, message) => {
    if (readOnly) {
      setAnnouncement("This project is read-only until recovery diagnostics are resolved.");
      return false;
    }
    const targets = new Set(mutatedLayerIds(operation));
    for (const target of [...targets]) {
      const groupId = layers.find(({ id }) => id === target)?.groupId;
      if (groupId) for (const member of layers) if (member.groupId === groupId) targets.add(member.id);
    }
    if (layers.some(({ id, locked }) => targets.has(id) && locked)) {
      setAnnouncement(LOCKED_EDIT_EXPLANATION);
      return false;
    }
    setAnnouncement(message);
    return onOperation(role, operation);
  };
  const scheduleFill = (layer: VisualLayerV3, fill: string) => {
    const normalized = normalizeHexColor(fill);
    if (
      !customProject ||
      readOnly ||
      layerLockedV3(layer) ||
      (!isShapeLayerV3(layer) && !isTextLayerV3(layer)) ||
      !normalized
    )
      return;
    const field = inspectorDraftKey(customProject.projectId, role, layer.id);
    const pendingPreview = fillPreviewQueue.current?.pending();
    const displayedFill =
      pendingPreview?.field === field ? pendingPreview.fill : (fillOverrides.get(field)?.fill ?? layer.fill);
    if (normalized === displayedFill) return;
    const operation: VisualDocumentOperationV3 = isShapeLayerV3(layer)
        ? { version: 3, type: "set-shape-fill", layerId: layer.id, fill: normalized }
        : { version: 3, type: "set-text-fill", layerId: layer.id, fill: normalized },
      revision = fillAuthority.current!.schedule(
        field,
        {
          persist: () => onOperation(role, operation, true),
          announcement: `${layer.name} fill updated.`,
        },
        role,
      );
    fillPreviewQueue.current!.schedule({
      projectId: customProject.projectId,
      role,
      field,
      layerId: layer.id,
      layerKind: layer.kind,
      revision,
      fill: normalized,
    });
  };
  const flushSelectedFill = () => {
    fillPreviewQueue.current?.flush();
    return selectedDraftKey ? fillAuthority.current!.flushField(selectedDraftKey) : Promise.resolve(true);
  };
  const scheduleOpacity = (layer: VisualLayerV3, opacity: number) => {
    if (
      !customProject ||
      readOnly ||
      layerLockedV3(layer) ||
      !Number.isSafeInteger(opacity) ||
      opacity < 0 ||
      opacity > 65536
    ) {
      setAnnouncement("Opacity must be an integer from 0 to 100.");
      return;
    }
    const field = inspectorDraftKey(customProject.projectId, role, layer.id),
      pendingPreview = opacityPreviewQueue.current?.pending(),
      displayedOpacity =
        pendingPreview?.field === field
          ? pendingPreview.opacity
          : (opacityOverrides.get(field)?.opacity ?? layer.opacity);
    if (opacity === displayedOpacity) return;
    const operation: VisualDocumentOperationV3 = {
        version: 3,
        type: "set-layer-opacity",
        layerId: layer.id,
        opacity,
      },
      revision = opacityAuthority.current!.schedule(field, { persist: () => onOperation(role, operation, true) }, role);
    opacityPreviewQueue.current!.schedule({
      projectId: customProject.projectId,
      role,
      layerId: layer.id,
      field,
      revision,
      opacity,
    });
  };
  const flushSelectedOpacity = () => {
    opacityPreviewQueue.current?.flush();
    return selectedDraftKey ? opacityAuthority.current!.flushField(selectedDraftKey) : Promise.resolve(true);
  };
  const flushVisualDrafts = async () => {
    fillPreviewQueue.current?.flush();
    opacityPreviewQueue.current?.flush();
    const outcomes = await Promise.all([fillAuthority.current!.flush(), opacityAuthority.current!.flush()]);
    return outcomes.every(Boolean);
  };
  const opacityInteraction = useRef<{ field: string; override?: { revision: number; opacity: number } } | undefined>(
    undefined,
  );
  const beginOpacityInteraction = () => {
    if (!selectedDraftKey || opacityInteraction.current?.field === selectedDraftKey) return;
    const override = opacityOverrides.get(selectedDraftKey);
    opacityInteraction.current = { field: selectedDraftKey, override };
  };
  const finishOpacityInteraction = () => {
    opacityInteraction.current = undefined;
    void flushSelectedOpacity();
  };
  const restoreOpacityInteraction = (layer: VisualLayerV3) => {
    const baseline = opacityInteraction.current;
    if (baseline && baseline.field === selectedDraftKey) {
      opacityPreviewQueue.current?.cancel();
      opacityAuthority.current!.discardField(baseline.field);
      setOpacityOverrides((current) => {
        const next = new Map(current);
        if (baseline.override) next.set(baseline.field, baseline.override);
        else next.delete(baseline.field);
        return next;
      });
      setInspectorDrafts((current) => {
        const next = new Map(current);
        next.delete(baseline.field);
        return next;
      });
      setAnnouncement(`${layer.name} opacity edit cancelled.`);
    }
    opacityInteraction.current = undefined;
  };
  useEffect(() => {
    const revisions = new Map<string, string>();
    if (customProject)
      for (const documentRole of CUSTOM_VISUAL_ROLES_V1)
        for (const layer of visualDocuments?.[documentRole]?.layers ?? [])
          revisions.set(
            inspectorDraftKey(customProject.projectId, documentRole, layer.id),
            inspectorLayerRevision(layer),
          );
    setInspectorDrafts((current) => pruneInspectorDrafts(current, revisions));
  }, [customProject?.projectId, visualDocuments]);
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
    fillPreviewQueue.current?.cancel();
    opacityPreviewQueue.current?.cancel();
    pendingSelection.current = undefined;
    pendingFocus.current = undefined;
    deletionSelections.current = {};
    insertionSelections.current = {};
    clipboard.current = { pasteCount: 0 };
    selectionFocus.current = undefined;
    setSelections({});
    setInspectorDrafts(new Map());
    setFillOverrides(new Map());
    setOpacityOverrides(new Map());
    fillAuthority.current?.reset();
    opacityAuthority.current?.reset();
    opacityInteraction.current = undefined;
    setViewports({});
    setAutoFitRoles({});
    setRole("top-background");
    setActiveTool("select");
  }, [customProject?.projectId]);
  useEffect(() => {
    if (activeTool === "crop" && !canCrop) setActiveTool("select");
  }, [activeTool, canCrop]);
  const storeViewport = (next: DocumentViewport) => {
    const normalized = normalizeViewport(next);
    setViewports((current) => {
      const existing = current[role];
      return existing &&
        existing.zoom === normalized.zoom &&
        existing.panX === normalized.panX &&
        existing.panY === normalized.panY &&
        existing.showGuides === normalized.showGuides &&
        existing.lockGuides === normalized.lockGuides
        ? current
        : { ...current, [role]: normalized };
    });
  };
  const updateViewport = (next: DocumentViewport, message?: string, geometryChanged = true) => {
    storeViewport(next);
    if (geometryChanged) setAutoFitRoles((current) => ({ ...current, [role]: false }));
    if (message) setAnnouncement(message);
  };
  const autoFitViewport = (next: DocumentViewport, message?: string) => {
    storeViewport(next);
    setAutoFitRoles((current) => (current[role] === true ? current : { ...current, [role]: true }));
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
    void flushVisualDrafts();
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
      <h2 className="sr-only" id="creator-workspace-title">
        Theme canvas
      </h2>
      <nav className="document-switcher" aria-label="Theme documents">
        {CUSTOM_VISUAL_ROLES_V1.map((item) => {
          const label: Record<CustomVisualRoleV1, string> = {
            "top-background": "Top",
            "bottom-background": "Bottom",
            "grid-cell": "Grid",
            "grid-cell-selected": "Grid selected",
            "banner-cell": "Banner",
            "banner-cell-selected": "Banner selected",
            scrim: "Scrim",
          };
          return (
            <button
              key={item}
              aria-label={item}
              className={role === item ? "active" : ""}
              aria-pressed={role === item}
              onClick={() => {
                void flushVisualDrafts();
                setRole(item);
                setActiveTool("select");
              }}
            >
              {label[item]}
            </button>
          );
        })}
      </nav>
      <div className="context-options" aria-label="Tool options">
        <strong>{activeTool === "select" ? "Select" : activeTool === "crop" ? "Crop image" : "Hand"}</strong>
        {activeTool === "select" && (
          <>
            <label>
              <input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} /> Grid
            </label>
            <label>
              <input
                aria-label="Enable snapping"
                type="checkbox"
                checked={snap}
                onChange={(event) => setSnap(event.target.checked)}
              />{" "}
              Snap
            </label>
            <label>
              Grid size{" "}
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
            {viewport.showGuides && (
              <label>
                <input
                  aria-label="Lock guides"
                  type="checkbox"
                  checked={viewport.lockGuides}
                  onChange={(event) =>
                    updateViewport(
                      { ...viewport, lockGuides: event.target.checked },
                      event.target.checked ? "Guides locked." : "Guides unlocked.",
                      false,
                    )
                  }
                />{" "}
                Lock guides
              </label>
            )}
            {selectedLayers.length === 1 && selectedLayer && (
              <div className="context-layer-properties" role="group" aria-label="Selected layer quick properties">
                <span className="context-layer-identity" title={selectedLayer.name}>
                  Layer <strong>{selectedLayer.name}</strong>
                  {selectionLocked ? " · Locked" : ""}
                </span>
                <div className="context-opacity-fields" role="group" aria-label={`${selectedLayer.name} opacity`}>
                  <span>Opacity</span>
                  <input
                    type="range"
                    aria-label={`${selectedLayer.name} opacity slider`}
                    min="0"
                    max="100"
                    step="1"
                    value={selectedOpacityPercent}
                    data-managed-draft="true"
                    disabled={selectionLocked || readOnly}
                    onFocus={beginOpacityInteraction}
                    onPointerDown={beginOpacityInteraction}
                    onChange={(event) =>
                      scheduleOpacity(selectedLayer, Math.round((Number(event.target.value) * 65536) / 100))
                    }
                    onPointerUp={finishOpacityInteraction}
                    onPointerCancel={finishOpacityInteraction}
                    onBlur={finishOpacityInteraction}
                    onKeyDown={(event) => {
                      if (event.key !== "Escape") {
                        beginOpacityInteraction();
                        return;
                      }
                      event.preventDefault();
                      event.stopPropagation();
                      restoreOpacityInteraction(selectedLayer);
                      event.currentTarget.blur();
                    }}
                    onKeyUp={(event) => {
                      if (event.key !== "Escape") finishOpacityInteraction();
                    }}
                  />
                  <input
                    type="number"
                    aria-label={`${selectedLayer.name} opacity percent`}
                    min="0"
                    max="100"
                    step="1"
                    value={selectedOpacityPercent}
                    data-managed-draft="true"
                    disabled={selectionLocked || readOnly}
                    onFocus={beginOpacityInteraction}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isInteger(value) && value >= 0 && value <= 100)
                        scheduleOpacity(selectedLayer, Math.round((value * 65536) / 100));
                    }}
                    onBlur={(event) => {
                      const value = Number(event.currentTarget.value);
                      if (!Number.isInteger(value) || value < 0 || value > 100)
                        setAnnouncement("Opacity must be an integer from 0 to 100.");
                      event.currentTarget.value = String(selectedOpacityPercent);
                      finishOpacityInteraction();
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Escape") beginOpacityInteraction();
                      if (event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.blur();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        restoreOpacityInteraction(selectedLayer);
                        event.currentTarget.blur();
                      }
                    }}
                    onKeyUp={(event) => {
                      if (event.key !== "Escape" && event.key !== "Enter") finishOpacityInteraction();
                    }}
                  />
                  %
                </div>
                {(isShapeLayerV3(selectedLayer) || isTextLayerV3(selectedLayer)) && (
                  <div className="context-fill-fields" role="group" aria-label={`${selectedLayer.name} fill`}>
                    <span>Fill</span>
                    <input
                      type="color"
                      aria-label={`${selectedLayer.name} fill color`}
                      value={selectedFillOverride ?? selectedLayer.fill}
                      disabled={selectionLocked || readOnly}
                      onChange={(event) => scheduleFill(selectedLayer, event.target.value)}
                      onBlur={() => void flushSelectedFill()}
                    />
                    <HexColorInput
                      className="context-fill-hex"
                      ariaLabel={`${selectedLayer.name} fill hex`}
                      value={selectedFillOverride ?? selectedLayer.fill}
                      disabled={selectionLocked || readOnly}
                      stopEscapePropagation
                      onCommit={(fill) => {
                        scheduleFill(selectedLayer, fill);
                        void flushSelectedFill();
                      }}
                      onInvalid={() => setAnnouncement(INVALID_FILL_MESSAGE)}
                    />
                  </div>
                )}
              </div>
            )}
            {selectedLayers.length > 1 && (
              <span className="context-selection-summary">{selectedLayers.length} layers selected</span>
            )}
          </>
        )}
        {activeTool === "crop" && (
          <button type="button" onClick={() => setActiveTool("select")}>
            Done cropping
          </button>
        )}
        {activeTool === "hand" && <span>Drag the artboard to pan</span>}
      </div>
      <div
        className={`creator-editor${toolbarVisible ? " toolbar-visible" : ""}${dockOpen ? " dock-visible" : ""}`}
        style={
          {
            "--workspace-dock-width": `${dockWidth}px`,
            "--dock-edit-split": String(editSplit),
          } as React.CSSProperties
        }
      >
        {!dockOpen && (
          <button
            type="button"
            className="dock-edge-tab"
            aria-label="Open workspace dock"
            title="Open workspace dock"
            onClick={() => onDockTab(dockTab)}
          >
            <ToolIcon name="expand" />
          </button>
        )}
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
          autoFit={autoFit}
          onAutoFit={autoFitViewport}
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
          activeTool={activeTool}
          onTool={setActiveTool}
        />
        {toolbarVisible && (
          <nav className="tool-rail" aria-label="Editing tools">
            <button
              type="button"
              aria-label="Select and move"
              title="Select and move"
              aria-pressed={activeTool === "select"}
              onClick={() => setActiveTool("select")}
            >
              <ToolIcon name="select" />
            </button>
            <button
              ref={addLayerButton}
              type="button"
              aria-label="Import image"
              title="Import image"
              disabled={!customProject || readOnly}
              onClick={() => onAdd(role)}
            >
              <ToolIcon name="import" />
            </button>
            <button
              type="button"
              aria-label="Add rectangle"
              title="Add rectangle"
              disabled={!customProject || readOnly}
              onClick={() => addShape("rectangle")}
            >
              <ToolIcon name="rectangle" />
            </button>
            <button
              type="button"
              aria-label="Add ellipse"
              title="Add ellipse"
              disabled={!customProject || readOnly}
              onClick={() => addShape("ellipse")}
            >
              <ToolIcon name="ellipse" />
            </button>
            <button
              type="button"
              aria-label="Add text"
              title="Add text"
              disabled={!customProject || readOnly}
              onClick={addText}
            >
              <ToolIcon name="text" />
            </button>
            <button
              type="button"
              aria-label="Crop selected image"
              title="Crop selected image"
              aria-pressed={activeTool === "crop"}
              disabled={!canCrop}
              onClick={() => setActiveTool("crop")}
            >
              <ToolIcon name="crop" />
            </button>
            <button
              type="button"
              aria-label="Hand pan tool"
              title="Hand pan tool"
              aria-pressed={activeTool === "hand"}
              onClick={() => setActiveTool("hand")}
            >
              <ToolIcon name="hand" />
            </button>
            <button
              type="button"
              aria-label="Toggle guides"
              title="Toggle guides"
              aria-pressed={viewport.showGuides}
              onClick={() =>
                updateViewport(
                  { ...viewport, showGuides: !viewport.showGuides },
                  viewport.showGuides ? "Guides hidden; hidden guides do not snap." : "Guides shown.",
                  false,
                )
              }
            >
              <ToolIcon name="guides" />
            </button>
          </nav>
        )}
        {dockOpen && (
          <aside id="workspace-dock" className="workspace-dock" aria-label="Workspace dock">
            <div
              className="dock-resize-handle"
              role="separator"
              tabIndex={0}
              aria-label="Resize workspace dock"
              aria-describedby="dock-width-resize-instructions"
              aria-orientation="vertical"
              aria-valuemin={MIN_WORKSPACE_DOCK_WIDTH}
              aria-valuemax={MAX_WORKSPACE_DOCK_WIDTH}
              aria-valuenow={dockWidth}
              onKeyDown={(event) => {
                const next = dockWidthAfterKey(dockWidth, event.key);
                if (next === undefined) return;
                event.preventDefault();
                onDockWidth(next);
              }}
              onPointerDown={startDockResize}
              onPointerMove={resizeFromPointer}
              onPointerUp={(event) => stopWorkspaceResize(workspaceResize, event.pointerId)}
              onPointerCancel={(event) => stopWorkspaceResize(workspaceResize, event.pointerId)}
              onLostPointerCapture={() => stopWorkspaceResize(workspaceResize)}
            />
            <span id="dock-width-resize-instructions" className="sr-only">
              Use Left and Right arrow keys to resize the right-side dock. Home uses the minimum width and End the
              maximum.
            </span>
            <div className="dock-tabs" role="group" aria-label="Workspace panels">
              <button
                type="button"
                className="dock-close"
                aria-label="Collapse workspace dock"
                title="Collapse workspace dock"
                onClick={onCloseDock}
              >
                <ToolIcon name="collapse" />
              </button>
              {(["layers", "properties", "preview"] as const).map((tab) => (
                <button
                  key={tab}
                  id={`dock-tab-${tab}`}
                  aria-pressed={dockTab === tab}
                  aria-controls={`dock-panel-${tab}`}
                  onClick={() => onDockTab(tab)}
                >
                  {tab[0]!.toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            {dockTab !== "preview" && (
              <div className={`dock-edit-stack compact-${dockTab}`}>
                <section
                  id="dock-panel-layers"
                  className="layers-panel"
                  tabIndex={-1}
                  aria-labelledby="dock-tab-layers"
                >
                  <>
                    <div className="editor-panel-heading">
                      <span>Stack</span>
                      <strong id="layers-title">Layers</strong>
                      <span id="layer-selection-count">
                        {selection.ids.length} selected{selectionLocked ? ", locked" : ""}
                      </span>
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
                          rowGroup = layer.groupId
                            ? layers.filter(({ groupId }) => groupId === layer.groupId)
                            : [layer],
                          protectedByLock = rowGroup.some(layerLockedV3);
                        return (
                          <LayerRow
                            key={layer.id}
                            layer={layer}
                            image={isImageLayerV3(layer) ? images[layer.asset.sha256] : undefined}
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
                    <div className="layer-command-tools" role="group" aria-label="Layer commands">
                      <button
                        type="button"
                        aria-label="Group"
                        disabled={selection.ids.length < 2 || selectionLocked}
                        title={shortcutTitle("group")}
                        onClick={group}
                      >
                        <ToolIcon name="group" />
                      </button>
                      <button
                        type="button"
                        aria-label="Ungroup"
                        disabled={selectionLocked || !selectedLayers.some(({ groupId }) => Boolean(groupId))}
                        title={shortcutTitle("ungroup")}
                        onClick={ungroup}
                      >
                        <ToolIcon name="ungroup" />
                      </button>
                      <button
                        type="button"
                        aria-label="Duplicate selected layers"
                        disabled={!selection.ids.length}
                        title={shortcutTitle("duplicate")}
                        onClick={duplicate}
                      >
                        <ToolIcon name="duplicate" />
                      </button>
                      <button
                        type="button"
                        aria-label="Copy selected layers"
                        disabled={!selection.ids.length}
                        title={shortcutTitle("copy")}
                        onClick={copy}
                      >
                        <ToolIcon name="copy" />
                      </button>
                      <button
                        type="button"
                        aria-label="Lock selection"
                        disabled={!selection.ids.length || selectedLayers.every(layerLockedV3)}
                        title={shortcutTitle("lock")}
                        onClick={() => setLocks(orderedSelection(), true)}
                      >
                        <ToolIcon name="lock" />
                      </button>
                      <button
                        type="button"
                        aria-label="Unlock selection"
                        disabled={!selection.ids.length || selectedLayers.every((layer) => !layerLockedV3(layer))}
                        title={shortcutTitle("unlock")}
                        onClick={() => setLocks(orderedSelection(), false)}
                      >
                        <ToolIcon name="unlock" />
                      </button>
                      <button
                        type="button"
                        aria-label="Paste layers"
                        disabled={
                          !validClipboard() ||
                          layers.length + (clipboard.current.snapshot?.layers.length ?? 0) > MAX_DOCUMENT_LAYERS_V3
                        }
                        title={shortcutTitle("paste")}
                        onClick={paste}
                      >
                        <ToolIcon name="paste" />
                      </button>
                    </div>
                  </>
                </section>
                <div
                  className="dock-stack-separator"
                  role="separator"
                  tabIndex={0}
                  aria-label="Resize Layers and Properties"
                  aria-describedby="dock-split-resize-instructions"
                  aria-orientation="horizontal"
                  aria-valuemin={MIN_WORKSPACE_EDIT_SPLIT}
                  aria-valuemax={MAX_WORKSPACE_EDIT_SPLIT}
                  aria-valuenow={editSplit}
                  onKeyDown={(event) => {
                    const next = editSplitAfterKey(editSplit, event.key);
                    if (next === undefined) return;
                    event.preventDefault();
                    onEditSplit(next);
                  }}
                  onPointerDown={startSplitResize}
                  onPointerMove={resizeFromPointer}
                  onPointerUp={(event) => stopWorkspaceResize(workspaceResize, event.pointerId)}
                  onPointerCancel={(event) => stopWorkspaceResize(workspaceResize, event.pointerId)}
                  onLostPointerCapture={() => stopWorkspaceResize(workspaceResize)}
                />
                <span id="dock-split-resize-instructions" className="sr-only">
                  Use Up and Down arrow keys to resize Layers and Properties. Home gives Layers the minimum space and
                  End the maximum.
                </span>
                <section
                  id="dock-panel-properties"
                  className={`layer-inspector${selectedLayer ? "" : " empty"}`}
                  tabIndex={-1}
                  aria-labelledby="dock-tab-properties"
                >
                  {selectedLayer && selectedDraft ? (
                    <LayerInspector
                      key={selectedDraftKey}
                      layer={selectedLayer}
                      selectedLayers={selectedLayers}
                      screen="top"
                      commit={commit}
                      announce={setAnnouncement}
                      documentSize={{ width, height }}
                      onClose={onCloseDock}
                      draft={selectedDraft}
                      onDraft={updateInspectorDraft}
                      onFillChange={(fill) => scheduleFill(selectedLayer, fill)}
                      onFillCommit={flushSelectedFill}
                    />
                  ) : (
                    <>
                      <div className="editor-panel-heading">
                        <span>Inspector</span>
                        <strong id="empty-inspector-title">Nothing selected</strong>
                        <button
                          type="button"
                          data-panel-close="inspector"
                          aria-label="Close Inspector panel"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={onCloseDock}
                        >
                          Close
                        </button>
                      </div>
                      <p>Select a layer on the canvas or in the stack.</p>
                    </>
                  )}
                </section>
              </div>
            )}
            {dockTab === "preview" && (
              <section
                id="dock-panel-preview"
                className="dock-preview"
                tabIndex={-1}
                aria-labelledby="dock-tab-preview"
              >
                {preview}
              </section>
            )}
          </aside>
        )}
      </div>
      <footer className="workspace-status">
        <span>
          {width} × {height} px
        </span>
        <div className="status-zoom" role="group" aria-label="Viewport zoom and fit">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => updateViewport(zoomViewportAtPoint(viewport, viewport.zoom / 2, { x: 0, y: 0 }))}
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
              value={viewport.zoom}
              onChange={(event) =>
                updateViewport(zoomViewportAtPoint(viewport, Number(event.target.value), { x: 0, y: 0 }))
              }
            />
            %
          </label>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => updateViewport(zoomViewportAtPoint(viewport, viewport.zoom * 2, { x: 0, y: 0 }))}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => updateViewport(normalizeViewport({ ...viewport, zoom: 100, panX: 0, panY: 0 }))}
          >
            100%
          </button>
          <button
            type="button"
            onClick={() => globalThis.document.querySelector<HTMLButtonElement>('[data-fit-view="true"]')?.click()}
          >
            Fit
          </button>
        </div>
        <span>
          {snap ? `Snap ${snapGrid}px` : "Snap off"}
          {grid ? " · Grid" : ""}
          {viewport.showGuides ? " · Guides" : ""}
        </span>
        <span>{selection.ids.length} selected</span>
        <span className="workspace-announcement" role="status" aria-live="polite">
          {announcement}
        </span>
        <span className="status" data-accepted-sequence={acceptedSequence} aria-live="polite">
          {status}
        </span>
      </footer>
    </section>
  );
});

export const importedLayerSize = fitImageToArtboard;
