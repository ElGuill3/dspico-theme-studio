import { FormatRefusalError } from "./index.js";
import { Value } from "@sinclair/typebox/value";
import { OperationV2Schema, type OperationV2 } from "./model-v2.js";
import {
  isMetadataFieldV3,
  isMetadataV3,
  metadataErrorV3,
  MAX_BATCH_LAYER_EDITS_V3,
  MAX_DOCUMENT_GUIDES_V3,
  MAX_DOCUMENT_LAYERS_V3,
} from "./limits-v3.js";
import {
  CUSTOM_LAUNCHER_LAYOUT_KEYS_V1,
  CUSTOM_VISUAL_DOCUMENTS_V1,
  CUSTOM_VISUAL_ROLES_V1,
  isCustomLauncherLayoutOverridesV1,
  type CustomLauncherLayoutKeyV1,
  type CustomThemeV13,
  type CustomVisualRoleV1,
} from "../../dspico-contract/src/custom-v1-3.js";
import { sha256 } from "../../dspico-contract/src/index.js";
// prettier-ignore
import { canonicalHexColorV3, createVisualDocumentV3, isAssetRoleV3, isCanonicalLayerIdV3, isDocumentGuideV3, isMediaRefV3, isShapeLayerV3, isTextLayerV3, isVisualLayerV3, validDocumentGuidesV3, V3_FORMAT_VERSION, V3_SCHEMA, V3_PROFILE, type AssetRoleV3, type DocumentGuideV3, type MediaAssetV3, type MediaRefV1, type ShapeLayerV3, type TextLayerV3, type ThemeProjectV3, type VisualDocumentV3, type VisualLayerV3 } from "./model-v3.js";

export type VisualDocumentOperationV3 =
  | OperationV2
  | { version: 3; type: "add-shape-layer"; layer: ShapeLayerV3 }
  | { version: 3; type: "set-shape-fill"; layerId: string; fill: string }
  | { version: 3; type: "set-shape-corner-radius"; layerId: string; cornerRadiusQ16: number }
  | { version: 3; type: "add-text-layer"; layer: TextLayerV3 }
  | { version: 3; type: "set-text-fill"; layerId: string; fill: string }
  | { version: 3; type: "set-layer-opacity"; layerId: string; opacity: number }
  | {
      version: 3;
      type: "set-layer-rotation";
      layerId: string;
      rotation: 0 | 90 | 180 | 270;
    }
  | {
      version: 3;
      type: "set-layer-positions";
      positions: { layerId: string; xQ16: number; yQ16: number }[];
    }
  | { version: 3; type: "remove-layers"; layerIds: string[] }
  | {
      version: 3;
      type: "insert-layers";
      layers: VisualLayerV3[];
      toIndex: number;
    }
  | { version: 3; type: "reorder-layers"; layerIds: string[]; toIndex: number }
  | {
      version: 3;
      type: "set-layer-groups";
      memberships: { layerId: string; groupId?: string }[];
    }
  | {
      version: 3;
      type: "set-layer-locks";
      locks: { layerId: string; locked: boolean }[];
    }
  | { version: 3; type: "set-guides"; guides: DocumentGuideV3[] }
  | {
      version: 3;
      type: "set-layer-rotations";
      rotations: { layerId: string; rotation: 0 | 90 | 180 | 270 }[];
    }
  | {
      version: 3;
      type: "set-text-properties";
      layerId: string;
      content: string;
      fill: string;
      scale: number;
      alignment: TextLayerV3["alignment"];
    };

export type OperationV3 =
  | {
      version: 3;
      type: "set-metadata";
      field: keyof ThemeProjectV3["metadata"];
      value: string;
    }
  | { version: 3; type: "add-media"; asset: MediaAssetV3 }
  | {
      version: 3;
      type: "set-theme-sound";
      role: "navigation-sound" | "select-sound" | "back-sound";
      asset?: MediaAssetV3;
    }
  | {
      version: 3;
      type: "import-layer";
      asset: MediaAssetV3;
      composition: unknown;
    }
  | { version: 3; type: "assign-role"; role: AssetRoleV3; mediaSha256: string }
  | { version: 3; type: "confirm-role"; role: AssetRoleV3 }
  | {
      version: 3;
      type: "set-component-evidence";
      component: "visual" | "bcstm";
      receipt?: unknown;
    }
  | { version: 3; type: "set-legacy-composition"; composition: unknown }
  | {
      version: 3;
      type: "edit-visual-document";
      role: CustomVisualRoleV1;
      operation: VisualDocumentOperationV3;
    }
  | {
      version: 3;
      type: "import-visual-layer";
      role: CustomVisualRoleV1;
      operation: OperationV2;
      asset: MediaAssetV3;
    }
  | SetCustomLauncherLayoutV3
  | { version: 3; type: "acknowledge"; fingerprint: string };
