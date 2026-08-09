import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";

export const HANDOFF_LABEL = "NOT READY — CARTRIDGE TEST ONLY" as const;
// prettier-ignore
export type HandoffFileV1 = { path: string; bytes: Uint8Array };
// prettier-ignore
export type HandoffResultV1 = { destination: string; files: string[]; label: typeof HANDOFF_LABEL; zip: false };
// prettier-ignore
export class HandoffPathError extends Error { constructor(candidate: string) { super(`Unsafe cartridge-test handoff path: ${candidate}`); this.name = "HandoffPathError"; } }
const exists = async (candidate: string) => Boolean(await lstat(candidate).catch(() => undefined));
// prettier-ignore
const sync = async (directory: string) => { const handle = await open(directory, "r"); try { await handle.sync(); } finally { await handle.close(); } };
// prettier-ignore
const checkFiles = (files: readonly HandoffFileV1[]) => { const seen = new Set<string>(); for (const file of files) { const parts = file.path.split("/"); if (!file.path || path.isAbsolute(file.path) || file.path.includes("\\") || file.path.toLowerCase().endsWith(".zip") || parts.some((part) => !part || part === "." || part === "..") || seen.has(file.path)) throw new HandoffPathError(file.path); if (!(file.bytes instanceof Uint8Array)) throw new TypeError(`Handoff bytes are invalid: ${file.path}`); seen.add(file.path); } };

// prettier-ignore
export class AtomicHandoffWriter { private constructor(private readonly root: string) {} static async openRoot(root: string): Promise<AtomicHandoffWriter> { const canonical = await realpath(root), stat = await lstat(canonical); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new HandoffPathError(root); return new AtomicHandoffWriter(canonical); } async commit(files: readonly HandoffFileV1[]): Promise<HandoffResultV1> { checkFiles(files); const transaction = randomUUID(), target = path.join(this.root, HANDOFF_LABEL), stage = path.join(this.root, `.dspico-handoff.${transaction}`), backup = `${target}.previous.${transaction}`; await mkdir(stage); try { for (const file of files) { const destination = path.join(stage, file.path); await mkdir(path.dirname(destination), { recursive: true }); const handle = await open(destination, "wx", 0o600); try { await handle.writeFile(file.bytes); await handle.sync(); } finally { await handle.close(); } } const prior = await lstat(target).catch(() => undefined); if (prior?.isSymbolicLink() || (prior && !prior.isDirectory())) throw new HandoffPathError(target); if (prior) await rename(target, backup); try { await rename(stage, target); await sync(this.root); } catch (error) { if (await exists(target)) await rm(target, { recursive: true, force: true }); if (await exists(backup)) await rename(backup, target); throw error; } await rm(backup, { recursive: true, force: true }); return { destination: target, files: files.map(({ path: filePath }) => path.join(HANDOFF_LABEL, filePath)), label: HANDOFF_LABEL, zip: false }; } finally { await rm(stage, { recursive: true, force: true }); } } }
