import { describe, expect, it } from "vitest";
import {
  applyOperationV3,
  createProjectV3,
  currentProjectV3,
  customLauncherLayoutAuthoritySha256V3,
  openProjectV3,
  redoV3,
  saveProjectV3,
  undoV3,
} from "./index.js";

// prettier-ignore
const metadata = { name: "Layout", description: "Custom layout", author: "Author" };
// prettier-ignore
const layout = () => ({
  topIcon: { position: { x: 24, y: 132 }, blendColor: { r: 200, g: 200, b: 200 } },
  topBannerTextLine0: {
    position: { x: 70, y: 126 },
    width: 176,
    textColor: { r: 30, g: 30, b: 30 },
    blendColor: { r: 200, g: 200, b: 200 },
  },
  topBannerTextLine1: {
    position: { x: 70, y: 141 },
    width: 176,
    textColor: { r: 30, g: 30, b: 30 },
    blendColor: { r: 200, g: 200, b: 200 },
  },
  topBannerTextLine2: {
    position: { x: 70, y: 155 },
    width: 176,
    textColor: { r: 30, g: 30, b: 30 },
    blendColor: { r: 200, g: 200, b: 200 },
  },
  topFileNameText: {
    position: { x: 18, y: 170 },
    width: 220,
    textColor: { r: 30, g: 30, b: 30 },
    blendColor: { r: 200, g: 200, b: 200 },
  },
  topCover: { position: { x: 75, y: 18 } },
});
const set = (element: string, value?: unknown) => ({
  version: 3 as const,
  type: "set-custom-launcher-layout" as const,
  element,
  ...(value === undefined ? {} : { value }),
});
// prettier-ignore
const customProject = () => createProjectV3({ projectId: "layout", metadata, themeKind: "custom" });

// prettier-ignore
describe("V3 Custom launcher layout history", () => {
  it("keeps omission sparse, commits complete values, and resets back to omission", () => {
    let state = applyOperationV3(customProject(), {
      version: 3,
      type: "set-component-evidence",
      component: "visual",
      receipt: { sha256: "published" },
    });
    expect(currentProjectV3(state).customLauncherLayout).toBeUndefined();

    state = applyOperationV3(state, set("topIcon", layout().topIcon) as never);
    expect(state.operations).toHaveLength(2);
    expect(currentProjectV3(state)).toMatchObject({
      customLauncherLayout: { topIcon: layout().topIcon },
      componentEvidence: {},
    });

    state = applyOperationV3(state, {
      version: 3,
      type: "set-component-evidence",
      component: "visual",
      receipt: { sha256: "republished" },
    });
    state = applyOperationV3(state, set("topIcon") as never);
    expect(state.operations).toHaveLength(4);
    expect(currentProjectV3(state)).toMatchObject({ componentEvidence: {} });
    expect(currentProjectV3(state).customLauncherLayout).toBeUndefined();
  });

  it("accepts all six complete keys, survives save/open and undo/redo, and truncates redo", () => {
    let state = customProject();
    for (const [element, value] of Object.entries(layout()))
      state = applyOperationV3(state, set(element, value) as never);
    const saved = saveProjectV3(state), authority = customLauncherLayoutAuthoritySha256V3(state);

    expect(currentProjectV3(openProjectV3(saved)).customLauncherLayout).toEqual(layout());
    expect(state.operations).toHaveLength(6);
    const undone = undoV3(state);
    expect(currentProjectV3(undone).customLauncherLayout?.topCover).toBeUndefined();
    expect(customLauncherLayoutAuthoritySha256V3(redoV3(undone))).toBe(authority);

    const branched = applyOperationV3(
      undone,
      set("topCover", { position: { x: 76, y: 18 } }) as never,
    );
    expect(branched.operations).toHaveLength(6);
    expect(currentProjectV3(redoV3(branched)).customLauncherLayout?.topCover).toEqual({
      position: { x: 76, y: 18 },
    });
  });

  it("rejects unknown, partial, out-of-range, and non-Custom layout operations without changing state", () => {
    const state = customProject(), before = saveProjectV3(state);

    for (const operation of [
      set("bottomText", { position: { x: 0, y: 0 } }),
      set("topIcon", { position: { x: 24, y: 132 } }),
      set("topCover", { position: { x: 256, y: 18 } }),
    ])
      expect(() => applyOperationV3(state, operation as never)).toThrow("Invalid V3 operation");
    expect(saveProjectV3(state)).toBe(before);
    expect(() =>
      applyOperationV3(
        createProjectV3({ projectId: "material", metadata }),
        set("topIcon", layout().topIcon) as never,
      ),
    ).toThrow("Custom");
  });
});
