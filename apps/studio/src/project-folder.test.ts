import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createProject, createProjectV3, saveProject, saveProjectV3 } from "../../../packages/theme-core/src/index.js";
import { openProjectFolder, prepareNewProjectFolder, ProjectFolderError } from "./project-folder.js";

const metadata = { name: "Theme", description: "Offline", author: "Author" };

describe("project folder lifecycle", () => {
  it("accepts an empty regular folder for creation and rejects non-empty or non-directory targets", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "dspico-project-folder-"));
    const empty = path.join(parent, "empty");
    const occupied = path.join(parent, "occupied");
    await mkdir(empty);
    await mkdir(occupied);
    await writeFile(path.join(occupied, "notes.txt"), "keep");
    const file = path.join(parent, "file");
    await writeFile(file, "keep");

    const prepared = await prepareNewProjectFolder(empty);
    expect(prepared).toMatchObject({ root: empty, label: "empty" });
    await prepared.authority.close();
    await expect(prepareNewProjectFolder(occupied)).rejects.toThrow("not empty");
    await expect(prepareNewProjectFolder(file)).rejects.toThrow("folder");
    await expect(readFile(path.join(occupied, "notes.txt"), "utf8")).resolves.toBe("keep");
  });

  it("rejects symlinked roots and canonical project files without touching their targets", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "dspico-project-symlink-"));
    const outside = path.join(parent, "outside");
    await mkdir(outside);
    await writeFile(path.join(outside, "project.json"), "outside");
    const linkedRoot = path.join(parent, "linked-root");
    await symlink(outside, linkedRoot);
    await expect(prepareNewProjectFolder(linkedRoot)).rejects.toBeInstanceOf(ProjectFolderError);

    const root = path.join(parent, "root");
    await mkdir(root);
    await symlink(path.join(outside, "project.json"), path.join(root, "project.json"));
    await expect(openProjectFolder(root)).rejects.toThrow("regular file");
    await expect(readFile(path.join(outside, "project.json"), "utf8")).resolves.toBe("outside");
  });

  it("detects Material and Custom projects from validated content and accepts old file selection", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "dspico-project-open-"));
    const material = path.join(parent, "material");
    const custom = path.join(parent, "custom");
    await mkdir(material);
    await mkdir(custom);
    await writeFile(
      path.join(material, "project.json"),
      saveProject(createProject({ projectId: "material", metadata, targetProfileId: "dspico-launcher-v1" })),
    );
    await writeFile(
      path.join(custom, "project.json"),
      saveProjectV3(createProjectV3({ projectId: "custom", metadata })),
    );

    const openedMaterial = await openProjectFolder(material);
    expect(openedMaterial).toMatchObject({ type: "material", label: "material" });
    await openedMaterial.authority.close();
    const openedCustom = await openProjectFolder(path.join(custom, "project.json"));
    expect(openedCustom).toMatchObject({
      type: "custom",
      label: "custom",
    });
    await openedCustom.authority.close();
  });

  it.each([
    ["corrupt", "{"],
    ["unknown", JSON.stringify({ formatVersion: 99 })],
    ["invalid", JSON.stringify({ formatVersion: 1 })],
  ])("returns actionable diagnostics for %s content", async (_name, bytes) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dspico-project-invalid-"));
    await writeFile(path.join(root, "project.json"), bytes);
    await expect(openProjectFolder(root)).rejects.toBeInstanceOf(ProjectFolderError);
  });

  it("aborts an exclusive create claim when another entry appears", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dspico-project-create-race-"));
    const prepared = await prepareNewProjectFolder(root, {
      checkpoint: async (checkpoint) => {
        if (checkpoint === "create-empty-checked") await writeFile(path.join(root, "intruder.txt"), "keep");
      },
    });
    await expect(prepared.authority.claimProjectJson(Buffer.from("project"))).rejects.toThrow("Another entry appeared");
    await expect(readFile(path.join(root, "intruder.txt"), "utf8")).resolves.toBe("keep");
    await prepared.authority.close();
  });

  it("anchors creation to the selected inode and aborts when its path becomes a symlink", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "dspico-project-root-race-"));
    const root = path.join(parent, "root");
    const moved = path.join(parent, "moved");
    const outside = path.join(parent, "outside");
    await mkdir(root);
    await mkdir(outside);
    const prepared = await prepareNewProjectFolder(root, {
      checkpoint: async (checkpoint) => {
        if (checkpoint === "create-empty-checked") {
          await rename(root, moved);
          await symlink(outside, root);
        }
      },
    });
    await expect(prepared.authority.claimProjectJson(Buffer.from("project"))).rejects.toThrow("changed");
    await expect(readFile(path.join(outside, "project.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(path.join(moved, "project.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await prepared.authority.close();
  });

  it.each(["replace", "symlink"] as const)("rejects project.json %s during no-follow open", async (mutation) => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "dspico-project-file-race-"));
    const root = path.join(parent, "root");
    const outside = path.join(parent, "outside.json");
    await mkdir(root);
    const original = saveProject(
      createProject({ projectId: "original", metadata, targetProfileId: "dspico-launcher-v1" }),
    );
    await writeFile(path.join(root, "project.json"), original);
    await writeFile(outside, original.replace("original", "outside"));
    await expect(
      openProjectFolder(root, {
        checkpoint: async (checkpoint) => {
          if (checkpoint !== "project-file-opened") return;
          await rm(path.join(root, "project.json"));
          if (mutation === "symlink") await symlink(outside, path.join(root, "project.json"));
          else await writeFile(path.join(root, "project.json"), await readFile(outside));
        },
      }),
    ).rejects.toThrow("changed while it was being opened");
  });

  it("rejects root replacement during project open", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "dspico-project-open-root-race-"));
    const root = path.join(parent, "root");
    const moved = path.join(parent, "moved");
    const outside = path.join(parent, "outside");
    await mkdir(root);
    await mkdir(outside);
    await writeFile(
      path.join(root, "project.json"),
      saveProject(createProject({ projectId: "safe", metadata, targetProfileId: "dspico-launcher-v1" })),
    );
    await expect(
      openProjectFolder(root, {
        checkpoint: async (checkpoint) => {
          if (checkpoint === "project-open-pending") {
            await rename(root, moved);
            await symlink(outside, root);
          }
        },
      }),
    ).rejects.toThrow("changed");
    await expect(readFile(path.join(outside, "project.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