export type SetCustomLauncherLayoutV3 = {
  [K in CustomLauncherLayoutKeyV1]:
    | { version: 3; type: "set-custom-launcher-layout"; element: K }
    | { version: 3; type: "set-custom-launcher-layout"; element: K; value: NonNullable<CustomThemeV13[K]> };
}[CustomLauncherLayoutKeyV1];
export type ProjectStateV3 = {
  formatVersion: typeof V3_FORMAT_VERSION;
  initial: ThemeProjectV3;
  operations: OperationV3[];
  cursor: number;
  baseRevision: number;
  snapshots: { revision: number; project: ThemeProjectV3 }[];
  project: ThemeProjectV3;
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
// prettier-ignore
const fail = (message: string): never => { throw new FormatRefusalError("invalid-format", message); };
// prettier-ignore
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)])) : value;
// prettier-ignore
const validAsset = (asset: MediaAssetV3): boolean => Boolean(asset.id && isMediaRefV3(asset.media) && (!asset.prepared || isMediaRefV3(asset.prepared)) && (!asset.role || isAssetRoleV3(asset.role)) && asset.provenance && typeof asset.rightsToExport === "boolean");
const layerOperations = [
  "add-layer",
  "move-layer",
  "set-layer-visibility",
  "rename-layer",
  "remove-layer",
  "reorder-layer",
  "set-layer-properties",
];
export const isVisualDocumentOperationV3 = (operation: unknown): operation is VisualDocumentOperationV3 => {
  const value = operation as Partial<VisualDocumentOperationV3> | null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.version === 2) return layerOperations.includes(value.type ?? "") && Value.Check(OperationV2Schema, value);
  if (value.version !== 3) return false;
  const exact = (keys: readonly string[]) =>
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
  if (value.type === "add-shape-layer")
    return exact(["version", "type", "layer"]) && isVisualLayerV3(value.layer) && value.layer.kind === "shape";
  if (value.type === "add-text-layer")
    return exact(["version", "type", "layer"]) && isVisualLayerV3(value.layer) && value.layer.kind === "text";
  if (value.type === "set-shape-fill" || value.type === "set-text-fill")
    return (
      exact(["version", "type", "layerId", "fill"]) &&
      typeof value.layerId === "string" &&
      Boolean(value.layerId) &&
      canonicalHexColorV3(value.fill)
    );
  if (value.type === "set-shape-corner-radius")
    return (
      exact(["version", "type", "layerId", "cornerRadiusQ16"]) &&
      typeof value.layerId === "string" &&
      Boolean(value.layerId) &&
      Number.isSafeInteger(value.cornerRadiusQ16) &&
      Number(value.cornerRadiusQ16) >= 0
    );
  if (value.type === "set-layer-opacity")
    return (
      exact(["version", "type", "layerId", "opacity"]) &&
      typeof value.layerId === "string" &&
      Boolean(value.layerId) &&
      Number.isSafeInteger(value.opacity) &&
      Number(value.opacity) >= 0 &&
      Number(value.opacity) <= 65536
    );
  if (value.type === "set-layer-rotation")
    return (
      exact(["version", "type", "layerId", "rotation"]) &&
      typeof value.layerId === "string" &&
      Boolean(value.layerId) &&
      [0, 90, 180, 270].includes(value.rotation as number)
    );
  if (value.type === "set-layer-positions") {
    const positions = value.positions as { layerId?: unknown; xQ16?: unknown; yQ16?: unknown }[] | undefined;
    return (
      exact(["version", "type", "positions"]) &&
      Array.isArray(positions) &&
      positions.length > 0 &&
      positions.length <= MAX_BATCH_LAYER_EDITS_V3 &&
      positions.every(
        (position) =>
          position !== null &&
          typeof position === "object" &&
          !Array.isArray(position) &&
          Object.keys(position).length === 3 &&
          Object.hasOwn(position, "layerId") &&
          Object.hasOwn(position, "xQ16") &&
          Object.hasOwn(position, "yQ16") &&
          typeof position.layerId === "string" &&
          Boolean(position.layerId) &&
          Number.isSafeInteger(position.xQ16) &&
          Number.isSafeInteger(position.yQ16),
      ) &&
      new Set(positions.map(({ layerId }) => layerId)).size === positions.length
    );
  }
  if (value.type === "remove-layers") {
    const layerIds = value.layerIds as unknown[] | undefined;
    return (
      exact(["version", "type", "layerIds"]) &&
      Array.isArray(layerIds) &&
      layerIds.length > 0 &&
      layerIds.length <= MAX_BATCH_LAYER_EDITS_V3 &&
      layerIds.every((id) => typeof id === "string" && Boolean(id)) &&
      new Set(layerIds).size === layerIds.length
    );
  }
  if (value.type === "insert-layers") {
    const layers = value.layers as VisualLayerV3[] | undefined;
    return (
      exact(["version", "type", "layers", "toIndex"]) &&
      Array.isArray(layers) &&
      layers.length > 0 &&
      layers.length <= MAX_BATCH_LAYER_EDITS_V3 &&
      layers.every(isVisualLayerV3) &&
      new Set(layers.map(({ id }) => id)).size === layers.length &&
      Number.isSafeInteger(value.toIndex) &&
      Number(value.toIndex) >= 0
    );
  }
  if (value.type === "reorder-layers") {
    const layerIds = value.layerIds as unknown[] | undefined;
    return (
      exact(["version", "type", "layerIds", "toIndex"]) &&
      Array.isArray(layerIds) &&
      layerIds.length > 0 &&
      layerIds.length <= MAX_BATCH_LAYER_EDITS_V3 &&
      layerIds.every(isCanonicalLayerIdV3) &&
      new Set(layerIds).size === layerIds.length &&
      Number.isSafeInteger(value.toIndex) &&
      Number(value.toIndex) >= 0
    );
  }
  if (value.type === "set-layer-groups") {
    const memberships = value.memberships as { layerId?: unknown; groupId?: unknown }[] | undefined;
    return (
      exact(["version", "type", "memberships"]) &&
      Array.isArray(memberships) &&
      memberships.length > 0 &&
      memberships.length <= MAX_BATCH_LAYER_EDITS_V3 &&
      memberships.every(
        (membership) =>
          membership !== null &&
          typeof membership === "object" &&
          !Array.isArray(membership) &&
          (Object.keys(membership).length === 1 || Object.keys(membership).length === 2) &&
          Object.hasOwn(membership, "layerId") &&
          isCanonicalLayerIdV3(membership.layerId) &&
          (!Object.hasOwn(membership, "groupId") || isCanonicalLayerIdV3(membership.groupId)),
      ) &&
      new Set(memberships.map(({ layerId }) => layerId)).size === memberships.length
    );
  }
  if (value.type === "set-layer-locks") {
    const locks = value.locks as { layerId?: unknown; locked?: unknown }[] | undefined;
    return (
      exact(["version", "type", "locks"]) &&
      Array.isArray(locks) &&
      locks.length > 0 &&
      locks.length <= MAX_BATCH_LAYER_EDITS_V3 &&
      locks.every(
        (lock) =>
          lock !== null &&
          typeof lock === "object" &&
          !Array.isArray(lock) &&
          Object.keys(lock).length === 2 &&
          isCanonicalLayerIdV3(lock.layerId) &&
          typeof lock.locked === "boolean",
      ) &&
      new Set(locks.map(({ layerId }) => layerId)).size === locks.length
    );
  }
  if (value.type === "set-guides") {
    const guides = value.guides as DocumentGuideV3[] | undefined;
    return (
      exact(["version", "type", "guides"]) &&
      Array.isArray(guides) &&
      guides.length <= MAX_DOCUMENT_GUIDES_V3 &&
      guides.every(
        (guide) =>
          guide !== null &&
          typeof guide === "object" &&
          !Array.isArray(guide) &&
          Object.keys(guide).length === 3 &&
          isCanonicalLayerIdV3(guide.id) &&
          (guide.axis === "x" || guide.axis === "y") &&
          Number.isSafeInteger(guide.position) &&
          Number(guide.position) >= 0,
      ) &&
      new Set(guides.map(({ id }) => id)).size === guides.length
    );
  }
  if (value.type === "set-layer-rotations") {
    const rotations = value.rotations as { layerId?: unknown; rotation?: unknown }[] | undefined;
    return (
      exact(["version", "type", "rotations"]) &&
      Array.isArray(rotations) &&
      rotations.length > 0 &&
      rotations.length <= MAX_BATCH_LAYER_EDITS_V3 &&
      rotations.every(
        (rotation) =>
          rotation !== null &&
          typeof rotation === "object" &&
          !Array.isArray(rotation) &&
          Object.keys(rotation).length === 2 &&
          isCanonicalLayerIdV3(rotation.layerId) &&
          [0, 90, 180, 270].includes(rotation.rotation as number),
      ) &&
      new Set(rotations.map(({ layerId }) => layerId)).size === rotations.length
    );
  }
  return (
    value.type === "set-text-properties" &&
    exact(["version", "type", "layerId", "content", "fill", "scale", "alignment"]) &&
    typeof value.layerId === "string" &&
    Boolean(value.layerId) &&
    isVisualLayerV3({
      kind: "text",
      id: "probe",
      name: "probe",
      visible: true,
      opacity: 65536,
      xQ16: 0,
      yQ16: 0,
      widthQ16: 65536,
      heightQ16: 65536,
      content: value.content,
      fill: value.fill,
      scale: value.scale,
      alignment: value.alignment,
    })
  );
};
const validDocument = (document: VisualDocumentV3, role: CustomVisualRoleV1): boolean => {
  const spec = CUSTOM_VISUAL_DOCUMENTS_V1[role];
  const groups = new Map<string, number>();
  for (const layer of document?.layers ?? [])
    if (layer.groupId) groups.set(layer.groupId, (groups.get(layer.groupId) ?? 0) + 1);
  return Boolean(
    document &&
    document.role === role &&
    document.width === spec.width &&
    document.height === spec.height &&
    Array.isArray(document.layers) &&
    document.layers.length <= MAX_DOCUMENT_LAYERS_V3 &&
    document.layers.every(isVisualLayerV3) &&
    new Set(document.layers.map(({ id }) => id)).size === document.layers.length &&
    validDocumentGuidesV3(document) &&
    [...groups.values()].every((count) => count >= 2),
  );
};
const validOperation = (operation: unknown): operation is OperationV3 => {
  const value = operation as Partial<OperationV3> | null;
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 3) return false;
  const exact = (keys: readonly string[]) =>
      Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)),
    visualRole = (role: unknown): role is CustomVisualRoleV1 =>
      typeof role === "string" && CUSTOM_VISUAL_ROLES_V1.includes(role as CustomVisualRoleV1);
  switch (value.type) {
    case "set-metadata":
      return (
        exact(["version", "type", "field", "value"]) &&
        isMetadataFieldV3(value.field) &&
        !metadataErrorV3(value.field, value.value)
      );
    case "add-media":
      return exact(["version", "type", "asset"]) && validAsset(value.asset as MediaAssetV3);
    case "set-theme-sound":
      return (
        (exact(["version", "type", "role"]) || exact(["version", "type", "role", "asset"])) &&
        ["navigation-sound", "select-sound", "back-sound"].includes(value.role ?? "") &&
        (!value.asset || (validAsset(value.asset as MediaAssetV3) && value.asset.role === value.role))
      );
    case "import-layer":
      return exact(["version", "type", "asset", "composition"]) && validAsset(value.asset as MediaAssetV3);
    case "assign-role":
      return (
        exact(["version", "type", "role", "mediaSha256"]) &&
        isAssetRoleV3(value.role) &&
        typeof value.mediaSha256 === "string"
      );
    case "confirm-role":
      return exact(["version", "type", "role"]) && isAssetRoleV3(value.role);
    case "set-component-evidence":
      return (
        (exact(["version", "type", "component"]) || exact(["version", "type", "component", "receipt"])) &&
        (value.component === "visual" || value.component === "bcstm")
      );
    case "set-legacy-composition":
      return exact(["version", "type", "composition"]);
    case "edit-visual-document":
      return (
        exact(["version", "type", "role", "operation"]) &&
        visualRole(value.role) &&
        isVisualDocumentOperationV3(value.operation)
      );
    case "import-visual-layer":
      return (
        exact(["version", "type", "role", "operation", "asset"]) &&
        visualRole(value.role) &&
        value.operation?.version === 2 &&
        value.operation.type === "add-layer" &&
        Value.Check(OperationV2Schema, value.operation) &&
        validAsset(value.asset as MediaAssetV3)
      );
    case "set-custom-launcher-layout":
      return (
        (exact(["version", "type", "element"]) || exact(["version", "type", "element", "value"])) &&
        typeof value.element === "string" &&
        CUSTOM_LAUNCHER_LAYOUT_KEYS_V1.includes(value.element as CustomLauncherLayoutKeyV1) &&
        (!Object.hasOwn(value, "value") ||
          isCustomLauncherLayoutOverridesV1({
            [value.element]: (value as Record<string, unknown>).value,
          }))
      );
    case "acknowledge":
      return exact(["version", "type", "fingerprint"]) && typeof value.fingerprint === "string";
    default:
      return false;
  }
};
export const validateProjectV3 = (value: unknown): value is ThemeProjectV3 => {
  const project = value as Partial<ThemeProjectV3> | null;
  // prettier-ignore
  return Boolean(project && project.schema === V3_SCHEMA && project.formatVersion === V3_FORMAT_VERSION && typeof project.projectId === "string" && project.targetProfileId === "dspico-launcher-v1" && project.profile?.profileId === V3_PROFILE.profileId && project.profile.manifestSha256 === V3_PROFILE.manifestSha256 && isMetadataV3(project.metadata) && Array.isArray(project.assets) && project.assets.every(validAsset) && Array.isArray(project.assetManifest) && project.assetManifest.every(isMediaRefV3) && project.roleAssignments && typeof project.roleAssignments === "object" && Object.entries(project.roleAssignments).every(([role, sha256]) => isAssetRoleV3(role) && typeof sha256 === "string") && Array.isArray(project.requiredRoles) && project.requiredRoles.every(isAssetRoleV3) && Array.isArray(project.confirmedRoles) && project.confirmedRoles.every((role) => isAssetRoleV3(role) && Boolean(project.roleAssignments![role])) && Array.isArray(project.quarantine) && project.quarantine.every(({ blocking }) => blocking === true) && Array.isArray(project.acknowledgments) && project.componentEvidence && typeof project.componentEvidence === "object" && (project.customLauncherLayout === undefined || (project.themeKind === "custom" && isCustomLauncherLayoutOverridesV1(project.customLauncherLayout))) && (!project.visualDocuments || (Object.keys(project.visualDocuments).every((role) => CUSTOM_VISUAL_ROLES_V1.includes(role as CustomVisualRoleV1)) && CUSTOM_VISUAL_ROLES_V1.every((role) => !project.visualDocuments![role] || validDocument(project.visualDocuments![role]!, role)))));
};
const validSnapshots = (value: unknown): value is ProjectStateV3["snapshots"] =>
  Array.isArray(value) &&
  value.every((entry) => {
    const snapshot = entry as Partial<ProjectStateV3["snapshots"][number]> | null;
    return Boolean(
      snapshot &&
      typeof snapshot === "object" &&
      !Array.isArray(snapshot) &&
      Object.keys(snapshot).length === 2 &&
      Object.hasOwn(snapshot, "revision") &&
      Object.hasOwn(snapshot, "project") &&
      Number.isSafeInteger(snapshot.revision) &&
      snapshot.revision! >= 0 &&
      validateProjectV3(snapshot.project),
    );
  });
