import { describe, expect, it } from "vitest";
import { compositeCustomLayersV1, rotatedBoundsQ16V1 } from "./index.js";

const Q16 = 65536;
const source = {
  role: "top-background" as const,
  sourceSha256: "source",
  width: 4,
  height: 4,
  pixels: Uint8Array.from(Array.from({ length: 16 }, (_, index) => [index + 1, 0, 0, 255]).flat()),
  provenance: { source: "test", rightsToExport: true },
  normalizationPolicy: "rgba8-straight-top-left-v1" as const,
};
const pixels = (rgba: Uint8Array, width: number) =>
  Array.from({ length: rgba.length / 4 }, (_, index) => ({
    x: index % width,
    y: Math.floor(index / width),
    red: rgba[index * 4]!,
    alpha: rgba[index * 4 + 3]!,
  })).filter(({ alpha }) => alpha);

describe("quarter-turn compositor", () => {
  it.each([0, 90, 180, 270] as const)("maps cropped image pixels exactly at %s degrees", (rotation) => {
    const rgba = compositeCustomLayersV1(
      7,
      7,
      [
        {
          id: "crop",
          order: 0,
          asset: { path: "source.png", sha256: "source" },
          source: { x: 1, y: 0, width: 2, height: 3 },
          destinationQ16: { x: 2 * Q16, y: 2 * Q16, width: 2 * Q16, height: 3 * Q16 },
          opacity: Q16,
          rotation,
        },
      ],
      [source],
    );
    const bounds = rotatedBoundsQ16V1({ x: 2 * Q16, y: 2 * Q16, width: 2 * Q16, height: 3 * Q16 }, rotation);
    expect(pixels(rgba, 7)).toHaveLength(6);
    expect(new Set(pixels(rgba, 7).map(({ red }) => red))).toEqual(new Set([2, 3, 6, 7, 10, 11]));
    expect(bounds.width).toBe((rotation === 90 || rotation === 270 ? 3 : 2) * Q16);
    expect(bounds.height).toBe((rotation === 90 || rotation === 270 ? 2 : 3) * Q16);
  });

  it("uses deterministic nearest-Q16 center rounding for odd and even geometry", () => {
    expect(rotatedBoundsQ16V1({ x: 0, y: 0, width: 4 * Q16, height: 2 * Q16 }, 90)).toEqual({
      x: Q16,
      y: -Q16,
      width: 2 * Q16,
      height: 4 * Q16,
    });
    expect(rotatedBoundsQ16V1({ x: 1, y: -1, width: 5, height: 2 }, 270)).toEqual({
      x: 3,
      y: -3,
      width: 2,
      height: 5,
    });
  });

  it.each([45, -90, 360, null])("rejects invalid compositor rotation %s", (rotation) => {
    expect(() =>
      compositeCustomLayersV1(
        1,
        1,
        [
          {
            kind: "shape",
            id: "bad",
            order: 0,
            shape: "rectangle",
            fill: "#ffffff",
            opacity: Q16,
            rotation,
            destinationQ16: { x: 0, y: 0, width: Q16, height: Q16 },
          } as never,
        ],
        [],
      ),
    ).toThrow("Invalid layer rotation");
  });
});
