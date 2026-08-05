# Apply Progress: Units 1–3 — V2 Authority, Portable Assets, and PNG/rights IPC

## Status

- Change: `manual-theme-workspace`
- Work unit: `unit-3-png-rights-ipc` (parent: `unit-2-portable-assets`).
- Mode: Standard (Strict TDD disabled); Unit 3 uses behavior-first RED tests.
- Delivery: auto-chain, stacked-to-main; baseline `8c5cff63ca8a251fb7b384e05b221b506474933` recognized.
- Native authorization: Units 1–3 used parent-retained proceed tokens; child executors did not acquire, settle, or reset native attempts.
- Scope: 0.1, 1.1, 1.2, 2.1, 2.2, 3.1, and 3.2. Unit 4+ remains outside this slice.
- Delivered checkpoints: Unit 1 used 375 / 400 authored lines and Unit 2 used 265 / 400. Current Unit 3 uses 391 / 400 authored additions+deletions versus `1ff6fa2` (31-line correction record remains separate).

## Completed

- [x] 0.1 Baseline implementation checkpoint recorded; clean planning HEAD was `3b0e69bd393de094d8d674dacf63670aed6b3cea`.
- [x] 1.1 V1 migration RED coverage for identities, nested transitions/defaults/conflicts/refusals, redo, and source immutability.
- [x] 1.2 Pure V2 model, replay/history, migration, source hash, and redo-preserving Save.

## Test-only remediation

- Added direct assertions for non-transition token and acknowledgment payloads, equal root/nested transitions, and migration notices.
- Added direct assertions for base revision, snapshot revisions/content, Save no-append/no-cursor movement, redo tails, and snapshot preservation.
- Added repeated migration/canonical byte/hash determinism and object-source nested array/map immutability coverage.
- Production source files were not changed.

## Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test | `./node_modules/.bin/vitest run --config vitest.config.mts packages/theme-core/src` — exit 0; 2 files, 20 tests passed. |
| Typecheck | `./node_modules/.bin/tsc -p tsconfig.base.json --noEmit` — exit 0. |
| Formatter | Prettier ran on `packages/theme-core/src/v2-authority.test.ts`; unchanged after formatting. |
| Diff check | `git diff --check` — exit 0. |
| Runtime harness | N/A — pure `theme-core` authority has no Electron, IPC, filesystem, Canvas, or renderer boundary. |
| Rollback boundary | Revert only the remediation additions in `v2-authority.test.ts` and this progress evidence; no production behavior or prior Unit 1 history is removed. |

## Unit 2 — Portable bundle and immutable asset transaction

- [x] 2.1 Behavior-first RED coverage for hostile paths, symlink escapes, crash phases, missing/corrupt assets, orphan reporting, and retained reachability.
- [x] 2.2 Added `PortableProjectStore` and the pure `reachableAssetHashes`/reference helpers; V1 `ProjectStore` remains unchanged.
- Bundle authority is root `project.json`; assets are immutable `assets/sha256/<lowercase-sha256>.png` bytes, with `.studio/staging`, journal phases, and recovery decisions.
- Failed pre-placement transactions preserve prior JSON authority; placed durable orphans and stale sidecars are reported, never garbage-collected or silently replaced.

## Unit 2 Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused tests | `./node_modules/.bin/vitest run --config vitest.config.mts apps/studio/src/portable-project-store.test.ts packages/theme-core/src/v2-authority.test.ts` — exit 0; 2 files, 20 tests passed. |
| Runtime harness | Same filesystem integration suite — exit 0; 11 portable-store scenarios exercised temp bundles, copy/reopen, symlink/path threats, dedupe, four bounded crash checkpoints, recovery idempotence, and cleanup. |
| Typecheck | `./node_modules/.bin/tsc -p tsconfig.base.json --noEmit` — exit 0. |
| Formatter | Prettier check on changed TypeScript files — passed. |
| Diff check | `git diff --check` — exit 0. |
| Rollback boundary | Remove `portable-project-store.ts`, its focused test, and the Unit 2 reachability additions; retain Unit 1 V2 authority and V1 `ProjectStore`. |

## Unit 2 delivery notes

- Behavior-first RED was observed: the focused suite first failed because `portable-project-store.js` did not exist, then passed after implementation.
- At the Unit 2 checkpoint, PNG parsing, dimensions, provenance, IPC, renderer, compiler, export, and dependency work were outside that remediation; current Unit 3 evidence follows below.

