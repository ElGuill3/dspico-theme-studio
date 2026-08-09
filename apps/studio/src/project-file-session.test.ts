import path from "node:path";
import { describe, expect, it } from "vitest";
import { createProject, createProjectV3 } from "../../../packages/theme-core/src/index.js";
import { ProjectFileSession, type ProjectFileStore } from "./project-file-session.js";

const metadata = { name: "Theme", description: "Offline", author: "Author" };
const state = createProject({ projectId: "project", metadata, targetProfileId: "dspico-launcher-v1" });

describe("ProjectFileSession", () => {
  it("commits a selected open path only after the project opens successfully", async () => {
    const selected = ["/projects/original.json", "/projects/refused.json"];
    const saves: string[] = [];
    const stores = new Map<string, ProjectFileStore>([
      [
        "/projects",
        {
          open: async (name) => {
            if (name === "refused.json") throw new Error("refused project");
            return { state, orphans: [] };
          },
          save: async (name) => void saves.push(name),
        },
      ],
    ]);
    const session = new ProjectFileSession(
      async () => selected.shift()!,
      async (root) => stores.get(root)!,
    );

    await session.open();
    await expect(session.open()).rejects.toThrow("refused project");
    await session.save(state);

    expect(saves).toEqual(["original.json"]);
  });

  it("uses a fresh path for a new project and keeps the prior path when that save fails", async () => {
    const selected = ["/projects/original.json", "/projects/replacement.json", "/projects/saved.json"];
    const saves: string[] = [];
    let rejectReplacement = true;
    const store: ProjectFileStore = {
      open: async () => ({ state, orphans: [] }),
      save: async (name) => {
        saves.push(name);
        if (name === "replacement.json" && rejectReplacement) {
          rejectReplacement = false;
          throw new Error("cancelled replacement");
        }
      },
    };
    const session = new ProjectFileSession(
      async () => selected.shift()!,
      async (root) => {
        expect(root).toBe(path.dirname("/projects/original.json"));
        return store;
      },
    );

    await session.open();
    await expect(session.save(state, { newProject: true })).rejects.toThrow("cancelled replacement");
    await session.save(state);
    await session.save(state, { newProject: true });
    await session.save(state);

    expect(saves).toEqual(["replacement.json", "original.json", "saved.json", "saved.json"]);
  });

  it("uses Save migrated copy for V3 and changes the session only after the writer commits", async () => {
    const selected = ["/projects/source.json", "/projects/migrated.json", "/projects/after.json"];
    const calls: string[] = [];
    let fail = true;
    // prettier-ignore
    const store = {
      open: async () => ({ state, orphans: [] }),
      save: async (name: string) => void calls.push(`save:${name}`),
      saveV3: async (name: string) => {
        calls.push(`v3:${name}`);
        if (fail) {
          fail = false;
          throw new Error("atomic writer failed");
        }
      },
    } satisfies ProjectFileStore & { saveV3: (name: string, state: ReturnType<typeof createProjectV3>) => Promise<void> };
    const session = new ProjectFileSession(
      async () => selected.shift()!,
      async () => store,
    );
    await session.open();
    const v3 = createProjectV3({ projectId: "v3", metadata });
    await expect(session.saveMigratedCopy(v3)).rejects.toThrow("atomic writer failed");
    await session.save(v3 as never);
    await session.saveMigratedCopy(v3);
    await session.save(v3 as never);
    expect(calls).toEqual(["v3:migrated.json", "save:source.json", "v3:after.json", "save:after.json"]);
  });
});
