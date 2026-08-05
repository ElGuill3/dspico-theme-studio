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
type Geometry = {
  xQ16: number;
  yQ16: number;
  widthQ16: number;
  heightQ16: number;
  width: number;
  height: number;
  crop: { x: number; y: number; width: number; height: number };
};
const validGeometry = ({ xQ16, yQ16, widthQ16, heightQ16, width, height, crop }: Geometry): boolean =>
  [xQ16, yQ16, widthQ16, heightQ16, crop.x, crop.y, crop.width, crop.height].every(Number.isSafeInteger) &&
  widthQ16 > 0 &&
  heightQ16 > 0 &&
  Number.isSafeInteger(xQ16 + widthQ16) &&
  Number.isSafeInteger(yQ16 + heightQ16) &&
  crop.x >= 0 &&
  crop.y >= 0 &&
  crop.width > 0 &&
  crop.height > 0 &&
  crop.x + crop.width <= width &&
  crop.y + crop.height <= height;
// prettier-ignore
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, canonical(entry)])) : value;
// prettier-ignore
function replayOne(project: ThemeProjectV2, operation: OperationV2): ThemeProjectV2 { const next = clone(project); if (!validateOperation(operation)) fail("Invalid V2 operation"); switch (operation.type) { case "set-metadata": next.metadata[operation.field] = operation.value; break; case "set-material-token": if (isTransitionField(operation.key)) fail(`Transition token requires nested operation: ${operation.key}`); next.tokens[operation.key] = operation.value; break; case "set-launch-transition-field": if (!validTransition(operation.field, operation.value)) fail(`Invalid transition value: ${operation.field}`); next.launchTransition[operation.field] = operation.value; break; case "set-scene-token": { const scene = next.scenes.find(({ id }) => id === operation.sceneId); if (!scene) next.scenes.push({ id: operation.sceneId, screen: operation.screen, mode: operation.mode, overrides: { [operation.key]: operation.value } }); else { if (scene.screen !== operation.screen || scene.mode !== operation.mode) fail(`Scene identity mismatch: ${operation.sceneId}`); scene.overrides[operation.key] = operation.value; } break; } case "acknowledge": next.acknowledgments = [...new Set([...next.acknowledgments, operation.fingerprint])].sort(); break; case "add-layer": { if (next.themeKind !== "custom" || !validGeometry(operation.layer)) fail("Invalid layer geometry"); const document = next.documents.find(({ screen }) => screen === operation.screen); if (!document || document.layers.some(({ id }) => id === operation.layer.id)) fail("Invalid layer identity"); document!.layers.push(operation.layer); if (!next.assetManifest.some(({ sha256 }) => sha256 === operation.layer.asset.sha256)) next.assetManifest.push(operation.layer.asset); if (operation.assetRecord !== undefined && !next.assets.some((record) => (record as { sourceSha256?: unknown }).sourceSha256 === operation.layer.asset.sha256)) next.assets.push(operation.assetRecord); break; } case "move-layer": { const layer = next.documents.find(({ screen }) => screen === operation.screen)?.layers.find(({ id }) => id === operation.layerId); if (!layer || !validGeometry({ ...layer, xQ16: operation.xQ16, yQ16: operation.yQ16 })) fail("Invalid layer geometry"); layer!.xQ16 = operation.xQ16; layer!.yQ16 = operation.yQ16; break; } case "set-layer-visibility": { const layer = next.documents.find(({ screen }) => screen === operation.screen)?.layers.find(({ id }) => id === operation.layerId); if (!layer) fail("Unknown layer"); layer!.visible = operation.visible; break; } case "rename-layer": { const layer = next.documents.find(({ screen }) => screen === operation.screen)?.layers.find(({ id }) => id === operation.layerId); if (!layer || operation.name.trim() !== operation.name) fail("Invalid layer name"); layer!.name = operation.name; break; } case "remove-layer": { const document = next.documents.find(({ screen }) => screen === operation.screen), index = document?.layers.findIndex(({ id }) => id === operation.layerId) ?? -1; if (!document || index < 0) fail("Unknown layer"); document!.layers.splice(index, 1); break; } case "reorder-layer": { const document = next.documents.find(({ screen }) => screen === operation.screen), index = document?.layers.findIndex(({ id }) => id === operation.layerId) ?? -1; if (!document || index < 0 || operation.toIndex >= document.layers.length) fail("Invalid layer order"); const [layer] = document!.layers.splice(index, 1); document!.layers.splice(operation.toIndex, 0, layer!); break; } case "set-layer-properties": { const layer = next.documents.find(({ screen }) => screen === operation.screen)?.layers.find(({ id }) => id === operation.layerId), candidate = layer && { ...layer, ...operation }; if (!layer || !candidate || !validGeometry(candidate)) fail("Invalid layer properties"); Object.assign(layer!, { xQ16: operation.xQ16, yQ16: operation.yQ16, widthQ16: operation.widthQ16, heightQ16: operation.heightQ16, opacity: operation.opacity, crop: operation.crop }); break; } default: fail("Unknown V2 operation type"); } return next; }
export const replayV2 = (initial: ThemeProjectV2, operations: readonly OperationV2[]): ThemeProjectV2 =>
  operations.reduce(replayOne, clone(initial));
export const currentProjectV2 = (state: ProjectStateV2 | CommittedStateV2): ThemeProjectV2 =>
  replayV2(state.initial, state.operations.slice(0, state.cursor));
const commit = (state: ProjectStateV2): CommittedStateV2 => ({ ...state, project: currentProjectV2(state) });
const persisted = (state: ProjectStateV2 | CommittedStateV2): ProjectStateV2 => {
  const { project: _project, ...value } = state as CommittedStateV2;
  void _project;
  return value;
};

