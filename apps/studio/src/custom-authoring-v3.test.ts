import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CUSTOM_VISUAL_ROLES_V1,
  compositeProfileSha256V1,
  prepareThemeSoundV1,
  sha256,
} from "../../../packages/dspico-contract/src/index.js";
import { LAUNCHER_V1_PROFILE } from "../../../packages/dspico-contract/src/profile-v1-3.js";
import {
  applyOperationV3,
  applyOperationV2,
  confirmRolesV3,
  createMediaRefV3,
  createProjectV2,
  createProjectV3,
  currentProjectV3,
} from "../../../packages/theme-core/src/index.js";
import {
  compileCustomPublicationV3,
  compileEffectiveCustomVisualsV3,
  customAuthoringSnapshotV3,
  diagnoseCustomPublicationV3,
} from "./custom-authoring-v3.js";
import { importPng } from "./png-import.js";

const metadata = { name: "Custom", description: "Custom mixed media", author: "Ada" };
const publicationBytes = (publication: ReturnType<typeof compileCustomPublicationV3>, filePath: string) =>
  publication.files.find(({ path }) => path === filePath)!.bytes;
const provenance = {
  originalName: "source.png",
  source: "fixture",
  author: "Ada",
  credit: "Ada",
  license: "Fixture",
  terms: "Fixture",
  notice: "Fixture",
  intendedUse: "Custom visual",
  rightsToExport: true,
} as const;
const wav = () =>
  Uint8Array.from(
    Buffer.from(
      "524946462800000057415645666d742010000000010001002256000044ac00000200100064617461040000000000e803",
      "hex",
    ),
  );

const complete = () => {
  const pngBytes = new Uint8Array(
    readFileSync(path.resolve("apps/studio/src/renderer/assets/launcher-preview/coverflow-bottom.png")),
  );
  const png = importPng(pngBytes, provenance);
  const { pixels: _pixels, sourceBytes: _sourceBytes, ...assetRecord } = png;
  void _pixels;
  void _sourceBytes;
  let composition = createProjectV2({
    projectId: "custom",
    metadata,
    themeKind: "custom",
    tokens: { primaryColor: { r: 1, g: 2, b: 3 } as never, darkTheme: false },
  });
  for (const screen of ["top", "bottom"] as const)
    composition = applyOperationV2(composition, {
      version: 2,
      type: "add-layer",
      screen,
      layer: {
        id: `${screen}-background`,
        name: `${screen} background`,
        visible: true,
        opacity: 65536,
        asset: { path: `assets/sha256/${png.sourceSha256}.png`, sha256: png.sourceSha256 },
        xQ16: 0,
        yQ16: 0,
        width: png.width,
        height: png.height,
        widthQ16: 256 * 65536,
        heightQ16: 192 * 65536,
        crop: { x: 0, y: 0, width: png.width, height: png.height },
      },
      assetRecord,
    });
  let state = createProjectV3({ projectId: "custom", metadata, themeKind: "custom", legacyComposition: composition });
  const media = new Map<string, Uint8Array>([[png.sourceSha256, pngBytes]]);
  for (const role of CUSTOM_VISUAL_ROLES_V1) {
    state = applyOperationV3(state, {
      version: 3,
      type: "add-media",
      asset: {
        id: `visual:${role}`,
        media: createMediaRefV3(pngBytes, "image/png"),
        role,
        provenance,
        rightsToExport: true,
        recipe: { transform: "nearest-center-floor-v1" },
      },
    });
    state = confirmRolesV3(state, { [role]: png.sourceSha256 });
  }
  const sound = prepareThemeSoundV1({
    role: "navigation",
    sourceBytes: wav(),
    provenance: { ...provenance, intendedUse: "Navigation sound" },
  });
  media.set(sound.source.sha256, sound.source.bytes);
  media.set(sound.prepared.sha256, sound.prepared.bytes);
  state = applyOperationV3(state, {
    version: 3,
    type: "add-media",
    asset: {
      id: "wav:navigation",
      media: createMediaRefV3(sound.source.bytes, "audio/wav"),
      prepared: createMediaRefV3(sound.prepared.bytes, "audio/wav"),
      role: "navigation-sound",
      provenance: sound.source.provenance,
      rightsToExport: true,
      recipe: { wav: sound.recipe, audition: sound.audition },
    },
  });
  state = confirmRolesV3(state, { "navigation-sound": sound.source.sha256 });
  const bcstm = Uint8Array.of(67, 83, 84, 77, 1, 2, 3, 4),
    bcstmRef = createMediaRefV3(bcstm, "audio/bcstm");
  media.set(bcstmRef.sha256, bcstm);
  state = applyOperationV3(state, {
    version: 3,
    type: "add-media",
    asset: { id: "bcstm:bgm", media: bcstmRef, role: "bgm", provenance: { source: "fixture" }, rightsToExport: true },
  });
  state = confirmRolesV3(state, { bgm: bcstmRef.sha256 });
  state = applyOperationV3(state, {
    version: 3,
    type: "set-component-evidence",
    component: "bcstm",
    receipt: {
      version: 1,
      schema: "dspico-bcstm-receipt-v1",
      component: "bcstm",
      tester: "Ada",
      device: "DSi",
      cartridge: "cart",
      launcherBuild: "build",
      testedAt: "2026-08-08T00:00:00.000Z",
      profile: {
        id: LAUNCHER_V1_PROFILE.profileId,
        tag: LAUNCHER_V1_PROFILE.tag,
        commit: LAUNCHER_V1_PROFILE.launcherCommit,
        sha256: compositeProfileSha256V1(),
      },
      sourceSha256: bcstmRef.sha256,
      path: `bgm/${bcstmRef.sha256}.bcstm`,
      observations: ["source inspected"],
      pass: true,
    },
  });
  return { state, media, png, sound, bcstmRef };
};