## Next recommendation

- Unit 3 is complete and awaits parent-controlled scoped delivery validation; after delivery, the native dispatcher continues with Unit 4 through `apply`.

## Verification Notes

- No commit, push, PR, RDD, or review lifecycle was invoked.
- Tasks 0.1 through 3.2 are checked; prior Unit 1–2 history and rollback records are preserved.

## Focused remediation — Unit 2 durability/recovery

- Delivery remains `auto-chain` with `stacked-to-main`; this remediation is limited to Unit 2 and is capped at 200 changed lines.
- Remediation delta: 48 authored changed lines (20 source/test lines plus 28 additive progress/evidence lines); that earlier correction was limited to Unit 2, and current Unit 3 evidence follows below.
- Recovery no longer writes `.studio/recovery.json`; recovery decisions remain report-only through the existing `BundleOpen` diagnostics/orphans result.
- Newly created bundle directories and journal entries fsync their parent directory before asset placement; atomic temp write/fsync/rename ordering remains intact.
- Direct evidence now covers `project-placed`, `root-synced`, and `committed`, moved absolute roots with relative refs, identical-byte deduplication, and all retained replay/current/snapshot references.

### Remediation Work Unit Evidence

| Evidence | Result |
|---|---|
| Behavior-first RED | `./node_modules/.bin/vitest run --config vitest.config.mts apps/studio/src/portable-project-store.test.ts` — exit 1; 5 of 14 checkpoint cases failed on the pre-fix recovery sidecar assertion. |
| Focused tests | `./node_modules/.bin/vitest run --config vitest.config.mts apps/studio/src/portable-project-store.test.ts packages/theme-core/src/v2-authority.test.ts` — exit 0; 2 files, 23 tests passed. |
| Runtime harness | Same focused filesystem suite — exit 0; 14 portable-store scenarios covered path safety, seven crash checkpoints, recovery repeatability, move/reopen, dedupe, reachability, and cleanup. |
| Typecheck | `./node_modules/.bin/tsc -p tsconfig.base.json --noEmit` — exit 0. |
| Normalization/format | Prettier `--write` normalization completed; targeted Prettier `--check` passed. |
| Diff check | `git diff --check` — exit 0. |
| Cleanup/process evidence | No `/tmp/dspico-bundle-*` harnesses and no focused Vitest/tsc/pnpm processes remained after verification. |
| Rollback boundary | Revert only the remediation hunks in `apps/studio/src/portable-project-store.ts`, `apps/studio/src/portable-project-store.test.ts`, and this appended evidence; retain prior Unit 2/Unit 1 work. |
| Safe evidence revision | `sha256:3712cc7a14f1f4efc143ebbf06999f678b1901ca25a5a83d9c4fa8d58a01de21` (normalized portable-store/test/helper snapshot). |

### Remediation handoff

- No commit, stage, push, review, RDD, native-token settlement, or runtime reset was performed.
- The parent-controlled verification/delivery handoff was the next step at that checkpoint; current Unit 3 evidence follows and Unit 4 remains outside this slice.

## Maintainer-authorized final correction — Unit 2

