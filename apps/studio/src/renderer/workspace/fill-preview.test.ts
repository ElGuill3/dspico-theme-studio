import { describe, expect, it, vi } from "vitest";
import { createLatestFrameQueue, findFillPreviewLayer, normalizeHexColor } from "./fill-preview.js";

describe("fill previews", () => {
  it("normalizes six-digit hexadecimal colors", () => {
    expect(normalizeHexColor("A1b2C3")).toBe("#a1b2c3");
    expect(normalizeHexColor("#ABCDEF")).toBe("#abcdef");
    expect(normalizeHexColor("#12345")).toBeUndefined();
    expect(normalizeHexColor("#12345g")).toBeUndefined();
  });

  it("applies only the latest queued value per frame and supports synchronous lifecycle handling", () => {
    let callback: () => void = () => undefined;
    const apply = vi.fn();
    const cancel = vi.fn();
    const request = vi.fn((next: () => void) => {
      callback = next;
      return request.mock.calls.length;
    });
    const queue = createLatestFrameQueue(apply, { request, cancel });

    queue.schedule("first");
    queue.schedule("latest");
    expect(request).toHaveBeenCalledOnce();
    expect(queue.pending()).toBe("latest");
    callback();
    expect(apply).toHaveBeenCalledWith("latest");

    queue.schedule("flush");
    queue.flush();
    expect(cancel).toHaveBeenCalledWith(2);
    expect(apply).toHaveBeenLastCalledWith("flush");

    queue.schedule("discard");
    queue.cancel();
    callback();
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("delivers a queued fill after an intervening authoritative layer update", () => {
    let callback: () => void = () => undefined;
    let layers: { id: string; kind: "shape" | "text"; fill: string; xQ16: number }[] = [
      { id: "caption", kind: "text", fill: "#111111", xQ16: 0 },
    ];
    const applied = vi.fn();
    const target = {
      projectId: "project",
      role: "scrim",
      layerId: "caption",
      layerKind: "text" as const,
      fill: "#abcdef",
    };
    const queue = createLatestFrameQueue(
      (preview: typeof target) => {
        if (findFillPreviewLayer(preview, { projectId: "project", role: "scrim", layers })) applied(preview.fill);
      },
      {
        request: (next) => {
          callback = next;
          return 1;
        },
        cancel: () => undefined,
      },
    );

    queue.schedule(target);
    layers = [{ ...layers[0]!, fill: "#222222", xQ16: 65536 }];
    callback();
    expect(applied).toHaveBeenCalledWith("#abcdef");

    queue.schedule({ ...target, fill: "#fedcba" });
    layers = [{ ...layers[0]!, kind: "shape" }];
    callback();
    queue.schedule({ ...target, fill: "#000000" });
    layers = [];
    callback();
    expect(applied).toHaveBeenCalledTimes(1);
  });
});
