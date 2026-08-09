import { LAUNCHER_V1_PROFILE } from "./profile-v1-3.js";
import { compositeProfileSha256V1, receiptMatchesV1, type ReceiptExpectationV1 } from "./receipts-v1.js";

// Keep this contract compact: the parent apply batch has a hard changed-line budget.
// prettier-ignore
export const BCSTM_V13 = { signature: "CSTM", endian: 0xfeff, headerSize: 0x40, version: 0x02000000, blockCount: 3, dspAdpcm: 2 } as const;
// prettier-ignore
export type BcstmDiagnosticV13 = { code: string; path: string; message: string };
// prettier-ignore
export type BcstmMetadataV13 = { encoding: "dsp-adpcm"; channels: 1 | 2; sampleRate: number; loop: boolean; loopStart: number; loopEnd: number; blockCount: number; blockSize: number; blockSampleCount: number; lastBlockSize: number; lastBlockSampleCount: number; lastBlockPaddedSize: number; seekEntrySize: number; seekInterval: number; dataOffset: number; dataBytes: number; sourceSha256: string };
// prettier-ignore
export type BcstmGateOptionsV13 = { visualReceipt?: unknown; visualExpectation?: ReceiptExpectationV1; bcstmReceipt?: unknown };
export const BCSTM_RECEIPT_SCHEMA_V13 = "dspico-bcstm-receipt-v1" as const;
// prettier-ignore
export type BcstmReceiptV13 = { version: 1; schema: typeof BCSTM_RECEIPT_SCHEMA_V13; component: "bcstm"; tester: string; device: string; cartridge: string; launcherBuild: string; testedAt: string; profile: { id: string; tag: string; commit: string; sha256: string }; sourceSha256: string; path: string; observations: readonly string[]; pass: true };
// prettier-ignore
export type BcstmImportInputV13 = { themeName: string; sourceBytes: readonly Uint8Array[]; visualReceipt?: unknown; bcstmReceipt?: unknown };
// prettier-ignore
export type BcstmValidationV13 = { valid: true; metadata: BcstmMetadataV13; sourceSha256: string } | { valid: false; diagnostics: BcstmDiagnosticV13[]; metadata?: BcstmMetadataV13; sourceSha256?: string };
// prettier-ignore
export type BcstmPassThroughV13 = { sourceSha256: string; sourceBytes: Uint8Array; sourcePath: string; bundlePath: string; launcherPath: string; metadata: BcstmMetadataV13 };
// prettier-ignore
export type BcstmPassThroughResultV13 = BcstmValidationV13 & { passThrough?: BcstmPassThroughV13 };
type Section = { offset: number; size: number; end: number };
type RecordValue = Record<string, unknown>;
// prettier-ignore
class Reject extends Error { constructor(readonly diagnostic: BcstmDiagnosticV13) { super(diagnostic.message); } }
// prettier-ignore
const reject = (code: string, path: string, message: string): never => { throw new Reject({ code, path, message }); };
// prettier-ignore
const record = (value: unknown): RecordValue | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : undefined;
const diagnostic = (code: string, path: string, message: string): BcstmDiagnosticV13 => ({ code, path, message });
const rotate = (word: number, count: number) => (word >>> count) | (word << (32 - count));
// prettier-ignore
const hash = (value: Uint8Array): string => { const bytes = [...value], bitLength = bytes.length * 8; bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0); for (let shift = 56; shift >= 0; shift -= 8) bytes.push(Math.floor(bitLength / 2 ** shift) & 255); const words = new Uint32Array(64), state = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), constants: number[] = []; for (let candidate = 2; constants.length < 64; candidate += 1) { let prime = true; for (let divisor = 2; divisor * divisor <= candidate; divisor += 1) if (candidate % divisor === 0) prime = false; if (prime) constants.push(Math.floor((Math.cbrt(candidate) % 1) * 2 ** 32) >>> 0); } for (let offset = 0; offset < bytes.length; offset += 64) { for (let index = 0; index < 16; index += 1) words[index] = ((bytes[offset + index * 4]! << 24) | (bytes[offset + index * 4 + 1]! << 16) | (bytes[offset + index * 4 + 2]! << 8) | bytes[offset + index * 4 + 3]!) >>> 0; for (let index = 16; index < 64; index += 1) { const x = words[index - 15]!, y = words[index - 2]!; words[index] = (words[index - 16]! + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) + words[index - 7]! + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10))) >>> 0; } let [a, b, c, d, e, f, g, h] = state; for (let index = 0; index < 64; index += 1) { const first = (h! + (rotate(e!, 6) ^ rotate(e!, 11) ^ rotate(e!, 25)) + ((e! & f!) ^ (~e! & g!)) + constants[index]! + words[index]!) >>> 0, second = ((rotate(a!, 2) ^ rotate(a!, 13) ^ rotate(a!, 22)) + ((a! & b!) ^ (a! & c!) ^ (b! & c!))) >>> 0; [a, b, c, d, e, f, g, h] = [(first + second) >>> 0, a, b, c, (d! + first) >>> 0, e, f, g]; } [a, b, c, d, e, f, g, h].forEach((part, index) => (state[index] = (state[index]! + part!) >>> 0)); } return [...state].map((word) => word.toString(16).padStart(8, "0")).join(""); };
// prettier-ignore
const need = (bytes: Uint8Array, offset: number, size: number, path: string): void => { if (!Number.isSafeInteger(offset) || offset < 0 || size < 0 || offset + size > bytes.byteLength) reject("bcstm.offset", path, "BCSTM structure points outside the source bytes."); };
const text = (bytes: Uint8Array, offset: number): string => String.fromCharCode(...bytes.slice(offset, offset + 4));

