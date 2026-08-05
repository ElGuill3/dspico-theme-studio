import type { ThemeProjectV2 } from "./model-v2.js";

export type RenderLayerPlanV1 = {
  id: string;
  order: number;
  asset: { path: string; sha256: string };
  opacity: number;
  source: { x: number; y: number; width: number; height: number };
  destinationQ16: { x: number; y: number; width: number; height: number };
};
export type RenderSurfacePlanV1 = { screen: "top" | "bottom"; width: 256; height: 192; layers: RenderLayerPlanV1[] };
export type CustomRenderPlanV1 = { version: 1; policy: "q16-crop-source-over-v1"; screens: RenderSurfacePlanV1[] };

export function createCustomRenderPlan(project: ThemeProjectV2): CustomRenderPlanV1 {
  if (project.themeKind !== "custom") throw new Error("A Custom render plan requires a Custom project.");
  const screens = (["top", "bottom"] as const).map((screen): RenderSurfacePlanV1 => {
    const document = project.documents.find((candidate) => candidate.screen === screen);
    if (!document || document.width !== 256 || document.height !== 192)
      throw new Error(`Missing ${screen} render document.`);
    return {
      screen,
      width: 256,
      height: 192,
      layers: document.layers.flatMap((layer, order) =>
        layer.visible
          ? [
              {
                id: layer.id,
                order,
                asset: { ...layer.asset },
                opacity: layer.opacity,
                source: { ...layer.crop },
                destinationQ16: { x: layer.xQ16, y: layer.yQ16, width: layer.widthQ16, height: layer.heightQ16 },
              },
            ]
          : [],
      ),
    };
  });
  return { version: 1, policy: "q16-crop-source-over-v1", screens };
}
