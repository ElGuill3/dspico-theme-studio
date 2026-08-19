import { createHash } from "node:crypto";
import { Value } from "@sinclair/typebox/value";
import { CUSTOM_VISUAL_DOCUMENTS_V1, type CustomVisualRoleV1 } from "../../dspico-contract/src/custom-v1-3.js";
import { isQuarterTurnV1, type QuarterTurnV1 } from "../../dspico-contract/src/index.js";
import { validTextContentV1 } from "../../dspico-contract/src/pixel-font-v1.js";
import { LAUNCHER_V1_PROFILE } from "../../dspico-contract/src/profile-v1-3.js";
import { LayerV2Schema, type LayerV2 } from "./model-v2.js";
import { MAX_DOCUMENT_GUIDES_V3, MAX_LAYER_ID_LENGTH_V3 } from "./limits-v3.js";

export const V3_SCHEMA = "dspico.theme.project" as const;
export const V3_FORMAT_VERSION = 3 as const;
// prettier-ignore
export const V3_PROFILE = { profileId: LAUNCHER_V1_PROFILE.profileId, manifestSha256: LAUNCHER_V1_PROFILE.manifestSha256 } as const;
export type MediaTypeV3 = "image/png" | "audio/wav" | "audio/bcstm" | "application/json";
export type AssetRoleV3 =
  | "top-background"
  | "bottom-background"
  | "grid-cell"
  | "grid-cell-selected"
  | "banner-cell"
  | "banner-cell-selected"
  | "scrim"
  | "navigation-sound"
  | "select-sound"
  | "back-sound"
  | "bgm";
// prettier-ignore
export const V3_VISUAL_ROLES = ["top-background", "bottom-background", "grid-cell", "grid-cell-selected", "banner-cell", "banner-cell-selected", "scrim"] as const;
export const V3_ASSET_ROLES = [
  ...V3_VISUAL_ROLES,
  "navigation-sound",
  "select-sound",
  "back-sound",
  "bgm",
] as const satisfies readonly AssetRoleV3[];
export const isAssetRoleV3 = (value: unknown): value is AssetRoleV3 =>
  typeof value === "string" && V3_ASSET_ROLES.includes(value as AssetRoleV3);
export type MediaRefV1 = { sha256: string; byteLength: number; mediaType: MediaTypeV3; path: string };
export type MediaAssetV3 = {
  id: string;
  media: MediaRefV1;
  role?: AssetRoleV3;
  provenance: Record<string, string | boolean>;
  rightsToExport: boolean;
  recipe?: Record<string, unknown>;
  prepared?: MediaRefV1;
  evidence?: string[];
  referenceOnly?: boolean;
};
export type LegacyEvidenceV3 = { sourceFormat: "v1" | "v2" | "parity"; sourceHash: string; sourceBytes: string };
export type QuarantineV3 = { sha256: string; path: string; reason: string; blocking: true };
type RotationV3 = { rotation?: QuarterTurnV1; groupId?: string; locked?: boolean };
export type ShapeLayerV3 = {
  kind: "shape";
  shape: "rectangle" | "ellipse";
  fill: string;
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  xQ16: number;
  yQ16: number;
  widthQ16: number;
  heightQ16: number;
} & RotationV3;
export type TextLayerV3 = {
  kind: "text";
  content: string;
  fill: string;
  scale: number;
  alignment: "left" | "center" | "right";
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  xQ16: number;
  yQ16: number;
  widthQ16: number;
  heightQ16: number;
} & RotationV3;
export type ImageLayerV3 = LayerV2 & RotationV3;
export type VisualLayerV3 = ImageLayerV3 | ShapeLayerV3 | TextLayerV3;
export const layerRotationV3 = (layer: Pick<VisualLayerV3, "rotation">): QuarterTurnV1 => layer.rotation ?? 0;
export const layerLockedV3 = (layer: Pick<VisualLayerV3, "locked">): boolean => layer.locked ?? false;
export type DocumentGuideV3 = { id: string; axis: "x" | "y"; position: number };
export type VisualDocumentV3 = {
  role: CustomVisualRoleV1;
  width: number;
  height: number;
  layers: VisualLayerV3[];
  guides?: DocumentGuideV3[];
};
export const createVisualDocumentV3 = (role: CustomVisualRoleV1): VisualDocumentV3 => ({
  role,
  ...CUSTOM_VISUAL_DOCUMENTS_V1[role],
  layers: [],
  guides: [],
});
export const canonicalHexColorV3 = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/.test(value);
export const isShapeLayerV3 = (value: unknown): value is ShapeLayerV3 =>
  Boolean(value && typeof value === "object" && (value as { kind?: unknown }).kind === "shape");
