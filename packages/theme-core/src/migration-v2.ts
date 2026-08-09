import {
  FormatRefusalError,
  currentProject,
  openProject,
  type MaterialProjectV1,
  type OperationV1,
  type ProjectStateV1,
} from "./index.js";
import { sha256 } from "./hash-v2.js";
import { currentProjectV2 } from "./history-v2.js";
import {
  TRANSITION_DEFAULTS,
  isTransitionField,
  validTransition,
  type CommittedStateV2,
  type OperationV2,
  type ProjectStateV2,
  type ThemeProjectV2,
  type TransitionField,
  type TokenValueV2,
} from "./model-v2.js";

type LegacyProject = MaterialProjectV1 & { launchTransition?: Partial<Record<TransitionField, unknown>> } & Partial<
    Record<TransitionField, unknown>
  >;
export type MigrationNotice = { code: "v1-to-v2"; sourceHash: string; message: string };
export type MigrationResult = { sourceHash: string; candidate: CommittedStateV2; notice: MigrationNotice };
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const fail = (message: string): never => {
  throw new FormatRefusalError("invalid-format", message);
};
const legacyReplay = (initial: MaterialProjectV1, operations: OperationV1[]) =>
  currentProject({ formatVersion: 1, initial, operations, cursor: operations.length, baseRevision: 0, snapshots: [] });

// prettier-ignore
function transition(project: LegacyProject, field: TransitionField): number { const roots = [project.tokens[field], project[field]].filter((value) => value !== undefined), nested = project.launchTransition?.[field]; if (roots.some((value) => typeof value !== "number" || !Number.isInteger(value)) || (nested !== undefined && (typeof nested !== "number" || !Number.isInteger(nested)))) fail(`Invalid transition value: ${field}`); if ((roots.length > 1 && roots.some((value) => value !== roots[0])) || (nested !== undefined && roots[0] !== undefined && nested !== roots[0])) fail(`Conflicting transition values: ${field}`); const value = (nested ?? roots[0] ?? TRANSITION_DEFAULTS[field]) as number; if (!validTransition(field, value)) fail(`Invalid transition value: ${field}`); return value; }
// prettier-ignore
function mapProject(project: MaterialProjectV1, notices: string[]): ThemeProjectV2 { const legacy = project as LegacyProject; return { formatVersion: 2, projectId: project.projectId, themeKind: "material", metadata: clone(project.metadata), targetProfileId: project.targetProfileId, tokens: Object.fromEntries(Object.entries(project.tokens).filter(([key]) => !isTransitionField(key))) as ThemeProjectV2["tokens"], launchTransition: { coverStartScalePercent: transition(legacy, "coverStartScalePercent"), coverFinalAlpha: transition(legacy, "coverFinalAlpha"), scrimFinalAlpha: transition(legacy, "scrimFinalAlpha") }, scenes: clone(project.scenes) as unknown as ThemeProjectV2["scenes"], assetManifest: clone(project.assetManifest), acknowledgments: [...project.acknowledgments].sort(), documents: [], assets: [], notices: [...notices].sort() }; }
// prettier-ignore
function mapOperation(operation: OperationV1, project: MaterialProjectV1): OperationV2 { if (operation.version !== 1) fail(`Unsupported V1 operation version: ${String(operation.version)}`); switch (operation.type) { case "set-metadata": return { ...operation, version: 2 }; case "acknowledge": return { ...operation, version: 2 }; case "set-token": if (isTransitionField(operation.key)) { if (typeof operation.value !== "number" || !validTransition(operation.key, operation.value)) fail(`Invalid transition value: ${operation.key}`); return { version: 2, type: "set-launch-transition-field", field: operation.key, value: operation.value as number }; } return { version: 2, type: "set-material-token", key: operation.key, value: operation.value as TokenValueV2 }; case "set-scene-token": { const scene = project.scenes.find(({ id }) => id === operation.sceneId), screen = "screen" in operation ? operation.screen : scene?.screen, mode = "mode" in operation ? operation.mode : scene?.mode; if (!screen || mode === undefined) fail(`Legacy scene identity unavailable: ${operation.sceneId}`); if (scene && (scene.screen !== screen || scene.mode !== mode)) fail(`Scene identity mismatch: ${operation.sceneId}`); return { version: 2, type: "set-scene-token", sceneId: operation.sceneId, screen: screen as "top" | "bottom", mode: mode as string, key: operation.key, value: operation.value as TokenValueV2 }; } default: return fail("Unknown V1 operation type"); } return fail("Unknown V1 operation type"); }

// prettier-ignore
export function migrateV1ToV2(source: string | ProjectStateV1): MigrationResult { const bytes = typeof source === "string" ? source : JSON.stringify(source), legacy = typeof source === "string" ? openProject(source) : clone(source), sourceHash = sha256(bytes), notice = { code: "v1-to-v2" as const, sourceHash, message: `migrated-v1:${sourceHash}` }, operations: OperationV2[] = [], seen: OperationV1[] = [], initial = mapProject(legacy.initial, [notice.message]); let project = legacyReplay(legacy.initial, seen); for (const operation of legacy.operations) { operations.push(mapOperation(operation, project)); seen.push(operation); try { project = legacyReplay(legacy.initial, seen); } catch { return fail("V1 operation replay failed"); } } const state: ProjectStateV2 = { formatVersion: 2, initial, operations, cursor: legacy.cursor, baseRevision: legacy.baseRevision, snapshots: legacy.snapshots.map(({ revision, project: snapshot }) => ({ revision, project: mapProject(snapshot, [notice.message]) })) }; try { return { sourceHash, notice, candidate: { ...state, project: currentProjectV2(state) } }; } catch { return fail("V2 operation replay failed"); } }
export const migrateProjectV1ToV2 = migrateV1ToV2;
