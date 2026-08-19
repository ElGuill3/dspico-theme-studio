import { LAUNCHER_V1_PROFILE } from "../../dspico-contract/src/profile-v1-3.js";

export const PARITY_SCHEMA = "dspico.launcher.parity" as const;
// prettier-ignore
export const PARITY_PROFILE = { profileId: LAUNCHER_V1_PROFILE.profileId, launcherCommit: LAUNCHER_V1_PROFILE.launcherCommit, manifestSha256: LAUNCHER_V1_PROFILE.manifestSha256 } as const;
// prettier-ignore
export class ParityFormatRefusalError extends Error { constructor(readonly reason: "invalid-json" | "unsupported-format" | "invalid-format", message: string) { super(message); this.name = "ParityFormatRefusalError"; } }
export type Rgb8V1 = { r: number; g: number; b: number };
export type MaterialV1 = { primaryColor: Rgb8V1; darkTheme: boolean };
export type ParityMetadataV1 = { name: string; description: string; author: string };
// prettier-ignore
export type MigrationFieldV1 = "primaryColor" | "darkTheme" | "accent" | "background" | "foreground" | "scenes" | "transition";
export type MigrationDecisionV1 = "map-primary-color" | "preserve" | "drop";
// prettier-ignore
export type LegacyEvidenceV1 = { sourceHash: string; sourceBytes: string; formatVersion: 1 | 2; mappings: Partial<Record<MigrationFieldV1, MigrationDecisionV1>>; exclusions: MigrationFieldV1[] };
// prettier-ignore
export type ParityOperationV1 = { version: 1; type: "set-metadata"; field: keyof ParityMetadataV1; value: string } | { version: 1; type: "set-primary-color"; value: Rgb8V1 } | { version: 1; type: "set-dark-theme"; value: boolean } | { version: 1; type: "set-migration-decision"; field: MigrationFieldV1; decision: MigrationDecisionV1 } | { version: 1; type: "acknowledge"; fingerprint: string };
// prettier-ignore
export type LauncherParityProjectV1 = { schema: typeof PARITY_SCHEMA; formatVersion: 1; projectId: string; metadata: ParityMetadataV1; material: MaterialV1; profile: typeof PARITY_PROFILE; history: { version: 1; initial: { metadata: ParityMetadataV1; material: MaterialV1; acknowledgments: string[] }; operations: ParityOperationV1[]; cursor: number }; acknowledgments: string[]; evidence: { profileManifestSha256: string; legacy?: LegacyEvidenceV1 } };
// prettier-ignore
export const isRgb8 = (value: unknown): value is Rgb8V1 => { const color = value as Rgb8V1 | null; return Boolean(color && [color.r, color.g, color.b].every((component) => Number.isInteger(component) && component >= 0 && component <= 255)); };
// prettier-ignore
export const isParityProject = (value: unknown): value is LauncherParityProjectV1 => { const project = value as LauncherParityProjectV1 | null; return Boolean(project && project.schema === PARITY_SCHEMA && project.formatVersion === 1 && typeof project.projectId === "string" && isRgb8(project.material?.primaryColor) && typeof project.material.darkTheme === "boolean" && project.profile?.manifestSha256 === PARITY_PROFILE.manifestSha256 && Array.isArray(project.history?.operations)); };
