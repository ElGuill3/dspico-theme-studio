import type { RenderSurfacePlanV1 } from "../../../../../packages/theme-core/src/index.js";

export const SURFACE_SIZE = Object.freeze({ width: 256, height: 192 });

export type WorkspaceFocus = "dual" | "top" | "bottom";
export type WorkspaceView = { focus: WorkspaceFocus; gap: 96; grid: boolean; zoom: 100 | 150 | 200 };
export type WorkspaceViewAction =
  | { type: "focus"; screen: WorkspaceFocus }
  | { type: "grid"; value: boolean }
  | { type: "zoom"; value: WorkspaceView["zoom"] };

export const initialWorkspaceView: WorkspaceView = Object.freeze({ focus: "dual", gap: 96, grid: false, zoom: 100 });

export const updateWorkspaceView = (view: WorkspaceView, action: WorkspaceViewAction): WorkspaceView => {
  if (action.type === "focus") return { ...view, focus: action.screen };
  if (action.type === "grid") return { ...view, grid: action.value };
  return { ...view, zoom: action.value };
};
export const pointerTranslationQ16 = (
  origin: { xQ16: number; yQ16: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) => ({
  xQ16: origin.xQ16 + Math.round(end.x - start.x) * 65536,
  yQ16: origin.yQ16 + Math.round(end.y - start.y) * 65536,
});
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
  | "lineTo"
  | "lineWidth"
  | "moveTo"
  | "stroke"
  | "strokeStyle"
>;

export function paintWorkspaceSurface(
  context: SurfaceContext,
  palette: { background: string; accent: string },
  grid: boolean,
  surface?: RenderSurfacePlanV1,
  transient?: { id: string; xQ16: number; yQ16: number },
): void {
  context.clearRect(0, 0, SURFACE_SIZE.width, SURFACE_SIZE.height);
  context.fillStyle = palette.background;
  context.fillRect(0, 0, SURFACE_SIZE.width, SURFACE_SIZE.height);
  context.fillStyle = palette.accent;
  context.fillRect(0, 0, SURFACE_SIZE.width, 3);
  context.fillRect(0, SURFACE_SIZE.height - 3, SURFACE_SIZE.width, 3);
  context.fillStyle = palette.accent;
  for (const layer of surface?.layers ?? []) {
    const destination =
      transient?.id === layer.id
        ? { ...layer.destinationQ16, x: transient.xQ16, y: transient.yQ16 }
        : layer.destinationQ16;
    context.globalAlpha = layer.opacity / 65536;
    context.fillRect(
      destination.x / 65536,
      destination.y / 65536,
      destination.width / 65536,
      destination.height / 65536,
    );
  }
  context.globalAlpha = 1;
  if (!grid) return;
  context.beginPath();
  context.strokeStyle = "rgba(255, 255, 255, 0.18)";
  context.lineWidth = 1;
  for (let x = 16.5; x < SURFACE_SIZE.width; x += 16) {
    context.moveTo(x, 0);
    context.lineTo(x, SURFACE_SIZE.height);
  }
  for (let y = 16.5; y < SURFACE_SIZE.height; y += 16) {
    context.moveTo(0, y);
    context.lineTo(SURFACE_SIZE.width, y);
  }
  context.stroke();
}