- Scope: source-mutating Prettier normalization and retained-state reachability test only; no production semantics changed; current Unit 3 product semantics are documented below.
- Correction delta: 91 authored changed lines (+88 / -3) from the pre-correction candidate; within the 100-line cap.
- Final five-path candidate accounting versus HEAD: 265 authored changed lines (254 additions + 11 deletions).
- Reachability evidence: exact equality now covers unique initial, replay, current, undo, redo, and snapshot asset hashes.
- Focused evidence: Prettier check, Vitest (2 files/23 tests), typecheck, and `git diff --check` all exit 0.
- Runtime harness: focused filesystem suite exit 0; temporary roots cleaned and no focused Vitest/tsc/pnpm processes remain.
- Safe evidence revision: `sha256:1ceeb6ac55950d002f4baf859c0d415741642aa6bb64b0545256e2589efc999c` (path-delimited hash of the three normalized Unit 2 TypeScript files).
- Handoff: parent-controlled Unit 2 verification/delivery; no stage, commit, push, review, native-token operation, or reset.
## Unit 3 — PNG/rights IPC
- [x] 3.1 RED coverage for forged senders, privileged primitives, bounded PNG structure, and rights refusal; [x] 3.2 main-owned RGBA8 PNG import IPC with deterministic normalization, provenance, and reference-only rights state.
- Main selects and reads the PNG; renderer receives only approved provenance, pixels, dimensions, hash, and policy identity; exact IPC keys deny raw paths, network fetches, converters, and renderer-supplied source paths.
- Design deviation: design pins `pngjs@7.0.0`; implementation uses built-in `node:zlib` plus a strict local parser because the initialized workspace had no PNG dependency. No dependency was added to avoid unverified install/runtime drift; the tradeoff is Node/Electron-specific inflate and local parser maintenance, so browser/shared-core reuse needs a deliberate compatibility decision. RGBA8 output remains pinned.
### Unit 3 Work Unit Evidence
| Evidence | Result |
|---|---|
| Tests and quality | RED failed on the missing importer/permissive payloads; focused `./node_modules/.bin/vitest run --config vitest.config.mts apps/studio/src/png-import.test.ts apps/studio/src/studio-ipc.test.ts` passed 2 files/26 tests; full Vitest passed 12 files/111 tests; `./node_modules/.bin/tsc -p tsconfig.base.json --noEmit`, Prettier `--check`, and `git diff --check` passed. |
| Runtime harness | `./node_modules/.bin/vite build --config vite.e2e.config.mts && ./node_modules/.bin/vite build --config vite.e2e.main.config.mts && ./node_modules/.bin/tsc -p tsconfig.base.json --noEmit && ./node_modules/.bin/playwright test e2e/lifecycle.spec.ts` — exit 0; 1 passed. A `node --input-type=module -e` bounded temp-root 1×1 RGBA8 PNG-import harness also exited 0 with `UNIT3_ELECTRON_PNG_IMPORT_PASS`; BrowserWindow/preload/IPC/e2e-root filesystem and main-owned PNG read/decode paths were exercised. |
| Cleanup, rollback, and handoff | Temporary roots and Vitest/tsc/Playwright/Electron processes were absent after runs; exact current candidate accounting versus `1ff6fa2` is 391 / 400 authored additions+deletions; rollback is `png-import.ts`/test plus Unit 3 main/preload/IPC/e2e hunks, retaining Units 1–2; safe evidence revision is `sha256:97276dbc512f525c62438d6cfbfabc4e69693b917a8bd2fe5e64ecb5b5bdc5b6` over seven implementation/test paths; tasks 3.1–3.2 route to scoped delivery validation, then dispatcher `apply`, with no Unit 4/native-token/stage/commit/push/review operation. |
- Bounded correction evidence: RED `./node_modules/.bin/vitest run --config vitest.config.mts apps/studio/src/studio-ipc.test.ts -t "filesystem path nested"` exited 1 with the importer reached; GREEN focused IPC/PNG `./node_modules/.bin/vitest run --config vitest.config.mts apps/studio/src/studio-ipc.test.ts apps/studio/src/png-import.test.ts` exited 0 with 2 files/27 tests; Electron `./node_modules/.bin/vite build --config vite.e2e.config.mts && ./node_modules/.bin/vite build --config vite.e2e.main.config.mts && ./node_modules/.bin/tsc -p tsconfig.base.json --noEmit && ./node_modules/.bin/playwright test e2e/lifecycle.spec.ts` exited 0 with 1 passed, exercising valid PNG import and oversized selected-source rejection; check-only Prettier/typecheck/diff/eslint exited 0; 31 authored changed lines from the current candidate (28 implementation/test/e2e plus 3 progress-evidence lines), paths `apps/studio/src/main.ts`, `apps/studio/src/studio-ipc.ts`, `apps/studio/src/studio-ipc.test.ts`, `e2e/lifecycle.spec.ts`, and this file; cleanup `temporary_roots=[]`, `residual_processes=[]`; rollback only these correction hunks, retaining Units 1–2 and Unit 3 PNG parser; safe evidence revision `sha256:b775c5bf72d126e75c035ed82a907e9ab6e9d141334ffec7864ac5a1966637f5` over the seven implementation/test paths. |
- Accounting readback: the reproducible seven-path `git diff --numstat` script compared `1ff6fa2`, used `/dev/null` for untracked PNG files, and counted authored additions+deletions; breakdown `19 + 1 + 29 + 49 + 193 + 87 + 13 = 391 / 400`; this gate rerun changed no code bytes.
