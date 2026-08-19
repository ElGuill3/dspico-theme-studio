import { describe, expect, it } from "vitest";
import {
  prepareThemeSoundV1,
  reopenThemeSoundV1,
  validateThemeSoundsV1,
  type ThemeSoundPrepareInputV1,
} from "./theme-sounds-v1.js";

const wav = (samples: number[][], rate = 44_100, format = 1) => {
  const channels = samples[0]!.length,
    data = Buffer.alloc(samples.length * channels * 2),
    bytes = Buffer.alloc(44 + data.length);
  // prettier-ignore
  samples.flat().forEach((sample, index) => data.writeInt16LE(sample, index * 2));
  // prettier-ignore
  bytes.write("RIFF");
  bytes.writeUInt32LE(36 + data.length, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(format, 20);
  bytes.writeUInt16LE(channels, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * channels * 2, 28);
  bytes.writeUInt16LE(channels * 2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(data.length, 40);
  data.copy(bytes, 44);
  return new Uint8Array(bytes);
};
// prettier-ignore
const provenance = { originalName: "sound.wav", source: "https://example.test/sound.wav", author: "Ada", credit: "Ada", license: "CC-BY-4.0", terms: "Attribution required", notice: "Copyright Ada", intendedUse: "Theme sound", rightsToExport: true } as const;
const input = (
  sourceBytes: Uint8Array,
  role: "navigation" | "select" | "back" = "navigation",
): ThemeSoundPrepareInputV1 => ({
  role,
  sourceBytes,
  recipe: { trimStartMs: 0, trimEndMs: 0, fadeInMs: 1, fadeOutMs: 1, gainPercent: 100 },
  provenance: { ...provenance, originalName: `${role}.wav` },
});

describe("theme UI sound contract", () => {
  it("deterministically prepares mono bounded PCM for local audition", () => {
    const source = wav([
        [0, 0],
        [12_000, -12_000],
        [32_767, 32_767],
        [-32_768, -32_768],
      ]),
      first = prepareThemeSoundV1(input(source)),
      second = prepareThemeSoundV1(input(source));
    expect(first.prepared.bytes).toEqual(second.prepared.bytes);
    expect(first).toMatchObject({
      format: { channels: 1, sampleRate: 22_050, bitsPerSample: 16 },
      audition: { label: "Desktop audition", hardwareParityClaimed: false },
      prepared: { path: "sounds/navigation.wav" },
    });
    expect(reopenThemeSoundV1(first).prepared.bytes).toEqual(first.prepared.bytes);
  });
  it("rejects unsupported, malformed, oversized, and unsafe recipes", () => {
    expect(() => prepareThemeSoundV1(input(wav([[0]], 44_100, 3)))).toThrow(/PCM/);
    expect(() =>
      prepareThemeSoundV1(
        input(
          wav(
            Array.from({ length: 8_000 }, () => [1]),
            22_050,
          ),
        ),
      ),
    ).toThrow(/11,024|16 KiB/);
    expect(() => prepareThemeSoundV1({ ...input(wav([[0]])), recipe: { trimStartMs: -1 } })).toThrow(/trim/);
    expect(() => prepareThemeSoundV1(input(new Uint8Array([82, 73, 70, 70])))).toThrow(/WAVE|RIFF/);
  });
  it("allows each canonical sound to be omitted and rejects Launch", () => {
    expect(validateThemeSoundsV1({})).toBe(true);
    for (const role of ["navigation", "select", "back"] as const) {
      const sound = prepareThemeSoundV1(input(wav([[0], [1000]]), role));
      expect(validateThemeSoundsV1({ [role]: sound })).toBe(true);
      expect(sound.prepared.path).toBe(`sounds/${role}.wav`);
    }
    expect(() => prepareThemeSoundV1(input(wav([[0], [1000]]), "launch" as never))).toThrow(/unsupported/);
  });
});
