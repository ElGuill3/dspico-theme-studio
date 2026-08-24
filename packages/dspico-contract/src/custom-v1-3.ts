import { CODEC_POLICY_V1, PALETTE_POLICY_V1, type V13VisualFilesV1 } from "./codecs-v1-3.js";

export type CustomRgb8V1 = { r: number; g: number; b: number };
export type CustomPositionV1 = { x: number; y: number };
export type CustomTopIconV1 = { position: CustomPositionV1; blendColor: CustomRgb8V1 };
export type CustomTopTextV1 = {
  position: CustomPositionV1;
  width: number;
  textColor: CustomRgb8V1;
  blendColor: CustomRgb8V1;
};
export type CustomTopCoverV1 = { position: CustomPositionV1 };
export type CustomBottomIconV1 = { blendColor: CustomRgb8V1 };
export type CustomBottomTextV1 = { textColor: CustomRgb8V1 };
export type CustomThemeV13 = {
  type: "custom";
  name: string;
  description: string;
  author: string;
  primaryColor: CustomRgb8V1;
  darkTheme: boolean;
  topIcon?: CustomTopIconV1;
  topBannerTextLine0?: CustomTopTextV1;
  topBannerTextLine1?: CustomTopTextV1;
  topBannerTextLine2?: CustomTopTextV1;
  topFileNameText?: CustomTopTextV1;
  topCover?: CustomTopCoverV1;
  gridIcon?: CustomBottomIconV1;
  bannerListIcon?: CustomBottomIconV1;
  bannerListTextLine0?: CustomBottomTextV1;
  bannerListTextLine1?: CustomBottomTextV1;
  bannerListTextLine2?: CustomBottomTextV1;
};
export const CUSTOM_LAUNCHER_LAYOUT_KEYS_V1 = [
  "topIcon",
  "topBannerTextLine0",
  "topBannerTextLine1",
  "topBannerTextLine2",
  "topFileNameText",
  "topCover",
] as const;
export type CustomLauncherLayoutKeyV1 = (typeof CUSTOM_LAUNCHER_LAYOUT_KEYS_V1)[number];
export type CustomLauncherLayoutOverridesV1 = Partial<Pick<CustomThemeV13, CustomLauncherLayoutKeyV1>>;
export type CustomVisualCodecV1 = "xbgr555-le-v1" | "a3i5-v1" | "a5i3-v1";
export const CUSTOM_VISUAL_ROLES_V1 = [
  "top-background",
  "bottom-background",
  "grid-cell",
  "grid-cell-selected",
  "banner-cell",
  "banner-cell-selected",
  "scrim",
] as const;
export type CustomVisualRoleV1 = (typeof CUSTOM_VISUAL_ROLES_V1)[number];
export const CUSTOM_VISUAL_DOCUMENTS_V1 = {
  "top-background": { width: 256, height: 192 },
  "bottom-background": { width: 256, height: 192 },
  "grid-cell": { width: 64, height: 64 },
  "grid-cell-selected": { width: 64, height: 64 },
  "banner-cell": { width: 256, height: 49 },
  "banner-cell-selected": { width: 256, height: 49 },
  scrim: { width: 8, height: 42 },
} as const satisfies Record<CustomVisualRoleV1, { width: number; height: number }>;
export type CustomVisualSlotSpecV1 = {
  path: string;
  length: number;
  geometry: { width: number; height: number };
  codec: CustomVisualCodecV1;
  policy: typeof CODEC_POLICY_V1;
};
const slot = (
  path: string,
  length: number,
  width: number,
  height: number,
  codec: CustomVisualCodecV1,
): CustomVisualSlotSpecV1 => ({ path, length, geometry: { width, height }, codec, policy: CODEC_POLICY_V1 });
// prettier-ignore
export const CUSTOM_VISUAL_SLOTS_V1 = [slot("topbg.bin", 98_304, 256, 192, "xbgr555-le-v1"), slot("bottombg.bin", 98_304, 256, 192, "xbgr555-le-v1"), slot("gridcell.bin", 4_096, 64, 64, "a3i5-v1"), slot("gridcellSelected.bin", 4_096, 64, 64, "a3i5-v1"), slot("gridcellPltt.bin", 64, 32, 1, "xbgr555-le-v1"), slot("gridcellSelectedPltt.bin", 64, 32, 1, "xbgr555-le-v1"), slot("bannerListCell.bin", 12_544, 256, 49, "a3i5-v1"), slot("bannerListCellSelected.bin", 12_544, 256, 49, "a3i5-v1"), slot("bannerListCellPltt.bin", 64, 32, 1, "xbgr555-le-v1"), slot("bannerListCellSelectedPltt.bin", 64, 32, 1, "xbgr555-le-v1"), slot("scrim.bin", 336, 8, 42, "a5i3-v1"), slot("scrimPltt.bin", 16, 8, 1, "xbgr555-le-v1")] as const satisfies readonly CustomVisualSlotSpecV1[];
export const CUSTOM_VISUAL_FILE_SPECS_V1 = CUSTOM_VISUAL_SLOTS_V1;
export const CUSTOM_VISUAL_TOTAL_BYTES_V1 = 230_496 as const;
export type CustomVisualSlotV1 = {
  path: string;
  length: number;
  geometry: { width: number; height: number };
  codec: CustomVisualCodecV1;
  sourceSha256: string;
  bytes: Uint8Array;
};
export type CustomSourceProvenanceV1 = {
  sourceSha256: string;
  width: number;
  height: number;
  normalizationPolicy: "rgba8-straight-top-left-v1";
  provenance: Record<string, string | boolean>;
  referenceOnly: boolean;
};
export type CustomVisualSourceV1 = {
  role: CustomVisualRoleV1;
  sourceSha256: string;
  width: number;
  height: number;
  pixels: Uint8Array;
  provenance: Record<string, string | boolean>;
  referenceOnly?: boolean;
  sourceBytes?: Uint8Array;
  recipe?: Record<string, unknown>;
};
export type CustomModelDiagnosticV1 = {
  code: string;
  path: string;
  expected: unknown;
  observed: unknown;
  message: string;
};
export type CustomValidationResultV1 = { valid: boolean; totalBytes: number; diagnostics: CustomModelDiagnosticV1[] };
export type CustomVisualOutputV1 = CustomVisualSlotV1 & { role: CustomVisualRoleV1; sha256: string };
export type CustomVisualPackageV1 = {
  version: 1;
  profileId: "dspico-launcher-v1";
  codecPolicy: typeof CODEC_POLICY_V1;
  palettePolicy: typeof PALETTE_POLICY_V1;
  totalBytes: typeof CUSTOM_VISUAL_TOTAL_BYTES_V1;
  files: V13VisualFilesV1;
  outputs: readonly CustomVisualOutputV1[];
  lineage: readonly { role: CustomVisualRoleV1; sourceSha256: string; recipe: Record<string, unknown> }[];
  preview: {
    label: "Decoded post-codec output";
    fidelity: "Chromium approximation";
    hardwareParityClaimed: false;
    hardwareUnknown: true;
  };
};

