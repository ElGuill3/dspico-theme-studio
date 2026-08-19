import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { captureLauncherFixtures } from "../../../../../packages/test-fixtures/src/capture.js";
import {
  assertMaterialParityV1,
  MATERIAL_COLOR_UTILITIES_V1,
  MATERIAL_C648_SOURCES_V1,
  materialPreviewV1,
  MaterialPreviewError,
} from "./material.js";

const root = process.env.DSPICO_LAUNCHER_RUNTIME_ROOT;
if (!root) throw new Error("DSPICO_LAUNCHER_RUNTIME_ROOT is required for Material parity evidence.");
const vectors = {
  light: {
    input: { primaryColor: { r: 138, g: 217, b: 255 }, darkTheme: false },
    roles: {
      primary: [0, 102, 134],
      onPrimary: [255, 255, 255],
      secondaryContainer: [208, 230, 243],
      onSecondaryContainer: [8, 30, 39],
      tertiary: [94, 90, 125],
      onTertiary: [255, 255, 255],
      inverseOnSurface: [240, 241, 243],
      onSurface: [25, 28, 30],
      onSurfaceVariant: [64, 72, 76],
      surfaceBright: [248, 249, 251],
      mainIconBg: [175, 196, 209],
      surfaceContainerHighest: [225, 226, 229],
      scrim: [68, 71, 73],
      outline: [112, 120, 125],
    },
  },
  dark: {
    input: { primaryColor: { r: 138, g: 217, b: 255 }, darkTheme: true },
    roles: {
      primary: [110, 210, 255],
      onPrimary: [0, 53, 71],
      secondaryContainer: [54, 73, 84],
      onSecondaryContainer: [208, 230, 243],
      tertiary: [199, 194, 234],
      onTertiary: [47, 45, 76],
      inverseOnSurface: [25, 28, 30],
      onSurface: [225, 226, 229],
      onSurfaceVariant: [192, 200, 205],
      surfaceBright: [55, 57, 59],
      mainIconBg: [82, 102, 113],
      surfaceContainerHighest: [50, 53, 55],
      scrim: [169, 171, 173],
      outline: [138, 146, 151],
    },
  },
} as const;

describe("Material launcher parity gate", () => {
  it("binds every vector source to clean exact-c648 blobs", () => {
    captureLauncherFixtures(root);
    for (const source of MATERIAL_C648_SOURCES_V1) {
      const spec = `c648ce888f9b24a1a269795dd0391528e5d12251:${source.path}`;
      expect(execFileSync("git", ["-C", root, "rev-parse", spec], { encoding: "utf8" }).trim()).toBe(source.blobOid);
      expect(
        createHash("sha256")
          .update(execFileSync("git", ["-C", root, "show", spec]))
          .digest("hex"),
      ).toBe(source.sha256);
    }
  });

  it.each(Object.entries(vectors))("matches c648 %s roles and preview primitives", (_, vector) => {
    const preview = materialPreviewV1(vector.input);
    expect(preview.roles).toEqual(vector.roles);
    expect(preview.primitives).toEqual({
      mainBackground: vector.roles.inverseOnSurface,
      subBackground: [vector.roles.inverseOnSurface, vector.roles.secondaryContainer],
      navigation: vector.roles.inverseOnSurface,
      buttonRow: vector.roles.inverseOnSurface,
      grid: { focused: vector.roles.mainIconBg, unfocused: vector.roles.surfaceBright },
      banner: { focused: vector.roles.mainIconBg, unfocused: vector.roles.surfaceBright },
    });
    expect(preview.fidelity).toBe("launcher-vector-backed");
  });

  it("is deterministic and rejects a parity mismatch", () => {
    const preview = materialPreviewV1(vectors.light.input);
    expect(materialPreviewV1(vectors.light.input)).toEqual(preview);
    expect(() => assertMaterialParityV1(vectors.light.input, { ...vectors.light.roles, primary: [1, 2, 3] })).toThrow(
      MaterialPreviewError,
    );
    expect(MATERIAL_COLOR_UTILITIES_V1).toMatchObject({ version: "0.4.0", license: "Apache-2.0" });
  });
});
