import {
  argbFromRgb,
  blueFromArgb,
  CorePalette,
  greenFromArgb,
  redFromArgb,
  Scheme,
} from "@material/material-color-utilities";

type Rgb8 = readonly [number, number, number];
type MaterialInput = { primaryColor: { r: number; g: number; b: number }; darkTheme: boolean };
export type MaterialRolesV1 = Record<
  | "primary"
  | "onPrimary"
  | "secondaryContainer"
  | "onSecondaryContainer"
  | "tertiary"
  | "onTertiary"
  | "inverseOnSurface"
  | "onSurface"
  | "onSurfaceVariant"
  | "surfaceBright"
  | "mainIconBg"
  | "surfaceContainerHighest"
  | "scrim"
  | "outline",
  Rgb8
>;

const source = (path: string, blobOid: string, sha256: string) => ({ path, blobOid, sha256 });
export const MATERIAL_C648_SOURCES_V1 = [
  source(
    "arm9/source/material/palettes/core.cpp",
    "5ccf9e8184c1ac485b91338084436499f8a7d6ee",
    "803326808d623131dea0c8c05f42eea72cd52a757208e5a711e1bbc452744ae6",
  ),
  source(
    "arm9/source/material/scheme/scheme.cpp",
    "4522c292d131140c4213249f0b941c7e5ff891ea",
    "2fe3624a01c83596c3c55cb3e917545642f200477f95f1bab722b0d65f5c3821",
  ),
  source(
    "arm9/source/themes/material/MaterialColorSchemeFactory.cpp",
    "1c4a97706196e7721ef9e27aab60127cf52d4d6d",
    "d3f9c459521f1813f89d709f29c44d588a9be34459ac0c477286706e53c6a04e",
  ),
  source(
    "arm9/source/themes/material/MaterialMainBackground.cpp",
    "3fd7baa77c932faeb3c73fa33ee965e145e5499a",
    "c14fd45af953768880530caabf2f8125493159a758e6a7a0ae4dfc206644f74e",
  ),
  source(
    "arm9/source/themes/material/MaterialSubBackground.cpp",
    "a4fe2b5b42ea6d1c2abbd4439fc49f037cda5e50",
    "7a946080999d38d5ea39df04ceffb3fdb2cc236640f0aa2a5d435aab98462454",
  ),
  source(
    "arm9/source/romBrowser/Theme/Material/MaterialAppBarView.cpp",
    "951efd88cf2640d255d3f4c304a3ffff1fc58198",
    "9505da149227b96a463767474661f49b61438b769f84674637796b6e25eec948",
  ),
  source(
    "arm9/source/romBrowser/Theme/Material/MaterialIconGridItemView.cpp",
    "9bf2c0aaea660af64deecc21549fb6914ee8b39a",
    "c143f068bb432741442bef2710ab29d226d50db88af3cbfdac72f8ca93d0b104",
  ),
  source(
    "arm9/source/romBrowser/Theme/Material/MaterialBannerListItemView.cpp",
    "c4f10788df00fb875757cb4a9c8f84d84f8c019a",
    "00998ee6fd6165db74df24b08d95606d726dee3d9e5fe2f55ed7acc95761fa15",
  ),
  source(
    "licenses/Material.txt",
    "d645695673349e3947e8e5ae42332d0ac3164cd7",
    "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
  ),
  source(
    "arm9/source/romBrowser/Theme/Material/CarouselRecyclerView.cpp",
    "748343301302686277200a20b8c9d2e10443c3ed",
    "d56a10a3e1f200ac47a37b2175950367a3f6d3802a9aac0da61cc9d04c692b28",
  ),
] as const;
export const MATERIAL_COLOR_UTILITIES_V1 = {
  package: "@material/material-color-utilities",
  version: "0.4.0",
  license: "Apache-2.0",
  integrity: "sha512-dlq6VExJReb8dhjj3a/yTigr3ncNwoFmL5Iy2ENtbDX03EmNeOEdZ+vsaGrj7RTuO+mB7L58II4LCsl4NpM8uw==",
  notice: "Copyright 2021 Google LLC. Licensed under the Apache License, Version 2.0.",
} as const;
export class MaterialPreviewError extends Error {
  constructor(
    readonly code: "invalid-input" | "parity-mismatch",
    message: string,
  ) {
    super(message);
    this.name = "MaterialPreviewError";
  }
}

const rgb = (argb: number): Rgb8 => [redFromArgb(argb), greenFromArgb(argb), blueFromArgb(argb)];
const valid = (input: MaterialInput) =>
  typeof input.darkTheme === "boolean" &&
  [input.primaryColor?.r, input.primaryColor?.g, input.primaryColor?.b].every(
    (component) => Number.isInteger(component) && component >= 0 && component <= 255,
  );

export function materialPreviewV1(input: MaterialInput) {
  if (!valid(input)) throw new MaterialPreviewError("invalid-input", "Material preview input is invalid.");
  const { r, g, b } = input.primaryColor,
    core = CorePalette.of(argbFromRgb(r, g, b));
  const scheme = input.darkTheme ? Scheme.darkFromCorePalette(core) : Scheme.lightFromCorePalette(core);
  const roles: MaterialRolesV1 = {
    primary: rgb(scheme.primary),
    onPrimary: rgb(scheme.onPrimary),
    secondaryContainer: rgb(scheme.secondaryContainer),
    onSecondaryContainer: rgb(scheme.onSecondaryContainer),
    tertiary: rgb(scheme.tertiary),
    onTertiary: rgb(scheme.onTertiary),
    inverseOnSurface: rgb(input.darkTheme ? core.n1.tone(10) : scheme.inverseOnSurface),
    onSurface: rgb(scheme.onSurface),
    onSurfaceVariant: rgb(scheme.onSurfaceVariant),
    surfaceBright: rgb(core.n1.tone(input.darkTheme ? 24 : 98)),
    mainIconBg: rgb(core.a2.tone(input.darkTheme ? 42 : 78)),
    surfaceContainerHighest: rgb(core.n1.tone(input.darkTheme ? 22 : 90)),
    scrim: rgb(core.n1.tone(input.darkTheme ? 70 : 30)),
    outline: rgb(scheme.outline),
  };
  return {
    fidelity: "launcher-vector-backed" as const,
    roles,
    primitives: {
      mainBackground: roles.inverseOnSurface,
      subBackground: [roles.inverseOnSurface, roles.secondaryContainer] as const,
      navigation: roles.inverseOnSurface,
      buttonRow: roles.inverseOnSurface,
      grid: { focused: roles.mainIconBg, unfocused: roles.surfaceBright },
      banner: { focused: roles.mainIconBg, unfocused: roles.surfaceBright },
    },
  };
}

export function assertMaterialParityV1(input: MaterialInput, expected: MaterialRolesV1) {
  const preview = materialPreviewV1(input);
  if (JSON.stringify(preview.roles) !== JSON.stringify(expected))
    throw new MaterialPreviewError("parity-mismatch", "Material roles do not match the c648 parity vector.");
  return preview;
}
