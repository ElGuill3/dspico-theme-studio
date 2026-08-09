import { describe, expect, it } from "vitest";
import { compositeCustomLayersV1 } from "./index.js";

describe("native shape compositing", () => {
  it("composites rectangle color, opacity, and ordering into exact RGBA pixels", () => {
    const pixels = compositeCustomLayersV1(
      2,
      1,
      [
        {
          id: "blue",
          order: 0,
          asset: { path: "blue", sha256: "blue" },
          opacity: 65536,
          source: { x: 0, y: 0, width: 1, height: 1 },
          destinationQ16: { x: 0, y: 0, width: 2 * 65536, height: 65536 },
        },
        {
          kind: "shape",
          id: "red",
          order: 1,
          shape: "rectangle",
          fill: "#ff0000",
          opacity: 32768,
          destinationQ16: { x: 0, y: 0, width: 65536, height: 65536 },
        },
      ],
      [
        {
          sourceSha256: "blue",
          width: 1,
          height: 1,
          normalizationPolicy: "rgba8-straight-top-left-v1",
          pixels: Uint8Array.of(0, 0, 255, 255),
        },
      ],
    );

    expect([...pixels]).toEqual([128, 0, 127, 255, 0, 0, 255, 255]);
  });

  it("keeps ellipse corners transparent while filling its center", () => {
    const pixels = compositeCustomLayersV1(
      4,
      4,
      [
        {
          kind: "shape",
          id: "ellipse",
          order: 0,
          shape: "ellipse",
          fill: "#00ff00",
          opacity: 65536,
          destinationQ16: { x: 0, y: 0, width: 4 * 65536, height: 4 * 65536 },
        },
      ],
      [],
    );

    expect([...pixels.slice(0, 4)]).toEqual([0, 0, 0, 0]);
    expect([...pixels.slice(40, 44)]).toEqual([0, 255, 0, 255]);
  });

  it("rejects non-canonical shape input at the compositor boundary", () => {
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
            fill: "#FFFFFF",
            opacity: 65536,
            destinationQ16: { x: 0, y: 0, width: 65536, height: 65536 },
          },
        ],
        [],
      ),
    ).toThrow("Invalid shape layer");
  });

  it("rejects every unsupported explicit kind while retaining kindless legacy images", () => {
    const image = {
        id: "image",
        order: 0,
        asset: { path: "image", sha256: "image" },
        opacity: 65536,
        source: { x: 0, y: 0, width: 1, height: 1 },
        destinationQ16: { x: 0, y: 0, width: 65536, height: 65536 },
      },
      source = {
        sourceSha256: "image",
        width: 1,
        height: 1,
        normalizationPolicy: "rgba8-straight-top-left-v1" as const,
        pixels: Uint8Array.of(1, 2, 3, 255),
      };
    expect(compositeCustomLayersV1(1, 1, [image], [source])).toEqual(Uint8Array.of(1, 2, 3, 255));
    expect(compositeCustomLayersV1(1, 1, [{ ...image, kind: "image" }], [source])).toEqual(Uint8Array.of(1, 2, 3, 255));
    for (const kind of ["plugin", "", null, undefined, 0, false])
      expect(() => compositeCustomLayersV1(1, 1, [{ ...image, kind } as never], [source])).toThrow(
        "Unsupported Custom layer kind",
      );
  });
});
