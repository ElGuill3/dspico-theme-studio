export const normalizeHexColor = (value: string): string | undefined => {
  const match = /^#?([0-9a-f]{6})$/i.exec(value);
  return match ? `#${match[1].toLowerCase()}` : undefined;
};

export type FillPreviewTarget = {
  projectId: string;
  role: string;
  layerId: string;
  layerKind: "shape" | "text";
};

export const findFillPreviewLayer = <Layer extends { id: string; kind?: string }>(
  target: FillPreviewTarget,
  context: { projectId?: string; role: string; layers: readonly Layer[] },
): Layer | undefined =>
  context.projectId === target.projectId && context.role === target.role
    ? context.layers.find(({ id, kind }) => id === target.layerId && kind === target.layerKind)
    : undefined;

type FrameScheduler = {
  request(callback: () => void): number;
  cancel(handle: number): void;
};

export type LatestFrameQueue<Value> = {
  schedule(value: Value): void;
  flush(): void;
  cancel(): void;
  pending(): Value | undefined;
};

export const createLatestFrameQueue = <Value>(
  apply: (value: Value) => void,
  scheduler: FrameScheduler = {
    request: (callback) => globalThis.requestAnimationFrame(callback),
    cancel: (handle) => globalThis.cancelAnimationFrame(handle),
  },
): LatestFrameQueue<Value> => {
  let frame: number | undefined;
  let queued: { value: Value } | undefined;
  const deliver = () => {
    frame = undefined;
    const next = queued;
    queued = undefined;
    if (next) apply(next.value);
  };
  return {
    schedule(value) {
      queued = { value };
      frame ??= scheduler.request(deliver);
    },
    flush() {
      if (!queued) return;
      if (frame !== undefined) scheduler.cancel(frame);
      deliver();
    },
    cancel() {
      if (frame !== undefined) scheduler.cancel(frame);
      frame = undefined;
      queued = undefined;
    },
    pending: () => queued?.value,
  };
};
