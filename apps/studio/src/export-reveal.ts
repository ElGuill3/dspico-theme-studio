import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

type Identity = { path: string; device: string; inode: string; mode: string };
type TargetIdentity = Identity & { type: "folder" | "zip"; fingerprint: string };
type CurrentExport = {
  id: string;
  root: Identity;
  folder: TargetIdentity;
  zip: TargetIdentity;
};
export type ExportRevealPublication = {
  id: string;
  destination: string;
  folderName: "theme";
  zipName: "theme.zip";
};

const digest = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const identity = (candidate: string, stat: Awaited<ReturnType<typeof lstat>>): Identity => ({
  path: candidate,
  device: String(stat.dev),
  inode: String(stat.ino),
  mode: String(stat.mode),
});
const sameIdentity = (left: Identity, right: Identity) =>
  left.path === right.path && left.device === right.device && left.inode === right.inode && left.mode === right.mode;

const rootIdentity = async (candidate: string): Promise<Identity> => {
  const selected = await lstat(candidate);
  if (selected.isSymbolicLink() || !selected.isDirectory())
    throw new Error("The export destination is no longer safe.");
  const canonical = await realpath(candidate);
  if (canonical !== candidate) throw new Error("The export destination identity changed.");
  return identity(canonical, selected);
};

const folderFingerprint = async (root: string): Promise<string> => {
  const entries: [string, string][] = [];
  const visit = async (directory: string, relative: string): Promise<void> => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const candidate = path.join(directory, entry.name);
      const item = await lstat(candidate);
      const itemRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (item.isSymbolicLink()) throw new Error("An exported path became a symbolic link.");
      if (item.isDirectory()) await visit(candidate, itemRelative);
      else if (item.isFile() && item.nlink === 1) entries.push([itemRelative, digest(await readFile(candidate))]);
      else throw new Error("An exported path is no longer a regular file.");
    }
  };
  await visit(root, "");
  return digest(JSON.stringify(entries));
};

const targetIdentity = async (candidate: string, type: "folder" | "zip"): Promise<TargetIdentity> => {
  const before = await lstat(candidate);
  if (before.isSymbolicLink() || (type === "folder" ? !before.isDirectory() : !before.isFile() || before.nlink !== 1))
    throw new Error(`The exported ${type} is missing or unsafe.`);
  const fingerprint = type === "folder" ? await folderFingerprint(candidate) : digest(await readFile(candidate));
  const after = await lstat(candidate);
  const beforeIdentity = identity(candidate, before);
  const afterIdentity = identity(candidate, after);
  if (!sameIdentity(beforeIdentity, afterIdentity)) throw new Error(`The exported ${type} changed during validation.`);
  return { ...afterIdentity, type, fingerprint };
};

export class ExportRevealCapability {
  private current: CurrentExport | undefined;

  constructor(private readonly showItem: (candidate: string) => void | Promise<void>) {}

  clear(): void {
    this.current = undefined;
  }

  async publish(destination: string): Promise<ExportRevealPublication> {
    const canonical = await realpath(destination);
    const root = await rootIdentity(canonical);
    const folder = await targetIdentity(path.join(canonical, "theme"), "folder");
    const zip = await targetIdentity(path.join(canonical, "theme.zip"), "zip");
    if (!sameIdentity(root, await rootIdentity(canonical)))
      throw new Error("The export destination changed after publication.");
    const id = randomUUID();
    this.current = { id, root, folder, zip };
    return { id, destination: canonical, folderName: "theme", zipName: "theme.zip" };
  }

  async reveal(id: string, target: "folder" | "zip"): Promise<void> {
    const current = this.current;
    if (!current || current.id !== id)
      throw new Error("This export is no longer the latest successful export. Export again to reveal it.");
    try {
      if (target !== "folder" && target !== "zip") throw new Error("Unknown export reveal target.");
      if (!sameIdentity(current.root, await rootIdentity(current.root.path)))
        throw new Error("The export destination changed after publication.");
      const expected = current[target];
      const actual = await targetIdentity(expected.path, target);
      if (!sameIdentity(expected, actual) || expected.fingerprint !== actual.fingerprint)
        throw new Error(`The exported ${target} changed after publication.`);
      await this.showItem(expected.path);
    } catch (error) {
      this.clear();
      throw error;
    }
  }
}
