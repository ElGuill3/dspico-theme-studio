import type { RgbaImageV1 } from "../../../../../packages/dspico-contract/src/codecs-v1-3.js";
import { LAUNCHER_PREVIEW_AUTHORITY_V1, LauncherPreviewError, type LauncherPreviewModeV1 } from "./authority.js";
import type { LauncherFixtureV1 } from "./fixture.js";
import type { MaterialRolesV1 } from "./material.js";
import { stage } from "./raster.js";

export type CustomPreviewAssetsV1 = {
  top: RgbaImageV1;
  bottom: RgbaImageV1;
  grid: RgbaImageV1;
  gridSelected: RgbaImageV1;
  banner: RgbaImageV1;
  bannerSelected: RgbaImageV1;
  scrim: RgbaImageV1;
};
type CoverflowTransform = {
  offset: number;
  x: number;
  width: number;
  renderedWidth: number;
  top: number;
  depth: number;
  angle?: number;
  mask: number;
  reflectionRows?: number;
  cornerRadius?: number;
};
type Coverflow = {
  centeredIndex: number;
  dimmedLeft: number;
  dimmedRight: number;
  transforms: readonly CoverflowTransform[];
};
export type LauncherPreviewMetadataV1 = {
  selectedIndex: number;
  inactiveOpacity: number;
  coverflow?: Coverflow;
  fidelity: {
    geometry: "launcher-vector-backed";
    materialFields?: "launcher-vector-backed";
    compiledPixels?: "exact compiled output";
    raster: "deterministic CPU approximation";
  };
};

type Rgb = readonly [number, number, number];
const SCREEN_WIDTH = 256;
const SCREEN_HEIGHT = 192;
const FONT: Record<string, readonly number[]> = {
  A: [2, 5, 7, 5, 5],
  B: [6, 5, 6, 5, 6],
  C: [3, 4, 4, 4, 3],
  D: [6, 5, 5, 5, 6],
  E: [7, 4, 6, 4, 7],
  F: [7, 4, 6, 4, 4],
  G: [3, 4, 5, 5, 3],
  H: [5, 5, 7, 5, 5],
  I: [7, 2, 2, 2, 7],
  J: [1, 1, 1, 5, 2],
  K: [5, 5, 6, 5, 5],
  L: [4, 4, 4, 4, 7],
  M: [5, 7, 7, 5, 5],
  N: [5, 7, 7, 7, 5],
  O: [2, 5, 5, 5, 2],
  P: [6, 5, 6, 4, 4],
  Q: [2, 5, 5, 3, 1],
  R: [6, 5, 6, 5, 5],
  S: [3, 4, 2, 1, 6],
  T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7],
  V: [5, 5, 5, 5, 2],
  W: [5, 5, 7, 7, 5],
  X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2],
  Z: [7, 1, 2, 4, 7],
  "0": [7, 5, 5, 5, 7],
  "1": [2, 6, 2, 2, 7],
  "2": [6, 1, 2, 4, 7],
  "3": [6, 1, 2, 1, 6],
  "4": [5, 5, 7, 1, 1],
  "5": [7, 4, 6, 1, 6],
  "6": [3, 4, 6, 5, 2],
  "7": [7, 1, 2, 2, 2],
  "8": [2, 5, 2, 5, 2],
  "9": [2, 5, 3, 1, 6],
  ".": [0, 0, 0, 0, 2],
  ":": [0, 2, 0, 2, 0],
  "/": [1, 1, 2, 4, 4],
  "-": [0, 0, 7, 0, 0],
  "?": [6, 1, 2, 0, 2],
  " ": [0, 0, 0, 0, 0],
};
const ART_COLORS: readonly Rgb[] = [
  [214, 70, 89],
  [53, 130, 206],
  [55, 174, 139],
  [147, 92, 206],
  [221, 139, 47],
];

