import { openLauncherParityProject } from "./parity-history-v1.js";
import { PARITY_SCHEMA, type LauncherParityProjectV1 } from "./parity-model-v1.js";
// prettier-ignore
import { currentProjectV2 } from "./history-v2.js";
import type { CommittedStateV2 } from "./model-v2.js";
import { migrateV1ToV2 } from "./migration-v2.js";
import { openProjectV2, collectAssetReferencesV2 } from "./history-v2.js";
import { sha256 } from "./hash-v2.js";
// prettier-ignore
import { confirmRolesV3, createProjectV3, saveProjectV3, type ProjectStateV3 } from "./history-v3.js";
// prettier-ignore
import { V3_VISUAL_ROLES, mediaPathV3, type AssetRoleV3, type MediaAssetV3 } from "./model-v3.js";

export type V3SourceFormat = "v1" | "v2" | "parity";
// prettier-ignore
export type MigrationResultV3 = { sourceFormat: V3SourceFormat; sourceBytes: string; sourceHash: string; candidate: ProjectStateV3; requiresConfirmation: AssetRoleV3[] };
// prettier-ignore
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
// prettier-ignore
const sourceBytes = (source: unknown): string => typeof source === "string" ? source : JSON.stringify(source);
// prettier-ignore
const mediaAssets = (state: CommittedStateV2): MediaAssetV3[] => {
  const current = currentProjectV2(state), records = [...(current.assets as unknown[]), ...(state.initial.assets as unknown[])].map(object);
  return collectAssetReferencesV2(state).filter(({ sha256 }) => /^[0-9a-f]{64}$/.test(sha256)).map(({ sha256 }) => { const record = records.find((candidate) => candidate.sourceSha256 === sha256), media = { sha256, byteLength: typeof record?.length === "number" ? record.length : 0, mediaType: "image/png" as const, path: mediaPathV3(sha256, "image/png") }; return { id: sha256, media, provenance: (record?.provenance as Record<string, string | boolean>) ?? {}, rightsToExport: record?.referenceOnly === false, referenceOnly: record?.referenceOnly !== false }; });
};
// prettier-ignore
const fromV2 = (state: CommittedStateV2, bytes: string, format: V3SourceFormat): MigrationResultV3 => {
  const current = currentProjectV2(state), assets = mediaAssets(state), required = current.themeKind === "custom" ? [...V3_VISUAL_ROLES] : [];
  const candidate = createProjectV3({ projectId: current.projectId, metadata: current.metadata, themeKind: current.themeKind, assets, requiredRoles: required, legacyEvidence: { sourceFormat: format, sourceHash: sha256(bytes), sourceBytes: bytes }, legacyComposition: current.themeKind === "custom" ? { documents: current.documents, scenes: current.scenes, operations: state.operations } : undefined });
  return { sourceFormat: format, sourceBytes: bytes, sourceHash: sha256(bytes), candidate, requiresConfirmation: required };
};
// prettier-ignore
const fromParity = (project: LauncherParityProjectV1, bytes: string): MigrationResultV3 => { const candidate = createProjectV3({ projectId: project.projectId, metadata: project.metadata, legacyEvidence: { sourceFormat: "parity", sourceHash: sha256(bytes), sourceBytes: bytes } }); candidate.initial.legacyComposition = { material: project.material, profile: project.profile }; return { sourceFormat: "parity", sourceBytes: bytes, sourceHash: sha256(bytes), candidate, requiresConfirmation: [] }; };
export function migrateProjectToV3(source: unknown): MigrationResultV3 {
  const bytes = sourceBytes(source),
    parsed = object(JSON.parse(bytes));
  if (parsed.schema === PARITY_SCHEMA) return fromParity(openLauncherParityProject(bytes), bytes);
  if (parsed.formatVersion === 1) return fromV2(migrateV1ToV2(bytes).candidate, bytes, "v1");
  if (parsed.formatVersion === 2) return fromV2(openProjectV2(bytes), bytes, "v2");
  throw new Error(`Unsupported legacy project format: ${String(parsed.formatVersion)}`);
}
// prettier-ignore
export const confirmMigrationRolesV3 = (result: MigrationResultV3, assignments: Partial<Record<AssetRoleV3, string>>): MigrationResultV3 => { const candidate = confirmRolesV3(result.candidate, assignments), requiresConfirmation = result.requiresConfirmation.filter((role) => !candidate.project.confirmedRoles.includes(role)); return { ...result, candidate, requiresConfirmation }; };
// prettier-ignore
export const saveMigratedProjectV3 = (result: MigrationResultV3): string => { if (result.requiresConfirmation.length) throw new Error(`Role confirmation required: ${result.requiresConfirmation.join(", ")}`); if (result.candidate.project.quarantine.some(({ blocking }) => blocking)) throw new Error("Quarantined media cannot be saved."); return saveProjectV3(result.candidate); };
