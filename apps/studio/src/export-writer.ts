import { createHash, randomUUID } from "node:crypto";
import { access, lstat, mkdir, open, readFile, readdir, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";

export type ExportCheckpoint =
  "journaled" | "staged" | "verified" | "backed-up" | "folder-swapped" | "swapped" | "committed";
type ExportFile = { path: string; bytes: Uint8Array };
type RootIdentity = { path: string; device: string; inode: string };
type PathEvidence = { fingerprint: string; device: string; inode: string } | null;
type ExportJournal = {
  version: 3;
  identity: "dspico-theme-export-private-v1";
  transaction: string;
  phase: "rollback" | "commit";
  root: RootIdentity;
  targets: ["theme", "theme.zip"];
  existed: [boolean, boolean];
  previous: [string | null, string | null];
  next: [string, string];
};
type Options = { authorityRoot: string; checkpoint?: (checkpoint: ExportCheckpoint) => void | Promise<void> };
const IDENTITY = "dspico-theme-export-private-v1";
const OWNED_DESTINATIONS = ["theme", "theme.zip"] as const;
const JOURNAL = ".dspico-export.transaction.json";
const JOURNAL_NEXT = `${JOURNAL}.next`;
const COMMIT = `${JOURNAL}.commit`;
const COMMIT_NEXT = `${COMMIT}.next`;
const HASH = /^[a-f0-9]{64}$/;
const TRANSACTION = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

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
const zipManifest = (bytes: Uint8Array): readonly (readonly [string, string])[] | undefined => {
  if (
    bytes.length < 4 ||
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true) !== 0x04034b50
  )
    return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    entries: [string, string][] = [];
  let offset = 0;
  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    if (offset + 30 > bytes.length || view.getUint16(offset + 8, true) !== 0 || view.getUint16(offset + 6, true) & 0x08)
      throw new Error("ZIP manifest is invalid.");
    const size = view.getUint32(offset + 18, true),
      nameLength = view.getUint16(offset + 26, true),
      extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30,
      dataStart = nameStart + nameLength + extraLength;
    if (dataStart + size > bytes.length) throw new Error("ZIP manifest is invalid.");
    const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength));
    entries.push([
      name,
      createHash("sha256")
        .update(bytes.slice(dataStart, dataStart + size))
        .digest("hex"),
    ]);
    offset = dataStart + size;
  }
  if (!entries.length || offset + 4 > bytes.length || view.getUint32(offset, true) !== 0x02014b50)
    throw new Error("ZIP manifest is invalid.");
  return entries;
};
const assertEquivalentZip = (files: readonly ExportFile[], zipBytes: Uint8Array): void => {
  const actual = zipManifest(zipBytes);
  if (!actual) return;
  const expected = files.map(
    ({ path: filePath, bytes: fileBytes }) => [filePath, createHash("sha256").update(fileBytes).digest("hex")] as const,
  );
  if (
    actual.length !== expected.length ||
    actual.some(([filePath, hash], index) => filePath !== expected[index]?.[0] || hash !== expected[index]?.[1])
  )
    throw new Error("ZIP manifest does not match folder manifest.");
};

export class AtomicExportWriter {
  private constructor(
    private readonly root: string,
    private readonly authorityRoot: string,
    private readonly rootIdentity: RootIdentity,
    private readonly authorityIdentity: RootIdentity,
    private readonly record: string,
    private readonly options: Options,
  ) {}

  static async openRoot(root: string, options: Options): Promise<AtomicExportWriter> {
    if (!options.authorityRoot) throw new Error("A private export recovery authority root is required.");
    for (const candidate of [root, options.authorityRoot])
      if ((await lstat(candidate)).isSymbolicLink()) throw new ExportPathError(candidate);
    const canonicalRoot = await realpath(root);
    const canonicalAuthority = await realpath(options.authorityRoot);
    if (
      canonicalAuthority === canonicalRoot ||
      canonicalAuthority.startsWith(`${canonicalRoot}${path.sep}`) ||
      canonicalRoot.startsWith(`${canonicalAuthority}${path.sep}`)
    )
      throw new ExportPathError(options.authorityRoot);
    const rootStat = await lstat(canonicalRoot, { bigint: true });
    const authorityStat = await lstat(canonicalAuthority, { bigint: true });
    if (!rootStat.isDirectory() || !authorityStat.isDirectory()) throw new ExportPathError(root);
    const rootIdentity = { path: canonicalRoot, device: String(rootStat.dev), inode: String(rootStat.ino) };
    const authorityIdentity = {
      path: canonicalAuthority,
      device: String(authorityStat.dev),
      inode: String(authorityStat.ino),
    };
    const record = path.join(canonicalAuthority, `${createHash("sha256").update(canonicalRoot).digest("hex")}.json`);
    const writer = new AtomicExportWriter(
      canonicalRoot,
      canonicalAuthority,
      rootIdentity,
      authorityIdentity,
      record,
      options,
    );
    await writer.assertNoDestinationAuthority();
    await writer.recoverTransaction();
    return writer;
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
    const stat = await this.sidecarStat(candidate);
    if (stat) await rm(candidate, { recursive: true, force: true });
  }

