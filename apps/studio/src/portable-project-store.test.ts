import { createHash } from "node:crypto";
import { cp, lstat, mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyOperationV3,
  createProjectV2,
  createMediaRefV3,
  createProjectV3,
  currentProjectV3,
  migrateLegacyMaterial,
  saveLauncherParityProject,
  reachableAssetHashes,
  redoV2,
  replayV2,
  saveProjectV2,
  undoV2,
} from "../../../packages/theme-core/src/index.js";
import { PortableProjectStore } from "./portable-project-store.js";
const roots: string[] = [];
const stores: PortableProjectStore[] = [];
const openRoot = PortableProjectStore.openRoot;
const bytes = (value: number) => new Uint8Array([137, 80, 78, 71, value]);
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
// prettier-ignore
const ref = (value: Uint8Array, assetPath = `assets/sha256/${hash(value)}.png`) => ({ sha256: hash(value), path: assetPath });
// prettier-ignore
const project = (...refs: { sha256: string; path: string }[]) => { const state = createProjectV2({ projectId: "custom", themeKind: "custom", metadata: { name: "N", description: "D", author: "A" } }); state.initial.assets = refs; state.project = structuredClone(state.initial); return state; };
// prettier-ignore
const makeRoot = async () => { const root = await mkdtemp(path.join(tmpdir(), "dspico-bundle-")); roots.push(root); return root; };
// prettier-ignore
beforeEach(() => {
  vi.spyOn(PortableProjectStore, "openRoot").mockImplementation(async (root, options) => {
    const store = await openRoot(root, options);
    stores.push(store);
    return store;
  });
});
afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
// prettier-ignore
describe("portable bundle path and authority boundary", () => {
  // prettier-ignore
  it.each(["/outside.png", "../outside.png", "assets\\sha256\\x.png", "assets//sha256/x.png", "./assets/sha256/x.png"])("diagnoses ambiguous or escaping reference %s without changing project bytes", async (assetPath) => { const root = await makeRoot(); const state = project({ sha256: "x".repeat(64), path: assetPath }); const original = saveProjectV2(state); await writeFile(path.join(root, "project.json"), original); const opened = await (await PortableProjectStore.openRoot(root)).open(); expect(opened.canEdit).toBe(false); expect(opened.diagnostics.some(({ code }) => code === "unsafe-reference")).toBe(true); expect(await readFile(path.join(root, "project.json"), "utf8")).toBe(original); });
  // prettier-ignore
  it("refuses symlink escapes, missing bytes, mismatched bytes, and reports durable orphans", async () => { const root = await makeRoot(), outside = await makeRoot(), value = bytes(1), asset = ref(value), state = project(asset); await writeFile(path.join(root, "project.json"), saveProjectV2(state)); await expect((await PortableProjectStore.openRoot(root)).save(state, [{ sha256: asset.sha256, bytes: bytes(9) }])).rejects.toThrow("hash mismatch"); await mkdir(path.join(root, "assets")); await symlink(outside, path.join(root, "assets", "sha256")); expect((await (await PortableProjectStore.openRoot(root)).open()).diagnostics.some(({ code }) => code === "unsafe-reference")).toBe(true); await rm(path.join(root, "assets", "sha256")); await mkdir(path.join(root, "assets/sha256"), { recursive: true }); let opened = await (await PortableProjectStore.openRoot(root)).open(); expect(opened.diagnostics.some(({ code }) => code === "missing-asset")).toBe(true); await writeFile(path.join(root, asset.path), bytes(9)); opened = await (await PortableProjectStore.openRoot(root)).open(); expect(opened.canEdit).toBe(false); expect(opened.diagnostics.some(({ code }) => code === "corrupt-asset")).toBe(true); await writeFile(path.join(root, asset.path), value); await writeFile(path.join(root, "assets/sha256/orphan.png"), bytes(7)); opened = await (await PortableProjectStore.openRoot(root)).open(); expect(opened.canEdit).toBe(true); expect(opened.orphans).toContain("assets/sha256/orphan.png"); expect(Array.from(await readFile(path.join(root, "assets/sha256/orphan.png")))).toEqual([...bytes(7)]); });
  // prettier-ignore
  it.each(["staging-synced", "journal-synced", "asset-placed", "assets-placed", "project-placed", "root-synced", "committed"] as const)("keeps the correct JSON authority through the %s crash checkpoint", async (checkpoint) => { const root = await makeRoot(), first = bytes(1), second = bytes(2), oldState = project(ref(first)), nextState = project(ref(second)), store = await PortableProjectStore.openRoot(root); await store.save(oldState, [{ bytes: first, sha256: hash(first) }]); const prior = await readFile(path.join(root, "project.json")), next = Buffer.from(saveProjectV2(nextState)); const interrupted = await PortableProjectStore.openRoot(root, { checkpoint: (phase) => { if (phase === checkpoint) throw new Error("crash"); } }); await expect(interrupted.save(nextState, [{ bytes: second, sha256: hash(second) }])).rejects.toThrow("crash"); const late = checkpoint === "project-placed" || checkpoint === "root-synced" || checkpoint === "committed", expected = late ? nextState : oldState, expectedBytes = late ? next : prior; if (!late) expect(await readFile(path.join(root, "project.json"))).toEqual(prior); const recovery = await store.open(), again = await store.open(); expect(await readFile(path.join(root, "project.json"))).toEqual(expectedBytes); expect(saveProjectV2(recovery.state)).toBe(saveProjectV2(expected)); expect(again.orphans).toEqual(recovery.orphans); expect(await readdir(path.join(root, ".studio"))).not.toContain("recovery.json"); if (checkpoint === "staging-synced") expect(recovery.orphans.some((item) => item.startsWith(".studio/staging/"))).toBe(true); if (checkpoint === "journal-synced") expect(recovery.orphans).toContain(".studio/journal.json"); if (checkpoint === "asset-placed" || checkpoint === "assets-placed") { expect(recovery.orphans.some((item) => item.includes(hash(second)))).toBe(true); expect(Array.from(await readFile(path.join(root, `assets/sha256/${hash(second)}.png`)))).toEqual([...second]); } });
  const withAssets = (value: ReturnType<typeof replayV2>, ...assets: { sha256: string; path: string }[]) => ({
    ...value,
    assets,
  });

  it("deduplicates identical bytes, survives a moved bundle, and retains state-unique history assets", async () => {
    const initialAsset = ref(bytes(3));
    const replayAsset = ref(bytes(4));
    const currentAsset = ref(bytes(5));
    const undoAsset = ref(bytes(6));
    const redoAsset = ref(bytes(7));
    const snapshotAsset = ref(bytes(8));
    const retained = project(initialAsset);
    retained.operations = [
      { version: 2, type: "set-material-token", key: "history", value: "replay" },
      { version: 2, type: "set-material-token", key: "history", value: "redo" },
    ];
    retained.cursor = 1;
    const replayed = replayV2(retained.initial, retained.operations.slice(0, retained.cursor));
    const undone = undoV2(retained);
    const redone = redoV2(undone);
    retained.project = withAssets(replayed, currentAsset);
    retained.snapshots = [
      { revision: 1, project: withAssets(replayed, replayAsset) },
      { revision: 2, project: withAssets(undone.project, undoAsset) },
      { revision: 3, project: withAssets(redone.project, redoAsset) },
      { revision: 4, project: withAssets(retained.initial, snapshotAsset) },
    ];
    expect(reachableAssetHashes(retained)).toEqual(
      [initialAsset, replayAsset, currentAsset, undoAsset, redoAsset, snapshotAsset]
        .map(({ sha256 }) => sha256)
        .sort(),
    );

    const root = await makeRoot();
    const moved = await makeRoot();
    const first = bytes(1);
    const second = bytes(2);
    const a = { ...ref(first), name: "first.png" };
    const duplicate = { ...a, name: "duplicate.png" };
    const b = ref(second);
    const state = project(a, duplicate, b);
    const phases: string[] = [];
    const store = await PortableProjectStore.openRoot(root, { checkpoint: (phase) => void phases.push(phase) });
    state.snapshots = [{ revision: 1, project: { ...state.initial, assets: [a, duplicate, b] } }];
    state.operations = [
      { version: 2, type: "set-material-token", key: "asset", value: "retained" },
      { version: 2, type: "set-material-token", key: "asset", value: "redo" },
    ];
    state.cursor = 1;
    state.project = replayV2(state.initial, state.operations.slice(0, state.cursor));
    await store.save(state, [
      { bytes: first, sha256: hash(first) },
      { bytes: second, sha256: hash(second) },
    ]);
    expect(phases).toEqual(["staging-synced", "journal-synced", "asset-placed", "asset-placed", "assets-placed", "project-placed", "root-synced", "committed"]);
    phases.length = 0;
    await store.save(state, [
      { bytes: first, sha256: hash(first) },
      { bytes: second, sha256: hash(second) },
    ]);
    const stored = await readdir(path.join(root, "assets/sha256"));
    expect(stored.filter((name) => name === path.basename(a.path))).toHaveLength(1);
    expect(stored).toHaveLength(2);
    await cp(root, path.join(moved, "bundle"), { recursive: true });
    expect(path.resolve(moved, "bundle")).not.toBe(path.resolve(root));
    const reopened = await (await PortableProjectStore.openRoot(path.join(moved, "bundle"))).open();
    expect(reopened.canEdit).toBe(true);
    expect(reopened.state.project.projectId).toBe(state.project.projectId);
    expect(reopened.state.initial.assets).toEqual(state.initial.assets);
    expect(reopened.state.project.assets).toEqual(state.project.assets);
    expect(reopened.state.operations).toEqual(state.operations);
    expect(reopened.state.snapshots).toEqual(state.snapshots);
    expect(saveProjectV2(reopened.state)).toBe(saveProjectV2(state));
  });
  // prettier-ignore
  it("atomically saves and reopens parity projects with legacy evidence", async () => { const root = await makeRoot(), source = JSON.stringify({ formatVersion: 1, projectId: "legacy", metadata: { name: "N", description: "D", author: "A" }, tokens: { primaryColor: { r: 1, g: 2, b: 3 }, darkTheme: false } }), project = migrateLegacyMaterial(source).candidate, interrupted = await PortableProjectStore.openRoot(root, { checkpoint: (phase) => { if (phase === "parity-staged") throw new Error("crash"); } }); await expect(interrupted.saveParity(project)).rejects.toThrow("crash"); await expect(readFile(path.join(root, "project.json"))).rejects.toThrow(); const store = await PortableProjectStore.openRoot(root); await store.saveParity(project); const reopened = await store.openParity(); expect(saveLauncherParityProject(reopened.project)).toBe(saveLauncherParityProject(project)); expect(await readFile(path.join(root, `evidence/sha256/${project.evidence.legacy!.sourceHash}.json`), "utf8")).toBe(source); });

  it("atomically saves V3 media, recovers an interrupted save, and quarantines a corrupt source on reopen", async () => {
    const root = await makeRoot();
    const bytes = Uint8Array.of(137, 80, 78, 71, 9, 8, 7);
    const media = createMediaRefV3(bytes, "image/png");
    const state = createProjectV3({ projectId: "v3", metadata: { name: "N", description: "Description", author: "A" }, assets: [{ id: media.sha256, media, rightsToExport: true, provenance: {} }] });
    state.project = currentProjectV3(state);
    const prior = createProjectV3({ projectId: "prior", metadata: { name: "Prior", description: "Prior project", author: "A" } });
    await (await PortableProjectStore.openRoot(root)).saveV3(prior);
    const interrupted = await PortableProjectStore.openRoot(root, { checkpoint: (phase) => { if (phase === "v3-staged") throw new Error("crash"); } });
    await expect(interrupted.saveV3(state, [{ sha256: media.sha256, bytes }])).rejects.toThrow("crash");
    expect(await readdir(path.join(root, ".studio"))).toContain("v3-journal.json");
    const store = await PortableProjectStore.openRoot(root);
    const recovered = await store.openV3();
    expect(recovered.canEdit).toBe(true);
    expect(recovered.state.project.projectId).toBe("prior");
    expect(recovered.diagnostics.some(({ code }) => code === "v3-recovery-rolled-back")).toBe(true);
    await store.saveV3(state, [{ sha256: media.sha256, bytes }]);
    expect(await readFile(path.join(root, media.path))).toEqual(Buffer.from(bytes));
    expect((await store.openV3()).canEdit).toBe(true);
    await writeFile(path.join(root, media.path), Uint8Array.of(0));
    const reopened = await store.openV3();
    expect(reopened.canEdit).toBe(false);
    expect(reopened.quarantine.some(({ sha256 }) => sha256 === media.sha256)).toBe(true);
  });

  it.each([
    "v3-stage-synced",
    "v3-journal-synced",
    "v3-staged",
    "v3-media-placed",
    "v3-project-placed",
    "v3-root-synced",
    "v3-committed",
    "v3-stage-removed",
    "v3-journal-removed",
  ] as const)("recovers V3 authority and owned files after the %s checkpoint", async (checkpoint) => {
    const root = await makeRoot(), oldState = createProjectV3({ projectId: "old", metadata: { name: "Old", description: "Old project", author: "Ada" } });
    const source = bytes(31), media = createMediaRefV3(source, "image/png"), nextState = createProjectV3({ projectId: "new", metadata: { name: "New", description: "New project", author: "Ada" }, assets: [{ id: "new-media", media, provenance: {}, rightsToExport: true }] });
    await (await PortableProjectStore.openRoot(root)).saveV3(oldState);
    const interrupted = await PortableProjectStore.openRoot(root, { checkpoint: (phase) => { if (phase === checkpoint) throw new Error("crash"); } });
    await expect(interrupted.saveV3(nextState, [{ sha256: media.sha256, bytes: source }])).rejects.toThrow("crash");
    const opened = await (await PortableProjectStore.openRoot(root)).openV3();
    if (checkpoint === "v3-stage-synced") {
      expect(opened.state.project.projectId).toBe("old");
      expect(opened.canEdit).toBe(false);
      expect(opened.diagnostics.some(({ code }) => code === "v3-recovery-orphan")).toBe(true);
      return;
    }
    const promoted = ["v3-project-placed", "v3-root-synced", "v3-committed", "v3-stage-removed", "v3-journal-removed"].includes(checkpoint);
    expect(opened.state.project.projectId).toBe(promoted ? "new" : "old");
    expect(opened.canEdit).toBe(true);
    expect((await readdir(path.join(root, ".studio"))).filter((name) => name.includes("journal"))).toEqual([]);
    if (!promoted) await expect(readFile(path.join(root, media.path))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await (await PortableProjectStore.openRoot(root)).openV3()).state.project.projectId).toBe(promoted ? "new" : "old");
  });

  it.each(["v3-recovery-validated", "v3-recovery-planned", "v3-recovery-stage-removed", "v3-recovery-pruned", "v3-recovery-complete"] as const)("retries rollback after interruption at %s", async (checkpoint) => {
    const root = await makeRoot(), oldState = createProjectV3({ projectId: "old", metadata: { name: "Old", description: "Old project", author: "Ada" } }), nextState = applyOperationV3(oldState, { version: 3, type: "set-metadata", field: "name", value: "New" });
    await (await PortableProjectStore.openRoot(root)).saveV3(oldState);
    const interrupted = await PortableProjectStore.openRoot(root, { checkpoint: (phase) => { if (phase === "v3-staged") throw new Error("save crash"); } });
    await expect(interrupted.saveV3(nextState)).rejects.toThrow("save crash");
    const recovery = await PortableProjectStore.openRoot(root, { checkpoint: (phase) => { if (phase === checkpoint) throw new Error("recovery crash"); } });
    await expect(recovery.openV3()).rejects.toThrow("recovery crash");
    const retried = await (await PortableProjectStore.openRoot(root)).openV3();
    expect(retried.state.project.metadata.name).toBe("Old");
    const lostRollbackStage = checkpoint === "v3-recovery-stage-removed" || checkpoint === "v3-recovery-pruned";
    expect(retried.canEdit).toBe(!lostRollbackStage);
    expect((await readdir(path.join(root, ".studio"))).filter((name) => name.includes("journal"))).toEqual(lostRollbackStage ? ["v3-journal.json"] : []);
    if (lostRollbackStage) expect(retried.diagnostics.some(({ code }) => code === "v3-recovery-validation")).toBe(true);
  });

  it.each(["v3-recovery-validated", "v3-recovery-planned", "v3-recovery-stage-removed", "v3-recovery-pruned", "v3-recovery-complete"] as const)("retries finalize after interruption at %s", async (checkpoint) => {
    const root = await makeRoot(), oldState = createProjectV3({ projectId: "old", metadata: { name: "Old", description: "Old project", author: "Ada" } }), nextState = applyOperationV3(oldState, { version: 3, type: "set-metadata", field: "name", value: "New" });
    await (await PortableProjectStore.openRoot(root)).saveV3(oldState);
    const interrupted = await PortableProjectStore.openRoot(root, { checkpoint: (phase) => { if (phase === "v3-project-placed") throw new Error("save crash"); } });
    await expect(interrupted.saveV3(nextState)).rejects.toThrow("save crash");
    const recovery = await PortableProjectStore.openRoot(root, { checkpoint: (phase) => { if (phase === checkpoint) throw new Error("recovery crash"); } });
    await expect(recovery.openV3()).rejects.toThrow("recovery crash");
    const retried = await (await PortableProjectStore.openRoot(root)).openV3();
    expect(retried.state.project.metadata.name).toBe("New");
    expect(retried.canEdit).toBe(true);
    expect((await readdir(path.join(root, ".studio"))).filter((name) => name.includes("journal"))).toEqual([]);
  });

  it("fails closed for malformed, identity-mismatched, hash-mismatched, traversal, and symlink recovery evidence", async () => {
    const makeInterrupted = async () => {
      const root = await makeRoot(), oldState = createProjectV3({ projectId: "old", metadata: { name: "Old", description: "Old project", author: "Ada" } }), nextState = applyOperationV3(oldState, { version: 3, type: "set-metadata", field: "name", value: "New" });
      await (await PortableProjectStore.openRoot(root)).saveV3(oldState);
      await expect((await PortableProjectStore.openRoot(root, { checkpoint: (phase) => { if (phase === "v3-staged") throw new Error("crash"); } })).saveV3(nextState)).rejects.toThrow("crash");
      return root;
    };
    const malformed = await makeInterrupted();
    await writeFile(path.join(malformed, ".studio/v3-journal.json"), "{bad");
    const malformedDiagnostics = (await (await PortableProjectStore.openRoot(malformed)).openV3()).diagnostics;
    expect(malformedDiagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "v3-recovery-invalid", blocking: true, message: expect.stringContaining("recovery records were preserved") })]));
    expect(malformedDiagnostics.map(({ message }) => message).join(" ")).not.toMatch(/receipt|evidence/i);

    const identity = await makeInterrupted(), identityPath = path.join(identity, ".studio/v3-journal.json"), identityJournal = JSON.parse(await readFile(identityPath, "utf8"));
    identityJournal.identity = "other";
    await writeFile(identityPath, JSON.stringify(identityJournal));
    expect((await (await PortableProjectStore.openRoot(identity)).openV3()).canEdit).toBe(false);

    const mismatch = await makeInterrupted(), mismatchJournal = JSON.parse(await readFile(path.join(mismatch, ".studio/v3-journal.json"), "utf8"));
    await writeFile(path.join(mismatch, `.studio/staging-v3/${mismatchJournal.transaction}/project.json`), "{}\n");
    expect((await (await PortableProjectStore.openRoot(mismatch)).openV3()).diagnostics.some(({ code }) => code === "v3-recovery-validation")).toBe(true);

    const traversal = await makeInterrupted(), traversalPath = path.join(traversal, ".studio/v3-journal.json"), traversalJournal = JSON.parse(await readFile(traversalPath, "utf8"));
    traversalJournal.paths = [{ path: "../outside.png", sha256: "a".repeat(64) }];
    await writeFile(traversalPath, JSON.stringify(traversalJournal));
    expect((await (await PortableProjectStore.openRoot(traversal)).openV3()).canEdit).toBe(false);

    const linked = await makeInterrupted(), linkedJournal = JSON.parse(await readFile(path.join(linked, ".studio/v3-journal.json"), "utf8")), outside = await makeRoot(), linkedStage = path.join(linked, `.studio/staging-v3/${linkedJournal.transaction}`);
    await rm(linkedStage, { recursive: true });
    await symlink(outside, linkedStage);
    expect((await (await PortableProjectStore.openRoot(linked)).openV3()).diagnostics.some(({ code }) => code === "v3-recovery-orphan")).toBe(true);
  });

  it.each(["wrong-name", "file", "symlink"] as const)("keeps journal-free unsafe staging %s unresolved", async (failure) => {
    const root = await makeRoot(), state = createProjectV3({ projectId: "safe", metadata: { name: "Safe", description: "Safe project", author: "Ada" } });
    await (await PortableProjectStore.openRoot(root)).saveV3(state);
    const staging = path.join(root, ".studio/staging-v3"), outside = await makeRoot();
    if (failure === "wrong-name") await mkdir(path.join(staging, "not-a-transaction"));
    if (failure === "file") await writeFile(path.join(staging, "a".repeat(64)), bytes(86));
    if (failure === "symlink") await symlink(outside, path.join(staging, "b".repeat(64)));
    const opened = await (await PortableProjectStore.openRoot(root)).openV3();
    expect(opened.canEdit).toBe(false);
    expect(opened.diagnostics.some(({ code }) => code === "v3-recovery-orphan")).toBe(true);
    expect(await lstat(path.join(staging, failure === "wrong-name" ? "not-a-transaction" : failure === "file" ? "a".repeat(64) : "b".repeat(64)))).toBeTruthy();
  });

  it("root-binds unique transactions and refuses copied, reused, mismatched, and old journals without deleting evidence", async () => {
    const interrupt = async () => {
      const root = await makeRoot(), oldState = createProjectV3({ projectId: "old", metadata: { name: "Old", description: "Old project", author: "Ada" } }), nextState = applyOperationV3(oldState, { version: 3, type: "set-metadata", field: "name", value: "New" });
      await (await PortableProjectStore.openRoot(root)).saveV3(oldState);
      await expect((await PortableProjectStore.openRoot(root, { checkpoint: (phase) => { if (phase === "v3-staged") throw new Error("crash"); } })).saveV3(nextState)).rejects.toThrow("crash");
      return root;
    };
    const first = await interrupt(), second = await interrupt(), journalPath = (root: string) => path.join(root, ".studio/v3-journal.json"), firstJournal = JSON.parse(await readFile(journalPath(first), "utf8")), secondJournal = JSON.parse(await readFile(journalPath(second), "utf8"));
    expect(firstJournal.transaction).not.toBe(secondJournal.transaction);
    expect(firstJournal.rootSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(firstJournal)).not.toContain(first);
    const copiedBytes = await readFile(journalPath(first));
    await writeFile(journalPath(second), copiedBytes);
    const copied = await (await PortableProjectStore.openRoot(second)).openV3();
    expect(copied.diagnostics.some(({ code }) => code === "v3-recovery-root-mismatch")).toBe(true);
    expect(await readFile(journalPath(second))).toEqual(copiedBytes);
    expect(await readFile(path.join(second, `.studio/staging-v3/${secondJournal.transaction}/.transaction.json`))).toBeTruthy();

    const reused = await interrupt(), reusedPath = journalPath(reused), reusedJournal = JSON.parse(await readFile(reusedPath, "utf8")), originalStage = path.join(reused, reusedJournal.stage), replacement = "f".repeat(64);
    reusedJournal.transaction = replacement;
    reusedJournal.stage = `.studio/staging-v3/${replacement}`;
    reusedJournal.ownedPaths = reusedJournal.ownedPaths.map((item: string) => item.replace(/staging-v3\/[a-f0-9]{64}/, `staging-v3/${replacement}`));
    await writeFile(reusedPath, JSON.stringify(reusedJournal));
    const reusedOpen = await (await PortableProjectStore.openRoot(reused)).openV3();
    expect(reusedOpen.canEdit).toBe(false);
    expect(await readFile(path.join(originalStage, ".transaction.json"))).toBeTruthy();

    const wrongHash = await interrupt(), wrongHashPath = journalPath(wrongHash), wrongHashJournal = JSON.parse(await readFile(wrongHashPath, "utf8"));
    wrongHashJournal.projectSha256 = "0".repeat(64);
    await writeFile(wrongHashPath, JSON.stringify(wrongHashJournal));
    expect((await (await PortableProjectStore.openRoot(wrongHash)).openV3()).canEdit).toBe(false);
    expect(await readFile(wrongHashPath)).toBeTruthy();

    const old = await interrupt(), oldPath = journalPath(old), oldJournal = JSON.parse(await readFile(oldPath, "utf8"));
    await writeFile(oldPath, JSON.stringify({ version: 3, identity: "dspico-v3-save-journal-v1", transaction: oldJournal.transaction, phase: "commit", previousProjectSha256: oldJournal.previousProjectSha256, projectSha256: oldJournal.projectSha256, paths: [] }));
    const oldOpen = await (await PortableProjectStore.openRoot(old)).openV3();
    expect(oldOpen.diagnostics.some(({ code }) => code === "v3-recovery-invalid")).toBe(true);
    expect(await readFile(oldPath)).toBeTruthy();

    const exact = await interrupt(), exactPath = journalPath(exact), exactJournal = JSON.parse(await readFile(exactPath, "utf8"));
    exactJournal.extra = true;
    await writeFile(exactPath, JSON.stringify(exactJournal));
    expect((await (await PortableProjectStore.openRoot(exact)).openV3()).diagnostics.some(({ code }) => code === "v3-recovery-invalid")).toBe(true);
    expect(await readFile(exactPath)).toBeTruthy();

    const stageName = await interrupt(), stageNamePath = journalPath(stageName), stageNameJournal = JSON.parse(await readFile(stageNamePath, "utf8"));
    stageNameJournal.stage = `.studio/staging-v3/${"d".repeat(64)}`;
    await writeFile(stageNamePath, JSON.stringify(stageNameJournal));
    expect((await (await PortableProjectStore.openRoot(stageName)).openV3()).canEdit).toBe(false);
    expect(await readFile(stageNamePath)).toBeTruthy();
  });

  it("keeps all evidence for stage mismatch, multiple stages, and symlink swaps", async () => {
    const oldSource = bytes(81), oldMedia = createMediaRefV3(oldSource, "image/png"), nextSource = bytes(82), nextMedia = createMediaRefV3(nextSource, "image/png");
    const interrupt = async () => {
      const root = await makeRoot(), oldState = createProjectV3({ projectId: "old", metadata: { name: "Old", description: "Old project", author: "Ada" }, assets: [{ id: "old", media: oldMedia, provenance: {}, rightsToExport: true }] }), nextState = createProjectV3({ projectId: "new", metadata: { name: "New", description: "New project", author: "Ada" }, assets: [{ id: "new", media: nextMedia, provenance: {}, rightsToExport: true }] });
      await (await PortableProjectStore.openRoot(root)).saveV3(oldState, [{ sha256: oldMedia.sha256, bytes: oldSource }]);
      await expect((await PortableProjectStore.openRoot(root, { checkpoint: (phase) => { if (phase === "v3-staged") throw new Error("crash"); } })).saveV3(nextState, [{ sha256: nextMedia.sha256, bytes: nextSource }])).rejects.toThrow("crash");
      return root;
    };
    const root = await interrupt();
    const journalPath = path.join(root, ".studio/v3-journal.json"), journal = JSON.parse(await readFile(journalPath, "utf8")), owned = path.join(root, journal.stage), extra = path.join(root, ".studio/staging-v3", "e".repeat(64)), extraEvidence = path.join(extra, "evidence.bin");
    await mkdir(extra);
    await writeFile(extraEvidence, bytes(83));
    const evidence = [journalPath, path.join(owned, ".transaction.json"), path.join(owned, "project.json"), path.join(owned, nextMedia.path), extraEvidence, path.join(root, oldMedia.path)], before = await Promise.all(evidence.map((candidate) => readFile(candidate)));
    const multiple = await (await PortableProjectStore.openRoot(root)).openV3();
    expect(multiple.canEdit).toBe(false);
    expect(multiple.diagnostics.some(({ code, path: candidate }) => code === "v3-recovery-orphan" && candidate.endsWith("e".repeat(64)))).toBe(true);
    expect(await Promise.all(evidence.map((candidate) => readFile(candidate)))).toEqual(before);
    expect((await lstat(owned)).isDirectory()).toBe(true);
    expect((await lstat(extra)).isDirectory()).toBe(true);

    const linkedRoot = await interrupt(), linkedJournalPath = path.join(linkedRoot, ".studio/v3-journal.json"), journalBytes = await readFile(linkedJournalPath), linkedJournal = JSON.parse(journalBytes.toString()), marker = path.join(linkedRoot, linkedJournal.stage, ".transaction.json"), outside = await makeRoot();
    await rm(marker);
    await symlink(path.join(outside, "marker.json"), marker);
    const linked = await (await PortableProjectStore.openRoot(linkedRoot)).openV3();
    expect(linked.canEdit).toBe(false);
    expect(await readFile(linkedJournalPath)).toEqual(journalBytes);
    expect((await lstat(marker)).isSymbolicLink()).toBe(true);
  });

  it.each(["v3-recovery-validated", "v3-recovery-planned"] as const)("fails closed when an extra stage appears at %s", async (checkpoint) => {
    const root = await makeRoot(), source = bytes(84), media = createMediaRefV3(source, "image/png"), oldState = createProjectV3({ projectId: "old", metadata: { name: "Old", description: "Old project", author: "Ada" }, assets: [{ id: "old", media, provenance: {}, rightsToExport: true }] }), nextState = applyOperationV3(oldState, { version: 3, type: "set-metadata", field: "name", value: "New" });
    await (await PortableProjectStore.openRoot(root)).saveV3(oldState, [{ sha256: media.sha256, bytes: source }]);
    await expect((await PortableProjectStore.openRoot(root, { checkpoint: (phase) => { if (phase === "v3-staged") throw new Error("save crash"); } })).saveV3(nextState)).rejects.toThrow("save crash");
    const journalPath = path.join(root, ".studio/v3-journal.json"), journalBytes = await readFile(journalPath), journal = JSON.parse(journalBytes.toString()), owned = path.join(root, journal.stage), markerBytes = await readFile(path.join(owned, ".transaction.json")), extra = path.join(root, ".studio/staging-v3", "c".repeat(64)), extraBytes = bytes(85);
    const recovery = await PortableProjectStore.openRoot(root, { checkpoint: async (phase) => {
      if (phase !== checkpoint) return;
      await mkdir(extra);
      await writeFile(path.join(extra, "evidence.bin"), extraBytes);
    } });
    const opened = await recovery.openV3();
    expect(opened.canEdit).toBe(false);
    expect(opened.diagnostics.some(({ code }) => code === "v3-recovery-ambiguous")).toBe(true);
    expect(await readFile(path.join(owned, ".transaction.json"))).toEqual(markerBytes);
    expect(await readFile(path.join(extra, "evidence.bin"))).toEqual(Buffer.from(extraBytes));
    expect(await readFile(path.join(root, media.path))).toEqual(Buffer.from(source));
    if (checkpoint === "v3-recovery-validated") expect(await readFile(journalPath)).toEqual(journalBytes);
  });

  it.each(["missing", "corrupt", "symlink"] as const)("preserves rollback evidence when committed media is %s", async (failure) => {
    const root = await makeRoot(), oldBytes = bytes(41), oldRef = createMediaRefV3(oldBytes, "image/png"), newBytes = bytes(42), newRef = createMediaRefV3(newBytes, "image/png"), oldState = createProjectV3({ projectId: "old", metadata: { name: "Old", description: "Old project", author: "Ada" }, assets: [{ id: "old", media: oldRef, provenance: {}, rightsToExport: true }] }), nextState = createProjectV3({ projectId: "new", metadata: { name: "New", description: "New project", author: "Ada" }, assets: [{ id: "new", media: newRef, provenance: {}, rightsToExport: true }] });
    await (await PortableProjectStore.openRoot(root)).saveV3(oldState, [{ sha256: oldRef.sha256, bytes: oldBytes }]);
    await expect((await PortableProjectStore.openRoot(root, { checkpoint: (phase) => { if (phase === "v3-staged") throw new Error("crash"); } })).saveV3(nextState, [{ sha256: newRef.sha256, bytes: newBytes }])).rejects.toThrow("crash");
    const journalPath = path.join(root, ".studio/v3-journal.json"), journalBytes = await readFile(journalPath), journal = JSON.parse(journalBytes.toString()), marker = path.join(root, journal.stage, ".transaction.json"), markerBytes = await readFile(marker), target = path.join(root, oldRef.path);
    if (failure === "missing") await rm(target);
    if (failure === "corrupt") await writeFile(target, bytes(99));
    if (failure === "symlink") { const outside = await makeRoot(); await rm(target); await symlink(path.join(outside, "media.png"), target); }
    const opened = await (await PortableProjectStore.openRoot(root)).openV3();
    expect(opened.canEdit).toBe(false);
    expect(opened.diagnostics.some(({ code }) => code === "v3-recovery-validation")).toBe(true);
    expect(await readFile(journalPath)).toEqual(journalBytes);
    expect(await readFile(marker)).toEqual(markerBytes);
  });

  it.each(["missing", "corrupt", "symlink"] as const)("preserves finalize evidence when promoted media is %s", async (failure) => {
    const root = await makeRoot(), source = bytes(51), media = createMediaRefV3(source, "image/png"), oldState = createProjectV3({ projectId: "old", metadata: { name: "Old", description: "Old project", author: "Ada" } }), nextState = createProjectV3({ projectId: "new", metadata: { name: "New", description: "New project", author: "Ada" }, assets: [{ id: "new", media, provenance: {}, rightsToExport: true }] });
    await (await PortableProjectStore.openRoot(root)).saveV3(oldState);
    await expect((await PortableProjectStore.openRoot(root, { checkpoint: (phase) => { if (phase === "v3-project-placed") throw new Error("crash"); } })).saveV3(nextState, [{ sha256: media.sha256, bytes: source }])).rejects.toThrow("crash");
    const journalPath = path.join(root, ".studio/v3-journal.json"), journalBytes = await readFile(journalPath), journal = JSON.parse(journalBytes.toString()), marker = path.join(root, journal.stage, ".transaction.json"), markerBytes = await readFile(marker), target = path.join(root, media.path);
    if (failure === "missing") await rm(target);
    if (failure === "corrupt") await writeFile(target, bytes(98));
    if (failure === "symlink") { const outside = await makeRoot(); await rm(target); await symlink(path.join(outside, "media.png"), target); }
    const opened = await (await PortableProjectStore.openRoot(root)).openV3();
    expect(opened.canEdit).toBe(false);
    expect(opened.diagnostics.some(({ code }) => code === "v3-recovery-validation")).toBe(true);
    expect(await readFile(journalPath)).toEqual(journalBytes);
    expect(await readFile(marker)).toEqual(markerBytes);
  });

  it("rolls back partial media promotion and prunes only after committed redo media validates", async () => {
    const root = await makeRoot(), redoBytes = bytes(61), redoRef = createMediaRefV3(redoBytes, "image/png"), initial = createProjectV3({ projectId: "old", metadata: { name: "Old", description: "Old project", author: "Ada" } }), withRedo = applyOperationV3(initial, { version: 3, type: "add-media", asset: { id: "redo", media: redoRef, provenance: {}, rightsToExport: true } }), oldState = { ...withRedo, cursor: 0, project: currentProjectV3({ ...withRedo, cursor: 0 }) }, first = bytes(62), second = bytes(63), firstRef = createMediaRefV3(first, "image/png"), secondRef = createMediaRefV3(second, "image/png"), nextState = createProjectV3({ projectId: "new", metadata: { name: "New", description: "New project", author: "Ada" }, assets: [{ id: "first", media: firstRef, provenance: {}, rightsToExport: true }, { id: "second", media: secondRef, provenance: {}, rightsToExport: true }] });
    await (await PortableProjectStore.openRoot(root)).saveV3(oldState, [{ sha256: redoRef.sha256, bytes: redoBytes }]);
    let placements = 0;
    await expect((await PortableProjectStore.openRoot(root, { checkpoint: (phase) => { if (phase === "v3-media-placed" && ++placements === 1) throw new Error("partial promotion"); } })).saveV3(nextState, [{ sha256: firstRef.sha256, bytes: first }, { sha256: secondRef.sha256, bytes: second }])).rejects.toThrow("partial promotion");
    expect(placements).toBe(1);
    const recovered = await (await PortableProjectStore.openRoot(root)).openV3();
    expect(recovered.state.cursor).toBe(0);
    expect(await readFile(path.join(root, redoRef.path))).toEqual(Buffer.from(redoBytes));
    await expect(readFile(path.join(root, firstRef.path))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(path.join(root, secondRef.path))).rejects.toMatchObject({ code: "ENOENT" });
    const redone = { ...recovered.state, cursor: 1, project: currentProjectV3({ ...recovered.state, cursor: 1 }) };
    expect(redone.project.assets).toEqual([expect.objectContaining({ id: "redo" })]);
  });

  it.each(["v3-recovery-validated", "v3-recovery-planned"] as const)("revalidates symlink swaps before cleanup after %s", async (checkpoint) => {
    const root = await makeRoot(), source = bytes(71), media = createMediaRefV3(source, "image/png"), oldState = createProjectV3({ projectId: "old", metadata: { name: "Old", description: "Old project", author: "Ada" }, assets: [{ id: "old", media, provenance: {}, rightsToExport: true }] }), nextState = applyOperationV3(oldState, { version: 3, type: "set-metadata", field: "name", value: "New" });
    await (await PortableProjectStore.openRoot(root)).saveV3(oldState, [{ sha256: media.sha256, bytes: source }]);
    await expect((await PortableProjectStore.openRoot(root, { checkpoint: (phase) => { if (phase === "v3-staged") throw new Error("save crash"); } })).saveV3(nextState)).rejects.toThrow("save crash");
    const journalPath = path.join(root, ".studio/v3-journal.json"), journalBytes = await readFile(journalPath), journal = JSON.parse(journalBytes.toString()), marker = path.join(root, journal.stage, ".transaction.json"), markerBytes = await readFile(marker), target = path.join(root, media.path), outside = await makeRoot();
    let swapped = false;
    const recovery = await PortableProjectStore.openRoot(root, { checkpoint: async (phase) => {
      if (phase !== checkpoint || swapped) return;
      swapped = true;
      await rm(target);
      await symlink(path.join(outside, "media.png"), target);
    } });
    const opened = await recovery.openV3();
    expect(swapped).toBe(true);
    expect(opened.canEdit).toBe(false);
    expect(opened.diagnostics.some(({ code }) => code === "v3-recovery-validation")).toBe(true);
    expect(JSON.parse(await readFile(journalPath, "utf8")).transaction).toBe(journal.transaction);
    expect(await readFile(marker)).toEqual(markerBytes);
    expect((await lstat(target)).isSymbolicLink()).toBe(true);
    expect(journalBytes.length).toBeGreaterThan(0);
  });

  it("reopens an undone import for redo and prunes its media only after branching", async () => {
    const root = await makeRoot();
    const source = Uint8Array.of(137, 80, 78, 71, 4, 3, 2, 1);
    const media = createMediaRefV3(source, "image/png");
    const initial = createProjectV3({
      projectId: "durable-redo",
      metadata: { name: "N", description: "Durable redo", author: "A" },
    });
    const imported = applyOperationV3(initial, {
      version: 3,
      type: "import-visual-layer",
      role: "scrim",
      asset: { id: "image", media, provenance: {}, rightsToExport: true },
      operation: {
        version: 2,
        type: "add-layer",
        screen: "top",
        layer: { id: "layer", name: "Layer", visible: true, opacity: 65536, asset: { path: media.path, sha256: media.sha256 }, xQ16: 0, yQ16: 0, width: 1, height: 1, widthQ16: 65536, heightQ16: 65536, crop: { x: 0, y: 0, width: 1, height: 1 } },
      },
    });
    const undone = { ...imported, cursor: 0, project: currentProjectV3({ ...imported, cursor: 0 }) };
    const store = await PortableProjectStore.openRoot(root);

    await store.saveV3(undone, [{ sha256: media.sha256, bytes: source }]);
    const reopened = (await store.openV3()).state;
    expect(reopened).toMatchObject({ cursor: 0, operations: [{ type: "import-visual-layer", role: "scrim" }] });
    expect(await store.readMedia(media)).toEqual(source);
    const redone = { ...reopened, cursor: 1, project: currentProjectV3({ ...reopened, cursor: 1 }) };
    expect(redone.project).toMatchObject({
      assets: [{ id: "image" }],
      visualDocuments: { scrim: { width: 8, height: 42, layers: [{ id: "layer" }] } },
    });
    await store.saveV3(redone);
    const reopenedRedone = (await store.openV3()).state;
    expect(reopenedRedone.project).toMatchObject({ assets: [{ id: "image" }] });
    expect(await store.readMedia(media)).toEqual(source);

    const undoneAgain = {
      ...reopenedRedone,
      cursor: 0,
      project: currentProjectV3({ ...reopenedRedone, cursor: 0 }),
    };
    const branched = applyOperationV3(undoneAgain, {
      version: 3,
      type: "set-metadata",
      field: "name",
      value: "New branch",
    });
    await store.saveV3(branched);
    expect((await store.openV3()).state.operations).toEqual([
      { version: 3, type: "set-metadata", field: "name", value: "New branch" },
    ]);
    await expect(readFile(path.join(root, media.path))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["before-save", "during-save"] as const)(
    "rejects V3 save %s after project-root replacement without following the symlink",
    async (timing) => {
      const root = await makeRoot();
      const outside = await makeRoot();
      const moved = `${root}.moved`;
      roots.push(moved);
      const original = createProjectV3({
        projectId: "original",
        metadata: { name: "Original", description: "Safe", author: "A" },
      });
      const active = await PortableProjectStore.openRoot(root);
      await active.saveV3(original);
      let raced = active;
      const replace = async () => {
        await rename(root, moved);
        await symlink(outside, root);
      };
      if (timing === "before-save") await replace();
      else
        raced = await PortableProjectStore.openRoot(root, {
          checkpoint: async (checkpoint) => {
            if (checkpoint === "v3-stage-synced") await replace();
          },
        });
      const replacement = createProjectV3({
        projectId: "replacement",
        metadata: { name: "Replacement", description: "Unsafe", author: "A" },
      });

      await expect(raced.saveV3(replacement)).rejects.toThrow("changed");
      await expect(readFile(path.join(outside, "project.json"))).rejects.toMatchObject({ code: "ENOENT" });
      expect((await (await PortableProjectStore.openRoot(moved)).openV3()).state.project.metadata.name).toBe("Original");
    },
  );

  it("reopens one mixed-media V3 Custom bundle with recipes, role state, and component evidence", async () => {
    const root = await makeRoot();
    const image = Uint8Array.of(137, 80, 78, 71, 1), wav = Uint8Array.of(82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69, 2), prepared = Uint8Array.of(82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69, 3), bcstm = Uint8Array.of(67, 83, 84, 77, 4);
    const imageRef = createMediaRefV3(image, "image/png"), wavRef = createMediaRefV3(wav, "audio/wav"), preparedRef = createMediaRefV3(prepared, "audio/wav"), bcstmRef = createMediaRefV3(bcstm, "audio/bcstm");
    const state = createProjectV3({ projectId: "mixed", metadata: { name: "N", description: "Mixed media", author: "A" }, themeKind: "custom", requiredRoles: ["top-background", "navigation-sound", "bgm"], assets: [
      { id: "visual:top", media: imageRef, role: "top-background", provenance: { source: "fixture" }, rightsToExport: true, recipe: { transform: "nearest-center-floor-v1" } },
      { id: "wav:navigation", media: wavRef, prepared: preparedRef, role: "navigation-sound", provenance: { source: "fixture" }, rightsToExport: true, recipe: { trimStartMs: 0 } },
      { id: "bcstm:bgm", media: bcstmRef, role: "bgm", provenance: { source: "fixture" }, rightsToExport: true },
    ] });
    state.project.roleAssignments = { "top-background": imageRef.sha256, "navigation-sound": wavRef.sha256, bgm: bcstmRef.sha256 };
    state.project.confirmedRoles = ["top-background", "navigation-sound", "bgm"];
    state.project.componentEvidence = { visual: { package: "current" }, bcstm: { sourceSha256: bcstmRef.sha256 } };
    state.initial = structuredClone(state.project);
    const store = await PortableProjectStore.openRoot(root);
    await store.saveV3(state, [image, wav, prepared, bcstm].map((bytes) => ({ sha256: hash(bytes), bytes })));
    const reopened = await store.openV3();
    expect(reopened.state.project.roleAssignments).toEqual(state.project.roleAssignments);
    expect(reopened.state.project.componentEvidence).toEqual(state.project.componentEvidence);
    expect(reopened.state.project.assets.find(({ id }) => id === "wav:navigation")?.prepared).toEqual(preparedRef);
    for (const ref of [imageRef, wavRef, preparedRef, bcstmRef]) expect(await store.readMedia(ref)).toEqual(expect.any(Uint8Array));
  });
});
