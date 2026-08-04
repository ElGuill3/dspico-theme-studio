import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { AtomicExportWriter, ExportPathError } from "./export-writer.js";

const bytes = (value: string) => new TextEncoder().encode(value);
const files = [
  { path: "theme.json", bytes: bytes("theme") },
  { path: "report.json", bytes: bytes("report") },
];

describe("AtomicExportWriter threat boundaries", () => {
  it.each(["/absolute", "../escape", "nested\\ambiguous"])("rejects unsafe destination %s", async (destination) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dspico-export-"));
    const writer = await AtomicExportWriter.openRoot(root);
    await expect(writer.commitBundle(destination, files, "theme.zip", bytes("zip"))).rejects.toBeInstanceOf(
      ExportPathError,
    );
  });

  it("rejects a symlink escape before writing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dspico-export-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "dspico-outside-"));
    await symlink(outside, path.join(root, "theme"));
    const writer = await AtomicExportWriter.openRoot(root);
    await expect(writer.commitBundle("theme", files, "theme.zip", bytes("zip"))).rejects.toBeInstanceOf(
      ExportPathError,
    );
    await expect(readFile(path.join(outside, "theme.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects an unsafe generated file path", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dspico-export-"));
    const writer = await AtomicExportWriter.openRoot(root);
    await expect(
      writer.commitBundle("theme", [{ path: "../escape", bytes: bytes("bad") }], "theme.zip", bytes("zip")),
    ).rejects.toBeInstanceOf(ExportPathError);
    await expect(readFile(path.join(root, "escape"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("restores both prior outputs when interrupted after the folder swap", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dspico-export-"));
    await mkdir(path.join(root, "theme"));
    await writeFile(path.join(root, "theme", "theme.json"), "previous");
    await writeFile(path.join(root, "theme.zip"), "previous-zip");
    const writer = await AtomicExportWriter.openRoot(root, {
      checkpoint: (step) => {
        if (step === "folder-swapped") throw new Error("interrupted");
      },
    });
    await expect(writer.commitBundle("theme", files, "theme.zip", bytes("new-zip"))).rejects.toThrow("interrupted");
    await expect(readFile(path.join(root, "theme", "theme.json"), "utf8")).resolves.toBe("previous");
    await expect(readFile(path.join(root, "theme.zip"), "utf8")).resolves.toBe("previous-zip");
  });

  it("verifies and swaps a complete folder and ZIP", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dspico-export-"));
    const writer = await AtomicExportWriter.openRoot(root);
    await writer.commitBundle("theme", files, "theme.zip", bytes("zip"));
    await expect(readFile(path.join(root, "theme", "report.json"), "utf8")).resolves.toBe("report");
    await expect(readFile(path.join(root, "theme.zip"), "utf8")).resolves.toBe("zip");
  });
});
