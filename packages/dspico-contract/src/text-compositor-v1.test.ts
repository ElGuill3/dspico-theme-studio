import { describe, expect, it } from "vitest";
import {
  compositeCustomLayersV1,
  MAX_CUSTOM_COMPOSITE_BYTES_V1,
  pixelFontGlyphColumnV1,
  validTextContentV1,
} from "./index.js";

const text = (patch: Record<string, unknown> = {}) => ({
  kind: "text" as const,
  id: "text",
  order: 0,
  content: "A",
  fill: "#ff0000",
  scale: 1,
  alignment: "left" as const,
  opacity: 65536,
  destinationQ16: { x: 0, y: 0, width: 12 * 65536, height: 16 * 65536 },
  ...patch,
});

describe("deterministic pixel text", () => {
  it("bundles printable ASCII and one deterministic fallback glyph", () => {
    expect(Array.from({ length: 5 }, (_, column) => pixelFontGlyphColumnV1("A", column))).toEqual([
      0x7c, 0x12, 0x11, 0x12, 0x7c,
    ]);
    expect(Array.from({ length: 5 }, (_, column) => pixelFontGlyphColumnV1("é", column))).toEqual(
      Array.from({ length: 5 }, (_, column) => pixelFontGlyphColumnV1("😀", column)),
    );
  });

  it("uses explicit multiline spacing, alignment, clipping, opacity, and ordering", () => {
    const pixels = compositeCustomLayersV1(
      12,
      12,
      [
        {
          kind: "shape",
          id: "background",
          order: 0,
          shape: "rectangle",
          fill: "#0000ff",
          opacity: 65536,
          destinationQ16: { x: 0, y: 0, width: 12 * 65536, height: 12 * 65536 },
        },
        text({ content: "I\nI", alignment: "right", opacity: 32768 }),
      ],
      [],
    );
    const at = (x: number, y: number) => [...pixels.slice((y * 12 + x) * 4, (y * 12 + x + 1) * 4)];
    expect(at(9, 0)).toEqual([128, 0, 127, 255]);
    expect(at(9, 7)).toEqual([0, 0, 255, 255]);
    expect(at(9, 8)).toEqual([128, 0, 127, 255]);
    expect(at(7, 0)).toEqual([0, 0, 255, 255]);
  });

  it("renders empty text as no pixels and clips overlong centered text to its box", () => {
    expect(compositeCustomLayersV1(2, 2, [text({ content: "" })], []).some(Boolean)).toBe(false);
    const clipped = compositeCustomLayersV1(
      4,
      7,
      [
        text({
          content: "AAAA",
          alignment: "center",
          destinationQ16: { x: 65536, y: 0, width: 2 * 65536, height: 7 * 65536 },
        }),
      ],
      [],
    );
    expect(Array.from({ length: 7 }, (_, y) => clipped[(y * 4 + 0) * 4 + 3])).toEqual(new Array(7).fill(0));
    expect(Array.from({ length: 7 }, (_, y) => clipped[(y * 4 + 3) * 4 + 3])).toEqual(new Array(7).fill(0));
    expect(clipped.some(Boolean)).toBe(true);
  });

  it("validates length, lines, scalar controls, fallback input, and compositor payloads", () => {
    expect(validTextContentV1("ASCII\n😀")).toBe(true);
    expect(validTextContentV1("x".repeat(257))).toBe(false);
    expect(validTextContentV1(new Array(9).fill("x").join("\n"))).toBe(false);
    expect(validTextContentV1("line one\nline two")).toBe(true);
    expect(validTextContentV1("bad\rcontrol")).toBe(false);
    expect(validTextContentV1("bad\r\ncontrol")).toBe(false);
    expect(validTextContentV1("\ud800")).toBe(false);
    for (const patch of [
      { fill: "#FFFFFF" },
      { scale: 0 },
      { scale: 1.5 },
      { alignment: "justify" },
      { content: "x".repeat(257) },
      { opacity: Number.NaN },
      { destinationQ16: { x: 0, y: 0, width: 0, height: 65536 } },
      { destinationQ16: { x: Number.MAX_SAFE_INTEGER, y: 0, width: 65536, height: 65536 } },
      { plugin: true },
    ])
      expect(() => compositeCustomLayersV1(1, 1, [text(patch) as never], [])).toThrow();
  });

  it.each([
    ["width overflow", Number.MAX_SAFE_INTEGER + 1, 1, "Invalid Custom document geometry"],
    ["height overflow", 1, Number.MAX_SAFE_INTEGER + 1, "Invalid Custom document geometry"],
    ["product overflow", Number.MAX_SAFE_INTEGER, 2, "compositor allocation limit"],
    ["oversized allocation", 257, 192, "compositor allocation limit"],
  ])("rejects %s before output allocation", (_case, width, height, message) => {
    expect(() => compositeCustomLayersV1(width as number, height as number, [], [])).toThrow(message);
  });

  it("keeps the largest canonical role inside the compositor allocation budget", () => {
    expect(compositeCustomLayersV1(256, 192, [], [])).toHaveLength(MAX_CUSTOM_COMPOSITE_BYTES_V1);
  });
});