const assertFixture = (fixture: LauncherFixtureV1) => {
  if (
    !fixture.names.length ||
    !Number.isSafeInteger(fixture.selectedIndex) ||
    fixture.selectedIndex < 0 ||
    fixture.selectedIndex >= fixture.names.length
  )
    throw new LauncherPreviewError("invalid-fixture", "Launcher fixture selection is invalid.");
};
const blendPixel = (
  target: Uint8Array,
  targetWidth: number,
  x: number,
  y: number,
  red: number,
  green: number,
  blue: number,
  sourceAlpha: number,
  opacity = 255,
  brightness = 1,
) => {
  const targetHeight = target.length / (targetWidth * 4);
  if (x < 0 || y < 0 || x >= targetWidth || y >= targetHeight) return;
  const output = (y * targetWidth + x) * 4,
    alpha = Math.round((sourceAlpha * opacity) / 255),
    inverse = 255 - alpha;
  target[output] = Math.round((Math.min(255, red * brightness) * alpha + target[output]! * inverse) / 255);
  target[output + 1] = Math.round((Math.min(255, green * brightness) * alpha + target[output + 1]! * inverse) / 255);
  target[output + 2] = Math.round((Math.min(255, blue * brightness) * alpha + target[output + 2]! * inverse) / 255);
  target[output + 3] = Math.min(255, alpha + Math.round((target[output + 3]! * inverse) / 255));
};
const fill = (
  target: Uint8Array,
  targetWidth: number,
  left: number,
  top: number,
  width: number,
  height: number,
  rgb: Rgb,
  alpha = 255,
) => {
  const targetHeight = target.length / (targetWidth * 4),
    startX = Math.max(0, left),
    endX = Math.min(targetWidth, left + width),
    startY = Math.max(0, top),
    endY = Math.min(targetHeight, top + height);
  for (let y = startY; y < endY; y += 1)
    for (let x = startX; x < endX; x += 1) {
      if (alpha !== 255) {
        blendPixel(target, targetWidth, x, y, rgb[0], rgb[1], rgb[2], alpha);
        continue;
      }
      const offset = (y * targetWidth + x) * 4;
      target[offset] = rgb[0];
      target[offset + 1] = rgb[1];
      target[offset + 2] = rgb[2];
      target[offset + 3] = 255;
    }
};
const roundedFill = (
  target: Uint8Array,
  targetWidth: number,
  left: number,
  top: number,
  width: number,
  height: number,
  radius: number,
  color: Rgb,
) => {
  const r = Math.min(radius, width / 2, height / 2);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const dx = x < r ? r - x : x >= width - r ? x - (width - r - 1) : 0,
        dy = y < r ? r - y : y >= height - r ? y - (height - r - 1) : 0;
      if (!dx || !dy || dx * dx + dy * dy <= r * r)
        blendPixel(target, targetWidth, left + x, top + y, color[0], color[1], color[2], 255);
    }
};
const imageRegion = (
  target: Uint8Array,
  targetWidth: number,
  source: RgbaImageV1,
  sourceLeft: number,
  sourceTop: number,
  sourceWidth: number,
  sourceHeight: number,
  left: number,
  top: number,
  width = sourceWidth,
  height = sourceHeight,
  opacity = 255,
) => {
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const sx = sourceLeft + Math.floor((x * sourceWidth) / width),
        sy = sourceTop + Math.floor((y * sourceHeight) / height),
        input = (sy * source.width + sx) * 4;
      if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) continue;
      blendPixel(
        target,
        targetWidth,
        left + x,
        top + y,
        source.pixels[input]!,
        source.pixels[input + 1]!,
        source.pixels[input + 2]!,
        source.pixels[input + 3]!,
        opacity,
      );
    }
};
const textWidth = (text: string) => Math.max(0, [...text].length * 4 - 1);
const drawText = (
  target: Uint8Array,
  targetWidth: number,
  text: string,
  left: number,
  top: number,
  color: Rgb,
  maximumWidth = targetWidth - left,
) => {
  for (const [index, character] of [...text.toUpperCase()].entries()) {
    if (index * 4 + 3 > maximumWidth) break;
    const rows = FONT[character] ?? FONT["?"]!;
    for (let y = 0; y < 5; y += 1)
      for (let x = 0; x < 3; x += 1)
        if (rows[y]! & (1 << (2 - x)))
          blendPixel(target, targetWidth, left + index * 4 + x, top + y, color[0], color[1], color[2], 255);
  }
};
const gameIcon = (target: Uint8Array, left: number, top: number, index: number, color: Rgb, size = 32) => {
  const scaled = (value: number) => Math.max(1, Math.round((value * size) / 32));
  roundedFill(target, SCREEN_WIDTH, left, top, size, size, scaled(7), color);
  const ink: Rgb = [245, 247, 250];
  fill(target, SCREEN_WIDTH, left + scaled(7), top + scaled(8 + (index % 3)), scaled(18), scaled(3), ink);
  fill(target, SCREEN_WIDTH, left + scaled(9 + (index % 4)), top + scaled(14), scaled(14), scaled(10), ink);
  fill(target, SCREEN_WIDTH, left + scaled(13), top + scaled(11), scaled(6), scaled(16), [30, 38, 58]);
};
const gameCover = (name: string, index: number): RgbaImageV1 => {
  const pixels = new Uint8Array(106 * 96 * 4),
    color = ART_COLORS[index % ART_COLORS.length]!,
    dark: Rgb = color.map((channel) => Math.round(channel * 0.42)) as unknown as Rgb,
    light: Rgb = color.map((channel) => Math.min(255, channel + 42)) as unknown as Rgb;
  fill(pixels, 106, 0, 0, 106, 96, dark);
  for (let y = 3; y < 76; y += 6)
    fill(pixels, 106, 4 + ((y / 6 + index) % 3) * 6, y, 94 - ((y / 6 + index) % 3) * 6, 3, y % 12 ? color : light);
  roundedFill(pixels, 106, 35, 19, 36, 36, 10, light);
  fill(pixels, 106, 0, 76, 106, 20, [17, 22, 34], 238);
  drawText(pixels, 106, name, 7, 83, [248, 249, 252], 92);
  return { width: 106, height: 96, pixels };
};
const fileLines = (fixture: LauncherFixtureV1, index: number) => [
  fixture.names[index]!,
  ["ADVENTURE", "ARCADE", "PUZZLE", "PLATFORM", "RACING"][index % 5]!,
  `FILE ${index + 1} OF ${fixture.names.length}`,
];

