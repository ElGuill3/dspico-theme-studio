import { sha256 } from "./index.js";
import { THEME_SOUNDS_V1_TARGET_SHA256 } from "./profile-v1-3.js";

export const THEME_SOUND_SAMPLE_RATE_V1 = 22_050;
export const THEME_SOUND_MAX_PCM_BYTES_V1 = 11_024;
export const THEME_SOUND_MAX_FILE_BYTES_V1 = 16_384;
const roles = ["navigation", "launch"] as const;
export type ThemeSoundRoleV1 = (typeof roles)[number];
// prettier-ignore
export type WavRecipeV1 = {
  trimStartMs: number;
  trimEndMs: number;
  fadeInMs: number;
  fadeOutMs: number;
  gainPercent: number;
};
// prettier-ignore
export type ThemeSoundProvenanceV1 = Record<
  "originalName" | "source" | "author" | "credit" | "license" | "terms" | "notice" | "intendedUse",
  string
> & { rightsToExport: boolean };
// prettier-ignore
export type ThemeSoundAssetV1 = {
  mediaType: "audio/wav";
  path: string;
  sha256: string;
  bytes: Uint8Array;
  provenance: ThemeSoundProvenanceV1;
};
// prettier-ignore
export type PreparedThemeSoundV1 = {
  version: 1;
  role: ThemeSoundRoleV1;
  source: ThemeSoundAssetV1;
  prepared: ThemeSoundAssetV1;
  recipe: WavRecipeV1;
  format: { channels: 1; sampleRate: 22_050; bitsPerSample: 16 };
  capability: { targetSha256: typeof THEME_SOUNDS_V1_TARGET_SHA256 };
  audition: { label: "Desktop audition"; waveform: number[]; hardwareParityClaimed: false };
};
// prettier-ignore
export type ThemeSoundPrepareInputV1 = {
  role: ThemeSoundRoleV1;
  sourceBytes: Uint8Array;
  recipe?: Partial<WavRecipeV1>;
  provenance: ThemeSoundProvenanceV1;
};
export type ThemeSoundSetV1 = Partial<Record<ThemeSoundRoleV1, PreparedThemeSoundV1>>;

const defaults: WavRecipeV1 = { trimStartMs: 0, trimEndMs: 0, fadeInMs: 0, fadeOutMs: 0, gainPercent: 100 };
const fail = (message: string): never => {
  throw new Error(message);
};
const round = (value: number, divisor = 1) =>
  value < 0 ? -Math.floor((-value + divisor / 2) / divisor) : Math.floor((value + divisor / 2) / divisor);
const clamp = (value: number) => Math.max(-32_768, Math.min(32_767, round(value)));
const word = (view: DataView, offset: number) =>
  new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset + offset, 4));
const put = (bytes: Uint8Array, value: string, offset: number) => bytes.set(new TextEncoder().encode(value), offset);

const parseWav = (bytes: Uint8Array) => {
  if (bytes.length < 44 || bytes.length > 16_777_216) fail("WAV RIFF/WAVE header is invalid.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (word(view, 0) !== "RIFF" || word(view, 8) !== "WAVE") fail("WAV must be a RIFF/WAVE file.");
  let code = 0,
    channels = 0,
    rate = 0,
    bits = 0,
    block = 0,
    start = -1,
    end = -1;
  // prettier-ignore
  for (let offset = 12; offset + 8 <= bytes.length;) { const size = view.getUint32(offset + 4, true), data = offset + 8, id = word(view, offset); if (data + size > bytes.length) fail("WAV chunk is truncated."); if (id === "fmt ") { if (size < 16) fail("WAV fmt chunk is truncated."); code = view.getUint16(data, true); channels = view.getUint16(data + 2, true); rate = view.getUint32(data + 4, true); block = view.getUint16(data + 12, true); bits = view.getUint16(data + 14, true); } else if (id === "data") { start = data; end = data + size; } offset = data + size + (size & 1); }
  const length = end - start;
  if (!(
    code === 1 &&
    [1, 2].includes(channels) &&
    bits === 16 &&
    rate > 0 &&
    block === channels * 2 &&
    length > 0 &&
    start >= 0 &&
    end > start &&
    end <= bytes.length &&
    length % block === 0
  ))
    fail("Only non-empty PCM 16-bit WAV data is supported.");
  // prettier-ignore
  const samples = Array.from({ length: length / block }, (_, frame) => clamp(round(Array.from({ length: channels }, (_, channel) => view.getInt16(start + frame * block + channel * 2, true)).reduce((sum, sample) => sum + sample, 0), channels)));
  return { rate, samples };
};

const makeWav = (samples: readonly number[]) => {
  const bytes = new Uint8Array(44 + samples.length * 2),
    view = new DataView(bytes.buffer);
  put(bytes, "RIFF", 0);
  put(bytes, "WAVEfmt ", 8);
  put(bytes, "data", 36);
  // prettier-ignore
  view.setUint32(4, 36 + samples.length * 2, true);
  view.setUint32(16, 16, true);
  view.setUint32(24, THEME_SOUND_SAMPLE_RATE_V1, true);
  view.setUint32(28, THEME_SOUND_SAMPLE_RATE_V1 * 2, true);
  view.setUint32(40, samples.length * 2, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, clamp(sample), true));
  return bytes;
};

