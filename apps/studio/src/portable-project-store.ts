import { createHash } from "node:crypto";
import { access, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, unlink } from "node:fs/promises";
import path from "node:path";
import {
  collectAssetReferencesV2,
  openProjectV2,
  reachableAssetHashes,
  saveProjectV2,
  type CommittedStateV2,
  type AssetReferenceV2,
} from "../../../packages/theme-core/src/index.js";
export type PortableAsset = { sha256: string; bytes: Uint8Array };
// prettier-ignore
export type BundleCheckpoint = "staging-synced" | "journal-synced" | "asset-placed" | "assets-placed" | "project-placed" | "root-synced" | "committed";
export type BundleDiagnostic = { code: string; path: string; blocking: boolean; message: string };
// prettier-ignore
export type BundleOpen = { state: CommittedStateV2; diagnostics: BundleDiagnostic[]; orphans: string[]; canEdit: boolean };
type Options = { checkpoint?: (phase: BundleCheckpoint) => void | Promise<void> };
// prettier-ignore
type Journal = { version: 1; transaction: string; phase: "staged" | "asset-placed" | "assets-placed" | "project-placed" | "root-synced"; projectSha256: string; assets: string[]; placed: string[] };
// prettier-ignore
export class BundlePathError extends Error {
  constructor(candidate: string) { super(`Unsafe bundle path: ${candidate}`); this.name = "BundlePathError"; }
}
// prettier-ignore
export class BundleCommitError extends Error {
  constructor(message: string) { super(message); this.name = "BundleCommitError"; }
}
const digest = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex");
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
  private constructor(private readonly root: string, private readonly options: Options) {}
  static async openRoot(root: string, options: Options = {}): Promise<PortableProjectStore> { const canonical = await realpath(root); if (!(await lstat(canonical)).isDirectory()) throw new BundlePathError(root); return new PortableProjectStore(canonical, options); }
  private async resolve(candidate: string, createParents = false): Promise<string> { const safe = parts(candidate); let parent = this.root; for (let index = 0; index < safe.length - 1; index += 1) { const next = path.join(parent, safe[index]!); const stat = await statOrNone(next); if (!stat) { if (!createParents) return path.join(parent, ...safe.slice(index)); await mkdir(next); await this.sync(parent); } else if (stat.isSymbolicLink() || !stat.isDirectory()) throw new BundlePathError(candidate); const canonical = await realpath(next); if (!inside(this.root, canonical)) throw new BundlePathError(candidate); parent = canonical; } const target = path.join(parent, safe.at(-1)!); if ((await statOrNone(target))?.isSymbolicLink()) throw new BundlePathError(candidate); return target; }
  private async sync(directory: string): Promise<void> { const handle = await open(directory, "r"); try { await handle.sync(); } finally { await handle.close(); } }
  private diagnostic(code: string, candidate: string, message: string, blocking: boolean): BundleDiagnostic { return { code, path: candidate, message, blocking }; }
  private async writeJournal(value: Journal): Promise<void> { const target = await this.resolve(".studio/journal.json", true); await durable(target, json(value)); await this.sync(path.dirname(target)); }
  private async recover(diagnostics: BundleDiagnostic[], orphans: string[]): Promise<void> { const journalPath = await this.resolve(".studio/journal.json"); if (!(await present(journalPath))) return; orphans.push(".studio/journal.json"); let journal: Journal; try { journal = JSON.parse(await readFile(journalPath, "utf8")) as Journal; if (journal.version !== 1 || !journal.transaction || !Array.isArray(journal.placed)) throw new Error("invalid journal"); } catch { diagnostics.push(this.diagnostic("stale-transaction", ".studio/journal.json", "Transaction journal is not valid.", false)); return; } const staging = await this.resolve(`.studio/staging/${journal.transaction}`), hasStaging = await present(staging); if (journal.phase === "staged" && journal.placed.length === 0) { if (hasStaging) await rm(staging, { recursive: true, force: true }); } else if (hasStaging) orphans.push(`.studio/staging/${journal.transaction}`); }
  private async assetOrphans(referenced: Set<string>): Promise<string[]> { let directory: string; try { directory = await this.resolve("assets/sha256"); } catch (error) { if (error instanceof BundlePathError) return []; throw error; } if (!(await present(directory))) return []; const entries = await readdir(directory, { withFileTypes: true }); return entries.map((entry) => `assets/sha256/${entry.name}`).filter((relative) => !referenced.has(path.basename(relative, ".png"))); }
  private async stagingOrphans(): Promise<string[]> { const directory = await this.resolve(".studio/staging"); if (!(await present(directory))) return []; return (await readdir(directory, { withFileTypes: true })).map((entry) => `.studio/staging/${entry.name}`); }
  async open(): Promise<BundleOpen> { const projectPath = await this.resolve("project.json"), state = openProjectV2(await readFile(projectPath, "utf8")), diagnostics: BundleDiagnostic[] = [], orphans: string[] = []; await this.recover(diagnostics, orphans); const references = collectAssetReferencesV2(state), referenced = new Set<string>(); for (const reference of references) { if (!reference.path || !/^[a-f0-9]{64}$/.test(reference.sha256) || reference.path !== expectedPath(reference.sha256)) { diagnostics.push(this.diagnostic("unsafe-reference", reference.path ?? "", "Asset reference is not canonical.", true)); continue; } referenced.add(reference.sha256); try { const bytes = await readFile(await this.resolve(reference.path)); if (digest(bytes) !== reference.sha256) diagnostics.push(this.diagnostic("corrupt-asset", reference.path, "Asset bytes do not match their SHA-256 address.", true)); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") diagnostics.push(this.diagnostic("missing-asset", reference.path, "Referenced asset is missing.", true)); else if (error instanceof BundlePathError) diagnostics.push(this.diagnostic("unsafe-reference", reference.path, error.message, true)); else throw error; } } orphans.push(...(await this.assetOrphans(referenced)), ...(await this.stagingOrphans())); for (const sidecar of [".studio/recovery.json"]) if (await present(await this.resolve(sidecar))) orphans.push(sidecar); const committedProject = digest(await readFile(projectPath)), journal = await this.resolve(".studio/journal.json"); if (await present(journal)) try { if (committedProject === (JSON.parse(await readFile(journal, "utf8")) as Partial<Journal>).projectSha256) await this.sync(this.root); } catch { diagnostics.push(this.diagnostic("stale-transaction", ".studio/journal.json", "Transaction recovery metadata is invalid.", false)); } return { state, diagnostics, orphans, canEdit: diagnostics.every(({ blocking }) => !blocking) }; }
  async save(state: CommittedStateV2, assets: readonly PortableAsset[] = []): Promise<void> { const projectBytes = Buffer.from(saveProjectV2(state)), references = collectAssetReferencesV2(state), required = reachableAssetHashes(state), referenceByHash = new Map<string, AssetReferenceV2>(); for (const reference of references) { if (!reference.path || !/^[a-f0-9]{64}$/.test(reference.sha256) || reference.path !== expectedPath(reference.sha256)) throw new BundleCommitError(`Unsafe asset reference: ${reference.path ?? ""}`); const prior = referenceByHash.get(reference.sha256); if (prior && prior.path !== reference.path) throw new BundleCommitError(`Conflicting asset path: ${reference.sha256}`); referenceByHash.set(reference.sha256, reference); } const sources = new Map(assets.map((asset) => [asset.sha256, asset.bytes])), durableAssets = new Map<string, Uint8Array>(); for (const sha256 of required) { const source = sources.get(sha256), target = await this.resolve(expectedPath(sha256)); if (source && digest(source) !== sha256) throw new BundleCommitError(`Asset source hash mismatch: ${sha256}`); const existing = await statOrNone(target); if (existing) { if (existing.isSymbolicLink() || !existing.isFile()) throw new BundlePathError(expectedPath(sha256)); const current = await readFile(target); if (digest(current) !== sha256 || (source && !same(current, source))) throw new BundleCommitError(`Immutable asset mismatch: ${sha256}`); durableAssets.set(sha256, current); } else if (!source) throw new BundleCommitError(`Missing source bytes: ${sha256}`); else durableAssets.set(sha256, source); } const transaction = digest(projectBytes) + digest(required.join(",")), journalPath = await this.resolve(".studio/journal.json"); if (await present(journalPath)) throw new BundleCommitError("A prior transaction requires recovery before saving."); const stage = await this.resolve(`.studio/staging/${transaction}`, true); await mkdir(stage, { recursive: true }); await this.sync(path.dirname(stage)); for (const sha256 of required) { if ((await statOrNone(await this.resolve(expectedPath(sha256))))?.isFile()) continue; const staged = path.join(stage, expectedPath(sha256)); await mkdir(path.dirname(staged), { recursive: true }); await durable(staged, durableAssets.get(sha256)!); } await durable(path.join(stage, "project.json"), projectBytes); await this.sync(stage); await this.options.checkpoint?.("staging-synced"); const journal: Journal = { version: 1, transaction, phase: "staged", projectSha256: digest(projectBytes), assets: required, placed: [] }; await this.writeJournal(journal); await this.options.checkpoint?.("journal-synced"); for (const sha256 of required) { const target = await this.resolve(expectedPath(sha256), true), staged = path.join(stage, expectedPath(sha256)); if (!(await present(target))) { await mkdir(path.dirname(target), { recursive: true }); await rename(staged, target); await this.sync(path.dirname(target)); journal.placed = [...journal.placed, sha256].sort(); journal.phase = "asset-placed"; await this.writeJournal(journal); await this.options.checkpoint?.("asset-placed"); } } journal.phase = "assets-placed"; await this.writeJournal(journal); await this.options.checkpoint?.("assets-placed"); await rename(path.join(stage, "project.json"), await this.resolve("project.json", true)); journal.phase = "project-placed"; await this.writeJournal(journal); await this.options.checkpoint?.("project-placed"); await this.sync(this.root); journal.phase = "root-synced"; await this.writeJournal(journal); await this.options.checkpoint?.("root-synced"); await rm(stage, { recursive: true, force: true }); await this.sync(path.dirname(stage)); await unlink(journalPath); await this.sync(path.join(this.root, ".studio")); await this.options.checkpoint?.("committed"); }
}
