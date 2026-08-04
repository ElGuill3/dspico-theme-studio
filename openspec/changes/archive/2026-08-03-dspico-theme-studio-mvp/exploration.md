## Exploration: DSpico Theme Studio MVP

### Current State

`dspico-theme-studio` is an initialized but otherwise empty repository: there is no application stack, package manifest, source code, or test tooling. Electron and a deterministic, AI-independent core are established product constraints, not existing implementation.

The launcher repository is the current compatibility authority. It discovers theme folders under `/_pico/themes`, requires a parseable `theme.json`, supports `material` and `custom`, and ignores unknown JSON fields. Material themes need only metadata, `primaryColor`, and `darkTheme`; launch-transition fields are optional and independently default when absent, mistyped, or out of range. Custom themes additionally consume fixed-name DS-native binary assets and layout/color properties. The Raspberry fixture confirms exact payload sizes: 98,304-byte 256×192 direct-color backgrounds, 4,096-byte grid textures, 12,544-byte banner-list textures, 64-byte 32-color palettes, and a 336-byte scrim with a 16-byte palette.

The launcher is permissive where the studio should be safe: an unknown theme type falls back to Custom, missing optional sounds are ignored, and several binary reads do not prove exact file length before upload. Export validation must therefore enforce the documented contract rather than mimic permissive or unsafe fallback behavior. The physical top screen is implemented through the launcher's `Sub` background path, so studio terminology must use physical `top`/`bottom` screen names instead of launcher engine names.

### Affected Areas

- `openspec/config.yaml` — already establishes the offline GUI and deterministic-core constraints that later phases must retain.
- `apps/studio/` (suggested) — Electron main, preload, and renderer boundaries for the desktop application.
- `packages/theme-core/` (suggested) — versioned project model, operations, migrations, validation, snapshot semantics, and deterministic compilation with no Electron or filesystem imports.
- `packages/dspico-contract/` (suggested) — launcher-specific compatibility profile, JSON mapping, fixed asset rules, diagnostics, and export report generation.
- `packages/test-fixtures/` (suggested) — sanitized copies or generated equivalents of launcher compatibility fixtures and golden vectors.
- `pico-launcher/docs/Themes.md` — documented public theme contract and asset requirements.
- `pico-launcher/arm9/source/themes/ThemeInfoFactory.thumb.cpp` — actual metadata parsing, defaults, launch-transition ranges, and unknown-type behavior.
- `pico-launcher/arm9/source/themes/custom/CustomTheme.cpp` — actual Custom JSON keys and default positions/colors.
- `pico-launcher/arm9/source/romBrowser/Theme/custom/CustomRomBrowserViewFactory.cpp` — fixed Custom asset filenames and byte consumption.
- `pico-launcher/arm9/source/bgm/ThemeSoundPlayer.cpp` — exact optional UI-sound WAV constraints.
- `pico-launcher/_pico/themes/{material,raspberry}/` — representative Material and Custom fixtures. The launcher repository remains read-only.

### Approaches

1. **Material authoring vertical slice** — deliver one complete offline path: create/open/save a Material project, edit metadata/tokens/launch transition, preview both DS screens, validate, undo/redo, and export a deterministic folder and ZIP with report.
   - Pros: proves every architectural seam end to end; produces a genuinely usable theme; avoids pretending Chromium can already reproduce DS texture, palette, and 3D behavior; fits chained review slices.
   - Cons: Custom canvas, image conversion, generated backgrounds, waveform editing, BGM, and external adapters remain later increments.
   - Effort: Medium

2. **Thin dual-path MVP** — implement Material plus a reduced Custom editor and converters immediately.
   - Pros: exposes both product paths early and tests scene extensibility.
   - Cons: greatly expands format conversion, canvas interaction, security, preview-fidelity, and validation scope; likely yields two incomplete workflows instead of one dependable workflow.
   - Effort: High

3. **Core/CLI-first prototype** — build the contract and exporter before the Electron workflow.
   - Pros: isolates compatibility logic and is easy to test.
   - Cons: violates the GUI-first product boundary and delays proof that persistence, preview, IPC, snapshots, and export form a coherent user experience.
   - Effort: Medium

### Recommendation

