import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import {
  openProject,
  openProjectV3,
  type ProjectStateV1,
  type ProjectStateV3,
} from "../../../packages/theme-core/src/index.js";
import { ProjectRootAuthority, ProjectRootChangedError, type ProjectRootCheckpoint } from "./project-root-authority.js";

export class ProjectFolderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectFolderError";
  }
}

export class ProjectDialogCancelled extends Error {
  constructor() {
    super("Project selection cancelled");
    this.name = "ProjectDialogCancelled";
  }
}

type Options = { checkpoint?: (checkpoint: ProjectRootCheckpoint) => void | Promise<void> };
const message = (error: unknown): never => {
  if (error instanceof ProjectFolderError) throw error;
  if (error instanceof ProjectRootChangedError) throw new ProjectFolderError(error.message);
  throw error;
};

export const prepareNewProjectFolder = async (
  selected: string,
  options: Options = {},
): Promise<{ root: string; label: string; authority: ProjectRootAuthority }> => {
  let authority: ProjectRootAuthority | undefined;
  try {
    authority = await ProjectRootAuthority.capture(selected, options);
    if ((await readdir(authority.accessRoot)).length)
      throw new ProjectFolderError(
        "The selected folder is not empty. Choose or create an empty folder; no files were changed.",
      );
    await authority.assertCurrent();
    return { root: authority.root, label: path.basename(authority.root), authority };
  } catch (error) {
    await authority?.close();
    return message(error);
  }
};

export type OpenedProjectFolder =
  | { type: "material"; root: string; label: string; state: ProjectStateV1; authority: ProjectRootAuthority }
  | { type: "custom"; root: string; label: string; state: ProjectStateV3; authority: ProjectRootAuthority };

export const openProjectFolder = async (selected: string, options: Options = {}): Promise<OpenedProjectFolder> => {
  const selectedStat = await lstat(selected).catch(() => undefined);
  if (!selectedStat) throw new ProjectFolderError("The selected project no longer exists. Choose it again.");
  if (selectedStat.isSymbolicLink())
    throw new ProjectFolderError("The selected project is a symbolic link. Choose a regular project folder.");
  let root: string;
  if (selectedStat.isDirectory()) root = selected;
  else {
    if (!selectedStat.isFile() || path.basename(selected) !== "project.json")
      throw new ProjectFolderError("Choose a project folder or its canonical project.json file.");
    root = path.dirname(selected);
  }
  let authority: ProjectRootAuthority | undefined;
  let bytes: string;
  try {
    authority = await ProjectRootAuthority.capture(root, options);
    bytes = await authority.readProjectJson();
  } catch (error) {
    await authority?.close();
    return message(error);
  }
  let parsed: { formatVersion?: unknown };
  try {
    parsed = JSON.parse(bytes) as { formatVersion?: unknown };
  } catch {
    await authority.close();
    throw new ProjectFolderError("project.json is not valid JSON. Restore a valid project file and try again.");
  }
  try {
    if (parsed.formatVersion === 3)
      return {
        type: "custom",
        root: authority.root,
        label: path.basename(authority.root),
        state: openProjectV3(bytes),
        authority,
      };
    if (parsed.formatVersion === 1)
      return {
        type: "material",
        root: authority.root,
        label: path.basename(authority.root),
        state: openProject(bytes),
        authority,
      };
  } catch (error) {
    await authority.close();
    const message = error instanceof Error ? error.message : "Project validation failed.";
    throw new ProjectFolderError(`project.json has a recognized version but invalid content. ${message}`);
  }
  await authority.close();
  throw new ProjectFolderError(
    "project.json is not a supported Material or Custom project. Open a project created by this Studio version.",
  );
};
