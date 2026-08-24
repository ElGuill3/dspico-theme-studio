import { describe, expect, it } from "vitest";
import {
  customLauncherLayoutBoundsV1,
  customLauncherLayoutDraftV1,
  customLauncherLayoutTargetV1,
  moveCustomLauncherLayoutV1,
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

  it("represents top cover as an unavailable, non-editable target in Coverflow", () => {
    expect(customLauncherLayoutTargetV1("topCover", "coverflow")).toMatchObject({
      label: "top cover",
      unavailable: true,
    });
    expect(customLauncherLayoutTargetV1("topCover", "banner-list")).toMatchObject({ unavailable: false });
  });
});
