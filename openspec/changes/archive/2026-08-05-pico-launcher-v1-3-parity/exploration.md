## Exploration: Pico Launcher v1.3.0 parity

### Current State

The compatibility authority was verified before analysis: Studio `main` is at `173f38ec47e9be8168777039b6d8c2a10bf7fde2`, and the isolated launcher worktree is exactly tag `v1.3.0` at `b087565651c83081dd65552863f5efc2f28e489c`. The unpublished `f3ae63279ab72bc6c83124c752ec79f3247db437` branch is not valid authority. The discarded `manual-theme-workspace` change remains excluded and was not used as an active SDD input.

#### Compatibility gaps

- **Profile drift:** `DSPICO_LAUNCHER_V1`, fixture capture, tests, reports, and the main compatibility spec still pin `f3ae632...` and require launch-transition fields that v1.3.0 never reads. `openspec/config.yaml` also describes the repository as empty and testless, which is no longer true.
- **Dishonest Material model:** V1 and V2 store arbitrary `tokens` and per-mode/per-screen `scenes`. The renderer edits `background`, `foreground`, and `accent`, but v1.3.0 consumes only `primaryColor` and `darkTheme`. Material validation/export spreads generic tokens into `theme.json`, hard-codes `darkTheme: false` unless a token overrides it, and exports ignored scene/color fields.
- **Unsafe Custom export:** the current compiler emits only `theme.json`, `topbg.bin`, `bottombg.bin`, and `report.json`. v1.3.0's complete visual package is 12 exact files. Missing Custom files leave uninitialized texture/palette offsets in `CustomRomBrowserViewFactory`; short files are also unsafe because loaders ignore `bytesRead` and copy the full requested length from temporary memory.
- **Incomplete Custom model:** V2 models only layered 256×192 backgrounds plus unsupported `launchTransition`; it has no typed slots for grid/banner/scrim texture-palette pairs or the real Custom JSON layout/color fields. Import rights and content-addressed PNG persistence are strong and reusable as source-authority mechanisms, but currently apply only to background composition.
- **Preview mismatch:** Material preview visualizes generic scene tokens that the cartridge ignores. Custom preview paints accent-colored rectangles rather than decoded source pixels or launcher-native indexed textures. Existing fidelity labels therefore overstate “Material colors” evidence and do not cover Custom codec behavior.
- **Codec evidence gap:** direct-color backgrounds have deterministic XBGR555 packing tests, including the Studio's bit-15 threshold at alpha 128, but no v1.3.0 hardware receipt proves transparent-bit behavior. There are no A3I5/A5I3 encoders, palette quantizers, launcher-fixture round trips, or physical-cartridge receipts.

#### Exact v1.3.0 visual baseline

| Files | Runtime format and visible dimensions | Required bytes |
|---|---|---:|
| `topbg.bin`, `bottombg.bin` | little-endian direct 15-bit, 256×192 | 98,304 each |
| `gridcell.bin`, `gridcellSelected.bin` | A3I5 in 64×64 allocation, 48×48 used | 4,096 each |
| `gridcellPltt.bin`, `gridcellSelectedPltt.bin` | 32-color XBGR555 palette | 64 each |
| `bannerListCell.bin`, `bannerListCellSelected.bin` | A3I5, 256×49 loaded and 209×49 used | 12,544 each |
| `bannerListCellPltt.bin`, `bannerListCellSelectedPltt.bin` | 32-color XBGR555 palette | 64 each |
| `scrim.bin`, `scrimPltt.bin` | A5I3 8×42 plus 8-color XBGR555 palette | 336 + 16 |

The exact binary payload total is 230,496 bytes. Source code and the bundled Raspberry fixture agree on `gridcellSelectedPltt.bin`; `docs/Themes.md` incorrectly says `gridcellPlttSelected.bin`, so code plus fixture must win over that documentation typo.

v1.3.0 also consumes `primaryColor` and `darkTheme` for Custom chrome, plus `topIcon`, four top text elements, `topCover`, `gridIcon`, `bannerListIcon`, and three banner-list text colors. Nested objects are hazardous when partial: once an object exists, omitted position/color components become zero rather than inheriting defaults. The Studio should emit either a complete validated object or omit the whole object.