export function prepareThemeSoundV1(input: ThemeSoundPrepareInputV1): PreparedThemeSoundV1 {
  if (!roles.includes(input.role)) fail("WAV sound role is unsupported.");
  const recipe = { ...defaults, ...input.recipe };
  if (
    Object.values(recipe).some((value) => !Number.isInteger(value) || value < 0) ||
    recipe.trimStartMs > 60_000 ||
    recipe.trimEndMs > 60_000 ||
    recipe.fadeInMs > 10_000 ||
    recipe.fadeOutMs > 10_000 ||
    recipe.gainPercent > 400
  )
    fail("WAV trim/fade/gain recipe is outside its bounded limits.");
  const provenance = input.provenance;
  if (
    !provenance ||
    Object.entries(provenance).some(
      ([key, value]) => key !== "rightsToExport" && (typeof value !== "string" || !value.trim()),
    ) ||
    typeof provenance.rightsToExport !== "boolean"
  )
    fail("WAV provenance is incomplete.");
  if (/^(?:[a-z]:[\\/]|[\\/]|file:)/i.test(provenance.source)) fail("WAV provenance cannot contain a filesystem path.");
  const decoded = parseWav(input.sourceBytes),
    start = Math.floor((recipe.trimStartMs * decoded.rate) / 1_000),
    end = Math.floor((recipe.trimEndMs * decoded.rate) / 1_000);
  if (start + end >= decoded.samples.length) fail("WAV trim removes all PCM data.");
  const trimmed = decoded.samples.slice(start, decoded.samples.length - end),
    fadeIn = Math.floor((recipe.fadeInMs * decoded.rate) / 1_000),
    fadeOut = Math.floor((recipe.fadeOutMs * decoded.rate) / 1_000);
  // prettier-ignore
  const shaped = trimmed.map((sample, index) => { const incoming = fadeIn ? Math.min(1_000_000, Math.floor(index * 1_000_000 / fadeIn)) : 1_000_000, outgoing = fadeOut ? Math.min(1_000_000, Math.floor((trimmed.length - 1 - index) * 1_000_000 / fadeOut)) : 1_000_000; return round(sample * recipe.gainPercent * Math.min(incoming, outgoing), 100 * 1_000_000); });
  const count = Math.max(1, Math.ceil((shaped.length * THEME_SOUND_SAMPLE_RATE_V1) / decoded.rate));
  if (count * 2 > THEME_SOUND_MAX_PCM_BYTES_V1) fail("Prepared WAV PCM exceeds 11,024 bytes.");
  // prettier-ignore
  const output = Array.from({ length: count }, (_, index) => { const position = index * decoded.rate, left = Math.floor(position / THEME_SOUND_SAMPLE_RATE_V1), remainder = position % THEME_SOUND_SAMPLE_RATE_V1; return left >= shaped.length - 1 ? shaped.at(-1)! : round(shaped[left]! * (THEME_SOUND_SAMPLE_RATE_V1 - remainder) + shaped[left + 1]! * remainder, THEME_SOUND_SAMPLE_RATE_V1); });
  const sourceBytes = new Uint8Array(input.sourceBytes),
    preparedBytes = makeWav(output),
    sourceSha256 = sha256(sourceBytes),
    preparedSha256 = sha256(preparedBytes),
    runtimePath = `sounds/${input.role}.wav` as const;
  if (preparedBytes.length > THEME_SOUND_MAX_FILE_BYTES_V1) fail("Prepared WAV exceeds the 16 KiB file limit.");
  const asset = (bytes: Uint8Array, digest: string, path: string): ThemeSoundAssetV1 => ({
    mediaType: "audio/wav",
    path,
    sha256: digest,
    bytes,
    provenance,
  });
  // prettier-ignore
  return { version: 1, role: input.role, source: asset(sourceBytes, sourceSha256, `assets/sha256/${sourceSha256}.wav`), prepared: asset(preparedBytes, preparedSha256, runtimePath), recipe, format: { channels: 1, sampleRate: THEME_SOUND_SAMPLE_RATE_V1, bitsPerSample: 16 }, capability: { targetSha256: THEME_SOUNDS_V1_TARGET_SHA256 }, audition: { label: "Desktop audition", waveform: output.slice(0, 32).map((sample) => Math.round(Math.abs(sample) / 32_768 * 100) / 100), hardwareParityClaimed: false } };
}

export function reopenThemeSoundV1(sound: PreparedThemeSoundV1): PreparedThemeSoundV1 {
  if (sha256(sound.source.bytes) !== sound.source.sha256 || sha256(sound.prepared.bytes) !== sound.prepared.sha256)
    fail("Stored WAV bytes do not match their hashes.");
  return structuredClone(sound);
}
export const validateThemeSoundsV1 = (sounds: ThemeSoundSetV1): boolean =>
  Object.values(sounds).every((sound) => !sound || sound.source.provenance.rightsToExport === true);