// prettier-ignore
export function createProjectV2(input: { projectId: string; metadata: ThemeProjectV2["metadata"]; themeKind?: ThemeProjectV2["themeKind"]; tokens?: ThemeProjectV2["tokens"]; scenes?: ThemeProjectV2["scenes"]; launchTransition?: Partial<ThemeProjectV2["launchTransition"]> }): CommittedStateV2 { const launchTransition = { ...TRANSITION_DEFAULTS, ...input.launchTransition }, themeKind = input.themeKind ?? "material"; if (!Object.entries(launchTransition).every(([field, value]) => validTransition(field as keyof typeof TRANSITION_DEFAULTS, value))) fail("Invalid launch transition"); return commit({ formatVersion: 2, initial: { formatVersion: 2, projectId: input.projectId, themeKind, metadata: clone(input.metadata), targetProfileId: "dspico-launcher-v1", tokens: clone(input.tokens ?? {}), launchTransition, scenes: clone(input.scenes ?? []), assetManifest: [], acknowledgments: [], documents: themeKind === "custom" ? ["top", "bottom"].map((screen) => ({ screen: screen as "top" | "bottom", width: 256 as const, height: 192 as const, layers: [] })) : [], assets: [], notices: [] }, operations: [], cursor: 0, baseRevision: 0, snapshots: [] }); }

// prettier-ignore
export function applyOperationV2(state: ProjectStateV2 | CommittedStateV2, operation: OperationV2): CommittedStateV2 { let initial = clone(state.initial), operations = [...state.operations.slice(0, state.cursor), clone(operation)], baseRevision = state.baseRevision; const snapshots = state.snapshots.filter(({ revision }) => revision <= state.baseRevision + state.cursor); if (operations.length > 200) { const overflow = operations.length - 200; initial = replayV2(initial, operations.slice(0, overflow)); operations = operations.slice(overflow); baseRevision += overflow; } const next: ProjectStateV2 = { formatVersion: 2, initial, operations, cursor: operations.length, baseRevision, snapshots }; const revision = baseRevision + next.cursor; if (revision > 0 && revision % 20 === 0) next.snapshots = [...snapshots.filter(({ revision: saved }) => saved !== revision), { revision, project: currentProjectV2(next) }].sort((a, b) => a.revision - b.revision).slice(-10); return commit(next); }
export const undoV2 = (state: ProjectStateV2 | CommittedStateV2): CommittedStateV2 =>
  commit({ ...persisted(state), cursor: Math.max(0, state.cursor - 1) });
export const redoV2 = (state: ProjectStateV2 | CommittedStateV2): CommittedStateV2 =>
  commit({ ...persisted(state), cursor: Math.min(state.operations.length, state.cursor + 1) });

// prettier-ignore
export function saveProjectV2(state: ProjectStateV2 | CommittedStateV2): string { const value = persisted(state); if (!validate(value) || value.cursor > value.operations.length || value.operations.length > 200 || value.snapshots.length > 10) fail("Project state is not canonical V2."); replayV2(value.initial, value.operations); return `${JSON.stringify(canonical(value))}\n`; }
// prettier-ignore
export function openProjectV2(bytes: string): CommittedStateV2 { let parsed: unknown; try { parsed = JSON.parse(bytes); } catch { throw new FormatRefusalError("invalid-json", "Project bytes are not valid JSON."); } if ((parsed as { formatVersion?: unknown } | null)?.formatVersion !== 2) throw new FormatRefusalError("unsupported-format", `Unsupported project format: ${String((parsed as { formatVersion?: unknown } | null)?.formatVersion)}`); if (!validate(parsed)) fail("Project format failed strict V2 validation."); const state = clone(parsed as ProjectStateV2); if (state.cursor > state.operations.length || state.operations.length > 200 || state.snapshots.length > 10) fail("Project history exceeds canonical bounds."); return commit(state); }

export type AssetReferenceV2 = { path?: string; sha256: string };
// prettier-ignore
const retainedProjects = (state: ProjectStateV2 | CommittedStateV2): ThemeProjectV2[] => { const retained = [state.initial, ...state.snapshots.map(({ project }) => project)]; for (let cursor = 0; cursor <= state.operations.length; cursor += 1) retained.push(replayV2(state.initial, state.operations.slice(0, cursor))); if ("project" in state) retained.push(state.project); return retained; };
// prettier-ignore
const scanAssets = (value: unknown, output: AssetReferenceV2[]): void => { if (Array.isArray(value)) return value.forEach((entry) => scanAssets(entry, output)); if (!value || typeof value !== "object") return; const object = value as Record<string, unknown>; if (typeof object.sha256 === "string") output.push({ sha256: object.sha256, ...(typeof object.path === "string" ? { path: object.path } : {}) }); Object.values(object).forEach((entry) => scanAssets(entry, output)); };
// prettier-ignore
export const collectAssetReferencesV2 = (state: ProjectStateV2 | CommittedStateV2): AssetReferenceV2[] => { const output: AssetReferenceV2[] = []; [...retainedProjects(state), ...state.operations].forEach((value) => scanAssets(value, output)); return output.filter((reference, index, all) => all.findIndex((item) => JSON.stringify(item) === JSON.stringify(reference)) === index); };
// prettier-ignore
export const reachableAssetHashes = (state: ProjectStateV2 | CommittedStateV2): string[] => [...new Set(collectAssetReferencesV2(state).map(({ sha256 }) => sha256))].sort();
