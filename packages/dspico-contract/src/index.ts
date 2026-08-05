import type { CustomRenderPlanV1, RenderSurfacePlanV1 } from "../../theme-core/src/render-plan-v2.js";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type DiagnosticV1 = {
  version: 1;
  profileId: "dspico-launcher-v1";
  severity: "error" | "warning" | "suggestion";
  ruleId: string;
  location: { document: string; pointer: string };
  normalizedValue: JsonValue | { missing: true };
  evidence: { kind: "source" | "fixture"; ref: string; sha256: string }[];
  message: string;
  fingerprint: string;
};
export type ReportV1 = {
  reportVersion: 1;
  compatibility: {
    profileId: "dspico-launcher-v1";
    launcherCommit: string;
    compilerVersion: string;
    projectFormatVersion: 1;
    evidence: { path: string; sha256: string }[];
  };
  diagnostics: DiagnosticV1[];
  acknowledgmentFingerprints: string[];
  files: { path: string; bytes: number; sha256: string }[];
  credits: { name: string; role: string; source?: string }[];
  licenses: { name: string; spdx: string; source: string; notice?: string }[];
};

const evidence = {
  metadata: {
    kind: "source",
    ref: "docs/Themes.md",
    sha256: "d0b12dfbfcba6e70b01c19a23244a25094f46ad5ef355886345ed089cd627c81",
  },
  type: {
    kind: "source",
    ref: "arm9/source/themes/ThemeInfoFactory.thumb.cpp",
    sha256: "ca621fca760e64fb24d47b697fe1366122462257b1105666f6c7280516d5a380",
  },
  transition: {
    kind: "source",
    ref: "arm9/source/themes/LaunchTransitionStyle.h",
    sha256: "d87ebda8405531963eea156a82f2bdbe9dccbf72461aa5801fc6c3d7f87b93fe",
  },
  color: {
    kind: "source",
    ref: "arm9/source/themes/material/MaterialColorSchemeFactory.cpp",
    sha256: "d3f9c459521f1813f89d709f29c44d588a9be34459ac0c477286706e53c6a04e",
  },
  fixture: {
    kind: "fixture",
    ref: "_pico/themes/material/theme.json",
    sha256: "8699d6364ad4d18f409c6aeec804265af1f32648d169591ba7bea18ffc47ce49",
  },
} as const;

export const DSPICO_LAUNCHER_V1 = {
  profileId: "dspico-launcher-v1",
  launcherCommit: "f3ae63279ab72bc6c83124c752ec79f3247db437",
  evidence: Object.values(evidence),
  defaults: { coverStartScalePercent: 100, coverFinalAlpha: 12, scrimFinalAlpha: 14 },
} as const;

type Theme = Record<string, unknown>;
export type ValidationResultV1 = {
  profileId: "dspico-launcher-v1";
  theme?: Theme;
  diagnostics: DiagnosticV1[];
  acknowledgedFingerprints: string[];
  canExport: boolean;
};

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Theme)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  return JSON.stringify(value);
};

function sha256(value: string | Uint8Array): string {
  const bytes = [...(typeof value === "string" ? new TextEncoder().encode(value) : value)];
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let shift = 56; shift >= 0; shift -= 8) bytes.push(Math.floor(bitLength / 2 ** shift) & 255);
  const words = new Uint32Array(64);
  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const roots: number[] = [];
  for (let candidate = 2; roots.length < 64; candidate++) {
    let prime = true;
    for (let divisor = 2; divisor * divisor <= candidate; divisor++) if (candidate % divisor === 0) prime = false;
    if (prime) roots.push(candidate);
  }
  const constants = roots.map((prime) => Math.floor((Math.cbrt(prime) % 1) * 2 ** 32) >>> 0);
  const rotate = (word: number, count: number) => (word >>> count) | (word << (32 - count));
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index++)
      words[index] =
        ((bytes[offset + index * 4]! << 24) |
          (bytes[offset + index * 4 + 1]! << 16) |
          (bytes[offset + index * 4 + 2]! << 8) |
          bytes[offset + index * 4 + 3]!) >>>
        0;
    for (let index = 16; index < 64; index++) {
      const x = words[index - 15]!,
        y = words[index - 2]!;
      words[index] =
        (words[index - 16]! +
          (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) +
          words[index - 7]! +
          (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10))) >>>
        0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index++) {
      const first =
        (h! +
          (rotate(e!, 6) ^ rotate(e!, 11) ^ rotate(e!, 25)) +
          ((e! & f!) ^ (~e! & g!)) +
          constants[index]! +
          words[index]!) >>>
        0;
      const second = ((rotate(a!, 2) ^ rotate(a!, 13) ^ rotate(a!, 22)) + ((a! & b!) ^ (a! & c!) ^ (b! & c!))) >>> 0;
      [a, b, c, d, e, f, g, h] = [(first + second) >>> 0, a, b, c, (d! + first) >>> 0, e, f, g];
    }
    [a, b, c, d, e, f, g, h].forEach((part, index) => (hash[index] = (hash[index]! + part!) >>> 0));
  }
  return [...hash].map((word) => word.toString(16).padStart(8, "0")).join("");
}

