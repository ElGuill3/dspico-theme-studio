# Tasks: Custom Assets and Audio Authoring

## Review Workload Forecast

Estimated changed lines: 2,200–3,000
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Focused test command | Runtime/package/hardware procedure | Rollback boundary |
|---|---|---|---|---|
| PR 1 | Profile/evidence | `pnpm exec vitest run --config vitest.config.mts packages/test-fixtures/src/capture.test.ts packages/dspico-contract/src/profile-v1-3.test.ts` | `pnpm typecheck`; verify pinned commit/WAV SHA; no hardware claim | Revert profile/evidence; retain capture gate |
| PR 2 | V3 media/store | `pnpm exec vitest run --config vitest.config.mts packages/theme-core/src/{migration-v3.test.ts,media-authoring-v3.test.ts}` | `pnpm start`; migrate V1/V2/parity via Save migrated copy; N/A | Revert V3/store; retain readers/source bytes |
| PR 3 | Seven visuals | `pnpm exec vitest run --config vitest.config.mts packages/dspico-contract/src/{codecs-v1-3.test.ts,custom-compiler-v1.test.ts}` | `pnpm start`; assign seven PNGs, inspect 12 outputs; hardware N/A | Remove visual codecs/editor; restore Custom block |
| PR 4 | WAV DSP/audition | `pnpm exec vitest run --config vitest.config.mts packages/dspico-contract/src/theme-sounds-v1.test.ts` | `pnpm start`; prepare/play with `Desktop audition`; no cartridge claim | Remove WAV contract/workbench; sounds unavailable |
| PR 5 | Handoff/receipts | `pnpm exec vitest run --config vitest.config.mts packages/dspico-contract/src/receipts-v1.test.ts apps/studio/src/{handoff-writer.test.ts,receipt-registry.test.ts}` | `pnpm start`; cartridge-test handoff, visual test, receipt fields; no ZIP | Remove handoff/registry; export remains blocked |
| PR 6 | Publication/export | `pnpm test && pnpm typecheck && pnpm verify:package` | `pnpm start`; compare folder/ZIP manifests/checksums; N/A | Revert gates/wiring; restore fail-closed export |
| PR 7 | BCSTM | `pnpm exec vitest run --config vitest.config.mts packages/dspico-contract/src/bcstm-v1-3.test.ts` | `pnpm start`; one BGM cartridge test and source-hash receipt; no audition | Remove BCSTM wiring; BGM unavailable |

## Phase 1: Profile and Portable Foundation

- [x] 1.1 RED: `packages/test-fixtures/src/capture.test.ts` covers `git -C`/relative/absolute/moved paths, dirty/staged/`commit -a`/empty-index state, wrong HEAD/tag, root/hash drift, missing evidence; fail before reads.
- [x] 1.2 GREEN: Create `packages/dspico-contract/src/profile-v1-3.ts`, `packages/test-fixtures/src/composite-profile-v1.ts`, and capability JSON; bind commit `b087565651c83081dd65552863f5efc2f28e489c`, Linux x64, target SHA without fallback.
- [x] 1.3 RED: `packages/theme-core/src/{media-authoring-v3.test.ts,migration-v3.test.ts}` and `apps/studio/src/{project-file-session.test.ts,portable-project-store.test.ts}` cover V1/V2/parity, role confirmation, quarantine, and save-as.
- [x] 1.4 GREEN: Create `packages/theme-core/src/{model-v3.ts,history-v3.ts,migration-v3.ts,render-plan-v3.ts}`; update `packages/theme-core/src/index.ts` and `apps/studio/src/{portable-project-store.ts,project-file-session.ts,png-import.ts}` for atomic V3 save-as.

## Phase 2: Visual, Audio, and Evidence Components

- [x] 2.1 RED: `packages/dspico-contract/src/{codecs-v1-3.test.ts,custom-compiler-v1.test.ts}` and `e2e/lifecycle.spec.ts` cover seven roles, 12 files/230,496 bytes, locked palettes, hashes, and post-codec labels.
- [x] 2.2 GREEN: Create `packages/dspico-contract/src/{custom-v1-3.ts,codecs-v1-3.ts}`; update `packages/theme-core/src/{render-plan-v3.ts,index.ts}` and renderer `custom-asset-bench.tsx`, `custom-output-rail.tsx`, `workspace/workspace-model.ts`, `studio.css`.
- [x] 2.3 RED: `packages/dspico-contract/src/theme-sounds-v1.test.ts` and `e2e/lifecycle.spec.ts` cover DSP determinism, rejection, reopen, omission, and `Desktop audition`.
- [x] 2.4 GREEN: Create `packages/dspico-contract/src/theme-sounds-v1.ts`; wire `apps/studio/src/renderer/audio-workbench.tsx`, `renderer/renderer.tsx`, `studio-ipc.ts`, `preload.ts` to prepared PCM.

## Phase 3: Handoff, Publication, and Dependent BCSTM

- [x] 3.1 RED: `packages/dspico-contract/src/receipts-v1.test.ts`, `apps/studio/src/{handoff-writer.test.ts,receipt-registry.test.ts,studio-ipc.test.ts}` cover exact reuse, staleness, not-ready separation, and no preflight writes.
- [x] 3.2 GREEN: Create `packages/dspico-contract/src/receipts-v1.ts`, `apps/studio/src/{handoff-writer.ts,receipt-registry.ts}`; update `main.ts`, `studio-ipc.ts`, `preload.ts` for atomic folder-only handoff.
- [x] 3.3 RED: `apps/studio/src/{export-writer.test.ts,studio-ipc.test.ts}` and `e2e/lifecycle.spec.ts` cover blocked/complete publication, equivalent checksums, evidence kinds, and zero partial output.
- [x] 3.4 GREEN: Update `apps/studio/src/{export-writer.ts,main.ts,studio-ipc.ts,preload.ts}` and renderer gates; run `pnpm verify:package`.
- [x] 3.5 RED: `packages/dspico-contract/src/bcstm-v1-3.test.ts` and `e2e/lifecycle.spec.ts` cover pre-receipt blocking, one pass-through source, malformed/second-source rejection, and no audition/conversion claim.
- [x] 3.6 GREEN: Create/update `packages/dspico-contract/src/{bcstm-v1-3.ts,index.ts}` and `apps/studio/src/{renderer/audio-workbench.tsx,studio-ipc.ts,preload.ts}` for one BGM at `/_pico/themes/<theme>/bgm/`.