const paintStatus = (top: Uint8Array, fixture: LauncherFixtureV1) => {
  const dateTime = fixture.status.dateTime ?? "08/20 14:35",
    nickname = fixture.status.nickname,
    nicknameLeft = SCREEN_WIDTH - textWidth(nickname),
    batteryRight = Math.max(176, Math.min(256, nicknameLeft - 18)),
    batteryLeft = batteryRight - 16,
    segments = Math.max(0, Math.min(4, Math.ceil(fixture.status.batteryPercent / 25))),
    speaker = Math.max(0, Math.min(3, fixture.status.speakerLevel ?? 2));
  drawText(top, SCREEN_WIDTH, dateTime, 106, 5, [208, 208, 208], 49);
  drawText(top, SCREEN_WIDTH, nickname, nicknameLeft, 5, [79, 155, 196], 66);
  fill(top, SCREEN_WIDTH, batteryLeft, 4, 14, 8, [208, 208, 208]);
  fill(top, SCREEN_WIDTH, batteryLeft + 2, 6, 10, 4, [30, 34, 42]);
  fill(top, SCREEN_WIDTH, batteryLeft + 2, 6, Math.round((segments / 4) * 10), 4, [111, 220, 80]);
  fill(top, SCREEN_WIDTH, batteryRight, 6, 2, 4, [208, 208, 208]);
  fill(top, SCREEN_WIDTH, 3, 6, 3, 4, [208, 208, 208]);
  for (let ring = 0; ring < speaker; ring += 1)
    fill(top, SCREEN_WIDTH, 7 + ring * 3, 7 - ring, 1, 2 + ring * 2, [208, 208, 208]);
};
const topContent = (
  top: Uint8Array,
  fixture: LauncherFixtureV1,
  mode: LauncherPreviewModeV1,
  material?: MaterialRolesV1,
) => {
  const index = fixture.selectedIndex,
    lines = fileLines(fixture, index),
    cover = gameCover(fixture.names[index]!, index),
    geometry = LAUNCHER_PREVIEW_AUTHORITY_V1.composition.top,
    textColor: Rgb = material ? material.onSecondaryContainer : [30, 30, 30],
    secondaryColor: Rgb = material ? material.onSurfaceVariant : textColor;
  if (mode !== "coverflow") imageRegion(top, SCREEN_WIDTH, cover, 0, 0, 106, 96, geometry.cover[0], geometry.cover[1]);
  if (material) {
    roundedFill(top, SCREEN_WIDTH, 18, 122, 64, 64, 12, material.secondaryContainer);
    gameIcon(top, ...geometry.materialIcon, index, material.mainIconBg);
    geometry.materialLines.forEach(([x, y], line) =>
      drawText(top, SCREEN_WIDTH, lines[line]!, x, y, line ? secondaryColor : textColor, 168),
    );
    drawText(
      top,
      SCREEN_WIDTH,
      `${fixture.names[index]!.replaceAll(" ", "-")}.NDS`,
      ...geometry.materialFilename,
      secondaryColor,
      220,
    );
  } else {
    gameIcon(top, ...geometry.customIcon, index, [200, 200, 200]);
    geometry.customLines.forEach(([x, y], line) => drawText(top, SCREEN_WIDTH, lines[line]!, x, y, textColor, 176));
    drawText(
      top,
      SCREEN_WIDTH,
      `${fixture.names[index]!.replaceAll(" ", "-")}.NDS`,
      ...geometry.customFilename,
      textColor,
      220,
    );
  }
  paintStatus(top, fixture);
};

