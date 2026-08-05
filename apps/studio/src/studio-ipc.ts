import Ajv from "ajv";
// prettier-ignore
import { OperationV1Schema, OperationV2Schema, applyOperation, applyOperationV2, createProject, createProjectV2, currentProject, currentProjectV2, redo, redoV2, undo, undoV2, type CommittedStateV2, type MaterialProjectV1, type OperationV1, type OperationV2, type ProjectStateV1, type ThemeProjectV2 } from "../../../packages/theme-core/src/index.js";
import type { DiagnosticV1 } from "../../../packages/dspico-contract/src/index.js";
import { STUDIO_CHANNEL, isTrustedStudioUrl } from "./security.js";
import type { AssetProvenanceV1, ImportedPngV1 } from "./png-import.js";
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
export type StudioRequest =
  | ({ kind: "create" } & CreateInput)
  | ({ kind: "create-custom" } & CreateInput)
  | { kind: "open-custom" }
  | { kind: "import-png"; provenance: PngImportInput }
  | { kind: "open" | "save" | "undo" | "redo" | "validate" | "export" }
  | { kind: "edit"; operation: OperationV1 }
  | { kind: "edit-custom"; operation: OperationV2 };
export type StudioResult = {
  project?: MaterialProjectV1;
  customProject?: ThemeProjectV2;
  asset?: ImportedPngV1;
  diagnostics?: DiagnosticV1[];
  canExport?: boolean;
  orphans?: string[];
  receipt?: { destination: string; files: string[]; reportSha256: string; zipSha256: string };
};
// prettier-ignore
export interface StudioApi { create(input: CreateInput): Promise<StudioResult>; createCustom(input: CreateInput): Promise<StudioResult>; importPng(input: PngImportInput): Promise<StudioResult>; open(): Promise<StudioResult>; openCustom(): Promise<StudioResult>; save(): Promise<StudioResult>; edit(operation: OperationV1): Promise<StudioResult>; editCustom(operation: OperationV2): Promise<StudioResult>; undo(): Promise<StudioResult>; redo(): Promise<StudioResult>; validate(): Promise<StudioResult>; export(): Promise<StudioResult>; }
// prettier-ignore
export interface StudioDependencies { importPng(input: PngImportInput): Promise<ImportedPngV1>; open(): Promise<{ state: ProjectStateV1; orphans: string[] }>; openCustom(): Promise<{ state: CommittedStateV2; orphans: string[] }>; save(state: ProjectStateV1, options?: { newProject?: boolean }): Promise<void>; saveCustom(state: CommittedStateV2, options?: { newProject?: boolean }): Promise<void>; validate(project: MaterialProjectV1): { diagnostics: DiagnosticV1[]; canExport: boolean }; validateCustom(project: ThemeProjectV2): { diagnostics: DiagnosticV1[]; canExport: boolean }; export(project: MaterialProjectV1): Promise<{ destination: string; files: string[]; reportSha256: string; zipSha256: string }>; exportCustom(project: ThemeProjectV2): Promise<{ destination: string; files: string[]; reportSha256: string; zipSha256: string }>; }

type Invoke = (channel: string, request: StudioRequest) => Promise<StudioResult>;
export const createStudioApi = (invoke: Invoke): StudioApi => {
  const call = (request: StudioRequest) => invoke(STUDIO_CHANNEL, request);
  // prettier-ignore
  const api: StudioApi = { create: (input) => call({ kind: "create", ...input }), createCustom: (input) => call({ kind: "create-custom", ...input }), importPng: (provenance) => call({ kind: "import-png", provenance }), open: () => call({ kind: "open" }), openCustom: () => call({ kind: "open-custom" }), save: () => call({ kind: "save" }), edit: (operation) => call({ kind: "edit", operation }), editCustom: (operation) => call({ kind: "edit-custom", operation }), undo: () => call({ kind: "undo" }), redo: () => call({ kind: "redo" }), validate: () => call({ kind: "validate" }), export: () => call({ kind: "export" }) };
  return Object.freeze(api);
};

