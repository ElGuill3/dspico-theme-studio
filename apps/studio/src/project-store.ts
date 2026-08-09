import { constants, type BigIntStats } from "node:fs";
import { access, lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { openProject, saveProject, type ProjectStateV1 } from "../../../packages/theme-core/src/index.js";
import { ProjectRootAuthority } from "./project-root-authority.js";

export type StoreCheckpoint = "open-file-opened" | "temp-synced" | "journal-synced" | "committed";
export type RecoveryOrphan = "journal" | "temporary";

export interface LocalPathDialog {
  chooseProjectPath(mode: "open" | "save"): Promise<string | null>;
}

export interface LocalExportWriter {
  commit(destination: string, files: readonly { relativePath: string; bytes: Uint8Array }[]): Promise<void>;
}

export class PathContainmentError extends Error {
  constructor(candidate: string) {
    super(`Path escapes the selected project root: ${candidate}`);
    this.name = "PathContainmentError";
  }
}

type StoreOptions = { checkpoint?: (checkpoint: StoreCheckpoint) => void | Promise<void> };

const exists = async (candidate: string): Promise<boolean> => {
  try {
    await access(candidate);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

export class ProjectStore {
  private constructor(
    private readonly authority: ProjectRootAuthority,
    private readonly options: StoreOptions,
  ) {}

  static async openRoot(root: string, options: StoreOptions = {}): Promise<ProjectStore> {
    return new ProjectStore(await ProjectRootAuthority.capture(root), options);
  }

  static async openAuthority(authority: ProjectRootAuthority, options: StoreOptions = {}): Promise<ProjectStore> {
    await authority.assertCurrent();
    return new ProjectStore(authority, options);
  }

  private parts(candidate: string): string[] {
    if (path.isAbsolute(candidate) || candidate.includes("\\")) throw new PathContainmentError(candidate);
    const parts = candidate.split("/");
    if (parts.length === 0 || parts.some((part) => !part || part === "." || part === "..")) {
      throw new PathContainmentError(candidate);
    }
    return parts;
  }

  private async resolve(candidate: string, createParents: boolean): Promise<string> {
    await this.authority.assertCurrent();
    const parts = this.parts(candidate);
    let parent = this.authority.accessRoot;
    for (const part of parts.slice(0, -1)) {
      const next = path.join(parent, part);
      try {
        const stat = await lstat(next);
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw new PathContainmentError(candidate);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT" || !createParents) throw error;
        await mkdir(next);
      }
      const canonical = await realpath(next);
      if (canonical !== this.authority.root && !canonical.startsWith(`${this.authority.root}${path.sep}`)) {
        throw new PathContainmentError(candidate);
      }
      parent = canonical;
    }
    const target = path.join(parent, parts.at(-1)!);
    try {
      if ((await lstat(target)).isSymbolicLink()) throw new PathContainmentError(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return target;
  }

  async open(relativePath: string): Promise<{ state: ProjectStateV1; orphans: RecoveryOrphan[] }> {
    await this.authority.assertCurrent();
    const target = await this.resolve(relativePath, false);
    const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    let bytes: string;
    try {
      const before = await handle.stat({ bigint: true });
      if (!before.isFile() || before.nlink !== 1n) throw new PathContainmentError(relativePath);
      await this.options.checkpoint?.("open-file-opened");
      bytes = (await handle.readFile()).toString("utf8");
      const after = await handle.stat({ bigint: true });
      const entry = await lstat(target, { bigint: true });
      if (entry.isSymbolicLink() || !entry.isFile() || !sameFile(before, after) || !sameFile(after, entry))
        throw new PathContainmentError(relativePath);
    } finally {
      await handle.close();
    }
    await this.authority.assertCurrent();
    const state = openProject(bytes);
    const journal = await this.resolve(`${relativePath}.journal`, false);
    const temporary = await this.resolve(`${relativePath}.tmp`, false);
    const orphans: RecoveryOrphan[] = [];
    if (await exists(journal)) orphans.push("journal");
    if (await exists(temporary)) orphans.push("temporary");
    await this.authority.assertCurrent();
    return { state, orphans };
  }

  async save(relativePath: string, state: ProjectStateV1): Promise<void> {
    await this.authority.assertCurrent();
    const bytes = saveProject(state);
    const target = await this.resolve(relativePath, true);
    const temporary = await this.resolve(`${relativePath}.tmp`, false);
    const journal = await this.resolve(`${relativePath}.journal`, false);

    const temporaryFile = await open(temporary, "w", 0o600);
    try {
      await temporaryFile.writeFile(bytes, "utf8");
      await temporaryFile.sync();
    } finally {
      await temporaryFile.close();
    }
    await this.options.checkpoint?.("temp-synced");
    await this.authority.assertCurrent();

    const journalFile = await open(journal, "a", 0o600);
    try {
      await journalFile.writeFile(`${JSON.stringify({ version: 1, temporary: path.basename(temporary) })}\n`, "utf8");
      await journalFile.sync();
    } finally {
      await journalFile.close();
    }
    await this.options.checkpoint?.("journal-synced");
    await this.authority.assertCurrent();

    await rename(temporary, target);
    await this.syncDirectory(path.dirname(target));
    await unlink(journal);
    await this.syncDirectory(path.dirname(target));
    await this.options.checkpoint?.("committed");
    await this.authority.assertCurrent();
  }

  private async syncDirectory(directory: string): Promise<void> {
    const handle = await open(directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  close(): Promise<void> {
    return this.authority.close();
  }
}

const sameFile = (left: BigIntStats, right: BigIntStats) =>
  left.dev === right.dev &&
  left.ino === right.ino &&
  left.mode === right.mode &&
  left.nlink === right.nlink &&
  left.size === right.size &&
  left.mtimeNs === right.mtimeNs &&
  left.ctimeNs === right.ctimeNs;
