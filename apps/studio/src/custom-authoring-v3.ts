import {
  CUSTOM_VISUAL_ROLES_V1,
  CUSTOM_VISUAL_SLOTS_V1,
  CUSTOM_VISUAL_DOCUMENTS_V1,
  THEME_SOUND_ROLES_V1,
  DSPICO_LAUNCHER_V1,
  compositeProfileSha256V1,
  customDiagnosticV1,
  receiptMatchesV1,
  sha256,
  storedZip,
  validateBcstmReceiptV13,
  type CustomVisualRoleV1,
  type CustomVisualSourceV1,
  type PreparedThemeSoundV1,
  type ReceiptExpectationV1,
  type ThemeSoundRoleV1,
  type DiagnosticV1,
} from "../../../packages/dspico-contract/src/index.js";
import {
  currentProjectV2,
  isVisualLayerV3,
  metadataErrorV3,
  validDocumentGuidesV3,
  type CommittedStateV2,
  type MediaAssetV3,
  type ThemeProjectV2,
  type ThemeProjectV3,
  type VisualDocumentV3,
} from "../../../packages/theme-core/src/index.js";
import { importPng, type ImportedPngV1 } from "./png-import.js";
import { compileEffectiveCustomVisualsV3 } from "./custom-visuals-v3.js";
export { compileEffectiveCustomVisualsV3 } from "./custom-visuals-v3.js";

export type CustomAuthoringSnapshotV3 = {
  images: Record<string, ImportedPngV1>;
  visualSources: Partial<Record<CustomVisualRoleV1, CustomVisualSourceV1>>;
  visualDocuments: Record<CustomVisualRoleV1, VisualDocumentV3>;
  sounds: Partial<Record<ThemeSoundRoleV1, PreparedThemeSoundV1>>;
  bcstm?: { sourceSha256: string; sourceBytes: Uint8Array; bundlePath: string };
};
export type CustomPublicationV3 = {
  files: { path: string; bytes: Uint8Array }[];
  zipBytes: Uint8Array;
  reportSha256: string;
  expectation: ReceiptExpectationV1;
};
export class CustomPublicationError extends Error {
  constructor(readonly diagnostics: DiagnosticV1[]) {
    super(diagnostics[0]?.message ?? "Custom publication is blocked.");
    this.name = "CustomPublicationError";
  }
}
type CustomPublicationOptionsV3 = { requireVisualReceipt?: boolean };

const visualRoles = new Set<string>(CUSTOM_VISUAL_ROLES_V1);
const bytesFor = (media: ReadonlyMap<string, Uint8Array>, sha: string): Uint8Array => {
  const bytes = media.get(sha);
  if (!bytes || sha256(bytes) !== sha) throw new Error(`Missing or corrupt Custom media: ${sha}`);
  return bytes;
};
const customThemeBytesV3 = (project: ThemeProjectV3): Uint8Array => {
  const legacy = legacyCustomProjectV3(project);
  return new TextEncoder().encode(
    `${JSON.stringify({ author: project.metadata.author, darkTheme: legacy.tokens.darkTheme, description: project.metadata.description, name: project.metadata.name, primaryColor: legacy.tokens.primaryColor, type: "custom" })}\n`,
  );
};
const visualReceiptExpectationV3 = (
  project: ThemeProjectV3,
  visual: ReturnType<typeof compileEffectiveCustomVisualsV3>,
) => {
  const themeBytes = customThemeBytesV3(project);
  return {
    themeBytes,
    expectation: {
      profileSha256: compositeProfileSha256V1(),
      themeJsonSha256: sha256(themeBytes),
      manifest: CUSTOM_VISUAL_SLOTS_V1.map(({ path }) => ({
        path,
        sha256: sha256(visual.files[path as keyof typeof visual.files]),
      })),
    } satisfies ReceiptExpectationV1,
  };
};
const assetFor = (project: ThemeProjectV3, role: string): MediaAssetV3 | undefined => {
  const sha = project.roleAssignments[role as keyof ThemeProjectV3["roleAssignments"]];
  return sha ? project.assets.find(({ media }) => media.sha256 === sha) : undefined;
};

