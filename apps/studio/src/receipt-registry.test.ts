import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CODEC_POLICY_V1,
  codecPolicySha256V1,
  compositeProfileSha256V1,
} from "../../../packages/dspico-contract/src/index.js";
import { LAUNCHER_V1_PROFILE, LAUNCHER_V1_VISUAL_FILES } from "../../../packages/dspico-contract/src/profile-v1-3.js";
import { ReceiptRegistry } from "./receipt-registry.js";

const roots = new Set<string>();
const hash = (value: string) => value.repeat(64).slice(0, 64);
const makeReceipt = () => ({
  version: 1,
  schema: "dspico-visual-receipt-v1",
  component: "visual",
  tester: "Ada",
  device: "DSi",
  cartridge: "cart-1",
  launcherBuild: "build-1",
  testedAt: "2026-08-08T07:00:00.000Z",
  profile: {
    id: LAUNCHER_V1_PROFILE.profileId,
    commit: LAUNCHER_V1_PROFILE.launcherCommit,
    sha256: compositeProfileSha256V1(),
  },
  codecPolicy: { id: CODEC_POLICY_V1, sha256: codecPolicySha256V1() },
  themeJsonSha256: hash("a"),
  manifest: LAUNCHER_V1_VISUAL_FILES.map((path, index) => ({ path, sha256: hash(String(index)) })),
  observations: ["Observed on device."],
  pass: true,
});
afterEach(async () => Promise.all([...roots].map((root) => rm(root, { recursive: true, force: true }))));

describe("receipt registry", () => {
  it("atomically indexes exact receipts and ignores stale evidence", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dspico-receipts-"));
    roots.add(root);
    const registry = new ReceiptRegistry(root),
      value = makeReceipt();
    await expect(registry.put(value)).resolves.toEqual(value);
    await expect(
      registry.find({
        profileSha256: compositeProfileSha256V1(),
        themeJsonSha256: value.themeJsonSha256,
        manifest: value.manifest,
      }),
    ).resolves.toEqual(value);
    await expect(
      registry.find({
        profileSha256: compositeProfileSha256V1(),
        themeJsonSha256: hash("b"),
        manifest: value.manifest,
      }),
    ).resolves.toBeUndefined();
    expect((await readdir(root)).length).toBe(1);
  });

  it("does not write incomplete receipts", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dspico-receipts-"));
    roots.add(root);
    await expect(new ReceiptRegistry(root).put({ pass: true })).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
  });
});