const severityOrder = { error: 0, warning: 1, suggestion: 2 } as const;
const lexical = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
const compare = (left: DiagnosticV1, right: DiagnosticV1) =>
  severityOrder[left.severity] - severityOrder[right.severity] ||
  lexical(left.ruleId, right.ruleId) ||
  lexical(left.location.document, right.location.document) ||
  lexical(left.location.pointer, right.location.pointer) ||
  lexical(left.fingerprint, right.fingerprint);

export function validateTheme(input: unknown, acknowledgments: readonly string[] = []): ValidationResultV1 {
  const diagnostics: DiagnosticV1[] = [];
  const add = (
    severity: DiagnosticV1["severity"],
    ruleId: string,
    pointer: string,
    normalizedValue: DiagnosticV1["normalizedValue"],
    source: keyof typeof evidence,
    message: string,
  ) => {
    const location = { document: "theme.json", pointer };
    const fingerprint = sha256(canonical(["dspico-launcher-v1", ruleId, location, normalizedValue]));
    diagnostics.push({
      version: 1,
      profileId: "dspico-launcher-v1",
      severity,
      ruleId,
      location,
      normalizedValue,
      evidence: [evidence[source]],
      message,
      fingerprint,
    });
  };
  if (input === null || input === undefined)
    add("error", "document.unavailable", "", { missing: true }, "fixture", "Theme data is unavailable.");
  let parsed = input;
  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch {
      add("error", "document.malformed", "", input, "fixture", "Theme data is malformed.");
    }
  }
  const theme = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...(parsed as Theme) } : undefined;
  if (!theme && diagnostics.length === 0)
    add("error", "document.malformed", "", parsed as JsonValue, "fixture", "Theme data must be an object.");
  if (theme) {
    for (const field of ["name", "description", "author"] as const) {
      const value = theme[field];
      if (typeof value !== "string" || value.length === 0 || value !== value.trim())
        add(
          "error",
          `metadata.${field}`,
          `/${field}`,
          typeof value === "string" ? value.trim() : { missing: true },
          "metadata",
          `${field} must be a trimmed, non-empty string.`,
        );
    }
    if (theme.type !== "material")
      add(
        "error",
        "theme.type",
        "/type",
        (theme.type ?? { missing: true }) as JsonValue,
        "type",
        "Only Material themes are supported.",
      );
    if (theme.formatVersion !== undefined && theme.formatVersion !== 1)
      add(
        "error",
        "theme.format-version",
        "/formatVersion",
        theme.formatVersion as JsonValue,
        "fixture",
        "Theme format is newer or unsupported.",
      );
    for (const [key, value] of Object.entries(theme).filter(([key]) => key.endsWith("Color"))) {
      const color = value as Theme;
      const valid =
        color &&
        typeof color === "object" &&
        ["r", "g", "b"].every(
          (component) =>
            Number.isInteger(color[component]) && Number(color[component]) >= 0 && Number(color[component]) <= 255,
        );
      if (!valid)
        add(
          "error",
          `color.${key}`,
          `/${key}`,
          value as JsonValue,
          "color",
          `${key} must contain integer RGB components in 0..255.`,
        );
    }
    if (typeof theme.darkTheme !== "boolean")
      add(
        "error",
        "theme.dark-theme",
        "/darkTheme",
        theme.darkTheme as JsonValue,
        "color",
        "darkTheme must be boolean.",
      );
    const ranges = { coverStartScalePercent: [1, 200], coverFinalAlpha: [0, 31], scrimFinalAlpha: [0, 31] } as const;
    const rules = {
      coverStartScalePercent: "transition.cover-start-scale",
      coverFinalAlpha: "transition.cover-final-alpha",
      scrimFinalAlpha: "transition.scrim-final-alpha",
    } as const;
    const missing: Theme = {};
    for (const key of Object.keys(ranges) as (keyof typeof ranges)[]) {
      if (theme[key] === undefined) {
        theme[key] = DSPICO_LAUNCHER_V1.defaults[key];
        missing[key] = theme[key];
      }
      const [min, max] = ranges[key];
      if (!Number.isInteger(theme[key]) || Number(theme[key]) < min || Number(theme[key]) > max)
        add(
          "error",
          rules[key],
          `/${key}`,
          theme[key] as JsonValue,
          "transition",
          `${key} is outside the supported range.`,
        );
    }
    if (Object.keys(missing).length)
      add(
        "warning",
        "transition.defaults-applied",
        "/",
        missing as JsonValue,
        "transition",
        "Launcher transition defaults were applied.",
      );
    if (typeof theme.description === "string" && theme.description.length > 0 && theme.description.length < 10)
      add(
        "warning",
        "metadata.short-description",
        "/description",
        theme.description,
        "metadata",
        "A longer description improves theme identification.",
      );
  }
  diagnostics.sort(compare);
  const accepted = [...new Set(acknowledgments)]
    .filter((fingerprint) =>
      diagnostics.some((item) => item.severity === "warning" && item.fingerprint === fingerprint),
    )
    .sort();
  return {
    profileId: "dspico-launcher-v1",
    ...(theme ? { theme } : {}),
    diagnostics,
    acknowledgedFingerprints: accepted,
    canExport: diagnostics.every(
      (item) => item.severity === "suggestion" || (item.severity === "warning" && accepted.includes(item.fingerprint)),
    ),
  };
}