const validPersistedState = (value: unknown): value is Omit<ProjectStateV3, "project"> => {
  const state = value as Partial<ProjectStateV3> | null;
  return Boolean(
    state &&
    state.formatVersion === 3 &&
    validateProjectV3(state.initial) &&
    Array.isArray(state.operations) &&
    state.operations.every(validOperation) &&
    Number.isSafeInteger(state.cursor) &&
    state.cursor! >= 0 &&
    state.cursor! <= state.operations.length &&
    Number.isSafeInteger(state.baseRevision) &&
    state.baseRevision! >= 0 &&
    validSnapshots(state.snapshots),
  );
};
const normalizeProjectLocks = (project: ThemeProjectV3): void => {
  for (const document of Object.values(project.visualDocuments ?? {})) {
    if (!document) continue;
    document.guides ??= [];
    for (const layer of document.layers) layer.locked ??= false;
  }
};
const normalizePersistedLocks = (state: Omit<ProjectStateV3, "project">): Omit<ProjectStateV3, "project"> => {
  const normalized = clone(state);
  normalizeProjectLocks(normalized.initial);
  for (const snapshot of normalized.snapshots) normalizeProjectLocks(snapshot.project);
  for (const operation of normalized.operations) {
    if (operation.type !== "edit-visual-document") continue;
    const edit = operation.operation;
    if (edit.type === "add-shape-layer" || edit.type === "add-text-layer") edit.layer.locked ??= false;
    if (edit.type === "insert-layers") for (const layer of edit.layers) layer.locked ??= false;
  }
  return normalized;
};
const editVisualDocument = (
  project: ThemeProjectV3,
  role: CustomVisualRoleV1,
  operation: VisualDocumentOperationV3,
): void => {
  if (!isVisualDocumentOperationV3(operation)) fail("Invalid visual document operation.");
  const document = project.visualDocuments?.[role] ?? createVisualDocumentV3(role);
  const layers = clone(document.layers);
  const requireCompleteGroups = (layerIds: readonly string[]) => {
    const selected = new Set(layerIds),
      touched = new Set(
        layers.filter(({ id }) => selected.has(id)).flatMap(({ groupId }) => (groupId ? [groupId] : [])),
      );
    if (layers.some(({ id, groupId }) => groupId && touched.has(groupId) && !selected.has(id)))
      fail("Grouped layer operation is incomplete");
  };
  const mutationLayerIds = (): string[] => {
    if (operation.version === 2)
      return operation.type === "add-layer" || operation.type === "set-layer-visibility" || !("layerId" in operation)
        ? []
        : [operation.layerId];
    if (
      operation.type === "add-shape-layer" ||
      operation.type === "add-text-layer" ||
      operation.type === "insert-layers" ||
      operation.type === "set-layer-locks" ||
      operation.type === "set-guides"
    )
      return [];
    if (operation.type === "set-layer-positions") return operation.positions.map(({ layerId }) => layerId);
    if (operation.type === "remove-layers" || operation.type === "reorder-layers") return operation.layerIds;
    if (operation.type === "set-layer-groups") return operation.memberships.map(({ layerId }) => layerId);
    if (operation.type === "set-layer-rotations") return operation.rotations.map(({ layerId }) => layerId);
    return [operation.layerId];
  };
  const mutationTargets = new Set(mutationLayerIds());
  for (const target of [...mutationTargets]) {
    const groupId = layers.find(({ id }) => id === target)?.groupId;
    if (groupId) for (const member of layers) if (member.groupId === groupId) mutationTargets.add(member.id);
  }
  if (layers.some(({ id, locked }) => mutationTargets.has(id) && locked)) fail("Locked layers cannot be edited");
  const groupIsContiguous = (candidate: readonly VisualLayerV3[], groupId: string) => {
    const indexes = candidate.flatMap((layer, index) => (layer.groupId === groupId ? [index] : []));
    return indexes.length > 0 && indexes.at(-1)! - indexes[0]! + 1 === indexes.length;
  };
  const requireAtomicReorder = (next: readonly VisualLayerV3[], movingIds: readonly string[]) => {
    const existingGroups = new Set(layers.flatMap(({ groupId }) => (groupId ? [groupId] : []))),
      moving = new Set(movingIds),
      movingGroups = new Set(
        layers.filter(({ id }) => moving.has(id)).flatMap(({ groupId }) => (groupId ? [groupId] : [])),
      );
    for (const groupId of existingGroups)
      if ((groupIsContiguous(layers, groupId) || movingGroups.has(groupId)) && !groupIsContiguous(next, groupId))
        fail("Layer reorder splits a group");
  };
  if (operation.type === "set-guides") {
    // Guide metadata is applied after layer validation below.
  } else if (operation.type === "add-shape-layer") {
    if (layers.length >= MAX_DOCUMENT_LAYERS_V3 || layers.some(({ id }) => id === operation.layer.id))
      fail("Invalid layer identity");
    layers.push({
      ...clone(operation.layer),
      locked: operation.layer.locked ?? false,
    });
  } else if (operation.type === "add-text-layer") {
    if (layers.length >= MAX_DOCUMENT_LAYERS_V3 || layers.some(({ id }) => id === operation.layer.id))
      fail("Invalid layer identity");
    layers.push({
      ...clone(operation.layer),
      locked: operation.layer.locked ?? false,
    });
  } else if (operation.type === "set-shape-fill") {
    const layer = layers.find(({ id }) => id === operation.layerId);
    if (isShapeLayerV3(layer)) layer.fill = operation.fill;
    else fail("Unknown shape layer");
  } else if (operation.type === "set-text-fill") {
    const layer = layers.find(({ id }) => id === operation.layerId);
    if (isTextLayerV3(layer)) layer.fill = operation.fill;
    else fail("Unknown text layer");
  } else if (operation.type === "set-shape-corner-radius") {
    const layer = layers.find(({ id }) => id === operation.layerId);
    if (!isShapeLayerV3(layer)) return fail("Unknown rectangle layer");
    if (layer.shape !== "rectangle") return fail("Unknown rectangle layer");
    const radius = Math.min(operation.cornerRadiusQ16, Math.floor(Math.min(layer.widthQ16, layer.heightQ16) / 2));
    if (radius === 0) delete layer.cornerRadiusQ16;
    else layer.cornerRadiusQ16 = radius;
  } else if (operation.type === "set-layer-opacity") {
    const layer = layers.find(({ id }) => id === operation.layerId);
    if (!layer) fail("Unknown layer");
    layer!.opacity = operation.opacity;
  } else if (operation.type === "set-layer-rotation") {
    const layer = layers.find(({ id }) => id === operation.layerId);
    if (!layer) fail("Unknown layer");
    requireCompleteGroups([operation.layerId]);
    layer!.rotation = operation.rotation;
    if (!isVisualLayerV3(layer)) fail("Invalid layer rotation");
  } else if (operation.type === "set-layer-positions") {
    requireCompleteGroups(operation.positions.map(({ layerId }) => layerId));
    for (const position of operation.positions) {
      const layer = layers.find(({ id }) => id === position.layerId);
      if (!layer) fail("Unknown layer");
      Object.assign(layer!, { xQ16: position.xQ16, yQ16: position.yQ16 });
      if (!isVisualLayerV3(layer)) fail("Invalid layer position");
    }
  } else if (operation.type === "remove-layers") {
    requireCompleteGroups(operation.layerIds);
    const ids = new Set(operation.layerIds);
    if (operation.layerIds.some((id) => !layers.some((layer) => layer.id === id))) fail("Unknown layer");
    for (let index = layers.length - 1; index >= 0; index -= 1) if (ids.has(layers[index]!.id)) layers.splice(index, 1);
  } else if (operation.type === "insert-layers") {
    if (operation.toIndex > layers.length || layers.length + operation.layers.length > MAX_DOCUMENT_LAYERS_V3)
      fail("Invalid layer insertion");
    const existing = new Set(layers.map(({ id }) => id));
    if (operation.layers.some(({ id }) => existing.has(id))) fail("Invalid layer identity");
    for (const layer of operation.layers)
      if (!isShapeLayerV3(layer) && !isTextLayerV3(layer)) {
        const owner = project.assets.find(({ media }) => media.sha256 === layer.asset.sha256);
        if (!owner || owner.media.path !== layer.asset.path) fail("Unknown layer media");
      }
    layers.splice(
      operation.toIndex,
      0,
      ...clone(operation.layers).map((layer) => ({
        ...layer,
        locked: layer.locked ?? false,
      })),
    );
  } else if (operation.type === "reorder-layers") {
    requireCompleteGroups(operation.layerIds);
    if (operation.layerIds.some((id) => !layers.some((layer) => layer.id === id))) fail("Unknown layer");
    const ids = new Set(operation.layerIds),
      moving = layers.filter(({ id }) => ids.has(id)),
      remaining = layers.filter(({ id }) => !ids.has(id));
    if (operation.toIndex > remaining.length) fail("Invalid layer order");
    const reordered = [...remaining.slice(0, operation.toIndex), ...moving, ...remaining.slice(operation.toIndex)];
    requireAtomicReorder(reordered, operation.layerIds);
    layers.splice(0, layers.length, ...reordered);
  } else if (operation.type === "set-layer-groups") {
    requireCompleteGroups(operation.memberships.map(({ layerId }) => layerId));
    for (const membership of operation.memberships) {
      const layer = layers.find(({ id }) => id === membership.layerId);
      if (!layer) fail("Unknown layer");
      if (membership.groupId) layer!.groupId = membership.groupId;
      else delete layer!.groupId;
    }
  } else if (operation.type === "set-layer-locks") {
    requireCompleteGroups(operation.locks.map(({ layerId }) => layerId));
    for (const item of operation.locks) {
      const layer = layers.find(({ id }) => id === item.layerId);
      if (!layer) fail("Unknown layer");
      layer!.locked = item.locked;
    }
  } else if (operation.type === "set-layer-rotations") {
    requireCompleteGroups(operation.rotations.map(({ layerId }) => layerId));
    for (const item of operation.rotations) {
      const layer = layers.find(({ id }) => id === item.layerId);
      if (!layer) fail("Unknown layer");
      layer!.rotation = item.rotation;
    }
  } else if (operation.type === "set-text-properties") {
    const layer = layers.find(({ id }) => id === operation.layerId);
    if (isTextLayerV3(layer))
      Object.assign(layer, {
        content: operation.content,
        fill: operation.fill,
        scale: operation.scale,
        alignment: operation.alignment,
      });
    else fail("Unknown text layer");
    if (!isVisualLayerV3(layer)) fail("Invalid text layer operation");
  } else {
    if (operation.version !== 2) fail("Invalid visual document operation.");
    if (operation.type === "add-layer") {
      const layer = {
        ...clone(operation.layer),
        kind: "image" as const,
        locked: false,
      };
      if (
        layers.length >= MAX_DOCUMENT_LAYERS_V3 ||
        layers.some(({ id }) => id === layer.id) ||
        !isVisualLayerV3(layer)
      )
        fail("Invalid image layer");
      layers.push(layer);
    } else if (
      operation.type === "move-layer" ||
      operation.type === "set-layer-visibility" ||
      operation.type === "rename-layer" ||
      operation.type === "remove-layer" ||
      operation.type === "reorder-layer" ||
      operation.type === "set-layer-properties"
    ) {
      const index = layers.findIndex(({ id }) => id === operation.layerId),
        layer = layers[index];
      if (!layer) fail("Unknown layer");
      if (operation.type === "move-layer" || operation.type === "remove-layer" || operation.type === "reorder-layer")
        requireCompleteGroups([operation.layerId]);
      if (operation.type === "move-layer") Object.assign(layer, { xQ16: operation.xQ16, yQ16: operation.yQ16 });
      if (operation.type === "set-layer-visibility") layer.visible = operation.visible;
      if (operation.type === "rename-layer") {
        if (operation.name.trim() !== operation.name) fail("Invalid layer name");
        layer.name = operation.name;
      }
      if (operation.type === "remove-layer") layers.splice(index, 1);
      if (operation.type === "reorder-layer") {
        if (operation.toIndex < 0 || operation.toIndex >= layers.length) fail("Invalid layer order");
        const reordered = [...layers],
          [moving] = reordered.splice(index, 1);
        reordered.splice(operation.toIndex, 0, moving!);
        requireAtomicReorder(reordered, [operation.layerId]);
        layers.splice(0, layers.length, ...reordered);
      }
      if (operation.type === "set-layer-properties") {
        Object.assign(layer, {
          xQ16: operation.xQ16,
          yQ16: operation.yQ16,
          widthQ16: operation.widthQ16,
          heightQ16: operation.heightQ16,
          opacity: operation.opacity,
          ...(isShapeLayerV3(layer) || isTextLayerV3(layer) ? {} : { crop: operation.crop }),
        });
        if (isShapeLayerV3(layer) && layer.cornerRadiusQ16 !== undefined) {
          const radius = Math.min(layer.cornerRadiusQ16, Math.floor(Math.min(layer.widthQ16, layer.heightQ16) / 2));
          if (radius === 0) delete layer.cornerRadiusQ16;
          else layer.cornerRadiusQ16 = radius;
        }
      }
      if (operation.type !== "remove-layer" && !isVisualLayerV3(layer)) fail("Invalid layer operation");
    } else {
      fail("Invalid visual document operation.");
    }
  }
  const guides = clone(document.guides ?? []);
  if (operation.type === "set-guides") {
    guides.splice(0, guides.length, ...clone(operation.guides));
    if (!guides.every((guide) => isDocumentGuideV3(guide, document))) fail("Invalid document guide");
  }
  if (!validDocument({ ...document, layers, guides }, role)) fail("Invalid visual document");
  project.visualDocuments = {
    ...project.visualDocuments,
    [role]: { ...document, layers, guides },
  };
  delete project.componentEvidence.visual;
};
// prettier-ignore
const commit = (state: Omit<ProjectStateV3, "project">): ProjectStateV3 => ({ ...state, project: currentProjectV3(state) });
// prettier-ignore
const applyOne = (project: ThemeProjectV3, operation: OperationV3): ThemeProjectV3 => {
  const next = clone(project);
  if (operation.type === "set-metadata") next.metadata[operation.field] = operation.value;
  if (operation.type === "add-media" || operation.type === "import-layer" || operation.type === "import-visual-layer") { if (!validAsset(operation.asset)) fail("Invalid V3 media asset."); next.assets = next.assets.filter(({ id }) => id !== operation.asset.id); next.assets.push(clone(operation.asset)); for (const ref of [operation.asset.media, ...(operation.asset.prepared ? [operation.asset.prepared] : [])]) if (!next.assetManifest.some(({ sha256, path }) => sha256 === ref.sha256 && path === ref.path)) next.assetManifest.push(ref); }
  if (operation.type === "set-theme-sound") {
    const id = `wav:${operation.role.slice(0, -6)}`;
    next.assets = next.assets.filter((asset) => asset.id !== id);
    delete next.roleAssignments[operation.role];
    next.confirmedRoles = next.confirmedRoles.filter((role) => role !== operation.role);
    if (operation.asset) {
      if (!validAsset(operation.asset) || operation.asset.id !== id || operation.asset.role !== operation.role)
        fail("Invalid theme sound asset.");
      next.assets.push(clone(operation.asset));
      for (const ref of [operation.asset.media, ...(operation.asset.prepared ? [operation.asset.prepared] : [])])
        if (!next.assetManifest.some(({ sha256, path }) => sha256 === ref.sha256 && path === ref.path))
          next.assetManifest.push(ref);
      next.roleAssignments[operation.role] = operation.asset.media.sha256;
      next.confirmedRoles = [...new Set([...next.confirmedRoles, operation.role])].sort() as AssetRoleV3[];
    }
  }
  if (operation.type === "assign-role") { if (!next.assets.some(({ media }) => media.sha256 === operation.mediaSha256)) fail(`Unknown media for role: ${operation.role}`); next.roleAssignments[operation.role] = operation.mediaSha256; next.confirmedRoles = next.confirmedRoles.filter((role) => role !== operation.role); if (["top-background", "bottom-background", "grid-cell", "grid-cell-selected", "banner-cell", "banner-cell-selected", "scrim"].includes(operation.role)) delete next.componentEvidence.visual; else if (operation.role === "bgm") delete next.componentEvidence.bcstm; }
  if (operation.type === "confirm-role") { if (!next.roleAssignments[operation.role]) fail(`Role requires media before confirmation: ${operation.role}`); next.confirmedRoles = [...new Set([...next.confirmedRoles, operation.role])].sort() as AssetRoleV3[]; }
  if (operation.type === "set-component-evidence") { if (operation.receipt === undefined) delete next.componentEvidence[operation.component]; else next.componentEvidence[operation.component] = clone(operation.receipt); }
  if (operation.type === "set-legacy-composition" || operation.type === "import-layer") next.legacyComposition = clone(operation.composition);
  if (operation.type === "edit-visual-document" || operation.type === "import-visual-layer") editVisualDocument(next, operation.role, operation.operation);
  if (operation.type === "set-custom-launcher-layout") {
    if (next.themeKind !== "custom") fail("Custom launcher layout requires a Custom project.");
    if ("value" in operation)
      next.customLauncherLayout = {
        ...next.customLauncherLayout,
        [operation.element]: clone(operation.value),
      } as ThemeProjectV3["customLauncherLayout"];
    else {
      const overrides = { ...next.customLauncherLayout };
      delete overrides[operation.element];
      if (Object.keys(overrides).length) next.customLauncherLayout = overrides;
      else delete next.customLauncherLayout;
    }
    delete next.componentEvidence.visual;
  }
  if (operation.type === "acknowledge") next.acknowledgments = [...new Set([...next.acknowledgments, operation.fingerprint])].sort();
  return next;
};
// prettier-ignore
export const currentProjectV3 = (state: Pick<ProjectStateV3, "initial" | "operations" | "cursor">): ThemeProjectV3 => state.operations.slice(0, state.cursor).reduce(applyOne, clone(state.initial));
// prettier-ignore
export function createProjectV3(input: { projectId: string; metadata: ThemeProjectV3["metadata"]; themeKind?: ThemeProjectV3["themeKind"]; assets?: readonly MediaAssetV3[]; requiredRoles?: readonly AssetRoleV3[]; legacyEvidence?: ThemeProjectV3["legacyEvidence"]; legacyComposition?: unknown }): ProjectStateV3 {
  // prettier-ignore
  const assets = [...(input.assets ?? [])].map(clone), initial: ThemeProjectV3 = { schema: V3_SCHEMA, formatVersion: 3, projectId: input.projectId, themeKind: input.themeKind ?? "material", metadata: clone(input.metadata), targetProfileId: "dspico-launcher-v1", profile: V3_PROFILE, assets, assetManifest: assets.flatMap(({ media, prepared }) => [media, ...(prepared ? [prepared] : [])]), roleAssignments: {}, requiredRoles: [...(input.requiredRoles ?? [])], confirmedRoles: [], quarantine: [], acknowledgments: [], componentEvidence: {}, ...(input.legacyEvidence ? { legacyEvidence: input.legacyEvidence } : {}), ...(input.legacyComposition !== undefined ? { legacyComposition: clone(input.legacyComposition) } : {}) };
  // prettier-ignore
  if (!initial.projectId || !isMetadataV3(initial.metadata) || !initial.assets.every(validAsset) || !initial.requiredRoles.every(isAssetRoleV3)) fail("V3 project input is not canonical.");
  return commit({ formatVersion: 3, initial, operations: [], cursor: 0, baseRevision: 0, snapshots: [] });
}
// prettier-ignore
export function applyOperationV3(state: ProjectStateV3, operation: OperationV3): ProjectStateV3 { if (!validOperation(operation)) fail("Invalid V3 operation."); const operations = [...state.operations.slice(0, state.cursor), clone(operation)]; return commit({ formatVersion: 3, initial: state.initial, operations, cursor: operations.length, baseRevision: state.baseRevision, snapshots: state.snapshots }); }
export const undoV3 = (state: ProjectStateV3): ProjectStateV3 =>
  commit({ ...state, cursor: Math.max(0, state.cursor - 1) });