  private async sidecarStat(candidate: string) {
    const stat = await lstat(candidate).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (stat?.isSymbolicLink()) throw new ExportPathError(path.basename(candidate));
    if (stat?.isFile() && stat.nlink !== 1) throw new ExportPathError(path.basename(candidate));
    return stat;
  }

  private async assertNoDestinationAuthority(): Promise<void> {
    const metadata = await Promise.all(
      [JOURNAL, JOURNAL_NEXT, COMMIT, COMMIT_NEXT].map((candidate) =>
        this.sidecarStat(path.join(this.root, candidate)),
      ),
    );
    if (metadata.some(Boolean)) throw new Error("Legacy destination recovery metadata requires manual inspection.");
  }

  private async assertDirectoryIdentity(identity: RootIdentity): Promise<void> {
    if ((await realpath(identity.path)) !== identity.path) throw new ExportPathError(identity.path);
    const stat = await lstat(identity.path, { bigint: true });
    if (!stat.isDirectory() || String(stat.dev) !== identity.device || String(stat.ino) !== identity.inode)
      throw new ExportPathError(identity.path);
  }

  private assertRootIdentity(): Promise<void> {
    return this.assertDirectoryIdentity(this.rootIdentity);
  }

  private assertAuthorityIdentity(): Promise<void> {
    return this.assertDirectoryIdentity(this.authorityIdentity);
  }

  private async syncDirectory(directory: string): Promise<void> {
    const handle = await open(directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private syncRoot(): Promise<void> {
    return this.syncDirectory(this.root);
  }

  private transactionPaths(targets: readonly string[], transaction: string) {
    const stages = targets.map((target) => `${target}.staging.${transaction}`);
    const backups = targets.map((target) => `${target}.previous.${transaction}`);
    const artifacts = [...targets, ...stages, ...backups];
    const reserved = [JOURNAL, JOURNAL_NEXT, COMMIT, COMMIT_NEXT].map((candidate) => path.join(this.root, candidate));
    if (new Set(artifacts).size !== artifacts.length || artifacts.some((candidate) => reserved.includes(candidate)))
      throw new Error("Export transaction paths are not distinct.");
    return { stages, backups };
  }

  private digest(value: Uint8Array | string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private manifestFingerprint(entries: readonly (readonly [string, string])[]): string {
    return this.digest(JSON.stringify([...entries].sort(([left], [right]) => left.localeCompare(right))));
  }

  private filesFingerprint(files: readonly ExportFile[]): string {
    const entries = files.map((file) => [this.parts(file.path).join("/"), this.digest(file.bytes)] as const);
    if (new Set(entries.map(([candidate]) => candidate)).size !== entries.length)
      throw new Error("Export file paths are not distinct.");
    return this.manifestFingerprint(entries);
  }

  private async fingerprint(candidate: string, folder: boolean): Promise<string | null> {
    const stat = await this.sidecarStat(candidate);
    if (!stat) return null;
    if (folder ? !stat.isDirectory() : !stat.isFile()) throw new ExportPathError(path.basename(candidate));
    if (!folder) return this.digest(await readFile(candidate));
    const entries: [string, string][] = [];
    const visit = async (directory: string, relative: string): Promise<void> => {
      for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
        left.name.localeCompare(right.name),
      )) {
        const entryPath = path.join(directory, entry.name);
        const entryRelative = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink()) throw new ExportPathError(entryRelative);
        if (entry.isDirectory()) await visit(entryPath, entryRelative);
        else if (entry.isFile()) {
          if ((await lstat(entryPath)).nlink !== 1) throw new ExportPathError(entryRelative);
          entries.push([entryRelative, this.digest(await readFile(entryPath))]);
        } else throw new ExportPathError(entryRelative);
      }
    };
    await visit(candidate, "");
    return this.manifestFingerprint(entries);
  }