const objectValue = (value: unknown): Theme | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Theme) : undefined;
const customRanges = {
  coverStartScalePercent: [1, 200],
  coverFinalAlpha: [0, 31],
  scrimFinalAlpha: [0, 31],
} as const;
const laterSlots = new Set(["grid", "banner", "scrim", "palette", "icon", "preview", "audio", "bgm"]);

// prettier-ignore
export function validateThemeProjectV2(input: unknown, acknowledgments?: readonly string[]): ValidationResultV1 {
  const diagnostics: DiagnosticV1[] = [], project = objectValue(input);
  const add = (severity: DiagnosticV1["severity"], ruleId: string, pointer: string, normalizedValue: DiagnosticV1["normalizedValue"], source: keyof typeof evidence, message: string) => {
    const location = { document: "project.json", pointer };
    diagnostics.push({ version: 1, profileId: "dspico-launcher-v1", severity, ruleId, location, normalizedValue, evidence: [evidence[source]], message, fingerprint: sha256(canonical(["dspico-launcher-v1", ruleId, location, project?.themeKind ?? { missing: true }, normalizedValue])) });
  };
  if (!project) add("error", "document.malformed", "", input as JsonValue, "fixture", "Project data must be an object.");
  if (project) {
    if (project.formatVersion !== 2) add("error", "theme.format-version", "/formatVersion", project.formatVersion as JsonValue, "fixture", "Custom projects require format version 2.");
    if (project.themeKind !== "custom") add("error", "theme.kind", "/themeKind", project.themeKind as JsonValue, "type", "Custom validation requires the Custom theme kind.");
    if (project.targetProfileId !== "dspico-launcher-v1") add("error", "profile.unsupported", "/targetProfileId", project.targetProfileId as JsonValue, "type", "The target compatibility profile is unsupported.");

    const metadata = objectValue(project.metadata);
    for (const field of ["name", "description", "author"] as const) {
      const value = metadata?.[field];
      if (typeof value !== "string" || !value || value !== value.trim()) add("error", `metadata.${field}`, `/metadata/${field}`, typeof value === "string" ? value.trim() : { missing: true }, "metadata", `${field} must be a trimmed, non-empty string.`);
    }
    if (typeof metadata?.description === "string" && metadata.description.length > 0 && metadata.description.length < 10) add("warning", "metadata.short-description", "/metadata/description", metadata.description, "metadata", "A longer description improves theme identification.");

    const transition = objectValue(project.launchTransition), missing: Theme = {};
    for (const [field, [minimum, maximum]] of Object.entries(customRanges)) {
      const nested = transition?.[field], root = project[field];
      if (nested === undefined) missing[field] = DSPICO_LAUNCHER_V1.defaults[field as keyof typeof DSPICO_LAUNCHER_V1.defaults];
      else if (!Number.isInteger(nested) || Number(nested) < minimum || Number(nested) > maximum) add("error", `transition.${field}`, `/launchTransition/${field}`, nested as JsonValue, "transition", `${field} is outside the supported range.`);
      if (root !== undefined && nested !== undefined && root !== nested) add("error", "transition.conflict", `/launchTransition/${field}`, { nested, root } as JsonValue, "transition", `Root and nested ${field} values conflict.`);
    }
    if (Object.keys(missing).length) add("warning", "transition.defaults-applied", "/launchTransition", missing as JsonValue, "transition", "Launcher transition defaults would be applied.");

    for (const [key, value] of Object.entries(project)) if (laterSlots.has(key.toLowerCase())) add("error", "custom.unsupported-slot", `/${key}`, value as JsonValue, "type", `${key} is outside the first-release Custom profile.`);
    for (const containerName of ["slots", "artifacts"] as const) {
      const container = objectValue(project[containerName]);
      for (const [key, value] of Object.entries(container ?? {})) if (laterSlots.has(key.toLowerCase())) add("error", "custom.unsupported-slot", `/${containerName}/${key}`, value as JsonValue, "type", `${key} is outside the first-release Custom profile.`);
    }

    const manifests = Array.isArray(project.assetManifest) ? project.assetManifest.map(objectValue).filter(Boolean) : [];
    const assets = Array.isArray(project.assets) ? project.assets.map(objectValue).filter(Boolean) : [];
    const documents = Array.isArray(project.documents) ? project.documents.map(objectValue).filter(Boolean) : [];
    for (const screen of ["top", "bottom"] as const) if (documents.filter((document) => document?.screen === screen).length !== 1) add("error", "custom.document-required", "/documents", screen, "fixture", `Exactly one ${screen} document is required.`);
    documents.forEach((document, documentIndex) => {
      const pointer = `/documents/${documentIndex}`;
      if (document!.screen !== "top" && document!.screen !== "bottom") add("error", "custom.unsupported-slot", `${pointer}/screen`, document!.screen as JsonValue, "type", "Only topbg and bottombg documents are supported.");
      if (document!.width !== 256 || document!.height !== 192) add("error", "custom.document-dimensions", pointer, { width: document!.width, height: document!.height } as JsonValue, "fixture", "Custom documents must be exactly 256 by 192 pixels.");
      const layers = Array.isArray(document!.layers) ? document!.layers.map(objectValue).filter(Boolean) : [];
      if (!layers.length) add("error", "custom.source-required", `${pointer}/layers`, { missing: true }, "fixture", "A Custom background source is required.");
      layers.forEach((layer, layerIndex) => {
        const assetPointer = `${pointer}/layers/${layerIndex}/asset`, reference = objectValue(layer!.asset), sha = reference?.sha256, assetPath = reference?.path;
        const manifest = manifests.find((entry) => entry?.sha256 === sha), record = assets.find((entry) => entry?.sourceSha256 === sha);
        if (typeof sha !== "string" || !/^[0-9a-f]{64}$/.test(sha) || assetPath !== `assets/sha256/${sha}.png`) add("error", "custom.asset-reference", assetPointer, typeof assetPath === "string" ? assetPath : { missing: true }, "fixture", "The layer requires a canonical content-addressed PNG reference.");
        if (typeof sha !== "string" || !manifest || !record) add("error", "custom.asset-record", assetPointer, typeof sha === "string" ? sha : { missing: true }, "fixture", "The layer requires a manifest entry and canonical source record.");
        else {
          const provenance = objectValue(record.provenance), complete = ["originalName", "source", "author", "credit", "license", "terms", "notice", "intendedUse"].every((field) => typeof provenance?.[field] === "string" && String(provenance[field]).trim());
          if (record.referenceOnly !== false || provenance?.rightsToExport !== true || !complete) add("error", "custom.asset-rights", assetPointer, sha, "metadata", "The layer source lacks complete export rights and provenance.");
          if (record.width !== layer!.width || record.height !== layer!.height || record.normalizationPolicy !== "rgba8-straight-top-left-v1") add("error", "custom.asset-source", assetPointer, { height: record.height, normalizationPolicy: record.normalizationPolicy, width: record.width } as JsonValue, "fixture", "The layer source dimensions or normalization policy do not match its canonical asset.");
        }
      });
    });
  }
  diagnostics.sort(compare);
  const requested = acknowledgments ?? (Array.isArray(project?.acknowledgments) ? project.acknowledgments.filter((value): value is string => typeof value === "string") : []);
  const accepted = [...new Set(requested)].filter((fingerprint) => diagnostics.some((item) => item.severity === "warning" && item.fingerprint === fingerprint)).sort(lexical);
  return { profileId: "dspico-launcher-v1", diagnostics, acknowledgedFingerprints: accepted, canExport: diagnostics.every((item) => item.severity === "suggestion" || (item.severity === "warning" && accepted.includes(item.fingerprint))) };
}