Choose the **Material authoring vertical slice**. “MVP” should mean a complete, usable offline Material-theme workflow, not partial coverage of the entire product vision. Preserve Custom as an explicit next authoring path in the model and package boundaries, but do not place disabled Custom controls or placeholder AI affordances in the first shipped GUI.

**Vertical-slice boundary**

1. Create a project with name, description, author, primary color, light/dark mode, and launch-transition values.
2. Maintain separate versioned scene files for physical screen/mode identities. In this slice they are generated Material scenes with optional scoped token overrides, not free-form element trees.
3. Render an interactive 256×192 top/bottom Chromium approximation with representative launcher content and clear fidelity labeling.
4. Apply each completed semantic edit as an atomic operation; return the committed model, diagnostics, snapshot ID, and preview state; support undo/redo across those operations.
5. Block export on incompatible values, require acknowledgment only for warnings, and keep aesthetic suggestions informational.
6. Export `theme.json`, a compatibility/checksum/warning/credit/license report, a ready-to-copy folder, and a deterministic ZIP. Identical project state and compiler version must produce identical logical files, report ordering, hashes, and ZIP bytes.

**Deterministic contract and versioned model**

- Keep the studio project format distinct from the launcher export format. Use a root `project.json` with `formatVersion: 1`, stable project ID, authoring mode, metadata, token-file reference, ordered scene references, asset manifest, and target profile such as `dspico-launcher-v1`.
- Store global tokens in `tokens.json`; store one file per physical screen/mode under `scenes/`. A scene declares a stable scene kind, global-token inheritance, scoped overrides, and constrained content. Material scenes are generated recipes; future Custom scenes may add constrained editable nodes without changing the root model.
- Define serialized operations (`set-token`, `set-metadata`, `set-scene-override`, and acknowledgment operations) with explicit schema versions. Do not persist arbitrary callbacks, DOM state, or renderer component state.
- Make `theme-core` pure TypeScript over explicit bytes and data. It owns schemas, normalization, migrations, operation application, diagnostics, and immutable project states. It must not import Electron, Node filesystem APIs, clocks, random generators, native dialogs, or AI clients.
- Make `dspico-contract` a deterministic target adapter that compiles a normalized project into an ordered virtual file set and report. Filesystem-folder and ZIP writers consume that result through ports. Future GUI, CLI, MCP, and agents invoke the same operations/compiler rather than duplicating rules.
- Canonicalize JSON key order and line endings, sort output paths and diagnostics, use SHA-256 checksums, normalize ZIP metadata/timestamps, and inject any time/ID source at project creation rather than compilation.

**Electron and persistence boundary**

- Run a sandboxed renderer with `nodeIntegration: false`, `contextIsolation: true`, a restrictive Content Security Policy, denied navigation/window creation, and no direct filesystem access. Never expose raw `ipcRenderer` or Electron events.
- Expose a narrow, typed preload API of semantic commands such as `project.create`, `project.open`, `project.applyOperation`, `project.undo`, `project.redo`, and `project.export`. Validate payloads and sender frames in main before dispatch.
- Keep authoritative project mutation, filesystem access, dialogs, atomic writes, export staging, and ZIP creation in the main process. The renderer owns only UI/transient interaction state and displays committed results returned after atomic operations.
- Save canonical project files using write-to-sibling-temp, flush/close, then rename. Use a project-local content-addressed object store for asset bytes and immutable snapshots that reference model JSON plus asset hashes. Maintain an append-only operation journal with a committed head pointer; truncate/rebase redo history after a new operation from an undone state.
- Recover by loading the last valid committed head and surface orphaned temp/journal entries as a recoverable warning. Define snapshot retention/compaction before implementation; unbounded full-project copies are not acceptable once images arrive.

**Preview/compiler fidelity boundary**

- The preview may accurately promise screen dimensions, element bounds, token inheritance, text wrapping rules that have golden evidence, safe areas, and Material color outputs only where algorithms are ported and verified against launcher vectors.
- The preview must not claim pixel parity for DS font rasterization, RGB555 quantization, A3I5/A5I3 palettes, translucency blending, VRAM behavior, coverflow/3D transforms, timing, or hardware audio. Those require dedicated conversion/rasterization work and device/emulator evidence.
- Export compatibility is determined by contract validation and generated bytes, never by visual resemblance in Chromium. Custom HTML/CSS must eventually compile from a constrained AST/allowlist; user markup must never execute in a privileged renderer.

