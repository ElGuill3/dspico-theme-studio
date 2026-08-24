import Ajv from "ajv";
// prettier-ignore
import { OperationV1Schema, OperationV2Schema, applyOperation, applyOperationV2, applyOperationV3, confirmRolesV3, createMediaRefV3, createProject, createProjectV2, createProjectV3, currentProject, currentProjectV3, customLauncherLayoutAuthoritySha256V3, isMetadataFieldV3, isVisualDocumentOperationV3, metadataErrorV3, redo, undo, type MaterialProjectV1, type MetadataFieldV3, type OperationV1, type OperationV2, type ProjectStateV1, type ProjectStateV3, type SetCustomLauncherLayoutV3, type ThemeProjectV2, type ThemeProjectV3, type VisualDocumentOperationV3 } from "../../../packages/theme-core/src/index.js";
import {
  customExportBlockedDiagnostic,
  CUSTOM_LAUNCHER_LAYOUT_KEYS_V1,
  CUSTOM_VISUAL_ROLES_V1,
  prepareThemeSoundV1,
  THEME_SOUND_ROLES_V1,
  validateCustomLauncherLayoutOverridesV1,
  type CustomLauncherLayoutKeyV1,
  type CustomLauncherLayoutOverridesV1,
  type DiagnosticV1,
  type PreparedThemeSoundV1,
  type ThemeSoundPrepareInputV1,
  type CustomVisualRoleV1,
} from "../../../packages/dspico-contract/src/index.js";
import { STUDIO_CHANNEL, isTrustedStudioUrl } from "./security.js";
import type { AssetProvenanceV1, ImportedPngV1 } from "./png-import.js";
import { legacyCustomProjectV3, visualRoleFromUseV3, type CustomAuthoringSnapshotV3 } from "./custom-authoring-v3.js";
import { ProjectDialogCancelled } from "./project-folder.js";
import type { CloseDraftAcknowledgement } from "./app-resilience.js";
export { ProjectDialogCancelled } from "./project-folder.js";
export {
  STUDIO_CHANNEL,
  WINDOW_SECURITY,
  isStudioUrl,
  isTrustedStudioUrl,
  selectStudioRendererUrl,
} from "./security.js";

type Metadata = MaterialProjectV1["metadata"];
type CreateInput = { projectId: string; metadata: Metadata };
export type PngImportInput = Omit<AssetProvenanceV1, "originalName">;
export type PngBytesImportInput = PngImportInput & { originalName: string; sourceBytes: Uint8Array };
export type CustomLauncherLayoutDtoV1 = {
  authoritySha256: string;
  overrides: CustomLauncherLayoutOverridesV1;
};
export type SetCustomLauncherLayoutRequestV1 = {
  kind: "set-custom-launcher-layout";
  expectedAuthoritySha256: string;
  operation: SetCustomLauncherLayoutV3;
};
export type StudioRequest =
  | ({ kind: "create" } & CreateInput)
  | ({ kind: "create-custom" } & CreateInput)
  | { kind: "open-project" | "restore-project" | "restore-pre-migration-v3" }
  | { kind: "open-custom" }
  | { kind: "import-png"; provenance: PngImportInput }
  | { kind: "import-png-bytes"; provenance: PngImportInput; originalName: string; sourceBytes: Uint8Array }
  | ({ kind: "prepare-wav" } & ThemeSoundPrepareInputV1)
  | { kind: "remove-wav"; role: ThemeSoundPrepareInputV1["role"] }
  | { kind: "open" | "save" | "undo" | "redo" | "validate" | "handoff" }
  | { kind: "export"; target?: "material" | "custom" }
  | { kind: "reveal-export"; revealId: string; target: "folder" | "zip" }
  | { kind: "edit"; operation: OperationV1 }
  | { kind: "edit-custom"; operation: OperationV2 }
  | { kind: "set-custom-metadata"; field: MetadataFieldV3; value: string }
  | SetCustomLauncherLayoutRequestV1
  | { kind: "edit-visual-document"; role: CustomVisualRoleV1; operation: VisualDocumentOperationV3 };
