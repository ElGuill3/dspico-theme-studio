## Exploration: manual-theme-workspace

### Current State

The repository has a secure, deterministic Material-theme MVP plus an intentional uncommitted identity-first inspector/preview baseline. The canonical `MaterialProjectV1` stores metadata, scalar tokens, scene token overrides, an `assetManifest` containing only `{path, sha256}`, acknowledgments, and a bounded semantic-operation history. Canonical save sorts object keys, truncates abandoned redo, retains at most 200 operations and 10 snapshots, and atomically commits one JSON file through temporary-file, journal, rename, and directory-sync checkpoints. `openProject` strictly accepts only version 1; there is no migration path yet.

The renderer maintains immediate local drafts and uses `DraftAuthority` to debounce scalar edits while flushing or blocking Save, validation, export, Undo/Redo, and lifecycle actions. The current preview derives two 256×192 scenes from metadata and color tokens, renders them as CSS surfaces in a local DSi XL frame, and then applies Coverflow or Banner list PNGs as pointer-inert, `aria-hidden`, preview-only overlays. Launcher view selection is renderer-local and intentionally does not affect project state, history, diagnostics, receipts, or export.

The main process owns dialogs, validation, persistence, and export. IPC accepts an allowlisted command union, validates edit operations with AJV, verifies the sender/main-frame/origin/session, serializes commands, and persists candidate state before making it authoritative. The renderer remains sandboxed with context isolation, no Node integration, restrictive navigation, and local `app://studio` resources. Project and export writers reject traversal, ambiguous separators, and symlink escapes. These boundaries are the correct foundation for an asset pipeline, but no asset import, byte store, decoder, or renderer-facing asset-read capability exists.

Current validation and export are Material-only. They ignore scenes and `assetManifest`, force `type: "material"` and `darkTheme: false`, and emit only `theme.json`, `report.json`, and a deterministic stored ZIP. The manifest is accepted only at project creation and has no semantic operations or ingestion flow. The pinned official `docs/Themes.md` at launcher commit `f3ae63279ab72bc6c83124c752ec79f3247db437` supports both Material and Custom themes. Custom user-owned artifacts include `topbg.bin` and `bottombg.bin` (256×192, 15 bpp), grid and banner-list cells plus palettes (A3I5), `scrim.bin` plus palette (A5I3), Custom JSON position/width/text/blend properties, and optional `preview.bin`, `icon.bmp`, BGM, and sounds. Native game icons, covers, banner text, file names, launcher controls/layout, the DSi frame, and preview overlays are not user theme content.

There is one compatibility discrepancy to resolve before expanding export: official documentation nests transition values under `launchTransition`, while the current validator reads `coverStartScalePercent`, `coverFinalAlpha`, and `scrimFinalAlpha` at the root. That behavior is fixture-tested but should not be extended into the Custom compiler without reconciling it against the pinned launcher parser.

The supplied Reddit workflow agrees with the launcher evidence on exact 256×192 physical screens, `topbg`/`bottombg`, transparent overlays, NitroPaint conversion, and custom-element conversion. Its 256×480 composition layout is a useful authoring convention: 192 top + a simulated/configurable 96-pixel device gap + 192 bottom. The gap is viewport context, not theme content and never exported.

### Affected Areas

