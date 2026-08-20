import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ExportRevealCapability } from "./export-reveal.js";

const roots: string[] = [];
const publication = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dspico-reveal-"));
  roots.push(root);
  await mkdir(path.join(root, "theme"));
  await writeFile(path.join(root, "theme/theme.json"), "theme");
  await writeFile(path.join(root, "theme.zip"), "zip");
  return root;
};
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("ExportRevealCapability", () => {
  it("reveals only fixed unchanged paths from the latest publication", async () => {
    const shown: string[] = [];
    const capability = new ExportRevealCapability((candidate) => void shown.push(candidate));
    const firstRoot = await publication();
    const first = await capability.publish(firstRoot);
    await capability.reveal(first.id, "folder");
    await capability.reveal(first.id, "zip");
    expect(shown).toEqual([path.join(firstRoot, "theme"), path.join(firstRoot, "theme.zip")]);

    const secondRoot = await publication();
    const second = await capability.publish(secondRoot);
    await expect(capability.reveal(first.id, "folder")).rejects.toThrow("no longer the latest");
    await capability.reveal(second.id, "folder");
  });

  it("has no capability after restart or explicit project replacement", async () => {
    const root = await publication();
    const capability = new ExportRevealCapability(() => undefined);
    const published = await capability.publish(root);
    capability.clear();
    await expect(capability.reveal(published.id, "folder")).rejects.toThrow("no longer the latest");
    await expect(new ExportRevealCapability(() => undefined).reveal(published.id, "zip")).rejects.toThrow(
      "no longer the latest",
    );
  });

  it("preserves the current capability after a wrong token or failed later export", async () => {
    const shown: string[] = [];
    const root = await publication();
    const capability = new ExportRevealCapability((candidate) => void shown.push(candidate));
    const published = await capability.publish(root);
    await expect(capability.reveal("wrong-token", "folder")).rejects.toThrow("no longer the latest");
    await expect(Promise.reject(new Error("later export failed"))).rejects.toThrow("later export failed");
    await capability.reveal(published.id, "zip");
    expect(shown).toEqual([path.join(root, "theme.zip")]);
  });

  it("rejects an unknown kind and clears the capability", async () => {
    const root = await publication();
    const capability = new ExportRevealCapability(() => undefined);
    const published = await capability.publish(root);
    await expect(capability.reveal(published.id, "other" as never)).rejects.toThrow("Unknown export reveal target");
    await expect(capability.reveal(published.id, "folder")).rejects.toThrow("no longer the latest");
  });

  it.each(["deleted", "replaced", "symlink", "drift"] as const)(
    "rejects and clears a %s folder target",
    async (mutation) => {
      const root = await publication();
      const capability = new ExportRevealCapability(() => undefined);
      const published = await capability.publish(root);
      const folder = path.join(root, "theme");
      if (mutation === "deleted") await rm(folder, { recursive: true });
      if (mutation === "replaced") {
        await rename(folder, `${folder}-retained`);
        await mkdir(folder);
        await writeFile(path.join(folder, "theme.json"), "theme");
      }
      if (mutation === "symlink") {
        const outside = await publication();
        await rm(folder, { recursive: true });
        await symlink(path.join(outside, "theme"), folder);
      }
      if (mutation === "drift") await writeFile(path.join(folder, "theme.json"), "changed");
      await expect(capability.reveal(published.id, "folder")).rejects.toThrow();
      await expect(capability.reveal(published.id, "zip")).rejects.toThrow("no longer the latest");
    },
  );

  it("rejects ZIP deletion, inode replacement, symlink, and content drift", async () => {
    for (const mutation of ["deleted", "replaced", "symlink", "drift"] as const) {
      const root = await publication();
      const capability = new ExportRevealCapability(() => undefined);
      const published = await capability.publish(root);
      const zip = path.join(root, "theme.zip");
      if (mutation === "deleted") await rm(zip);
      if (mutation === "replaced") {
        await rename(zip, `${zip}-retained`);
        await writeFile(zip, "zip");
      }
      if (mutation === "symlink") {
        const outside = path.join(root, "outside.zip");
        await writeFile(outside, "zip");
        await rm(zip);
        await symlink(outside, zip);
      }
      if (mutation === "drift") await writeFile(zip, "changed");
      await expect(capability.reveal(published.id, "zip")).rejects.toThrow();
    }
  });

  it("rejects destination replacement without following the replacement", async () => {
    const root = await publication();
    const parent = path.dirname(root);
    const moved = `${root}-moved`;
    const outside = `${root}-outside`;
    roots.push(moved, outside);
    const capability = new ExportRevealCapability(() => undefined);
    const published = await capability.publish(root);
    await rename(root, moved);
    await mkdir(outside);
    await symlink(outside, root);
    await expect(capability.reveal(published.id, "folder")).rejects.toThrow();
    await expect(readFile(path.join(moved, "theme/theme.json"), "utf8")).resolves.toBe("theme");
    void parent;
  });
});