export type StudioResult = {
  project?: MaterialProjectV1;
  customProject?: ThemeProjectV2;
  customAuthoring?: CustomAuthoringSnapshotV3;
  asset?: ImportedPngV1;
  diagnostics?: DiagnosticV1[];
  canExport?: boolean;
  canEdit?: boolean;
  cancelled?: true;
  projectLocation?: string;
  orphans?: string[];
  publication?: {
    destination: string;
    files: string[];
    reportSha256: string;
    zipSha256: string;
    revealId: string;
    folderName: string;
    zipName: string;
  };
  sound?: PreparedThemeSoundV1;
  soundRoles?: ThemeSoundPrepareInputV1["role"][];
  customLauncherLayout?: CustomLauncherLayoutDtoV1;
  customLauncherLayoutStatus?: "committed" | "conflict";
  handoff?: { destination: string; files: string[]; label: "NOT READY — CARTRIDGE TEST ONLY"; zip: false };
  revealed?: true;
  restored?: true;
};
type CandidateAuthority = { commit?: () => void | Promise<void>; discard?: () => void | Promise<void> };
type OpenedMaterial = {
  type?: "material";
  state: ProjectStateV1;
  orphans: string[];
  location?: string;
} & CandidateAuthority;
type OpenedCustom = {
  type?: "custom";
  state: ProjectStateV3;
  orphans: string[];
  diagnostics?: DiagnosticV1[];
  canEdit?: boolean;
  location?: string;
  customAuthoring?: CustomAuthoringSnapshotV3;
} & CandidateAuthority;
// prettier-ignore
export interface StudioApi { create(input: CreateInput): Promise<StudioResult>; createCustom(input: CreateInput): Promise<StudioResult>; importPng(input: PngImportInput): Promise<StudioResult>; importPngBytes(input: PngBytesImportInput): Promise<StudioResult>; prepareWav(input: ThemeSoundPrepareInputV1): Promise<StudioResult>; removeWav(role: ThemeSoundPrepareInputV1["role"]): Promise<StudioResult>; openProject(): Promise<StudioResult>; restoreProject(): Promise<StudioResult>; restorePreMigrationV3(): Promise<StudioResult>; open(): Promise<StudioResult>; openCustom(): Promise<StudioResult>; save(): Promise<StudioResult>; edit(operation: OperationV1): Promise<StudioResult>; editCustom(operation: OperationV2): Promise<StudioResult>; setCustomMetadata(field: MetadataFieldV3, value: string): Promise<StudioResult>; setCustomLauncherLayout(expectedAuthoritySha256: string, operation: SetCustomLauncherLayoutV3): Promise<StudioResult>; editVisualDocument(role: CustomVisualRoleV1, operation: VisualDocumentOperationV3): Promise<StudioResult>; undo(): Promise<StudioResult>; redo(): Promise<StudioResult>; validate(): Promise<StudioResult>; export(target?: "material" | "custom"): Promise<StudioResult>; revealExport(revealId: string, target: "folder" | "zip"): Promise<StudioResult>; handoff(): Promise<StudioResult>; setDraftDirty(dirty: boolean): void; closeDraftDecision(acknowledgement: CloseDraftAcknowledgement): void; requestClose(draftDirty?: boolean): void; reloadEditor(reopenProject?: boolean): void; onPrepareClose(listener: () => void): () => void; }
// prettier-ignore
export interface StudioDependencies { importPng(input: PngImportInput, direct?: Pick<PngBytesImportInput, "originalName" | "sourceBytes">): Promise<ImportedPngV1>; openProject?(): Promise<(OpenedMaterial & { type: "material" }) | (OpenedCustom & { type: "custom" }) | undefined>; consumeRecoveryRestore?(): boolean; restorePreMigrationV3?(): Promise<void>; open(): Promise<OpenedMaterial>; openCustom(): Promise<OpenedCustom>; save(state: ProjectStateV1, options?: { newProject?: boolean }): Promise<void | { location: string }>; saveCustom(state: ProjectStateV3, options?: { newProject?: boolean }, media?: readonly { sha256: string; bytes: Uint8Array }[]): Promise<void | { location: string }>; hydrateCustom(project: ThemeProjectV3): Promise<CustomAuthoringSnapshotV3>; validate(project: MaterialProjectV1): { diagnostics: DiagnosticV1[]; canExport: boolean }; validateCustom(project: ThemeProjectV3): { diagnostics: DiagnosticV1[]; canExport: boolean } | Promise<{ diagnostics: DiagnosticV1[]; canExport: boolean }>; export(project: MaterialProjectV1): Promise<{ destination: string; files: string[]; reportSha256: string; zipSha256: string; revealId: string; folderName: string; zipName: string }>; exportCustom(project: ThemeProjectV3): Promise<{ destination: string; files: string[]; reportSha256: string; zipSha256: string; revealId: string; folderName: string; zipName: string }>; revealExport?(revealId: string, target: "folder" | "zip"): Promise<void>; handoffCustom?(project: ThemeProjectV3): Promise<{ destination: string; files: string[]; label: "NOT READY — CARTRIDGE TEST ONLY"; zip: false }>; }

