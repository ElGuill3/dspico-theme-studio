# Apply Progress: Custom Assets and Audio Authoring

**Change**: `custom-assets-audio-authoring`
**Mode**: Standard mode; strict TDD is disabled by `openspec/config.yaml`.
**Artifact store**: OpenSpec + Engram.
**Delivery**: `auto-chain`, `stacked-to-main`; cumulative PR 1 (`Profile/evidence`) + PR 2 (`V3 media/store`) + PR 3 (`Seven visuals`) + PR 4 (`WAV DSP/audition`) + PR 5 (`Handoff/receipts`) + PR 6 (`Publication/export`) + PR 7 (`BCSTM`).
**Runtime attempt**: Reused the parent-acquired `proceed` attempt `sha256:ac507c6b74c696df3771b0c6485dd68a07d91e3c45aa4100a26b668681147674`; this executor did not acquire or settle another attempt.
**PR 2 runtime attempt**: Reused the parent-acquired `proceed` attempt `sha256:4db5ba15dfa631a9741b31dd8dd3fd56d4930f43b2acab35db076eebff8e30be`; this executor did not acquire or settle another attempt.
**PR 3 runtime attempt**: Reused the parent-acquired `proceed` attempt `sha256:0cc008d9cc0894f4a5763c041899792a1cba8ed0f32383fde18bac97ba7e58e`; this executor did not acquire or settle another attempt.
**PR 4 runtime attempt**: Reused the parent-acquired `proceed` attempt `sha256:8362e1e7b088fd02a8209a078a3b4cc36937d5564bb8afef36b79d5253e425d3`; this executor did not acquire or settle another attempt.
**PR 5 runtime attempt**: Reused the parent-acquired `proceed` attempt `sha256:05f12f6a9a4b01807676db2e3462409bbd5a122893c6378758ed413a45b5eed1`; this executor did not acquire or settle another attempt.
**PR 7 runtime attempt**: Reused the parent-acquired `proceed` attempt `sha256:df95c30847a25e1c6a24fb68d5ae830950cc699bfb8ba6e8b3a326ef66894dcc`; this executor did not acquire or settle another attempt.
**PR 7 parent settlement**: `complete`; the parent settled the reused attempt above, and this corrective executor performed no acquire or settle.

## Completed Tasks

- [x] 1.1 RED: `capture.test.ts` now covers shell-free `git -C`, relative/absolute/moved roots, dirty/staged/`commit -a`/empty-index states, wrong HEAD/tag, root/source-hash drift, and missing evidence. Unsafe states and evidence drift fail before later source reads.
- [x] 1.2 GREEN: Added the composite v1.3 profile bindings, installed-target capability evidence, and profile tests. The profile binds commit `b087565651c83081dd65552863f5efc2f28e489c`, Linux x64, source lineage, target SHA `12a357324cab401a8f100d50198b33bfeba93fbaf53261bc7456ebe863d96342`, and no fallback.
- [x] 1.3 RED: Added V3 media/migration/store/session RED coverage for exact V1/V2/parity source preservation, role confirmation, corrupt-media quarantine, atomic boundaries, and explicit non-destructive Save migrated copy. The initial focused npm-equivalent run failed 4/4 because the V3 exports were absent.
- [x] 1.4 GREEN: Added strict V3 typed media/history/migration/render-plan contracts, immutable PNG source bytes, V3 atomic media/project staging, quarantine-on-reopen, and save-as session routing without overwriting the source path.
- [x] 2.1 RED: Added codec/compiler and Electron lifecycle coverage for seven source roles, the ordered 12-file/230,496-byte manifest, locked palette policy, output SHA-256 values, immutable source lineage, and honest post-codec labels. Focused RED failed 2 tests before the visual contract implementation.
- [x] 2.2 GREEN: Added deterministic seven-role visual compilation, target-sized nearest-center transforms, output hashes/lineage, locked palette metadata, render-plan fidelity bounds, and a seven-role bench plus 12-output rail using the existing trusted PNG import boundary.
- [x] 2.3 RED: Added WAV contract and lifecycle coverage for deterministic DSP, invalid PCM/recipe/size rejection, hash-verified reopen, optional omission, waveform data, local playback, and exact `Desktop audition` labeling.
- [x] 2.4 GREEN: Added bounded PCM WAV preparation and wired prepared PCM through the narrow IPC/preload API into the local audio workbench; Navigation and Launch remain separate optional sounds with no cartridge-parity claim.
- [x] 3.1 RED: Added receipt, handoff-writer, registry, and IPC RED coverage for exact visual identity reuse, stale/incomplete evidence, separate not-ready folders, no ZIP output, and no preflight writes.
- [x] 3.2 GREEN: Added exact profile/codec/theme/package receipt validation, atomic exact-key receipt storage, atomic folder-only `NOT READY — CARTRIDGE TEST ONLY` handoff, receipt capture IPC, and main-owned handoff wiring without changing publication.
- [x] 3.3 RED: Added publication RED coverage for mismatched ordered ZIP manifests, IPC target confusion, blocked Custom export, exact typed receipts, evidence kinds, and zero ready/partial output.
- [x] 3.4 GREEN: Added exact receipt-registry publication gates, shared handoff/publication identities, ordered ZIP/folder manifest verification, explicit export target routing, and renderer fail-closed gates; no BCSTM work was included.
- [x] 3.5 RED: Added BCSTM parser/pass-through RED coverage for pre-receipt blocking, exact source-hash receipt binding, malformed and multiple-source fail-closed behavior, byte preservation, and the absence of audition/conversion claims in the core and Electron lifecycle.
- [x] 3.6 GREEN: Added strict v1.3 DSP-ADPCM BCSTM validation, pinned visual/source receipts, one-source pass-through paths, trusted IPC/preload import, and a metadata-only BGM surface at `/_pico/themes/<theme>/bgm/`; no bytes are converted, decoded for audition, or written by this slice.

## RED/GREEN Evidence

| Task | RED | GREEN |
|---|---|---|
| 1.1 | `npm exec -- vitest run --config vitest.config.mts packages/test-fixtures/src/capture.test.ts` failed as intended: 1 file, 16 tests, 2 failures. Hash drift read all 8 sources instead of stopping; missing evidence was classified `command-failed` instead of `invalid-source`. | After the capture gate change, the focused slice passed: capture coverage is 16/16 and stops on the first source/evidence failure. |
| 1.2 | The profile test and composite capability bindings were absent before implementation. | `profile-v1-3.test.ts` passed 4/4 tests with the capture suite; profile/evidence identities are bound without fallback. |
| 1.3 | Requested `pnpm exec vitest run --config vitest.config.mts packages/theme-core/src/{migration-v3.test.ts,media-authoring-v3.test.ts}` was unavailable (`zsh: command not found: pnpm`, exit 127). Exact npm equivalent failed before GREEN: 2 files, 4 tests failed because `createMediaRefV3`/`migrateProjectToV3` were absent. | RED tests were retained, then the implemented migration/media tests passed: 2 files, 4 tests, exit 0. |
| 1.4 | Store/session tests were extended with the atomic V3/save-as/quarantine scenarios before the implementation was present. | `npm exec -- vitest run --config vitest.config.mts apps/studio/src/{project-file-session.test.ts,portable-project-store.test.ts}` passed: 2 files, 19 tests, exit 0. |
| 2.1 | `npm exec -- vitest run --config vitest.config.mts packages/dspico-contract/src/codecs-v1-3.test.ts packages/dspico-contract/src/custom-compiler-v1.test.ts` failed as intended before GREEN: 2 tests failed (locked palette policy was absent; seven-role compiler export was absent) while the prior 15 tests passed. | The same equivalent command passed after GREEN: 2 files, 17 tests, exit 0; the lifecycle RED assertions were then exercised by the runtime harness. |
| 2.2 | RED assertions were retained before production changes, including seven role assignment, exact manifest total, hashes, and labels. | Visual compiler and renderer implementation passed the focused suite and the headless Electron lifecycle harness with seven assignments and 12 inspected outputs. |
| 2.3 | Requested `pnpm` was unavailable (`zsh: command not found: pnpm`); exact npm equivalent failed as intended before GREEN because `theme-sounds-v1.ts` was absent. | `npm exec -- vitest run --config vitest.config.mts packages/dspico-contract/src/theme-sounds-v1.test.ts` passed: 1 file, 3 tests, exit 0; deterministic DSP, rejection, reopen, omission, and audition metadata are covered. |
| 2.4 | RED tests were retained before production changes and the Electron lifecycle assertions were exercised only after the contract was absent/failing. | `npm run typecheck` passed; `npm test` passed 25 files/245 tests; `npm run test:e2e` passed 2/2 tests with prepared PCM, waveform/audio, exact `Desktop audition`, omission state, and same-session custom reopen. |
| 3.1 | Requested `pnpm exec vitest run --config vitest.config.mts packages/dspico-contract/src/receipts-v1.test.ts apps/studio/src/{handoff-writer.test.ts,receipt-registry.test.ts}` was unavailable (`zsh: command not found: pnpm`, exit 127). Exact npm equivalent failed as intended before GREEN: 3 suites, 0 tests, missing `receipts-v1.ts`, `handoff-writer.ts`, and `receipt-registry.ts`. | RED tests were retained and the exact npm equivalent passed after GREEN: 3 files, 8 tests, exit 0. |
| 3.2 | RED assertions remained in place before production implementation. | IPC focus passed: 1 file, 24 tests, exit 0; the handoff runtime path passed through Electron with the exact label and `zip: false`. |
| 3.3 | `npm exec -- vitest run --config vitest.config.mts apps/studio/src/export-writer.test.ts apps/studio/src/studio-ipc.test.ts` failed as intended before GREEN: 2 files, 71 tests, 2 failures (ZIP manifest mismatch and export-target confusion). `npm run test:e2e` failed as intended on the new complete-publication scenario: 2 passed, 1 failed because registry receipts were not yet used by publication. | RED tests were retained; the final focused suite passed after GREEN. |
| 3.4 | Production changes were intentionally withheld until the publication RED assertions failed. | `npm exec -- vitest run --config vitest.config.mts apps/studio/src/export-writer.test.ts apps/studio/src/studio-ipc.test.ts apps/studio/src/renderer/renderer-shell.test.ts` passed: 3 files, 80 tests, exit 0; the final Electron/package harnesses passed below. |
| 3.5 | `npm exec -- vitest run --config vitest.config.mts packages/dspico-contract/src/bcstm-v1-3.test.ts` failed as intended before GREEN: 3 tests ran, with typed receipt pass-through and the missing one-source validator failing against the pre-GREEN contract. | RED assertions were retained; the focused suite passed after GREEN with 1 file/3 tests, including source-hash binding, malformed/second-source rejection, and no audition/conversion fields. |
| 3.6 | Production BCSTM/IPC/UI changes were withheld until the BCSTM RED assertions failed. | `npm run typecheck`, the Electron lifecycle, full Vitest, package verification, targeted Prettier, and `git diff --check` passed after GREEN. |

## Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | Requested `pnpm exec vitest run --config vitest.config.mts packages/test-fixtures/src/capture.test.ts packages/dspico-contract/src/profile-v1-3.test.ts` was unavailable (`zsh: command not found: pnpm`, exit 127). Equivalent `npm exec -- vitest run --config vitest.config.mts packages/test-fixtures/src/capture.test.ts packages/dspico-contract/src/profile-v1-3.test.ts` passed: 2 files, 20 tests, exit 0. |
| Typecheck | Requested `pnpm typecheck` was unavailable (`zsh: command not found: pnpm`, exit 127). Equivalent `npm run typecheck` passed with exit 0. |
| Formatting/diff check | `npm exec -- prettier --check --print-width 120 --trailing-comma all packages/test-fixtures/src/capture.ts packages/test-fixtures/src/capture.test.ts packages/test-fixtures/src/composite-profile-v1.ts packages/test-fixtures/evidence/dspico-theme-sounds-v1-capability.json packages/dspico-contract/src/profile-v1-3.ts packages/dspico-contract/src/profile-v1-3.test.ts && git diff --check` passed with exit 0. |
| Runtime harness | `N/A` — this work unit is a read-only Git authority/evidence boundary; the focused Vitest harness exercises native Git selection and temporary repository safety, but no application runtime or hardware claim exists. |
| Rollback boundary | Revert only the PR 1 changes in `capture.ts`, `capture.test.ts`, and the composite additions in `profile-v1-3.ts`; delete `composite-profile-v1.ts`, `profile-v1-3.test.ts`, and `dspico-theme-sounds-v1-capability.json`. Retain unrelated pre-existing worktree changes and the prior visual profile/evidence. |

### PR 2 Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused core test | `npm exec -- vitest run --config vitest.config.mts packages/theme-core/src/{migration-v3.test.ts,media-authoring-v3.test.ts}` — exit 0; 2 files, 4 tests passed. |
| Store/session harness | `npm exec -- vitest run --config vitest.config.mts apps/studio/src/{project-file-session.test.ts,portable-project-store.test.ts}` — exit 0; 2 files, 19 tests passed, including atomic V3 staging, source-hash quarantine, and explicit save-as path retention. |
| Typecheck | Requested `pnpm typecheck` unavailable (`zsh: command not found: pnpm`, exit 127). Equivalent `npm run typecheck` — exit 0; `tsc --noEmit` passed. |
| Runtime/package procedure | Automated equivalent only: migration tests cover V1/V2/LauncherParityProjectV1 and the store/session harness covers the Save migrated copy boundary. Interactive `pnpm start`/Electron was not run in this bounded attempt; no hardware, cartridge, or playback claim is made. |
| Diff hygiene | `git diff --check` — exit 0; no whitespace errors. A targeted Prettier check remains non-clean for compact pre-existing-style one-line declarations in the new slice; no formatter gate was requested for this attempt. |
| Rollback boundary | Revert only PR 2 V3 additions/edits: `packages/theme-core/src/{model-v3.ts,history-v3.ts,migration-v3.ts,render-plan-v3.ts,media-authoring-v3.test.ts,migration-v3.test.ts,index.ts}`, `apps/studio/src/{portable-project-store.ts,portable-project-store.test.ts,project-file-session.ts,project-file-session.test.ts,png-import.ts,png-import.test.ts}`. Retain PR 1 profile/evidence, legacy readers, and unrelated worktree changes. |

### PR 3 Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused core test | Requested `pnpm exec vitest run --config vitest.config.mts packages/dspico-contract/src/{codecs-v1-3.test.ts,custom-compiler-v1.test.ts}` was unavailable (`zsh: command not found: pnpm`, exit 127). Equivalent `npm exec -- vitest run --config vitest.config.mts packages/dspico-contract/src/codecs-v1-3.test.ts packages/dspico-contract/src/custom-compiler-v1.test.ts` passed: 2 files, 17 tests, exit 0. |
| Runtime harness | `npm run test:e2e` passed: Vite renderer/main builds, TypeScript check, and Playwright `e2e` suite completed 2/2 tests, including seven PNG role assignments, all 12 output rows, 230,496 total bytes, output hashes, locked palette, `Decoded post-codec output`, `Chromium approximation`, and `hardware-unknown` labels; exit 0. This is automated/component/Electron proof only; no hardware claim. |
| Typecheck | `npm run typecheck` passed with exit 0 (`tsc -p tsconfig.base.json --noEmit`). |
| Formatting/diff check | `npm exec -- prettier --check --print-width 120 --trailing-comma all packages/dspico-contract/src/codecs-v1-3.ts packages/dspico-contract/src/codecs-v1-3.test.ts packages/dspico-contract/src/custom-v1-3.ts packages/dspico-contract/src/custom-compiler-v1.test.ts packages/dspico-contract/src/index.ts packages/theme-core/src/render-plan-v3.ts packages/theme-core/src/index.ts apps/studio/src/renderer/custom-asset-bench.tsx apps/studio/src/renderer/custom-output-rail.tsx apps/studio/src/renderer/renderer.tsx apps/studio/src/renderer/workspace/workspace-model.ts apps/studio/src/renderer/studio.css e2e/lifecycle.spec.ts && git diff --check` passed with exit 0. |
| Rollback boundary | Revert only the PR 3 visual compiler/codec additions and renderer bench/rail changes in `packages/dspico-contract/src/{codecs-v1-3.ts,custom-v1-3.ts,codecs-v1-3.test.ts,custom-compiler-v1.test.ts,index.ts}`, `packages/theme-core/src/render-plan-v3.ts`, `apps/studio/src/renderer/{custom-asset-bench.tsx,custom-output-rail.tsx,renderer.tsx,studio.css,workspace/workspace-model.ts}`, and the PR 3 lifecycle assertions in `e2e/lifecycle.spec.ts`; retain PR 1/2 profile, media/store, source-byte, and unrelated worktree changes. |

### PR 4 Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | Requested `pnpm exec vitest run --config vitest.config.mts packages/dspico-contract/src/theme-sounds-v1.test.ts` was unavailable (`zsh: command not found: pnpm`, exit 127). Exact npm equivalent passed: 1 file, 3 tests, exit 0. |
| Full/unit regression | `npm test` passed: 25 files, 245 tests, exit 0. |
| Typecheck | `npm run typecheck` passed: `tsc -p tsconfig.base.json --noEmit`, exit 0. |
| Runtime harness | `npm run test:e2e` passed: renderer/main builds, typecheck, and Playwright Electron suite 2/2 tests, exit 0; prepared PCM, waveform/audio boundary, exact label, omitted Launch, and same-session custom reopen passed. No cartridge or hardware parity claim. |
| Formatting/diff check | Targeted Prettier `--check` passed for every PR 4 touched source/test path; `git diff --check` passed, exit 0. |
| Rollback boundary | Revert only `packages/dspico-contract/src/{theme-sounds-v1.ts,theme-sounds-v1.test.ts}`, `apps/studio/src/renderer/audio-workbench.tsx`, PR 4 wiring in `apps/studio/src/{renderer/renderer.tsx,studio-ipc.ts,preload.ts}`, `e2e/lifecycle.spec.ts`, the stale audio assertion update in `apps/studio/src/renderer/renderer-shell.test.ts`, and the sound export/hash change in `packages/dspico-contract/src/index.ts`; retain PR 1–3 files and unrelated worktree changes. |

### PR 5 Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | Requested `pnpm exec vitest run --config vitest.config.mts packages/dspico-contract/src/receipts-v1.test.ts apps/studio/src/{handoff-writer.test.ts,receipt-registry.test.ts}` unavailable (`zsh: command not found: pnpm`, exit 127). Exact npm equivalent passed: 3 files, 8 tests, exit 0. |
| IPC/typecheck | `npm exec -- vitest run --config vitest.config.mts apps/studio/src/studio-ipc.test.ts` passed: 1 file, 24 tests, exit 0. `npm run typecheck` passed: `tsc -p tsconfig.base.json --noEmit`, exit 0. |
| Full regression | `npm test` passed: 28 files, 255 tests, exit 0. |
| Runtime harness | `npm run test:e2e` passed: Vite renderer/main builds, TypeScript check, and Playwright `e2e` suite completed 2/2 tests, exit 0. The lifecycle exercised seven-role handoff generation, exact `NOT READY — CARTRIDGE TEST ONLY` metadata, folder-only `zip: false`, and preserved the publication boundary; no hardware or compatibility claim was made. |
| Formatting/diff check | Targeted Prettier `--check --print-width 120 --trailing-comma all` passed for every PR 5 touched source/test path; `git diff --check` passed, exit 0. |
| Rollback boundary | Revert only PR 5 changes in `packages/dspico-contract/src/{receipts-v1.ts,receipts-v1.test.ts}`, `apps/studio/src/{handoff-writer.ts,handoff-writer.test.ts,receipt-registry.ts,receipt-registry.test.ts,main.ts,studio-ipc.ts,studio-ipc.test.ts,preload.ts}`, and the PR 5 handoff/API assertions in `e2e/lifecycle.spec.ts`; retain PR 1–4 contracts, stores, visual/audio authoring, and unrelated worktree changes. |

