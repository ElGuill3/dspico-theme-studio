# Tasks: DSpico Theme Studio MVP

## Review Workload Forecast

Estimated changed lines: 900–1,300
Delivery strategy: auto-chain
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | PR | Test | Runtime | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Workspace/contracts/fixtures | 1 | `pnpm test --filter test-fixtures` | `pnpm typecheck` | Bootstrap/fixtures |
| 2 | Core schemas/history | 2 | `pnpm test --filter theme-core` | N/A: pure package | `packages/theme-core` |
| 3 | Profile/diagnostics | 3 | `pnpm test --filter dspico-contract` | N/A: pure package | `packages/dspico-contract` |
| 4 | Persistence/recovery | 4 | `pnpm test --filter studio-main` | Interrupted-save scenario | Store |
| 5 | Secure IPC/UI | 5 | `pnpm test --filter studio` | `pnpm start` offline | Main/preload/renderer |
| 6 | Preview fidelity | 6 | `pnpm test --filter studio` | `pnpm start` preview | Preview |
| 7 | Export/E2E proof | 7 | `pnpm test:e2e` | Offline export | Exporter/E2E/docs |

## Phase 1: Bootstrap, Contracts, Fixtures

- [x] 1.1 Create `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, and `test`, `typecheck`, `lint`, `format:check`, `test:e2e`, `start`, `package` scripts.
- [x] 1.2 RED: fixture tests cover relative/absolute equivalence, hostile/non-repo, dirty, and wrong-HEAD inputs; require shell-free, read-only, write-nothing behavior.
- [x] 1.3 Capture fixtures from `/home/guill3/Documents/Hobbies/dspico/pico-launcher` at immutable commit `f3ae63279ab72bc6c83124c752ec79f3247db437`, never mutating it; cite `docs/Themes.md`, `arm9/source/themes/ThemeInfoFactory.thumb.cpp`, `arm9/source/themes/LaunchTransitionStyle.h`, `arm9/source/themes/material/MaterialColorSchemeFactory.cpp`, and `/_pico/themes/material/theme.json`; add `DiagnosticV1`/`ReportV1`.

## Phase 2: Pure Authoring Core

- [x] 2.1 RED: create/save/reopen, newer refusal, metadata/token/scene/ack replay, scoped isolation, undo branching, and interrupted-save recovery.
- [x] 2.2 Implement `formatVersion: 1` models/migrations, serializable operations, replay, bounded snapshots (20 cadence; 10/200 retention), acknowledgments, and deterministic state; exclude UI/clock/random/AI.

## Phase 3: Profile and Diagnostics

- [x] 3.1 RED: valid evidence, empty/malformed/non-Material/newer/unavailable values, RGB/boolean/ranges, defaults `100/12/14`, warning acknowledgment, stale fingerprints, and ordering.
- [x] 3.2 Implement pinned `dspico-launcher-v1` validation, strict errors/warnings/suggestions, canonical fingerprints, and export gates; reject permissive Custom fallback.

## Phase 4: Persistence and Trust Boundary

- [x] 4.1 RED: test fsync/journal/temp-rename interruption, orphan reporting, path/symlink escapes, and unknown-format refusal without writes.
- [x] 4.2 Implement main-owned `ProjectStore`, dialogs, export adapters, atomic recovery, sender/session/frame/origin checks, `sandbox:true`, isolation, no Node integration, CSP, allowlisted `app://studio`, and denied navigation/popups/webviews/external URLs.
- [x] 4.3 RED: assert `Renderer→Preload→Main validation→Store/Core→atomic commit→Preload→Renderer` and `Main→Contract→Writer→receipt` sequences.
- [x] 4.4 Implement narrow typed preload IPC and React authoring flow exposing only offline Material/local project/export actions.

## Phase 5: Preview

- [x] 5.1 RED: test interactive 256×192 top/bottom scenes, mode-scoped overrides, representative content, backed/approximate labels, and no DS-parity claims or export gating.
- [x] 5.2 Implement `PreviewModel` with public `top`/`bottom` terminology and `launcher-vector-backed`/`Chromium approximation` labels.

## Phase 6: Export and Verification

- [x] 6.1 RED: test folder/ZIP parity, error/unacknowledged-warning blocking, repeated byte identity, unsafe destinations, symlink escapes, and interrupted-output rollback.
- [x] 6.2 Implement RFC 8785 JSON, ordered paths, SHA-256, level-0 fflate metadata, `theme.json`/`report.json`, provenance/diagnostics/credits/licenses, staged verify/swap, and rollback.
- [x] 6.3 Add Playwright E2E for offline create→edit→undo/redo→save/reopen→diagnose→preview→folder/ZIP export, capability/CSP denials, and receipt/hash assertions; document MVP scope.
