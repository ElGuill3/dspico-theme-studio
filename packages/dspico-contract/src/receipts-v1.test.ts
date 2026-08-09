import { describe, expect, it } from "vitest";
import { CODEC_POLICY_V1, codecPolicySha256V1, compositeProfileSha256V1 } from "./index.js";
import { LAUNCHER_V1_PROFILE, LAUNCHER_V1_VISUAL_FILES } from "./profile-v1-3.js";
import { receiptMatchesV1, validateReceiptV1, type VisualReceiptV1 } from "./receipts-v1.js";

const hash = (value: string) => value.repeat(64).slice(0, 64);
const manifest = LAUNCHER_V1_VISUAL_FILES.map((path, index) => ({ path, sha256: hash(String(index)) }));
const receipt = (): VisualReceiptV1 => ({
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
    tag: LAUNCHER_V1_PROFILE.tag,
    commit: LAUNCHER_V1_PROFILE.launcherCommit,
    sha256: compositeProfileSha256V1(),
  },
  codecPolicy: { id: CODEC_POLICY_V1, sha256: codecPolicySha256V1() },
  themeJsonSha256: hash("a"),
  manifest,
  observations: ["Selected and unselected visual states matched on device."],
  pass: true,
});

describe("v1 visual receipts", () => {
  it("reuses only an exact complete package identity", () => {
    const value = receipt();
    const expected = {
      profileSha256: compositeProfileSha256V1(),
      themeJsonSha256: value.themeJsonSha256,
      manifest: value.manifest,
    };
    expect(validateReceiptV1(value)).toEqual([]);
    expect(receiptMatchesV1(value, expected)).toBe(true);
    expect(receiptMatchesV1(value, { ...expected, themeJsonSha256: hash("b") })).toBe(false);
    expect(receiptMatchesV1(value, { ...expected, manifest: expected.manifest.slice(1) })).toBe(false);
    expect(receiptMatchesV1({ ...value, codecPolicy: { ...value.codecPolicy, id: "other" } }, expected)).toBe(false);
  });

  it("rejects stale, incomplete, or inferred evidence", () => {
    const value = receipt();
    expect(validateReceiptV1({ ...value, manifest: value.manifest.slice(0, -1) })).not.toEqual([]);
    expect(validateReceiptV1({ ...value, observations: [] })).not.toEqual([]);
    expect(validateReceiptV1({ ...value, pass: false })).not.toEqual([]);
    expect(validateReceiptV1({ ...value, profile: { ...value.profile, sha256: hash("c") } })).not.toEqual([]);
  });
});