const customChrome = (bottom: Uint8Array, mode: LauncherPreviewModeV1, scrim: RgbaImageV1) => {
  const { extent } = LAUNCHER_PREVIEW_AUTHORITY_V1.composition.appBar;
  if (mode === "horizontal-grid" || mode === "coverflow") {
    for (let y = 0; y < extent; y += 1)
      for (let x = 0; x < SCREEN_WIDTH; x += 1) {
        const input = (y * scrim.width + (x % scrim.width)) * 4;
        blendPixel(
          bottom,
          SCREEN_WIDTH,
          x,
          y,
          scrim.pixels[input]!,
          scrim.pixels[input + 1]!,
          scrim.pixels[input + 2]!,
          scrim.pixels[input + 3]!,
        );
      }
  } else {
    for (let y = 0; y < SCREEN_HEIGHT; y += 1)
      for (let x = 0; x < extent; x += 1) {
        const input = (x * scrim.width + ((SCREEN_HEIGHT - 1 - y) % scrim.width)) * 4;
        blendPixel(
          bottom,
          SCREEN_WIDTH,
          x,
          y,
          scrim.pixels[input]!,
          scrim.pixels[input + 1]!,
          scrim.pixels[input + 2]!,
          scrim.pixels[input + 3]!,
        );
      }
  }
};
const appBarButtons = (bottom: Uint8Array, mode: LauncherPreviewModeV1, material?: MaterialRolesV1) => {
  const { buttonSize } = LAUNCHER_PREVIEW_AUTHORITY_V1.composition.appBar,
    scaled = (value: number) => Math.round((value * buttonSize) / 32),
    vertical = mode === "vertical-grid" || mode === "banner-list",
    positions = vertical
      ? [
          [0, 0],
          [0, SCREEN_HEIGHT - buttonSize],
        ]
      : [
          [0, 0],
          [SCREEN_WIDTH - buttonSize, 0],
        ],
    icon: Rgb = material ? material.onSurfaceVariant : [235, 239, 244];
  for (const [button, [left, top]] of positions.entries()) {
    if (!material)
      roundedFill(
        bottom,
        SCREEN_WIDTH,
        left! + scaled(3),
        top! + scaled(3),
        scaled(26),
        scaled(26),
        scaled(13),
        [77, 84, 96],
      );
    if (button === 0) {
      fill(bottom, SCREEN_WIDTH, left! + scaled(8), top! + scaled(15), scaled(15), scaled(2), icon);
      for (let step = 0; step < scaled(6); step += 1) {
        blendPixel(
          bottom,
          SCREEN_WIDTH,
          left! + scaled(8) + step,
          top! + scaled(15) - step,
          icon[0],
          icon[1],
          icon[2],
          255,
        );
        blendPixel(
          bottom,
          SCREEN_WIDTH,
          left! + scaled(8) + step,
          top! + scaled(16) + step,
          icon[0],
          icon[1],
          icon[2],
          255,
        );
      }
    } else {
      roundedFill(bottom, SCREEN_WIDTH, left! + scaled(10), top! + scaled(10), scaled(12), scaled(12), scaled(6), icon);
      roundedFill(
        bottom,
        SCREEN_WIDTH,
        left! + scaled(14),
        top! + scaled(14),
        scaled(4),
        scaled(4),
        scaled(2),
        material ? material.inverseOnSurface : [77, 84, 96],
      );
      fill(bottom, SCREEN_WIDTH, left! + scaled(15), top! + scaled(7), scaled(2), scaled(18), icon);
      fill(bottom, SCREEN_WIDTH, left! + scaled(7), top! + scaled(15), scaled(18), scaled(2), icon);
    }
  }
};
const paintGrid = (
  bottom: Uint8Array,
  fixture: LauncherFixtureV1,
  mode: "horizontal-grid" | "vertical-grid",
  assets?: CustomPreviewAssetsV1,
  roles?: MaterialRolesV1,
) => {
  const geometry = LAUNCHER_PREVIEW_AUTHORITY_V1.layouts[mode],
    cell = LAUNCHER_PREVIEW_AUTHORITY_V1.composition.gridCell,
    horizontal = mode === "horizontal-grid";
  fixture.names.forEach((_, index) => {
    const [left, top] = horizontal
        ? [geometry.padding[0] + index * (cell.itemSize + geometry.spacing[0]), geometry.bounds[1]]
        : [geometry.bounds[0], geometry.padding[1] + index * (cell.itemSize + geometry.spacing[1])],
      selected = index === fixture.selectedIndex;
    if (assets)
      imageRegion(
        bottom,
        SCREEN_WIDTH,
        selected ? assets.gridSelected : assets.grid,
        0,
        0,
        ...cell.textureSize,
        left + cell.textureOffset[0],
        top + cell.textureOffset[1],
      );
    else
      roundedFill(
        bottom,
        SCREEN_WIDTH,
        left + cell.textureOffset[0],
        top + cell.textureOffset[1],
        ...cell.textureSize,
        12,
        selected ? roles!.mainIconBg : roles!.surfaceBright,
      );
    gameIcon(
      bottom,
      left + cell.iconOffset[0],
      top + cell.iconOffset[1],
      index,
      roles ? roles.onSurface : [200, 200, 200],
      cell.iconSize,
    );
  });
};
const paintBanner = (
  bottom: Uint8Array,
  fixture: LauncherFixtureV1,
  assets?: CustomPreviewAssetsV1,
  roles?: MaterialRolesV1,
) => {
  const geometry = LAUNCHER_PREVIEW_AUTHORITY_V1.layouts["banner-list"],
    cell = LAUNCHER_PREVIEW_AUTHORITY_V1.composition.bannerCell;
  fixture.names.forEach((_, index) => {
    const left = geometry.bounds[0],
      top = geometry.padding[1] + index * (cell.itemSize[1] + geometry.spacing[1]),
      selected = index === fixture.selectedIndex,
      lines = fileLines(fixture, index),
      lineCount = (index % 3) + 1;
    if (assets)
      imageRegion(
        bottom,
        SCREEN_WIDTH,
        selected ? assets.bannerSelected : assets.banner,
        0,
        0,
        ...cell.textureSize,
        left + cell.textureOffset[0],
        top + cell.textureOffset[1],
      );
    else
      roundedFill(
        bottom,
        SCREEN_WIDTH,
        left,
        top,
        ...cell.itemSize,
        12,
        selected ? roles!.mainIconBg : roles!.surfaceBright,
      );
    gameIcon(
      bottom,
      left + cell.iconOffset[0],
      top + cell.iconOffset[1],
      index,
      roles ? roles.onSurface : [200, 200, 200],
      cell.iconSize,
    );
    const color: Rgb = roles ? (selected ? roles.onSecondaryContainer : roles.onSurface) : [30, 30, 30],
      start = lineCount === 1 ? top + 14 : lineCount === 2 ? top + 8 : top + 2;
    for (let line = 0; line < lineCount; line += 1)
      drawText(
        bottom,
        SCREEN_WIDTH,
        lines[line]!,
        left + cell.iconOffset[0] + cell.iconSize + 6,
        start + line * 12,
        color,
        152,
      );
  });
};

