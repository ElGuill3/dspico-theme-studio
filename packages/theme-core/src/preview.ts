import type { MaterialProjectV1 } from "./index.js";

export type PreviewModel = {
  mode: string;
  modes: string[];
  scenes: {
    id: string;
    screen: "top" | "bottom";
    mode: string;
    width: 256;
    height: 192;
    tokens: MaterialProjectV1["tokens"];
    content: { heading: string; detail: string; items: string[] };
  }[];
  fidelity: {
    label: "launcher-vector-backed" | "Chromium approximation";
    properties: string[];
  }[];
  previewAffectsExport: false;
};

export function createPreviewModel(project: MaterialProjectV1, requestedMode: string): PreviewModel {
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
      tokens: { ...project.tokens, ...source?.overrides },
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
        properties: ["dimensions", "bounds", "inheritance", "wrapping", "safe areas", "Material colors"],
      },
      {
        label: "Chromium approximation",
        properties: ["font rasterization", "palette", "blending", "timing", "audio"],
      },
    ],
    previewAffectsExport: false,
  };
}
