import { describe, expect, it } from "vitest";
import { applyOperationV2, createCustomRenderPlan, createProjectV2, type LayerV2 } from "./index.js";

const asset = (character: string) => ({
  path: `assets/sha256/${character.repeat(64)}.png`,
  sha256: character.repeat(64),
});
const layer = (id: string, character: string, visible = true): LayerV2 => ({
  id,
  name: id,
  visible,
  opacity: 32768,
  asset: asset(character),
  xQ16: -65536,
  yQ16: 2 * 65536,
  width: 8,
  height: 6,
  widthQ16: 16 * 65536,
  heightQ16: 12 * 65536,
  crop: { x: 1, y: 2, width: 4, height: 3 },
});

describe("Custom render plan", () => {
  it("maps visible layers in canonical order with exact crop and Q16 geometry", () => {
    let state = createProjectV2({
      projectId: "plan",
      metadata: { name: "N", description: "D", author: "A" },
      themeKind: "custom",
    });
    for (const [screen, item] of [
      ["top", layer("top-first", "a")],
      ["top", layer("top-hidden", "b", false)],
      ["top", layer("top-last", "c")],
      ["bottom", layer("bottom-only", "d")],
    ] as const)
      state = applyOperationV2(state, { version: 2, type: "add-layer", screen, layer: item });

    const plan = createCustomRenderPlan(state.project);

    expect(plan.version).toBe(1);
    expect(plan.screens.map(({ screen }) => screen)).toEqual(["top", "bottom"]);
    expect(plan.screens[0]?.layers.map(({ id, order }) => ({ id, order }))).toEqual([
      { id: "top-first", order: 0 },
      { id: "top-last", order: 2 },
    ]);
    expect(plan.screens[0]?.layers[0]).toMatchObject({
      source: { x: 1, y: 2, width: 4, height: 3 },
      destinationQ16: { x: -65536, y: 131072, width: 1048576, height: 786432 },
      opacity: 32768,
    });
    expect(plan.screens[1]?.layers.map(({ id }) => id)).toEqual(["bottom-only"]);
  });

  it("is pure data with no viewport, browser, or launcher chrome state", () => {
    const state = createProjectV2({
      projectId: "pure",
      metadata: { name: "N", description: "D", author: "A" },
      themeKind: "custom",
    });
    const before = JSON.stringify(state.project);
    const plan = createCustomRenderPlan(state.project);

    expect(JSON.stringify(plan)).not.toMatch(/canvas|document|selection|zoom|grid|coverflow|banner|launcher/i);
    expect(JSON.stringify(state.project)).toBe(before);
    expect(Object.getPrototypeOf(plan)).toBe(Object.prototype);
  });
});