// The launcher accepts the BCSTM container as DSP-ADPCM data; this parser intentionally never decodes or rewrites it.
// prettier-ignore
export function parseBcstmV13(input: Uint8Array): BcstmValidationV13 {
  const sourceSha256 = input instanceof Uint8Array ? hash(input) : "";
  try {
    if (!(input instanceof Uint8Array)) reject("bcstm.malformed", "", "BCSTM input must be a Uint8Array.");
    need(input, 0, BCSTM_V13.headerSize, "/header");
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength), u16 = (o: number) => view.getUint16(o, true), u32 = (o: number) => view.getUint32(o, true);
    if (text(input, 0) !== BCSTM_V13.signature) reject("bcstm.signature", "/header/signature", "BCSTM signature must be CSTM.");
    if (u16(4) !== BCSTM_V13.endian) reject("bcstm.endian", "/header/endianness", "Only little-endian BCSTM is supported.");
    if (u16(6) !== BCSTM_V13.headerSize) reject("bcstm.header-size", "/header/headerSize", "BCSTM header size must be 0x40.");
    if (u32(8) !== BCSTM_V13.version) reject("bcstm.version", "/header/version", "Unsupported BCSTM version.");
    if (u32(12) !== input.byteLength) reject("bcstm.file-size", "/header/fileSize", "BCSTM fileSize must equal the source length.");
    if (u16(16) !== BCSTM_V13.blockCount || u16(18) !== 0) reject("bcstm.header", "/header/blockCount", "BCSTM must contain exactly three blocks and zero reserved bits.");
    const sized = (o: number, type: number, path: string) => { need(input, o, 12, path); if (u16(o) !== type || u16(o + 2) !== 0) reject("bcstm.reference", path, "BCSTM reference type or padding is invalid."); return { offset: u32(o + 4), size: u32(o + 8) }; };
    const section = (o: number, type: number, signature: string, path: string): Section => { const ref = sized(o, type, path); if (ref.offset < 0x40 || ref.offset % 0x20 || ref.size < 8 || ref.size % 0x20) reject("bcstm.offset", path, "BCSTM block offset and size must be aligned and non-empty."); need(input, ref.offset, ref.size, path); if (text(input, ref.offset) !== signature || u32(ref.offset + 4) !== ref.size) reject("bcstm.section", path, "BCSTM block header does not match its sized reference."); return { ...ref, end: ref.offset + ref.size }; };
    const info = section(0x14, 0x4000, "INFO", "/header/info"), seek = section(0x20, 0x4001, "SEEK", "/header/seek"), data = section(0x2c, 0x4002, "DATA", "/header/data");
    if (!(info.offset < seek.offset && seek.offset < data.offset) || info.end > seek.offset || seek.end > data.offset) reject("bcstm.offset", "/header/blocks", "BCSTM blocks must be ordered and non-overlapping.");
    const infoBase = info.offset + 8, ref = (o: number, type: number, path: string) => { need(input, o, 8, path); if (u16(o) !== type || u16(o + 2) !== 0) reject("bcstm.reference", path, "BCSTM reference type or padding is invalid."); return u32(o + 4); }, target = (base: number, relative: number, size: number, path: string) => { const value = base + relative; if (value < infoBase || value + size > info.end) reject("bcstm.offset", path, "BCSTM INFO reference escapes its block."); return value; };
    const stream = target(infoBase, ref(infoBase, 0x4100, "/info/stream"), 56, "/info/stream"), trackOffset = ref(infoBase + 8, 0x4101, "/info/track"), channelOffset = ref(infoBase + 16, 0x4102, "/info/channel"), format = input[stream]!, loop = input[stream + 1]!, channels = input[stream + 2]!;
    if (format !== 2) reject("bcstm.format", "/info/stream/format", "Only DSP-ADPCM BCSTM streams are supported.");
    if (loop > 1) reject("bcstm.loop", "/info/stream/loop", "BCSTM loop flag must be zero or one.");
    if (channels !== 1 && channels !== 2) reject("bcstm.channel-count", "/info/stream/channels", "BCSTM must contain one or two channels.");
    if (input[stream + 3] !== 0) reject("bcstm.metadata", "/info/stream/padding", "BCSTM stream padding must be zero.");
    const sampleRate = u32(stream + 4), loopStart = u32(stream + 8), loopEnd = u32(stream + 12), blockCount = u32(stream + 16), blockSize = u32(stream + 20), blockSampleCount = u32(stream + 24), lastBlockSize = u32(stream + 28), lastBlockSampleCount = u32(stream + 32), lastBlockPaddedSize = u32(stream + 36), seekEntrySize = u32(stream + 40), seekInterval = u32(stream + 44), dataOffset = ref(stream + 48, 0x1f00, "/info/stream/data");
    if (!sampleRate || sampleRate > 192000 || !blockCount || blockSize < 0x20 || blockSize % 8) reject("bcstm.metadata", "/info/stream", "BCSTM sample rate, block count, or block size is unsupported.");
    if (blockSampleCount !== blockSize / 8 * 14 || !lastBlockSize || lastBlockSize > blockSize || lastBlockSize % 8) reject("bcstm.metadata", "/info/stream/blockSamples", "BCSTM DSP-ADPCM block geometry is inconsistent.");
    if (!lastBlockSampleCount || lastBlockSampleCount > lastBlockSize / 8 * 14 || lastBlockPaddedSize < lastBlockSize || lastBlockPaddedSize > blockSize || lastBlockPaddedSize % 0x20) reject("bcstm.metadata", "/info/stream/lastBlock", "BCSTM last-block metadata is inconsistent.");
    if (seekEntrySize !== channels * 4 || seekInterval !== blockSampleCount) reject("bcstm.metadata", "/info/stream/seek", "BCSTM seek metadata is not DSP-ADPCM compatible.");
    const totalSamples = (blockCount - 1) * blockSampleCount + lastBlockSampleCount;
    if (loop ? loopStart >= loopEnd || loopEnd > totalSamples : loopStart !== 0 || loopEnd !== 0) reject("bcstm.loop", "/info/stream/loopRange", "BCSTM loop range is invalid for the declared sample count.");
    const trackTable = target(infoBase, trackOffset, 4, "/info/track");
    if (u32(trackTable) !== 1) reject("bcstm.metadata", "/info/track/count", "BCSTM must contain one track entry.");
    const track = target(trackTable, ref(trackTable + 4, 0x4101, "/info/track/entry"), 12, "/info/track/entry"), indexTable = target(track + 4, ref(track + 4, 0x0100, "/info/track/channels"), 4 + channels, "/info/track/channels");
    if (u32(indexTable) !== channels) reject("bcstm.channel-count", "/info/track/channels/count", "Track channel count does not match stream metadata.");
    const channelTable = target(infoBase, channelOffset, 4 + channels * 8, "/info/channel");
    if (u32(channelTable) !== channels) reject("bcstm.channel-count", "/info/channel/count", "Channel table count does not match stream metadata.");
    for (let index = 0; index < channels; index += 1) { const channel = target(channelTable, ref(channelTable + 4 + index * 8, 0x4102, `/info/channel/${index}`), 8, `/info/channel/${index}`), codec = target(channel, ref(channel, 0x0300, `/info/channel/${index}/codec`), 44, `/info/channel/${index}/codec`); if (input[codec + 32]! >>> 4 > 7 || input[codec + 33] !== 0 || input[codec + 38]! >>> 4 > 7 || input[codec + 39] !== 0) reject("bcstm.metadata", `/info/channel/${index}/codec`, "DSP-ADPCM predictor or reserved context is invalid."); }
    if (seek.size - 8 < blockCount * seekEntrySize) reject("bcstm.offset", "/seek/data", "BCSTM seek data is truncated.");
    const sampleData = data.offset + 8 + dataOffset, dataBytes = ((blockCount - 1) * blockSize + lastBlockPaddedSize) * channels;
    if (sampleData % 0x20 || sampleData + dataBytes > data.end) reject("bcstm.offset", "/data/sampleData", "BCSTM sample data is outside the DATA block.");
    const metadata: BcstmMetadataV13 = { encoding: "dsp-adpcm", channels: channels as 1 | 2, sampleRate, loop: loop === 1, loopStart, loopEnd, blockCount, blockSize, blockSampleCount, lastBlockSize, lastBlockSampleCount, lastBlockPaddedSize, seekEntrySize, seekInterval, dataOffset: sampleData, dataBytes, sourceSha256 };
    return { valid: true, metadata, sourceSha256 };
  } catch (error) { return { valid: false, diagnostics: [error instanceof Reject ? error.diagnostic : diagnostic("bcstm.malformed", "", "BCSTM bytes are malformed or truncated.")] }; }
}

