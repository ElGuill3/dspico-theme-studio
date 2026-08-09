export const MAX_BATCH_LAYER_EDITS_V3 = 256;
export const MAX_DOCUMENT_LAYERS_V3 = MAX_BATCH_LAYER_EDITS_V3;
export const MAX_LAYER_ID_LENGTH_V3 = 128;
export const MAX_DOCUMENT_GUIDES_V3 = 64;
export const MAX_METADATA_NAME_LENGTH_V3 = 128;
export const MAX_METADATA_AUTHOR_LENGTH_V3 = 128;
export const MAX_METADATA_DESCRIPTION_LENGTH_V3 = 1024;
export const V3_METADATA_FIELDS = ["name", "description", "author"] as const;
export type MetadataFieldV3 = (typeof V3_METADATA_FIELDS)[number];
export type MetadataV3 = Record<MetadataFieldV3, string>;
const metadataLimits: Record<MetadataFieldV3, number> = {
  name: MAX_METADATA_NAME_LENGTH_V3,
  description: MAX_METADATA_DESCRIPTION_LENGTH_V3,
  author: MAX_METADATA_AUTHOR_LENGTH_V3,
};
export const metadataErrorV3 = (field: MetadataFieldV3, value: unknown): string | undefined => {
  if (typeof value !== "string") return `${field} must be text.`;
  if (!value.length) return `${field} is required.`;
  if (value !== value.trim()) return `${field} must not start or end with whitespace.`;
  if (/\p{Cc}/u.test(value)) return `${field} must not contain control characters.`;
  if ([...value].length > metadataLimits[field])
    return `${field} must be ${metadataLimits[field]} characters or fewer.`;
  return undefined;
};
export const isMetadataFieldV3 = (value: unknown): value is MetadataFieldV3 =>
  typeof value === "string" && V3_METADATA_FIELDS.includes(value as MetadataFieldV3);
export const isMetadataV3 = (value: unknown): value is MetadataV3 => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const metadata = value as Record<string, unknown>;
  return (
    Object.keys(metadata).length === V3_METADATA_FIELDS.length &&
    V3_METADATA_FIELDS.every((field) => Object.hasOwn(metadata, field) && !metadataErrorV3(field, metadata[field]))
  );
};