export function diagnoseCustomPublicationV3(
  project: ThemeProjectV3,
  media: ReadonlyMap<string, Uint8Array>,
  options: CustomPublicationOptionsV3 = {},
): DiagnosticV1[] {
  const diagnostics: DiagnosticV1[] = [],
    add = (code: string, pointer: string, message: string, document = "project.json") =>
      diagnostics.push(customDiagnosticV1(code, document, pointer, message));
  for (const field of ["name", "description", "author"] as const) {
    const error = metadataErrorV3(field, project.metadata?.[field]);
    if (error) add(`custom.metadata.${field}`, `/metadata/${field}`, `${error} Update ${field} in Project settings.`);
  }
  let documents: Record<CustomVisualRoleV1, VisualDocumentV3> | undefined;
  try {
    documents = visualDocuments(project);
  } catch {
    add(
      "custom.document-malformed",
      "/legacyComposition",
      "Custom document history is malformed or unavailable. Restore a valid project backup and reopen it.",
    );
  }
  for (const role of CUSTOM_VISUAL_ROLES_V1) {
    const document = documents?.[role],
      explicit = project.visualDocuments?.[role];
    if (
      explicit &&
      (explicit.role !== role ||
        explicit.width !== CUSTOM_VISUAL_DOCUMENTS_V1[role].width ||
        explicit.height !== CUSTOM_VISUAL_DOCUMENTS_V1[role].height ||
        !Array.isArray(explicit.layers) ||
        !explicit.layers.every(isVisualLayerV3) ||
        !validDocumentGuidesV3(explicit))
    )
      add(
        "custom.visual-document-malformed",
        `/visualDocuments/${role}`,
        `The ${role} document has invalid dimensions, layers, guides, groups, or lock data. Reopen a valid backup or fix the document before export.`,
      );
    const hasLayers = Boolean(document?.layers.length),
      assigned = project.roleAssignments[role],
      asset = assigned ? project.assets.find(({ media: ref }) => ref.sha256 === assigned) : undefined;
    if (!hasLayers && !assigned)
      add(
        "custom.visual-role-incomplete",
        `/roleAssignments/${role}`,
        `The ${role} visual is incomplete. Assign a PNG or add at least one layer to its document.`,
      );
    if (assigned && !project.confirmedRoles.includes(role))
      add("custom.visual-role-unconfirmed", `/confirmedRoles/${role}`, `Confirm the ${role} assignment before export.`);
    if (assigned && !asset)
      add(
        "custom.visual-media-missing",
        `/roleAssignments/${role}`,
        `The ${role} assignment no longer points to imported media. Assign the PNG again.`,
      );
    if (asset && (!asset.rightsToExport || asset.referenceOnly))
      add(
        "custom.visual-rights",
        `/assets/${asset.id}`,
        `The ${role} source is reference-only or lacks export rights. Import an authorized PNG.`,
      );
    if (asset) {
      const bytes = media.get(asset.media.sha256);
      if (!bytes)
        add(
          "custom.media-missing",
          asset.media.path,
          `The ${role} source file is missing. Restore it from backup and reopen the project.`,
          "bundle",
        );
      else if (sha256(bytes) !== asset.media.sha256)
        add(
          "custom.media-corrupt",
          asset.media.path,
          `The ${role} source file does not match its recorded hash. Restore the original file and reopen the project.`,
          "bundle",
        );
    }
  }
  for (const role of THEME_SOUND_ROLES_V1) {
    const asset = assetFor(project, `${role}-sound`);
    if (!asset) continue;
    if (!asset.prepared)
      add(
        "custom.wav-prepared-missing",
        `/assets/${asset.id}/prepared`,
        `The optional ${role} WAV has no prepared output. Import the WAV again or omit it.`,
      );
    for (const ref of [asset.media, ...(asset.prepared ? [asset.prepared] : [])]) {
      const bytes = media.get(ref.sha256);
      if (!bytes)
        add(
          "custom.wav-missing",
          ref.path,
          `The optional ${role} WAV media is missing. Restore it, import it again, or omit that sound.`,
          "bundle",
        );
      else if (sha256(bytes) !== ref.sha256)
        add(
          "custom.wav-corrupt",
          ref.path,
          `The optional ${role} WAV media is corrupt. Restore or import it again.`,
          "bundle",
        );
    }
  }
  const bgm = assetFor(project, "bgm");
  if (bgm) {
    const bytes = media.get(bgm.media.sha256);
    if (!bytes)
      add(
        "custom.bcstm-missing",
        bgm.media.path,
        "The BGM BCSTM source is missing. Restore the original BCSTM and reopen the project, or remove BGM.",
        "bundle",
      );
    else if (sha256(bytes) !== bgm.media.sha256)
      add(
        "custom.bcstm-corrupt",
        bgm.media.path,
        "The BGM BCSTM source hash is stale. Restore or import the original BCSTM again.",
        "bundle",
      );
    if (validateBcstmReceiptV13(project.componentEvidence.bcstm, bgm.media.sha256).length)
      add(
        "custom.bgm-incompatible",
        "/roleAssignments/bgm",
        "The existing BGM compatibility information is invalid or does not match this BCSTM. Remove BGM or restore a compatible project backup.",
      );
  }
  if (diagnostics.length || !documents) return diagnostics;
  try {
    const visual = compileEffectiveCustomVisualsV3(customAuthoringSnapshotV3(project, media));
    if (
      options.requireVisualReceipt !== false &&
      !receiptMatchesV1(project.componentEvidence.visual, visualReceiptExpectationV3(project, visual).expectation)
    )
      add(
        "custom.visual-receipt-required",
        "/componentEvidence/visual",
        "A current exact visual compatibility record is required before Custom publication. Generate a NOT READY cartridge-test handoff, complete physical testing, and save a matching record.",
      );
  } catch {
    add(
      "custom.codec-failure",
      "/visualDocuments",
      "A visual document could not be encoded. Check layer geometry, crop bounds, source media, groups, guides, and locks, then run diagnostics again.",
    );
  }
  return diagnostics;
}