export type NormalizedRgbaAssetV1 = {
  sourceSha256: string;
  width: number;
  height: number;
  normalizationPolicy: "rgba8-straight-top-left-v1";
  pixels: Uint8Array;
};
export type CompiledCustomBackgroundsV1 = {
  version: 1;
  profileId: "dspico-launcher-v1";
  packing: "le-xbgr1555-alpha128-round-half-up-no-dither-v1";
  top: Uint8Array;
  bottom: Uint8Array;
};
export class CustomCompileBlockedError extends Error {
  constructor(readonly diagnostics: DiagnosticV1[]) {
    super("Custom compilation is blocked by compatibility diagnostics.");
    this.name = "CustomCompileBlockedError";
  }
}
const roundDivide = (value: number, divisor: number) => Math.floor((value + Math.floor(divisor / 2)) / divisor);
const q5 = (value: number) => Math.min(31, Math.floor((value * 63 + 255) / 510));

export function packRgba8ToDspico15(rgba: Uint8Array): Uint8Array {
  if (rgba.length % 4 !== 0) throw new Error("RGBA8 byte length must be divisible by four.");
  const output = new Uint8Array(rgba.length / 2);
  for (let input = 0, offset = 0; input < rgba.length; input += 4, offset += 2) {
    const word =
      rgba[input + 3]! < 128
        ? 0
        : 0x8000 | q5(rgba[input]!) | (q5(rgba[input + 1]!) << 5) | (q5(rgba[input + 2]!) << 10);
    output[offset] = word & 255;
    output[offset + 1] = word >>> 8;
  }
  return output;
}