- `packages/theme-core/src/index.ts` — V1 schema, operations, bounded history, canonical save/open, and the currently inert asset manifest need a deterministic V2 migration and composition operations.
- `packages/theme-core/src/preview.ts` — the color-only preview model should consume shared rendered theme surfaces without absorbing launcher-native overlays.
- `packages/dspico-contract/src/index.ts` — Material-only validation/export must gain launcher-accurate Custom artifact validation, conversion, reports, and nested transition semantics.
- `packages/test-fixtures/src/capture.ts` — pinned launcher evidence should expand to Custom examples/parser behavior and binary golden fixtures without mutating the launcher repository.
- `apps/studio/src/project-store.ts` — atomic persistence must extend from one JSON file to immutable, content-addressed source assets while preserving commit-last recovery.
- `apps/studio/src/project-file-session.ts` — the selected project location must define a portable project/asset boundary.
- `apps/studio/src/studio-ipc.ts` — import/read-thumbnail operations require strict payload schemas, sender checks, queueing, size limits, and main-owned file dialogs.
- `apps/studio/src/preload.ts` — only narrow asset-import and render-data capabilities should cross the sandbox boundary; raw filesystem paths and Node APIs must not.
- `apps/studio/src/main.ts` — offline decode/validation/conversion orchestration must remain main/core-owned and preserve CSP/network denial.
- `apps/studio/src/renderer/renderer.tsx` — the current inspector should become supporting docks around a real dual-surface workspace; `DraftAuthority`, project actions, history, delivery controls, and preview selector remain valuable.
- `apps/studio/src/renderer/draft-authority.ts` — retain for scalar fields and authoritative-action flushing, but do not use its 350 ms field debounce as the canvas gesture history model.
- `apps/studio/src/renderer/studio.css` — the side-by-side inspector/preview layout must evolve into tool rail, canvas, layers/properties docks, and separate device preview without losing mobile behavior.
- `apps/studio/src/renderer/assets/launcher-preview/` — remain local preview-only, non-selectable, pointer-inert, and excluded from project/export manifests.
- `apps/studio/src/renderer/assets/dsi-xl-frame.webp` — remains preview chrome only and requires retained provenance for application distribution.
- `apps/studio/src/*.{test.ts}`, `packages/*/src/*.test.ts`, `e2e/lifecycle.spec.ts` — existing atomicity, trust-boundary, replay, deterministic export, CSP, packaging, responsive, and preview-isolation proofs must remain green and be extended per slice.
- `vite.renderer.config.mts`, `vite.e2e.config.mts`, Electron Forge packaging — imported project assets must not be bundled as application resources, while local preview assets must remain explicit ASAR inputs.
- `openspec/config.yaml` — its “empty repository/no tests” context is stale relative to the implemented Vitest, Playwright, TypeScript, ESLint, Vite, Electron, and packaging baseline; later phases must not rely on those stale capability fields.

### Approaches

1. **Launcher-slot editor only** — expose one editor per final Pico artifact (`topbg`, `bottombg`, cells, scrim) and persist flattened pixels close to export format.
   - Pros: Direct compatibility mapping; simpler validation and export; limited ambiguity about dimensions.
   - Cons: Weak creative workflow; destructive edits; poor reuse; no meaningful layers; source quality is lost; binary formats leak into the editor domain.
   - Effort: Medium

2. **Free-form dual-screen compositor only** — model arbitrary layers on top and bottom 256×192 surfaces and flatten them to `topbg`/`bottombg`.
   - Pros: Photoshop-like workflow; clean direct manipulation; exact physical-screen geometry; straightforward first vertical slice.
   - Cons: Cannot represent grid cells, banner-list cells, scrim, palettes, or exported JSON positioning by itself; risks pretending that launcher-native elements are editable layers.
   - Effort: Medium

3. **Layered source documents mapped to launcher artifact slots** — persist editable source layers for top, bottom, and eventually each user-owned Custom artifact slot; derive Pico binaries only during validation/export.
   - Pros: Separates editable sources from lossy outputs; supports both full-screen composition and launcher-specific artifacts; preserves provenance, undo/redo, deterministic compilation, and future extension.
   - Cons: Requires a V2 project model, content-addressed assets, slot-aware validation, deterministic raster/palette encoders, and more explicit product scope.
   - Effort: High