BCSTM DSP-ADPCM files under `/_pico/themes/<theme>/bgm/` are supported and randomly selected, but they should follow—not precede—the complete visual safety baseline. Covers are read from global `/_pico/covers`, not theme packages. Selector assets, `preview.bin`, theme `icon.bmp`, WAV sounds, `launchTransition`, configurable animation/timing, and custom fonts have no v1.3.0 consumer and must remain out of scope.

#### Evidence pinning

The versioned profile should identify `v1.3.0` and commit `b087565...`, then capture content hashes and semantic claims from the exact commit. Representative verified hashes are:

| Evidence | SHA-256 |
|---|---|
| `docs/Themes.md` | `cc1b928dba9b713e6d24429fa29fbcabed7c63e88e80a9d5d9af14dfa79fe50e` |
| `arm9/source/themes/ThemeInfoFactory.thumb.cpp` | `256dc9086480c15799000a2381c72ac3bb809432e28bfe717dab884ea60e96fb` |
| `arm9/source/themes/custom/CustomTheme.cpp` | `87923dee4e14457188300fae9143e7bfc0dba2861295bbbe6a070bc0e8310350` |
| `arm9/source/romBrowser/Theme/custom/CustomRomBrowserViewFactory.cpp` | `0784aee3590b9bc5e5250106512198d58e4420b0e0af1d0276f56a3e57fb368c` |
| `arm9/source/bgm/BgmService.cpp` | `e54fe7e0e66cd6abefe908f7d90c8d003169b9db9a7277b90895e6e8e2a41b0e` |
| `_pico/themes/raspberry/theme.json` | `9bb3914d539a87776c7ad38010eaeca7417515e12d7d1b09a710277cdb2073b2` |

Capture must use `git show <commit>:<path>`, reject a wrong HEAD or dirty authority worktree, record tag and commit independently, hash every cited source and fixture, and bind each validation rule to one or more evidence claims. Export reports should include the immutable profile version and manifest digest so a future launcher profile cannot silently alter old-project diagnostics or bytes.

### Affected Areas

- `packages/dspico-contract/src/index.ts` — wrong launcher commit, unsupported transition rules, Material mapping, Custom validation, codecs, complete-package gate, and report provenance.
- `packages/test-fixtures/src/capture.ts` and `packages/test-fixtures/src/launcher-v1.ts` — stale authority and too-small evidence set; need v1.3.0 source/fixture manifests.
- `packages/theme-core/src/index.ts` — V1 arbitrary token/scene history and open/save compatibility.
- `packages/theme-core/src/model-v2.ts`, `history-v2.ts`, `migration-v2.ts` — V2 mixes theme kinds with generic tokens and unsupported transitions; migration preserves misleading fields.
- `apps/studio/src/main.ts` — Material export adapter and Custom export entry point; Custom export should be blocked immediately.
- `apps/studio/src/studio-ipc.ts`, `preload.ts`, and project stores — version-aware open/save/migration, edit operations, and export capability exposure.
- `apps/studio/src/renderer/renderer.tsx` — replace generic Material colors/scenes, expose honest Custom completeness, and remove unsupported controls.
- `apps/studio/src/renderer/workspace/*` and `packages/theme-core/src/preview.ts` — preview must follow only consumed fields and clearly separate Chromium/source approximations from hardware evidence.
- `apps/studio/src/png-import.ts` and `portable-project-store.ts` — retain rights/provenance and content-addressed sources while extending typed asset slots.
- `openspec/specs/*` and `openspec/config.yaml` — main specs and project context currently encode the obsolete profile and Material-only/empty-repository assumptions.

### Approaches

1. **Patch V1/V2 in place** — add optional typed fields, reinterpret existing tokens, and extend current exporters.
   - Pros: fewer new serializers and smaller initial diff.
   - Cons: silently changes existing format semantics, keeps ignored legacy fields adjacent to authoritative fields, and makes migration/export honesty difficult to prove.
   - Effort: Medium