const expectedPlan = (project: Theme): CustomRenderPlanV1 => ({
  version: 1,
  policy: "q16-crop-source-over-v1",
  screens: (["top", "bottom"] as const).map((screen) => {
    const document = (project.documents as Theme[]).find((candidate) => candidate.screen === screen)!;
    return {
      screen,
      width: 256,
      height: 192,
      layers: (document.layers as Theme[]).flatMap((layer, order) =>
        layer.visible
          ? [
              {
                id: layer.id as string,
                order,
                asset: layer.asset as { path: string; sha256: string },
                opacity: layer.opacity as number,
                source: layer.crop as { x: number; y: number; width: number; height: number },
                destinationQ16: {
                  x: layer.xQ16 as number,
                  y: layer.yQ16 as number,
                  width: layer.widthQ16 as number,
                  height: layer.heightQ16 as number,
                },
              },
            ]
          : [],
      ),
    };
  }),
});

function compileSurface(surface: RenderSurfacePlanV1, sources: Map<string, NormalizedRgbaAssetV1>): Uint8Array {
  const pixelCount = 256 * 192;
  const alpha = new Uint16Array(pixelCount),
    red = new Uint32Array(pixelCount),
    green = new Uint32Array(pixelCount),
    blue = new Uint32Array(pixelCount);
  for (const layer of surface.layers) {
    const asset = sources.get(layer.asset.sha256);
    if (!asset) throw new Error(`Missing normalized RGBA8 source: ${layer.asset.sha256}`);
    if (asset.pixels.length !== asset.width * asset.height * 4)
      throw new Error(`Mismatched normalized RGBA8 source: ${layer.asset.sha256}`);
    const { source, destinationQ16: destination } = layer;
    const geometry = [
      source.x,
      source.y,
      source.width,
      source.height,
      destination.x,
      destination.y,
      destination.width,
      destination.height,
    ];
    if (
      !geometry.every(Number.isSafeInteger) ||
      !Number.isSafeInteger(layer.opacity) ||
      layer.opacity < 0 ||
      layer.opacity > 65536 ||
      source.x < 0 ||
      source.y < 0 ||
      source.width < 1 ||
      source.height < 1 ||
      source.x + source.width > asset.width ||
      source.y + source.height > asset.height ||
      destination.width < 1 ||
      destination.height < 1
    )
      throw new Error(`Invalid compile geometry: ${layer.id}`);
    for (let y = 0; y < 192; y += 1)
      for (let x = 0; x < 256; x += 1) {
        const relativeX = x * 65536 + 32768 - destination.x,
          relativeY = y * 65536 + 32768 - destination.y;
        if (relativeX < 0 || relativeY < 0 || relativeX >= destination.width || relativeY >= destination.height)
          continue;
        const sourceX = source.x + Number((BigInt(relativeX) * BigInt(source.width)) / BigInt(destination.width));
        const sourceY = source.y + Number((BigInt(relativeY) * BigInt(source.height)) / BigInt(destination.height));
        if (
          sourceX < source.x ||
          sourceY < source.y ||
          sourceX >= source.x + source.width ||
          sourceY >= source.y + source.height
        )
          continue;
        const input = (sourceY * asset.width + sourceX) * 4,
          output = y * 256 + x;
        const sourceAlpha = roundDivide(asset.pixels[input + 3]! * layer.opacity, 65536),
          inverse = 255 - sourceAlpha;
        red[output] = asset.pixels[input]! * sourceAlpha + roundDivide(red[output]! * inverse, 255);
        green[output] = asset.pixels[input + 1]! * sourceAlpha + roundDivide(green[output]! * inverse, 255);
        blue[output] = asset.pixels[input + 2]! * sourceAlpha + roundDivide(blue[output]! * inverse, 255);
        alpha[output] = sourceAlpha + roundDivide(alpha[output]! * inverse, 255);
      }
  }
  const rgba = new Uint8Array(pixelCount * 4);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const output = pixel * 4,
      divisor = alpha[pixel]!;
    if (divisor) {
      rgba[output] = Math.min(255, roundDivide(red[pixel]!, divisor));
      rgba[output + 1] = Math.min(255, roundDivide(green[pixel]!, divisor));
      rgba[output + 2] = Math.min(255, roundDivide(blue[pixel]!, divisor));
      rgba[output + 3] = divisor;
    }
  }
  return packRgba8ToDspico15(rgba);
}