**Suggested workspace, dependencies, and tests**

- Use a TypeScript workspace (suggested: pnpm) with `apps/studio`, `packages/theme-core`, `packages/dspico-contract`, and `packages/test-fixtures`. Keep dependency direction `studio → contract → core`; future CLI/MCP packages depend on the same lower layers.
- Suggested initial dependencies, to lock during design rather than install now: Electron; React for the renderer; Vite-based bundling; an official packaging path such as Electron Forge; a schema-first runtime validator that can emit JSON Schema (for example TypeBox + Ajv); a deterministic ZIP library whose timestamps/order can be controlled; and Node's built-in crypto for SHA-256. Avoid native image/audio dependencies until a conversion slice justifies their packaging cost.
- Use Vitest projects for pure Node unit/property tests and renderer browser/component tests. Add Playwright Electron smoke tests for startup, preload capability boundaries, save/reopen, undo/redo, export, and blocked-export UX; native dialogs must be adapter-injected or stubbed because Playwright does not directly intercept them.
- Golden-test canonical project migration, operation replay, diagnostics ordering, `theme.json`, report bytes, folder manifests, and ZIP reproducibility. Derive compatibility vectors from the launcher docs/source and fixtures; do not make tests depend on mutating or building the sibling repository.
- Add explicit security tests proving the renderer lacks Node globals, arbitrary IPC, navigation, popup creation, and unrestricted file reads. Use screenshot tests for studio UI regression only, not as evidence of DS rendering fidelity.

**Explicit non-goals for this slice**

- Custom free-form canvas authoring, raw HTML/CSS execution, image-to-DS texture conversion, generated backgrounds, waveform editing/conversion, BCSTM tooling, and DS-native preview parity.
- CLI, MCP, external agent adapters, or an embedded AI provider.
- Direct SD-card installation, launcher repository mutation, cloud sync, collaboration, plugin execution, auto-update, and theme marketplace features.

**Decisions the proposal must lock**

- Material-only first slice and the precise definition of “usable” acceptance.
- Project directory schema, `formatVersion: 1`, migration policy, scene identity taxonomy, and target compatibility profile versioning.
- Atomic-operation granularity/coalescing, snapshot retention, crash recovery, and whether acknowledgments are persisted per diagnostic fingerprint or per export attempt.
- Canonical JSON/ZIP rules and report placement (inside export, beside it, or both).
- Preview fidelity labels and the exact launcher-derived golden vectors that justify any “accurate” claim.
- Workspace/build/package choices and minimum supported desktop platforms. With `auto-chain` and a 400-line review budget, implementation should be sliced by independently verifiable architecture seams rather than delivered as one PR.

### Risks

- The launcher has no automated theme-contract tests, and documentation, permissive parsing, and unsafe short binary reads are not equivalent specifications. The studio needs a versioned compatibility profile backed by fixtures and source citations.
- Material Design color generation must be ported and compared against launcher output before the preview can claim palette fidelity.
- Deterministic ZIP output is easy to undermine with timestamps, path order, platform separators, permissions, compression-library changes, or report generation time.
- Snapshotting becomes expensive when Custom assets arrive; the initial content-addressed design must be real even if the first slice stores only small JSON states.
- Future constrained HTML/CSS and image/audio import create parser, denial-of-service, licensing, native packaging, and cross-platform reproducibility risks.
- The exact launcher release/profile targeted by exports is not yet named, and contract drift across launcher commits could silently invalidate themes.
- Distribution platforms and signing/notarization requirements are unknown; they can materially affect Electron packaging and filesystem behavior.

### Ready for Proposal

Yes. The proposal should commit to the Material end-to-end vertical slice, name it as the first increment of a broader two-path product, lock the v1 project/operation/export boundaries, define preview honesty, and explicitly defer Custom conversion/canvas work and all external adapters. It should also require source-backed compatibility fixtures and a versioned launcher target profile before implementation begins.