const fixedRound = (value: number) => (value < 0 ? -Math.round(-value) : Math.round(value));
// c648 indexes a 4096-entry Q14 table, then rounds the Z-axis coefficients to Q12.
const coverflowSinCos = (angle: number) => {
  const rawAngle = Math.trunc((angle * 65536) / 360) & 0xffff,
    tableIndex = (rawAngle * 4096) >>> 16,
    radians = (tableIndex * 2 * Math.PI) / 4096,
    sin14 = fixedRound(Math.sin(radians) * 16384),
    cos14 = fixedRound(Math.cos(radians) * 16384);
  return {
    sin14: sin14 / 16384,
    cos14: cos14 / 16384,
    sin12: ((sin14 + 2) >> 2) / 4096,
    cos12: ((cos14 + 2) >> 2) / 4096,
  };
};
const coverflowPoint = (positionX: number, angle: number, depth: number, localX: number, localY: number) => {
  // Mirror c648's 4.12 model matrix and its perspective matrix with W scaled by 64.
  const { sin14, cos14, sin12, cos12 } = coverflowSinCos(angle),
    x = cos14 * 8 * localX + sin14 * depth + positionX + 0.5 - 128,
    y = 64 * localY + 20.5,
    z = (-sin12 * localX) / 8 + (cos12 * depth) / 64 - 4;
  return { x: 128 - (4 * x) / z, y: 96 - (3 * y) / z };
};
const perspectiveCover = (
  target: Uint8Array,
  source: RgbaImageV1,
  positionX: number,
  angle: number,
  depth: number,
  reflectionRows: number,
) => {
  const halfWidth = source.width / 16,
    { cos14 } = coverflowSinCos(angle),
    brightness = Math.min(1, (20 + 16 * Math.abs(cos14)) / 31),
    drawBand = (sourceTop: number, sourceHeight: number, localTop: number, localBottom: number, opacity: number) => {
      for (let sourceX = 0; sourceX < source.width; sourceX += 1) {
        const localLeft = -halfWidth + (sourceX / source.width) * halfWidth * 2,
          localRight = -halfWidth + ((sourceX + 1) / source.width) * halfWidth * 2,
          left = coverflowPoint(positionX, angle, depth, localLeft, 0).x,
          right = coverflowPoint(positionX, angle, depth, localRight, 0).x,
          startX = Math.floor(Math.min(left, right)),
          endX = Math.ceil(Math.max(left, right));
        for (let targetX = startX; targetX < endX; targetX += 1) {
          const ratio = Math.max(0, Math.min(1, (targetX + 0.5 - left) / (right - left))),
            top = coverflowPoint(positionX, angle, depth, localLeft + (localRight - localLeft) * ratio, localTop).y,
            bottom = coverflowPoint(
              positionX,
              angle,
              depth,
              localLeft + (localRight - localLeft) * ratio,
              localBottom,
            ).y,
            startY = Math.floor(Math.min(top, bottom)),
            endY = Math.ceil(Math.max(top, bottom));
          for (let targetY = startY; targetY < endY; targetY += 1) {
            const sourceY = Math.max(
                sourceTop,
                Math.min(
                  sourceTop + sourceHeight - 1,
                  sourceTop + Math.floor(((targetY + 0.5 - top) / (bottom - top)) * sourceHeight),
                ),
              ),
              input = (sourceY * source.width + sourceX) * 4;
            blendPixel(
              target,
              SCREEN_WIDTH,
              targetX,
              targetY,
              source.pixels[input]!,
              source.pixels[input + 1]!,
              source.pixels[input + 2]!,
              source.pixels[input + 3]!,
              opacity,
              brightness,
            );
          }
        }
      }
    },
    corners = [-halfWidth, halfWidth].flatMap((x) => [
      coverflowPoint(positionX, angle, depth, x, -1),
      coverflowPoint(positionX, angle, depth, x, 1),
    ]),
    left = Math.min(...corners.map(({ x }) => x)),
    right = Math.max(...corners.map(({ x }) => x)),
    top = Math.min(...corners.map(({ y }) => y));
  drawBand(0, source.height, -1, 1, 255);
  for (let row = 0; row < reflectionRows; row += 1)
    drawBand(
      source.height - 1 - row,
      1,
      1 + row / 48,
      1 + (row + 1) / 48,
      Math.round((255 * (reflectionRows - row)) / 31),
    );
  return { width: Math.round(right - left), top: Math.round(top) };
};
const customCoverflow = (bottom: Uint8Array, fixture: LauncherFixtureV1): Coverflow => {
  const transforms: CoverflowTransform[] = [],
    reflectionRows = LAUNCHER_PREVIEW_AUTHORITY_V1.composition.customCoverflow.reflectionRows;
  for (const offset of [-2, 2, -1, 1, 0]) {
    const index = fixture.selectedIndex + offset;
    if (index < 0 || index >= fixture.names.length) continue;
    const distance = Math.abs(offset),
      x = offset === 0 ? 128 : 128 + (offset < 0 ? -1 : 1) * (24 + distance * 6),
      angle = offset === 0 ? 0 : (offset < 0 ? 1 : -1) * (45 + distance * 10),
      depth = distance ? -distance * 30 - 20 : 0,
      projected = perspectiveCover(bottom, gameCover(fixture.names[index]!, index), x, angle, depth, reflectionRows);
    transforms.push({
      offset,
      x,
      width: 106,
      renderedWidth: projected.width,
      top: projected.top,
      depth,
      angle,
      mask: 255,
      reflectionRows,
    });
  }
  return {
    centeredIndex: fixture.selectedIndex,
    dimmedLeft: transforms.filter(({ offset }) => offset < 0).length,
    dimmedRight: transforms.filter(({ offset }) => offset > 0).length,
    transforms: transforms.sort((a, b) => a.offset - b.offset),
  };
};
const roundedCover = (
  target: Uint8Array,
  source: RgbaImageV1,
  left: number,
  top: number,
  width: number,
  radius: number,
) => {
  const [clipLeft, clipRight] = LAUNCHER_PREVIEW_AUTHORITY_V1.composition.materialCoverflow.clip,
    coverLeft = Math.floor(left - (source.width - width) / 2 + 0.5);
  for (let x = 0; x < width; x += 1)
    for (let y = 0; y < source.height; y += 1) {
      const dx = x < radius ? radius - x : x >= width - radius ? x - (width - radius - 1) : 0,
        dy = y < radius ? radius - y : y >= source.height - radius ? y - (source.height - radius - 1) : 0,
        targetX = left + x;
      if (targetX < clipLeft || targetX >= clipRight || (dx && dy && dx * dx + dy * dy > radius * radius)) continue;
      const sx = targetX - coverLeft,
        input = (y * source.width + sx) * 4;
      if (sx < 0 || sx >= source.width) continue;
      blendPixel(
        target,
        SCREEN_WIDTH,
        targetX,
        top + y,
        source.pixels[input]!,
        source.pixels[input + 1]!,
        source.pixels[input + 2]!,
        source.pixels[input + 3]!,
      );
    }
};
const materialCoverflow = (bottom: Uint8Array, fixture: LauncherFixtureV1): Coverflow => {
  const transforms: CoverflowTransform[] = [],
    authority = LAUNCHER_PREVIEW_AUTHORITY_V1.composition.materialCoverflow;
  for (const offset of [-2, -1, 0, 1, 2]) {
    const index = fixture.selectedIndex + offset;
    if (index < 0 || index >= fixture.names.length) continue;
    const [x, width] =
        offset < 0
          ? [authority.selected[0] - 40 * Math.abs(offset), authority.smallWidth]
          : offset === 0
            ? authority.selected
            : offset === 1
              ? authority.next
              : [214, authority.smallWidth],
      depth = -5 - Math.abs(offset),
      radius = Math.min(authority.radius, width / 2);
    roundedCover(bottom, gameCover(fixture.names[index]!, index), x, authority.y, width, radius);
    transforms.push({
      offset,
      x,
      width: 106,
      renderedWidth: width,
      top: authority.y,
      depth,
      mask: 255,
      cornerRadius: authority.radius,
    });
  }
  return {
    centeredIndex: fixture.selectedIndex,
    dimmedLeft: transforms.filter(({ offset }) => offset < 0).length,
    dimmedRight: transforms.filter(({ offset }) => offset > 0).length,
    transforms,
  };
};