export function compileCustomBackgroundsV1(
  projectInput: unknown,
  plan: CustomRenderPlanV1,
  sourceAssets: readonly NormalizedRgbaAssetV1[],
  acknowledgments?: readonly string[],
): CompiledCustomBackgroundsV1 {
  const validation = validateThemeProjectV2(projectInput, acknowledgments);
  if (!validation.canExport) throw new CustomCompileBlockedError(validation.diagnostics);
  const project = objectValue(projectInput)!;
  if (canonical(plan) !== canonical(expectedPlan(project)))
    throw new Error("Render plan does not match the canonical Custom project.");
  const records = (project.assets as unknown[]).map(objectValue).filter(Boolean);
  const sources = new Map<string, NormalizedRgbaAssetV1>();
  for (const source of sourceAssets) {
    const record = records.find((candidate) => candidate?.sourceSha256 === source.sourceSha256);
    if (
      sources.has(source.sourceSha256) ||
      source.normalizationPolicy !== "rgba8-straight-top-left-v1" ||
      !Number.isSafeInteger(source.width) ||
      !Number.isSafeInteger(source.height) ||
      source.width < 1 ||
      source.height < 1 ||
      record?.width !== source.width ||
      record?.height !== source.height
    )
      throw new Error(`Invalid normalized RGBA8 source: ${source.sourceSha256}`);
    sources.set(source.sourceSha256, source);
  }
  return {
    version: 1,
    profileId: "dspico-launcher-v1",
    packing: "le-xbgr1555-alpha128-round-half-up-no-dither-v1",
    top: compileSurface(plan.screens[0]!, sources),
    bottom: compileSurface(plan.screens[1]!, sources),
  };
}

