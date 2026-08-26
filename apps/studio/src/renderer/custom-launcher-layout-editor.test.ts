import { describe, expect, it } from "vitest";
import {
  customLauncherLayoutBoundsV1,
  customLauncherLayoutDraftV1,
  customLauncherLayoutEditorAvailableV1,
  customLauncherLayoutHitboxV1,
  customLauncherLayoutPointerDeltaV1,
  customLauncherLayoutTargetV1,
  moveCustomLauncherLayoutV1,
  nudgeCustomLauncherLayoutV1,
} from "./custom-launcher-layout-editor.js";
import { resolveCustomLauncherLayoutV1 } from "./launcher-preview/authority.js";

describe("custom launcher layout editor", () => {
  it("uses the resolver's text-width bound for pointer and keyboard movement", () => {
    const fileName = resolveCustomLauncherLayoutV1({}).topFileNameText;

    expect(customLauncherLayoutBoundsV1(fileName).x.maximum).toBe(36);
    expect(moveCustomLauncherLayoutV1("topFileNameText", fileName, 999, 999)).toMatchObject({
      position: { x: 36, y: 191 },
      width: 220,
    });
    expect(customLauncherLayoutDraftV1({}, "topFileNameText", 999, 999)).toMatchObject({
      position: { x: 36, y: 191 },
      width: 220,
    });
  });

  it("moves from committed values in exact keyboard increments", () => {
    const topIcon = resolveCustomLauncherLayoutV1({}).topIcon;

    expect(moveCustomLauncherLayoutV1("topIcon", topIcon, topIcon.position.x + 1, topIcon.position.y)).toMatchObject({
      position: { x: 25, y: 132 },
    });
    expect(moveCustomLauncherLayoutV1("topIcon", topIcon, topIcon.position.x, topIcon.position.y + 10)).toMatchObject({
      position: { x: 24, y: 142 },
    });
  });

  it("converts pointer movement at normal, expanded, and arbitrary rendered scales", () => {
    for (const [surface, current] of [
      [
        { width: 256, height: 192 },
        { x: 27, y: 15 },
      ],
      [
        { width: 512, height: 384 },
        { x: 44, y: 25 },
      ],
      [
        { width: 333, height: 251 },
        { x: 10 + (17 * 333) / 256, y: 5 + (10 * 251) / 192 },
      ],
    ] as const) {
      expect(customLauncherLayoutPointerDeltaV1({ x: 10, y: 5 }, current, surface)?.x).toBeCloseTo(17);
      expect(customLauncherLayoutPointerDeltaV1({ x: 10, y: 5 }, current, surface)?.y).toBeCloseTo(10);
    }
    expect(customLauncherLayoutPointerDeltaV1({ x: 0, y: 0 }, { x: 1, y: 1 }, { width: 0, height: 1 })).toBeUndefined();
  });

  it("uses one 1-pixel nudge path and suppresses moves at bounds", () => {
    const topIcon = resolveCustomLauncherLayoutV1({}).topIcon;

    expect(nudgeCustomLauncherLayoutV1("topIcon", topIcon, "up")?.position).toEqual({ x: 24, y: 131 });
    expect(nudgeCustomLauncherLayoutV1("topIcon", topIcon, "left")?.position).toEqual({ x: 23, y: 132 });
    expect(nudgeCustomLauncherLayoutV1("topIcon", topIcon, "right")?.position).toEqual({ x: 25, y: 132 });
    expect(nudgeCustomLauncherLayoutV1("topIcon", topIcon, "down")?.position).toEqual({ x: 24, y: 133 });
    expect(nudgeCustomLauncherLayoutV1("topIcon", { ...topIcon, position: { x: 0, y: 0 } }, "left")).toBeUndefined();
    expect(
      nudgeCustomLauncherLayoutV1("topIcon", { ...topIcon, position: { x: 255, y: 191 } }, "down"),
    ).toBeUndefined();
  });

  it("represents top cover as an unavailable, non-editable target in Coverflow", () => {
    expect(customLauncherLayoutTargetV1("topCover", "coverflow")).toMatchObject({
      label: "top cover",
      unavailable: true,
    });
    expect(customLauncherLayoutTargetV1("topCover", "banner-list")).toMatchObject({ unavailable: false });
  });

  it("offers the layout editor only for renderable Custom previews", () => {
    expect(customLauncherLayoutEditorAvailableV1(true, "partial", "partial")).toBe(true);
    expect(customLauncherLayoutEditorAvailableV1(true, "ready", "ready")).toBe(true);
    expect(customLauncherLayoutEditorAvailableV1(true, "invalid", "invalid")).toBe(false);
    expect(customLauncherLayoutEditorAvailableV1(true, "ready", "invalid")).toBe(false);
    expect(customLauncherLayoutEditorAvailableV1(false, "ready", "ready")).toBe(false);
    expect(customLauncherLayoutEditorAvailableV1(true, "not-custom", "ready")).toBe(false);
  });

  it("uses the rendered cover geometry for the top cover selector", () => {
    const topCover = resolveCustomLauncherLayoutV1({}).topCover;

    expect(customLauncherLayoutHitboxV1("topCover", topCover)).toEqual({ width: 106, height: 96 });
  });
});
