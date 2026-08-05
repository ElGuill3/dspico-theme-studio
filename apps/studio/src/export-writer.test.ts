import { createHash } from "node:crypto";
import { cp, link, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import { AtomicExportWriter, ExportPathError, type ExportCheckpoint } from "./export-writer.js";

const bytes = (value: string) => new TextEncoder().encode(value);
const files = [
  { path: "theme.json", bytes: bytes("theme") },
  { path: "report.json", bytes: bytes("report") },
];
const publicationCheckpoints = [
  ["journaled", "previous"],
  ["staged", "previous"],
  ["verified", "previous"],
  ["backed-up", "previous"],
  ["folder-swapped", "previous"],
  ["swapped", "previous"],
  ["committed", "new"],
] as const satisfies readonly (readonly [ExportCheckpoint, "previous" | "new"])[];
type PriorGeneration = "complete" | "folder-only" | "absent";
const generation = async (root: string) => {
  const read = (candidate: string) => readFile(candidate, "utf8").catch(() => undefined);
  return Promise.all([read(path.join(root, "theme", "theme.json")), read(path.join(root, "theme.zip"))]);
};
const journalPath = (root: string) => path.join(root, ".dspico-export.transaction.json");
const sidecar = async (root: string, prefix: string) => {
  const candidate = (await readdir(root)).find((entry) => entry.startsWith(prefix));
  if (!candidate) throw new Error(`Missing sidecar: ${prefix}`);
  return path.join(root, candidate);
};
const legacyJournal = (folderDestination: string, zipDestination: string, existed: [boolean, boolean]) => ({
  version: 1,
  folderDestination,
  zipDestination,
  existed,
});
const digest = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const manifest = (entries: readonly (readonly [string, string])[]) => digest(JSON.stringify(entries));
const privateRoots = new Set<string>();
afterEach(async () => {
  await Promise.all([...privateRoots].map((candidate) => rm(candidate, { recursive: true, force: true })));
  privateRoots.clear();
});
const authorityFor = async (root: string) => {
  const candidate = `${root}.private-authority`;
  privateRoots.add(candidate);
  await mkdir(candidate, { recursive: true, mode: 0o700 });
  return candidate;
};
const openWriter = async (root: string, checkpoint?: (step: ExportCheckpoint) => void | Promise<void>) =>
  AtomicExportWriter.openRoot(root, { authorityRoot: await authorityFor(root), checkpoint });
const privateRecord = async (root: string) =>
  path.join(await authorityFor(root), `${digest(await realpath(root))}.json`);
const restoreContents = async (target: string, snapshot: string) => {
  for (const entry of await readdir(target)) await rm(path.join(target, entry), { recursive: true, force: true });
  for (const entry of await readdir(snapshot))
    await cp(path.join(snapshot, entry), path.join(target, entry), { recursive: true });
};
const snapshotState = async (root: string, snapshot: string) => {
  await cp(root, snapshot, { recursive: true });
  const authoritySnapshot = `${snapshot}.private-authority`;
  privateRoots.add(authoritySnapshot);
  await cp(await authorityFor(root), authoritySnapshot, { recursive: true });
};
const restoreState = async (root: string, snapshot: string) => {
  await restoreContents(root, snapshot);
  await restoreContents(await authorityFor(root), `${snapshot}.private-authority`);
};

describe("AtomicExportWriter threat boundaries", () => {
  it.each(["/absolute", "../escape", "nested\\ambiguous"])("rejects unsafe destination %s", async (destination) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dspico-export-"));
    const writer = await openWriter(root);
    await expect(writer.commitBundle(destination, files, "theme.zip", bytes("zip"))).rejects.toBeInstanceOf(
      ExportPathError,
    );
  });

  it("rejects a symlink escape before writing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dspico-export-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "dspico-outside-"));
    await symlink(outside, path.join(root, "theme"));
    const writer = await openWriter(root);
    await expect(writer.commitBundle("theme", files, "theme.zip", bytes("zip"))).rejects.toBeInstanceOf(
      ExportPathError,
    );
    await expect(readFile(path.join(outside, "theme.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects an unsafe generated file path", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dspico-export-"));
    const writer = await openWriter(root);
    await expect(
      writer.commitBundle("theme", [{ path: "../escape", bytes: bytes("bad") }], "theme.zip", bytes("zip")),
    ).rejects.toBeInstanceOf(ExportPathError);
    await expect(readFile(path.join(root, "escape"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects safe paths outside the fixed export ownership", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dspico-export-owned-"));
    const writer = await openWriter(root);
    await expect(writer.commitBundle("photos", files, "archive.zip", bytes("zip"))).rejects.toBeInstanceOf(
      ExportPathError,
    );
    expect(await readdir(root)).toEqual([]);
  });

  it("restores both prior outputs when interrupted after the folder swap", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dspico-export-"));
    await mkdir(path.join(root, "theme"));
    await writeFile(path.join(root, "theme", "theme.json"), "previous");
    await writeFile(path.join(root, "theme.zip"), "previous-zip");
    const writer = await openWriter(root, (step) => {
      if (step === "folder-swapped") throw new Error("interrupted");
    });
    await expect(writer.commitBundle("theme", files, "theme.zip", bytes("new-zip"))).rejects.toThrow("interrupted");
    await expect(readFile(path.join(root, "theme", "theme.json"), "utf8")).resolves.toBe("previous");
    await expect(readFile(path.join(root, "theme.zip"), "utf8")).resolves.toBe("previous-zip");
  });

  it.each(
    publicationCheckpoints.flatMap(([checkpoint, result]) =>
      (["complete", "folder-only", "absent"] as const).map((prior) => [checkpoint, result, prior] as const),
    ),
  )("recovers %s with a %s prior generation deterministically", async (checkpoint, result, prior: PriorGeneration) => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "dspico-export-crash-"));
    const root = path.join(parent, "live");
    const crashed = path.join(parent, "crashed");
    await mkdir(root);
    if (prior !== "absent") {
      await mkdir(path.join(root, "theme"));
      await writeFile(path.join(root, "theme", "theme.json"), "previous");
    }
    if (prior === "complete") await writeFile(path.join(root, "theme.zip"), "previous-zip");
    const writer = await openWriter(root, async (step) => {
      if (step === checkpoint) await snapshotState(root, crashed);
    });
    await writer.commitBundle("theme", files, "theme.zip", bytes("new-zip"));

    await restoreState(root, crashed);
    await openWriter(root);
    await openWriter(root);
    const expected =
      result === "new"
        ? ["theme", "new-zip"]
        : prior === "complete"
          ? ["previous", "previous-zip"]
          : prior === "folder-only"
            ? ["previous", undefined]
            : [undefined, undefined];
    expect(await generation(root)).toEqual(expected);
    expect((await readdir(root)).sort()).toEqual(expected[0] ? (expected[1] ? ["theme", "theme.zip"] : ["theme"]) : []);
  });

  it("rejects a symlinked private recovery record", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "dspico-export-marker-"));
    const root = path.join(parent, "live");
    const crashed = path.join(parent, "crashed");
    const outside = path.join(parent, "outside");
    await mkdir(root);
    await mkdir(path.join(root, "theme"));
    await writeFile(path.join(root, "theme", "theme.json"), "previous");
    await writeFile(path.join(root, "theme.zip"), "previous-zip");
    await writeFile(outside, "committed\n");
    const writer = await openWriter(root, async (step) => {
      if (step === "swapped") await snapshotState(root, crashed);
    });
    await writer.commitBundle("theme", files, "theme.zip", bytes("new-zip"));
    await restoreState(root, crashed);
    const record = await privateRecord(root);
    await rm(record);
    await symlink(outside, record);

    await expect(openWriter(root)).rejects.toBeInstanceOf(ExportPathError);
    await expect(readFile(outside, "utf8")).resolves.toBe("committed\n");
    await expect(readFile(path.join(await sidecar(root, "theme.previous."), "theme.json"), "utf8")).resolves.toBe(
      "previous",
    );
    await expect(readFile(await sidecar(root, "theme.zip.previous."), "utf8")).resolves.toBe("previous-zip");
  });

  it("rejects a symlinked recovery backup before changing authoritative outputs", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "dspico-export-backup-"));
    const root = path.join(parent, "live");
    const crashed = path.join(parent, "crashed");
    const outside = path.join(parent, "outside");
    await mkdir(path.join(root, "theme"), { recursive: true });
    await writeFile(path.join(root, "theme", "theme.json"), "previous");
    await writeFile(path.join(root, "theme.zip"), "previous-zip");
    await mkdir(outside);
    const writer = await openWriter(root, async (step) => {
      if (step === "folder-swapped") await snapshotState(root, crashed);
    });
    await writer.commitBundle("theme", files, "theme.zip", bytes("new-zip"));
    await restoreState(root, crashed);
    const backup = await sidecar(root, "theme.previous.");
    await rm(backup, { recursive: true });
    await symlink(outside, backup);

    await expect(openWriter(root)).rejects.toBeInstanceOf(ExportPathError);
    await expect(generation(root)).resolves.toEqual(["theme", undefined]);
  });

  it("rejects hardlinked export files without changing the other link", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "dspico-export-hardlink-"));
    const root = path.join(parent, "export");
    const outside = path.join(parent, "outside.zip");
    await mkdir(root);
    await writeFile(outside, "outside");
    await link(outside, path.join(root, "theme.zip"));

    const writer = await openWriter(root);
    await expect(writer.commitBundle("theme", files, "theme.zip", bytes("zip"))).rejects.toBeInstanceOf(
      ExportPathError,
    );
    await expect(readFile(outside, "utf8")).resolves.toBe("outside");
    await expect(readFile(path.join(root, "theme.zip"), "utf8")).resolves.toBe("outside");
  });

  it("fails closed when an owned path is replaced immediately before publication", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dspico-export-replaced-"));
    await mkdir(path.join(root, "theme"));
    await writeFile(path.join(root, "theme", "theme.json"), "previous");
    await writeFile(path.join(root, "theme.zip"), "previous-zip");
    const writer = await openWriter(root, async (step) => {
      if (step === "backed-up") {
        await mkdir(path.join(root, "theme"));
        await writeFile(path.join(root, "theme", "intruder"), "intruder");
      }
    });

    await expect(writer.commitBundle("theme", files, "theme.zip", bytes("new-zip"))).rejects.toThrow("target identity");
    await expect(readFile(path.join(root, "theme", "intruder"), "utf8")).resolves.toBe("intruder");
    await expect(readFile(path.join(await sidecar(root, "theme.previous."), "theme.json"), "utf8")).resolves.toBe(
      "previous",
    );
    await expect(readFile(await privateRecord(root), "utf8")).resolves.toBeTruthy();
  });

  it("preserves arbitrary user paths named by a forged journal", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dspico-export-hostile-"));
    await mkdir(path.join(root, "photos"));
    await writeFile(path.join(root, "photos", "family.jpg"), "family");
    await writeFile(path.join(root, "archive.zip"), "archive");
    await writeFile(journalPath(root), JSON.stringify(legacyJournal("photos", "archive.zip", [false, false])));

    await expect(openWriter(root)).rejects.toThrow("metadata");
    await expect(readFile(path.join(root, "photos", "family.jpg"), "utf8")).resolves.toBe("family");
    await expect(readFile(path.join(root, "archive.zip"), "utf8")).resolves.toBe("archive");
    await expect(readFile(journalPath(root), "utf8")).resolves.toBeTruthy();
  });

  it("rejects a coherent forged destination journal without mutating owned targets", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "dspico-export-coherent-"));
    const root = path.join(parent, "export");
    const authorityRoot = path.join(parent, "private");
    privateRoots.add(authorityRoot);
    await mkdir(path.join(root, "theme"), { recursive: true });
    await mkdir(authorityRoot);
    await writeFile(path.join(root, "theme", "theme.json"), "theme");
    await writeFile(path.join(root, "theme", "report.json"), "report");
    await writeFile(path.join(root, "theme.zip"), "new-zip");
    await writeFile(
      journalPath(root),
      JSON.stringify({
        version: 2,
        identity: "dspico-theme-export-v2",
        transaction: "00000000-0000-4000-8000-000000000000",
        existed: [false, false],
        previous: [null, null],
        next: [
          manifest([
            ["report.json", digest("report")],
            ["theme.json", digest("theme")],
          ]),
          digest("new-zip"),
        ],
      }),
    );

    await expect(AtomicExportWriter.openRoot(root, { authorityRoot })).rejects.toThrow();
    await expect(generation(root)).resolves.toEqual(["theme", "new-zip"]);
    await expect(readFile(journalPath(root), "utf8")).resolves.toBeTruthy();
    expect(await readdir(authorityRoot)).toEqual([]);
  });

  it("rejects a private recovery record bound to another canonical root", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "dspico-export-private-forgery-"));
    const root = path.join(parent, "export");
    const authorityRoot = path.join(parent, "private");
    privateRoots.add(authorityRoot);
    await mkdir(root);
    await mkdir(authorityRoot);
    const key = digest(await realpath(root));
    await writeFile(
      path.join(authorityRoot, `${key}.json`),
      JSON.stringify({
        version: 3,
        identity: "dspico-theme-export-private-v1",
        transaction: "00000000-0000-4000-8000-000000000000",
        root: { path: path.join(parent, "other"), device: "0", inode: "0" },
        targets: ["theme", "theme.zip"],
        existed: [false, false],
        previous: [null, null],
        next: [digest("folder"), digest("zip")],
      }),
    );

    await expect(AtomicExportWriter.openRoot(root, { authorityRoot })).rejects.toThrow();
    await expect(readFile(path.join(authorityRoot, `${key}.json`), "utf8")).resolves.toBeTruthy();
  });

  it("rejects a private recovery record for another product identity", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "dspico-export-private-product-"));
    const root = path.join(parent, "export");
    const authorityRoot = path.join(parent, "private");
    privateRoots.add(authorityRoot);
    await mkdir(root);
    await mkdir(authorityRoot);
    const key = digest(await realpath(root));
    await writeFile(path.join(authorityRoot, `${key}.json`), JSON.stringify({ version: 3, identity: "other-product" }));

    await expect(AtomicExportWriter.openRoot(root, { authorityRoot })).rejects.toThrow("journal");
    await expect(readFile(path.join(authorityRoot, `${key}.json`), "utf8")).resolves.toBeTruthy();
  });

  it("preserves a commit marker that has no authentic journal", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dspico-export-hostile-marker-"));
    const marker = path.join(root, ".dspico-export.transaction.json.commit");
    await writeFile(marker, "dspico-theme-export-v2:00000000-0000-4000-8000-000000000000\n");

    await expect(openWriter(root)).rejects.toThrow("metadata");
    await expect(readFile(marker, "utf8")).resolves.toContain("dspico-theme-export-v2");
  });

  it.each(["../outside", "/absolute", "nested\\ambiguous"])(
    "preserves forensic metadata for hostile journal destination %s",
    async (destination) => {
      const root = await mkdtemp(path.join(os.tmpdir(), "dspico-export-hostile-path-"));
      await writeFile(journalPath(root), JSON.stringify(legacyJournal(destination, "theme.zip", [false, false])));

      await expect(openWriter(root)).rejects.toThrow();
      await expect(readFile(journalPath(root), "utf8")).resolves.toBeTruthy();
    },
  );

  it("rejects forged existence flags without deleting owned destinations", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "dspico-export-hostile-flags-"));
    const root = path.join(parent, "live");
    const crashed = path.join(parent, "crashed");
    await mkdir(root);
    await mkdir(path.join(root, "theme"));
    await writeFile(path.join(root, "theme", "theme.json"), "unrelated-theme");
    await writeFile(path.join(root, "theme.zip"), "unrelated-zip");
    const writer = await openWriter(root, async (step) => {
      if (step === "journaled") await snapshotState(root, crashed);
    });
    await writer.commitBundle("theme", files, "theme.zip", bytes("new-zip"));
    await restoreState(root, crashed);
    const record = await privateRecord(root);
    const journal = JSON.parse(await readFile(record, "utf8")) as Record<string, unknown>;
    journal.existed = [false, false];
    await writeFile(record, JSON.stringify(journal));

    await expect(openWriter(root)).rejects.toThrow("journal");
    await expect(generation(root)).resolves.toEqual(["unrelated-theme", "unrelated-zip"]);
    await expect(readFile(record, "utf8")).resolves.toBeTruthy();
  });

  it("rejects mismatched transaction identity without consuming valid recovery sidecars", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "dspico-export-hostile-identity-"));
    const root = path.join(parent, "live");
    const crashed = path.join(parent, "crashed");
    await mkdir(root);
    const writer = await openWriter(root, async (step) => {
      if (step === "committed") await snapshotState(root, crashed);
    });
    await writer.commitBundle("theme", files, "theme.zip", bytes("new-zip"));
    await restoreState(root, crashed);
    const record = await privateRecord(root);
    const journal = JSON.parse(await readFile(record, "utf8")) as Record<string, unknown>;
    journal.transaction = "00000000-0000-4000-8000-000000000000";
    await writeFile(record, JSON.stringify(journal));

    await expect(openWriter(root)).rejects.toThrow();
    await expect(readFile(record, "utf8")).resolves.toBeTruthy();
  });

  it("rejects mismatched destinations in otherwise writer-generated recovery metadata", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "dspico-export-hostile-destination-"));
    const root = path.join(parent, "live");
    const crashed = path.join(parent, "crashed");
    await mkdir(root);
    await mkdir(path.join(root, "photos"));
    await writeFile(path.join(root, "photos", "family.jpg"), "family");
    const writer = await openWriter(root, async (step) => {
      if (step === "staged") await snapshotState(root, crashed);
    });
    await writer.commitBundle("theme", files, "theme.zip", bytes("new-zip"));
    await restoreState(root, crashed);
    const record = await privateRecord(root);
    const journal = JSON.parse(await readFile(record, "utf8")) as Record<string, unknown>;
    journal.targets = ["photos", "theme.zip"];
    await writeFile(record, JSON.stringify(journal));

    await expect(openWriter(root)).rejects.toThrow();
    await expect(readFile(path.join(root, "photos", "family.jpg"), "utf8")).resolves.toBe("family");
    await expect(readFile(record, "utf8")).resolves.toBeTruthy();
  });

  it("verifies and swaps a complete folder and ZIP", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dspico-export-"));
    const writer = await openWriter(root);
    await writer.commitBundle("theme", files, "theme.zip", bytes("zip"));
    await expect(readFile(path.join(root, "theme", "report.json"), "utf8")).resolves.toBe("report");
    await expect(readFile(path.join(root, "theme.zip"), "utf8")).resolves.toBe("zip");
  });

  it("cleans only the current private record and leaves unrelated private data", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dspico-export-private-cleanup-"));
    const authorityRoot = await authorityFor(root);
    await writeFile(path.join(authorityRoot, "keep.json"), "keep");
    const writer = await openWriter(root);
    await writer.commitBundle("theme", files, "theme.zip", bytes("zip"));

    await openWriter(root);
    expect(await readdir(authorityRoot)).toEqual(["keep.json"]);
    await expect(readFile(path.join(authorityRoot, "keep.json"), "utf8")).resolves.toBe("keep");
  });
});
