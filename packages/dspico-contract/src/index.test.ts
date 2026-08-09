import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { launcherV1Fixture } from "../../test-fixtures/src/launcher-v1.js";
import { createLauncherParityProject } from "../../theme-core/src/parity-history-v1.js";
import {
  DSPICO_LAUNCHER_V1,
  ExportBlockedError,
  compileThemeExport,
  validateTheme,
  validateVisualReceiptV1,
} from "./index.js";
import { LAUNCHER_V1_VISUAL_FILES } from "./profile-v1-3.js";

const completeTheme = {
  ...launcherV1Fixture.materialExample,
};
const validate = (theme: unknown, acknowledgments: readonly string[] = []) => validateTheme(theme, acknowledgments);
const storedEntries = (zip: Uint8Array) => {
  const entries: Record<string, Uint8Array> = {};
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const start = offset + 30 + nameLength + extraLength;
    const name = new TextDecoder().decode(zip.slice(offset + 30, offset + 30 + nameLength));
    entries[name] = zip.slice(start, start + size);
    offset = start + size;
  }
  return entries;
};

describe("dspico-launcher-v1 validation", () => {
  it("pins the immutable launcher profile and cites evidence on every diagnostic", () => {
    expect(DSPICO_LAUNCHER_V1.launcherCommit).toBe(launcherV1Fixture.launcherCommit);
    const result = validate({ ...completeTheme, primaryColor: { r: 256, g: 0, b: 0 } });
    expect(result.diagnostics).not.toHaveLength(0);
    expect(
      result.diagnostics.every(({ profileId, evidence }) => profileId === "dspico-launcher-v1" && evidence.length > 0),
    ).toBe(true);
  });

  it("accepts a complete Material theme", () => {
    expect(validate(completeTheme)).toMatchObject({ canExport: true, diagnostics: [], theme: completeTheme });
  });

  it("integrates the canonical parity project with the pinned profile", () => {
    const project = createLauncherParityProject({
      projectId: "canonical",
      metadata: { name: completeTheme.name, description: completeTheme.description, author: completeTheme.author },
      primaryColor: completeTheme.primaryColor,
      darkTheme: completeTheme.darkTheme,
    });
    expect(validateTheme(project)).toMatchObject({ canExport: true, diagnostics: [] });
    expect(JSON.parse(new TextDecoder().decode(compileThemeExport(project).files[0]!.bytes))).toMatchObject(
      completeTheme,
    );
  });

  it.each([
    [null, "document.unavailable"],
    ["{bad", "document.malformed"],
    [{}, "metadata.name"],
    [{ ...completeTheme, type: "custom" }, "theme.type"],
    [{ ...completeTheme, formatVersion: 2 }, "theme.format-version"],
    [{ ...completeTheme, launchTransition: {} }, "unsupported.launch-transition"],
  ])("blocks unavailable, malformed, empty, non-Material, and newer input", (theme, ruleId) => {
    const result = validate(theme);
    expect(result.canExport).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ severity: "error", ruleId })]),
    );
  });

  it.each([
    ["selectorAssets", "unsupported.selector-assets"],
    ["preview.bin", "unsupported.preview-bin"],
    ["icon.bmp", "unsupported.icon-bmp"],
    ["wav", "unsupported.wav"],
    ["launchTransition", "unsupported.launch-transition"],
    ["animation", "unsupported.animation"],
    ["timing", "unsupported.timing"],
    ["fonts", "unsupported.fonts"],
    ["covers", "unsupported.covers"],
    ["sdInstall", "unsupported.sd-installation"],
    ["launcherMutation", "unsupported.launcher-mutation"],
    ["ai", "unsupported.ai"],
    ["cloud", "unsupported.cloud"],
  ] as const)("diagnoses every excluded v1.3 feature: %s", (key, ruleId) => {
    const result = validate({ ...completeTheme, [key]: { requested: true } });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId, severity: "error" })]),
    );
    expect(result.canExport).toBe(false);
  });

  it.each([
    ["primaryColor", { r: -1, g: 0, b: 0 }, "color.primaryColor"],
    ["primaryColor", { r: 1.5, g: 0, b: 0 }, "color.primaryColor"],
    ["darkTheme", "false", "theme.dark-theme"],
  ])("strictly rejects invalid RGB, booleans, and transition ranges", (key, value, ruleId) => {
    const result = validate({ ...completeTheme, [key]: value });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ severity: "error", ruleId })]),
    );
  });

  it("requires warning acknowledgment and invalidates stale fingerprints", () => {
    const result = validate({ ...completeTheme, description: "Short" });
    expect(result.canExport).toBe(false);
    const warning = result.diagnostics.find(({ severity }) => severity === "warning");
    expect(warning).toBeDefined();
    const acknowledged = validate({ ...completeTheme, description: "Short" }, [warning!.fingerprint]);
    expect(acknowledged).toMatchObject({ canExport: true, acknowledgedFingerprints: [warning!.fingerprint] });
    const changed = validate({ ...completeTheme, description: "Tiny" }, [warning!.fingerprint]);
    expect(changed.diagnostics[0]?.fingerprint).not.toBe(warning!.fingerprint);
    expect(changed.canExport).toBe(false);
  });

  it("orders diagnostics deterministically by severity, rule, location, and fingerprint", () => {
    const theme = { ...completeTheme, name: "", description: "Tiny", darkTheme: "no", coverFinalAlpha: 99 };
    const first = validate(theme).diagnostics;
    expect(validate(theme).diagnostics).toEqual(first);
    expect(first.map(({ severity }) => severity)).toEqual(["error", "error", "error", "warning"]);
    expect(first.slice(0, 3).map(({ ruleId }) => ruleId)).toEqual(
      [...first.slice(0, 3).map(({ ruleId }) => ruleId)].sort(),
    );
  });
});