### PR 6 Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `npm exec -- vitest run --config vitest.config.mts apps/studio/src/export-writer.test.ts apps/studio/src/studio-ipc.test.ts apps/studio/src/renderer/renderer-shell.test.ts` — exit 0; 3 files, 80 tests passed. Requested `pnpm` equivalent was unavailable: `zsh:1: command not found: pnpm` (exit 127). |
| Full tests | `npm test` — exit 0; 28 files, 257 tests passed. |
| Typecheck | `npm run typecheck` — exit 0; `tsc -p tsconfig.base.json --noEmit` passed. Requested `pnpm typecheck` was unavailable with exit 127. |
| Runtime harness | `npm run test:e2e` — exit 0; 3 tests passed, including blocked/no-output Custom publication, exact typed receipt reuse, equivalent ordered folder/ZIP manifests/checksums, honest `source`/`fixture` evidence kinds, and software-only boundary. No hardware inference. |
| Package verification | `npm run verify:package` — exit 0; Electron Forge packaged `dspico-theme-studio-linux-x64`, verified ASAR contents and packaged runtime, and reran 3 E2E tests successfully. Requested `pnpm verify:package` was unavailable with exit 127. |
| Formatting/diff check | Targeted Prettier `--check --print-width 120 --trailing-comma all` over every PR 6 touched source/test path plus `git diff --check` — exit 0. |
| Rollback boundary | Revert only PR 6 publication changes in `apps/studio/src/{export-writer.ts,export-writer.test.ts,main.ts,preload.ts,studio-ipc.ts,studio-ipc.test.ts,renderer/renderer.tsx,renderer/renderer-shell.test.ts}` and the PR 6 publication scenario in `e2e/lifecycle.spec.ts`; restore the prior fail-closed export and retain PR 1–5 sources, handoff, receipts, WAV, visual, and stores. Do not touch BCSTM PR 7 paths. |

## Authored Line Accounting

The PR 1 implementation/test delta is approximately **247 authored changed lines**. PR 2 is approximately **384 authored changed lines**, below the 400-line review budget. PR 3 is **392 authored changed lines** in its bounded batch, below the 400-line cap. PR 4 is **390 authored implementation/test changed lines** in this bounded batch, below the 400-line cap. PR 5 is **313 authored implementation/test changed lines** in this bounded batch, below the 400-line cap. PR 6 is **330 authored implementation/test changed lines** in this bounded batch, below the 400-line cap. PR 7 is **359 authored implementation/test changed lines** in this bounded batch, below the 400-line cap. These counts exclude OpenSpec/Engram artifacts and unrelated pre-existing worktree changes.

Implementation/test evidence revision (sorted path plus file SHA-256 manifest): `sha256:e583a32ab8535bcc74ce2b7fcaaac90d5c71daa2f32b88a8c4eab55e34b1079d`.
PR 2 implementation/test evidence revision (sorted digest/path manifest): `sha256:07e20c3a64fb9228eb331dc25145cafc58863e07421406aa7ac79e130732dd30`.
PR 3 implementation/test evidence revision (sorted SHA-256 digest/path manifest): `sha256:4bf53eb5423098ac302c18428ee58d58815051920d72a7df4f785db071d54e9e`.
PR 4 implementation/test evidence revision (sorted SHA-256 digest/path manifest): `sha256:4ed0d969ae480d41287bcf909cf76ca92fccb24add36b3a0885fbe521f7aedd6`.
PR 5 implementation/test evidence revision (sorted path plus SHA-256 file manifest): `sha256:fcbf99cdd78dac30bf27bb3dd7612401bbaeac95a74d3c5c773957a113885b66`.
PR 6 implementation/test evidence revision (sorted path plus SHA-256 file manifest): `sha256:748ccb20eeeebddae99e21ecc936fccedc81788970ed62c25ce6c526fbe37688`.
PR 7 implementation/test evidence revision (sorted path plus SHA-256 file manifest): `sha256:0035bc53ef1b20e7d2b30b41725516c84f574ed2012946e44d42558baa8cb251`.

## Files Changed

- `packages/test-fixtures/src/capture.ts` — classify missing source evidence as invalid and stop immediately on source hash drift.
- `packages/test-fixtures/src/capture.test.ts` — add the PR 1 selector, state, root, hash, and missing-evidence RED matrix.
- `packages/dspico-contract/src/profile-v1-3.ts` — add Linux x64 and composite UI-sound capability identity bindings without fallback.
- `packages/dspico-contract/src/profile-v1-3.test.ts` — prove pinned visual and installed-target component identities.
- `packages/test-fixtures/src/composite-profile-v1.ts` — bind the capability fixture to the visual profile and expose a stable composite identity.
- `packages/test-fixtures/evidence/dspico-theme-sounds-v1-capability.json` — record the installed-target WAV capability evidence and limits.

### PR 2 Files Changed

- `packages/theme-core/src/model-v3.ts` — define immutable typed media refs, roles, profile identity, legacy evidence, and quarantine records.
- `packages/theme-core/src/history-v3.ts` — provide V3 project creation, replay, role confirmation, canonical serialization, and media reference collection.
- `packages/theme-core/src/migration-v3.ts` — migrate V1, V2, and LauncherParityProjectV1 without flattening legacy composition or source bytes.
- `packages/theme-core/src/render-plan-v3.ts` — expose bounded Chromium-approximation render plans with no hardware parity claim.
- `packages/theme-core/src/{media-authoring-v3.test.ts,migration-v3.test.ts}` — cover immutable media, role confirmation, V1/V2/parity migration, and legacy source preservation.
- `packages/theme-core/src/index.ts` — export V3 contracts.
- `apps/studio/src/portable-project-store.ts` — atomically stage V3 project/media bytes and quarantine missing or corrupt media on reopen.
- `apps/studio/src/portable-project-store.test.ts` — cover V3 crash boundary, reopen, and quarantine.
- `apps/studio/src/project-file-session.ts` — add explicit non-destructive Save migrated copy routing and role/quarantine preflight.
- `apps/studio/src/project-file-session.test.ts` — cover failed save-as path retention and successful path switching.
- `apps/studio/src/png-import.ts` and `apps/studio/src/png-import.test.ts` — retain an immutable source-byte copy from PNG import.

### PR 3 Files Changed

- `packages/dspico-contract/src/codecs-v1-3.ts` — bind the deterministic visual codec policy and locked palette metadata to the 12-file encoder.
- `packages/dspico-contract/src/custom-v1-3.ts` — define the seven role/source lineage and visual package contracts.
- `packages/dspico-contract/src/index.ts` — compile seven role sources into target geometries, exact ordered outputs, SHA-256 hashes, and bounded preview metadata.
- `packages/dspico-contract/src/{codecs-v1-3.test.ts,custom-compiler-v1.test.ts}` — prove locked palettes, seven role completeness, 230,496 bytes, deterministic hashes, lineage, and software-only boundaries.
- `packages/theme-core/src/render-plan-v3.ts` — expose seven roles, 12 output paths, total bytes, and non-hardware fidelity labels.
- `apps/studio/src/renderer/{custom-asset-bench.tsx,custom-output-rail.tsx}` — add accessible seven-role assignment and 12-output inspection surfaces.
- `apps/studio/src/renderer/renderer.tsx` — connect trusted PNG import results to the bounded visual bench and compiler.
- `apps/studio/src/renderer/workspace/workspace-model.ts` and `apps/studio/src/renderer/studio.css` — centralize honest preview labels and style the compact visual rail.
- `e2e/lifecycle.spec.ts` — exercise seven assignments and exact output/hash/label inspection through headless Electron.

### PR 4 Files Changed

- `packages/dspico-contract/src/theme-sounds-v1.ts` — parse bounded PCM RIFF/WAVE input and deterministically trim, fade, gain, downmix, resample, clip, round, quantize, hash, and emit mono 22,050-Hz signed-16 LE WAV records with target capability identity.
- `packages/dspico-contract/src/theme-sounds-v1.test.ts` — cover deterministic prepared bytes, rejection, size/recipe limits, optional roles, reopen, and audition metadata.
- `apps/studio/src/renderer/audio-workbench.tsx` — add separate Navigation/Launch optional sound controls, waveform inspection, local prepared-PCM playback, and exact `Desktop audition` labels.
- `apps/studio/src/renderer/renderer.tsx` — read selected local WAV bytes, attach explicit provenance and bounded recipe defaults, and route prepared sound records to the workbench.
- `apps/studio/src/studio-ipc.ts` and `apps/studio/src/preload.ts` — add a narrow trusted `prepare-wav` command carrying bytes/recipe/provenance and return prepared PCM; no filesystem path or network/runtime API is exposed.
- `packages/dspico-contract/src/index.ts` — export the sound contract and browser-safe SHA-256 helper used for source/prepared identities.
- `e2e/lifecycle.spec.ts` — exercise prepared WAV import, waveform/audio boundary, exact label, omission, and same-session save/open custom behavior.
- `apps/studio/src/renderer/renderer-shell.test.ts` — keep the renderer shell assertion compatible with the approved audio surface.

