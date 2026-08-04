import { Ajv } from "ajv";
import { FormatRefusalError } from "./index.js";
import {
  OperationV2Schema,
  ProjectStateV2Schema,
  TRANSITION_DEFAULTS,
  isTransitionField,
  validTransition,
  type CommittedStateV2,
  type OperationV2,
  type ProjectStateV2,
  type ThemeProjectV2,
} from "./model-v2.js";

const validate = new Ajv({ strict: true, allErrors: true }).compile(ProjectStateV2Schema),
  validateOperation = new Ajv({ strict: true }).compile(OperationV2Schema);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const fail = (message: string): never => {
  throw new FormatRefusalError("invalid-format", message);
};
// prettier-ignore
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, canonical(entry)])) : value;
// prettier-ignore
function replayOne(project: ThemeProjectV2, operation: OperationV2): ThemeProjectV2 { const next = clone(project); if (!validateOperation(operation)) fail("Invalid V2 operation"); switch (operation.type) { case "set-metadata": next.metadata[operation.field] = operation.value; break; case "set-material-token": if (isTransitionField(operation.key)) fail(`Transition token requires nested operation: ${operation.key}`); next.tokens[operation.key] = operation.value; break; case "set-launch-transition-field": if (!validTransition(operation.field, operation.value)) fail(`Invalid transition value: ${operation.field}`); next.launchTransition[operation.field] = operation.value; break; case "set-scene-token": { const scene = next.scenes.find(({ id }) => id === operation.sceneId); if (!scene) next.scenes.push({ id: operation.sceneId, screen: operation.screen, mode: operation.mode, overrides: { [operation.key]: operation.value } }); else { if (scene.screen !== operation.screen || scene.mode !== operation.mode) fail(`Scene identity mismatch: ${operation.sceneId}`); scene.overrides[operation.key] = operation.value; } break; } case "acknowledge": next.acknowledgments = [...new Set([...next.acknowledgments, operation.fingerprint])].sort(); break; default: fail("Unknown V2 operation type"); } return next; }
export const replayV2 = (initial: ThemeProjectV2, operations: readonly OperationV2[]): ThemeProjectV2 =>
  operations.reduce(replayOne, clone(initial));
export const currentProjectV2 = (state: ProjectStateV2 | CommittedStateV2): ThemeProjectV2 =>
  replayV2(state.initial, state.operations.slice(0, state.cursor));
const commit = (state: ProjectStateV2): CommittedStateV2 => ({ ...state, project: currentProjectV2(state) });
const persisted = (state: ProjectStateV2 | CommittedStateV2): ProjectStateV2 => {
  const { project: _project, ...value } = state as CommittedStateV2;
  return value;
};

// prettier-ignore
export function createProjectV2(input: { projectId: string; metadata: ThemeProjectV2["metadata"]; themeKind?: ThemeProjectV2["themeKind"]; tokens?: ThemeProjectV2["tokens"]; scenes?: ThemeProjectV2["scenes"]; launchTransition?: Partial<ThemeProjectV2["launchTransition"]> }): CommittedStateV2 { const launchTransition = { ...TRANSITION_DEFAULTS, ...input.launchTransition }; if (!Object.entries(launchTransition).every(([field, value]) => validTransition(field as keyof typeof TRANSITION_DEFAULTS, value))) fail("Invalid launch transition"); return commit({ formatVersion: 2, initial: { formatVersion: 2, projectId: input.projectId, themeKind: input.themeKind ?? "material", metadata: clone(input.metadata), targetProfileId: "dspico-launcher-v1", tokens: clone(input.tokens ?? {}), launchTransition, scenes: clone(input.scenes ?? []), assetManifest: [], acknowledgments: [], documents: [], assets: [], notices: [] }, operations: [], cursor: 0, baseRevision: 0, snapshots: [] }); }

// prettier-ignore
export function applyOperationV2(state: ProjectStateV2 | CommittedStateV2, operation: OperationV2): CommittedStateV2 { let initial = clone(state.initial), operations = [...state.operations.slice(0, state.cursor), clone(operation)], baseRevision = state.baseRevision, snapshots = state.snapshots.filter(({ revision }) => revision <= state.baseRevision + state.cursor); if (operations.length > 200) { const overflow = operations.length - 200; initial = replayV2(initial, operations.slice(0, overflow)); operations = operations.slice(overflow); baseRevision += overflow; } const next: ProjectStateV2 = { formatVersion: 2, initial, operations, cursor: operations.length, baseRevision, snapshots }; const revision = baseRevision + next.cursor; if (revision > 0 && revision % 20 === 0) next.snapshots = [...snapshots.filter(({ revision: saved }) => saved !== revision), { revision, project: currentProjectV2(next) }].sort((a, b) => a.revision - b.revision).slice(-10); return commit(next); }
export const undoV2 = (state: ProjectStateV2 | CommittedStateV2): CommittedStateV2 =>
  commit({ ...persisted(state), cursor: Math.max(0, state.cursor - 1) });
export const redoV2 = (state: ProjectStateV2 | CommittedStateV2): CommittedStateV2 =>
  commit({ ...persisted(state), cursor: Math.min(state.operations.length, state.cursor + 1) });

// prettier-ignore
export function saveProjectV2(state: ProjectStateV2 | CommittedStateV2): string { const value = persisted(state); if (!validate(value) || value.cursor > value.operations.length || value.operations.length > 200 || value.snapshots.length > 10) fail("Project state is not canonical V2."); replayV2(value.initial, value.operations); return `${JSON.stringify(canonical(value))}\n`; }
// prettier-ignore
export function openProjectV2(bytes: string): CommittedStateV2 { let parsed: unknown; try { parsed = JSON.parse(bytes); } catch { throw new FormatRefusalError("invalid-json", "Project bytes are not valid JSON."); } if ((parsed as { formatVersion?: unknown } | null)?.formatVersion !== 2) throw new FormatRefusalError("unsupported-format", `Unsupported project format: ${String((parsed as { formatVersion?: unknown } | null)?.formatVersion)}`); if (!validate(parsed)) fail("Project format failed strict V2 validation."); const state = clone(parsed as ProjectStateV2); if (state.cursor > state.operations.length || state.operations.length > 200 || state.snapshots.length > 10) fail("Project history exceeds canonical bounds."); return commit(state); }
