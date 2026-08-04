import Ajv from "ajv";
// prettier-ignore
import { OperationV1Schema, applyOperation, createProject, currentProject, redo, undo, type MaterialProjectV1, type OperationV1, type ProjectStateV1 } from "../../../packages/theme-core/src/index.js";
import type { DiagnosticV1 } from "../../../packages/dspico-contract/src/index.js";
import { STUDIO_CHANNEL, isTrustedStudioUrl } from "./security.js";
export {
  STUDIO_CHANNEL,
  WINDOW_SECURITY,
  isStudioUrl,
  isTrustedStudioUrl,
  selectStudioRendererUrl,
} from "./security.js";

type Metadata = MaterialProjectV1["metadata"];
type CreateInput = { projectId: string; metadata: Metadata };
export type StudioRequest =
  | ({ kind: "create" } & CreateInput)
  | { kind: "open" | "save" | "undo" | "redo" | "validate" | "export" }
  | { kind: "edit"; operation: OperationV1 };
export type StudioResult = {
  project?: MaterialProjectV1;
  diagnostics?: DiagnosticV1[];
  canExport?: boolean;
  orphans?: string[];
  receipt?: { destination: string; files: string[]; reportSha256: string; zipSha256: string };
};
// prettier-ignore
export interface StudioApi { create(input: CreateInput): Promise<StudioResult>; open(): Promise<StudioResult>; save(): Promise<StudioResult>; edit(operation: OperationV1): Promise<StudioResult>; undo(): Promise<StudioResult>; redo(): Promise<StudioResult>; validate(): Promise<StudioResult>; export(): Promise<StudioResult>; }
// prettier-ignore
export interface StudioDependencies { open(): Promise<{ state: ProjectStateV1; orphans: string[] }>; save(state: ProjectStateV1, options?: { newProject?: boolean }): Promise<void>; validate(project: MaterialProjectV1): { diagnostics: DiagnosticV1[]; canExport: boolean }; export(project: MaterialProjectV1): Promise<{ destination: string; files: string[]; reportSha256: string; zipSha256: string }>; }

type Invoke = (channel: string, request: StudioRequest) => Promise<StudioResult>;
export const createStudioApi = (invoke: Invoke): StudioApi => {
  const call = (request: StudioRequest) => invoke(STUDIO_CHANNEL, request);
  // prettier-ignore
  const api: StudioApi = { create: (input) => call({ kind: "create", ...input }), open: () => call({ kind: "open" }), save: () => call({ kind: "save" }), edit: (operation) => call({ kind: "edit", operation }), undo: () => call({ kind: "undo" }), redo: () => call({ kind: "redo" }), validate: () => call({ kind: "validate" }), export: () => call({ kind: "export" }) };
  return Object.freeze(api);
};

const validateOperation = new Ajv({ strict: true }).compile(OperationV1Schema);
const parseRequest = (input: unknown): StudioRequest => {
  if (!input || typeof input !== "object") throw new TypeError("Invalid IPC payload");
  const value = input as Record<string, unknown>;
  if (value.kind === "create") {
    const metadata = value.metadata as Record<string, unknown> | undefined;
    // prettier-ignore
    if (typeof value.projectId !== "string" || !value.projectId || !metadata ||
      [metadata.name, metadata.description, metadata.author].some((field) => typeof field !== "string"))
      throw new TypeError("Invalid IPC payload");
  } else if (value.kind === "edit") {
    if (!validateOperation(value.operation)) throw new TypeError("Invalid IPC payload");
  } else if (!["open", "save", "undo", "redo", "validate", "export"].includes(String(value.kind))) {
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
  let state: ProjectStateV1 | undefined;
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
      if (request.kind === "open") {
        const opened = await dependencies.open();
        state = opened.state;
        return { project: currentProject(state), orphans: opened.orphans };
      }
      if (!state) throw new Error("Open or create a project first");
      if (request.kind === "edit" || request.kind === "undo" || request.kind === "redo") {
        const candidate =
          request.kind === "edit"
            ? applyOperation(state, request.operation)
            : request.kind === "undo"
              ? undo(state)
              : redo(state);
        await dependencies.save(candidate);
        state = candidate;
      } else if (request.kind === "save") {
        await dependencies.save(state);
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
