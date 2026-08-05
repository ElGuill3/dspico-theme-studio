import { describe, expect, it } from "vitest";
import { validateThemeProjectV2 } from "./index.js";

const hash = (character: string) => character.repeat(64);
const asset = (character: string) => ({
  sourceSha256: hash(character),
  width: 256,
  height: 192,
  normalizationPolicy: "rgba8-straight-top-left-v1",
  provenance: {
    originalName: `${character}.png`,
    source: `https://example.test/${character}.png`,
    author: "Author",
    credit: "Author",
    license: "CC-BY-4.0",
    terms: "Attribution required",
    notice: "Copyright Author",
    intendedUse: "Custom theme background",
    rightsToExport: true,
  },
  referenceOnly: false,
});
const layer = (screen: "top" | "bottom", character: string) => ({
  id: `${screen}-layer`,
  name: `${screen} background`,
  visible: true,
  opacity: 65536,
  asset: { path: `assets/sha256/${hash(character)}.png`, sha256: hash(character) },
  xQ16: 0,
  yQ16: 0,
  width: 256,
  height: 192,
  widthQ16: 256 * 65536,
  heightQ16: 192 * 65536,
  crop: { x: 0, y: 0, width: 256, height: 192 },
});
const project = () => ({
  formatVersion: 2,
  projectId: "custom-validation",
  themeKind: "custom",
  metadata: { name: "Custom", description: "A complete custom theme", author: "Author" },
  targetProfileId: "dspico-launcher-v1",
  tokens: {},
  launchTransition: { coverStartScalePercent: 100, coverFinalAlpha: 12, scrimFinalAlpha: 14 },
  scenes: [],
  assetManifest: [
    { path: `assets/sha256/${hash("a")}.png`, sha256: hash("a") },
    { path: `assets/sha256/${hash("b")}.png`, sha256: hash("b") },
  ],
  acknowledgments: [],
  documents: [
    { screen: "top", width: 256, height: 192, layers: [layer("top", "a")] },
    { screen: "bottom", width: 256, height: 192, layers: [layer("bottom", "b")] },
  ],
  assets: [asset("a"), asset("b")],
  notices: [],
});

describe("Custom V2 compatibility validation", () => {
  it("accepts a source-backed top/bottom project without mutating it", () => {
    const input = project();
    const before = JSON.stringify(input);

    const result = validateThemeProjectV2(input);

    expect(result).toMatchObject({ profileId: "dspico-launcher-v1", diagnostics: [], canExport: true });
    expect(JSON.stringify(input)).toBe(before);
  });

  it("reports nested transition conflicts without selecting either value", () => {
    const input = { ...project(), coverFinalAlpha: 1 };

    const result = validateThemeProjectV2(input);

    expect(result.canExport).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        ruleId: "transition.conflict",
        location: { document: "project.json", pointer: "/launchTransition/coverFinalAlpha" },
        normalizedValue: { nested: 12, root: 1 },
      }),
    );
  });

  it("orders profile, slot, document, and layer diagnostics stably with precise paths", () => {
    const input = project() as ReturnType<typeof project> & { slots?: unknown };
    input.targetProfileId = "future-profile";
    input.slots = { grid: { asset: "later.bin" } };
    input.documents[0]!.width = 255;
    input.assets = input.assets.slice(1);

    const first = validateThemeProjectV2(input);
    const second = validateThemeProjectV2(JSON.parse(JSON.stringify(input)));

    expect(first).toEqual(second);
    expect(first.diagnostics.map(({ ruleId }) => ruleId)).toEqual([
      "custom.asset-record",
      "custom.document-dimensions",
      "custom.unsupported-slot",
      "profile.unsupported",
    ]);
    expect(first.diagnostics[0]?.location.pointer).toBe("/documents/0/layers/0/asset");
    expect(first.diagnostics[2]?.location.pointer).toBe("/slots/grid");
    expect(first.diagnostics.every(({ evidence }) => evidence.length > 0)).toBe(true);
  });

  it.each(["grid", "banner", "scrim", "palette", "icon", "preview", "audio", "bgm"])(
    "rejects unsupported later slot %s",
    (slot) => {
      const input = project() as ReturnType<typeof project> & { slots?: Record<string, unknown> };
      input.slots = { [slot]: true };
      const result = validateThemeProjectV2(input);
      expect(result.canExport).toBe(false);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          ruleId: "custom.unsupported-slot",
          location: { document: "project.json", pointer: `/slots/${slot}` },
        }),
      );
    },
  );

  it("requires a new acknowledgment when warning identity changes", () => {
    const input = project();
    input.metadata.description = "Short";
    const warning = validateThemeProjectV2(input).diagnostics.find(({ severity }) => severity === "warning")!;

    expect(validateThemeProjectV2(input).canExport).toBe(false);
    expect(validateThemeProjectV2(input, [warning.fingerprint])).toMatchObject({
      acknowledgedFingerprints: [warning.fingerprint],
      canExport: true,
    });
    input.metadata.description = "Tiny";
    const changed = validateThemeProjectV2(input, [warning.fingerprint]);
    expect(changed.canExport).toBe(false);
    expect(changed.acknowledgedFingerprints).toEqual([]);
    expect(changed.diagnostics[0]?.fingerprint).not.toBe(warning.fingerprint);
    const changedKind = validateThemeProjectV2({ ...project(), themeKind: "material", metadata: input.metadata }, [
      warning.fingerprint,
    ]);
    expect(changedKind.acknowledgedFingerprints).toEqual([]);
  });
});