const validateOperation = new Ajv({ strict: true }).compile(OperationV1Schema);
const validateOperationV2 = new Ajv({ strict: true }).compile(OperationV2Schema);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const parseRequest = (input: unknown): StudioRequest => {
  if (!input || typeof input !== "object") throw new TypeError("Invalid IPC payload");
  const value = input as Record<string, unknown>;
  if (value.kind === "create" || value.kind === "create-custom") {
    const metadata = value.metadata as Record<string, unknown> | undefined;
    // prettier-ignore
    if (!exactKeys(value, ["kind", "projectId", "metadata"]) || typeof value.projectId !== "string" || !value.projectId || !metadata || !exactKeys(metadata, ["name", "description", "author"]) ||
      [metadata.name, metadata.description, metadata.author].some((field) => typeof field !== "string"))
      throw new TypeError("Invalid IPC payload");
  } else if (value.kind === "import-png") {
    const provenance = value.provenance as Record<string, unknown> | undefined;
    // prettier-ignore
    if (!exactKeys(value, ["kind", "provenance"]) || !provenance || !exactKeys(provenance, ["source", "author", "credit", "license", "terms", "notice", "intendedUse", "rightsToExport"]) ||
      [provenance.source, provenance.author, provenance.credit, provenance.license, provenance.terms, provenance.notice, provenance.intendedUse].some((field) => typeof field !== "string") || typeof provenance.rightsToExport !== "boolean" || /^(?:[a-z]:[\\/]|[\\/]|file:)/i.test((provenance.source as string).trim()))
      throw new TypeError("Invalid IPC payload");
  } else if (value.kind === "edit" || value.kind === "edit-custom") {
    if (
      !exactKeys(value, ["kind", "operation"]) ||
      !(value.kind === "edit" ? validateOperation : validateOperationV2)(value.operation)
    )
      throw new TypeError("Invalid IPC payload");
  } else if (
    !["open", "open-custom", "save", "undo", "redo", "validate", "export"].includes(String(value.kind)) ||
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
  let state: ProjectStateV1 | CommittedStateV2 | undefined;
  const approvedAssets = new Map<string, ImportedPngV1>();
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
      if (request.kind === "create") {
        const candidate = createProject({ ...request, targetProfileId: "dspico-launcher-v1" });
        await dependencies.save(candidate, { newProject: true });
        state = candidate;
        return { project: currentProject(state) };
      }
      if (request.kind === "create-custom") {
        const candidate = createProjectV2({
          projectId: request.projectId,
          metadata: request.metadata,
          themeKind: "custom",
        });
        await dependencies.saveCustom(candidate, { newProject: true });
        state = candidate;
        return { customProject: candidate.project };
      }
      if (request.kind === "open") {
        const opened = await dependencies.open();
        state = opened.state;
        return { project: currentProject(state), orphans: opened.orphans };
      }
      if (request.kind === "open-custom") {
        const opened = await dependencies.openCustom();
        state = opened.state;
        return { customProject: opened.state.project, orphans: opened.orphans };
      }
      if (request.kind === "import-png") {
        const asset = await dependencies.importPng(request.provenance);
        approvedAssets.set(asset.sourceSha256, asset);
        return { asset };
      }
      if (!state) throw new Error("Open or create a project first");
      if (
        request.kind === "edit" ||
        request.kind === "edit-custom" ||
        request.kind === "undo" ||
        request.kind === "redo"
      ) {
        const v2 = state.formatVersion === 2;
        if ((request.kind === "edit-custom") !== v2 && (request.kind === "edit" || request.kind === "edit-custom"))
          throw new Error("Operation does not match project format");
        let operation = request.kind === "edit" || request.kind === "edit-custom" ? request.operation : undefined;
        if (request.kind === "edit-custom" && request.operation.type === "add-layer") {
          const approved = approvedAssets.get(request.operation.layer.asset.sha256);
          if (
            !approved ||
            approved.referenceOnly ||
            approved.width !== request.operation.layer.width ||
            approved.height !== request.operation.layer.height
          )
            throw new Error("Layer asset was not approved by the main process");
          const { pixels: _pixels, ...assetRecord } = approved;
          void _pixels;
          operation = { ...request.operation, assetRecord };
        }
        // prettier-ignore
        const candidate = request.kind === "edit" ? applyOperation(state as ProjectStateV1, operation as OperationV1) : request.kind === "edit-custom" ? applyOperationV2(state as CommittedStateV2, operation as OperationV2) : request.kind === "undo" ? v2 ? undoV2(state as CommittedStateV2) : undo(state as ProjectStateV1) : v2 ? redoV2(state as CommittedStateV2) : redo(state as ProjectStateV1);
        if (candidate.formatVersion === 2) await dependencies.saveCustom(candidate);
        else await dependencies.save(candidate);
        state = candidate;
      } else if (request.kind === "save") {
        if (state.formatVersion === 2) await dependencies.saveCustom(state);
        else await dependencies.save(state);
      }
      if (state.formatVersion === 2) {
        const customProject = currentProjectV2(state);
        if (request.kind === "export")
          return {
            ...dependencies.validateCustom(customProject),
            customProject,
            receipt: await dependencies.exportCustom(customProject),
          };
        if (request.kind === "validate") return { ...dependencies.validateCustom(customProject), customProject };
        return { customProject };
      }
      const project = currentProject(state);
      if (request.kind === "validate" || request.kind === "export") {
        const result = dependencies.validate(project);
        if (request.kind === "export" && result.canExport)
          return { ...result, project, receipt: await dependencies.export(project) };
        return { ...result, project };
      }
      return { project };
    });
  };
};