4. **Canvas technology choices** — use one of DOM/CSS, SVG, Canvas 2D, or WebGL for the visual workspace.
   - Pros: DOM/SVG provide strong native semantics and easy handles; Canvas 2D provides exact 256×192 raster coordinates, clipping, compositing, zoom, and adequate performance; WebGL provides maximum throughput and shader flexibility.
   - Cons: DOM becomes fragile for pixel compositing; SVG is awkward for palette/raster semantics; Canvas needs a DOM accessibility layer and explicit hit testing; WebGL adds driver/color nondeterminism and unnecessary complexity for two small screens.
   - Effort: Canvas 2D + DOM overlay Medium; DOM/SVG Medium; WebGL High

### Recommendation

Adopt approach 3, rendered with **Canvas 2D plus a DOM interaction/accessibility overlay**. Keep Canvas as a view of a shared render plan, not as canonical state and not as an export source screenshot. Use DOM controls for the layer tree, properties, tool controls, keyboard operation, focus indication, and screen-reader announcements. Use geometric hit testing in reverse z-order, with optional alpha-aware refinement only after bounding-box behavior is stable. At native scale, one model unit equals one DS pixel; zoom is display-only, grid appears at useful zoom levels, and pointer coordinates are converted back into model coordinates. WebGL is not justified until measured Canvas 2D performance fails.

#### Canonical model and migration

- Introduce a strict `ThemeProjectV2` and a deterministic `V1 -> V2` migration. A V1 project becomes `themeKind: "material"` with equivalent metadata/tokens/scenes, empty composition documents, and unchanged acknowledgments. Unknown/newer versions remain read-only refusals; migration never overwrites source bytes implicitly.
- Store user-owned source documents separately from generated output:
  - fixed `top` and `bottom` surfaces, each exactly 256×192;
  - ordered layer IDs per surface/slot for z-order;
  - immutable asset records keyed by SHA-256, with media type, decoded dimensions, color-space policy, storage reference, source name, provenance, intended use (`reference-only` or `exportable`), author/credit, license/notice, and rights declaration;
  - layer records with stable ID, name, visibility, opacity, supported blend mode, asset reference, source crop, and deterministic transform;
  - launcher artifact assignments for `topbg`, `bottombg`, cells, scrim, and later optional selector/audio artifacts;
  - Material tokens and Custom JSON properties as typed theme settings, not canvas layers.
- Do not persist selection, hover, active tool, zoom, focus mode, launcher preview view, or the simulated device gap as exported theme content. They are renderer-local or separately stored user preferences. The dual layout defaults to a 96-pixel simulated gap; Top and Bottom focus modes enlarge one 4:3 surface without changing document geometry.
- Use integer or explicitly bounded fixed-point coordinates and a named resampling policy. Commit one semantic operation at the end of a drag/resize/crop gesture; coalesce transient pointer movement. Add versioned operations for asset registration/removal, layer add/update/remove/reorder, slot assignment, and typed Custom properties. Asset bytes never live inside operations.
- Preserve assets reachable from the current project, retained snapshots, and undo/redo history. Garbage collection must not delete bytes that an undo can restore.

#### User content versus preview-only content

- **Editable/exportable user content:** metadata; Material color settings; Custom `topbg`/`bottombg`; user-designed grid/banner-list cell and selected-cell graphics; scrim; exported palettes; supported Custom JSON positions, widths, text colors, and blend colors; explicitly included optional icon/preview/audio assets.
- **Read-only launcher-native preview content:** game icons, covers, banner text, file names, launcher navigation/layout behavior, selection population, Coverflow/Banner list controls, the DSi XL hardware frame, and the local launcher overlay PNGs. JSON properties controlling where/how native elements render are user settings, but the native rendered elements themselves are never layers.
- Keep preview overlays in a separate compositor namespace applied after the user theme surface. They must not participate in hit testing, selection, layer lists, project save, validation asset enumeration, or export.

#### Offline asset and conversion boundary

