import { contextBridge, ipcRenderer } from "electron";
import type { StudioApi, StudioRequest } from "./studio-ipc.js";

const call = (request: StudioRequest) => ipcRenderer.invoke("studio:command", request);
const api: StudioApi = {
  create: (input) => call({ kind: "create", ...input }),
  createCustom: (input) => call({ kind: "create-custom", ...input }),
  importPng: (provenance) => call({ kind: "import-png", provenance }),
  open: () => call({ kind: "open" }),
  openCustom: () => call({ kind: "open-custom" }),
  save: () => call({ kind: "save" }),
  edit: (operation) => call({ kind: "edit", operation }),
  editCustom: (operation) => call({ kind: "edit-custom", operation }),
  undo: () => call({ kind: "undo" }),
  redo: () => call({ kind: "redo" }),
  validate: () => call({ kind: "validate" }),
  export: () => call({ kind: "export" }),
};
contextBridge.exposeInMainWorld("studio", Object.freeze(api));
