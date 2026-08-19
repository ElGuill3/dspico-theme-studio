import type { MaterialProjectV1 } from "./index.js";
import type { LauncherParityProjectV1 } from "./parity-model-v1.js";

export type PreviewModel = {
  mode: string;
  modes: string[];
  scenes: {
    id: string;
    screen: "top" | "bottom";
    mode: string;
    width: 256;
    height: 192;
    tokens: Record<string, unknown>;
    content: { heading: string; detail: string; items: string[] };
  }[];
  fidelity: {
    label: "launcher-vector-backed" | "Chromium approximation";
    properties: string[];
  }[];
  legacyEvidence: {
    label: "preserved legacy migration data";
    exported: false;
    sourceHash: string;
    sourceBytes: string;
    formatVersion: 1 | 2;
    mappings: Partial<Record<string, string>>;
    exclusions: string[];
  }[];
  previewAffectsExport: false;
};

const migrationEvidence = (project: LauncherParityProjectV1): PreviewModel["legacyEvidence"] => {
  const legacy = project.evidence.legacy;
  return legacy
    ? [
        {
          label: "preserved legacy migration data",
          exported: false,
          sourceHash: legacy.sourceHash,
          sourceBytes: legacy.sourceBytes,
          formatVersion: legacy.formatVersion,
          mappings: { ...legacy.mappings },
          exclusions: [...legacy.exclusions],
        },
      ]
    : [];
};

export function createPreviewModel(
  project: MaterialProjectV1 | LauncherParityProjectV1,
  requestedMode: string,
): PreviewModel {
  // prettier-ignore
  if ("material" in project) {
    const content = {
        top: { heading: project.metadata.name, detail: project.metadata.description, items: ["Recently played", "Library", "Favorites"] },
        bottom: { heading: "Quick launch", detail: `Theme by ${project.metadata.author}`, items: ["Start", "Settings", "Themes"] },
      } as const,
      scenes = (["top", "bottom"] as const).map((screen) => ({
        id: `home:${screen}`,
        screen,
        mode: "home",
        width: 256 as const,
        height: 192 as const,
        tokens: { primaryColor: project.material.primaryColor, darkTheme: project.material.darkTheme },
        content: { ...content[screen], items: [...content[screen].items] },
      }));
    return {
      mode: "home",
      modes: ["home"],
      scenes,
      fidelity: [
        { label: "launcher-vector-backed", properties: ["dimensions", "primaryColor", "darkTheme"] },
        { label: "Chromium approximation", properties: ["font rasterization", "palette", "blending", "timing", "audio"] },
      ],
      legacyEvidence: migrationEvidence(project),
      previewAffectsExport: false,
    };
  }
  const discoveredModes = [...new Set(project.scenes.map(({ mode }) => mode))];
  const modes = discoveredModes.length > 0 ? discoveredModes : ["home"];
  const mode = modes.includes(requestedMode) ? requestedMode : (modes[0] ?? requestedMode);
  const content = {
    top: {
      heading: project.metadata.name,
      detail: project.metadata.description,
      items: ["Recently played", "Library", "Favorites"],
    },
    bottom: {
      heading: "Quick launch",
      detail: `Theme by ${project.metadata.author}`,
      items: ["Start", "Settings", "Themes"],
    },
  } as const;
  const scenes = (["top", "bottom"] as const).map((screen) => {
    const source = project.scenes.find((scene) => scene.screen === screen && scene.mode === mode);
    return {
      id: source?.id ?? `${mode}:${screen}`,
      screen,
      mode,
      width: 256 as const,
      height: 192 as const,
      tokens: { primaryColor: project.tokens.primaryColor, darkTheme: project.tokens.darkTheme },
      content: { ...content[screen], items: [...content[screen].items] },
    };
  });
  return {
    mode,
    modes,
    scenes,
    fidelity: [
      {
        label: "launcher-vector-backed",
        properties: ["dimensions", "primaryColor", "darkTheme"],
      },
      {
        label: "Chromium approximation",
        properties: [
          "legacy background/foreground/accent/scenes (not exported)",
          "font rasterization",
          "palette",
          "blending",
          "timing",
          "audio",
        ],
      },
    ],
    legacyEvidence: [],
    previewAffectsExport: false,
  };
}
