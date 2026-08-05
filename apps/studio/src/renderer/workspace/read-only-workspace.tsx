import { useEffect, useRef, useState } from "react";
import type { PreviewModel } from "../../../../../packages/theme-core/src/preview.js";
import type {
  CustomRenderPlanV1,
  LayerV2,
  OperationV2,
  RenderSurfacePlanV1,
  ThemeProjectV2,
} from "../../../../../packages/theme-core/src/index.js";
import {
  SURFACE_SIZE,
  focusAfterLayerRemoval,
  initialWorkspaceView,
  paintWorkspaceSurface,
  pointerTranslationQ16,
  updateWorkspaceView,
  type WorkspaceFocus,
  type WorkspaceView,
} from "./workspace-model.js";

type Scene = PreviewModel["scenes"][number];
const screens = ["top", "bottom"] as const;
const fallback = { background: "#10243a", accent: "#f04491" };
// prettier-ignore
const keyDelta: Record<string, readonly [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const color = (value: unknown, defaultValue: string) =>
  typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : defaultValue;
type Screen = "top" | "bottom";
type Commit = (operation: OperationV2, announcement: string) => void;
type PropertyKey = "x" | "y" | "width" | "height" | "cropX" | "cropY" | "cropWidth" | "cropHeight" | "opacity";
const propertyFields: readonly { key: PropertyKey; label: string; min?: number; max?: number }[] = [
  { key: "x", label: "Layer x" },
  { key: "y", label: "Layer y" },
  { key: "width", label: "Layer width", min: 1 },
  { key: "height", label: "Layer height", min: 1 },
  { key: "cropX", label: "Crop x", min: 0 },
  { key: "cropY", label: "Crop y", min: 0 },
  { key: "cropWidth", label: "Crop width", min: 1 },
  { key: "cropHeight", label: "Crop height", min: 1 },
  { key: "opacity", label: "Opacity", min: 0, max: 100 },
] as const;
const propertyDraft = (layer: LayerV2): Record<PropertyKey, string> => ({
  x: String(layer.xQ16 / 65536),
  y: String(layer.yQ16 / 65536),
  width: String(layer.widthQ16 / 65536),
  height: String(layer.heightQ16 / 65536),
  cropX: String(layer.crop.x),
  cropY: String(layer.crop.y),
  cropWidth: String(layer.crop.width),
  cropHeight: String(layer.crop.height),
  opacity: String(Math.round((layer.opacity * 100) / 65536)),
});

function LayerProperties({
  layer,
  screen,
  commit,
  announce,
}: {
  layer: LayerV2;
  screen: Screen;
  commit: Commit;
  announce(message: string): void;
}) {
  const [draft, setDraft] = useState(() => propertyDraft(layer));
  useEffect(() => setDraft(propertyDraft(layer)), [layer]);
  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Object.fromEntries(Object.entries(draft).map(([key, entry]) => [key, Number(entry)])) as Record<
      PropertyKey,
      number
    >;
    const integer = Object.values(value).every(Number.isSafeInteger),
      cropValid = value.cropX + value.cropWidth <= layer.width && value.cropY + value.cropHeight <= layer.height;
    if (
      !integer ||
      value.width < 1 ||
      value.height < 1 ||
      value.cropX < 0 ||
      value.cropY < 0 ||
      value.cropWidth < 1 ||
      value.cropHeight < 1 ||
      value.opacity < 0 ||
      value.opacity > 100 ||
      !cropValid
    )
      return announce(`${layer.name} properties are outside valid bounds.`);
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
        crop: { x: value.cropX, y: value.cropY, width: value.cropWidth, height: value.cropHeight },
      },
      `${layer.name} properties updated.`,
    );
  };
  return (
    <details className="layer-properties">
      <summary>Properties</summary>
      <form onSubmit={apply}>
        {propertyFields.map(({ key, label, min, max }) => (
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
              onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
            />
          </label>
        ))}
        <button type="submit">Apply properties</button>
      </form>
    </details>
  );
}