2. **Introduce a launcher-parity project generation** — define typed Material and Custom v1.3.0 capabilities, with explicit V1/V2 import-and-save-as migration.
   - Pros: strict schemas, honest capability boundaries, deterministic migration notices, and no ambiguity between Studio-only legacy data and launcher-consumed data.
   - Cons: touches models, operations, history, stores, IPC, renderer, tests, and export; existing projects require an explicit migration decision.
   - Effort: High

3. **Fix export adapters only** — translate existing generic state at export and hide unsupported output fields.
   - Pros: quickest path to smaller Material output.
   - Cons: the editor and preview remain misleading, generic colors have no unambiguous mapping to `primaryColor`, and unsafe Custom state remains representable.
   - Effort: Medium

### Recommendation

Use Approach 2, delivered in safety-first slices rather than one rewrite.

**First useful release:** create an immutable v1.3.0 profile, remove unsupported transition requirements/output, model and display only Material `primaryColor` plus `darkTheme`, make preview claims match those fields, migrate legacy Material projects explicitly, and block every Custom export entry point. This immediately stops producing unsafe cartridge packages while restoring useful, truthful Material authoring.

**Second release:** add the complete 12-file Custom visual contract as an atomic capability. Export must require all texture-palette pairs, exact filenames and byte lengths, complete validated JSON objects, canonical palettes, deterministic A3I5/A5I3 encoding, and a package-level manifest. No “partial but ready” Custom output is acceptable. Existing Custom V2 background composition and rights records may migrate as source material, but cannot become exportable until all required slots are complete.

**Later release:** add validated BCSTM pass-through/import and playback metadata after the visual baseline has cartridge evidence. Do not add unsupported v1.3.0 features in any slice.

Existing V1/V2 projects should open without source overwrite and migrate only through explicit save-as. Metadata maps directly. Valid existing `primaryColor`/`darkTheme` values may map directly; `accent` may be offered as a user-confirmed seed, never silently promoted. `background`, `foreground`, scene overrides, and launch-transition values should be preserved as legacy/non-exported migration evidence or reported as dropped, not emitted. Profile-dependent acknowledgment fingerprints must be invalidated. Existing Custom layers, source hashes, provenance, and rights can be retained, while export remains blocked pending complete safe generation.

The likely implementation exceeds the 400-line review budget. Future task planning should form independently reviewable work units around (1) profile/evidence plus the Custom kill switch, (2) typed Material migration/export/preview, (3) indexed codecs and fixtures, (4) typed Custom fields/assets and complete export, and (5) BCSTM. Tests belong with each behavior. `delivery_strategy: auto-chain` applies, but chain topology remains intentionally undecided during exploration.

### Risks

- Current Custom export can produce a package whose missing assets feed uninitialized VRAM offsets; it should be disabled before any broader Custom work.
- Loader reads do not enforce exact byte counts, so validation must reject every short or oversized binary before writing a ready package.
- The v1.3.0 documentation contains at least one filename typo; evidence precedence must be explicit: consuming code and bundled fixture over prose.
- XBGR1555 bit-15 transparency and A3I5/A5I3 alpha/palette semantics lack physical-cartridge receipts; software goldens alone cannot justify hardware-parity claims.
- A3I5/A5I3 quantization can create visible palette/alpha artifacts unless deterministic policies and cartridge comparisons are established.
- V1/V2 generic tokens and scenes are semantically ambiguous; silent migration would convert ignored Studio intent into cartridge behavior.
- Main OpenSpec specs and configuration are stale, so proposal/spec phases must explicitly replace obsolete authority rather than layering new requirements on it.
- The full change spans multiple high-coupling boundaries and is likely well above the 400-line review budget.

### Ready for Proposal

Yes. The proposal should lead with the immediate Custom export block and a first release limited to immutable v1.3.0 evidence plus truthful Material authoring. It should define complete Custom visuals and BCSTM as later dependent slices, require explicit V1/V2 migration, exclude every unsupported feature listed above, preserve `auto-chain`, and avoid selecting chain topology until task planning.
