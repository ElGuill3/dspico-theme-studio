import { mkdtemp, mkdir, readFile, rename, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyOperation, createProject, currentProject } from "../../../packages/theme-core/src/index.js";
import { PathContainmentError, ProjectStore } from "./project-store.js";

const roots: string[] = [];
const stores: ProjectStore[] = [];
const openRoot = ProjectStore.openRoot;
const makeRoot = async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dspico-store-"));
  roots.push(root);
  return root;
};
const state = (status: string) =>
  applyOperation(
    createProject({
      projectId: "project-1",
      metadata: { name: "Theme", description: "Offline", author: "Author" },
      targetProfileId: "dspico-launcher-v1",
    }),
    { version: 1, type: "set-token", key: "status", value: status },
  );

beforeEach(() => {
  vi.spyOn(ProjectStore, "openRoot").mockImplementation(async (root, options) => {
    const store = await openRoot(root, options);
    stores.push(store);
    return store;
  });
});
afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
  vi.restoreAllMocks();
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ProjectStore persistence and recovery", () => {
  it.each(["temp-synced", "journal-synced"] as const)(
    "keeps the committed head after interruption at %s and reports orphans",
    async (checkpoint) => {
      const root = await makeRoot();
      const store = await ProjectStore.openRoot(root);
      await store.save("theme/project.json", state("committed"));

      const interrupted = await ProjectStore.openRoot(root, {
        checkpoint: (current) => {
          if (current === checkpoint) throw new Error("simulated interruption");
        },
      });
      await expect(interrupted.save("theme/project.json", state("partial"))).rejects.toThrow("simulated");

      const recovery = await store.open("theme/project.json");
      expect(currentProject(recovery.state).tokens.status).toBe("committed");
      expect(recovery.orphans).toEqual(checkpoint === "temp-synced" ? ["temporary"] : ["journal", "temporary"]);
    },
  );

  it("commits through fsync, journal, and atomic rename without leaving orphans", async () => {
    const root = await makeRoot();
    const checkpoints: string[] = [];
    const store = await ProjectStore.openRoot(root, {
      checkpoint: (value) => {
        checkpoints.push(value);
      },
    });

    await store.save("theme/project.json", state("saved"));

    expect(checkpoints).toEqual(["temp-synced", "journal-synced", "committed"]);
    expect(currentProject((await store.open("theme/project.json")).state).tokens.status).toBe("saved");
    expect((await store.open("theme/project.json")).orphans).toEqual([]);
  });

  it("rejects traversal, absolute paths, and symlink escapes before writing", async () => {
    const root = await makeRoot();
    const outside = await makeRoot();
    await symlink(outside, path.join(root, "escape"));
    const store = await ProjectStore.openRoot(root);

    for (const candidate of ["../outside.json", path.join(outside, "absolute.json"), "escape/project.json"]) {
      await expect(store.save(candidate, state("unsafe"))).rejects.toBeInstanceOf(PathContainmentError);
    }
    await expect(readFile(path.join(outside, "project.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a symlinked temporary sidecar instead of following it", async () => {
    const root = await makeRoot();
    const outside = await makeRoot();
    await mkdir(path.join(root, "theme"));
    await symlink(path.join(outside, "escaped.json"), path.join(root, "theme/project.json.tmp"));
    const store = await ProjectStore.openRoot(root);

    await expect(store.save("theme/project.json", state("unsafe"))).rejects.toBeInstanceOf(PathContainmentError);
    await expect(readFile(path.join(outside, "escaped.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses unknown and newer formats with zero writes", async () => {
    const root = await makeRoot();
    await mkdir(path.join(root, "theme"));
    const projectPath = path.join(root, "theme/project.json");
    const original = '{"formatVersion":2,"sentinel":"unchanged"}';
    await writeFile(projectPath, original);
    const store = await ProjectStore.openRoot(root);

    await expect(store.open("theme/project.json")).rejects.toMatchObject({ reason: "unsupported-format" });
    expect(await readFile(projectPath, "utf8")).toBe(original);
    await expect(readFile(`${projectPath}.tmp`)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(`${projectPath}.journal`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects save after the selected root is replaced by a symlink", async () => {
    const root = await makeRoot();
    const outside = await makeRoot();
    const moved = `${root}.moved`;
    roots.push(moved);
    const store = await ProjectStore.openRoot(root);
    await store.save("project.json", state("committed"));
    await rename(root, moved);
    await symlink(outside, root);

    await expect(store.save("project.json", state("unsafe"))).rejects.toThrow("changed");
    await expect(readFile(path.join(outside, "project.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(currentProject((await (await ProjectStore.openRoot(moved)).open("project.json")).state).tokens.status).toBe(
      "committed",
    );
  });

  it("anchors an in-flight save to the original root and fails closed after replacement", async () => {
    const root = await makeRoot();
    const outside = await makeRoot();
    const moved = `${root}.moved`;
    roots.push(moved);
    const initial = await ProjectStore.openRoot(root);
    await initial.save("project.json", state("committed"));
    const raced = await ProjectStore.openRoot(root, {
      checkpoint: async (checkpoint) => {
        if (checkpoint === "temp-synced") {
          await rename(root, moved);
          await symlink(outside, root);
        }
      },
    });

    await expect(raced.save("project.json", state("unsafe"))).rejects.toThrow("changed");
    await expect(readFile(path.join(outside, "project.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(currentProject((await (await ProjectStore.openRoot(moved)).open("project.json")).state).tokens.status).toBe(
      "committed",
    );
  });
});
