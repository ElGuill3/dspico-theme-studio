export const PIXEL_FONT_WIDTH_V1 = 5;
export const PIXEL_FONT_HEIGHT_V1 = 7;
export const PIXEL_FONT_ADVANCE_V1 = 6;
export const PIXEL_FONT_LINE_ADVANCE_V1 = 8;
export const MAX_TEXT_CODEPOINTS_V1 = 256;
export const MAX_TEXT_LINES_V1 = 8;

// Classic 5x7 ASCII bitmap from Adafruit GFX (BSD-3-Clause), stored as five column bytes per glyph.
const ASCII_HEX =
  "000000000000005f00000007000700147f147f14242a7f2a12231308646236495620500008070300001c2241000041221c002a1c7f1c2a08083e080800807030000808080808000060600020100804023e5149453e00427f400072494949462141494d331814127f1027454545393c4a49493141211109073649494936464949291e0000140000004034000000081422411414141414004122140802015909063e415d594e7c1211127c7f494949363e414141227f4141413e7f494949417f090909013e414151737f0808087f00417f41002040413f017f081422417f404040407f021c027f7f0408107f3e4141413e7f090909063e4151215e7f09192946264949493203017f01033f4040403f1f2040201f3f4038403f631408146303047804036159494d43007f4141410204081020004141417f04020102044040404040000307080020545478407f284444383844444428384444287f385454541800087e090218a4a49c787f0804047800447d40002040403d007f1028440000417f40007c047804787c080404783844444438fc1824241818242418fc7c08040408485454542404043f44243c4040207c1c2040201c3c4030403c44281028444c9090907c4464544c440008364100000077000000413608000201020402";
const ASCII = Uint8Array.from({ length: ASCII_HEX.length / 2 }, (_, index) =>
  Number.parseInt(ASCII_HEX.slice(index * 2, index * 2 + 2), 16),
);
const FALLBACK = Uint8Array.of(0x7f, 0x41, 0x5d, 0x41, 0x7f);

export const validTextContentV1 = (content: unknown): content is string => {
  if (typeof content !== "string") return false;
  const codePoints = Array.from(content);
  return (
    codePoints.length <= MAX_TEXT_CODEPOINTS_V1 &&
    content.split("\n").length <= MAX_TEXT_LINES_V1 &&
    codePoints.every((character) => {
      const codePoint = character.codePointAt(0)!;
      return (
        character === "\n" ||
        (codePoint >= 0x20 &&
          codePoint !== 0x7f &&
          !(codePoint >= 0x80 && codePoint <= 0x9f) &&
          !(codePoint >= 0xd800 && codePoint <= 0xdfff))
      );
    })
  );
};

export const pixelFontGlyphColumnV1 = (character: string, column: number): number => {
  if (!Number.isInteger(column) || column < 0 || column >= PIXEL_FONT_WIDTH_V1) return 0;
  const codePoint = character.codePointAt(0);
  return codePoint !== undefined && codePoint >= 0x20 && codePoint <= 0x7e
    ? ASCII[(codePoint - 0x20) * PIXEL_FONT_WIDTH_V1 + column]!
    : FALLBACK[column]!;
};

export const textLayerContainsPixelCenterV1 = (
  content: string,
  scale: number,
  alignment: "left" | "center" | "right",
  relativeXQ16: number,
  relativeYQ16: number,
  widthQ16: number,
  heightQ16: number,
): boolean => {
  if (
    !Number.isInteger(scale) ||
    scale < 1 ||
    ![relativeXQ16, relativeYQ16, widthQ16, heightQ16].every(Number.isSafeInteger) ||
    relativeXQ16 < 0 ||
    relativeYQ16 < 0 ||
    relativeXQ16 >= widthQ16 ||
    relativeYQ16 >= heightQ16
  )
    return false;
  const pixelQ16 = scale * 65536,
    lines = content.split("\n"),
    lineIndex = Math.floor(relativeYQ16 / (PIXEL_FONT_LINE_ADVANCE_V1 * pixelQ16)),
    glyphRow = Math.floor((relativeYQ16 % (PIXEL_FONT_LINE_ADVANCE_V1 * pixelQ16)) / pixelQ16);
  if (glyphRow >= PIXEL_FONT_HEIGHT_V1 || lineIndex >= lines.length) return false;
  const characters = Array.from(lines[lineIndex]!),
    lineWidthQ16 = Math.max(0, characters.length * PIXEL_FONT_ADVANCE_V1 - 1) * pixelQ16,
    startXQ16 =
      alignment === "center"
        ? Math.floor((widthQ16 - lineWidthQ16) / 2)
        : alignment === "right"
          ? widthQ16 - lineWidthQ16
          : 0,
    textXQ16 = relativeXQ16 - startXQ16;
  if (textXQ16 < 0 || textXQ16 >= lineWidthQ16) return false;
  const textColumn = Math.floor(textXQ16 / pixelQ16),
    character = characters[Math.floor(textColumn / PIXEL_FONT_ADVANCE_V1)],
    glyphColumn = textColumn % PIXEL_FONT_ADVANCE_V1;
  return Boolean(
    character && glyphColumn < PIXEL_FONT_WIDTH_V1 && pixelFontGlyphColumnV1(character, glyphColumn) & (1 << glyphRow),
  );
};