// Receipts are separate gates: visual proof is prerequisite evidence, while BCSTM proof must hash the exact source.
// prettier-ignore
const receiptValid = (input: unknown, expectedHash?: string): boolean => { const value = record(input), observations = value?.observations, profile = record(value?.profile), typedIdentity = profile?.id === LAUNCHER_V1_PROFILE.profileId && profile.tag === LAUNCHER_V1_PROFILE.tag && profile.commit === LAUNCHER_V1_PROFILE.launcherCommit && profile.sha256 === compositeProfileSha256V1(), bcstmIdentity = value?.schema === BCSTM_RECEIPT_SCHEMA_V13 && value?.component === "bcstm"; if (!value || !bcstmIdentity || !typedIdentity || value.pass !== true || !Array.isArray(observations) || !observations.length || observations.some((item) => typeof item !== "string" || !item.trim())) return false; return value.version === 1 && value.sourceSha256 === expectedHash && value.path === `bgm/${expectedHash}.bcstm` && ["tester", "device", "cartridge", "launcherBuild"].every((field) => typeof value[field] === "string" && String(value[field]).trim()) && typeof value.testedAt === "string" && value.testedAt.endsWith("Z") && typeof expectedHash === "string" && /^[a-f0-9]{64}$/.test(expectedHash); };
// prettier-ignore
const gateDiagnostics = (options: BcstmGateOptionsV13, sourceHash?: string): BcstmDiagnosticV13[] => { const diagnostics: BcstmDiagnosticV13[] = [], visualValid = Boolean(options.visualExpectation && receiptMatchesV1(options.visualReceipt, options.visualExpectation)); if (!visualValid) diagnostics.push(diagnostic("bcstm.visual-prerequisite", "/visual", "BCSTM requires a compatibility record for the exact current visual package.")); if (!visualValid) diagnostics.push(diagnostic(options.visualReceipt ? "bcstm.visual-receipt-invalid" : "bcstm.visual-receipt-required", "/visualReceipt", "A current-output composite-profile visual compatibility record is required before BCSTM handling.")); if (!receiptValid(options.bcstmReceipt, sourceHash)) diagnostics.push(diagnostic(options.bcstmReceipt ? "bcstm.receipt-invalid" : "bcstm.receipt-required", "/bcstmReceipt", "A source-matching BCSTM compatibility record is required; no playback-parity claim is made.")); return diagnostics; };
// prettier-ignore
export function validateBcstmV13(input: Uint8Array, options: BcstmGateOptionsV13 = {}): BcstmValidationV13 { const prerequisite = gateDiagnostics(options); if (!options.visualExpectation || !receiptMatchesV1(options.visualReceipt, options.visualExpectation)) return { valid: false, diagnostics: prerequisite }; const parsed = parseBcstmV13(input); if (!parsed.valid) return parsed; const diagnostics = gateDiagnostics(options, parsed.sourceSha256); return diagnostics.length ? { valid: false, diagnostics, metadata: parsed.metadata, sourceSha256: parsed.sourceSha256 } : parsed; }
// prettier-ignore
export function validateBcstmReceiptV13(input: unknown, sourceHash?: string): BcstmDiagnosticV13[] { return receiptValid(input, sourceHash) ? [] : [diagnostic(input ? "bcstm.receipt-invalid" : "bcstm.receipt-required", "/bcstmReceipt", "A source-matching BCSTM compatibility record is required; no playback-parity claim is made.")]; }
export function validateBcstmSourcesV13(
  input: readonly Uint8Array[],
  themeName: string,
  options: BcstmGateOptionsV13 = {},
): BcstmPassThroughResultV13 {
  if (!Array.isArray(input) || input.length !== 1)
    return {
      valid: false,
      diagnostics: [
        diagnostic("bcstm.source-count", "/sources", "Exactly one BCSTM source is supported; no output was produced."),
      ],
    };
  return createBcstmPassThroughV13(input[0]!, themeName, options);
}
// prettier-ignore
export function createBcstmPassThroughV13(input: Uint8Array, themeName: string, options: BcstmGateOptionsV13 = {}): BcstmPassThroughResultV13 { const result = validateBcstmV13(input, options); if (!result.valid) return result; if (!/^[A-Za-z0-9_-]+$/.test(themeName)) return { valid: false, diagnostics: [diagnostic("bcstm.theme-path", "/theme", "Theme name is unsafe for the launcher BGM path.")], metadata: result.metadata, sourceSha256: result.sourceSha256 }; const sourcePath = `assets/sha256/${result.sourceSha256}.bcstm`; return { ...result, passThrough: { sourceSha256: result.sourceSha256, sourceBytes: new Uint8Array(input), sourcePath, bundlePath: `bgm/${result.sourceSha256}.bcstm`, launcherPath: `/_pico/themes/${themeName}/bgm/${result.sourceSha256}.bcstm`, metadata: result.metadata } }; }
