import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AtomicHandoffWriter, HANDOFF_LABEL } from "./handoff-writer.js";

const roots = new Set<string>();
const bytes = (value: string) => new TextEncoder().encode(value);
afterEach(async () => Promise.all([...roots].map((root) => rm(root, { recursive: true, force: true }))));
const root = async () => {
  const value = await mkdtemp(path.join(os.tmpdir(), "dspico-handoff-"));
  roots.add(value);
  return value;
};

describe("atomic cartridge-test handoff", () => {
  it("writes a labeled folder without a ZIP and leaves publication paths alone", async () => {
    const destination = await root();
    await mkdir(path.join(destination, "theme"));
    await writeFile(path.join(destination, "theme", "theme.json"), "published");
    await writeFile(path.join(destination, "theme.zip"), "published zip");
    const result = await (
      await AtomicHandoffWriter.openRoot(destination)
    ).commit([
      { path: "README.md", bytes: bytes("NOT READY — CARTRIDGE TEST ONLY") },
      { path: "visual/topbg.bin", bytes: bytes("candidate") },
    ]);
    expect(result).toMatchObject({ label: HANDOFF_LABEL, zip: false });
    expect(await readdir(result.destination)).toEqual(["README.md", "visual"]);
    expect(await readFile(path.join(destination, "theme", "theme.json"), "utf8")).toBe("published");
    expect(await readFile(path.join(destination, "theme.zip"), "utf8")).toBe("published zip");
  });

  it.each(["theme.zip", "../escape", "/absolute"])("fails closed before any handoff write for %s", async (file) => {
    const destination = await root();
    const writer = await AtomicHandoffWriter.openRoot(destination);
    await expect(writer.commit([{ path: file, bytes: bytes("bad") }])).rejects.toThrow();
    expect(await readdir(destination)).toEqual([]);
  });
});