- Main process opens the import dialog, reads bytes once, enforces byte/dimension/count limits, verifies magic bytes rather than extensions, hashes content, decodes through a pinned offline implementation, normalizes metadata/orientation/color policy, and stages an immutable content-addressed asset.
- Persist asset bytes first to a verified hash path, then atomically commit project JSON referencing them. A crash may leave an unreferenced recoverable asset, but must never commit a project pointing to missing bytes. Reopen verifies manifest hashes and reports missing/corrupt/orphan assets without silently replacing them.
- Do not invoke arbitrary external programs or shell commands. NitroPaint is useful as documented workflow evidence and a golden-oracle tool, not as a runtime dependency. Compatible 15 bpp, A3I5, A5I3, BMP, and palette outputs require pinned in-process deterministic encoders with fixtures from the launcher and independently converted examples.
- Conversion must define alpha thresholds, color quantization, dithering, palette ordering, channel rounding, and resampling. Generated Pico binaries are export artifacts and caches only; canonical editable state remains source assets plus typed operations.

#### One rendering path

- Build a pure render-plan function from canonical project + ephemeral interaction draft. Both workspace canvases and the DSi preview consume the same composited 256×192 theme-surface result.
- The device preview then adds the existing frame and selected launcher-native overlay after theme rendering. Coverflow/Banner list selection remains local preview state.
- Export consumes the same canonical source and slot mapping but runs deterministic Pico encoders rather than capturing browser pixels. Preview remains an honest Chromium approximation where DS palette/font/blending evidence is absent; validation and compiled bytes remain authoritative.

#### Inspector disposition

- **Retain:** `DraftAuthority`; metadata editing; Material global/screen color editing; project create/open/save; Undo/Redo; diagnostics/export; DSi preview; scene and launcher-view selectors; status and failure focus behavior.
- **Move:** metadata into a Project dock; Material colors and selected-layer geometry/crop into a context-sensitive Properties dock; mode/view controls into the preview toolbar; delivery controls outside the editing canvas.
- **Retire or narrow:** the monolithic left inspector as the primary workspace, color-only screen cards for Custom projects, and any synthetic launcher content that duplicates native preview overlays. Do not route high-frequency canvas gestures through field debounce.

#### Reviewable vertical slices

The dependency order below is compatible with `delivery_strategy: auto-chain`, but the actual `chain_strategy` remains deliberately unselected. Every slice should target fewer than 400 authored changed lines including its focused tests and should be independently reversible:

1. **V2 domain and migration** — strict schema, V1 migration, source-document/asset references, canonical round-trip tests. Rollback: remove V2 reader/writer while V1 stays unchanged.
2. **Content-addressed asset store** — stage/hash/verify/recover immutable bytes behind the existing containment boundary. Rollback: remove the unused asset store without changing project save.
3. **Narrow import IPC** — one safe local PNG import path with limits and provenance metadata; no canvas yet. Rollback: remove the new allowlisted command and preload method.
4. **Read-only dual workspace** — exact 256×192 top/bottom Canvas 2D surfaces, dual/focus layout, zoom/grid, DOM accessibility scaffold, no manipulation. Rollback: restore the current inspector layout.
5. **Background layer vertical slice** — add one imported layer, select it, move it, commit one operation, Undo/Redo, save/reopen. Rollback: remove background-layer commands while imported assets remain harmless orphans.
6. **Layer controls** — visibility, naming, delete, and z-order with keyboard equivalents and deterministic hit testing. Rollback: preserve single-layer rendering.
7. **Resize and crop** — fixed-point transform/crop operations, resampling policy, properties dock, interaction tests. Rollback: retain move-only layers.
8. **Shared live preview surface** — feed the exact workspace surface into the existing DSi compositor, then apply read-only Coverflow/Banner overlays. Rollback: return preview to current color surfaces.
9. **Custom `topbg`/`bottombg` export** — typed Custom metadata, deterministic 15 bpp encoder, validation, report provenance/licenses, folder/ZIP atomicity. Rollback: keep V2 authoring but disable Custom export.
10. **Launcher-specific artifact slots** — add grid/banner cells, scrim, palettes, and typed JSON native-element properties in independently testable slot groups. Rollback: remove each slot compiler without affecting full-screen backgrounds.