type Invoke = (channel: string, request: StudioRequest) => Promise<StudioResult>;
export const createStudioApi = (invoke: Invoke): StudioApi => {
  const call = (request: StudioRequest) => invoke(STUDIO_CHANNEL, request);
  // prettier-ignore
  // prettier-ignore
  const api: StudioApi = { create: (input) => call({ kind: "create", ...input }), createCustom: (input) => call({ kind: "create-custom", ...input }), importPng: (provenance) => call({ kind: "import-png", provenance }), importPngBytes: ({ originalName, sourceBytes, ...provenance }) => call({ kind: "import-png-bytes", provenance, originalName, sourceBytes }), prepareWav: (input) => call({ kind: "prepare-wav", ...input }), removeWav: (role) => call({ kind: "remove-wav", role }), openProject: () => call({ kind: "open-project" }), restoreProject: () => call({ kind: "restore-project" }), restorePreMigrationV3: () => call({ kind: "restore-pre-migration-v3" }), open: () => call({ kind: "open" }), openCustom: () => call({ kind: "open-custom" }), save: () => call({ kind: "save" }), edit: (operation) => call({ kind: "edit", operation }), editCustom: (operation) => call({ kind: "edit-custom", operation }), setCustomMetadata: (field, value) => call({ kind: "set-custom-metadata", field, value }), setCustomLauncherLayout: (expectedAuthoritySha256, operation) => call({ kind: "set-custom-launcher-layout", expectedAuthoritySha256, operation }), editVisualDocument: (role, operation) => call({ kind: "edit-visual-document", role, operation }), undo: () => call({ kind: "undo" }), redo: () => call({ kind: "redo" }), validate: () => call({ kind: "validate" }), export: (target) => call(target ? { kind: "export", target } : { kind: "export" }), revealExport: (revealId, target) => call({ kind: "reveal-export", revealId, target }), handoff: () => call({ kind: "handoff" }), setDraftDirty: () => undefined, closeDraftDecision: () => undefined, requestClose: () => undefined, reloadEditor: () => undefined, onPrepareClose: () => () => undefined };
  return Object.freeze(api);
};