describe("active V3 Custom package", () => {
  it("returns path-precise diagnostics for incomplete visuals without requiring a visual receipt", () => {
    const legacy = createProjectV2({ projectId: "custom", metadata, themeKind: "custom" });
    const incomplete = createProjectV3({
      projectId: "custom",
      metadata,
      themeKind: "custom",
      legacyComposition: legacy,
    });
    const diagnostics = diagnoseCustomPublicationV3(currentProjectV3(incomplete), new Map());
    expect(diagnostics).toHaveLength(CUSTOM_VISUAL_ROLES_V1.length);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        ruleId: "custom.visual-role-incomplete",
        location: { document: "project.json", pointer: "/roleAssignments/top-background" },
      }),
    );

    const completed = complete();
    expect(currentProjectV3(completed.state).componentEvidence.visual).toBeUndefined();
    expect(diagnoseCustomPublicationV3(currentProjectV3(completed.state), completed.media)).toEqual([]);
  });

  it("diagnoses missing media, optional WAV failure, malformed documents, and stale BGM evidence", () => {
    const completed = complete(),
      project = currentProjectV3(completed.state);
    const missing = new Map(completed.media);
    missing.delete(completed.png.sourceSha256);
    expect(diagnoseCustomPublicationV3(project, missing)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "custom.media-missing",
          location: expect.objectContaining({ document: "bundle" }),
        }),
      ]),
    );
    const corrupt = new Map(completed.media);
    corrupt.set(completed.png.sourceSha256, Uint8Array.of(1, 2, 3));
    expect(diagnoseCustomPublicationV3(project, corrupt)).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId: "custom.media-corrupt" })]),
    );

    project.metadata.name = " padded";
    expect(diagnoseCustomPublicationV3(project, completed.media)).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId: "custom.metadata.name" })]),
    );
    project.metadata.name = metadata.name;

    const wavAsset = project.assets.find(({ id }) => id === "wav:navigation")!;
    delete wavAsset.prepared;
    expect(diagnoseCustomPublicationV3(project, completed.media)).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId: "custom.wav-prepared-missing" })]),
    );
    wavAsset.prepared = createMediaRefV3(completed.sound.prepared.bytes, "audio/wav");

    project.visualDocuments = { scrim: { role: "scrim", width: 9, height: 42, layers: [] } } as never;
    expect(diagnoseCustomPublicationV3(project, completed.media)).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId: "custom.visual-document-malformed" })]),
    );
    delete project.visualDocuments;
    project.componentEvidence.bcstm = { sourceSha256: "0".repeat(64) };
    const bgmDiagnostics = diagnoseCustomPublicationV3(project, completed.media);
    expect(bgmDiagnostics).toContainEqual(
      expect.objectContaining({
        ruleId: "custom.bgm-incompatible",
        location: { document: "project.json", pointer: "/roleAssignments/bgm" },
      }),
    );
    expect(bgmDiagnostics.map(({ ruleId, location, message }) => ({ ruleId, location, message }))).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ message: expect.stringMatching(/receipt|evidence/i) })]),
    );
  });
  it("publishes assigned visual outputs and deterministic WAV/BCSTM paths without placeholders", () => {
    const { state, media, sound, bcstmRef } = complete();
    const plan = compileCustomPublicationV3(currentProjectV3(state), media);
    expect(plan.expectation.profileSha256).toBe(compositeProfileSha256V1());
    expect(plan.files.find(({ path }) => path === "sounds/navigation.wav")?.bytes).toEqual(sound.prepared.bytes);
    expect(plan.files.find(({ path }) => path === `bgm/${bcstmRef.sha256}.bcstm`)?.bytes).toEqual(
      media.get(bcstmRef.sha256),
    );
    for (const path of ["gridcell.bin", "bannerListCell.bin", "scrim.bin"])
      expect(plan.files.find((file) => file.path === path)?.bytes.some(Boolean)).toBe(true);
  });

  it("changes only the corresponding exported background when creator composition moves", () => {
    const { state, media } = complete();
    const before = compileCustomPublicationV3(currentProjectV3(state), media);
    const legacy = currentProjectV3(state).legacyComposition as ReturnType<typeof createProjectV2>;
    const moved = applyOperationV3(state, {
      version: 3,
      type: "set-legacy-composition",
      composition: applyOperationV2(legacy, {
        version: 2,
        type: "move-layer",
        screen: "top",
        layerId: "top-background",
        xQ16: 65536,
        yQ16: 0,
      }),
    });
    const after = compileCustomPublicationV3(currentProjectV3(moved), media);
    const output = (plan: typeof before, path: string) => plan.files.find((file) => file.path === path)!.bytes;

    expect(output(after, "topbg.bin")).not.toEqual(output(before, "topbg.bin"));
    expect(output(after, "bottombg.bin")).toEqual(output(before, "bottombg.bin"));
  }, 15_000);

  it("lets an authored role document override only that role's assigned output", () => {
    const completed = complete();
    const before = compileCustomPublicationV3(currentProjectV3(completed.state), completed.media);
    const beforeRail = compileEffectiveCustomVisualsV3(
      customAuthoringSnapshotV3(currentProjectV3(completed.state), completed.media),
    );
    const layer = {
      id: "grid-authored",
      name: "Grid authored",
      visible: true,
      opacity: 65536,
      asset: { path: `assets/sha256/${completed.png.sourceSha256}.png`, sha256: completed.png.sourceSha256 },
      xQ16: 16 * 65536,
      yQ16: 0,
      width: completed.png.width,
      height: completed.png.height,
      widthQ16: 64 * 65536,
      heightQ16: 64 * 65536,
      crop: { x: 32, y: 16, width: 64, height: 64 },
    };
    const authored = applyOperationV3(completed.state, {
      version: 3,
      type: "edit-visual-document",
      role: "grid-cell",
      operation: { version: 2, type: "add-layer", screen: "top", layer },
    });
    const after = compileCustomPublicationV3(currentProjectV3(authored), completed.media);
    const rail = compileEffectiveCustomVisualsV3(
      customAuthoringSnapshotV3(currentProjectV3(authored), completed.media),
    );
    const output = (plan: typeof before, filePath: string) => plan.files.find(({ path }) => path === filePath)!.bytes;
    const gridPaths = new Set(["gridcell.bin", "gridcellPltt.bin"]);

    expect(publicationBytes(after, "gridcell.bin")).not.toEqual(publicationBytes(before, "gridcell.bin"));
    expect(rail.outputs.find(({ path }) => path === "gridcell.bin")?.sha256).not.toBe(
      beforeRail.outputs.find(({ path }) => path === "gridcell.bin")?.sha256,
    );
    expect(rail.outputs.find(({ path }) => path === "gridcell.bin")?.sha256).toBe(
      after.expectation.manifest.find(({ path }) => path === "gridcell.bin")?.sha256,
    );
    for (const railOutput of rail.outputs.filter(({ role }) => role !== "grid-cell"))
      expect(railOutput.bytes, railOutput.path).toEqual(output(before, railOutput.path));
    for (const { path: filePath } of before.files)
      if (!gridPaths.has(filePath) && filePath !== "report.json")
        expect(output(after, filePath), filePath).toEqual(output(before, filePath));
  }, 15_000);

  it("changes only one role's exported bytes when a native shape changes", () => {
    const completed = complete(),
      before = compileCustomPublicationV3(currentProjectV3(completed.state), completed.media),
      added = applyOperationV3(completed.state, {
        version: 3,
        type: "edit-visual-document",
        role: "grid-cell-selected",
        operation: {
          version: 3,
          type: "add-shape-layer",
          layer: {
            kind: "shape",
            shape: "ellipse",
            fill: "#ff2040",
            id: "selected-ellipse",
            name: "Selected ellipse",
            visible: true,
            opacity: 32768,
            xQ16: 8 * 65536,
            yQ16: 8 * 65536,
            widthQ16: 48 * 65536,
            heightQ16: 48 * 65536,
          },
        },
      }),
      after = compileCustomPublicationV3(currentProjectV3(added), completed.media),
      changed = new Set(["gridcellSelected.bin", "gridcellSelectedPltt.bin", "report.json"]);
    for (const file of before.files) {
      const next = after.files.find(({ path: filePath }) => filePath === file.path)!;
      if (changed.has(file.path)) expect(next.bytes, file.path).not.toEqual(file.bytes);
      else expect(next.bytes, file.path).toEqual(file.bytes);
    }
  }, 15_000);

  it("keeps browser rail and exported bytes invariant for group-only and lock-only operations", () => {
    const completed = complete();
    let state = completed.state;
    for (const [id, xQ16] of [
      ["group-a", 0],
      ["group-b", 4 * 65536],
    ] as const)
      state = applyOperationV3(state, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "add-shape-layer",
          layer: {
            kind: "shape",
            shape: "rectangle",
            fill: "#123456",
            id,
            name: id,
            visible: true,
            opacity: 65536,
            xQ16,
            yQ16: 0,
            widthQ16: 4 * 65536,
            heightQ16: 42 * 65536,
          },
        },
      });
    const before = compileCustomPublicationV3(currentProjectV3(state), completed.media),
      beforeRail = compileEffectiveCustomVisualsV3(customAuthoringSnapshotV3(currentProjectV3(state), completed.media)),
      grouped = applyOperationV3(state, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "set-layer-groups",
          memberships: [
            { layerId: "group-a", groupId: "group-render" },
            { layerId: "group-b", groupId: "group-render" },
          ],
        },
      }),
      locked = applyOperationV3(grouped, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "set-layer-locks",
          locks: [
            { layerId: "group-a", locked: true },
            { layerId: "group-b", locked: true },
          ],
        },
      }),
      after = compileCustomPublicationV3(currentProjectV3(locked), completed.media),
      afterRail = compileEffectiveCustomVisualsV3(customAuthoringSnapshotV3(currentProjectV3(locked), completed.media));
    expect(after.files).toEqual(before.files);
    expect(after.zipBytes).toEqual(before.zipBytes);
    expect(afterRail.outputs).toEqual(beforeRail.outputs);
  }, 15_000);

  it("rejects invalid lock state at the compositor boundary", () => {
    const completed = complete(),
      snapshot = customAuthoringSnapshotV3(currentProjectV3(completed.state), completed.media);
    snapshot.visualDocuments.scrim.layers = [
      {
        kind: "shape",
        shape: "rectangle",
        fill: "#123456",
        id: "invalid-lock",
        name: "Invalid lock",
        visible: true,
        locked: "yes",
        opacity: 65536,
        xQ16: 0,
        yQ16: 0,
        widthQ16: 65536,
        heightQ16: 65536,
      } as never,
    ];
    expect(() => compileEffectiveCustomVisualsV3(snapshot)).toThrow("Invalid visual layer lock in scrim");
  });

  it("changes only one role's rail and exported bytes when text is authored", () => {
    const completed = complete(),
      before = compileCustomPublicationV3(currentProjectV3(completed.state), completed.media),
      beforeRail = compileEffectiveCustomVisualsV3(
        customAuthoringSnapshotV3(currentProjectV3(completed.state), completed.media),
      ),
      authored = applyOperationV3(completed.state, {
        version: 3,
        type: "edit-visual-document",
        role: "scrim",
        operation: {
          version: 3,
          type: "add-text-layer",
          layer: {
            kind: "text",
            content: "A\n😀",
            fill: "#abcdef",
            scale: 1,
            alignment: "right",
            id: "scrim-text",
            name: "Scrim text",
            visible: true,
            opacity: 32768,
            xQ16: 0,
            yQ16: 0,
            widthQ16: 8 * 65536,
            heightQ16: 42 * 65536,
          },
        },
      }),
      after = compileCustomPublicationV3(currentProjectV3(authored), completed.media),
      rail = compileEffectiveCustomVisualsV3(customAuthoringSnapshotV3(currentProjectV3(authored), completed.media)),
      changed = new Set(["scrim.bin", "scrimPltt.bin", "report.json"]);
    for (const file of before.files) {
      const next = after.files.find(({ path: filePath }) => filePath === file.path)!;
      if (changed.has(file.path)) expect(next.bytes, file.path).not.toEqual(file.bytes);
      else expect(next.bytes, file.path).toEqual(file.bytes);
    }
    for (const output of rail.outputs) {
      const exported = after.files.find(({ path: filePath }) => filePath === output.path)!;
      expect(output.sha256, output.path).toBe(sha256(exported.bytes));
      if (output.role !== "scrim")
        expect(output.sha256, output.path).toBe(beforeRail.outputs.find(({ path }) => path === output.path)?.sha256);
    }
  }, 15_000);

  it("changes only one role's exported bytes when an authored image crop changes", () => {
    const completed = complete(),
      imageLayer = {
        kind: "image" as const,
        id: "banner-image",
        name: "Banner image",
        visible: true,
        opacity: 65536,
        asset: { path: `assets/sha256/${completed.png.sourceSha256}.png`, sha256: completed.png.sourceSha256 },
        xQ16: 0,
        yQ16: 0,
        width: completed.png.width,
        height: completed.png.height,
        widthQ16: 256 * 65536,
        heightQ16: 49 * 65536,
        crop: { x: 0, y: 0, width: completed.png.width, height: completed.png.height },
      },
      authored = applyOperationV3(completed.state, {
        version: 3,
        type: "edit-visual-document",
        role: "banner-cell",
        operation: { version: 2, type: "add-layer", screen: "top", layer: imageLayer },
      }),
      before = compileCustomPublicationV3(currentProjectV3(authored), completed.media),
      cropped = applyOperationV3(authored, {
        version: 3,
        type: "edit-visual-document",
        role: "banner-cell",
        operation: {
          version: 2,
          type: "set-layer-properties",
          screen: "top",
          layerId: imageLayer.id,
          xQ16: 8 * 65536,
          yQ16: 0,
          widthQ16: 248 * 65536,
          heightQ16: 49 * 65536,
          opacity: 65536,
          crop: { x: 8, y: 0, width: completed.png.width - 8, height: completed.png.height },
        },
      }),
      after = compileCustomPublicationV3(currentProjectV3(cropped), completed.media),
      changed = new Set(["bannerListCell.bin", "bannerListCellPltt.bin", "report.json"]);
    for (const file of before.files) {
      const next = after.files.find(({ path: filePath }) => filePath === file.path)!;
      if (changed.has(file.path)) expect(next.bytes, file.path).not.toEqual(file.bytes);
      else expect(next.bytes, file.path).toEqual(file.bytes);
    }
  }, 15_000);

  it("invalidates only dependent component evidence", () => {
    const completed = complete(),
      png = completed.png;
    let state = completed.state;
    state = applyOperationV3(state, {
      version: 3,
      type: "set-component-evidence",
      component: "visual",
      receipt: { id: "visual" },
    });
    state = applyOperationV3(state, {
      version: 3,
      type: "set-component-evidence",
      component: "bcstm",
      receipt: { id: "bcstm" },
    });
    const wavEdit = applyOperationV3(state, {
      version: 3,
      type: "assign-role",
      role: "navigation-sound",
      mediaSha256: currentProjectV3(state).roleAssignments["navigation-sound"]!,
    });
    expect(currentProjectV3(wavEdit).componentEvidence).toEqual({ visual: { id: "visual" }, bcstm: { id: "bcstm" } });
    const visualEdit = applyOperationV3(state, {
      version: 3,
      type: "assign-role",
      role: "scrim",
      mediaSha256: png.sourceSha256,
    });
    expect(currentProjectV3(visualEdit).componentEvidence).toEqual({});
    const bgmEdit = applyOperationV3(state, {
      version: 3,
      type: "assign-role",
      role: "bgm",
      mediaSha256: currentProjectV3(state).roleAssignments.bgm!,
    });
    expect(currentProjectV3(bgmEdit).componentEvidence).toEqual({ visual: { id: "visual" } });
  });

  it("keeps a rotated crop isolated to its role and identical between rail and publication", () => {
    const completed = complete(),
      imageLayer = {
        kind: "image" as const,
        id: "rotated-image",
        name: "Rotated image",
        visible: true,
        opacity: 65536,
        asset: { path: `assets/sha256/${completed.png.sourceSha256}.png`, sha256: completed.png.sourceSha256 },
        xQ16: 4 * 65536,
        yQ16: 8 * 65536,
        width: completed.png.width,
        height: completed.png.height,
        widthQ16: 40 * 65536,
        heightQ16: 24 * 65536,
        crop: { x: 3, y: 5, width: completed.png.width - 6, height: completed.png.height - 10 },
      },
      authored = applyOperationV3(completed.state, {
        version: 3,
        type: "edit-visual-document",
        role: "grid-cell",
        operation: { version: 2, type: "add-layer", screen: "top", layer: imageLayer },
      }),
      before = compileCustomPublicationV3(currentProjectV3(authored), completed.media),
      rotated = applyOperationV3(authored, {
        version: 3,
        type: "edit-visual-document",
        role: "grid-cell",
        operation: { version: 3, type: "set-layer-rotation", layerId: imageLayer.id, rotation: 90 },
      }),
      snapshot = customAuthoringSnapshotV3(currentProjectV3(rotated), completed.media),
      after = compileCustomPublicationV3(currentProjectV3(rotated), completed.media),
      rail = compileEffectiveCustomVisualsV3(snapshot);
    expect(publicationBytes(after, "gridcell.bin")).not.toEqual(publicationBytes(before, "gridcell.bin"));
    for (const file of before.files)
      if (!["gridcell.bin", "gridcellPltt.bin", "report.json"].includes(file.path))
        expect(publicationBytes(after, file.path), file.path).toEqual(file.bytes);
    for (const railOutput of rail.outputs)
      expect(railOutput.sha256).toBe(sha256(publicationBytes(after, railOutput.path)));
  }, 15_000);
});