  private async evidence(candidate: string, folder: boolean): Promise<PathEvidence> {
    const before = await this.sidecarStat(candidate);
    if (!before) return null;
    const fingerprint = await this.fingerprint(candidate, folder);
    const after = await this.sidecarStat(candidate);
    if (!after || before.dev !== after.dev || before.ino !== after.ino)
      throw new Error(`Export path changed during inspection: ${path.basename(candidate)}`);
    return { fingerprint: fingerprint!, device: String(after.dev), inode: String(after.ino) };
  }

  private sameEvidence(left: PathEvidence, right: PathEvidence): boolean {
    return (
      left === right ||
      Boolean(
        left &&
        right &&
        left.fingerprint === right.fingerprint &&
        left.device === right.device &&
        left.inode === right.inode,
      )
    );
  }

  private async removeVerified(candidate: string, expected: PathEvidence, folder: boolean): Promise<void> {
    await this.assertRootIdentity();
    if (!this.sameEvidence(await this.evidence(candidate, folder), expected))
      throw new Error(`Export path changed before removal: ${path.basename(candidate)}`);
    await rm(candidate, { recursive: true });
    await this.syncRoot();
  }

  private async renameVerified(
    source: string,
    destination: string,
    sourceExpected: PathEvidence,
    destinationExpected: PathEvidence,
    folder: boolean,
  ): Promise<void> {
    await this.assertRootIdentity();
    if (
      !this.sameEvidence(await this.evidence(source, folder), sourceExpected) ||
      !this.sameEvidence(await this.evidence(destination, folder), destinationExpected)
    )
      throw new Error(`Export path changed before rename: ${path.basename(source)}`);
    await rename(source, destination);
    await this.syncRoot();
  }

