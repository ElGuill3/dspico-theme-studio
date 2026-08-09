import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CODEC_POLICY_V1, codecPolicySha256V1, compositeProfileSha256V1 } from "./index.js";
import { LAUNCHER_V1_PROFILE, LAUNCHER_V1_VISUAL_FILES } from "./profile-v1-3.js";
// prettier-ignore
import { BCSTM_V13, createBcstmPassThroughV13, parseBcstmV13, validateBcstmReceiptV13, validateBcstmSourcesV13, validateBcstmV13 } from "./bcstm-v1-3.js";

// prettier-ignore
const w16 = (b: Uint8Array, o: number, v: number) => new DataView(b.buffer).setUint16(o, v, true);
// prettier-ignore
const w32 = (b: Uint8Array, o: number, v: number) => new DataView(b.buffer).setUint32(o, v, true);
const text = (b: Uint8Array, o: number, v: string) => v.split("").forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
// prettier-ignore
const ref = (b: Uint8Array, o: number, type: number, relative: number) => { w16(b, o, type); w32(b, o + 4, relative); };
// prettier-ignore
const fixture = () => {
  const b = new Uint8Array(0x1c0), info = 0x40, seek = 0x120, data = 0x180, stream = 0x60;
  text(b, 0, "CSTM"); w16(b, 4, 0xfeff); w16(b, 6, 0x40); w32(b, 8, BCSTM_V13.version); w32(b, 12, b.length); w16(b, 16, 3);
  ref(b, 0x14, 0x4000, 0); w32(b, 0x18, info); w32(b, 0x1c, 0xe0); ref(b, 0x20, 0x4001, 0); w32(b, 0x24, seek); w32(b, 0x28, 0x20); ref(b, 0x2c, 0x4002, 0); w32(b, 0x30, data); w32(b, 0x34, 0x40);
  text(b, info, "INFO"); w32(b, info + 4, 0xe0); text(b, seek, "SEEK"); w32(b, seek + 4, 0x20); text(b, data, "DATA"); w32(b, data + 4, 0x40);
  ref(b, info + 8, 0x4100, 0x18); ref(b, info + 16, 0x4101, 0x58); ref(b, info + 24, 0x4102, 0x78);
  b[stream] = BCSTM_V13.dspAdpcm; b[stream + 2] = 1; w32(b, stream + 4, 32728); w32(b, stream + 16, 1); w32(b, stream + 20, 0x20); w32(b, stream + 24, 56); w32(b, stream + 28, 8); w32(b, stream + 32, 14); w32(b, stream + 36, 0x20); w32(b, stream + 40, 4); w32(b, stream + 44, 56); ref(b, stream + 48, 0x1f00, 0x18);
  w32(b, 0xa0, 1); ref(b, 0xa4, 0x4101, 0x0c); b[0xac] = 127; b[0xad] = 64; ref(b, 0xb0, 0x0100, 8); w32(b, 0xb8, 1); w32(b, 0xc0, 1); ref(b, 0xc4, 0x4102, 0x0c); ref(b, 0xcc, 0x0300, 8); ref(b, 0x90, 0x1f00, 0x18);
  return b;
};
// prettier-ignore
const visualReceipt = () => ({ version: 1, schema: "dspico-visual-receipt-v1", component: "visual", tester: "Ada", device: "DSi", cartridge: "cart-1", launcherBuild: "build-1", testedAt: "2026-08-08T09:00:00.000Z", profile: { id: LAUNCHER_V1_PROFILE.profileId, tag: LAUNCHER_V1_PROFILE.tag, commit: LAUNCHER_V1_PROFILE.launcherCommit, sha256: compositeProfileSha256V1() }, codecPolicy: { id: CODEC_POLICY_V1, sha256: codecPolicySha256V1() }, themeJsonSha256: "0".repeat(64), manifest: LAUNCHER_V1_VISUAL_FILES.map((path) => ({ path, sha256: "0".repeat(64) })), observations: ["visual baseline"], pass: true });
const visualExpectation = () => ({
  profileSha256: compositeProfileSha256V1(),
  themeJsonSha256: "0".repeat(64),
  manifest: LAUNCHER_V1_VISUAL_FILES.map((path) => ({ path, sha256: "0".repeat(64) })),
});
const bcstmReceipt = (sourceSha256: string) => ({
  version: 1,
  schema: "dspico-bcstm-receipt-v1",
  component: "bcstm",
  tester: "Ada",
  device: "DSi",
  cartridge: "cart-1",
  launcherBuild: "build-1",
  testedAt: "2026-08-08T09:00:00.000Z",
  profile: {
    id: LAUNCHER_V1_PROFILE.profileId,
    tag: LAUNCHER_V1_PROFILE.tag,
    commit: LAUNCHER_V1_PROFILE.launcherCommit,
    sha256: compositeProfileSha256V1(),
  },
  sourceSha256,
  path: `bgm/${sourceSha256}.bcstm`,
  observations: ["source inspected"],
  pass: true,
});

