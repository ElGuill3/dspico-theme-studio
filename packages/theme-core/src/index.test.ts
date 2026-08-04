import { describe, expect, it } from "vitest";
import {
  FormatRefusalError,
  applyOperation,
  createPreviewModel,
  createProject,
  currentProject,
  openProject,
  recoverProject,
  redo,
  saveProject,
  undo,
  type OperationV1,
} from "./index.js";

const created = () =>
  createProject({
    projectId: "project-1",
    metadata: { name: "Theme", description: "Offline theme", author: "Author" },
    targetProfileId: "dspico-launcher-v1",
    tokens: { accent: "#ffffff", darkTheme: false },
    scenes: [
      { id: "home-top", screen: "top", mode: "home", overrides: {} },
      { id: "home-bottom", screen: "bottom", mode: "home", overrides: {} },
    ],
  });

describe("theme-core canonical lifecycle", () => {
  it("creates, saves, and reopens identical canonical state", () => {
    const state = applyOperation(created(), { version: 1, type: "set-token", key: "accent", value: "#112233" });
    const bytes = saveProject(state);

    expect(saveProject(openProject(bytes))).toBe(bytes);
    expect(currentProject(openProject(bytes))).toEqual(currentProject(state));
    expect(openProject(bytes).snapshots).toEqual([{ revision: 1, project: currentProject(state) }]);
  });

  it("refuses newer formats without changing the source bytes", () => {
    const bytes = '{"formatVersion":2,"sentinel":"unchanged"}';

    expect(() => openProject(bytes)).toThrowError(FormatRefusalError);
    expect(bytes).toBe('{"formatVersion":2,"sentinel":"unchanged"}');
  });

  it("replays metadata, token, scene, and acknowledgment operations deterministically", () => {
    const operations: OperationV1[] = [
      { version: 1, type: "set-metadata", field: "name", value: "Replayed" },
      { version: 1, type: "set-token", key: "accent", value: "#abcdef" },
      { version: 1, type: "set-scene-token", sceneId: "home-top", key: "accent", value: "#123456" },
      { version: 1, type: "acknowledge", fingerprint: "warning-b" },
      { version: 1, type: "acknowledge", fingerprint: "warning-a" },
    ];
    const state = operations.reduce(applyOperation, created());
    const project = currentProject(state);

    expect(project.metadata.name).toBe("Replayed");
    expect(project.tokens.accent).toBe("#abcdef");
    expect(project.scenes[0]?.overrides.accent).toBe("#123456");
    expect(project.scenes[1]?.overrides).toEqual({});
    expect(project.acknowledgments).toEqual(["warning-a", "warning-b"]);
    expect(JSON.parse(JSON.stringify(operations))).toEqual(operations);
    expect(saveProject(openProject(saveProject(state)))).toBe(saveProject(state));
  });

  it("upserts a missing scene only when deterministic screen identity is supplied", () => {
    const empty = createProject({
      projectId: "empty",
      metadata: { name: "Theme", description: "Offline theme", author: "Author" },
      targetProfileId: "dspico-launcher-v1",
    });
    const state = applyOperation(empty, {
      version: 1,
      type: "set-scene-token",
      sceneId: "home:top",
      screen: "top",
      mode: "home",
      key: "accent",
      value: "#123456",
    });

    expect(currentProject(state).scenes).toEqual([
      { id: "home:top", screen: "top", mode: "home", overrides: { accent: "#123456" } },
    ]);
    expect(saveProject(openProject(saveProject(state)))).toBe(saveProject(state));
    expect(() =>
      currentProject(
        applyOperation(empty, {
          version: 1,
          type: "set-scene-token",
          sceneId: "missing",
          key: "accent",
          value: "#123456",
        }),
      ),
    ).toThrow("Unknown scene: missing");
  });

  it("refuses supplied identity that conflicts with an existing scene", () => {
    expect(() =>
      currentProject(
        applyOperation(created(), {
          version: 1,
          type: "set-scene-token",
          sceneId: "home-top",
          screen: "bottom",
          mode: "home",
          key: "accent",
          value: "#123456",
        }),
      ),
    ).toThrow("Scene identity mismatch: home-top");
  });

  it("discards redo when a new edit branches after undo", () => {
    const withA = applyOperation(created(), { version: 1, type: "set-token", key: "step", value: "A" });
    const withB = applyOperation(withA, { version: 1, type: "set-token", key: "step", value: "B" });
    const withC = applyOperation(withB, { version: 1, type: "set-token", key: "step", value: "C" });
    const branch = applyOperation(undo(withC), { version: 1, type: "set-token", key: "step", value: "D" });

    expect(currentProject(branch).tokens.step).toBe("D");
    expect(redo(branch)).toEqual(branch);
    expect(branch.operations).not.toContainEqual(withC.operations[2]);
  });

  it("bounds snapshots and operations at the documented retention limits", () => {
    let state = created();
    for (let index = 1; index <= 205; index += 1) {
      state = applyOperation(state, { version: 1, type: "set-token", key: "sequence", value: index });
    }

    expect(state.operations).toHaveLength(200);
    expect(state.snapshots).toHaveLength(10);
    expect(state.snapshots.map(({ revision }) => revision)).toEqual([20, 40, 60, 80, 100, 120, 140, 160, 180, 200]);
    expect(currentProject(state).tokens.sequence).toBe(205);
  });

  it("recovers the committed head and reports interrupted staging as orphan data", () => {
    const committed = saveProject(
      applyOperation(created(), { version: 1, type: "set-token", key: "status", value: "committed" }),
    );
    const staged = saveProject(
      applyOperation(created(), { version: 1, type: "set-token", key: "status", value: "partial" }),
    );

    const recovery = recoverProject({ committedBytes: committed, stagedBytes: staged, journalBytes: "partial-entry" });

    expect(currentProject(recovery.state).tokens.status).toBe("committed");
    expect(recovery.orphans).toEqual(["staged-project", "journal"]);
  });
});

