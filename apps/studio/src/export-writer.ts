import { access, lstat, mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";

export type ExportCheckpoint = "staged" | "verified" | "folder-swapped" | "swapped";
type Options = { checkpoint?: (checkpoint: ExportCheckpoint) => void | Promise<void> };
type ExportFile = { path: string; bytes: Uint8Array };

export class ExportPathError extends Error {
  constructor(candidate: string) {
    super(`Export path escapes the selected destination: ${candidate}`);
    this.name = "ExportPathError";
  }
}

const exists = async (candidate: string): Promise<boolean> => {
  try {
    await access(candidate);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

const equal = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

export class AtomicExportWriter {
  private constructor(
    private readonly root: string,
    private readonly options: Options,
  ) {}

  static async openRoot(root: string, options: Options = {}): Promise<AtomicExportWriter> {
    return new AtomicExportWriter(await realpath(root), options);
  }

  private parts(candidate: string): string[] {
    if (!candidate || path.isAbsolute(candidate) || candidate.includes("\\")) throw new ExportPathError(candidate);
    const parts = candidate.split("/");
    if (parts.some((part) => !part || part === "." || part === "..")) throw new ExportPathError(candidate);
    return parts;
  }

  private async destination(candidate: string): Promise<string> {
    const parts = this.parts(candidate);
    let parent = this.root;
    for (const part of parts.slice(0, -1)) {
      const next = path.join(parent, part);
      const stat = await lstat(next).catch(() => undefined);
      if (!stat?.isDirectory() || stat.isSymbolicLink()) throw new ExportPathError(candidate);
      parent = await realpath(next);
      if (!parent.startsWith(`${this.root}${path.sep}`)) throw new ExportPathError(candidate);
    }
    const target = path.join(parent, parts.at(-1)!);
    const stat = await lstat(target).catch(() => undefined);
    if (stat?.isSymbolicLink()) throw new ExportPathError(candidate);
    return target;
  }

  private async cleanSidecar(candidate: string): Promise<void> {
    const stat = await lstat(candidate).catch(() => undefined);
    if (stat?.isSymbolicLink()) throw new ExportPathError(path.basename(candidate));
    if (stat) await rm(candidate, { recursive: true, force: true });
  }

  private async syncRoot(): Promise<void> {
    const handle = await open(this.root, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async commitBundle(
    folderDestination: string,
    files: readonly ExportFile[],
    zipDestination: string,
    zipBytes: Uint8Array,
  ): Promise<void> {
    const targets = [await this.destination(folderDestination), await this.destination(zipDestination)];
    const stages = targets.map((target) => `${target}.staging`);
    const backups = targets.map((target) => `${target}.previous`);
    for (const sidecar of [...stages, ...backups]) await this.cleanSidecar(sidecar);
    await mkdir(stages[0]!);
    for (const file of files) {
      const parts = this.parts(file.path);
      const output = path.join(stages[0]!, ...parts);
      await mkdir(path.dirname(output), { recursive: true });
      const handle = await open(output, "wx", 0o600);
      try {
        await handle.writeFile(file.bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
    const zip = await open(stages[1]!, "wx", 0o600);
    try {
      await zip.writeFile(zipBytes);
      await zip.sync();
    } finally {
      await zip.close();
    }
    await this.options.checkpoint?.("staged");
    for (const file of files) {
      const actual = await readFile(path.join(stages[0]!, ...this.parts(file.path)));
      if (!equal(actual, file.bytes)) throw new Error(`Staged export verification failed: ${file.path}`);
    }
    if (!equal(await readFile(stages[1]!), zipBytes)) throw new Error("Staged ZIP verification failed");
    await this.options.checkpoint?.("verified");
    const existed = await Promise.all(targets.map(exists));
    const moved = [false, false];
    try {
      for (let index = 0; index < targets.length; index++)
        if (existed[index]) {
          await rename(targets[index]!, backups[index]!);
          moved[index] = true;
        }
      await rename(stages[0]!, targets[0]!);
      await this.options.checkpoint?.("folder-swapped");
      await rename(stages[1]!, targets[1]!);
      await this.syncRoot();
      await this.options.checkpoint?.("swapped");
    } catch (error) {
      for (let index = 0; index < targets.length; index++)
        if (moved[index] || !existed[index]) await rm(targets[index]!, { recursive: true, force: true });
      for (let index = 0; index < backups.length; index++)
        if (moved[index]) await rename(backups[index]!, targets[index]!);
      await this.syncRoot();
      throw error;
    }
    for (let index = 0; index < backups.length; index++)
      if (existed[index]) await rm(backups[index]!, { recursive: true }).catch(() => undefined);
  }
}