// prettier-ignore
describe("v1.3 BCSTM DSP-ADPCM contract", () => {
  it("parses strict metadata and rejects unsupported structural mutations", () => {
    const bytes = fixture();
    const parsed = parseBcstmV13(bytes);
    expect(parsed).toMatchObject({ valid: true, metadata: { encoding: "dsp-adpcm", channels: 1, blockCount: 1, lastBlockSampleCount: 14 } });
    expect(parsed.valid && parsed.sourceSha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    const cases: Array<readonly [(value: Uint8Array) => void, string]> = [
      [(v) => (v[0] = 0), "bcstm.signature"], [(v) => w16(v, 4, 0xfffe), "bcstm.endian"], [(v) => w32(v, 0x18, 0x100000), "bcstm.offset"], [(v) => (v[0x62] = 3), "bcstm.channel-count"],
      [(v) => { v[0x61] = 1; w32(v, 0x6c, 99); }, "bcstm.loop"],
    ];
    for (const [mutate, code] of cases) { const value = fixture(); mutate(value); expect(parseBcstmV13(value)).toMatchObject({ valid: false, diagnostics: [expect.objectContaining({ code })] }); }
  });
  it("requires independent visual and BCSTM receipts before pass-through", () => {
    const bytes = fixture(), parsed = parseBcstmV13(bytes); if (!parsed.valid) throw new Error("fixture must parse");
    expect(validateBcstmV13(bytes)).toMatchObject({ valid: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: "bcstm.visual-prerequisite" }), expect.objectContaining({ code: "bcstm.visual-receipt-required" }), expect.objectContaining({ code: "bcstm.receipt-required" })]) });
    const sourceHash = parsed.sourceSha256, receipt = bcstmReceipt(sourceHash);
    expect(validateBcstmReceiptV13(receipt)).toHaveLength(1); expect(validateBcstmReceiptV13(receipt, "f".repeat(64))).toHaveLength(1);
    const accepted = createBcstmPassThroughV13(bytes, "raspberry", { visualExpectation: visualExpectation(), visualReceipt: visualReceipt(), bcstmReceipt: receipt });
    expect(accepted).toMatchObject({ valid: true, passThrough: { sourceSha256: sourceHash, sourcePath: `assets/sha256/${sourceHash}.bcstm`, bundlePath: `bgm/${sourceHash}.bcstm`, launcherPath: `/_pico/themes/raspberry/bgm/${sourceHash}.bcstm` } });
    expect(accepted.valid && [...accepted.passThrough!.sourceBytes]).toEqual([...bytes]); expect(createBcstmPassThroughV13(bytes, "raspberry", { visualExpectation: visualExpectation(), visualReceipt: visualReceipt(), bcstmReceipt: receipt })).toEqual(accepted);
    expect(accepted.valid && accepted.passThrough).not.toHaveProperty("audition");
    expect(accepted.valid && accepted.passThrough).not.toHaveProperty("convertedBytes");
  });
  it("fails closed for malformed or multiple sources before any pass-through output", () => {
    expect(validateBcstmSourcesV13([], "raspberry")).toMatchObject({ valid: false, diagnostics: [expect.objectContaining({ code: "bcstm.source-count" })] });
    expect(validateBcstmSourcesV13([fixture(), fixture()], "raspberry")).toMatchObject({ valid: false, diagnostics: [expect.objectContaining({ code: "bcstm.source-count" })] });
    expect(validateBcstmSourcesV13([new Uint8Array([1, 2, 3])], "raspberry", { visualExpectation: visualExpectation(), visualReceipt: visualReceipt() })).toMatchObject({ valid: false, diagnostics: [expect.objectContaining({ code: "bcstm.offset" })] });
    const bytes = fixture(), parsed = parseBcstmV13(bytes); if (!parsed.valid) throw new Error("fixture must parse");
    expect(validateBcstmReceiptV13(bcstmReceipt(parsed.sourceSha256), "f".repeat(64))).toHaveLength(1);
  });
});