### PR 5 Files Changed

- `packages/dspico-contract/src/receipts-v1.ts` — validate exact visual receipt schema, pinned profile/codec policy, theme hash, ordered manifest, and observed evidence; expose exact matching and registry keys.
- `packages/dspico-contract/src/receipts-v1.test.ts` — prove exact reuse and stale/incomplete identity rejection.
- `apps/studio/src/handoff-writer.ts` — atomically stage and swap a fixed folder-only handoff, reject unsafe paths and ZIPs, and preserve publication paths.
- `apps/studio/src/handoff-writer.test.ts` — prove the labeled separate handoff, no ZIP, rollback-safe publication separation, and zero writes on invalid paths.
- `apps/studio/src/receipt-registry.ts` — atomically persist validated exact-key receipt records and ignore stale/interrupted records during lookup.
- `apps/studio/src/receipt-registry.test.ts` — prove exact lookup, staleness blocking, and no writes for incomplete receipts.
- `apps/studio/src/{main.ts,studio-ipc.ts,preload.ts}` — expose main-owned receipt capture and separate Custom handoff IPC; compile and hash candidate bytes before destination creation.
- `apps/studio/src/studio-ipc.test.ts` — prove handoff does not invoke publication and receipt capture remains main-routed.
- `e2e/lifecycle.spec.ts` — exercise the real Electron handoff boundary and explicit not-ready/folder-only label.

### PR 6 Files Changed

- `apps/studio/src/export-writer.ts` — verify stored ZIP entries match the ordered folder manifest before any publication transaction begins.
- `apps/studio/src/export-writer.test.ts` — prove mismatched valid ZIP manifests fail before either output is created.
- `apps/studio/src/main.ts` — require exact typed registry receipt identity for Custom publication, share publication/handoff package identity when complete, and preserve the separate not-ready fallback.
- `apps/studio/src/studio-ipc.ts` and `apps/studio/src/preload.ts` — carry an optional explicit publication target and reject target/project-kind confusion before validation/writing.
- `apps/studio/src/renderer/renderer.tsx` and `apps/studio/src/renderer/renderer-shell.test.ts` — disable publication until validation passes and invalidate publication artifacts after visual changes.
- `apps/studio/src/studio-ipc.test.ts` — cover target confusion and preserve validation-before-writer routing.
- `e2e/lifecycle.spec.ts` — prove blocked Custom publication has zero output, record exact receipt evidence, compare ordered folder/ZIP manifests and checksums, and assert typed evidence boundaries.

### PR 7 Files Changed

- `packages/dspico-contract/src/bcstm-v1-3.ts` — strictly parse bounded v1.3 BCSTM DSP-ADPCM structure, validate pinned visual/source receipts, and return byte-preserving one-source pass-through metadata/path only.
- `packages/dspico-contract/src/bcstm-v1-3.test.ts` — prove RED-before-GREEN receipt gates, exact source hashes, malformed/multiple-source rejection, immutable bytes, and no audition/conversion fields.
- `packages/dspico-contract/src/index.ts` — retain the public BCSTM contract export alongside the existing deterministic contract surface.
- `apps/studio/src/studio-ipc.ts` and `apps/studio/src/preload.ts` — expose one trusted `import-bcstm` request carrying source bytes and separate visual/BCSTM receipt evidence; no filesystem writer or export API is added.
- `apps/studio/src/renderer/audio-workbench.tsx` — add a single BGM input/metadata card with explicit receipt fields, launcher BGM path, metadata-only fidelity, and no audio element.
- `apps/studio/src/renderer/renderer.tsx` — connect the bounded BGM IPC request to the Custom audio workbench and project theme path.
- `e2e/lifecycle.spec.ts` — exercise the preload/API surface, pre-receipt block, second-source rejection, metadata-only BGM UI, and absence of an audition surface.

## Deviations and Risks

- Deviation: none from the PR 1 design; the stale testing-capability memory says no runner exists, but the current repository has Vitest and the explicit config still disables strict TDD, so Standard mode was used.
- Risk: `pnpm` is unavailable in the executor environment; npm equivalents passed. No hardware parity or physical receipt is claimed.
- Risk: PR 7 is the dependent BCSTM slice; publication/export tasks 3.3–3.4 remain complete and independent.
- Risk: `pnpm` remains unavailable; npm-equivalent focused tests and typecheck passed. Electron interactive start was intentionally not attempted; automated store/session evidence is the bounded substitute and makes no hardware claim.
- Risk: PR 2 retained compact legacy declarations, but every PR 3 touched path is now Prettier-clean and `git diff --check` passes.
- Deviation: PR 3 reuses the existing trusted PNG import and V2 custom session for the renderer bench; durable V3 role-assignment/save wiring remains outside tasks 2.1/2.2 and is not claimed here.
- Risk: the visual bench is a bounded authoring/inspection surface; it does not create a cartridge receipt or hardware-parity claim.
- Deviation: WAV input is intentionally bounded to PCM 16-bit mono/stereo sources and canonical prepared output; unsupported codecs/PCM remain fail-closed.
- Risk: audio state is held by the bounded renderer workbench for the current custom session; durable portable sound-media storage remains outside assigned PR 4 tasks and no persistence claim beyond safe same-session reopen is made.
- Deviation: the receipt registry was exposed through a narrow capture command in PR 5; PR 6 now consumes its exact identities for publication, while handoff remains usable before a physical receipt and never grants export approval.
- Risk: physical receipt contents remain user-observed evidence; no hardware parity is inferred, and the target remains explicitly `NOT READY — CARTRIDGE TEST ONLY`.
- Deviation: PR 6 uses the PR 5 typed `ReceiptRegistry` as the only Custom publication authority; the legacy environment receipt path is no longer accepted for publication, so stale/inferred legacy evidence remains blocked.
- Deviation: the handoff uses the shared publication plan when the project is complete and retains the prior role-package fallback only for incomplete projects, preserving the safe not-ready boundary without granting export.
- Risk: prepared WAVs remain capability-level evidence with no per-project WAV receipt, as required; BCSTM remains separately receipted and does not promote WAV evidence.
- Risk: `pnpm` is unavailable (`exit 127`); npm equivalents passed. The runtime/package harness is automated Electron/package proof only and makes no hardware claim.
- Deviation: PR 7 exposes BCSTM metadata and a pass-through candidate only; it intentionally adds no conversion, transcoding, decoding-for-audition, waveform, desktop playback, or direct output writer.
- Risk: BGM receipt JSON is supplied at the bounded renderer/IPC boundary and is not persisted by this slice; publication/export remains fail-closed because no BCSTM export API or output writer is exposed.

## Remaining Tasks

- [x] 1.3 RED: V3 media/store migration, role confirmation, quarantine, and save-as tests.
- [x] 1.4 GREEN: V3 model/history/migration/render plan and atomic save-as/store implementation.
- [x] 2.1 RED: seven visual roles, exact output manifest, palette lock, hashes, and post-codec label tests.
- [x] 2.2 GREEN: seven-role visual compiler, render-plan bounds, and visual bench/output rail.
- [x] 2.3–2.4: WAV RED/GREEN slices.
- [x] 3.1 RED: receipt, handoff-writer, registry, and IPC coverage.
- [x] 3.2 GREEN: exact receipts, atomic folder-only handoff, receipt capture IPC, and main/preload wiring.
- [x] 3.3–3.4: publication/export slice.
- [x] 3.5–3.6: dependent BCSTM slice.

### PR 4 Attempt Evidence

- **Outcome**: `success`.
- **Parent-owned token**: `sha256:8362e1e7b088fd02a8209a078a3b4cc36937d5564bb8afef36b79d5253e425d3` reused; this executor performed no acquire and no settle.
- **Settlement evidence**: no second settlement was created; parent retains settlement authority for the supplied token.
- **Evidence revision**: `sha256:4ed0d969ae480d41287bcf909cf76ca92fccb24add36b3a0885fbe521f7aedd6`.
- **Harness disposition**: `reused` parent runtime attempt; final automated Electron harness passed and no hardware was claimed.
- **Cleanup evidence**: lifecycle `finally` closes Electron and removes the temporary E2E root; no commit, push, PR, or PR 5+ paths were created by this executor.
- **Process evidence**: only assigned tasks 2.3 and 2.4 were implemented; PR 4 authored implementation/test change count is 390, formatting converged, targeted Prettier and `git diff --check` passed, and unrelated/PR 1–3 worktree changes remain untouched.

### PR 5 Attempt Evidence

- **Outcome**: `success`.
- **Parent-owned token**: `sha256:05f12f6a9a4b01807676db2e3462409bbd5a122893c6378758ed413a45b5eed1` reused; this executor performed no acquire and no settle.
- **Settlement evidence**: no second settlement was created; parent retains settlement authority for the supplied token.
- **Evidence revision**: `sha256:fcbf99cdd78dac30bf27bb3dd7612401bbaeac95a74d3c5c773957a113885b66`.
- **Harness disposition**: `reused` parent runtime attempt; focused, IPC, full Vitest, typecheck, and Electron runtime evidence passed.
- **Cleanup evidence**: Playwright `finally` closed Electron and removed the temporary E2E root; handoff writer removed staging/backup paths; no commit, push, PR, or PR 6+ paths were created by this executor.
- **Process evidence**: only assigned tasks 3.1 and 3.2 were implemented; PR 5 authored implementation/test change count is 313, below the 400-line cap; receipt reuse is exact-key/profile/codec/theme/package-hash bound; invalid/incomplete identity fails before destination creation; unrelated and PR 1–4 worktree changes remain untouched.