describe("dual-screen preview model", () => {
  const project = currentProject(
    createProject({
      projectId: "preview-project",
      metadata: { name: "Pocket Library", description: "Choose a favorite", author: "Author" },
      targetProfileId: "dspico-launcher-v1",
      tokens: { background: "#10243a", accent: "#f4b942" },
      scenes: [
        { id: "home-top", screen: "top", mode: "home", overrides: { accent: "#ef476f" } },
        { id: "home-bottom", screen: "bottom", mode: "home", overrides: {} },
        { id: "library-top", screen: "top", mode: "library", overrides: { accent: "#06d6a0" } },
        { id: "library-bottom", screen: "bottom", mode: "library", overrides: {} },
      ],
    }),
  );

  it("builds distinct interactive 256 by 192 top and bottom scenes with representative content", () => {
    const preview = createPreviewModel(project, "home");

    expect(preview.modes).toEqual(["home", "library"]);
    expect(preview.scenes.map(({ screen, width, height }) => ({ screen, width, height }))).toEqual([
      { screen: "top", width: 256, height: 192 },
      { screen: "bottom", width: 256, height: 192 },
    ]);
    expect(preview.scenes.every(({ content }) => content.items.length > 0)).toBe(true);
  });

  it("isolates overrides to one physical screen and launcher mode tuple", () => {
    const home = createPreviewModel(project, "home");
    const library = createPreviewModel(project, "library");

    expect(home.scenes.find(({ screen }) => screen === "top")?.tokens.accent).toBe("#ef476f");
    expect(home.scenes.find(({ screen }) => screen === "bottom")?.tokens.accent).toBe("#f4b942");
    expect(library.scenes.find(({ screen }) => screen === "top")?.tokens.accent).toBe("#06d6a0");
  });

  it("reports honest backed and approximate fidelity without claiming export authority", () => {
    const preview = createPreviewModel(project, "home");
    const serialized = JSON.stringify(preview);

    expect(preview.fidelity.map(({ label }) => label)).toEqual(["launcher-vector-backed", "Chromium approximation"]);
    expect(preview.previewAffectsExport).toBe(false);
    expect(serialized).not.toMatch(/pixel[- ]perfect|DS[- ]parity|Main|Sub/i);
    expect(serialized).not.toContain("canExport");
  });
});
