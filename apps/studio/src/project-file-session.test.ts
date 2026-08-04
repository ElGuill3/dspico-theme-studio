import path from "node:path";
import { describe, expect, it } from "vitest";
import { createProject } from "../../../packages/theme-core/src/index.js";
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
});