export const legacyCustomProjectV3 = (project: ThemeProjectV3): ThemeProjectV2 => {
  const state = project.legacyComposition as CommittedStateV2 | undefined;
  if (!state || state.formatVersion !== 2) throw new Error("Custom V3 composition data is unavailable.");
  return { ...currentProjectV2(state), metadata: structuredClone(project.metadata) };
};

const visualDocuments = (project: ThemeProjectV3): Record<CustomVisualRoleV1, VisualDocumentV3> => {
  const legacy = legacyCustomProjectV3(project);
  return Object.fromEntries(
    CUSTOM_VISUAL_ROLES_V1.map((role) => {
      const explicit = project.visualDocuments?.[role];
      if (explicit) return [role, structuredClone(explicit)];
      const screen = role === "top-background" ? "top" : role === "bottom-background" ? "bottom" : undefined;
      const document = screen ? legacy.documents.find((candidate) => candidate.screen === screen) : undefined;
      return [
        role,
        {
          role,
          ...CUSTOM_VISUAL_DOCUMENTS_V1[role],
          layers: document?.layers.length ? structuredClone(document.layers) : [],
        },
      ];
    }),
  ) as Record<CustomVisualRoleV1, VisualDocumentV3>;
};

export function customAuthoringSnapshotV3(
  project: ThemeProjectV3,
  media: ReadonlyMap<string, Uint8Array>,
  previous?: CustomAuthoringSnapshotV3,
): CustomAuthoringSnapshotV3 {
  const images: CustomAuthoringSnapshotV3["images"] = {};
  for (const asset of project.assets) {
    if (asset.media.mediaType !== "image/png" || images[asset.media.sha256]) continue;
    const sourceBytes = bytesFor(media, asset.media.sha256);
    const cached = previous?.images[asset.media.sha256],
      provenance = asset.provenance as ImportedPngV1["provenance"];
    images[asset.media.sha256] =
      cached &&
      cached.sourceSha256 === asset.media.sha256 &&
      JSON.stringify(cached.provenance) === JSON.stringify(provenance)
        ? cached
        : importPng(sourceBytes, provenance);
  }
  const visualSources: CustomAuthoringSnapshotV3["visualSources"] = {};
  for (const role of CUSTOM_VISUAL_ROLES_V1) {
    const asset = assetFor(project, role);
    if (!asset) continue;
    const sourceBytes = bytesFor(media, asset.media.sha256);
    const decoded =
      images[asset.media.sha256] ?? importPng(sourceBytes, asset.provenance as ImportedPngV1["provenance"]);
    visualSources[role] = {
      role,
      sourceSha256: decoded.sourceSha256,
      width: decoded.width,
      height: decoded.height,
      pixels: decoded.pixels,
      sourceBytes,
      provenance: decoded.provenance,
      referenceOnly: decoded.referenceOnly,
      recipe: asset.recipe,
    };
  }
  const sounds: CustomAuthoringSnapshotV3["sounds"] = {};
  for (const role of THEME_SOUND_ROLES_V1) {
    const asset = assetFor(project, `${role}-sound`);
    if (!asset?.prepared) continue;
    const recipe = asset.recipe as { wav: PreparedThemeSoundV1["recipe"]; audition: PreparedThemeSoundV1["audition"] };
    const provenance = asset.provenance as PreparedThemeSoundV1["source"]["provenance"];
    sounds[role] = {
      version: 1,
      role,
      source: {
        mediaType: "audio/wav",
        path: asset.media.path,
        sha256: asset.media.sha256,
        bytes: bytesFor(media, asset.media.sha256),
        provenance,
      },
      prepared: {
        mediaType: "audio/wav",
        path: `sounds/${role}.wav`,
        sha256: asset.prepared.sha256,
        bytes: bytesFor(media, asset.prepared.sha256),
        provenance,
      },
      recipe: recipe.wav,
      format: { channels: 1, sampleRate: 22_050, bitsPerSample: 16 },
      capability: { targetSha256: "12a357324cab401a8f100d50198b33bfeba93fbaf53261bc7456ebe863d96342" },
      audition: recipe.audition,
    };
  }
  const bgm = assetFor(project, "bgm");
  return {
    images,
    visualSources,
    visualDocuments: visualDocuments(project),
    sounds,
    ...(bgm
      ? {
          bcstm: {
            sourceSha256: bgm.media.sha256,
            sourceBytes: bytesFor(media, bgm.media.sha256),
            bundlePath: `bgm/${bgm.media.sha256}.bcstm`,
          },
        }
      : {}),
  };
}