### PR 6 Attempt Evidence

- **Outcome**: `success`.
- **Parent-owned token**: `sha256:9d6436eaf5271d10045bd55f4125cae3323ee76b3342eeaa0008e033981f420b` reused; this executor performed no acquire and no settle.
- **Settlement evidence**: `complete`; the parent settled the supplied reused token; no second settlement was created, and this corrective executor performed no acquire or settle.
- **Evidence revision**: `sha256:748ccb20eeeebddae99e21ecc936fccedc81788970ed62c25ce6c526fbe37688`.
- **Harness disposition**: `reused` parent-owned runtime authority; focused tests, full Vitest, typecheck, Electron E2E, and packaged runtime all passed.
- **Cleanup evidence**: every lifecycle test closes Electron and removes its temporary root in `finally`; export/handoff writers remove staging/backup artifacts; package verification completed without leaving a publication destination in the repository. No commit, push, PR, or PR 7 files were created by this executor.
- **Process evidence**: only tasks 3.3/3.4 were implemented; authored implementation/test count is 330, below the 400-line cap; targeted formatter and `git diff --check` passed; PR 1–5 and unrelated worktree changes remain untouched.
- **Exact commands/results**: `pnpm test`, `pnpm typecheck`, and `pnpm verify:package` were unavailable (`zsh:1: command not found: pnpm`, exit 127); `npm test` 28/257 passed; `npm run typecheck` passed; `npm run test:e2e` 3/3 passed; `npm run verify:package` passed ASAR/runtime verification; targeted Prettier and `git diff --check` passed.

### PR 7 Attempt Evidence

- **Outcome**: `passed`.
- **Diagnosis**: The prior gate failed only on the returned Result Contract fields, stale post-settlement wording, and the malformed Engram PR 5 revision; PR 7 implementation/test evidence is unchanged.
- **Parent-owned token**: `sha256:df95c30847a25e1c6a24fb68d5ae830950cc699bfb8ba6e8b3a326ef66894dcc` reused; this executor performed no acquire and no settle.
- **Settlement evidence**: `complete`; the parent settled the supplied reused token; no second settlement was created, and this corrective executor performed no acquire or settle.
- **Evidence revision**: `sha256:0035bc53ef1b20e7d2b30b41725516c84f574ed2012946e44d42558baa8cb251` (sorted SHA-256 path manifest over the PR 7 implementation/test surface).
- **Harness disposition**: `reused` parent-owned runtime authority; no hardware, cartridge parity, playback, conversion, or audition claim was made.
- **Cleanup evidence**: every lifecycle test closes Electron and removes its temporary E2E root in `finally`; package verification left no publication destination in the repository. No commit, push, PR, attempt acquire, or attempt settle was performed.
- **Process evidence**: only assigned tasks 3.5/3.6 were implemented; authored implementation/test delta is **359 lines**, below the 400-line cap; RED ran before GREEN; BCSTM is byte-preserving pass-through only; targeted Prettier and `git diff --check` passed; PR 1–6 and unrelated worktree changes remain untouched.
- **Exact commands/results**: requested `pnpm exec vitest run --config vitest.config.mts packages/dspico-contract/src/bcstm-v1-3.test.ts` was unavailable (`zsh:1: command not found: pnpm`, exit 127); npm equivalent passed 1 file/3 tests. `npm exec -- vitest run --config vitest.config.mts apps/studio/src/studio-ipc.test.ts` passed 1 file/25 tests. `npm test` passed 28 files/258 tests. `npm run typecheck` passed. `npm run test:e2e` passed 3/3 tests with pre-receipt blocking, second-source rejection, metadata-only BGM UI, and no BGM audio element. `npm run verify:package` passed ASAR/runtime verification and 3/3 packaged E2E tests. Targeted Prettier check and `git diff --check` passed.
- **Touched paths**: `packages/dspico-contract/src/{bcstm-v1-3.ts,bcstm-v1-3.test.ts,index.ts}`, `apps/studio/src/{studio-ipc.ts,preload.ts,renderer/audio-workbench.tsx,renderer/renderer.tsx}`, and `e2e/lifecycle.spec.ts`.
- **Rollback boundary**: revert only the PR 7 BCSTM changes in `packages/dspico-contract/src/{bcstm-v1-3.ts,bcstm-v1-3.test.ts}`, the BCSTM additions in `apps/studio/src/{studio-ipc.ts,preload.ts,renderer/audio-workbench.tsx}`, the one renderer integration in `apps/studio/src/renderer/renderer.tsx`, and the BCSTM lifecycle assertions in `e2e/lifecycle.spec.ts`; retain PR 1–6 contracts, stores, visual/audio foundations, handoff, receipts, publication, and unrelated worktree changes.

**Next recommended**: Parent must settle attempt `sha256:0e980ea0967445b4db25dbe0b24e27716bc36846652600905f211013cf7c7b67` first. Only after a successful settlement may independent `sdd-verify` run.

## Focused Remediation: R3-001 and R3-002

```json
{
  "schema": "gentle-ai.remediation-result/v1",
  "change": "custom-assets-audio-authoring",
  "outcome": "passed",
  "work_unit": "Native review correction R3-001 R3-002",
  "failed_evidence_revision": "sha256:7541de2f456e84dd043d8def0866b2a7583f6d672d9305a0549d88c4929191ee",
  "lineage_id": "",
  "generation": 0,
  "fix_batch": 0,
  "attempt_token": "sha256:0e980ea0967445b4db25dbe0b24e27716bc36846652600905f211013cf7c7b67",
  "attempt_authority": "Parent-acquired; this executor did not acquire, reset, settle, or otherwise mutate runtime attempt authority.",
  "candidate_changed": true,
  "authored_changed_lines": 194,
  "evidence_schema": "gentle-ai.remediation-evidence/v1",
  "settlement": "Parent-owned; not settled by this executor."
}
```

```json
{
  "schema": "gentle-ai.remediation-evidence/v1",
  "change": "custom-assets-audio-authoring",
  "mode": "standard",
  "rdd_mode": "disabled/unmanaged",
  "work_unit": "Native review correction R3-001 R3-002",
  "failed_evidence_revision": "sha256:7541de2f456e84dd043d8def0866b2a7583f6d672d9305a0549d88c4929191ee",
  "lineage_id": "",
  "generation": 0,
  "fix_batch": 0,
  "attempt_token": "sha256:0e980ea0967445b4db25dbe0b24e27716bc36846652600905f211013cf7c7b67",
  "findings": [
    {
      "id": "R3-001",
      "root_cause": "The shared Material project factory emitted an empty token record when callers omitted tokens.",
      "correction": "The factory now always supplies canonical primaryColor RGB black and darkTheme false defaults before caller overrides."
    },
    {
      "id": "R3-002",
      "root_cause": "The legacy V2 Custom publication compiler encoded five unprovided visual roles as transparent images.",
      "correction": "The legacy compiler now fails closed with custom.export-blocked; only the V3 seven-role publication path may emit Custom bytes."
    }
  ],
  "verification": {
    "focused_red": "npm exec -- vitest run --config vitest.config.mts packages/theme-core/src/index.test.ts packages/dspico-contract/src/custom-compiler-v1.test.ts; exit 1; 2 files, 23 tests, 2 expected failures.",
    "focused_green": "npm exec -- vitest run --config vitest.config.mts packages/theme-core/src/index.test.ts packages/dspico-contract/src/custom-compiler-v1.test.ts; exit 0; 2 files, 23 tests passed.",
    "typecheck": "npm run typecheck; exit 0; tsc -p tsconfig.base.json --noEmit passed.",
    "runtime": "npm run test:e2e; exit 0; Vite renderer and main builds plus TypeScript check passed; Playwright Electron 5/5 passed.",
    "format": "npm exec -- prettier --check --print-width 120 --trailing-comma all packages/theme-core/src/index.ts packages/theme-core/src/index.test.ts packages/dspico-contract/src/index.ts packages/dspico-contract/src/custom-compiler-v1.test.ts; exit 0; all matched files use Prettier code style.",
    "diff_check": "git diff --check; exit 0."
  },
  "normalization": "Not needed: the source files passed the Prettier check before final verification.",
  "cleanup_evidence": "After Playwright completed, no Electron process and no /tmp/dspico-studio-e2e-*, /tmp/dspico-publication-e2e-*, or /tmp/dspico-package-* roots remained.",
  "process_evidence": "No commit, stage, push, PR, review start, attempt acquire, reset, or settle was performed. Existing unrelated UI and E2E worktree changes remain unmodified.",
  "authored_line_accounting": {
    "additions": 27,
    "deletions": 167,
    "total": 194,
    "maximum": 200
  },
  "rollback_boundary": "Revert only packages/theme-core/src/index.ts, packages/theme-core/src/index.test.ts, packages/dspico-contract/src/index.ts, and packages/dspico-contract/src/custom-compiler-v1.test.ts. This restores the prior Material default behavior and legacy V2 compiler without touching existing renderer, right-dock, E2E, or SDD task work."
}
```

### Cumulative Task State

All prior evidence remains preserved above and in Engram observation `#11434` revision 17. Tasks remain complete and unchanged: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, and 3.6.

## Focused Remediation: Fresh Verification Correction F1-F4

