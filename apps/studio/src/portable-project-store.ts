import { createHash, randomBytes } from "node:crypto";
import { access, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, unlink } from "node:fs/promises";
import path from "node:path";
import {
  collectAssetReferencesV2,
  collectMediaReferencesV3,
  openProjectV2,
  openProjectV3,
  openLauncherParityProject,
  reachableAssetHashes,
  saveProjectV2,
  saveLauncherParityProject,
  saveProjectV3,
  type CommittedStateV2,
  type AssetReferenceV2,
  type LauncherParityProjectV1,
  type MediaTypeV3,
  type ProjectStateV3,
} from "../../../packages/theme-core/src/index.js";
import { migrateProfileV3, type ProfileMigrationV3 } from "../../../packages/theme-core/src/migration-v3.js";
import { ProjectRootAuthority } from "./project-root-authority.js";
export type PortableAsset = { sha256: string; bytes: Uint8Array };
// prettier-ignore
export type BundleCheckpoint = "staging-synced" | "journal-synced" | "asset-placed" | "assets-placed" | "project-placed" | "root-synced" | "committed" | "parity-staged" | "parity-committed" | "v3-stage-synced" | "v3-journal-synced" | "v3-staged" | "v3-media-placed" | "v3-project-placed" | "v3-root-synced" | "v3-committed" | "v3-stage-removed" | "v3-journal-removed" | "v3-recovery-validated" | "v3-recovery-planned" | "v3-recovery-stage-removed" | "v3-recovery-pruned" | "v3-recovery-complete" | "v3-migration-stage-recovered";
export type BundleDiagnostic = { code: string; path: string; blocking: boolean; message: string };
// prettier-ignore
export type BundleOpen = { state: CommittedStateV2; diagnostics: BundleDiagnostic[]; orphans: string[]; canEdit: boolean };
export type ParityBundleOpen = { project: LauncherParityProjectV1; orphans: string[] };
// prettier-ignore
export type PortableMedia = { sha256: string; bytes: Uint8Array; mediaType?: MediaTypeV3 };
// prettier-ignore
export type V3BundleOpen = { state: ProjectStateV3; media: Map<string, Uint8Array>; diagnostics: BundleDiagnostic[]; orphans: string[]; quarantine: { sha256: string; path: string; reason: string; blocking: true }[]; canEdit: boolean };
type Options = { checkpoint?: (phase: BundleCheckpoint) => void | Promise<void> };
// prettier-ignore
type Journal = { version: 1; transaction: string; phase: "staged" | "asset-placed" | "assets-placed" | "project-placed" | "root-synced"; projectSha256: string; assets: string[]; placed: string[] };
type V3Journal = {
  version: 4;
  identity: "dspico-v3-save-journal-v2";
  rootSha256: string;
  transaction: string;
  stage: string;
  phase: "commit" | "rollback" | "finalize";
  previousProjectSha256: string | null;
  projectSha256: string;
  paths: { path: string; sha256: string; byteLength: number; mediaType: MediaTypeV3 }[];
  ownedPaths: string[];
};
type V3StageIdentity = {
  version: 1;
  identity: "dspico-v3-stage-v1";
  rootSha256: string;
  transaction: string;
  projectSha256: string;
};
type V3StagingState = { entries: string[]; fingerprint: string };
const V3_JOURNAL_IDENTITY = "dspico-v3-save-journal-v2" as const;
const V3_STAGE_IDENTITY = "dspico-v3-stage-v1" as const;
const HASH = /^[a-f0-9]{64}$/;
// prettier-ignore
export class BundlePathError extends Error {
  constructor(candidate: string) { super(`Unsafe bundle path: ${candidate}`); this.name = "BundlePathError"; }
}
// prettier-ignore
export class BundleCommitError extends Error {
  constructor(message: string) { super(message); this.name = "BundleCommitError"; }
}
const digest = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex");
const mediaTypeMatches = (bytes: Uint8Array, mediaType: MediaTypeV3): boolean => {
  const text = (offset: number, length: number) => new TextDecoder().decode(bytes.slice(offset, offset + length));
  if (mediaType === "image/png") return bytes[0] === 137 && text(1, 3) === "PNG";
  if (mediaType === "audio/wav") return text(0, 4) === "RIFF" && text(8, 4) === "WAVE";
  if (mediaType === "audio/bcstm") return text(0, 4) === "CSTM";
  try {
    JSON.parse(new TextDecoder().decode(bytes));
    return true;
  } catch {
    return false;
  }
};
// prettier-ignore
const same = (left: Uint8Array, right: Uint8Array): boolean => left.length === right.length && left.every((byte, index) => byte === right[index]);
// prettier-ignore
const present = async (candidate: string): Promise<boolean> => {
  try { await access(candidate); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
};
// prettier-ignore
const statOrNone = async (candidate: string) => {
  try { return await lstat(candidate); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
};
// prettier-ignore
const durable = async (candidate: string, bytes: Uint8Array): Promise<void> => {
  const handle = await open(candidate, "w", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
};
const json = (value: unknown): Uint8Array => Buffer.from(`${JSON.stringify(value)}\n`);
// prettier-ignore
const inside = (root: string, candidate: string): boolean => candidate === root || candidate.startsWith(`${root}${path.sep}`);
// prettier-ignore
const parts = (candidate: string): string[] => { if (!candidate || candidate.includes("\\") || candidate.includes("\0") || path.posix.isAbsolute(candidate) || /^[A-Za-z]:[\\/]/.test(candidate)) throw new BundlePathError(candidate); const result = candidate.split("/"); if (result.some((part) => !part || part === "." || part === "..") || path.posix.normalize(candidate) !== candidate) throw new BundlePathError(candidate); return result; };
const expectedPath = (sha256: string): string => `assets/sha256/${sha256}.png`;
// prettier-ignore
export class PortableProjectStore {
  private constructor(
    private readonly authority: ProjectRootAuthority,
    private readonly rootSha256: string,
    private readonly options: Options,
  ) {}
  private get root(): string { return this.authority.accessRoot; }
  private async checkpoint(phase: BundleCheckpoint): Promise<void> { await this.options.checkpoint?.(phase); await this.authority.assertCurrent(); }
  private async readProjectBytes(): Promise<Buffer> { return Buffer.from(await this.authority.readProjectJson()); }
  // prettier-ignore
  async openV3(): Promise<V3BundleOpen> {
    await this.authority.assertCurrent();
    const diagnostics: BundleDiagnostic[] = [], orphans: string[] = [];
    await this.recoverV3(diagnostics, orphans);
    const migration = migrateProfileV3((await this.readProjectBytes()).toString("utf8"));
    if (migration.migrated) {
      const stage = await this.recoverUnjournaledMigrationStage(migration);
      if (stage) {
        const index = orphans.indexOf(stage);
        if (index >= 0) orphans.splice(index, 1);
        for (let index = diagnostics.length - 1; index >= 0; index -= 1)
          if (diagnostics[index]!.code === "v3-recovery-orphan" && diagnostics[index]!.path === stage)
            diagnostics.splice(index, 1);
      }
      await this.validateMigrationMedia(migration.state);
      await this.writeMigrationEnvelope(migration);
      await this.saveV3(migration.state);
    }
    const state = migration.state;
    const media = new Map<string, Uint8Array>(), quarantine = [...state.project.quarantine];
    const pendingJournal = await this.resolve(".studio/v3-journal.json.next");
    if (await present(pendingJournal)) {
      orphans.push(".studio/v3-journal.json.next");
      diagnostics.push(this.diagnostic("v3-recovery-orphan", ".studio/v3-journal.json.next", "An interrupted recovery journal update remains. Restore a backup copy and reopen the project; editing and export remain blocked.", true));
    }
    try { this.reportV3Stages(await this.inspectV3Staging(), diagnostics, orphans); } catch {
      diagnostics.push(this.diagnostic("v3-recovery-orphan", ".studio/staging-v3", "The interrupted-save staging directory is unsafe or changed during inspection. Restore a backup copy of this project and reopen it before editing or exporting.", true));
    }
    for (const ref of collectMediaReferencesV3(state)) {
      try {
        const bytes = new Uint8Array(await readFile(await this.resolve(ref.path)));
        if (digest(bytes) !== ref.sha256) throw new BundleCommitError("hash mismatch");
        if (!mediaTypeMatches(bytes, ref.mediaType)) throw new BundleCommitError("media type mismatch");
        media.set(ref.sha256, bytes);
      } catch (error) {
        const reason = error instanceof BundleCommitError ? error.message === "media type mismatch" ? "Media bytes do not match the declared type." : "Media source hash mismatch." : "Media source is missing.";
        diagnostics.push(this.diagnostic("quarantined-media", ref.path, `${reason} Restore the original file or a backup copy, then reopen the project.`, true));
        if (!quarantine.some(({ sha256 }) => sha256 === ref.sha256)) quarantine.push({ sha256: ref.sha256, path: ref.path, reason, blocking: true });
      }
    }
    await this.authority.assertCurrent();
    return { state, media, diagnostics, orphans, quarantine, canEdit: diagnostics.every(({ blocking }) => !blocking) };
  }
  // prettier-ignore
  async saveV3(state: ProjectStateV3, media: readonly PortableMedia[] = []): Promise<void> {
    await this.authority.assertCurrent();
    const projectBytes = Buffer.from(saveProjectV3(state)), refs = collectMediaReferencesV3(state), sources = new Map(media.map((item) => [item.sha256, item.bytes])), durableMedia = new Map<string, Uint8Array>();
    for (const ref of refs) {
      const source = sources.get(ref.sha256), target = await this.resolve(ref.path, true);
      if (source && digest(source) !== ref.sha256) throw new BundleCommitError(`Media source hash mismatch: ${ref.sha256}`);
      const existing = await statOrNone(target);
      if (existing) {
        if (existing.isSymbolicLink() || !existing.isFile()) throw new BundlePathError(ref.path);
        const current = await readFile(target);
        if (digest(current) !== ref.sha256 || (source && !same(current, source))) throw new BundleCommitError(`Immutable media mismatch: ${ref.sha256}`);
        durableMedia.set(ref.sha256, current);
      } else if (!source) throw new BundleCommitError(`Missing media source: ${ref.sha256}`);
      else durableMedia.set(ref.sha256, source);
    }
    const projectSha256 = digest(projectBytes), paths = refs.map(({ path: relative, sha256, byteLength, mediaType }) => ({ path: relative, sha256, byteLength, mediaType })).sort((left, right) => left.path.localeCompare(right.path)), transaction = randomBytes(32).toString("hex"), stageRelative = `.studio/staging-v3/${transaction}`, stage = await this.resolve(stageRelative, true), journalPath = await this.resolve(".studio/v3-journal.json", true), projectPath = await this.resolve("project.json", true), ownedPaths = [stageRelative, `${stageRelative}/.transaction.json`, `${stageRelative}/project.json`, ...paths.map(({ path: relative }) => `${stageRelative}/${relative}`)].sort();
    if (await present(journalPath)) throw new BundleCommitError("A prior V3 transaction requires recovery before saving.");
    if (await present(stage)) throw new BundleCommitError("An unresolved V3 staging folder requires recovery before saving.");
    const previousBytes = await present(projectPath) ? await this.readProjectBytes() : undefined;
    const previousProjectSha256 = previousBytes ? digest(previousBytes) : null;
    let owned: string[] = [];
    try { if (previousBytes) owned = collectMediaReferencesV3(migrateProfileV3(previousBytes.toString("utf8")).state).map(({ path }) => path); } catch {}
    await mkdir(stage, { recursive: true });
    await durable(path.join(stage, ".transaction.json"), json({ version: 1, identity: V3_STAGE_IDENTITY, rootSha256: this.rootSha256, transaction, projectSha256 } satisfies V3StageIdentity));
    for (const ref of refs) {
      const staged = path.join(stage, ref.path);
      await mkdir(path.dirname(staged), { recursive: true });
      await durable(staged, durableMedia.get(ref.sha256)!);
    }
    await durable(path.join(stage, "project.json"), projectBytes);
    await this.sync(stage);
    await this.checkpoint("v3-stage-synced");
    const journal: V3Journal = { version: 4, identity: V3_JOURNAL_IDENTITY, rootSha256: this.rootSha256, transaction, stage: stageRelative, phase: "commit", previousProjectSha256, projectSha256, paths, ownedPaths };
    await this.writeV3Journal(journal);
    await this.checkpoint("v3-journal-synced");
    await this.checkpoint("v3-staged");
    for (const ref of refs) {
      const target = await this.resolve(ref.path, true), staged = path.join(stage, ref.path);
      if (!(await present(target))) {
        await mkdir(path.dirname(target), { recursive: true });
        await rename(staged, target);
        await this.sync(path.dirname(target));
        await this.checkpoint("v3-media-placed");
      }
    }
    await rename(path.join(stage, "project.json"), projectPath);
    await this.checkpoint("v3-project-placed");
    await this.sync(this.root);
    await this.checkpoint("v3-root-synced");
    await this.checkpoint("v3-committed");
    await this.validateRecovery(journal);
    await rm(stage, { recursive: true, force: true });
    await this.sync(path.dirname(stage));
    await this.checkpoint("v3-stage-removed");
    const committed = await this.validateCommittedProject(journal.projectSha256);
    await this.pruneMedia(collectMediaReferencesV3(committed).map(({ path: relative }) => relative), owned);
    await this.validateCommittedProject(journal.projectSha256);
    await unlink(journalPath);
    await this.sync(path.dirname(journalPath));
    await this.checkpoint("v3-journal-removed");
    await this.authority.assertCurrent();
  }
  static async openRoot(root: string, options: Options = {}): Promise<PortableProjectStore> { return PortableProjectStore.openAuthority(await ProjectRootAuthority.capture(root), options); }
  static async openAuthority(authority: ProjectRootAuthority, options: Options = {}): Promise<PortableProjectStore> { await authority.assertCurrent(); const identity = authority.identity; return new PortableProjectStore(authority, digest(`${identity.path}\0${identity.device}\0${identity.inode}\0${identity.mode}`), options); }
  private async resolve(candidate: string, createParents = false): Promise<string> { await this.authority.assertCurrent(); const safe = parts(candidate); let parent = this.root; for (let index = 0; index < safe.length - 1; index += 1) { const next = path.join(parent, safe[index]!); const stat = await statOrNone(next); if (!stat) { if (!createParents) return path.join(parent, ...safe.slice(index)); await mkdir(next); await this.sync(parent); } else if (stat.isSymbolicLink() || !stat.isDirectory()) throw new BundlePathError(candidate); const canonical = await realpath(next); if (!inside(this.authority.root, canonical)) throw new BundlePathError(candidate); parent = next; } const target = path.join(parent, safe.at(-1)!); if ((await statOrNone(target))?.isSymbolicLink()) throw new BundlePathError(candidate); return target; }
  private async sync(directory: string): Promise<void> { const handle = await open(directory, "r"); try { await handle.sync(); } finally { await handle.close(); } }
  private async pruneMedia(retained: readonly string[], owned: readonly string[] = []): Promise<void> { const relativeDirectory = "assets/sha256", directory = await this.resolve(relativeDirectory), keep = new Set(retained), known = new Set(owned); let entries; try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; } for (const entry of entries) { const relative = `${relativeDirectory}/${entry.name}`; if (known.has(relative) && entry.isFile() && /^[a-f0-9]{64}\.(png|wav|bcstm|json)$/.test(entry.name) && !keep.has(relative)) await unlink(await this.resolve(relative)); } await this.sync(directory); }
  private async writeV3Journal(value: V3Journal): Promise<void> {
    const target = await this.resolve(".studio/v3-journal.json", true), temporary = await this.resolve(".studio/v3-journal.json.next", true);
    await durable(temporary, json(value));
    await rename(temporary, target);
    await this.sync(path.dirname(target));
  }
  private async validateMigrationMedia(state: ProjectStateV3): Promise<void> {
    for (const ref of collectMediaReferencesV3(state)) await this.validateMediaAt(ref.path, ref);
  }
  private async writeMigrationEnvelope(migration: ProfileMigrationV3): Promise<void> {
    const target = await this.resolve(".studio/pre-migration-v3.json", true), temporary = await this.resolve(".studio/pre-migration-v3.json.next", true);
    const bytes = json({ version: 1, rootSha256: this.rootSha256, sourceSha256: migration.sourceSha256, candidateSha256: migration.candidateSha256, sourceBytes: migration.sourceBytes });
    if (await present(target)) { if (!same(await readFile(target), bytes)) throw new BundleCommitError("Retained pre-migration copy does not match this project."); return; }
    try { await durable(temporary, bytes); await this.sync(path.dirname(temporary)); await rename(temporary, target); await this.sync(path.dirname(target)); if (!same(await readFile(target), bytes)) throw new BundleCommitError("Pre-migration copy hash mismatch."); } catch (error) { await rm(temporary, { force: true }); throw error; }
  }
  async restorePreMigrationV3(): Promise<void> {
    const envelopePath = await this.resolve(".studio/pre-migration-v3.json"), target = await this.resolve("project.json", true), temporary = await this.resolve(".studio/pre-migration-v3.restore.next", true);
    let envelope: { rootSha256?: unknown; sourceSha256?: unknown; candidateSha256?: unknown; sourceBytes?: unknown; version?: unknown };
    try { envelope = JSON.parse(await readFile(envelopePath, "utf8")); } catch { throw new BundleCommitError("Pre-migration copy is invalid."); }
    if (Object.keys(envelope).length !== 5 || envelope.version !== 1 || envelope.rootSha256 !== this.rootSha256 || typeof envelope.sourceBytes !== "string") throw new BundleCommitError("Pre-migration copy is invalid.");
    const migration = migrateProfileV3(envelope.sourceBytes);
    if (!migration.migrated || migration.sourceSha256 !== envelope.sourceSha256 || migration.candidateSha256 !== envelope.candidateSha256 || digest(await this.readProjectBytes()) !== envelope.candidateSha256) throw new BundleCommitError("Pre-migration copy no longer matches the committed project.");
    await this.validateMigrationMedia(migration.state);
    const source = Buffer.from(envelope.sourceBytes);
    if (await present(temporary) && !same(await readFile(temporary), source)) throw new BundleCommitError("Unknown restore record requires manual inspection.");
    try { if (!(await present(temporary))) { await durable(temporary, source); await this.sync(path.dirname(temporary)); } await rename(temporary, target); await this.sync(this.root); if (!same(await this.readProjectBytes(), source)) throw new BundleCommitError("Pre-migration restore hash mismatch."); } catch (error) { await rm(temporary, { force: true }); throw error; }
  }
  private async recoverUnjournaledMigrationStage(migration: ProfileMigrationV3): Promise<string | undefined> {
    if (await present(await this.resolve(".studio/v3-journal.json"))) return undefined;
    const staging = await this.inspectV3Staging();
    if (staging.entries.length !== 1) return undefined;
    const transaction = staging.entries[0]!, stage = `.studio/staging-v3/${transaction}`;
    let marker: V3StageIdentity, bytes: Buffer;
    try { marker = JSON.parse(await readFile(await this.resolve(`${stage}/.transaction.json`), "utf8")); bytes = await readFile(await this.resolve(`${stage}/project.json`)); } catch { return undefined; }
    if (!this.validStageIdentity(marker, { version: 4, identity: V3_JOURNAL_IDENTITY, rootSha256: this.rootSha256, transaction, stage, phase: "commit", previousProjectSha256: null, projectSha256: migration.candidateSha256, paths: [], ownedPaths: [] }) || digest(bytes) !== migration.candidateSha256) return undefined;
    const state = openProjectV3(bytes.toString("utf8"));
    try { for (const ref of collectMediaReferencesV3(state)) await this.validateMediaAt(`${stage}/${ref.path}`, ref); } catch { return undefined; }
    await rm(await this.resolve(stage), { recursive: true, force: true });
    await this.sync(path.dirname(await this.resolve(stage)));
    await this.checkpoint("v3-migration-stage-recovered");
    return stage;
  }
  private validStageIdentity(value: unknown, journal: V3Journal): value is V3StageIdentity {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const identity = value as Partial<V3StageIdentity>;
    return Object.keys(identity).length === 5 && identity.version === 1 && identity.identity === V3_STAGE_IDENTITY && identity.rootSha256 === journal.rootSha256 && identity.transaction === journal.transaction && identity.projectSha256 === journal.projectSha256;
  }
  private validV3Journal(value: unknown): value is V3Journal {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const journal = value as Partial<V3Journal>;
    return Object.keys(journal).length === 10 && journal.version === 4 && journal.identity === V3_JOURNAL_IDENTITY && HASH.test(journal.rootSha256 ?? "") && HASH.test(journal.transaction ?? "") && journal.stage === `.studio/staging-v3/${journal.transaction}` && ["commit", "rollback", "finalize"].includes(journal.phase ?? "") && (journal.previousProjectSha256 === null || HASH.test(journal.previousProjectSha256 ?? "")) && HASH.test(journal.projectSha256 ?? "") && Array.isArray(journal.paths) && journal.paths.every((item) => item && typeof item === "object" && !Array.isArray(item) && Object.keys(item).length === 4 && typeof item.path === "string" && HASH.test(item.sha256) && Number.isSafeInteger(item.byteLength) && item.byteLength >= 0 && ["image/png", "audio/wav", "audio/bcstm", "application/json"].includes(item.mediaType) && (() => { try { parts(item.path); return true; } catch { return false; } })()) && new Set(journal.paths.map(({ path: relative }) => relative)).size === journal.paths.length && Array.isArray(journal.ownedPaths) && journal.ownedPaths.every((owned) => typeof owned === "string" && (() => { try { parts(owned); return true; } catch { return false; } })()) && JSON.stringify([...journal.ownedPaths].sort()) === JSON.stringify([journal.stage, `${journal.stage}/.transaction.json`, `${journal.stage}/project.json`, ...journal.paths.map(({ path: relative }) => `${journal.stage}/${relative}`)].sort());
  }
  private recoveryFailure(diagnostics: BundleDiagnostic[], code: string, message: string): void {
    diagnostics.push(this.diagnostic(code, ".studio/v3-journal.json", `${message} Restore a backup copy and reopen the project; recovery records were preserved.`, true));
  }
  private async validateMediaAt(relative: string, expected: V3Journal["paths"][number]): Promise<void> {
    const target = await this.resolve(relative), identity = await statOrNone(target);
    if (!identity || identity.isSymbolicLink() || !identity.isFile()) throw new BundleCommitError(`missing or unsafe media: ${expected.path}`);
    const bytes = new Uint8Array(await readFile(target));
    if (bytes.byteLength !== expected.byteLength || digest(bytes) !== expected.sha256 || !mediaTypeMatches(bytes, expected.mediaType))
      throw new BundleCommitError(`invalid media: ${expected.path}`);
  }
  private evidenceFor(state: ProjectStateV3): V3Journal["paths"] {
    return collectMediaReferencesV3(state).map(({ path: relative, sha256, byteLength, mediaType }) => ({ path: relative, sha256, byteLength, mediaType })).sort((left, right) => left.path.localeCompare(right.path));
  }
  private async validateCommittedProject(expectedHash: string): Promise<ProjectStateV3> {
    const bytes = await this.readProjectBytes();
    if (digest(bytes) !== expectedHash) throw new BundleCommitError("Committed project identity does not match recovery intent.");
    const state = openProjectV3(bytes.toString("utf8"));
    for (const ref of this.evidenceFor(state)) await this.validateMediaAt(ref.path, ref);
    return state;
  }
  private async validateStage(journal: V3Journal, requireProject: boolean): Promise<void> {
    const stage = await this.resolve(journal.stage), stageIdentity = await statOrNone(stage);
    if (!stageIdentity) {
      if (journal.phase !== "finalize" || requireProject) throw new BundleCommitError("Owned staging is missing.");
      return;
    }
    if (stageIdentity.isSymbolicLink() || !stageIdentity.isDirectory()) throw new BundlePathError(journal.stage);
    const markerPath = await this.resolve(`${journal.stage}/.transaction.json`), markerIdentity = await statOrNone(markerPath);
    if (!markerIdentity || markerIdentity.isSymbolicLink() || !markerIdentity.isFile()) throw new BundleCommitError("Owned staging identity is missing or unsafe.");
    let marker: unknown;
    try { marker = JSON.parse(await readFile(markerPath, "utf8")); } catch { throw new BundleCommitError("Owned staging identity is malformed."); }
    if (!this.validStageIdentity(marker, journal)) throw new BundleCommitError("Owned staging identity does not match the journal.");
    const stagedProject = await this.resolve(`${journal.stage}/project.json`), projectIdentity = await statOrNone(stagedProject);
    if (requireProject && (!projectIdentity || projectIdentity.isSymbolicLink() || !projectIdentity.isFile())) throw new BundleCommitError("Staged project is missing or unsafe.");
    if (projectIdentity) {
      if (projectIdentity.isSymbolicLink() || !projectIdentity.isFile()) throw new BundleCommitError("Staged project is unsafe.");
      const bytes = await readFile(stagedProject);
      if (digest(bytes) !== journal.projectSha256) throw new BundleCommitError("Staged project hash does not match recovery intent.");
      const staged = openProjectV3(bytes.toString("utf8"));
      if (JSON.stringify(this.evidenceFor(staged)) !== JSON.stringify(journal.paths)) throw new BundleCommitError("Staged project media data does not match the journal.");
    }
    for (const ref of journal.paths) {
      const stagedRelative = `${journal.stage}/${ref.path}`;
      try { await this.validateMediaAt(ref.path, ref); } catch { await this.validateMediaAt(stagedRelative, ref); }
    }
  }
  private async validateRecovery(journal: V3Journal, requireStagedProject = false): Promise<ProjectStateV3> {
    if (journal.rootSha256 !== this.rootSha256) throw new BundleCommitError("Recovery journal belongs to another project root.");
    const committedHash = journal.phase === "rollback" ? journal.previousProjectSha256 : journal.projectSha256;
    if (!committedHash) throw new BundleCommitError("Recovery has no committed project authority.");
    const committed = await this.validateCommittedProject(committedHash);
    await this.validateStage(journal, requireStagedProject);
    return committed;
  }
  private async inspectV3Staging(): Promise<V3StagingState> {
    const directory = await this.resolve(".studio/staging-v3"), before = await statOrNone(directory);
    if (!before) return { entries: [], fingerprint: "absent" };
    if (before.isSymbolicLink() || !before.isDirectory()) throw new BundlePathError(".studio/staging-v3");
    const canonicalDirectory = await realpath(directory);
    const listed = await readdir(directory, { withFileTypes: true }), identities: string[] = [];
    for (const entry of listed) {
      if (!HASH.test(entry.name) || entry.isSymbolicLink() || !entry.isDirectory()) throw new BundlePathError(`.studio/staging-v3/${entry.name}`);
      const candidate = await this.resolve(`.studio/staging-v3/${entry.name}`), identity = await lstat(candidate), canonical = await realpath(candidate);
      if (identity.isSymbolicLink() || !identity.isDirectory() || !inside(canonicalDirectory, canonical)) throw new BundlePathError(`.studio/staging-v3/${entry.name}`);
      identities.push(`${entry.name}\0${String(identity.dev)}\0${String(identity.ino)}`);
    }
    const after = await lstat(directory), names = (await readdir(directory)).sort(), entries = listed.map(({ name }) => name).sort();
    if (!after.isDirectory() || before.dev !== after.dev || before.ino !== after.ino || JSON.stringify(names) !== JSON.stringify(entries)) throw new BundleCommitError("V3 staging changed during inspection.");
    return { entries, fingerprint: digest(`${String(after.dev)}\0${String(after.ino)}\0${identities.sort().join("\0")}`) };
  }
  private reportV3Stages(state: V3StagingState, diagnostics: BundleDiagnostic[], orphans: string[]): void {
    for (const name of state.entries) {
      const relative = `.studio/staging-v3/${name}`;
      if (!orphans.includes(relative)) orphans.push(relative);
      if (!diagnostics.some(({ code, path: candidate }) => code === "v3-recovery-orphan" && candidate === relative)) diagnostics.push(this.diagnostic("v3-recovery-orphan", relative, "An unresolved interrupted-save staging folder remains. Restore a backup copy of this project and reopen it before editing or exporting.", true));
    }
  }
  private async unchangedV3Staging(expected: V3StagingState): Promise<boolean> {
    try { return (await this.inspectV3Staging()).fingerprint === expected.fingerprint; } catch { return false; }
  }
  private async recoverV3(diagnostics: BundleDiagnostic[], orphans: string[]): Promise<void> {
    let staging: V3StagingState;
    try { staging = await this.inspectV3Staging(); } catch {
      diagnostics.push(this.diagnostic("v3-recovery-orphan", ".studio/staging-v3", "The interrupted-save staging directory is unsafe or changed during inspection. Restore a backup copy of this project and reopen it before editing or exporting; all recovery records were preserved.", true));
      return;
    }
    const journalPath = await this.resolve(".studio/v3-journal.json");
    if (!(await present(journalPath))) {
      this.reportV3Stages(staging, diagnostics, orphans);
      return;
    }
    orphans.push(".studio/v3-journal.json");
    let journal: V3Journal;
    try {
      const parsed = JSON.parse(await readFile(journalPath, "utf8"));
      if (!this.validV3Journal(parsed)) throw new Error("invalid");
      journal = parsed;
    } catch {
      this.recoveryFailure(diagnostics, "v3-recovery-invalid", "Interrupted-save recovery journal JSON, version, identity, or exact keys are invalid.");
      return;
    }
    if (journal.rootSha256 !== this.rootSha256) {
      this.recoveryFailure(diagnostics, "v3-recovery-root-mismatch", "Interrupted-save recovery journal belongs to another project root.");
      return;
    }
    if (staging.entries.length > 1 || (staging.entries.length === 1 && staging.entries[0] !== journal.transaction)) {
      this.reportV3Stages(staging, diagnostics, orphans);
      this.recoveryFailure(diagnostics, "v3-recovery-ambiguous", "Interrupted-save recovery found staging that is not exclusively owned by the root-bound journal.");
      return;
    }
    const projectPath = await this.resolve("project.json"), committedSha256 = await present(projectPath) ? digest(await this.readProjectBytes()) : null;
    const planning = journal.phase === "commit";
    if (planning) {
      if (committedSha256 === journal.projectSha256) journal.phase = "finalize";
      else if (committedSha256 === journal.previousProjectSha256) journal.phase = "rollback";
      else {
        this.recoveryFailure(diagnostics, "v3-recovery-ambiguous", "Interrupted-save recovery cannot prove whether the old or new project is authoritative.");
        return;
      }
    }
    try {
      await this.validateRecovery(journal, planning && journal.phase === "rollback");
    } catch {
      this.recoveryFailure(diagnostics, "v3-recovery-validation", "The committed project, referenced history/redo media, or transaction-owned stage is missing, corrupt, stale, or unsafe.");
      return;
    }
    await this.checkpoint("v3-recovery-validated");
    if (!(await this.unchangedV3Staging(staging))) {
      this.recoveryFailure(diagnostics, "v3-recovery-ambiguous", "Interrupted-save staging changed before recovery planning; cleanup was stopped.");
      return;
    }
    await this.writeV3Journal(journal);
    await this.checkpoint("v3-recovery-planned");
    try { await this.validateRecovery(journal); } catch {
      this.recoveryFailure(diagnostics, "v3-recovery-validation", "Recovery data changed after validation; cleanup was stopped.");
      return;
    }
    if (!(await this.unchangedV3Staging(staging))) {
      this.recoveryFailure(diagnostics, "v3-recovery-ambiguous", "Interrupted-save staging changed before cleanup; cleanup was stopped.");
      return;
    }
    const stage = await this.resolve(journal.stage);
    await rm(stage, { recursive: true, force: true });
    await this.sync(path.dirname(stage));
    await this.checkpoint("v3-recovery-stage-removed");
    let cleanedStaging: V3StagingState;
    try { cleanedStaging = await this.inspectV3Staging(); } catch {
      this.recoveryFailure(diagnostics, "v3-recovery-ambiguous", "Interrupted-save staging became unsafe after owned cleanup; media cleanup was stopped.");
      return;
    }
    if (cleanedStaging.entries.length > 0) {
      this.reportV3Stages(cleanedStaging, diagnostics, orphans);
      this.recoveryFailure(diagnostics, "v3-recovery-ambiguous", "Additional interrupted-save staging appeared during cleanup; media cleanup was stopped.");
      return;
    }
    let committed: ProjectStateV3;
    try { committed = await this.validateCommittedProject(journal.phase === "rollback" ? journal.previousProjectSha256! : journal.projectSha256); } catch {
      this.recoveryFailure(diagnostics, "v3-recovery-validation", "Committed project media changed before pruning; cleanup was stopped.");
      return;
    }
    if (!(await this.unchangedV3Staging(cleanedStaging))) {
      this.recoveryFailure(diagnostics, "v3-recovery-ambiguous", "Interrupted-save staging changed before media cleanup; cleanup was stopped.");
      return;
    }
    await this.pruneMedia(collectMediaReferencesV3(committed).map(({ path: relative }) => relative), journal.paths.map(({ path }) => path));
    await this.checkpoint("v3-recovery-pruned");
    try { await this.validateCommittedProject(journal.phase === "rollback" ? journal.previousProjectSha256! : journal.projectSha256); } catch {
      this.recoveryFailure(diagnostics, "v3-recovery-validation", "Committed project media changed before journal cleanup; cleanup was stopped.");
      return;
    }
    if (!(await this.unchangedV3Staging(cleanedStaging))) {
      this.recoveryFailure(diagnostics, "v3-recovery-ambiguous", "Interrupted-save staging changed before journal cleanup; cleanup was stopped.");
      return;
    }
    await unlink(journalPath);
    await this.sync(path.dirname(journalPath));
    await this.checkpoint("v3-recovery-complete");
    diagnostics.push(this.diagnostic(journal.phase === "rollback" ? "v3-recovery-rolled-back" : "v3-recovery-finalized", "project.json", journal.phase === "rollback" ? "Recovered an interrupted save by keeping the previously committed project. Transaction-owned staging and unreferenced media were removed." : "Recovered an interrupted save by keeping the already committed new project and completing transaction cleanup.", false));
  }
  private diagnostic(code: string, candidate: string, message: string, blocking: boolean): BundleDiagnostic { return { code, path: candidate, message, blocking }; }
  private async writeJournal(value: Journal): Promise<void> { const target = await this.resolve(".studio/journal.json", true); await durable(target, json(value)); await this.sync(path.dirname(target)); }
  private async recover(diagnostics: BundleDiagnostic[], orphans: string[]): Promise<void> { const journalPath = await this.resolve(".studio/journal.json"); if (!(await present(journalPath))) return; orphans.push(".studio/journal.json"); let journal: Journal; try { journal = JSON.parse(await readFile(journalPath, "utf8")) as Journal; if (journal.version !== 1 || !journal.transaction || !Array.isArray(journal.placed)) throw new Error("invalid journal"); } catch { diagnostics.push(this.diagnostic("stale-transaction", ".studio/journal.json", "Transaction journal is not valid.", false)); return; } const staging = await this.resolve(`.studio/staging/${journal.transaction}`), hasStaging = await present(staging); if (journal.phase === "staged" && journal.placed.length === 0) { if (hasStaging) await rm(staging, { recursive: true, force: true }); } else if (hasStaging) orphans.push(`.studio/staging/${journal.transaction}`); }
  private async assetOrphans(referenced: Set<string>): Promise<string[]> { let directory: string; try { directory = await this.resolve("assets/sha256"); } catch (error) { if (error instanceof BundlePathError) return []; throw error; } if (!(await present(directory))) return []; const entries = await readdir(directory, { withFileTypes: true }); return entries.map((entry) => `assets/sha256/${entry.name}`).filter((relative) => !referenced.has(path.basename(relative, ".png"))); }
  private async stagingOrphans(): Promise<string[]> { const directory = await this.resolve(".studio/staging"); if (!(await present(directory))) return []; return (await readdir(directory, { withFileTypes: true })).map((entry) => `.studio/staging/${entry.name}`); }
  async open(): Promise<BundleOpen> { const projectPath = await this.resolve("project.json"), state = openProjectV2(await readFile(projectPath, "utf8")), diagnostics: BundleDiagnostic[] = [], orphans: string[] = []; await this.recover(diagnostics, orphans); const references = collectAssetReferencesV2(state), referenced = new Set<string>(); for (const reference of references) { if (!reference.path || !/^[a-f0-9]{64}$/.test(reference.sha256) || reference.path !== expectedPath(reference.sha256)) { diagnostics.push(this.diagnostic("unsafe-reference", reference.path ?? "", "Asset reference is not canonical.", true)); continue; } referenced.add(reference.sha256); try { const bytes = await readFile(await this.resolve(reference.path)); if (digest(bytes) !== reference.sha256) diagnostics.push(this.diagnostic("corrupt-asset", reference.path, "Asset bytes do not match their SHA-256 address.", true)); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") diagnostics.push(this.diagnostic("missing-asset", reference.path, "Referenced asset is missing.", true)); else if (error instanceof BundlePathError) diagnostics.push(this.diagnostic("unsafe-reference", reference.path, error.message, true)); else throw error; } } orphans.push(...(await this.assetOrphans(referenced)), ...(await this.stagingOrphans())); for (const sidecar of [".studio/recovery.json"]) if (await present(await this.resolve(sidecar))) orphans.push(sidecar); const committedProject = digest(await readFile(projectPath)), journal = await this.resolve(".studio/journal.json"); if (await present(journal)) try { if (committedProject === (JSON.parse(await readFile(journal, "utf8")) as Partial<Journal>).projectSha256) await this.sync(this.root); } catch { diagnostics.push(this.diagnostic("stale-transaction", ".studio/journal.json", "Transaction recovery metadata is invalid.", false)); } return { state, diagnostics, orphans, canEdit: diagnostics.every(({ blocking }) => !blocking) }; }
  async readAsset(sha256: string): Promise<Uint8Array> { if (!/^[a-f0-9]{64}$/.test(sha256)) throw new BundlePathError(sha256); const bytes = new Uint8Array(await readFile(await this.resolve(expectedPath(sha256)))); if (digest(bytes) !== sha256) throw new BundleCommitError(`Asset source hash mismatch: ${sha256}`); await this.authority.assertCurrent(); return bytes; }
  async readMedia(ref: { sha256: string; path: string }): Promise<Uint8Array> { const bytes = new Uint8Array(await readFile(await this.resolve(ref.path))); if (digest(bytes) !== ref.sha256) throw new BundleCommitError(`Media source hash mismatch: ${ref.sha256}`); await this.authority.assertCurrent(); return bytes; }
  // prettier-ignore
  async openParity(): Promise<ParityBundleOpen> { const project = openLauncherParityProject((await this.readProjectBytes()).toString("utf8")), temporary = await this.resolve(".studio/parity.tmp"), orphans = await present(temporary) ? [".studio/parity.tmp"] : []; await this.authority.assertCurrent(); return { project, orphans }; }
  // prettier-ignore
  async saveParity(project: LauncherParityProjectV1): Promise<void> { const bytes = Buffer.from(saveLauncherParityProject(project)), target = await this.resolve("project.json", true), temporary = await this.resolve(".studio/parity.tmp", true); if (project.evidence.legacy) { const evidence = await this.resolve(`evidence/sha256/${project.evidence.legacy.sourceHash}.json`, true); await durable(evidence, Buffer.from(project.evidence.legacy.sourceBytes)); await this.sync(path.dirname(evidence)); } await durable(temporary, bytes); await this.sync(path.dirname(temporary)); await this.checkpoint("parity-staged"); await rename(temporary, target); await this.sync(this.root); await this.checkpoint("parity-committed"); }
  close(): Promise<void> { return this.authority.close(); }
  async save(state: CommittedStateV2, assets: readonly PortableAsset[] = []): Promise<void> { await this.authority.assertCurrent(); const projectBytes = Buffer.from(saveProjectV2(state)), references = collectAssetReferencesV2(state), required = reachableAssetHashes(state), referenceByHash = new Map<string, AssetReferenceV2>(); for (const reference of references) { if (!reference.path || !/^[a-f0-9]{64}$/.test(reference.sha256) || reference.path !== expectedPath(reference.sha256)) throw new BundleCommitError(`Unsafe asset reference: ${reference.path ?? ""}`); const prior = referenceByHash.get(reference.sha256); if (prior && prior.path !== reference.path) throw new BundleCommitError(`Conflicting asset path: ${reference.sha256}`); referenceByHash.set(reference.sha256, reference); } const sources = new Map(assets.map((asset) => [asset.sha256, asset.bytes])), durableAssets = new Map<string, Uint8Array>(); for (const sha256 of required) { const source = sources.get(sha256), target = await this.resolve(expectedPath(sha256)); if (source && digest(source) !== sha256) throw new BundleCommitError(`Asset source hash mismatch: ${sha256}`); const existing = await statOrNone(target); if (existing) { if (existing.isSymbolicLink() || !existing.isFile()) throw new BundlePathError(expectedPath(sha256)); const current = await readFile(target); if (digest(current) !== sha256 || (source && !same(current, source))) throw new BundleCommitError(`Immutable asset mismatch: ${sha256}`); durableAssets.set(sha256, current); } else if (!source) throw new BundleCommitError(`Missing source bytes: ${sha256}`); else durableAssets.set(sha256, source); } const transaction = digest(projectBytes) + digest(required.join(",")), journalPath = await this.resolve(".studio/journal.json"); if (await present(journalPath)) throw new BundleCommitError("A prior transaction requires recovery before saving."); const stage = await this.resolve(`.studio/staging/${transaction}`, true); await mkdir(stage, { recursive: true }); await this.sync(path.dirname(stage)); for (const sha256 of required) { if ((await statOrNone(await this.resolve(expectedPath(sha256))))?.isFile()) continue; const staged = path.join(stage, expectedPath(sha256)); await mkdir(path.dirname(staged), { recursive: true }); await durable(staged, durableAssets.get(sha256)!); } await durable(path.join(stage, "project.json"), projectBytes); await this.sync(stage); await this.checkpoint("staging-synced"); const journal: Journal = { version: 1, transaction, phase: "staged", projectSha256: digest(projectBytes), assets: required, placed: [] }; await this.writeJournal(journal); await this.checkpoint("journal-synced"); for (const sha256 of required) { const target = await this.resolve(expectedPath(sha256), true), staged = path.join(stage, expectedPath(sha256)); if (!(await present(target))) { await mkdir(path.dirname(target), { recursive: true }); await rename(staged, target); await this.sync(path.dirname(target)); journal.placed = [...journal.placed, sha256].sort(); journal.phase = "asset-placed"; await this.writeJournal(journal); await this.checkpoint("asset-placed"); } } journal.phase = "assets-placed"; await this.writeJournal(journal); await this.checkpoint("assets-placed"); await rename(path.join(stage, "project.json"), await this.resolve("project.json", true)); journal.phase = "project-placed"; await this.writeJournal(journal); await this.checkpoint("project-placed"); await this.sync(this.root); journal.phase = "root-synced"; await this.writeJournal(journal); await this.checkpoint("root-synced"); await rm(stage, { recursive: true, force: true }); await this.sync(path.dirname(stage)); await unlink(journalPath); await this.sync(path.join(this.root, ".studio")); await this.checkpoint("committed"); }
}