export type ExportFileV1 = { path: string; bytes: Uint8Array };
export type ExportPlanV1 = {
  files: ExportFileV1[];
  zipBytes: Uint8Array;
  reportSha256: string;
  diagnostics: DiagnosticV1[];
};

export class ExportBlockedError extends Error {
  constructor(readonly diagnostics: DiagnosticV1[]) {
    super("Export is blocked by compatibility diagnostics.");
    this.name = "ExportBlockedError";
  }
}

const encoder = new TextEncoder();
const canonicalJson = (value: unknown): Uint8Array => encoder.encode(`${canonical(value)}\n`);
const write16 = (view: DataView, offset: number, value: number) => view.setUint16(offset, value, true);
const write32 = (view: DataView, offset: number, value: number) => view.setUint32(offset, value, true);
const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const assertPath = (candidate: string): void => {
  if (!candidate || candidate.startsWith("/") || candidate.includes("\\"))
    throw new Error(`Unsafe export path: ${candidate}`);
  const parts = candidate.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) throw new Error(`Unsafe export path: ${candidate}`);
};

function storedZip(files: readonly ExportFileV1[]): Uint8Array {
  const names = files.map(({ path }) => (assertPath(path), encoder.encode(path)));
  const localSize = files.reduce((size, file, index) => size + 30 + names[index]!.length + file.bytes.length, 0);
  const centralSize = files.reduce((size, _file, index) => size + 46 + names[index]!.length, 0);
  const output = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(output.buffer);
  let local = 0;
  let central = localSize;
  files.forEach((file, index) => {
    const name = names[index]!;
    const checksum = crc32(file.bytes);
    write32(view, local, 0x04034b50);
    write16(view, local + 4, 20);
    write16(view, local + 8, 0);
    write16(view, local + 12, 0x21);
    write32(view, local + 14, checksum);
    write32(view, local + 18, file.bytes.length);
    write32(view, local + 22, file.bytes.length);
    write16(view, local + 26, name.length);
    output.set(name, local + 30);
    output.set(file.bytes, local + 30 + name.length);
    write32(view, central, 0x02014b50);
    write16(view, central + 4, 20);
    write16(view, central + 6, 20);
    write16(view, central + 10, 0);
    write16(view, central + 14, 0x21);
    write32(view, central + 16, checksum);
    write32(view, central + 20, file.bytes.length);
    write32(view, central + 24, file.bytes.length);
    write16(view, central + 28, name.length);
    write32(view, central + 42, local);
    output.set(name, central + 46);
    local += 30 + name.length + file.bytes.length;
    central += 46 + name.length;
  });
  write32(view, central, 0x06054b50);
  write16(view, central + 8, files.length);
  write16(view, central + 10, files.length);
  write32(view, central + 12, centralSize);
  write32(view, central + 16, localSize);
  return output;
}

