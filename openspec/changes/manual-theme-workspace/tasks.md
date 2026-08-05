# Tasks: Manual Theme Workspace

One unit maps to one reviewable commit/future chained PR; estimates include focused tests.

## Suggested Work Units

| Unit | Start → finish; forecast paths | Lines/risk | Focused evidence; runtime harness | Rollback boundary |
|---|---|---:|---|---|
| 0 | Dirty baseline → recorded exact SHA; repo-wide | 0/L | `git status`, `git diff --stat`; N/A checkpoint | Block apply; no feature rollback |
| 1 | V2 types/history/migration → replay/save tests; `theme-core` | 360/H | `pnpm --filter theme-core test`; N/A core | Disable V2; retain V1 |
| 2 | Bundle/asset transaction → copy/crash/corruption tests; `theme-core`, studio store | 350/H | theme-core + store tests; N/A filesystem harness | Remove bundle adapter; keep V1 files |
| 3 | PNG/rights IPC → hostile-boundary tests; studio/core | 380/H | `pnpm test -- apps/studio/src/studio-ipc.test.ts`; N/A IPC harness | Disable PNG import; preserve projects |
| 4 | Read-only workspace → DOM/Canvas tests; `renderer/workspace`, `renderer.tsx` | 300/M | renderer tests; Electron scaffold scenario | Remove workspace route; keep preview |
| 5 | Add/select/move → one-op Undo/Redo/save/reopen; workspace/core | 370/H | workspace/core tests; Electron drag scenario | Disable Custom editing; retain read-only view |
| 6 | Layer controls → keyboard-equivalent tests; workspace/core | 350/H | focused Vitest; Electron assistive-tree scenario | Revert controls; retain layers |
| 7 | Resize/crop/properties → Q16 golden tests; core/workspace | 380/H | theme-core goldens; N/A deterministic raster | Disable resize/crop; retain translation |
| 8 | Shared render plan/overlays → isolation tests; core/preview/renderer | 360/H | core + `pnpm test:e2e -- e2e/lifecycle.spec.ts`; packaged preview scenario | Remove Custom preview path; retain V1 preview |
| 9 | Nested validation/profile → diagnostics tests; `dspico-contract` | 300/M | contract tests; N/A pure validation | Disable Custom validation/export |
| 10 | 15bpp compiler → byte/golden tests; contract/fixtures | 370/H | contract + fixture tests; N/A pure compiler | Disable compiler; retain Material export |
| 11 | Folder/ZIP/report → determinism/rights tests; contract/studio | 370/H | export tests; packaged export scenario | Disable Custom export; preserve source |
| 12 | Later-slot exclusions → full acceptance/archive readiness; e2e/scripts | 300/M | `pnpm test:e2e`, `pnpm package`; packaged BrowserWindow scenario | Revert acceptance/wiring only |

## Phase 0: Baseline Gate
- [x] 0.1 Recognize the recorded baseline implementation checkpoint `8c5cff63ca8a251fb7b384e05b221b506474933`; clean planning HEAD is `3b0e69bd393de094d8d674dacf63670aed6b3cea`. No commit is created in this apply slice.

## Phase 1: V2 Authority
- [x] 1.1 RED: test exact V1 operation migration, identities, nested transitions, refusal, full redo, and untouched source bytes.
- [x] 1.2 Add V2 schema/replay/history and Save-preserves-redo in `packages/theme-core/src`; keep V1 lifecycle authoritative.

## Phase 2: Assets and Security
- [x] 2.1 RED: test absolute/parent/backslash/symlink paths, crash phases, missing/mismatched assets, and reachability retention.
- [x] 2.2 Add portable transaction recovery and immutable SHA-256 asset store in `apps/studio/src` and `packages/theme-core/src`.
- [x] 3.1 RED: test forged sender, raw-path/network/converter requests, invalid/oversized PNGs, CRC/APNG/critical chunks, and rights refusal.
- [x] 3.2 Add main-owned PNG decode/import IPC, normalization, provenance, and rights in `apps/studio/src`.

## Phase 3: Workspace
- [ ] 4.1 RED: test navigation/CSP denial and `aria-hidden`/pointer-inert preview chrome before renderer wiring.
- [ ] 4.2 Scaffold read-only dual/focus 256×192 Canvas surfaces and independent DOM controls under `apps/studio/src/renderer/workspace`.
- [ ] 5.1 RED then implement one add/select/move semantic gesture with save/reopen and Undo/Redo evidence.
- [ ] 6.1 RED then implement visibility/name/delete/z-order plus keyboard equivalence and announcements.
- [ ] 7.1 RED then implement axis-aligned resize/crop/properties with deterministic Q16 validation and goldens.

## Phase 4: Shared Preview and Delivery
- [ ] 8.1 RED then wire the pure shared render plan; keep Coverflow/Banner overlays preview-only and local.
- [ ] 9.1 RED then add nested transition/profile/Custom validation, deterministic diagnostics, acknowledgments, and later-slot rejection.
- [ ] 10.1 RED then add deterministic RGBA8→15bpp compiler, clipping, alpha, quantization, and lineage fixtures.
- [ ] 11.1 RED then add deterministic Custom folder/ZIP/report/provenance export and no-partial-commit behavior.
- [ ] 12.1 RED: hostile repository/state fixture tests; then add allowlisted `git -C`/`shell:false` capture and `scripts/verify-package.mjs` acceptance.
- [ ] 12.2 Run cross-slice unit/property/integration/Electron/packaged evidence; confirm exclusions, rollback readiness, untouched V1, and archive handoff.

## Review Workload Forecast

Estimated changed lines per autonomous slice: 0, 360, 350, 380, 300, 370, 350, 380, 360, 300, 370, 370, 300.

400-line budget risk: High
Chained PRs recommended: Yes
Decision needed before apply: No
Chain strategy: stacked-to-main — selected by orchestration for this auto-chain.

The baseline checkpoint is mandatory because new slices must not mix with the current 1,700+ line uncommitted identity-authoring/DSi/overlay/draft-authority/package work or make rollback ambiguous. Auto-chain removes the user decision gate, and orchestration selected stacked-to-main before apply.