export function renderCustomScenesV1(
  mode: LauncherPreviewModeV1,
  fixture: LauncherFixtureV1,
  assets: CustomPreviewAssetsV1,
) {
  assertFixture(fixture);
  const top = stage(assets.top),
    bottom = stage(assets.bottom);
  topContent(top, fixture, mode);
  customChrome(bottom, mode, assets.scrim);
  appBarButtons(bottom, mode);
  if (mode === "horizontal-grid" || mode === "vertical-grid") paintGrid(bottom, fixture, mode, assets);
  if (mode === "banner-list") paintBanner(bottom, fixture, assets);
  const coverflow = mode === "coverflow" ? customCoverflow(bottom, fixture) : undefined;
  return {
    top,
    bottom,
    metadata: {
      selectedIndex: fixture.selectedIndex,
      inactiveOpacity: 255,
      fidelity: {
        geometry: "launcher-vector-backed",
        compiledPixels: "exact compiled output",
        raster: "deterministic CPU approximation",
      },
      ...(coverflow ? { coverflow } : {}),
    } satisfies LauncherPreviewMetadataV1,
  };
}

export function renderMaterialScenesV1(
  mode: LauncherPreviewModeV1,
  fixture: LauncherFixtureV1,
  roles: MaterialRolesV1,
) {
  assertFixture(fixture);
  const top = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT * 4),
    bottom = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
  for (let y = 0; y < SCREEN_HEIGHT; y += 1) {
    const ratio = y / (SCREEN_HEIGHT - 1),
      color = roles.inverseOnSurface.map((channel, index) =>
        Math.round(channel * (1 - ratio) + roles.secondaryContainer[index]! * ratio),
      ) as unknown as Rgb;
    fill(top, SCREEN_WIDTH, 0, y, SCREEN_WIDTH, 1, color);
  }
  fill(bottom, SCREEN_WIDTH, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, roles.inverseOnSurface);
  topContent(top, fixture, mode, roles);
  appBarButtons(bottom, mode, roles);
  if (mode === "horizontal-grid" || mode === "vertical-grid") paintGrid(bottom, fixture, mode, undefined, roles);
  if (mode === "banner-list") paintBanner(bottom, fixture, undefined, roles);
  const coverflow = mode === "coverflow" ? materialCoverflow(bottom, fixture) : undefined;
  return {
    top,
    bottom,
    metadata: {
      selectedIndex: fixture.selectedIndex,
      inactiveOpacity: 255,
      fidelity: {
        geometry: "launcher-vector-backed",
        materialFields: "launcher-vector-backed",
        raster: "deterministic CPU approximation",
      },
      ...(coverflow ? { coverflow } : {}),
    } satisfies LauncherPreviewMetadataV1,
  };
}