function LayerRow({
  layer,
  screen,
  index,
  count,
  selected,
  onSelect,
  onKeyMove,
  commit,
  remove,
  announce,
}: {
  layer: LayerV2;
  screen: Screen;
  index: number;
  count: number;
  selected: boolean;
  onSelect(): void;
  onKeyMove(event: React.KeyboardEvent): void;
  commit: Commit;
  remove(): void;
  announce(message: string): void;
}) {
  const [name, setName] = useState(layer.name);
  useEffect(() => setName(layer.name), [layer.name]);
  const rename = () => {
    const next = name.trim();
    if (!next || next === layer.name) return setName(layer.name);
    commit(
      { version: 2, type: "rename-layer", screen, layerId: layer.id, name: next },
      `${layer.name} renamed to ${next}.`,
    );
  };
  return (
    <div className="layer-row" role="listitem">
      <button
        data-layer-focus={layer.id}
        aria-current={selected}
        aria-label={`Select ${layer.name}`}
        onClick={onSelect}
        onKeyDown={onKeyMove}
      >
        {layer.name}
      </button>
      <input
        aria-label={`Rename ${layer.name}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={rename}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            rename();
          } else if (event.key === "Escape") setName(layer.name);
        }}
      />
      <div className="layer-controls" aria-label={`${layer.name} controls`}>
        <button
          aria-pressed={layer.visible}
          onClick={() =>
            commit(
              { version: 2, type: "set-layer-visibility", screen, layerId: layer.id, visible: !layer.visible },
              `${layer.name} ${layer.visible ? "hidden" : "shown"}.`,
            )
          }
        >
          {layer.visible ? "Hide" : "Show"}
        </button>
        <button
          aria-label={`Move ${layer.name} down`}
          disabled={index === 0}
          onClick={() =>
            commit(
              { version: 2, type: "reorder-layer", screen, layerId: layer.id, toIndex: index - 1 },
              `${layer.name} moved down.`,
            )
          }
        >
          Down
        </button>
        <button
          aria-label={`Move ${layer.name} up`}
          disabled={index === count - 1}
          onClick={() =>
            commit(
              { version: 2, type: "reorder-layer", screen, layerId: layer.id, toIndex: index + 1 },
              `${layer.name} moved up.`,
            )
          }
        >
          Up
        </button>
        <button aria-label={`Delete ${layer.name}`} onClick={remove}>
          Delete
        </button>
      </div>
      <LayerProperties layer={layer} screen={screen} commit={commit} announce={announce} />
    </div>
  );
}

// prettier-ignore
type SurfaceProps = { grid: boolean; scene?: Scene; renderSurface?: RenderSurfacePlanV1; screen: Screen; zoom: WorkspaceView["zoom"]; layers: LayerV2[]; selected?: string; onSelect(id: string): void; commit: Commit; remove(layer: LayerV2, ids: string[]): void; announce(message: string): void };
function WorkspaceSurface({
  grid,
  scene,
  renderSurface,
  screen,
  zoom,
  layers,
  selected,
  onSelect,
  commit,
  remove,
  announce,
}: SurfaceProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ layer: LayerV2; start: { x: number; y: number } } | undefined>(undefined);
  const [transient, setTransient] = useState<LayerV2>();
  const background = color(scene?.tokens.background, fallback.background);
  const accent = color(scene?.tokens.accent, fallback.accent);
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (context)
      paintWorkspaceSurface(
        context,
        { background, accent },
        grid,
        renderSurface,
        transient && { id: transient.id, xQ16: transient.xQ16, yQ16: transient.yQ16 },
      );
  }, [accent, background, grid, renderSurface, transient]);
  // prettier-ignore
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => { const bounds = event.currentTarget.getBoundingClientRect(); return { x: ((event.clientX - bounds.left) * 256) / bounds.width, y: ((event.clientY - bounds.top) * 192) / bounds.height }; };
  // prettier-ignore
  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const start = point(event), layer = layers.find(({ id }) => id === selected) ?? [...layers].reverse().find((item) => item.visible && start.x >= item.xQ16 / 65536 && start.y >= item.yQ16 / 65536 && start.x < (item.xQ16 + item.widthQ16) / 65536 && start.y < (item.yQ16 + item.heightQ16) / 65536);
    if (!layer) return; onSelect(layer.id); drag.current = { layer, start };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Synthetic probes have no active native pointer. */ }
  };
  // prettier-ignore
  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return; const position = pointerTranslationQ16(drag.current.layer, drag.current.start, point(event)); setTransient({ ...drag.current.layer, ...position });
  };
  // prettier-ignore
  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return; const { layer, start } = drag.current, position = pointerTranslationQ16(layer, start, point(event)); drag.current = undefined; setTransient(undefined);
    if (position.xQ16 !== layer.xQ16 || position.yQ16 !== layer.yQ16) commit({ version: 2, type: "move-layer", screen, layerId: layer.id, ...position }, `${layer.name} moved.`);
  };
  // prettier-ignore
  const moveByKey = (event: React.KeyboardEvent, layer: LayerV2) => {
    const delta = keyDelta[event.key]; if (delta) { event.preventDefault(); commit({ version: 2, type: "move-layer", screen, layerId: layer.id, xQ16: layer.xQ16 + delta[0] * 65536, yQ16: layer.yQ16 + delta[1] * 65536 }, `${layer.name} moved.`); }
  };

  return (
    <section className="workspace-surface" aria-labelledby={`workspace-${screen}-title`}>
      <div className="workspace-surface-heading">
        <strong id={`workspace-${screen}-title`}>{screen} surface</strong>
        <span>256 × 192 px</span>
      </div>
      <canvas
        ref={canvas}
        className={`workspace-canvas zoom-${zoom}`}
        data-workspace-surface={screen}
        width={SURFACE_SIZE.width}
        height={SURFACE_SIZE.height}
        role="img"
        aria-label={`${screen} workspace surface, 256 by 192 pixels, read only`}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
      />
      <div className="layer-tree" role="list" aria-label={`${screen} layers`}>
        {layers.map((layer, index) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            screen={screen}
            index={index}
            count={layers.length}
            selected={selected === layer.id}
            onSelect={() => onSelect(layer.id)}
            onKeyMove={(event) => moveByKey(event, layer)}
            commit={commit}
            announce={announce}
            remove={() =>
              remove(
                layer,
                layers.map(({ id }) => id),
              )
            }
          />
        ))}
      </div>
    </section>
  );
}

export function ReadOnlyWorkspace({
  scenes = [],
  customProject,
  renderPlan,
  onAdd,
  onOperation,
}: {
  scenes?: PreviewModel["scenes"];
  customProject?: ThemeProjectV2;
  renderPlan?: CustomRenderPlanV1;
  onAdd(screen: Screen): void;
  onOperation(operation: OperationV2): void;
}) {
  const [view, setView] = useState(initialWorkspaceView);
  const [selected, setSelected] = useState<string>();
  const [announcement, setAnnouncement] = useState("");
  const [focusAfterChange, setFocusAfterChange] = useState<string>();
  const setFocus = (screen: WorkspaceFocus) =>
    setView((current) => updateWorkspaceView(current, { type: "focus", screen }));
  const commit: Commit = (operation, message) => {
    onOperation(operation);
    setAnnouncement(message);
  };
  const remove = (screen: Screen, layer: LayerV2, ids: string[]) => {
    const target = focusAfterLayerRemoval(ids, layer.id);
    setSelected(target);
    setFocusAfterChange(target ?? `add-${screen}`);
    commit({ version: 2, type: "remove-layer", screen, layerId: layer.id }, `${layer.name} deleted.`);
  };
  useEffect(() => {
    if (!focusAfterChange) return;
    document.querySelector<HTMLElement>(`[data-layer-focus="${focusAfterChange}"]`)?.focus();
    setFocusAfterChange(undefined);
  }, [customProject, focusAfterChange]);

  return (
    <section className="canvas-workspace" aria-labelledby="workspace-title">
      <div className="preview-toolbar workspace-toolbar">
        <div>
          <span>Composition desk</span>
          <h2 id="workspace-title">Canvas workspace</h2>
          <p>Canvas previews canonical layers; selection and viewport controls stay local.</p>
        </div>
        <div className="workspace-controls">
          <div className="preview-control workspace-control">
            <span id="workspace-view-label">Workspace view</span>
            <div className="mode-switcher" role="group" aria-label="Workspace view">
              {(["dual", ...screens] as const).map((item) => (
                <button
                  key={item}
                  aria-pressed={view.focus === item}
                  className={view.focus === item ? "active" : ""}
                  onClick={() => setFocus(item)}
                >
                  {item === "dual" ? "Dual" : `${item[0]!.toUpperCase()}${item.slice(1)} focus`}
                </button>
              ))}
            </div>
          </div>
          <label className="workspace-option">
            <span>Zoom</span>
            <select
              aria-label="Workspace zoom"
              value={view.zoom}
              onChange={(event) =>
                setView((current) =>
                  updateWorkspaceView(current, {
                    type: "zoom",
                    value: Number(event.target.value) as WorkspaceView["zoom"],
                  }),
                )
              }
            >
              <option value="100">100%</option>
              <option value="150">150%</option>
              <option value="200">200%</option>
            </select>
          </label>
          <label className="grid-toggle">
            <input
              type="checkbox"
              aria-label="Show pixel grid"
              checked={view.grid}
              onChange={(event) =>
                setView((current) => updateWorkspaceView(current, { type: "grid", value: event.target.checked }))
              }
            />
            Grid
          </label>
        </div>
      </div>
      <div className={`workspace-surfaces ${view.focus === "dual" ? "dual" : "focus"}`} data-workspace-gap={view.gap}>
        {screens.map((screen) =>
          view.focus === "dual" || view.focus === screen ? (
            <WorkspaceSurface
              key={screen}
              grid={view.grid}
              scene={scenes.find((scene) => scene.screen === screen)}
              renderSurface={renderPlan?.screens.find((surface) => surface.screen === screen)}
              screen={screen}
              zoom={view.zoom}
              layers={customProject?.documents.find((document) => document.screen === screen)?.layers ?? []}
              selected={selected}
              onSelect={setSelected}
              commit={commit}
              announce={setAnnouncement}
              remove={(layer, ids) => remove(screen, layer, ids)}
            />
          ) : null,
        )}
      </div>
      {customProject && (
        <div className="layer-actions">
          {screens.map((screen) => (
            <button key={screen} data-layer-focus={`add-${screen}`} onClick={() => onAdd(screen)}>
              Add {screen} layer
            </button>
          ))}
        </div>
      )}
      <p className="workspace-announcement" role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
