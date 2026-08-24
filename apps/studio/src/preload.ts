import { contextBridge, ipcRenderer } from "electron";
import type { StudioApi, StudioRequest } from "./studio-ipc.js";

const LIFECYCLE_CHANNEL = "studio:lifecycle";
const DRAFT_STATE_CHANNEL = "studio:draft-state";
const CLOSE_DECISION_CHANNEL = "studio:close-decision";

const call = (request: StudioRequest) => ipcRenderer.invoke("studio:command", request);
const api: StudioApi = {
  create: (input) => call({ kind: "create", ...input }),
  createCustom: (input) => call({ kind: "create-custom", ...input }),
  importPng: (provenance) => call({ kind: "import-png", provenance }),
  importPngBytes: ({ originalName, sourceBytes, ...provenance }) =>
    call({ kind: "import-png-bytes", provenance, originalName, sourceBytes }),
  prepareWav: (input) => call({ kind: "prepare-wav", ...input }),
  removeWav: (role) => call({ kind: "remove-wav", role }),
  openProject: () => call({ kind: "open-project" }),
  restoreProject: () => call({ kind: "restore-project" }),
  restorePreMigrationV3: () => call({ kind: "restore-pre-migration-v3" }),
  open: () => call({ kind: "open" }),
  openCustom: () => call({ kind: "open-custom" }),
  save: () => call({ kind: "save" }),
  edit: (operation) => call({ kind: "edit", operation }),
  editCustom: (operation) => call({ kind: "edit-custom", operation }),
  setCustomMetadata: (field, value) => call({ kind: "set-custom-metadata", field, value }),
  setCustomLauncherLayout: (expectedAuthoritySha256, operation) =>
    call({ kind: "set-custom-launcher-layout", expectedAuthoritySha256, operation }),
  editVisualDocument: (role, operation) => call({ kind: "edit-visual-document", role, operation }),
  undo: () => call({ kind: "undo" }),
  redo: () => call({ kind: "redo" }),
  validate: () => call({ kind: "validate" }),
  export: (target) => (target ? call({ kind: "export", target }) : call({ kind: "export" })),
  revealExport: (revealId, target) => call({ kind: "reveal-export", revealId, target }),
  handoff: () => call({ kind: "handoff" }),
  setDraftDirty: (dirty) => ipcRenderer.send(DRAFT_STATE_CHANNEL, dirty),
  closeDraftDecision: (acknowledgement) => ipcRenderer.send(CLOSE_DECISION_CHANNEL, acknowledgement),
  requestClose: (draftDirty = false) => ipcRenderer.send(LIFECYCLE_CHANNEL, { type: "close", draftDirty }),
  reloadEditor: (reopenProject = false) => ipcRenderer.send(LIFECYCLE_CHANNEL, { type: "reload", reopenProject }),
  onPrepareClose: (listener) => {
    const handler = () => listener();
    ipcRenderer.on(LIFECYCLE_CHANNEL, handler);
    return () => ipcRenderer.removeListener(LIFECYCLE_CHANNEL, handler);
  },
};
contextBridge.exposeInMainWorld("studio", Object.freeze(api));