export function compileThemeExport(input: unknown, acknowledgments: readonly string[] = []): ExportPlanV1 {
  const validation = validateTheme(input, acknowledgments);
  if (!validation.canExport || !validation.theme) throw new ExportBlockedError(validation.diagnostics);
  const themeBytes = canonicalJson(validation.theme);
  const report: ReportV1 = {
    reportVersion: 1,
    compatibility: {
      profileId: DSPICO_LAUNCHER_V1.profileId,
      launcherCommit: DSPICO_LAUNCHER_V1.launcherCommit,
      compilerVersion: "0.1.0",
      projectFormatVersion: 1,
      evidence: DSPICO_LAUNCHER_V1.evidence
        .map(({ ref, sha256: digest }) => ({ path: ref, sha256: digest }))
        .sort((a, b) => lexical(a.path, b.path)),
    },
    diagnostics: validation.diagnostics,
    acknowledgmentFingerprints: validation.acknowledgedFingerprints,
    files: [{ path: "theme.json", bytes: themeBytes.length, sha256: sha256(themeBytes) }],
    credits: [{ name: String(validation.theme.author), role: "Theme author" }],
    licenses: [],
  };
  const reportBytes = canonicalJson(report);
  const files = [
    { path: "theme.json", bytes: themeBytes },
    { path: "report.json", bytes: reportBytes },
  ];
  return { files, zipBytes: storedZip(files), reportSha256: sha256(reportBytes), diagnostics: validation.diagnostics };
}

export function compileCustomThemeExportV1(
  projectInput: unknown,
  plan: CustomRenderPlanV1,
  sourceAssets: readonly NormalizedRgbaAssetV1[],
  acknowledgments?: readonly string[],
): ExportPlanV1 {
  const compiled = compileCustomBackgroundsV1(projectInput, plan, sourceAssets, acknowledgments);
  const validation = validateThemeProjectV2(projectInput, acknowledgments);
  const project = objectValue(projectInput)!;
  const metadata = objectValue(project.metadata)!;
  const records = (project.assets as unknown[]).map(objectValue).filter(Boolean);
  const themeBytes = canonicalJson({
    type: "custom",
    formatVersion: 1,
    name: metadata.name,
    description: metadata.description,
    author: metadata.author,
    launchTransition: project.launchTransition,
    topBackground: "topbg.bin",
    bottomBackground: "bottombg.bin",
  });
  const payloads = [
    { path: "theme.json", bytes: themeBytes },
    { path: "topbg.bin", bytes: compiled.top },
    { path: "bottombg.bin", bytes: compiled.bottom },
  ];
  const provenance = records.map((record) => objectValue(record!.provenance)!).filter(Boolean);
  const report = {
    reportVersion: 1,
    compatibility: {
      profileId: DSPICO_LAUNCHER_V1.profileId,
      launcherCommit: DSPICO_LAUNCHER_V1.launcherCommit,
      compilerVersion: "custom-compiler-v1",
      projectFormatVersion: 2,
      evidence: DSPICO_LAUNCHER_V1.evidence
        .map(({ ref, sha256: digest }) => ({ path: ref, sha256: digest }))
        .sort((a, b) => lexical(a.path, b.path)),
    },
    policies: {
      composition: "fixed-integer-source-over-v1",
      resize: "nearest-center-floor-v1",
      packing: compiled.packing,
      dithering: "disabled",
    },
    diagnostics: validation.diagnostics,
    acknowledgmentFingerprints: validation.acknowledgedFingerprints,
    sources: [...new Set(records.map((record) => String(record!.sourceSha256)))].sort(lexical),
    lineage: plan.screens.flatMap((surface) =>
      surface.layers.map((layer) => ({
        screen: surface.screen,
        layerId: layer.id,
        order: layer.order,
        sourceSha256: layer.asset.sha256,
        crop: layer.source,
        destinationQ16: layer.destinationQ16,
        opacity: layer.opacity,
      })),
    ),
    files: payloads.map((file) => ({ path: file.path, bytes: file.bytes.length, sha256: sha256(file.bytes) })),
    credits: provenance
      .map((item) => ({ name: String(item.credit), role: String(item.intendedUse), source: String(item.source) }))
      .sort((a, b) => lexical(a.name, b.name) || lexical(a.source, b.source)),
    licenses: provenance
      .map((item) => ({
        name: String(item.license),
        spdx: String(item.license),
        source: String(item.source),
        notice: String(item.notice),
      }))
      .sort((a, b) => lexical(a.name, b.name) || lexical(a.source, b.source)),
    notices: [...new Set([...(project.notices as string[]), ...provenance.map((item) => String(item.notice))])].sort(
      lexical,
    ),
  };
  const reportBytes = canonicalJson(report);
  const files = [...payloads, { path: "report.json", bytes: reportBytes }];
  return { files, zipBytes: storedZip(files), reportSha256: sha256(reportBytes), diagnostics: validation.diagnostics };
}
