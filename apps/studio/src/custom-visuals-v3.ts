import {
  CUSTOM_VISUAL_ROLES_V1,
  compositeCustomLayersV1,
  compileCustomVisualPackageV1,
  sha256,
  type CustomVisualPackageV1,
  type CustomVisualRoleV1,
  type CustomVisualSourceV1,
  type NormalizedRgbaAssetV1,
} from "../../../packages/dspico-contract/src/index.js";
import type {
  ShapeLayerV3,
  TextLayerV3,
  VisualDocumentV3,
  VisualLayerV3,
} from "../../../packages/theme-core/src/index.js";

const isShapeLayerV3 = (layer: VisualLayerV3): layer is ShapeLayerV3 => layer.kind === "shape";
const isTextLayerV3 = (layer: VisualLayerV3): layer is TextLayerV3 => layer.kind === "text";

export type EffectiveCustomVisualsV3 = {
  images: Record<string, NormalizedRgbaAssetV1>;
  visualSources: Partial<Record<CustomVisualRoleV1, CustomVisualSourceV1>>;
  visualDocuments: Record<CustomVisualRoleV1, VisualDocumentV3>;
};

export function compileEffectiveCustomVisualsV3(snapshot: EffectiveCustomVisualsV3): CustomVisualPackageV1 {
  const sources = CUSTOM_VISUAL_ROLES_V1.map((role) => {
    const document = snapshot.visualDocuments[role];
    if (document.layers.some((layer) => layer.locked !== undefined && typeof layer.locked !== "boolean"))
      throw new Error(`Invalid visual layer lock in ${role}.`);
    if (!document.layers.length) return snapshot.visualSources[role];
    const pixels = compositeCustomLayersV1(
      document.width,
      document.height,
      document.layers.flatMap((layer, order) =>
        layer.visible
          ? [
              {
                id: layer.id,
                order,
                ...(isShapeLayerV3(layer)
                  ? { kind: "shape" as const, shape: layer.shape, fill: layer.fill }
                  : isTextLayerV3(layer)
                    ? {
                        kind: "text" as const,
                        content: layer.content,
                        fill: layer.fill,
                        scale: layer.scale,
                        alignment: layer.alignment,
                      }
                    : { asset: layer.asset, source: layer.crop }),
                opacity: layer.opacity,
                rotation: layer.rotation ?? 0,
                destinationQ16: {
                  x: layer.xQ16,
                  y: layer.yQ16,
                  width: layer.widthQ16,
                  height: layer.heightQ16,
                },
              },
            ]
          : [],
      ),
      Object.values(snapshot.images),
    );
    return {
      role,
      sourceSha256: sha256(pixels),
      width: document.width,
      height: document.height,
      pixels,
      provenance: { source: "Authored visual document", rightsToExport: true },
      recipe: { composition: "q16-crop-source-over-v1" },
    } satisfies CustomVisualSourceV1;
  }).filter(Boolean) as CustomVisualSourceV1[];
  return compileCustomVisualPackageV1(sources);
}