const validateOperation = new Ajv({ strict: true }).compile(OperationV1Schema);
const validateOperationV2 = new Ajv({ strict: true }).compile(OperationV2Schema);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const validCustomLauncherLayoutOperation = (input: unknown): input is SetCustomLauncherLayoutV3 => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>,
    element = value.element;
  if (
    value.version !== 3 ||
    value.type !== "set-custom-launcher-layout" ||
    typeof element !== "string" ||
    !CUSTOM_LAUNCHER_LAYOUT_KEYS_V1.includes(element as CustomLauncherLayoutKeyV1)
  )
    return false;
  if (exactKeys(value, ["version", "type", "element"])) return true;
  return (
    exactKeys(value, ["version", "type", "element", "value"]) &&
    validateCustomLauncherLayoutOverridesV1({ [element]: value.value }).valid
  );
};
const parseRequest = (input: unknown): StudioRequest => {
  if (!input || typeof input !== "object") throw new TypeError("Invalid IPC payload");
  const value = input as Record<string, unknown>;
  if (value.kind === "create" || value.kind === "create-custom") {
    const metadata = value.metadata as Record<string, unknown> | undefined;
    // prettier-ignore
    if (!exactKeys(value, ["kind", "projectId", "metadata"]) || typeof value.projectId !== "string" || !value.projectId || !metadata || !exactKeys(metadata, ["name", "description", "author"]) ||
      [metadata.name, metadata.description, metadata.author].some((field) => typeof field !== "string"))
      throw new TypeError("Invalid IPC payload");
    if (
      value.kind === "create-custom" &&
      (["name", "description", "author"] as const).some((field) => metadataErrorV3(field, metadata[field]))
    )
      throw new TypeError("Invalid IPC payload");
  } else if (value.kind === "import-png" || value.kind === "import-png-bytes") {
    const provenance = value.provenance as Record<string, unknown> | undefined;
    const requestKeys =
      value.kind === "import-png" ? ["kind", "provenance"] : ["kind", "provenance", "originalName", "sourceBytes"];
    // prettier-ignore
    if (!exactKeys(value, requestKeys) || !provenance || !exactKeys(provenance, ["source", "author", "credit", "license", "terms", "notice", "intendedUse", "rightsToExport"]) ||
      [provenance.source, provenance.author, provenance.credit, provenance.license, provenance.terms, provenance.notice, provenance.intendedUse].some((field) => typeof field !== "string") || typeof provenance.rightsToExport !== "boolean" || /^(?:[a-z]:[\\/]|[\\/]|file:)/i.test((provenance.source as string).trim()) || (value.kind === "import-png-bytes" && (typeof value.originalName !== "string" || !value.originalName || !(value.sourceBytes instanceof Uint8Array))))
      throw new TypeError("Invalid IPC payload");
  } else if (value.kind === "prepare-wav") {
    if (
      !exactKeys(value, ["kind", "role", "sourceBytes", "recipe", "provenance"]) ||
      !(value.sourceBytes instanceof Uint8Array)
    )
      throw new TypeError("Invalid IPC payload");
  } else if (value.kind === "remove-wav") {
    if (
      !exactKeys(value, ["kind", "role"]) ||
      !THEME_SOUND_ROLES_V1.includes(value.role as ThemeSoundPrepareInputV1["role"])
    )
      throw new TypeError("Invalid IPC payload");
  } else if (value.kind === "set-custom-metadata") {
    if (
      !exactKeys(value, ["kind", "field", "value"]) ||
      !isMetadataFieldV3(value.field) ||
      metadataErrorV3(value.field, value.value)
    )
      throw new TypeError("Invalid IPC payload");
  } else if (value.kind === "set-custom-launcher-layout") {
    if (
      !exactKeys(value, ["kind", "expectedAuthoritySha256", "operation"]) ||
      typeof value.expectedAuthoritySha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(value.expectedAuthoritySha256) ||
      !validCustomLauncherLayoutOperation(value.operation)
    )
      throw new TypeError("Invalid IPC payload");
  } else if (value.kind === "edit" || value.kind === "edit-custom" || value.kind === "edit-visual-document") {
    if (
      !exactKeys(
        value,
        value.kind === "edit-visual-document" ? ["kind", "role", "operation"] : ["kind", "operation"],
      ) ||
      !(value.kind === "edit"
        ? validateOperation(value.operation)
        : value.kind === "edit-visual-document"
          ? isVisualDocumentOperationV3(value.operation)
          : validateOperationV2(value.operation)) ||
      (value.kind === "edit-visual-document" &&
        (!CUSTOM_VISUAL_ROLES_V1.includes(value.role as CustomVisualRoleV1) ||
          !isVisualDocumentOperationV3(value.operation)))
    )
      throw new TypeError("Invalid IPC payload");
  } else if (value.kind === "export") {
    if (
      (!exactKeys(value, ["kind"]) && !exactKeys(value, ["kind", "target"])) ||
      (value.target !== undefined && value.target !== "material" && value.target !== "custom")
    )
      throw new TypeError("Invalid IPC payload");
  } else if (value.kind === "reveal-export") {
    if (
      !exactKeys(value, ["kind", "revealId", "target"]) ||
      typeof value.revealId !== "string" ||
      !value.revealId ||
      (value.target !== "folder" && value.target !== "zip")
    )
      throw new TypeError("Invalid IPC payload");
  } else if (
    ![
      "open-project",
      "restore-project",
      "restore-pre-migration-v3",
      "open",
      "open-custom",
      "save",
      "undo",
      "redo",
      "validate",
      "handoff",
    ].includes(String(value.kind)) ||
    !exactKeys(value, ["kind"])
  ) {
    throw new TypeError("Invalid IPC payload");
  }
  return input as StudioRequest;
};

type SenderEvent = { sender: { session: unknown; mainFrame: unknown }; senderFrame: { url: string } | null };
type Trust = { webContents: unknown; session: unknown; origin: string };
const assertTrusted = (event: SenderEvent, trust: Trust): void => {
  const url = event.senderFrame?.url;
  // prettier-ignore
  if (event.sender !== trust.webContents || event.sender.session !== trust.session ||
    event.senderFrame !== event.sender.mainFrame || !url || !isTrustedStudioUrl(url, trust.origin))
    throw new Error("Untrusted IPC sender");
};

