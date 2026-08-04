import { Type, type Static } from "@sinclair/typebox";

const noExtra = { additionalProperties: false } as const;
const Token = Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()]);
const Metadata = Type.Object({ name: Type.String(), description: Type.String(), author: Type.String() }, noExtra);
const Scene = Type.Object(
  {
    id: Type.String(),
    screen: Type.Union([Type.Literal("top"), Type.Literal("bottom")]),
    mode: Type.String(),
    overrides: Type.Record(Type.String(), Token),
  },
  noExtra,
);

export const LaunchTransitionV2Schema = Type.Object(
  {
    coverStartScalePercent: Type.Integer({ minimum: 1, maximum: 200 }),
    coverFinalAlpha: Type.Integer({ minimum: 0, maximum: 31 }),
    scrimFinalAlpha: Type.Integer({ minimum: 0, maximum: 31 }),
  },
  noExtra,
);
// prettier-ignore
export const ThemeProjectV2Schema = Type.Object({ formatVersion: Type.Literal(2), projectId: Type.String(), themeKind: Type.Union([Type.Literal("material"), Type.Literal("custom")]), metadata: Metadata, targetProfileId: Type.Literal("dspico-launcher-v1"), tokens: Type.Record(Type.String(), Token), launchTransition: LaunchTransitionV2Schema, scenes: Type.Array(Scene), assetManifest: Type.Array(Type.Object({ path: Type.String(), sha256: Type.String() }, noExtra)), acknowledgments: Type.Array(Type.String()), documents: Type.Array(Type.Unknown()), assets: Type.Array(Type.Unknown()), notices: Type.Array(Type.String()) }, noExtra);
// prettier-ignore
export const OperationV2Schema = Type.Union([Type.Object({ version: Type.Literal(2), type: Type.Literal("set-metadata"), field: Type.Union([Type.Literal("name"), Type.Literal("description"), Type.Literal("author")]), value: Type.String() }, noExtra), Type.Object({ version: Type.Literal(2), type: Type.Literal("set-material-token"), key: Type.String(), value: Token }, noExtra), Type.Object({ version: Type.Literal(2), type: Type.Literal("set-launch-transition-field"), field: Type.Union([Type.Literal("coverStartScalePercent"), Type.Literal("coverFinalAlpha"), Type.Literal("scrimFinalAlpha")]), value: Type.Integer() }, noExtra), Type.Object({ version: Type.Literal(2), type: Type.Literal("set-scene-token"), sceneId: Type.String(), screen: Type.Union([Type.Literal("top"), Type.Literal("bottom")]), mode: Type.String(), key: Type.String(), value: Token }, noExtra), Type.Object({ version: Type.Literal(2), type: Type.Literal("acknowledge"), fingerprint: Type.String() }, noExtra)]);

export type TokenValueV2 = Static<typeof Token>;
export type ThemeProjectV2 = Static<typeof ThemeProjectV2Schema>;
export type OperationV2 = Static<typeof OperationV2Schema>;
export type ProjectStateV2 = {
  formatVersion: 2;
  initial: ThemeProjectV2;
  operations: OperationV2[];
  cursor: number;
  baseRevision: number;
  snapshots: { revision: number; project: ThemeProjectV2 }[];
};
export type CommittedStateV2 = ProjectStateV2 & { project: ThemeProjectV2 };
export type TransitionField = keyof Static<typeof LaunchTransitionV2Schema>;
const Snapshot = Type.Object({ revision: Type.Integer({ minimum: 0 }), project: ThemeProjectV2Schema }, noExtra);
export const ProjectStateV2Schema = Type.Object(
  {
    formatVersion: Type.Literal(2),
    initial: ThemeProjectV2Schema,
    operations: Type.Array(OperationV2Schema),
    cursor: Type.Integer({ minimum: 0 }),
    baseRevision: Type.Integer({ minimum: 0 }),
    snapshots: Type.Array(Snapshot),
  },
  noExtra,
);

export const TRANSITION_DEFAULTS: Record<TransitionField, number> = {
  coverStartScalePercent: 100,
  coverFinalAlpha: 12,
  scrimFinalAlpha: 14,
};
export const isTransitionField = (key: string): key is TransitionField => key in TRANSITION_DEFAULTS;
export const validTransition = (field: TransitionField, value: number): boolean =>
  Number.isInteger(value) &&
  (field === "coverStartScalePercent" ? value >= 1 && value <= 200 : value >= 0 && value <= 31);
