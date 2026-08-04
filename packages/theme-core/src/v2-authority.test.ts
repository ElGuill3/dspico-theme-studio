import { describe, expect, it } from "vitest";
import {
  applyOperation,
  applyOperationV2,
  createProject,
  createProjectV2,
  migrateV1ToV2,
  openProjectV2,
  redoV2,
  saveProjectV2,
  undo,
  undoV2,
  type OperationV1,
  type ProjectStateV2,
} from "./index.js";
import { sha256 } from "./hash-v2.js";

const v1 = () =>
  createProject({
    projectId: "legacy",
    metadata: { name: "N", description: "D", author: "A" },
    targetProfileId: "dspico-launcher-v1",
    tokens: { accent: "#fff" },
  });
const v2 = () => createProjectV2({ projectId: "v2", metadata: { name: "N", description: "D", author: "A" } });

// prettier-ignore
describe("V1 to V2 authority migration", () => {
  it("maps identities, redo, nested transitions, and a source-bound notice", () => {
    const operations: OperationV1[] = [
      { version: 1, type: "set-scene-token", sceneId: "home-top", screen: "top", mode: "home", key: "accent", value: "#123" },
      { version: 1, type: "set-scene-token", sceneId: "home-top", key: "accent", value: "#456" },
      { version: 1, type: "set-token", key: "coverStartScalePercent", value: 150 },
      { version: 1, type: "set-metadata", field: "name", value: "Edited" },
    ];
    const state = operations.reduce(applyOperation, v1()), source = JSON.stringify(undo(state)), result = migrateV1ToV2(source);
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(source).toBe(JSON.stringify(undo(state))); expect(result.sourceHash).toMatch(/^[a-f0-9]{64}$/); expect(result.notice.sourceHash).toBe(result.sourceHash);
    expect(result.candidate).toMatchObject({ cursor: 3, operations: expect.arrayContaining([expect.objectContaining({ version: 2, type: "set-launch-transition-field" })]) });
    expect(result.candidate.project).toMatchObject({ themeKind: "material", launchTransition: { coverStartScalePercent: 150 }, notices: [result.notice.message] });
    expect(result.candidate.project.scenes[0]).toMatchObject({ id: "home-top", screen: "top", mode: "home", overrides: { accent: "#456" } });
    expect(redoV2(result.candidate).project.metadata.name).toBe("Edited");
  });
  it("maps non-transition tokens and acknowledgments to exact V2 operations", () => {
    const state = applyOperation(
      applyOperation(v1(), { version: 1, type: "set-token", key: "accent", value: "#abc" }),
      { version: 1, type: "acknowledge", fingerprint: "fp-1" },
    );
    const result = migrateV1ToV2(state);
    expect(result.candidate.operations).toEqual([
      { version: 2, type: "set-material-token", key: "accent", value: "#abc" },
      { version: 2, type: "acknowledge", fingerprint: "fp-1" },
    ]);
    expect(result.candidate.project).toMatchObject({ tokens: { accent: "#abc" }, acknowledgments: ["fp-1"] });
  });
  it("accepts equal root and nested transitions with a deterministic notice", () => {
    const state = v1();
    const initial = state.initial as typeof state.initial & {
      coverFinalAlpha?: number;
      launchTransition?: { coverFinalAlpha?: number };
    };
    initial.coverFinalAlpha = 18;
    initial.launchTransition = { coverFinalAlpha: 18 };
    const result = migrateV1ToV2(state);
    expect(result.candidate.project.launchTransition.coverFinalAlpha).toBe(18);
    expect(result.notice.message).toBe(`migrated-v1:${result.sourceHash}`);
    expect(result.candidate.project.notices).toEqual([result.notice.message]);
  });
  it("preserves base revision and snapshot revisions and content", () => {
    const state = v1();
    state.baseRevision = 7;
    state.snapshots = [
      {
        revision: 7,
        project: {
          ...state.initial,
          projectId: "snapshot",
          metadata: { ...state.initial.metadata, name: "Snapshot" },
          tokens: { accent: "snapshot" },
          scenes: [{ id: "snapshot-scene", screen: "bottom", mode: "home", overrides: { accent: "snapshot" } }],
          assetManifest: [{ path: "assets/snapshot.png", sha256: "snapshot-hash" }],
          acknowledgments: ["snapshot-fp"],
        },
      },
    ];
    const result = migrateV1ToV2(state);
    expect(result.candidate.baseRevision).toBe(7);
    expect(result.candidate.snapshots).toHaveLength(1);
    expect(result.candidate.snapshots[0]).toMatchObject({
      revision: 7,
      project: {
        projectId: "snapshot",
        metadata: { name: "Snapshot" },
        tokens: { accent: "snapshot" },
        scenes: [{ id: "snapshot-scene", screen: "bottom", mode: "home", overrides: { accent: "snapshot" } }],
        assetManifest: [{ path: "assets/snapshot.png", sha256: "snapshot-hash" }],
        acknowledgments: ["snapshot-fp"],
      },
    });
  });
  it("defaults transitions and refuses invalid, conflicting, unknown, and ambiguous input", () => {
    expect(migrateV1ToV2(JSON.stringify(v1())).candidate.project.launchTransition).toEqual({ coverStartScalePercent: 100, coverFinalAlpha: 12, scrimFinalAlpha: 14 });
    expect(() => migrateV1ToV2(JSON.stringify(applyOperation(v1(), { version: 1, type: "set-token", key: "coverFinalAlpha", value: 32 })))).toThrow();
    expect(() => migrateV1ToV2(JSON.stringify(applyOperation(v1(), { version: 1, type: "set-scene-token", sceneId: "missing", key: "accent", value: "#000" })))).toThrow();
    const identified = applyOperation(v1(), { version: 1, type: "set-scene-token", sceneId: "scene", screen: "top", mode: "home", key: "x", value: 1 });
    expect(() => migrateV1ToV2(JSON.stringify(applyOperation(identified, { version: 1, type: "set-scene-token", sceneId: "scene", screen: "bottom", mode: "home", key: "x", value: 2 })))).toThrow();
    const conflict = v1(); (conflict.initial.tokens as Record<string, unknown>).coverStartScalePercent = 100; (conflict.initial as unknown as { launchTransition: object }).launchTransition = { coverStartScalePercent: 101 };
    expect(() => migrateV1ToV2(conflict)).toThrow(); expect(() => migrateV1ToV2({ ...v1(), operations: [{ version: 9 } as never], cursor: 1 })).toThrow();
  });
});

