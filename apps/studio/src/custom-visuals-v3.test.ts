import { describe, expect, it } from "vitest";
import { CUSTOM_VISUAL_DOCUMENTS_V1, CUSTOM_VISUAL_ROLES_V1 } from "../../../packages/dspico-contract/src/index.js";
import { createVisualDocumentV3 } from "../../../packages/theme-core/src/index.js";
import {
  compileEffectiveCustomVisualsV3,
  effectiveCustomVisualSourcesV3,
  type EffectiveCustomVisualsV3,
} from "./custom-visuals-v3.js";

const empty = (): EffectiveCustomVisualsV3 => ({
  images: {},
  visualSources: {},
  visualDocuments: Object.fromEntries(
    CUSTOM_VISUAL_ROLES_V1.map((role) => [role, createVisualDocumentV3(role)]),
  ) as EffectiveCustomVisualsV3["visualDocuments"],
});
describe("effective Custom visuals", () => {
  it("collects only a real started role and keeps strict compilation fail-closed", () => {
    const input = empty(),
      role = "top-background" as const,
      { width, height } = CUSTOM_VISUAL_DOCUMENTS_V1[role],
      source = {
        role,
        sourceSha256: "f".repeat(64),
        width,
        height,
        pixels: new Uint8Array(width * height * 4),
        provenance: { source: "Imported test image", rightsToExport: true },
      };
    input.visualSources[role] = source;
    expect(effectiveCustomVisualSourcesV3(input)).toEqual([source]);
    expect(() => compileEffectiveCustomVisualsV3(input)).toThrow("Exactly seven visual roles are required.");
  });
});