describe("deterministic export plan", () => {
  it("blocks errors and unacknowledged warnings before producing bytes", () => {
    expect(() => compileThemeExport({})).toThrow(ExportBlockedError);
    expect(() => compileThemeExport({ ...completeTheme, description: "Short" })).toThrow(ExportBlockedError);
  });

  it("produces byte-identical folder files and level-0 ZIP bytes", () => {
    const first = compileThemeExport(completeTheme);
    const second = compileThemeExport({ ...completeTheme });
    expect(first.files.map(({ path }) => path)).toEqual(["theme.json", "report.json"]);
    expect(first.files).toEqual(second.files);
    expect(first.zipBytes).toEqual(second.zipBytes);
    expect(first.reportSha256).toBe(createHash("sha256").update(first.files[1]!.bytes).digest("hex"));
    expect(storedEntries(first.zipBytes)).toEqual(
      Object.fromEntries(first.files.map((file) => [file.path, file.bytes])),
    );
    const report = JSON.parse(new TextDecoder().decode(first.files[1]!.bytes));
    expect(report.files).toEqual([
      expect.objectContaining({ path: "theme.json", sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    ]);
    expect(report.compatibility).toMatchObject({
      profileId: "dspico-launcher-v1",
      launcherCommit: launcherV1Fixture.launcherCommit,
      compilerVersion: "0.1.0",
    });
    expect(first.zipBytes[8]).toBe(0);
    expect(first.zipBytes[9]).toBe(0);
  });

  it("emits only v1.3-consumed Material fields", () => {
    const plan = compileThemeExport(completeTheme);
    const theme = JSON.parse(new TextDecoder().decode(plan.files[0]!.bytes));
    expect(Object.keys(theme).sort()).toEqual(["author", "darkTheme", "description", "name", "primaryColor", "type"]);
    expect(theme.launchTransition).toBeUndefined();
  });

  it("accepts a visual receipt only for the current 12-file output manifest", () => {
    const expected = Object.fromEntries(
      LAUNCHER_V1_VISUAL_FILES.map((file, index) => [file, "abcdef012345"[index]!.repeat(64)]),
    );
    const receipt = {
      launcherTag: "v1.3.0",
      launcherCommit: launcherV1Fixture.launcherCommit,
      fileHashes: expected,
      observations: ["Software fixture only"],
      pass: true,
    };
    expect(validateVisualReceiptV1(receipt, expected)).toEqual([]);
    const stale = { ...receipt, fileHashes: { ...expected, [LAUNCHER_V1_VISUAL_FILES[0]]: "f".repeat(64) } };
    expect(validateVisualReceiptV1(stale, expected)).toEqual([
      expect.objectContaining({ ruleId: "custom.visual-receipt-invalid", severity: "error" }),
    ]);
  });
});
