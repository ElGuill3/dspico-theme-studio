import { constants, type BigIntStats } from "node:fs";
import { lstat, open, readdir, realpath, type FileHandle } from "node:fs/promises";
import path from "node:path";

export type ProjectRootIdentity = {
  path: string;
  device: string;
  inode: string;
  mode: string;
};
export type ProjectRootCheckpoint =
  | "root-captured"
  | "create-empty-checked"
  | "create-project-opened"
  | "create-project-written"
  | "project-open-pending"
  | "project-file-opened"
  | "project-file-read";
type Options = { checkpoint?: (checkpoint: ProjectRootCheckpoint) => void | Promise<void> };

export class ProjectRootChangedError extends Error {
  constructor(
    message = "The selected project folder changed. Choose it again; no existing files were overwritten or deleted.",
  ) {
    super(message);
    this.name = "ProjectRootChangedError";
  }
}

const rootIdentity = (candidate: string, stat: BigIntStats): ProjectRootIdentity => ({
  path: candidate,
  device: String(stat.dev),
  inode: String(stat.ino),
  mode: String(stat.mode),
});
const sameRoot = (left: ProjectRootIdentity, right: ProjectRootIdentity) =>
  left.path === right.path && left.device === right.device && left.inode === right.inode && left.mode === right.mode;
const sameFile = (left: BigIntStats, right: BigIntStats) =>
  left.dev === right.dev &&
  left.ino === right.ino &&
  left.mode === right.mode &&
  left.nlink === right.nlink &&
  left.size === right.size &&
  left.mtimeNs === right.mtimeNs &&
  left.ctimeNs === right.ctimeNs;

export class ProjectRootAuthority {
  readonly root: string;
  readonly accessRoot: string;
  readonly identity: ProjectRootIdentity;

  private constructor(
    root: string,
    identity: ProjectRootIdentity,
    private readonly handle: FileHandle,
    private readonly options: Options,
  ) {
    this.root = root;
    this.identity = identity;
    this.accessRoot = process.platform === "linux" ? `/proc/self/fd/${handle.fd}` : root;
  }

  static async capture(candidate: string, options: Options = {}): Promise<ProjectRootAuthority> {
    const selected = await lstat(candidate, { bigint: true }).catch(() => undefined);
    if (!selected) throw new ProjectRootChangedError("The selected project folder no longer exists. Choose it again.");
    if (selected.isSymbolicLink() || !selected.isDirectory())
      throw new ProjectRootChangedError("Choose a regular local project folder, not a symbolic link or file.");
    const root = await realpath(candidate);
    const canonical = await lstat(root, { bigint: true });
    if (!canonical.isDirectory()) throw new ProjectRootChangedError();
    const handle = await open(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const held = await handle.stat({ bigint: true });
    const identity = rootIdentity(root, canonical);
    if (!sameRoot(identity, rootIdentity(root, held))) {
      await handle.close();
      throw new ProjectRootChangedError();
    }
    const authority = new ProjectRootAuthority(root, identity, handle, options);
    await options.checkpoint?.("root-captured");
    await authority.assertCurrent();
    return authority;
  }

  async assertCurrent(expected: ProjectRootIdentity = this.identity): Promise<void> {
    try {
      const current = await lstat(expected.path, { bigint: true });
      const canonical = await realpath(expected.path);
      const held = await this.handle.stat({ bigint: true });
      if (
        current.isSymbolicLink() ||
        !current.isDirectory() ||
        canonical !== expected.path ||
        !sameRoot(expected, rootIdentity(expected.path, current)) ||
        !sameRoot(expected, rootIdentity(expected.path, held))
      )
        throw new ProjectRootChangedError();
    } catch (error) {
      if (error instanceof ProjectRootChangedError) throw error;
      throw new ProjectRootChangedError();
    }
  }

  async readProjectJson(): Promise<string> {
    await this.assertCurrent();
    await this.options.checkpoint?.("project-open-pending");
    await this.assertCurrent();
    const candidate = path.join(this.accessRoot, "project.json");
    const entryBeforeOpen = await lstat(candidate, { bigint: true }).catch(() => undefined);
    if (entryBeforeOpen && (entryBeforeOpen.isSymbolicLink() || !entryBeforeOpen.isFile()))
      throw new ProjectRootChangedError("project.json must be one regular file inside the selected folder.");
    const handle = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => undefined);
    if (!handle) throw new ProjectRootChangedError("project.json is missing or unsafe. Restore it and try again.");
    try {
      const before = await handle.stat({ bigint: true });
      if (!before.isFile() || before.nlink !== 1n)
        throw new ProjectRootChangedError("project.json must be one regular file inside the selected folder.");
      await this.options.checkpoint?.("project-file-opened");
      const bytes = await handle.readFile();
      const after = await handle.stat({ bigint: true });
      const entry = await lstat(candidate, { bigint: true }).catch(() => undefined);
      if (!entry || entry.isSymbolicLink() || !entry.isFile() || !sameFile(before, after) || !sameFile(after, entry))
        throw new ProjectRootChangedError("project.json changed while it was being opened. No project was loaded.");
      await this.options.checkpoint?.("project-file-read");
      await this.assertCurrent();
      return bytes.toString("utf8");
    } finally {
      await handle.close();
    }
  }

  async claimProjectJson(bytes: Uint8Array): Promise<void> {
    await this.assertCurrent();
    if ((await readdir(this.accessRoot)).length)
      throw new ProjectRootChangedError(
        "The selected folder is not empty. Choose or create an empty folder; no files were changed.",
      );
    await this.options.checkpoint?.("create-empty-checked");
    await this.assertCurrent();
    const candidate = path.join(this.accessRoot, "project.json");
    const handle = await open(
      candidate,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    ).catch(() => undefined);
    if (!handle)
      throw new ProjectRootChangedError("The project folder was claimed by another file. Choose a new empty folder.");
    try {
      await this.options.checkpoint?.("create-project-opened");
      await handle.writeFile(bytes);
      await handle.sync();
      const identity = await handle.stat({ bigint: true });
      if (!identity.isFile() || identity.nlink !== 1n) throw new ProjectRootChangedError();
    } finally {
      await handle.close();
    }
    await this.options.checkpoint?.("create-project-written");
    const entries = (await readdir(this.accessRoot)).sort();
    if (entries.length !== 1 || entries[0] !== "project.json")
      throw new ProjectRootChangedError(
        "Another entry appeared while the project was being created. Nothing was deleted.",
      );
    await this.assertCurrent();
    const directory = await open(this.accessRoot, constants.O_RDONLY | constants.O_DIRECTORY);
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    await this.assertCurrent();
  }

  path(...parts: string[]): string {
    return path.join(this.accessRoot, ...parts);
  }

  matches(identity: ProjectRootIdentity): boolean {
    return sameRoot(this.identity, identity);
  }

  close(): Promise<void> {
    return this.handle.close();
  }
}
