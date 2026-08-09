import { describe, expect, it } from "vitest";
import { prepareThemeSoundV1 } from "../../dspico-contract/src/theme-sounds-v1.js";
import { applyOperationV3, createProjectV3, currentProjectV3, openProjectV3, saveProjectV3 } from "./index.js";

const wav = () =>
  Uint8Array.from(
    Buffer.from(
      "524946462800000057415645666d742010000000010001002256000044ac00000200100064617461040000000000e803",
      "hex",
    ),
  );
const provenance = {
  originalName: "nav.wav",
  source: "fixture",
  author: "A",
  credit: "A",
  license: "Test",
  terms: "Test",
  notice: "Test",
  intendedUse: "Navigation",
  rightsToExport: true,
} as const;
const operation = (gainPercent: number) => {
  const sound = prepareThemeSoundV1({ role: "navigation", sourceBytes: wav(), recipe: { gainPercent }, provenance });
  return {
    version: 3,
    type: "set-theme-sound",
    role: "navigation-sound",
    asset: {
      id: "wav:navigation",
      media: {
        sha256: sound.source.sha256,
        byteLength: sound.source.bytes.length,
        mediaType: "audio/wav",
        path: sound.source.path,
      },
      prepared: {
        sha256: sound.prepared.sha256,
        byteLength: sound.prepared.bytes.length,
        mediaType: "audio/wav",
        path: `assets/sha256/${sound.prepared.sha256}.wav`,
      },
      role: "navigation-sound",
      provenance,
      rightsToExport: true,
      recipe: { wav: sound.recipe, audition: sound.audition },
    },
  } as const;
};

describe("V3 theme sound history", () => {
  it("uses one operation for each add, recipe edit, and removal and survives reopen/undo", () => {
    let state = createProjectV3({
      projectId: "audio",
      metadata: { name: "Audio", description: "Audio project", author: "A" },
      themeKind: "custom",
    });
    state = applyOperationV3(state, operation(100));
    expect(state.operations).toHaveLength(1);
    state = applyOperationV3(state, operation(50));
    expect(state.operations).toHaveLength(2);
    expect(currentProjectV3(state).assets.find(({ id }) => id === "wav:navigation")?.recipe).toMatchObject({
      wav: { gainPercent: 50 },
    });
    state = applyOperationV3(state, { version: 3, type: "set-theme-sound", role: "navigation-sound" });
    expect(state.operations).toHaveLength(3);
    expect(currentProjectV3(state).roleAssignments["navigation-sound"]).toBeUndefined();
    const undone = { ...state, cursor: 2 };
    expect(currentProjectV3(undone).roleAssignments["navigation-sound"]).toBeTruthy();
    const reopened = openProjectV3(saveProjectV3(undone));
    expect(reopened.cursor).toBe(2);
    expect(reopened.project.assets.find(({ id }) => id === "wav:navigation")?.recipe).toMatchObject({
      wav: { gainPercent: 50 },
    });
  });
});
