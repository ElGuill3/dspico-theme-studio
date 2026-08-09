import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, rename } from "node:fs/promises";
import path from "node:path";
// prettier-ignore
import { receiptKeyV1, receiptMatchesV1, validateReceiptV1, type ReceiptExpectationV1, type VisualReceiptV1 } from "../../../packages/dspico-contract/src/receipts-v1.js";

// prettier-ignore
export class ReceiptRegistry { constructor(private readonly root: string) {} async put(input: unknown): Promise<VisualReceiptV1> { const diagnostics = validateReceiptV1(input); if (diagnostics.length) throw new Error(diagnostics[0]!.message); const value = input as VisualReceiptV1; await mkdir(this.root, { recursive: true }); const target = path.join(this.root, `${receiptKeyV1(value)}.json`), temporary = `${target}.${randomUUID()}.next`, handle = await open(temporary, "wx", 0o600); try { await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8"); await handle.sync(); } finally { await handle.close(); } await rename(temporary, target); return value; } async find(expected: ReceiptExpectationV1): Promise<VisualReceiptV1 | undefined> { await mkdir(this.root, { recursive: true }); for (const name of await readdir(this.root)) { if (!name.endsWith(".json")) continue; try { const value = JSON.parse(await readFile(path.join(this.root, name), "utf8")); if (receiptMatchesV1(value, expected)) return value as VisualReceiptV1; } catch { /* stale or interrupted records are not evidence */ } } return undefined; } }
