import { contextBridge, ipcRenderer } from "electron";
import type { StudioApi, StudioRequest } from "./studio-ipc.js";

const call = (request: StudioRequest) => ipcRenderer.invoke("studio:command", request);
const api: StudioApi = {
  create: (input) => call({ kind: "create", ...input }),
  open: () => call({ kind: "open" }),
  save: () => call({ kind: "save" }),
  edit: (operation) => call({ kind: "edit", operation }),
  undo: () => call({ kind: "undo" }),
  redo: () => call({ kind: "redo" }),
  validate: () => call({ kind: "validate" }),
  export: () => call({ kind: "export" }),
};
contextBridge.exposeInMainWorld("studio", Object.freeze(api));