const HASH = /^[0-9a-f]{64}$/;
const LAYOUT: Record<string, readonly string[]> = {
  topIcon: ["position", "blendColor"],
  topBannerTextLine0: ["position", "width", "textColor", "blendColor"],
  topBannerTextLine1: ["position", "width", "textColor", "blendColor"],
  topBannerTextLine2: ["position", "width", "textColor", "blendColor"],
  topFileNameText: ["position", "width", "textColor", "blendColor"],
  topCover: ["position"],
  gridIcon: ["blendColor"],
  bannerListIcon: ["blendColor"],
  bannerListTextLine0: ["textColor"],
  bannerListTextLine1: ["textColor"],
  bannerListTextLine2: ["textColor"],
};
type LayoutName = keyof typeof LAYOUT;
type RecordV1 = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordV1 =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number";
const exact = (value: RecordV1, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const add = (
  out: CustomModelDiagnosticV1[],
  code: string,
  path: string,
  expected: unknown,
  observed: unknown,
  message: string,
): void => {
  out.push({ code, path, expected, observed, message });
};
const finish = (diagnostics: CustomModelDiagnosticV1[], totalBytes = 0): CustomValidationResultV1 => ({
  valid: diagnostics.length === 0,
  totalBytes,
  diagnostics: diagnostics.sort((a, b) => a.code.localeCompare(b.code) || a.path.localeCompare(b.path)),
});
const checkColor = (value: unknown, path: string, out: CustomModelDiagnosticV1[]): void => {
  if (!isRecord(value)) return add(out, "custom.layout-object", path, "{r,g,b}", value, "Color must be complete.");
  if (!exact(value, ["r", "g", "b"]))
    add(
      out,
      "custom.layout-object",
      path,
      ["r", "g", "b"],
      Object.keys(value),
      "Color objects cannot be partial or extended.",
    );
  for (const key of ["r", "g", "b"]) {
    const observed = value[key];
    if (!isNumber(observed) || !Number.isInteger(observed) || observed < 0 || observed > 255)
      add(out, "custom.range", `${path}/${key}`, "integer 0..255", observed, "Color component is outside 0..255.");
  }
};
const checkPoint = (value: unknown, path: string, out: CustomModelDiagnosticV1[]): void => {
  if (!isRecord(value)) return add(out, "custom.layout-object", path, "{x,y}", value, "Position must be complete.");
  if (!exact(value, ["x", "y"]))
    add(
      out,
      "custom.layout-object",
      path,
      ["x", "y"],
      Object.keys(value),
      "Position objects cannot be partial or extended.",
    );
  if (!isNumber(value.x) || !Number.isInteger(value.x) || value.x < 0 || value.x > 255)
    add(out, "custom.range", `${path}/x`, "integer 0..255", value.x, "X is outside the screen.");
  if (!isNumber(value.y) || !Number.isInteger(value.y) || value.y < 0 || value.y > 191)
    add(out, "custom.range", `${path}/y`, "integer 0..191", value.y, "Y is outside the screen.");
};
const checkLayout = (name: LayoutName, value: unknown, out: CustomModelDiagnosticV1[]): void => {
  const path = `/${name}`,
    fields = LAYOUT[name];
  if (!isRecord(value))
    return add(out, "custom.layout-object", path, fields, value, "Nested objects must be complete.");
  if (!exact(value, fields))
    add(out, "custom.layout-object", path, fields, Object.keys(value), "Nested objects cannot be partial or extended.");
  if (fields.includes("position")) checkPoint(value.position, `${path}/position`, out);
  if (fields.includes("textColor")) checkColor(value.textColor, `${path}/textColor`, out);
  if (fields.includes("blendColor")) checkColor(value.blendColor, `${path}/blendColor`, out);
  if (fields.includes("width")) {
    const x = isRecord(value.position) && isNumber(value.position.x) ? value.position.x : 0;
    if (!isNumber(value.width) || !Number.isInteger(value.width) || value.width < 1 || x + value.width > 256)
      add(
        out,
        "custom.range",
        `${path}/width`,
        "integer 1..(256-position.x)",
        value.width,
        "Text width is outside the screen.",
      );
  }
};

export function validateCustomLauncherLayoutOverridesV1(input: unknown): CustomValidationResultV1 {
  const out: CustomModelDiagnosticV1[] = [];
  if (!isRecord(input))
    return finish([
      {
        code: "custom.layout-object",
        path: "",
        expected: "non-empty launcher layout override map",
        observed: input,
        message: "Launcher layout overrides must be a non-empty object.",
      },
    ]);
  const keys = Object.keys(input);
  if (!keys.length)
    add(
      out,
      "custom.layout-object",
      "",
      "non-empty launcher layout override map",
      input,
      "Launcher layout overrides must be non-empty.",
    );
  for (const key of keys) {
    if (!CUSTOM_LAUNCHER_LAYOUT_KEYS_V1.includes(key as CustomLauncherLayoutKeyV1)) {
      add(
        out,
        "custom.unsupported-field",
        `/${key}`,
        CUSTOM_LAUNCHER_LAYOUT_KEYS_V1,
        input[key],
        `${key} is unsupported.`,
      );
      continue;
    }
    checkLayout(key as LayoutName, input[key], out);
  }
  return finish(out);
}

export const isCustomLauncherLayoutOverridesV1 = (input: unknown): input is CustomLauncherLayoutOverridesV1 =>
  validateCustomLauncherLayoutOverridesV1(input).valid;

// prettier-ignore
export function validateCustomThemeV13(input: unknown): CustomValidationResultV1 { const out: CustomModelDiagnosticV1[] = [], theme = isRecord(input) ? input : undefined, allowed = ["type", "name", "description", "author", "primaryColor", "darkTheme", ...Object.keys(LAYOUT)]; if (!theme) return finish([{ code: "custom.document", path: "", expected: "object", observed: input, message: "Custom theme must be an object." }]); for (const key of Object.keys(theme)) if (!allowed.includes(key)) add(out, "custom.unsupported-field", `/${key}`, allowed, theme[key], `${key} is unsupported.`); if (theme.type !== "custom") add(out, "custom.type", "/type", "custom", theme.type, "Custom themes require type custom."); for (const field of ["name", "description", "author"]) if (typeof theme[field] !== "string" || !theme[field] || theme[field] !== theme[field].trim()) add(out, "custom.metadata", `/${field}`, "trimmed non-empty string", theme[field], `${field} must be non-empty and trimmed.`); checkColor(theme.primaryColor, "/primaryColor", out); if (typeof theme.darkTheme !== "boolean") add(out, "custom.dark-theme", "/darkTheme", "boolean", theme.darkTheme, "darkTheme must be boolean."); for (const name of Object.keys(LAYOUT) as LayoutName[]) if (theme[name] !== undefined) checkLayout(name, theme[name], out); return finish(out); }

// prettier-ignore
export function validateCustomVisualPackageV1(input: unknown): CustomValidationResultV1 { const out: CustomModelDiagnosticV1[] = [], value = isRecord(input) ? input : undefined; if (!value) return finish([{ code: "custom.visual-package", path: "", expected: "object", observed: input, message: "Visual package must be an object." }]); if (!exact(value, ["slots", "provenance"])) add(out, "custom.unsupported-field", "", ["slots", "provenance"], Object.keys(value), "Visual package fields are closed."); const slots = Array.isArray(value.slots) ? value.slots : [], sources = Array.isArray(value.provenance) ? value.provenance : [], expected = new Map<string, (typeof CUSTOM_VISUAL_SLOTS_V1)[number]>(CUSTOM_VISUAL_SLOTS_V1.map((item) => [item.path, item])), seen = new Set<string>(); if (slots.length !== 12) add(out, "custom.visual-completeness", "/slots", 12, slots.length, "Exactly 12 visual slots are required."); let totalBytes = 0; for (const [index, candidate] of slots.entries()) { const path = `/slots/${index}`; if (!isRecord(candidate)) { add(out, "custom.visual-slot", path, "VisualSlot", candidate, "Visual slots must be objects."); continue; } if (!exact(candidate, ["path", "length", "geometry", "codec", "sourceSha256", "bytes"])) add(out, "custom.visual-slot", path, ["path", "length", "geometry", "codec", "sourceSha256", "bytes"], Object.keys(candidate), "VisualSlot fields are closed."); const name = typeof candidate.path === "string" ? candidate.path : "", spec = expected.get(name); if (!spec) add(out, "custom.visual-name", `${path}/path`, [...expected.keys()], candidate.path, "Visual slot name is unsupported."); else { if (seen.has(name)) add(out, "custom.visual-duplicate", `${path}/path`, "unique path", name, "Visual slot paths must be unique."); seen.add(name); totalBytes += spec.length; const observed = candidate.bytes instanceof Uint8Array ? candidate.bytes.length : candidate.bytes; if (candidate.length !== spec.length || !(candidate.bytes instanceof Uint8Array) || candidate.bytes.length !== spec.length) add(out, "custom.visual-length", `${path}/length`, spec.length, observed, "Visual slot bytes have the wrong length."); if (!isRecord(candidate.geometry) || candidate.geometry.width !== spec.geometry.width || candidate.geometry.height !== spec.geometry.height) add(out, "custom.visual-geometry", `${path}/geometry`, spec.geometry, candidate.geometry, "Visual slot geometry is wrong."); if (candidate.codec !== spec.codec) add(out, "custom.visual-codec", `${path}/codec`, spec.codec, candidate.codec, "Visual slot codec is wrong."); } if (typeof candidate.sourceSha256 !== "string" || !HASH.test(candidate.sourceSha256)) add(out, "custom.provenance-hash", `${path}/sourceSha256`, "64 lowercase hex characters", candidate.sourceSha256, "Visual slots require a source hash."); } if (totalBytes !== CUSTOM_VISUAL_TOTAL_BYTES_V1) add(out, "custom.visual-total-bytes", "/slots", CUSTOM_VISUAL_TOTAL_BYTES_V1, totalBytes, "The visual manifest must total 230496 bytes."); const hashes = new Set<string>(); for (const [index, candidate] of sources.entries()) { const path = `/provenance/${index}`; if (!isRecord(candidate)) { add(out, "custom.provenance", path, "source record", candidate, "Provenance must be an object."); continue; } const rights = isRecord(candidate.provenance) ? candidate.provenance : undefined, fields = ["originalName", "source", "author", "credit", "license", "terms", "notice", "intendedUse"]; if (typeof candidate.sourceSha256 !== "string" || !HASH.test(candidate.sourceSha256) || candidate.normalizationPolicy !== "rgba8-straight-top-left-v1" || candidate.referenceOnly !== false || !rights || rights.rightsToExport !== true || fields.some((field) => typeof rights?.[field] !== "string" || !rights[field])) add(out, "custom.provenance-rights", path, "normalized source with complete export rights", candidate, "Source provenance is incomplete or unauthorized."); if (typeof candidate.sourceSha256 === "string") hashes.add(candidate.sourceSha256); } for (const [index, candidate] of slots.entries()) if (isRecord(candidate) && typeof candidate.sourceSha256 === "string" && !hashes.has(candidate.sourceSha256)) add(out, "custom.provenance-missing", `/slots/${index}/sourceSha256`, "matching provenance", candidate.sourceSha256, "Every visual slot needs source provenance."); return finish(out, totalBytes); }

export function validateCustomModelV1(input: unknown): CustomValidationResultV1 {
  if (!isRecord(input) || !exact(input, ["theme", "visual"]))
    return finish([
      {
        code: "custom.model",
        path: "",
        expected: "{theme,visual}",
        observed: input,
        message: "Custom model must contain only theme and visual data.",
      },
    ]);
  const theme = validateCustomThemeV13(input.theme),
    visual = validateCustomVisualPackageV1(input.visual);
  return finish([...theme.diagnostics, ...visual.diagnostics], visual.totalBytes);
}