```json
{
  "schema": "gentle-ai.remediation-result/v1",
  "change": "custom-assets-audio-authoring",
  "outcome": "failed",
  "work_unit": "Fresh verification correction F1-F4",
  "failed_evidence_revision": "sha256:77a54f53e80499673a33382112bec17c40d94e2e30669de5c3df184a5c853ba4",
  "lineage_id": "",
  "generation": 0,
  "fix_batch": 0,
  "attempt_token": "sha256:920aa3213c2b01c6e4390356a672761a936fd3bbe1d57bbece7e40af25f6e571",
  "attempt_authority": "Parent-acquired; this executor did not acquire, reset, settle, or otherwise mutate attempt authority.",
  "candidate_changed": true,
  "authored_changed_lines": 169,
  "evidence_revision": "sha256:ec8f7f0e2fd8a219330ddb202dadf411a6b715eb4bc4c38673c78bba060b57c0",
  "evidence_schema": "gentle-ai.remediation-evidence/v1",
  "settlement": "Parent-owned; parent settlement must receive this failed result. Independent sdd-verify is blocked until a successful correction is produced."
}
```
```json
{
  "schema": "gentle-ai.remediation-evidence/v1",
  "change": "custom-assets-audio-authoring",
  "mode": "standard",
  "rdd_mode": "disabled/unmanaged",
  "work_unit": "Fresh verification correction F1-F4",
  "failed_evidence_revision": "sha256:77a54f53e80499673a33382112bec17c40d94e2e30669de5c3df184a5c853ba4",
  "lineage_id": "",
  "generation": 0,
  "fix_batch": 0,
  "attempt_token": "sha256:920aa3213c2b01c6e4390356a672761a936fd3bbe1d57bbece7e40af25f6e571",
  "evidence_revision": "sha256:ec8f7f0e2fd8a219330ddb202dadf411a6b715eb4bc4c38673c78bba060b57c0",
  "findings": [
    {
      "id": "F1",
      "correction": "V2 token validation now accepts only canonical RGB object tokens in addition to scalar values, preserving the V1 Material primaryColor default through canonical V2 save and replay."
    },
    {
      "id": "F2",
      "correction": "Default Custom publication diagnostics exact-match the current visual component record against the compiled theme and ordered manifest; only the NOT READY handoff path is exempt so it can produce the physical-test candidate."
    },
    {
      "id": "F3",
      "correction": "Visual role assignment now invalidates visual state only; independent BCSTM state remains until its own source changes."
    },
    {
      "id": "F4",
      "correction": "The legacy fail-closed compiler consumes its retained compatibility parameters before throwing, restoring ESLint without re-enabling placeholder publication."
    }
  ],
  "verification": {
    "focused_red": "npm exec -- vitest run --config vitest.config.mts packages/theme-core/src/v2-authority.test.ts apps/studio/src/custom-authoring-v3.test.ts; exit 1; 2 files, 24 tests, 4 failed; output hash sha256:99f5ae3bce619c00eaf681ccfabf36e07f410c8effcef518253b1b5e3d9b8d23.",
    "focused_green": "npm exec -- vitest run --config vitest.config.mts packages/theme-core/src/v2-authority.test.ts apps/studio/src/custom-authoring-v3.test.ts; exit 0; 2 files, 24 tests passed; output hash sha256:3864512a954571d7e686db1f789ae582abd0336c23a1bf8a9898695a7c224337.",
    "full_unit": "npm test; exit 0; 43 files, 587 tests passed; output hash sha256:f7c8a5610f33108511dbf9d8a4660a40bd2d496d92d1ef7d73efecbe73102b68.",
    "typecheck": "npm run typecheck; exit 0; output hash sha256:69983ff3a0801362599ad8dcb3ac55e1b4cc54dede33a438786a83ed9bcf37c5.",
    "runtime": "npm run test:e2e -- --grep \"surfaces blocked diagnostics\"; exit 0; Vite builds, TypeScript, and 1 Electron Playwright test passed; output hash sha256:502e3da8087f5be4d727abbf45fc68abf45560237e26a6647c1b5b2a85265f0c.",
    "lint": "npm run lint; exit 0; output hash sha256:5e83d6112af6bf65b42edd81123c97aa746c43c0786207b8e707d63fa3d622fb.",
    "format": "npm run format:check; exit 0; output hash sha256:d699f1f9825b0c0e041bf82a0a2907d26662822813ecd60d04ac8cd2982cf109.",
    "diff_check": "git diff --check; exit 0 with empty output; wrapper output hash sha256:01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b.",
    "package": "npm run verify:package; exit 1. Packaging and ASAR verification completed, but packaged Playwright failed 2 existing receipt-less Custom-export assertions and skipped 2 later tests; output hash sha256:469831e9ae998d56cb1103f35a5eb0715d0270390d417a587ae91fd98aec9694."
  },
  "normalization": "Ran targeted Prettier --write on all six correction source/test paths before final check-only proofs.",
  "cleanup_evidence": "Removed the generated package out/ directory and Forge /tmp/jiti configuration file. No Electron or DSpico application process remained; the only matching persistent process was the CodeGraph MCP server. No /tmp/dspico-* runtime root remained.",
  "process_evidence": "No commit, stage, push, PR, worktree, dependency install, review start, attempt acquire, reset, or settle occurred. Unrelated renderer, right-dock, and E2E changes were not edited.",
  "authored_line_accounting": { "additions": 131, "deletions": 38, "total": 169, "maximum": 400 },
  "rollback_boundary": "Revert only apps/studio/src/custom-authoring-v3.ts, apps/studio/src/custom-authoring-v3.test.ts, apps/studio/src/main.ts, packages/theme-core/src/model-v2.ts, packages/theme-core/src/history-v3.ts, and the one lint-only statement in packages/dspico-contract/src/index.ts. This removes the F1-F4 correction without touching unrelated UI, right-dock, or E2E work.",
  "blocking_reason": "The mandated packaged acceptance suite still asserts that receipt-less Custom export is enabled and has zero diagnostics. Updating those unrelated uncommitted E2E assertions was outside this bounded correction and prohibited by the preservation constraint."
}
```

## Focused Remediation: Packaged E2E Receipt-Gate Alignment

```json
{
  "schema": "gentle-ai.remediation-result/v1",
  "change": "custom-assets-audio-authoring",
  "outcome": "failed",
  "work_unit": "Packaged E2E receipt-gate alignment",
  "failed_evidence_revision": "sha256:ec8f7f0e2fd8a219330ddb202dadf411a6b715eb4bc4c38673c78bba060b57c0",
  "lineage_id": "",
  "generation": 0,
  "fix_batch": 0,
  "attempt_token": "sha256:badee749ab4e9bf41edf338ad1fd3fc3977b7f67fc0b4db5eb04b06f7115e957",
  "attempt_authority": "Parent-acquired; this executor did not acquire, reset, settle, or otherwise mutate attempt authority.",
  "candidate_changed": true,
  "authored_changed_lines": 100,
  "evidence_revision": "sha256:15797ee2a2718bf682cfb1ef48c42f7922c784329a4cd37eb848cd4ef563626a",
  "evidence_schema": "gentle-ai.remediation-evidence/v1",
  "settlement": "Parent-owned; parent settlement must receive this failed result. Independent sdd-verify is blocked until a successful correction is produced."
}
```
```json
{
  "schema": "gentle-ai.remediation-evidence/v1",
  "change": "custom-assets-audio-authoring",
  "mode": "standard",
  "rdd_mode": "disabled/unmanaged",
  "work_unit": "Packaged E2E receipt-gate alignment",
  "failed_evidence_revision": "sha256:ec8f7f0e2fd8a219330ddb202dadf411a6b715eb4bc4c38673c78bba060b57c0",
  "lineage_id": "",
  "generation": 0,
  "fix_batch": 0,
  "attempt_token": "sha256:badee749ab4e9bf41edf338ad1fd3fc3977b7f67fc0b4db5eb04b06f7115e957",
  "evidence_revision": "sha256:15797ee2a2718bf682cfb1ef48c42f7922c784329a4cd37eb848cd4ef563626a",
  "correction": "The two authorized packaged E2E scenarios now prove receipt-less Custom export is blocked, persist an exact current visual compatibility record derived from the compiled candidate, reload the project, and prove export then enables. Existing visual and right-dock assertions remain intact.",
  "verification": {
    "red": "Prior npm run verify:package exit 1; packaged Playwright failed the two receipt-less Custom-export expectations; sha256:469831e9ae998d56cb1103f35a5eb0715d0270390d417a587ae91fd98aec9694.",
    "focused_green": "npm run test:e2e -- --grep \"completes the offline|owns the viewport\"; exit 0; 2 Electron tests passed; sha256:38b93b691396f1dee7b0810dbbdc999302b60adb21e3fadb663daa53aa565cc2.",
    "full_unit": "npm test; exit 0; 43 files, 587 tests passed; sha256:d755e1eceb95be92e0d563725fb3901c1fa0f88bd3c91ef4fd3b87546b04a418.",
    "typecheck": "npm run typecheck; exit 0; sha256:69983ff3a0801362599ad8dcb3ac55e1b4cc54dede33a438786a83ed9bcf37c5.",
    "full_electron": "npm run test:e2e; exit 1; 4 passed and 1 failed. The unassigned `publishes creator output as an equivalent folder and ZIP package` scenario still expects receipt-less export; sha256:01c5c0fb3a530a806a77bf3861b81b3651881e56a9b699a8864f46cbe3402b51.",
    "package": "npm run verify:package; exit 1; packaging and ASAR checks passed, then packaged Playwright failed the same unassigned scenario; sha256:c4c7dbf0bca1921de5be5d1bf8af50fd68bdb1ffb2880509f871d67dd61b8860.",
    "lint": "npm run lint; exit 0; sha256:5e83d6112af6bf65b42edd81123c97aa746c43c0786207b8e707d63fa3d622fb.",
    "format": "npm run format:check; exit 0; sha256:d699f1f9825b0c0e041bf82a0a2907d26662822813ecd60d04ac8cd2982cf109.",
    "diff_check": "git diff --check; exit 0 with empty output; wrapper hash sha256:01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b."
  },
  "normalization": "Ran targeted Prettier --write on the three changed E2E files before final check-only proofs.",
  "cleanup_evidence": "Removed generated out/ and Forge /tmp/jiti output. No Electron or DSpico application process remained; the only matching persistent process was the CodeGraph MCP server. No /tmp/dspico-* runtime root remained.",
  "process_evidence": "No commit, stage, push, PR, worktree, dependency install, review start, attempt acquire, reset, or settle occurred. F1-F4 production paths and unrelated existing E2E/UI edits were preserved.",
  "authored_line_accounting": { "additions": 81, "deletions": 19, "total": 100, "maximum": 100 },
  "rollback_boundary": "Revert only e2e/lifecycle.spec.ts, e2e/workspace-redesign.spec.ts, and e2e/visual-receipt.ts. This restores the two stale E2E assertions without touching F1-F4 production changes or unrelated test work.",
  "blocking_reason": "A third, unassigned E2E scenario in e2e/lifecycle.spec.ts still requires receipt-less Custom export. Correcting it exceeds the expressly authorized two-expectation scope."
}
```