export const redoV3 = (state: ProjectStateV3): ProjectStateV3 =>
  commit({ ...state, cursor: Math.min(state.operations.length, state.cursor + 1) });
// prettier-ignore
export const confirmRolesV3 = (state: ProjectStateV3, assignments: Partial<Record<AssetRoleV3, string>>): ProjectStateV3 => Object.entries(assignments).reduce((next, [role, mediaSha256]) => applyOperationV3(applyOperationV3(next, { version: 3, type: "assign-role", role: role as AssetRoleV3, mediaSha256: mediaSha256! }), { version: 3, type: "confirm-role", role: role as AssetRoleV3 }), state);
// prettier-ignore
export const collectMediaReferencesV3 = (state: ProjectStateV3): MediaRefV1[] => {
  const persisted = { ...state, project: undefined as never };
  delete (persisted as Partial<ProjectStateV3>).project;
  if (!validPersistedState(persisted)) fail("Project state is not canonical V3.");
  const project = currentProjectV3(persisted);
  return [
    ...[persisted.initial, ...persisted.snapshots.map(({ project: snapshot }) => snapshot), project].flatMap((retained) => [
      ...retained.assetManifest,
      ...retained.assets.flatMap(({ media, prepared }) => [media, ...(prepared ? [prepared] : [])]),
    ]),
    ...persisted.operations.flatMap((operation) =>
      operation.type === "set-theme-sound"
        ? operation.asset
          ? [operation.asset.media, ...(operation.asset.prepared ? [operation.asset.prepared] : [])]
          : []
        : operation.type === "add-media" || operation.type === "import-layer" || operation.type === "import-visual-layer"
          ? [operation.asset.media, ...(operation.asset.prepared ? [operation.asset.prepared] : [])]
          : [],
    ),
  ].filter(
    (ref, index, all) =>
      all.findIndex((candidate) => candidate.sha256 === ref.sha256 && candidate.path === ref.path) === index,
  );
};
export function saveProjectV3(state: ProjectStateV3): string {
  const value = { ...state, project: undefined as never };
  delete (value as Partial<ProjectStateV3>).project;
  if (!validPersistedState(value)) fail("Project state is not canonical V3.");
  const normalized = normalizePersistedLocks(value);
  if (!validateProjectV3(currentProjectV3(normalized))) fail("Project state is not canonical V3.");
  return `${JSON.stringify(canonical(normalized))}\n`;
}
export function openProjectV3(bytes: string): ProjectStateV3 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes);
  } catch {
    throw new FormatRefusalError("invalid-json", "Project bytes are not valid JSON.");
  }
  if (!validPersistedState(parsed)) fail("Project format failed strict V3 validation.");
  const value = normalizePersistedLocks(parsed as Omit<ProjectStateV3, "project">),
    project = currentProjectV3(value);
  if (!validateProjectV3(project)) fail("Project format failed strict V3 validation.");
  return { ...value, project };
}
export const customLauncherLayoutAuthoritySha256V3 = (state: ProjectStateV3): string => sha256(saveProjectV3(state));
