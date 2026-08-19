import { openLauncherParityProject } from "./parity-history-v1.js";
import { PARITY_SCHEMA, type LauncherParityProjectV1 } from "./parity-model-v1.js";
// prettier-ignore
import { currentProjectV2 } from "./history-v2.js";
import type { CommittedStateV2 } from "./model-v2.js";
import { migrateV1ToV2 } from "./migration-v2.js";
import { openProjectV2, collectAssetReferencesV2 } from "./history-v2.js";
import { sha256 } from "./hash-v2.js";
// prettier-ignore
import { confirmRolesV3, createProjectV3, openProjectV3, saveProjectV3, type ProjectStateV3 } from "./history-v3.js";
// prettier-ignore
import { V3_PROFILE, V3_VISUAL_ROLES, mediaPathV3, type AssetRoleV3, type MediaAssetV3 } from "./model-v3.js";

export type V3SourceFormat = "v1" | "v2" | "parity";
export type ProfileMigrationV3 = {
  state: ProjectStateV3;
  migrated: boolean;
  sourceBytes: string;
  sourceSha256: string;
  candidateSha256: string;
};
// prettier-ignore
export type MigrationResultV3 = { sourceFormat: V3SourceFormat; sourceBytes: string; sourceHash: string; candidate: ProjectStateV3; requiresConfirmation: AssetRoleV3[] };
// prettier-ignore
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
// prettier-ignore
const sourceBytes = (source: unknown): string => typeof source === "string" ? source : JSON.stringify(source);
const OLD_PROFILE_V3 = {
  profileId: "dspico-launcher-v1",
  manifestSha256: "068f1efdc2bda015bacc70a94473ac79c0754938ff96823368206b13bf5ceb46",
} as const;
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, canonical(item)]),
        )
      : value;
const same = (left: unknown, right: unknown) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const legacyRole = (value: unknown) => (value === "launch-sound" ? "select-sound" : value);
const legacyId = (value: unknown) => (value === "wav:launch" ? "wav:select" : value);
const exactProfile = (value: unknown, expected: typeof OLD_PROFILE_V3 | typeof V3_PROFILE) => {
  const profile = object(value);
  return (
    Object.keys(profile).length === 2 &&
    profile.profileId === expected.profileId &&
    profile.manifestSha256 === expected.manifestSha256
  );
};
const migrateAsset = (value: unknown) => {
  const asset = structuredClone(object(value));
  asset.id = legacyId(asset.id);
  asset.role = legacyRole(asset.role);
  return asset;
};
const migrateProject = (value: unknown) => {
  const project = structuredClone(object(value));
  const assignments = structuredClone(object(project.roleAssignments)),
    launch = assignments["launch-sound"],
    select = assignments["select-sound"];
  if (launch !== undefined && select !== undefined && !same(launch, select))
    throw new Error("Launch to Select role collision.");
  if (launch !== undefined) assignments["select-sound"] = launch;
  delete assignments["launch-sound"];
  const assets = (Array.isArray(project.assets) ? project.assets : []).map(migrateAsset),
    selected = assets.filter(({ role }) => role === "select-sound");
  if (selected.length > 1 && !selected.every((asset) => same(asset, selected[0])))
    throw new Error("Launch to Select asset collision.");
  project.assets = assets.filter(
    (asset, index) => asset.role !== "select-sound" || index === assets.indexOf(selected[0]!),
  );
  project.profile = V3_PROFILE;
  project.roleAssignments = assignments;
  for (const key of ["requiredRoles", "confirmedRoles"] as const)
    project[key] = [...new Set((Array.isArray(project[key]) ? project[key] : []).map(legacyRole))];
  return project;
};
const migrateOperation = (value: unknown) => {
  const operation = structuredClone(object(value));
  operation.role = legacyRole(operation.role);
  if (operation.asset) operation.asset = migrateAsset(operation.asset);
  return operation;
};
const rejectOperationCollision = (operations: unknown[]) => {
  const launches = operations.filter(
    (value) => object(value).type === "set-theme-sound" && object(value).role === "launch-sound",
  );
  const selects = operations.filter(
    (value) => object(value).type === "set-theme-sound" && object(value).role === "select-sound",
  );
  if (launches.some((launch) => selects.some((select) => !same(migrateOperation(launch), select))))
    throw new Error("Launch to Select operation collision.");
};
const containsLaunch = (project: Record<string, unknown>, operations: unknown[]) =>
  [project.roleAssignments, project.requiredRoles, project.confirmedRoles, project.assets, ...operations].some(
    (value) => {
      const serialized = JSON.stringify(value) ?? "";
      return serialized.includes("launch-sound") || serialized.includes("wav:launch");
    },
  );
export function migrateProfileV3(source: string): ProfileMigrationV3 {
  const parsed = object(JSON.parse(source)),
    snapshots = Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
    projects = [parsed.initial, ...snapshots.map((item) => object(item).project)];
  if (parsed.formatVersion !== 3 || !projects.length) throw new Error("Unsupported V3 migration source.");
  const operations = Array.isArray(parsed.operations) ? parsed.operations : [];
  if (projects.every((project) => exactProfile(object(project).profile, V3_PROFILE))) {
    if (projects.some((project) => containsLaunch(object(project), operations)))
      throw new Error("Current profile cannot contain Launch sound data.");
    const state = openProjectV3(source);
    return {
      state,
      migrated: false,
      sourceBytes: source,
      sourceSha256: sha256(source),
      candidateSha256: sha256(saveProjectV3(state)),
    };
  }
  if (!projects.every((project) => exactProfile(object(project).profile, OLD_PROFILE_V3)))
    throw new Error("Unsupported V3 profile migration source.");
  rejectOperationCollision(operations);
  const candidate = structuredClone(parsed);
  candidate.initial = migrateProject(candidate.initial);
  candidate.snapshots = snapshots.map((item) => ({ ...object(item), project: migrateProject(object(item).project) }));
  candidate.operations = operations.map(migrateOperation);
  delete candidate.project;
  const state = openProjectV3(JSON.stringify(candidate)),
    candidateBytes = saveProjectV3(state);
  return {
    state,
    migrated: true,
    sourceBytes: source,
    sourceSha256: sha256(source),
    candidateSha256: sha256(candidateBytes),
  };
}
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