export const isTextLayerV3 = (value: unknown): value is TextLayerV3 =>
  Boolean(value && typeof value === "object" && (value as { kind?: unknown }).kind === "text");
export const isCanonicalLayerIdV3 = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= MAX_LAYER_ID_LENGTH_V3 &&
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
export const isDocumentGuideV3 = (
  value: unknown,
  document: Pick<VisualDocumentV3, "width" | "height">,
): value is DocumentGuideV3 => {
  const guide = value as Partial<DocumentGuideV3> | null;
  return Boolean(
    guide &&
    typeof guide === "object" &&
    !Array.isArray(guide) &&
    Object.keys(guide).length === 3 &&
    isCanonicalLayerIdV3(guide.id) &&
    (guide.axis === "x" || guide.axis === "y") &&
    Number.isSafeInteger(guide.position) &&
    guide.position! >= 0 &&
    guide.position! <= (guide.axis === "x" ? document.width : document.height),
  );
};
export const validDocumentGuidesV3 = (document: Pick<VisualDocumentV3, "width" | "height" | "guides">): boolean => {
  const guides = document.guides ?? [];
  return (
    Array.isArray(guides) &&
    guides.length <= MAX_DOCUMENT_GUIDES_V3 &&
    guides.every((guide) => isDocumentGuideV3(guide, document)) &&
    new Set(guides.map(({ id }) => id)).size === guides.length
  );
};
export const createDocumentGuideV3 = (
  input: DocumentGuideV3,
  document: Pick<VisualDocumentV3, "width" | "height">,
): DocumentGuideV3 => {
  if (!isDocumentGuideV3(input, document)) throw new Error("Document guide is not canonical.");
  return structuredClone(input);
};
const commonLayerGeometry = (value: Partial<ShapeLayerV3 | TextLayerV3>): boolean =>
  Boolean(
    isCanonicalLayerIdV3(value.id) &&
    (value.groupId === undefined || isCanonicalLayerIdV3(value.groupId)) &&
    (value.locked === undefined || typeof value.locked === "boolean") &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    typeof value.visible === "boolean" &&
    [value.opacity, value.xQ16, value.yQ16, value.widthQ16, value.heightQ16].every(Number.isSafeInteger) &&
    value.opacity! >= 0 &&
    value.opacity! <= 65536 &&
    isQuarterTurnV1(value.rotation === undefined ? 0 : value.rotation) &&
    value.widthQ16! > 0 &&
    value.heightQ16! > 0 &&
    Number.isSafeInteger(value.xQ16! + value.widthQ16!) &&
    Number.isSafeInteger(value.yQ16! + value.heightQ16!),
  );