export const createStudioHandler = (
  trust: Trust,
  dependencies: StudioDependencies,
  validated: () => void = () => undefined,
) => {
  let state: ProjectStateV1 | ProjectStateV3 | undefined;
  let customOpenDiagnostics: DiagnosticV1[] = [];
  let customCanEdit = true;
  let projectLocation: string | undefined;
  const approvedAssets = new Map<string, ImportedPngV1>();
  const customLauncherLayout = (candidate: ProjectStateV3): CustomLauncherLayoutDtoV1 => ({
    authoritySha256: customLauncherLayoutAuthoritySha256V3(candidate),
    overrides: structuredClone(currentProjectV3(candidate).customLauncherLayout ?? {}),
  });
  let queue: Promise<void> = Promise.resolve();
  const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
    const result = queue.then(work);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  return async (event: SenderEvent, raw: unknown): Promise<StudioResult> => {
    assertTrusted(event, trust);
    const request = parseRequest(raw);
    validated();
    return enqueue(async () => {
      const customResult = async (
        candidate: ProjectStateV3,
        extra: StudioResult = {},
        hydrated?: CustomAuthoringSnapshotV3,
      ): Promise<StudioResult> => {
        const project = currentProjectV3(candidate);
        let customAuthoring = hydrated;
        try {
          customAuthoring ??= await dependencies.hydrateCustom(project);
        } catch {
          if (!extra.diagnostics?.length && !customOpenDiagnostics.length)
            throw new Error("Custom media could not be reopened.");
        }
        return {
          customProject: legacyCustomProjectV3(project),
          customLauncherLayout: customLauncherLayout(candidate),
          soundRoles: THEME_SOUND_ROLES_V1.filter((role) => Boolean(project.roleAssignments[`${role}-sound`])),
          ...(customAuthoring ? { customAuthoring } : {}),
          canEdit: customCanEdit,
          ...(projectLocation ? { projectLocation } : {}),
          ...extra,
        };
      };
      if (request.kind === "restore-project") {
        if (!dependencies.consumeRecoveryRestore?.() || !state) return { cancelled: true };
        if (state.formatVersion === 3)
          return customResult(state, {
            diagnostics: customOpenDiagnostics,
            canExport: false,
            canEdit: customCanEdit,
          });
        return { project: currentProject(state), ...(projectLocation ? { projectLocation } : {}) };
      }
      if (request.kind === "restore-pre-migration-v3") {
        if (!dependencies.restorePreMigrationV3) throw new Error("Pre-migration restore is unavailable.");
        await dependencies.restorePreMigrationV3();
        state = undefined;
        customOpenDiagnostics = [];
        customCanEdit = true;
        projectLocation = undefined;
        approvedAssets.clear();
        return { restored: true };
      }
      if (request.kind === "create") {
        const candidate = createProject({
          ...request,
          targetProfileId: "dspico-launcher-v1",
          tokens: { primaryColor: { r: 0, g: 0, b: 0 }, darkTheme: false },
        });
        let saved: void | { location: string };
        try {
          saved = await dependencies.save(candidate, { newProject: true });
        } catch (error) {
          if (error instanceof ProjectDialogCancelled) return { cancelled: true };
          throw error;
        }
        approvedAssets.clear();
        customOpenDiagnostics = [];
        customCanEdit = true;
        state = candidate;
        projectLocation = saved?.location;
        return { project: currentProject(state), ...(projectLocation ? { projectLocation } : {}) };
      }
      if (request.kind === "create-custom") {
        const composition = createProjectV2({
          projectId: request.projectId,
          metadata: request.metadata,
          themeKind: "custom",
          tokens: { primaryColor: { r: 0, g: 0, b: 0 } as never, darkTheme: false },
        });
        const candidate = createProjectV3({
          projectId: request.projectId,
          metadata: request.metadata,
          themeKind: "custom",
          requiredRoles: [
            "top-background",
            "bottom-background",
            "grid-cell",
            "grid-cell-selected",
            "banner-cell",
            "banner-cell-selected",
            "scrim",
          ],
          legacyComposition: composition,
        });
        let saved: void | { location: string };
        try {
          saved = await dependencies.saveCustom(candidate, { newProject: true });
        } catch (error) {
          if (error instanceof ProjectDialogCancelled) return { cancelled: true };
          throw error;
        }
        approvedAssets.clear();
        customOpenDiagnostics = [];
        customCanEdit = true;
        state = candidate;
        projectLocation = saved?.location;
        return customResult(candidate);
      }
      if (request.kind === "open-project") {
        if (!dependencies.openProject) throw new Error("Unified project opening is unavailable.");
        const opened = await dependencies.openProject();
        if (!opened) return { cancelled: true };
        if (opened.type === "material") {
          try {
            await opened.commit?.();
          } catch (error) {
            await opened.discard?.();
            throw error;
          }
          approvedAssets.clear();
          customOpenDiagnostics = [];
          customCanEdit = true;
          state = opened.state;
          projectLocation = opened.location;
          return {
            project: currentProject(opened.state),
            orphans: opened.orphans,
            ...(projectLocation ? { projectLocation } : {}),
          };
        }
        const nextDiagnostics = opened.diagnostics ?? [];
        const nextCanEdit = opened.canEdit !== false;
        let next: StudioResult;
        try {
          next = await customResult(
            opened.state,
            {
              orphans: opened.orphans,
              diagnostics: nextDiagnostics,
              canExport: false,
              canEdit: nextCanEdit,
            },
            opened.customAuthoring,
          );
        } catch (error) {
          await opened.discard?.();
          throw error;
        }
        try {
          await opened.commit?.();
        } catch (error) {
          await opened.discard?.();
          throw error;
        }
        approvedAssets.clear();
        state = opened.state;
        customOpenDiagnostics = nextDiagnostics;
        customCanEdit = nextCanEdit;
        projectLocation = opened.location;
        return { ...next, ...(projectLocation ? { projectLocation } : {}) };
      }
      if (request.kind === "open") {
        let opened;
        try {
          opened = await dependencies.open();
        } catch (error) {
          if (error instanceof ProjectDialogCancelled) return { cancelled: true };
          throw error;
        }
        try {
          await opened.commit?.();
        } catch (error) {
          await opened.discard?.();
          throw error;
        }
        approvedAssets.clear();
        customOpenDiagnostics = [];
        customCanEdit = true;
        state = opened.state;
        projectLocation = opened.location;
        return {
          project: currentProject(state),
          orphans: opened.orphans,
          ...(projectLocation ? { projectLocation } : {}),
        };
      }
      if (request.kind === "open-custom") {
        let opened;
        try {
          opened = await dependencies.openCustom();
        } catch (error) {
          if (error instanceof ProjectDialogCancelled) return { cancelled: true };
          throw error;
        }
        const nextDiagnostics = opened.diagnostics ?? [];
        const nextCanEdit = opened.canEdit !== false;
        let next: StudioResult;
        try {
          next = await customResult(
            opened.state,
            { orphans: opened.orphans, diagnostics: nextDiagnostics, canExport: false, canEdit: nextCanEdit },
            opened.customAuthoring,
          );
        } catch (error) {
          await opened.discard?.();
          throw error;
        }
        try {
          await opened.commit?.();
        } catch (error) {
          await opened.discard?.();
          throw error;
        }
        approvedAssets.clear();
        state = opened.state;
        customOpenDiagnostics = nextDiagnostics;
        customCanEdit = nextCanEdit;
        projectLocation = opened.location;
        return { ...next, ...(projectLocation ? { projectLocation } : {}) };
      }
      if (request.kind === "reveal-export") {
        if (!dependencies.revealExport) throw new Error("Export reveal is unavailable.");
        await dependencies.revealExport(request.revealId, request.target);
        return { revealed: true };
      }
      if (state?.formatVersion === 3 && !customCanEdit && request.kind !== "validate")
        return customResult(state, { diagnostics: customOpenDiagnostics, canExport: false, canEdit: false });
      if (request.kind === "import-png" || request.kind === "import-png-bytes") {
        const roleRequest = request.provenance.intendedUse.startsWith("Custom visual role: ");
        const intendedRole = visualRoleFromUseV3(request.provenance.intendedUse);
        if (roleRequest && !intendedRole) throw new Error("Unknown Custom visual role.");
        const asset = await dependencies.importPng(
          request.provenance,
          request.kind === "import-png-bytes"
            ? { originalName: request.originalName, sourceBytes: request.sourceBytes }
            : undefined,
        );
        approvedAssets.set(asset.sourceSha256, asset);
        if (state?.formatVersion === 3) {
          if (!asset.sourceBytes) throw new Error("Imported PNG source bytes are unavailable.");
          if (!intendedRole) return customResult(state, { asset });
          const source = createMediaRefV3(asset.sourceBytes, "image/png"),
            candidateWithMedia = applyOperationV3(state, {
              version: 3,
              type: "add-media",
              asset: {
                id: `visual:${intendedRole}`,
                media: source,
                role: intendedRole,
                provenance: asset.provenance,
                rightsToExport: asset.provenance.rightsToExport,
                recipe: { transform: "nearest-center-floor-v1" },
                referenceOnly: asset.referenceOnly,
              },
            });
          const candidate = confirmRolesV3(candidateWithMedia, { [intendedRole]: asset.sourceSha256 });
          await dependencies.saveCustom(candidate, {}, [{ sha256: asset.sourceSha256, bytes: asset.sourceBytes }]);
          state = candidate;
          return customResult(candidate, { asset });
        }
        return { asset };
      }
      if (request.kind === "prepare-wav") {
        const sound = prepareThemeSoundV1(request);
        if (state?.formatVersion !== 3) return { sound };
        const role = `${sound.role}-sound` as const;
        const candidate = applyOperationV3(state, {
          version: 3,
          type: "set-theme-sound",
          role,
          asset: {
            id: `wav:${sound.role}`,
            media: {
              sha256: sound.source.sha256,
              byteLength: sound.source.bytes.length,
              mediaType: "audio/wav",
              path: sound.source.path,
            },
            prepared: {
              sha256: sound.prepared.sha256,
              byteLength: sound.prepared.bytes.length,
              mediaType: "audio/wav",
              path: `assets/sha256/${sound.prepared.sha256}.wav`,
            },
            role,
            provenance: sound.source.provenance,
            rightsToExport: sound.source.provenance.rightsToExport,
            recipe: { wav: sound.recipe, audition: sound.audition },
          },
        });
        await dependencies.saveCustom(candidate, {}, [
          { sha256: sound.source.sha256, bytes: sound.source.bytes },
          { sha256: sound.prepared.sha256, bytes: sound.prepared.bytes },
        ]);
        state = candidate;
        return customResult(candidate, { sound });
      }
      if (request.kind === "remove-wav") {
        if (state?.formatVersion !== 3) throw new Error("Open or create a Custom project first.");
        const candidate = applyOperationV3(state, {
          version: 3,
          type: "set-theme-sound",
          role: `${request.role}-sound`,
        });
        await dependencies.saveCustom(candidate);
        state = candidate;
        return customResult(candidate);
      }
      if (!state) throw new Error("Open or create a project first");
      if (request.kind === "set-custom-launcher-layout") {
        if (state.formatVersion !== 3) throw new Error("Open or create a Custom project first.");
        if (request.expectedAuthoritySha256 !== customLauncherLayout(state).authoritySha256)
          return customResult(state, { customLauncherLayoutStatus: "conflict" });
        const candidate = applyOperationV3(state, request.operation);
        await dependencies.saveCustom(candidate);
        state = candidate;
        return customResult(candidate, { customLauncherLayoutStatus: "committed" });
      }
      if (
        request.kind === "export" &&
        request.target &&
        request.target !== (state.formatVersion === 3 ? "custom" : "material")
      )
        throw new Error("Publication target does not match the committed project kind.");
      if (request.kind === "handoff") {
        if (state.formatVersion !== 3 || !dependencies.handoffCustom)
          throw new Error("Cartridge-test handoff requires a Custom project.");
        return customResult(state, { handoff: await dependencies.handoffCustom(currentProjectV3(state)) });
      }
      if (
        request.kind === "edit" ||
        request.kind === "edit-custom" ||
        request.kind === "edit-visual-document" ||
        request.kind === "set-custom-metadata" ||
        request.kind === "undo" ||
        request.kind === "redo"
      ) {
        const v3 = state.formatVersion === 3;
        if (
          request.kind === "edit"
            ? v3
            : (request.kind === "edit-custom" || request.kind === "edit-visual-document") && !v3
        )
          throw new Error("Operation does not match project format");
        let operation =
          request.kind === "edit" || request.kind === "edit-custom" || request.kind === "edit-visual-document"
            ? request.operation
            : undefined;
        let imported: ImportedPngV1 | undefined;
        if (
          (request.kind === "edit-custom" || request.kind === "edit-visual-document") &&
          request.operation.type === "add-layer"
        ) {
          const approved = approvedAssets.get(request.operation.layer.asset.sha256);
          if (
            !approved ||
            approved.referenceOnly ||
            approved.width !== request.operation.layer.width ||
            approved.height !== request.operation.layer.height
          )
            throw new Error("Layer asset was not approved by the main process");
          const { pixels: _pixels, sourceBytes: _sourceBytes, ...assetRecord } = approved;
          void _pixels;
          void _sourceBytes;
          operation = { ...request.operation, assetRecord };
          imported = approved;
        }
        // prettier-ignore
        const candidate = request.kind === "edit"
          ? applyOperation(state as ProjectStateV1, operation as OperationV1)
          : request.kind === "edit-custom"
            ? (() => { const composition = applyOperationV2((currentProjectV3(state as ProjectStateV3).legacyComposition as ReturnType<typeof createProjectV2>), operation as OperationV2); return imported ? applyOperationV3(state as ProjectStateV3, { version: 3, type: "import-layer", asset: { id: `image:${imported.sourceSha256}`, media: createMediaRefV3(imported.sourceBytes!, "image/png"), provenance: imported.provenance, rightsToExport: imported.provenance.rightsToExport, referenceOnly: imported.referenceOnly }, composition }) : applyOperationV3(state as ProjectStateV3, { version: 3, type: "set-legacy-composition", composition }); })()
            : request.kind === "edit-visual-document"
              ? applyOperationV3(state as ProjectStateV3, imported ? { version: 3, type: "import-visual-layer", role: request.role, operation: operation as OperationV2, asset: { id: `image:${imported.sourceSha256}`, media: createMediaRefV3(imported.sourceBytes!, "image/png"), provenance: imported.provenance, rightsToExport: imported.provenance.rightsToExport, referenceOnly: imported.referenceOnly } } : { version: 3, type: "edit-visual-document", role: request.role, operation: operation as VisualDocumentOperationV3 })
            : request.kind === "set-custom-metadata"
              ? applyOperationV3(state as ProjectStateV3, { version: 3, type: "set-metadata", field: request.field, value: request.value })
            : request.kind === "undo"
              ? v3 ? { ...(state as ProjectStateV3), cursor: Math.max(0, state.cursor - 1), project: currentProjectV3({ ...(state as ProjectStateV3), cursor: Math.max(0, state.cursor - 1) }) } : undo(state as ProjectStateV1)
              : v3 ? { ...(state as ProjectStateV3), cursor: Math.min(state.operations.length, state.cursor + 1), project: currentProjectV3({ ...(state as ProjectStateV3), cursor: Math.min(state.operations.length, state.cursor + 1) }) } : redo(state as ProjectStateV1);
        if (candidate.formatVersion === 3)
          await dependencies.saveCustom(
            candidate,
            {},
            imported ? [{ sha256: imported.sourceSha256, bytes: imported.sourceBytes! }] : [],
          );
        else await dependencies.save(candidate);
        state = candidate;
      } else if (request.kind === "save") {
        if (state.formatVersion === 3) await dependencies.saveCustom(state);
        else await dependencies.save(state);
      }
      if (state.formatVersion === 3) {
        const customProject = currentProjectV3(state);
        if (request.kind === "validate" || request.kind === "export") {
          if (!customCanEdit)
            return customResult(state, { diagnostics: customOpenDiagnostics, canExport: false, canEdit: false });
          const validation = await dependencies.validateCustom(customProject);
          const diagnostics =
            validation.canExport || validation.diagnostics.length
              ? validation.diagnostics
              : [customExportBlockedDiagnostic()];
          if (request.kind === "export" && validation.canExport)
            return customResult(state, { ...validation, publication: await dependencies.exportCustom(customProject) });
          return customResult(state, { ...validation, diagnostics });
        }
        return customResult(state);
      }
      const project = currentProject(state);
      if (request.kind === "validate" || request.kind === "export") {
        const result = dependencies.validate(project);
        if (request.kind === "export" && result.canExport)
          return {
            ...result,
            project,
            publication: await dependencies.export(project),
            ...(projectLocation ? { projectLocation } : {}),
          };
        return { ...result, project, ...(projectLocation ? { projectLocation } : {}) };
      }
      return { project, ...(projectLocation ? { projectLocation } : {}) };
    });
  };
};
