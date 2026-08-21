import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { captureLauncherFixtures } from "../../../../../packages/test-fixtures/src/capture.js";
import { LAUNCHER_PREVIEW_AUTHORITY_V1, LauncherPreviewError, createLauncherPreviewFrameModelV1 } from "./authority.js";
import { importLauncherPaletteFixtureV1 } from "./fixture.js";

describe("launcher preview authority", () => {
  it("admits only the clean c648 source manifest without tag authority or bundled artwork", () => {
    expect(LAUNCHER_PREVIEW_AUTHORITY_V1.launcherCommit).toBe("c648ce888f9b24a1a269795dd0391528e5d12251");
    expect(JSON.stringify(LAUNCHER_PREVIEW_AUTHORITY_V1)).not.toContain('"tag"');
    expect(LAUNCHER_PREVIEW_AUTHORITY_V1.fixture.bundle).toBe(false);
    expect(LAUNCHER_PREVIEW_AUTHORITY_V1.license.spdx).toBe("Zlib");
    expect(() => importLauncherPaletteFixtureV1(new Uint8Array(64))).toThrow(LauncherPreviewError);
  });

  it("covers the four source-backed layouts and refuses File List without a frame", () => {
    expect(Object.keys(LAUNCHER_PREVIEW_AUTHORITY_V1.layouts)).toEqual([
      "horizontal-grid",
      "vertical-grid",
      "banner-list",
      "coverflow",
    ]);
    expect(createLauncherPreviewFrameModelV1("banner-list")).toMatchObject({ width: 256, height: 192 });
    expect(() => createLauncherPreviewFrameModelV1("file-list")).toThrow(LauncherPreviewError);
    expect(() => createLauncherPreviewFrameModelV1("unknown")).toThrow(LauncherPreviewError);
    expect(Object.values(LAUNCHER_PREVIEW_AUTHORITY_V1.layouts).map(({ source }) => source)).toEqual(
      LAUNCHER_PREVIEW_AUTHORITY_V1.layoutSources.slice(2, 6).map(({ path }) => path),
    );
    expect(LAUNCHER_PREVIEW_AUTHORITY_V1.composition).toMatchObject({
      appBar: { extent: 42, buttonSize: 32 },
      gridCell: { itemSize: 44, textureOffset: [-2, -2], textureSize: [48, 48], iconOffset: [6, 6], iconSize: 32 },
      bannerCell: {
        itemSize: [203, 44],
        textureOffset: [-3, -2],
        textureSize: [209, 49],
        iconOffset: [6, 6],
        iconSize: 32,
      },
      customCoverflow: { reflectionRows: 20 },
      materialCoverflow: { selected: [46, 106], next: [156, 54], radius: 18, clip: [6, 250] },
    });
  });

  const root = process.env.DSPICO_LAUNCHER_RUNTIME_ROOT;
  if (root)
    it("imports the admitted launcher palette only after clean c648 evidence verifies", () => {
      captureLauncherFixtures(root);
      for (const source of [
        ...LAUNCHER_PREVIEW_AUTHORITY_V1.layoutSources,
        ...LAUNCHER_PREVIEW_AUTHORITY_V1.sceneSources,
      ]) {
        const prefix = `${LAUNCHER_PREVIEW_AUTHORITY_V1.launcherCommit}:${source.path}`;
        expect(execFileSync("git", ["-C", root, "rev-parse", prefix], { encoding: "utf8" }).trim()).toBe(
          source.blobOid,
        );
        expect(
          createHash("sha256")
            .update(execFileSync("git", ["-C", root, "show", prefix]))
            .digest("hex"),
        ).toBe(source.sha256);
      }
      const palette = execFileSync(
        "git",
        [
          "-C",
          root,
          "show",
          "c648ce888f9b24a1a269795dd0391528e5d12251:_pico/themes/raspberry/gridcellSelectedPltt.bin",
        ],
        { encoding: "buffer" },
      );
      expect(importLauncherPaletteFixtureV1(palette).palette).toHaveLength(64);
    });
});