## Focused Remediation: Final Lifecycle Receipt-Gate Alignment

```json
{
  "schema": "gentle-ai.remediation-result/v1",
  "change": "custom-assets-audio-authoring",
  "outcome": "passed",
  "work_unit": "Final lifecycle receipt-gate alignment",
  "failed_evidence_revision": "sha256:15797ee2a2718bf682cfb1ef48c42f7922c784329a4cd37eb848cd4ef563626a",
  "lineage_id": "",
  "generation": 0,
  "fix_batch": 0,
  "attempt_token": "sha256:d0d6e5641dd9585b8537ec9f619b694934ecf7b3631bd6baf10922533e68d601",
  "attempt_authority": "Parent-acquired; this executor did not acquire, reset, settle, or otherwise mutate attempt authority.",
  "candidate_changed": true,
  "authored_changed_lines": 33,
  "maximum_authored_changed_lines": 80,
  "evidence_revision": "sha256:56defbc9d7a52a02b0d2e87ff021c5175a59cd71519b9c1dadd3faf71ba7c7bc",
  "evidence_schema": "gentle-ai.remediation-evidence/v1",
  "settlement": "Parent-owned; this executor did not settle the attempt."
}
```

```json
{
  "schema": "gentle-ai.remediation-evidence/v1",
  "change": "custom-assets-audio-authoring",
  "mode": "standard",
  "rdd_mode": "disabled/unmanaged",
  "work_unit": "Final lifecycle receipt-gate alignment",
  "failed_evidence_revision": "sha256:15797ee2a2718bf682cfb1ef48c42f7922c784329a4cd37eb848cd4ef563626a",
  "lineage_id": "",
  "generation": 0,
  "fix_batch": 0,
  "attempt_token": "sha256:d0d6e5641dd9585b8537ec9f619b694934ecf7b3631bd6baf10922533e68d601",
  "evidence_revision": "sha256:56defbc9d7a52a02b0d2e87ff021c5175a59cd71519b9c1dadd3faf71ba7c7bc",
  "evidence_basis": "SHA-256 of the final e2e/lifecycle.spec.ts candidate.",
  "correction": "The final publication lifecycle scenario now proves receipt-less Custom export is blocked without output, certifies the exact current visual candidate before each intentionally successful export, restores the required editor selection after reopen, and rechecks blocking before its final folder/ZIP publication.",
  "verification": {
    "focused_red": "npm run test:e2e -- --grep \"publishes creator output as an equivalent folder and ZIP package\"; exit 1; Vite renderer/main builds and TypeScript passed, then the one Electron test failed at the stale receipt-less 0-diagnostics expectation.",
    "focused_green": "npm run test:e2e -- --grep \"publishes creator output as an equivalent folder and ZIP package\"; exit 0; Vite renderer/main builds and TypeScript passed, then 1 Electron test passed in 57.2 seconds.",
    "full_unit": "npm test; exit 0; 43 files and 587 tests passed.",
    "typecheck": "npm run typecheck; exit 0.",
    "full_electron": "npm run test:e2e; exit 0; 5 Electron tests passed in 2.0 minutes.",
    "package": "npm run verify:package; exit 0; Electron Forge packaged Linux x64, ASAR contents and packaged runtime verified, and packaged Playwright passed 5 tests in 1.9 minutes.",
    "lint": "npm run lint; exit 0.",
    "format": "npm run format:check; exit 0; all matched files use Prettier code style.",
    "diff_check": "git diff --check; exit 0."
  },
  "process_evidence": "No commit, stage, push, PR, worktree, dependency install, review start, attempt acquire, reset, or settle occurred. Existing F1-F4, earlier receipt-gate, UI, and unrelated worktree changes were preserved.",
  "authored_line_accounting": {
    "additions": 32,
    "deletions": 1,
    "total": 33,
    "maximum": 80
  },
  "rollback_boundary": "Revert only the final receipt-gate alignment hunks in e2e/lifecycle.spec.ts: the initial receipt-less publication block, the exact-current certifications before subsequent successful exports, editor-state restoration after certification, and the final pre-publication receipt check. Retain F1-F4 production changes, the earlier two receipt-gate E2E scenarios, visual-receipt.ts, and all unrelated work."
}
```

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `npm run test:e2e -- --grep "publishes creator output as an equivalent folder and ZIP package"` — exit 0; Vite renderer/main builds, TypeScript, and 1 Electron test passed. The same command was RED before the test update: exit 1 at the receipt-less `0 diagnostics` expectation. |
| Runtime harness | `npm run test:e2e` — exit 0; 5 Electron lifecycle/bootstrap/workspace tests passed. `npm run verify:package` — exit 0; packaged Playwright passed the same 5 tests after ASAR/runtime verification. |
| Rollback boundary | Revert only the final receipt-gate alignment hunks in `e2e/lifecycle.spec.ts`; they remove this scenario's receipt preconditions and preserve F1-F4, the previous two aligned scenarios, helper, and unrelated work. |

**Next recommended**: Parent may settle attempt `sha256:d0d6e5641dd9585b8537ec9f619b694934ecf7b3631bd6baf10922533e68d601`; after successful settlement, run independent `sdd-verify`.

## Focused Remediation: Visual Certification Save-Open Synchronization

```json
{
  "schema": "gentle-ai.remediation-result/v1",
  "change": "custom-assets-audio-authoring",
  "outcome": "passed",
  "work_unit": "Visual certification save-open synchronization",
  "failed_evidence_revision": "sha256:aeeae789818e8237e06e8b1184e7b45b4d637b05722b7ff51efe6adc8daa5adc",
  "lineage_id": "",
  "generation": 0,
  "fix_batch": 0,
  "attempt_token": "sha256:f96d8939e802e1d096d3f5a88536ca40a7529bf99e7caeeaca685ba9316e89f2",
  "attempt_authority": "Parent-acquired; this executor did not acquire, reset, settle, or otherwise mutate attempt authority.",
  "candidate_changed": true,
  "authored_changed_lines": 3,
  "maximum_authored_changed_lines": 80,
  "evidence_revision": "sha256:5fdf0b81bb995ace5a2bedcb1687ab28d6a84f55285fb598418c971216bf17a0",
  "evidence_schema": "gentle-ai.remediation-evidence/v1",
  "settlement": "Settlement-first routing: the parent must settle this supplied attempt before any independent verification; this executor did not settle it."
}
```

```json
{
  "schema": "gentle-ai.remediation-evidence/v1",
  "change": "custom-assets-audio-authoring",
  "mode": "standard",
  "rdd_mode": "disabled/unmanaged",
  "work_unit": "Visual certification save-open synchronization",
  "failed_evidence_revision": "sha256:aeeae789818e8237e06e8b1184e7b45b4d637b05722b7ff51efe6adc8daa5adc",
  "lineage_id": "",
  "generation": 0,
  "fix_batch": 0,
  "attempt_token": "sha256:f96d8939e802e1d096d3f5a88536ca40a7529bf99e7caeeaca685ba9316e89f2",
  "evidence_revision": "sha256:5fdf0b81bb995ace5a2bedcb1687ab28d6a84f55285fb598418c971216bf17a0",
  "evidence_basis": "SHA-256 of the corrected e2e/visual-receipt.ts candidate.",
  "correction": "certifyCurrentVisual now waits for the renderer's Project saved. status, which is emitted only after the app-owned save promise resolves, before opening the same project root. The project-root authority guard remains unchanged.",
  "verification": {
    "focused_red_attempt": "npm run test:e2e -- --grep \"completes the offline Material and Custom lifecycles through the hardened Electron boundary\" against the pre-correction helper; exit 0; 1 Electron test passed in 58.3 seconds. The known race did not reproduce in this isolated run, so no artificial delay, retry, or weakened authority check was introduced.",
    "focused_green": "npm run test:e2e -- --grep \"completes the offline Material and Custom lifecycles through the hardened Electron boundary\"; exit 0; Vite renderer/main builds and TypeScript passed; 1 Electron test passed in 58.5 seconds; output hash sha256:af467c8f4d6ffdfe62dc0cdf21b347300ad9c03c899949a3422edbf111dff71b.",
    "full_unit": "npm test; exit 0; 43 files and 587 tests passed; output hash sha256:f689461bbfc38854fc7d4abe95b6c58970b2df6ebac426a62c132c57420824a9.",
    "full_electron": "npm run test:e2e; exit 0; Vite renderer/main builds and TypeScript passed; 5 Electron tests passed in 2.3 minutes; output hash sha256:4cded5d28566fc9c8244580025fee26eea114ed965fc454f4d2e1b34546dc846.",
    "typecheck": "npm run typecheck; exit 0; output hash sha256:72c80d3430201f38652817084c3fb6264faa10d4a378295a605f184a8cc6686b.",
    "package": "npm run verify:package; exit 0; Electron Forge packaged Linux x64, ASAR contents and packaged runtime verified, and packaged Playwright passed 5 tests in 2.1 minutes; output hash sha256:7264825d971cae065ab9e4c3f00680926bb18913a25e096ce3cdda70d9ea08bf.",
    "lint": "npm run lint; exit 0; output hash sha256:b899a8869a4e19256e005f49a91e652e62ad5d9b98946586199a110c0085e7d3.",
    "format": "npm run format:check; exit 0; all matched files use Prettier code style; output hash sha256:d699f1f9825b0c0e041bf82a0a2907d26662822813ecd60d04ac8cd2982cf109.",
    "diff_check": "git diff --check; exit 0 with empty output; output hash sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855."
  },
  "cleanup_evidence": "After source and packaged Electron runs, the exact process probe found no Electron or DSPico application process; only the pre-existing CodeGraph MCP server remained. No /tmp/dspico-* root remained. The pre-existing ignored out/ directory and /tmp/jiti Forge configuration were retained rather than deleting unrelated state.",
  "process_evidence": "No commit, stage, push, PR, worktree, dependency install, RDD enablement, review start, attempt acquire, reset, or settle was performed. Existing right-dock, UI, E2E, and prior remediation edits were preserved.",
  "authored_line_accounting": { "additions": 2, "deletions": 1, "total": 3, "maximum": 80 },
  "rollback_boundary": "Revert only the expect import and Project saved. status assertion in e2e/visual-receipt.ts. This restores the prior helper timing without changing the project-root authority guard, production behavior, prior remediation, or unrelated UI/right-dock work.",
  "settlement_routing": "Parent-owned settlement first for sha256:f96d8939e802e1d096d3f5a88536ca40a7529bf99e7caeeaca685ba9316e89f2; only after successful settlement may independent sdd-verify run."
}
```

