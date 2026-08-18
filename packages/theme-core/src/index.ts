import { Type, type Static } from "@sinclair/typebox";
import { Ajv } from "ajv";
export { createPreviewModel, type PreviewModel } from "./preview.js";

const TokenValueSchema = Type.Union([
  Type.String(),
  Type.Number(),
  Type.Boolean(),
  Type.Null(),
  Type.Object(
    {
      r: Type.Integer({ minimum: 0, maximum: 255 }),
      g: Type.Integer({ minimum: 0, maximum: 255 }),
      b: Type.Integer({ minimum: 0, maximum: 255 }),
    },
    { additionalProperties: false },
  ),
]);
const MetadataSchema = Type.Object(
  { name: Type.String(), description: Type.String(), author: Type.String() },
  { additionalProperties: false },
);
const SceneSchema = Type.Object(
  {
    id: Type.String(),
    screen: Type.Union([Type.Literal("top"), Type.Literal("bottom")]),
    mode: Type.String(),
    overrides: Type.Record(Type.String(), TokenValueSchema),
  },
  { additionalProperties: false },
);

export const MaterialProjectV1Schema = Type.Object(
  {
    formatVersion: Type.Literal(1),
    projectId: Type.String(),
    metadata: MetadataSchema,
    targetProfileId: Type.Literal("dspico-launcher-v1"),
    tokens: Type.Record(Type.String(), TokenValueSchema),
    scenes: Type.Array(SceneSchema),
    assetManifest: Type.Array(
      Type.Object({ path: Type.String(), sha256: Type.String() }, { additionalProperties: false }),
    ),
    acknowledgments: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

export const OperationV1Schema = Type.Union([
  Type.Object(
    {
      version: Type.Literal(1),
      type: Type.Literal("set-metadata"),
      field: Type.Union([Type.Literal("name"), Type.Literal("description"), Type.Literal("author")]),
      value: Type.String(),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    { version: Type.Literal(1), type: Type.Literal("set-token"), key: Type.String(), value: TokenValueSchema },
    { additionalProperties: false },
  ),
  Type.Union([
    Type.Object(
      {
        version: Type.Literal(1),
        type: Type.Literal("set-scene-token"),
        sceneId: Type.String(),
        key: Type.String(),
        value: TokenValueSchema,
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        version: Type.Literal(1),
        type: Type.Literal("set-scene-token"),
        sceneId: Type.String(),
        screen: Type.Union([Type.Literal("top"), Type.Literal("bottom")]),
        mode: Type.String(),
        key: Type.String(),
        value: TokenValueSchema,
      },
      { additionalProperties: false },
    ),
  ]),
  Type.Object(
    { version: Type.Literal(1), type: Type.Literal("acknowledge"), fingerprint: Type.String() },
    { additionalProperties: false },
  ),
]);

export type MaterialProjectV1 = Static<typeof MaterialProjectV1Schema>;
export type OperationV1 = Static<typeof OperationV1Schema>;
export type ProjectStateV1 = {
  formatVersion: 1;
  initial: MaterialProjectV1;
  operations: OperationV1[];
  cursor: number;
  baseRevision: number;
  snapshots: { revision: number; project: MaterialProjectV1 }[];
};

const SnapshotSchema = Type.Object(
  { revision: Type.Integer({ minimum: 0 }), project: MaterialProjectV1Schema },
  { additionalProperties: false },
);
export const ProjectStateV1Schema = Type.Object(
  {
    formatVersion: Type.Literal(1),
    initial: MaterialProjectV1Schema,
    operations: Type.Array(OperationV1Schema),
    cursor: Type.Integer({ minimum: 0 }),
    baseRevision: Type.Integer({ minimum: 0 }),
    snapshots: Type.Array(SnapshotSchema),
  },
  { additionalProperties: false },
);

const validateState = new Ajv({ strict: true, allErrors: true }).compile(ProjectStateV1Schema);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class FormatRefusalError extends Error {
  readonly reason: "invalid-json" | "unsupported-format" | "invalid-format";

  constructor(reason: FormatRefusalError["reason"], message: string) {
    super(message);
    this.name = "FormatRefusalError";
    this.reason = reason;
  }
}

export function createProject(input: {
  projectId: string;
  metadata: MaterialProjectV1["metadata"];
  targetProfileId: "dspico-launcher-v1";
  tokens?: MaterialProjectV1["tokens"];
  scenes?: MaterialProjectV1["scenes"];
  assetManifest?: MaterialProjectV1["assetManifest"];
}): ProjectStateV1 {
  const initial: MaterialProjectV1 = {
    formatVersion: 1,
    projectId: input.projectId,
    metadata: clone(input.metadata),
    targetProfileId: input.targetProfileId,
    tokens: { primaryColor: { r: 0, g: 0, b: 0 }, darkTheme: false, ...clone(input.tokens ?? {}) },
    scenes: clone(input.scenes ?? []),
    assetManifest: clone(input.assetManifest ?? []),
    acknowledgments: [],
  };
  return { formatVersion: 1, initial, operations: [], cursor: 0, baseRevision: 0, snapshots: [] };
}

function applyToProject(project: MaterialProjectV1, operation: OperationV1): MaterialProjectV1 {
  const next = clone(project);
  switch (operation.type) {
    case "set-metadata":
      next.metadata[operation.field] = operation.value;
      break;
    case "set-token":
      next.tokens[operation.key] = operation.value;
      break;
    case "set-scene-token": {
      let scene = next.scenes.find(({ id }) => id === operation.sceneId);
      if (!scene) {
        if (!("screen" in operation)) throw new Error(`Unknown scene: ${operation.sceneId}`);
        scene = { id: operation.sceneId, screen: operation.screen, mode: operation.mode, overrides: {} };
        next.scenes.push(scene);
      } else if ("screen" in operation && (scene.screen !== operation.screen || scene.mode !== operation.mode)) {
        throw new Error(`Scene identity mismatch: ${operation.sceneId}`);
      }
      scene.overrides[operation.key] = operation.value;
      break;
    }
    case "acknowledge":
      next.acknowledgments = [...new Set([...next.acknowledgments, operation.fingerprint])].sort();
      break;
  }
  return next;
}

function replay(initial: MaterialProjectV1, operations: readonly OperationV1[]): MaterialProjectV1 {
  return operations.reduce(applyToProject, clone(initial));
}

export function currentProject(state: ProjectStateV1): MaterialProjectV1 {
  return replay(state.initial, state.operations.slice(0, state.cursor));
}

export function applyOperation(state: ProjectStateV1, operation: OperationV1): ProjectStateV1 {
  let initial = clone(state.initial);
  let baseRevision = state.baseRevision;
  let operations = [...state.operations.slice(0, state.cursor), clone(operation)];
  let snapshots = state.snapshots.filter(({ revision }) => revision <= state.baseRevision + state.cursor);
  if (operations.length > 200) {
    const overflow = operations.length - 200;
    initial = replay(initial, operations.slice(0, overflow));
    operations = operations.slice(overflow);
    baseRevision += overflow;
  }
  const cursor = operations.length;
  const revision = baseRevision + cursor;
  const next: ProjectStateV1 = { formatVersion: 1, initial, operations, cursor, baseRevision, snapshots };
  if (revision > 0 && revision % 20 === 0) {
    snapshots = [
      ...snapshots.filter((snapshot) => snapshot.revision !== revision),
      { revision, project: currentProject(next) },
    ]
      .sort((left, right) => left.revision - right.revision)
      .slice(-10);
    next.snapshots = snapshots;
  }
  return next;
}

export function undo(state: ProjectStateV1): ProjectStateV1 {
  return state.cursor === 0 ? state : { ...state, cursor: state.cursor - 1 };
}

export function redo(state: ProjectStateV1): ProjectStateV1 {
  return state.cursor === state.operations.length ? state : { ...state, cursor: state.cursor + 1 };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

export function saveProject(state: ProjectStateV1): string {
  const operations = state.operations.slice(0, state.cursor);
  const revision = state.baseRevision + state.cursor;
  const snapshots = [
    ...state.snapshots.filter((snapshot) => snapshot.revision !== revision),
    { revision, project: currentProject(state) },
  ]
    .sort((left, right) => left.revision - right.revision)
    .slice(-10);
  const committed = { ...state, operations, cursor: operations.length, snapshots };
  if (!validateState(committed)) throw new FormatRefusalError("invalid-format", "Project state is not canonical.");
  return `${JSON.stringify(canonical(committed))}\n`;
}

export function openProject(bytes: string): ProjectStateV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes);
  } catch {
    throw new FormatRefusalError("invalid-json", "Project bytes are not valid JSON.");
  }
  const version = (parsed as { formatVersion?: unknown } | null)?.formatVersion;
  if (version !== 1)
    throw new FormatRefusalError("unsupported-format", `Unsupported project format: ${String(version)}`);
  if (!validateState(parsed))
    throw new FormatRefusalError("invalid-format", "Project format failed strict validation.");
  const state = clone(parsed as ProjectStateV1);
  if (state.cursor > state.operations.length || state.operations.length > 200 || state.snapshots.length > 10) {
    throw new FormatRefusalError("invalid-format", "Project history exceeds canonical bounds.");
  }
  return state;
}

export function recoverProject(input: { committedBytes: string; stagedBytes?: string; journalBytes?: string }) {
  return {
    state: openProject(input.committedBytes),
    orphans: [input.stagedBytes && "staged-project", input.journalBytes && "journal"].filter(Boolean) as string[],
  };
}

export * from "./model-v2.js";
export * from "./history-v2.js";
export * from "./migration-v2.js";
export * from "./render-plan-v2.js";
export * from "./parity-model-v1.js";
export * from "./parity-history-v1.js";
export * from "./parity-migration-v1.js";
export * from "./model-v3.js";
export * from "./limits-v3.js";
export * from "./history-v3.js";
export * from "./migration-v3.js";
export * from "./render-plan-v3.js";