export const isVisualLayerV3 = (value: unknown): value is VisualLayerV3 => {
  const layer = value as Partial<ShapeLayerV3 | TextLayerV3> | null;
  if (!layer || !commonLayerGeometry(layer)) return false;
  if (isShapeLayerV3(layer))
    return (
      (layer.shape === "rectangle" || layer.shape === "ellipse") &&
      canonicalHexColorV3(layer.fill) &&
      Object.keys(layer).every((key) =>
        [
          "kind",
          "shape",
          "fill",
          "id",
          "name",
          "visible",
          "opacity",
          "rotation",
          "groupId",
          "locked",
          "xQ16",
          "yQ16",
          "widthQ16",
          "heightQ16",
        ].includes(key),
      )
    );
  if (isTextLayerV3(layer))
    return (
      validTextContentV1(layer.content) &&
      canonicalHexColorV3(layer.fill) &&
      Number.isInteger(layer.scale) &&
      layer.scale! >= 1 &&
      layer.scale! <= 16 &&
      (layer.alignment === "left" || layer.alignment === "center" || layer.alignment === "right") &&
      Object.keys(layer).every((key) =>
        [
          "kind",
          "content",
          "fill",
          "scale",
          "alignment",
          "id",
          "name",
          "visible",
          "opacity",
          "rotation",
          "groupId",
          "locked",
          "xQ16",
          "yQ16",
          "widthQ16",
          "heightQ16",
        ].includes(key),
      )
    );
  const baseImage = { ...(value as ImageLayerV3) };
  delete baseImage.rotation;
  delete baseImage.groupId;
  delete baseImage.locked;
  if (!Value.Check(LayerV2Schema, baseImage)) return false;
  const image = value as ImageLayerV3;
  return (
    [image.width, image.height, image.crop.x, image.crop.y, image.crop.width, image.crop.height].every(
      Number.isSafeInteger,
    ) &&
    image.crop.x + image.crop.width <= image.width &&
    image.crop.y + image.crop.height <= image.height
  );
};
export function createShapeLayerV3(input: Omit<ShapeLayerV3, "kind">): ShapeLayerV3 {
  const layer = { kind: "shape", locked: false, ...input } as const;
  if (!isVisualLayerV3(layer)) throw new Error("Shape layer is not canonical.");
  return layer;
}
export function createImageLayerV3(input: ImageLayerV3): ImageLayerV3 {
  if (!isVisualLayerV3(input) || isShapeLayerV3(input) || isTextLayerV3(input))
    throw new Error("Image layer is not canonical.");
  return { ...structuredClone(input), locked: input.locked ?? false };
}
export function createTextLayerV3(input: Omit<TextLayerV3, "kind">): TextLayerV3 {
  const layer = { kind: "text", locked: false, ...input } as const;
  if (!isVisualLayerV3(layer)) throw new Error("Text layer is not canonical.");
  return layer;
}
export type ThemeProjectV3 = {
  schema: typeof V3_SCHEMA;
  formatVersion: typeof V3_FORMAT_VERSION;
  projectId: string;
  themeKind: "material" | "custom";
  metadata: { name: string; description: string; author: string };
  targetProfileId: "dspico-launcher-v1";
  profile: typeof V3_PROFILE;
  assets: MediaAssetV3[];
  assetManifest: MediaRefV1[];
  roleAssignments: Partial<Record<AssetRoleV3, string>>;
  requiredRoles: AssetRoleV3[];
  confirmedRoles: AssetRoleV3[];
  quarantine: QuarantineV3[];
  acknowledgments: string[];
  componentEvidence: { visual?: unknown; bcstm?: unknown };
  legacyEvidence?: LegacyEvidenceV3;
  legacyComposition?: unknown;
  visualDocuments?: Partial<Record<CustomVisualRoleV1, VisualDocumentV3>>;
};

// prettier-ignore
const extensions: Record<MediaTypeV3, string> = { "image/png": "png", "audio/wav": "wav", "audio/bcstm": "bcstm", "application/json": "json" };
const HASH = /^[0-9a-f]{64}$/;
export const mediaPathV3 = (sha256: string, mediaType: MediaTypeV3): string => {
  if (!HASH.test(sha256)) throw new Error(`Invalid media hash: ${sha256}`);
  return `assets/sha256/${sha256}.${extensions[mediaType]}`;
};
export const createMediaRefV3 = (bytes: Uint8Array, mediaType: MediaTypeV3): MediaRefV1 => {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { sha256, byteLength: bytes.byteLength, mediaType, path: mediaPathV3(sha256, mediaType) };
};
// prettier-ignore
export const isMediaRefV3 = (value: unknown): value is MediaRefV1 => {
  const ref = value as Partial<MediaRefV1> | null;
  return Boolean(ref && HASH.test(ref.sha256 ?? "") && Number.isSafeInteger(ref.byteLength) && typeof ref.byteLength === "number" && ref.byteLength >= 0 && typeof ref.mediaType === "string" && Object.hasOwn(extensions, ref.mediaType) && ref.path === mediaPathV3(ref.sha256!, ref.mediaType as MediaTypeV3));
};