Before apply, the intentional 1,517-addition uncommitted inspector/frame/overlay baseline must have a stable review/checkpoint boundary; otherwise every future slice inherits an already over-budget diff. Selecting that boundary and the chain strategy is orchestration work, not part of this exploration.

#### Decisions still required

1. Is the named change scoped first to full-screen `topbg`/`bottombg`, or must its first proposal include every Custom artifact slot? The recommendation is an extensible V2 model with top/bottom as the first shipped vertical slice.
2. Is a project a portable directory bundle, or a JSON file with a managed sidecar asset directory? This affects dialogs, moves, backups, recovery, and missing-asset behavior.
3. Which first import formats are supported? PNG-only minimizes decoder and color-profile ambiguity; JPEG/WebP/SVG materially expand security and determinism work.
4. Are transforms restricted initially to translation, axis-aligned resize, and crop? Rotation, arbitrary affine transforms, blend modes, and filters require explicit flattening semantics.
5. What exact resampling, alpha, quantization, dithering, and palette-allocation policies define compatible binaries?
6. Does one project choose exactly one `material` or `custom` theme kind, and is switching kinds destructive, reversible, or disallowed after Custom assets exist?
7. Which optional artifacts (`preview.bin`, `icon.bmp`, BGM, sounds) belong to this change versus later changes?
8. What provenance source and redistribution permission cover the current local DSi frame and Reddit-derived launcher overlay assets? Their preview-only status prevents theme export, but not application-distribution obligations.

#### Licensing and provenance

- Every imported asset should record original filename, SHA-256, source/URL or “local user file,” author/credit, license identifier or custom terms, notice, intended use, and a user assertion that they have rights to export it. The studio should not infer ownership from local possession.
- `reference-only` assets may inform authoring but must be technically excluded from export and clearly marked. `exportable` assets included in a distributed theme must appear in `report.json` credits/licenses when metadata requires it.
- User-provided assets remain local and are not redistributed by the application itself; exporting a theme is user-directed redistribution and must preserve required notices/attribution. This is a provenance safeguard, not legal advice.
- Launcher-native preview assets and the DSi frame require application-level provenance independent of theme reports. The pinned Pico Launcher source is Zlib-licensed and requires preserving its notice for source redistribution; additional repository asset licenses may apply. Do not assume downloaded Reddit images inherit a known license.
- Generated Pico binaries are transformations of user-owned/exportable sources. Their report entries should retain source hashes and attribution lineage; generated files do not erase upstream license obligations.

### Risks

- V1 currently has no migration mechanism; an incorrect V2 cutover could make canonical projects unreadable or silently alter history.
- Asset garbage collection can corrupt Undo/Redo or snapshots if reachability is computed only from the current head.
- Browser image decode, color management, font rendering, and Canvas filtering are not automatically byte-deterministic across hosts; export must use pinned policies and encoders.
- The current root-level transition validation appears inconsistent with the pinned nested `launchTransition` documentation.
- Palette formats and fake-translucency blend colors can look plausible in Chromium while compiling incompatibly for DS hardware.
- A broad “Photoshop-like” scope will exceed 400 changed lines many times; slices and a selected chain strategy are mandatory before apply.
- The current intentional baseline is already uncommitted and over budget, so branch/PR diffs cannot isolate new work until it has a stable boundary.
- OpenSpec testing context is stale and could cause later planning to omit existing Vitest, Playwright, packaging, CSP, and ASAR checks.
- Provenance for existing preview assets is incomplete; preview-only classification does not remove redistribution obligations for the desktop package.

### Ready for Proposal

No. The architecture direction is clear, but the orchestrator should first obtain decisions on initial Custom artifact scope, project bundle/sidecar storage, first accepted import formats, transform/resampling/palette semantics, theme-kind switching, optional asset scope, and preview-asset provenance. After those decisions, proceed to `sdd-propose`; specification and design should then separate authoring-domain requirements, secure asset persistence, shared rendering, Custom compatibility, and licensing lineage before task slicing.