export function compileCustomPublicationV3(
  project: ThemeProjectV3,
  media: ReadonlyMap<string, Uint8Array>,
  options: CustomPublicationOptionsV3 = {},
): CustomPublicationV3 {
  const diagnostics = diagnoseCustomPublicationV3(project, media, options);
  if (diagnostics.length) throw new CustomPublicationError(diagnostics);
  const snapshot = customAuthoringSnapshotV3(project, media);
  const visual = compileEffectiveCustomVisualsV3(snapshot);
  const { themeBytes, expectation } = visualReceiptExpectationV3(project, visual);
  const payloads = [
    { path: "theme.json", bytes: themeBytes },
    ...CUSTOM_VISUAL_SLOTS_V1.map(({ path }) => ({
      path,
      bytes: visual.files[path as keyof typeof visual.files],
    })),
    ...THEME_SOUND_ROLES_V1.flatMap((role) =>
      snapshot.sounds[role] ? [{ path: `sounds/${role}.wav`, bytes: snapshot.sounds[role]!.prepared.bytes }] : [],
    ),
    ...(snapshot.bcstm ? [{ path: snapshot.bcstm.bundlePath, bytes: snapshot.bcstm.sourceBytes }] : []),
  ];
  const reportBytes = new TextEncoder().encode(
    `${JSON.stringify({ version: 1, profileSha256: compositeProfileSha256V1(), compatibility: { evidence: DSPICO_LAUNCHER_V1.evidence }, evidenceBoundary: { softwareFixtureOnly: true, hardwareParityClaimed: false }, bcstmPassThroughOnly: Boolean(snapshot.bcstm), files: payloads.map(({ path, bytes }) => ({ path, bytes: bytes.length, sha256: sha256(bytes) })) })}\n`,
  );
  const files = [...payloads, { path: "report.json", bytes: reportBytes }];
  return {
    files,
    zipBytes: storedZip(files),
    reportSha256: sha256(reportBytes),
    expectation,
  };
}

export const visualRoleFromUseV3 = (intendedUse: string): CustomVisualRoleV1 | undefined => {
  const role = intendedUse.startsWith("Custom visual role: ") ? intendedUse.slice(20) : "";
  return visualRoles.has(role) ? (role as CustomVisualRoleV1) : undefined;
};