  private async writeMetadata(target: string, temporary: string, bytes: Uint8Array): Promise<void> {
    if (path.dirname(target) === this.authorityRoot) await this.assertAuthorityIdentity();
    await this.cleanSidecar(temporary);
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, target);
    await this.syncDirectory(path.dirname(target));
  }

  private async readJournal(): Promise<ExportJournal | undefined> {
    await this.assertAuthorityIdentity();
    const candidate = this.record;
    const stat = await this.sidecarStat(candidate);
    if (!stat) return undefined;
    if (!stat.isFile()) throw new ExportPathError(path.basename(candidate));
    let value: Record<string, unknown>;
    try {
      value = JSON.parse(await readFile(candidate, "utf8")) as Record<string, unknown>;
    } catch {
      throw new Error("Export transaction journal is not valid JSON.");
    }
    const keys = ["existed", "identity", "next", "phase", "previous", "root", "targets", "transaction", "version"];
    const existed = value.existed as unknown[] | undefined;
    const previous = value.previous as unknown[] | undefined;
    const next = value.next as unknown[] | undefined;
    const recordRoot = value.root as Record<string, unknown> | undefined;
    const targets = value.targets as unknown[] | undefined;
    if (
      Object.keys(value).sort().join() !== keys.join() ||
      value.version !== 3 ||
      value.identity !== IDENTITY ||
      (value.phase !== "rollback" && value.phase !== "commit") ||
      typeof value.transaction !== "string" ||
      !TRANSACTION.test(value.transaction) ||
      !recordRoot ||
      Object.keys(recordRoot).sort().join() !== "device,inode,path" ||
      recordRoot.path !== this.rootIdentity.path ||
      recordRoot.device !== this.rootIdentity.device ||
      recordRoot.inode !== this.rootIdentity.inode ||
      !Array.isArray(targets) ||
      targets.length !== 2 ||
      targets[0] !== OWNED_DESTINATIONS[0] ||
      targets[1] !== OWNED_DESTINATIONS[1] ||
      !Array.isArray(existed) ||
      existed.length !== 2 ||
      existed.some((entry) => typeof entry !== "boolean") ||
      !Array.isArray(previous) ||
      previous.length !== 2 ||
      previous.some((entry) => entry !== null && (typeof entry !== "string" || !HASH.test(entry))) ||
      !Array.isArray(next) ||
      next.length !== 2 ||
      next.some((entry) => typeof entry !== "string" || !HASH.test(entry)) ||
      existed.some((entry, index) => entry !== (previous[index] !== null))
    )
      throw new Error("Export transaction journal is not valid.");
    return value as ExportJournal;
  }

  private async recoverTransaction(): Promise<void> {
    const journal = await this.readJournal();
    const identityRecord = `${this.record}.identity`;
    if (!journal) {
      if (
        (await this.sidecarStat(`${this.record}.next`)) ||
        (await this.sidecarStat(identityRecord)) ||
        (await this.sidecarStat(`${identityRecord}.next`))
      )
        throw new Error("Private export transaction metadata has no valid journal.");
      return;
    }
    const identityStat = await this.sidecarStat(identityRecord);
    if (
      !identityStat?.isFile() ||
      (await readFile(identityRecord, "utf8")) !==
        `${IDENTITY}:${this.digest(this.rootIdentity.path)}:${journal.transaction}\n`
    )
      throw new Error("Private export transaction identity does not match the journal.");
    await this.assertRootIdentity();
    const targets = await Promise.all(OWNED_DESTINATIONS.map((candidate) => this.destination(candidate)));
    const { stages, backups } = this.transactionPaths(targets, journal.transaction);
    await Promise.all([...stages, ...backups, `${this.record}.next`].map((candidate) => this.sidecarStat(candidate)));
    const committed = journal.phase === "commit";
    const targetEvidence = await Promise.all(targets.map((candidate, index) => this.evidence(candidate, index === 0)));
    const stageEvidence = await Promise.all(stages.map((candidate, index) => this.evidence(candidate, index === 0)));
    const backupEvidence = await Promise.all(backups.map((candidate, index) => this.evidence(candidate, index === 0)));
    const targetFingerprints = targetEvidence.map((entry) => entry?.fingerprint ?? null);
    const stageFingerprints = stageEvidence.map((entry) => entry?.fingerprint ?? null);
    const backupFingerprints = backupEvidence.map((entry) => entry?.fingerprint ?? null);
    for (let index = 0; index < targets.length; index++) {
      if (stageFingerprints[index] !== null && stageFingerprints[index] !== journal.next[index])
        throw new Error("Export transaction staging identity does not match the journal.");
      if (
        backupFingerprints[index] !== null &&
        (!journal.existed[index] || backupFingerprints[index] !== journal.previous[index])
      )
        throw new Error("Export transaction backup identity does not match the journal.");
    }
    if (committed) {
      if (targetFingerprints.some((fingerprint, index) => fingerprint !== journal.next[index]))
        throw new Error("Committed export transaction is incomplete.");
    } else {
      for (let index = 0; index < targets.length; index++) {
        const validTarget =
          backupFingerprints[index] !== null
            ? targetFingerprints[index] === null || targetFingerprints[index] === journal.next[index]
            : journal.existed[index]
              ? targetFingerprints[index] === journal.previous[index]
              : targetFingerprints[index] === null || targetFingerprints[index] === journal.next[index];
        if (!validTarget) throw new Error("Rollback export transaction target identity does not match the journal.");
      }
      for (let index = 0; index < targets.length; index++) {
        if (backupFingerprints[index] !== null) {
          if (targetFingerprints[index] !== null)
            await this.removeVerified(targets[index]!, targetEvidence[index]!, index === 0);
          await this.renameVerified(backups[index]!, targets[index]!, backupEvidence[index]!, null, index === 0);
        } else if (!journal.existed[index] && targetFingerprints[index] !== null) {
          await this.removeVerified(targets[index]!, targetEvidence[index]!, index === 0);
        }
      }
    }
    for (let index = 0; index < stages.length; index++)
      if ((await this.evidence(stages[index]!, index === 0)) !== null)
        await this.removeVerified(stages[index]!, stageEvidence[index]!, index === 0);
    for (let index = 0; index < backups.length; index++)
      if ((await this.evidence(backups[index]!, index === 0)) !== null)
        await this.removeVerified(backups[index]!, backupEvidence[index]!, index === 0);
    await this.assertAuthorityIdentity();
    await this.cleanSidecar(`${this.record}.next`);
    await this.cleanSidecar(this.record);
    await this.cleanSidecar(identityRecord);
    await this.cleanSidecar(`${identityRecord}.next`);
    await this.syncDirectory(this.authorityRoot);
  }

  async commitBundle(
    folderDestination: string,
    files: readonly ExportFile[],
    zipDestination: string,
    zipBytes: Uint8Array,
  ): Promise<void> {
    if (folderDestination !== OWNED_DESTINATIONS[0] || zipDestination !== OWNED_DESTINATIONS[1])
      throw new ExportPathError(`${folderDestination},${zipDestination}`);
    assertEquivalentZip(files, zipBytes);
    const targets = await Promise.all(OWNED_DESTINATIONS.map((candidate) => this.destination(candidate)));
    const transaction = randomUUID();
    const identityRecord = `${this.record}.identity`;
    const { stages, backups } = this.transactionPaths(targets, transaction);
    if (
      (
        await Promise.all(
          [...stages, ...backups, this.record, `${this.record}.next`, identityRecord, `${identityRecord}.next`].map(
            (candidate) => this.sidecarStat(candidate),
          ),
        )
      ).some(Boolean)
    )
      throw new Error("Export transaction metadata already exists.");
    const previousEvidence = await Promise.all(
      targets.map((candidate, index) => this.evidence(candidate, index === 0)),
    );
    const previous = previousEvidence.map((entry) => entry?.fingerprint ?? null) as [string | null, string | null];
    const existed = previous.map((fingerprint) => fingerprint !== null) as [boolean, boolean];
    const journal: ExportJournal = {
      version: 3,
      identity: IDENTITY,
      transaction,
      phase: "rollback",
      root: this.rootIdentity,
      targets: [...OWNED_DESTINATIONS],
      existed,
      previous,
      next: [this.filesFingerprint(files), this.digest(zipBytes)],
    };
    try {
      await this.writeMetadata(
        identityRecord,
        `${identityRecord}.next`,
        Buffer.from(`${IDENTITY}:${this.digest(this.rootIdentity.path)}:${transaction}\n`),
      );
      await this.writeMetadata(this.record, `${this.record}.next`, Buffer.from(`${JSON.stringify(journal)}\n`));
      await this.options.checkpoint?.("journaled");
      await mkdir(stages[0]!);
      const stageDirectories = new Set([stages[0]!]);
      for (const file of files) {
        const parts = this.parts(file.path);
        const output = path.join(stages[0]!, ...parts);
        await mkdir(path.dirname(output), { recursive: true });
        for (
          let directory = path.dirname(output);
          directory.startsWith(stages[0]!);
          directory = path.dirname(directory)
        ) {
          stageDirectories.add(directory);
          if (directory === stages[0]) break;
        }
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
      for (const directory of [...stageDirectories].sort((left, right) => right.length - left.length))
        await this.syncDirectory(directory);
      await this.syncRoot();
      await this.options.checkpoint?.("staged");
      for (const file of files) {
        const actual = await readFile(path.join(stages[0]!, ...this.parts(file.path)));
        if (!equal(actual, file.bytes)) throw new Error(`Staged export verification failed: ${file.path}`);
      }
      if (!equal(await readFile(stages[1]!), zipBytes)) throw new Error("Staged ZIP verification failed");
      await this.options.checkpoint?.("verified");
      const stageEvidence = await Promise.all(stages.map((candidate, index) => this.evidence(candidate, index === 0)));
      if (stageEvidence.some((entry, index) => entry?.fingerprint !== journal.next[index]))
        throw new Error("Staged export identity changed after verification.");
      for (let index = 0; index < targets.length; index++)
        if (existed[index])
          await this.renameVerified(targets[index]!, backups[index]!, previousEvidence[index]!, null, index === 0);
      await this.options.checkpoint?.("backed-up");
      await this.renameVerified(stages[0]!, targets[0]!, stageEvidence[0]!, null, true);
      await this.options.checkpoint?.("folder-swapped");
      await this.renameVerified(stages[1]!, targets[1]!, stageEvidence[1]!, null, false);
      await this.options.checkpoint?.("swapped");
      const committed = { ...journal, phase: "commit" as const };
      await this.writeMetadata(this.record, `${this.record}.next`, Buffer.from(`${JSON.stringify(committed)}\n`));
      await this.options.checkpoint?.("committed");
      await this.recoverTransaction();
    } catch (error) {
      if (await exists(this.record)) await this.recoverTransaction();
      else {
        await this.cleanSidecar(`${this.record}.next`);
        await this.cleanSidecar(identityRecord);
        await this.cleanSidecar(`${identityRecord}.next`);
        await this.syncDirectory(this.authorityRoot);
      }
      throw error;
    }
  }
}