### Visual Certification Save-Open Synchronization Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `npm run test:e2e -- --grep "completes the offline Material and Custom lifecycles through the hardened Electron boundary"` — exit 0; Vite builds, TypeScript, and 1 Electron test passed in 58.5 seconds. The equivalent pre-correction attempt passed in 58.3 seconds, confirming the race was not deterministically reproducible in an isolated run. |
| Runtime harness | `npm run test:e2e` — exit 0; 5 Electron tests passed in 2.3 minutes. `npm run verify:package` — exit 0; package, ASAR, runtime, and 5 packaged Playwright tests passed in 2.1 minutes. |
| Rollback boundary | Revert only the two import/assertion hunks in `e2e/visual-receipt.ts`; retain the fail-closed project-root guard, all production code, previous remediation, and unrelated UI/right-dock work. |

**Next recommended**: Parent must settle attempt `sha256:f96d8939e802e1d096d3f5a88536ca40a7529bf99e7caeeaca685ba9316e89f2` first. Only after successful settlement may independent `sdd-verify` run.

## Focused Remediation: Complete Physical Handoff Runtime Proof

All original tasks remain 14/14 complete and unchanged. This adds only one Electron runtime scenario; all prior cumulative evidence above remains unchanged.

```json
{
  "schema": "gentle-ai.remediation-result/v1",
  "change": "custom-assets-audio-authoring",
  "outcome": "passed",
  "work_unit": "Complete physical handoff runtime proof",
  "failed_evidence_revision": "sha256:18f419fab4a081bab7f47ae8b8671cb1498241759379ce37f5150121a4c25391",
  "lineage_id": "",
  "generation": 0,
  "fix_batch": 0,
  "attempt_token": "sha256:411f279e491a2c24c7a7105dc5cab0530cac27673c09269123948e5a96d71cb7",
  "attempt_authority": "Parent-acquired; this executor did not acquire, reset, settle, or otherwise mutate attempt authority.",
  "candidate_changed": true,
  "authored_changed_lines": 152,
  "maximum_authored_changed_lines": 160,
  "evidence_revision": "sha256:f50e41a48246629ef2b85d8b345174f9faf8b2b011debe9d6f75258c7f8f96f7",
  "evidence_schema": "gentle-ai.remediation-evidence/v1",
  "settlement": "Settlement-first routing: the parent must settle this supplied attempt before independent verification; this executor did not settle it."
}
```

```json
{
  "schema": "gentle-ai.remediation-evidence/v1",
  "change": "custom-assets-audio-authoring",
  "mode": "standard",
  "rdd_mode": "disabled/unmanaged",
  "work_unit": "Complete physical handoff runtime proof",
  "failed_evidence_revision": "sha256:18f419fab4a081bab7f47ae8b8671cb1498241759379ce37f5150121a4c25391",
  "lineage_id": "",
  "generation": 0,
  "fix_batch": 0,
  "attempt_token": "sha256:411f279e491a2c24c7a7105dc5cab0530cac27673c09269123948e5a96d71cb7",
  "evidence_revision": "sha256:f50e41a48246629ef2b85d8b345174f9faf8b2b011debe9d6f75258c7f8f96f7",
  "evidence_basis": "SHA-256 of e2e/handoff.spec.ts, the sole authored runtime-proof file.",
  "correction": "One source Electron scenario creates a seven-role Custom candidate with Navigation WAV and omitted Launch WAV, reopens the saved project, invokes trusted handoff IPC, and reads the AtomicHandoffWriter output. It proves exact profile/composite target identity, visual and report byte/hash manifest, WAV inclusion/omission, NOT READY metadata and instructions, folder-only output, and receipt-less export blocking with an empty ordinary-export directory.",
  "verification": {
    "focused_red": "npm run test:e2e -- --grep \"creates a complete physical-test handoff through the Electron writer\"; exit 1; the first authored test timed out waiting for its unopened Project drawer, so this was a harness-setup RED rather than a production defect. No production code or assertion was weakened.",
    "focused_green": "npm run test:e2e -- --grep \"creates a complete physical-test handoff through the Electron writer\"; exit 0; Vite renderer/main builds, TypeScript, and 1 Electron Playwright test passed; output hash sha256:be53f1b6fde38f8ed2fb8d2b1eef7927abc173973d5906ef8d1164caf8dac2a0.",
    "full_unit": "npm test; exit 0; 43 files and 587 tests passed; output hash sha256:112b7b1f4ac952a10ac1ab913aab55eeba53598c43a1b53a7d0736d4cc67ccc1.",
    "full_electron": "npm run test:e2e; exit 0; 6 Electron Playwright tests passed in 2.0 minutes; output hash sha256:04bffbb17cc36dabdc8ddb405a373ac5ba79f642e69a8c54e474344554278390.",
    "typecheck": "npm run typecheck; exit 0; output hash sha256:72c80d3430201f38652817084c3fb6264faa10d4a378295a605f184a8cc6686b.",
    "package": "npm run verify:package; exit 0; Forge packaged Linux x64, ASAR/runtime verification passed, and packaged Playwright passed 6 tests in 2.0 minutes; output hash sha256:a41b3b53ff5b5cb5a5f87d5aba2048f0f6d488411c9e7ff4d0d3e724cd986201.",
    "lint": "npm run lint; exit 0; output hash sha256:b899a8869a4e19256e005f49a91e652e62ad5d9b98946586199a110c0085e7d3.",
    "format": "npm run format:check; exit 0; output hash sha256:d699f1f9825b0c0e041bf82a0a2907d26662822813ecd60d04ac8cd2982cf109.",
    "diff_check": "git diff --check; exit 0 with empty output; output hash sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855."
  },
  "cleanup_evidence": "Every source and packaged Electron test closed its application and removed its temporary root. Final probes found no /tmp/dspico-handoff-e2e-*, /tmp/dspico-studio-e2e-*, or /tmp/dspico-publication-e2e-* roots and no DSPico/Electron application process; the pre-existing CodeGraph MCP server and ignored out/ package directory were retained.",
  "process_evidence": "No production behavior, task checkbox, verify report, commit, stage, push, PR, worktree, dependency install, RDD enablement, review action, attempt acquire, reset, or settlement was performed. All prior remediation and unrelated working-tree edits were preserved.",
  "authored_line_accounting": { "additions": 152, "deletions": 0, "total": 152, "maximum": 160 },
  "rollback_boundary": "Delete only e2e/handoff.spec.ts. This removes the runtime proof without altering handoff composition/writer behavior, ordinary export behavior, existing lifecycle tests, prior remediation, or unrelated UI work.",
  "settlement_routing": "Parent-owned settlement first for sha256:411f279e491a2c24c7a7105dc5cab0530cac27673c09269123948e5a96d71cb7; only after successful settlement may independent sdd-verify run."
}
```

### Complete Physical Handoff Runtime Proof Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `npm run test:e2e -- --grep "creates a complete physical-test handoff through the Electron writer"` — exit 0; Vite builds, TypeScript, and 1 Electron test passed. The first new-test run exited 1 because the test had not opened the Project drawer; this harness RED was corrected without production changes or weaker assertions. |
| Runtime harness | `npm run test:e2e` — exit 0; 6 Electron tests passed. `npm run verify:package` — exit 0; Forge/ASAR/runtime verification and 6 packaged Electron tests passed. |
| Rollback boundary | Delete only `e2e/handoff.spec.ts`; retain all production, existing E2E, prior remediation, and unrelated working-tree changes. |

**Next recommended**: Parent must settle attempt `sha256:411f279e491a2c24c7a7105dc5cab0530cac27673c09269123948e5a96d71cb7` first. Only after successful settlement may independent `sdd-verify` run.