// prettier-ignore
describe("V2 replay and history", () => {
  it("preserves redo on Save, branches on new operation, and bounds history", () => {
    let state = v2(); for (const value of ["A", "B", "C"]) state = applyOperationV2(state, { version: 2, type: "set-material-token", key: "step", value });
    const saved = openProjectV2(saveProjectV2(undoV2(state))); expect(saved.cursor).toBe(2); expect(redoV2(saved).project.tokens.step).toBe("C");
    const branch = applyOperationV2(saved, { version: 2, type: "set-material-token", key: "step", value: "D" }); expect(redoV2(branch).project.tokens.step).toBe("D");
    let bounded: ProjectStateV2 = v2(); for (let value = 1; value <= 205; value += 1) bounded = applyOperationV2(bounded, { version: 2, type: "set-material-token", key: "sequence", value });
    expect(bounded.operations).toHaveLength(200); expect(bounded.snapshots).toHaveLength(10); expect(bounded.snapshots.map(({ revision }) => revision)).toEqual([20, 40, 60, 80, 100, 120, 140, 160, 180, 200]);
  });
  it("saves without edits and preserves the full redo tail and snapshots", () => {
    let state = v2();
    for (let value = 1; value <= 20; value += 1) state = applyOperationV2(state, { version: 2, type: "set-material-token", key: "sequence", value });
    const undone = undoV2(undoV2(openProjectV2(saveProjectV2(state))));
    const cursor = undone.cursor, operations = JSON.stringify(undone.operations), snapshotBytes = JSON.stringify(undone.snapshots);
    const saved = saveProjectV2(undone), persisted = JSON.parse(saved) as ProjectStateV2;
    expect(undone.cursor).toBe(cursor); expect(JSON.stringify(undone.operations)).toBe(operations);
    expect(persisted.operations).toEqual(undone.operations); expect(persisted.cursor).toBe(cursor);
    expect(JSON.stringify(persisted.snapshots)).toBe(snapshotBytes); expect(persisted.snapshots).toEqual(undone.snapshots);
    expect(redoV2(redoV2(openProjectV2(saved))).project.tokens.sequence).toBe(20);
  });
  it("keeps repeated migration and canonical bytes and hashes deterministic", () => {
    const source = JSON.stringify(v1()), first = migrateV1ToV2(source), second = migrateV1ToV2(source);
    const firstBytes = saveProjectV2(first.candidate), secondBytes = saveProjectV2(second.candidate);
    expect(first.candidate).toEqual(second.candidate); expect(firstBytes).toBe(secondBytes); expect(sha256(firstBytes)).toBe(sha256(secondBytes));
  });
  it("keeps object-source arrays and maps unchanged through migration, save, and replay", () => {
    const source = applyOperation(v1(), { version: 1, type: "set-scene-token", sceneId: "scene", screen: "top", mode: "home", key: "accent", value: "#123" });
    source.initial.assetManifest = [{ path: "assets/a.png", sha256: "asset-hash" }];
    const before = JSON.stringify(source), reopened = openProjectV2(saveProjectV2(migrateV1ToV2(source).candidate));
    expect(reopened.project.scenes[0]).toMatchObject({ id: "scene", overrides: { accent: "#123" } });
    expect(source.initial.assetManifest).toEqual([{ path: "assets/a.png", sha256: "asset-hash" }]);
    expect(JSON.stringify(source)).toBe(before);
  });
});
