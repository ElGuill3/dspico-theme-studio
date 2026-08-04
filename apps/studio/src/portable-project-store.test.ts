import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createProjectV2,
  reachableAssetHashes,
  redoV2,
  replayV2,
  saveProjectV2,
  undoV2,
} from "../../../packages/theme-core/src/index.js";
import { PortableProjectStore } from "./portable-project-store.js";
const roots: string[] = [];
const bytes = (value: number) => new Uint8Array([137, 80, 78, 71, value]);
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
// prettier-ignore
const ref = (value: Uint8Array, assetPath = `assets/sha256/${hash(value)}.png`) => ({ sha256: hash(value), path: assetPath });
// prettier-ignore
const project = (...refs: { sha256: string; path: string }[]) => { const state = createProjectV2({ projectId: "custom", themeKind: "custom", metadata: { name: "N", description: "D", author: "A" } }); state.initial.assets = refs; state.project = structuredClone(state.initial); return state; };
// prettier-ignore
const makeRoot = async () => { const root = await mkdtemp(path.join(tmpdir(), "dspico-bundle-")); roots.push(root); return root; };
// prettier-ignore
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));
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
});
