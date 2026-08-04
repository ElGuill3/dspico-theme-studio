# Apply Progress: Units 1–2 — V2 Authority and Portable Assets

## Status

- Change: `manual-theme-workspace`
- Work unit: `unit-2-portable-assets` (parent: `unit-1-v2-authority`).
- Mode: Standard (Strict TDD disabled); Unit 2 uses behavior-first RED tests.
- Delivery: auto-chain, stacked-to-main; baseline `8c5cff63ca8a251fb7b384e05b221b506474933` recognized.
- Native authorization: Unit 1 used the parent-retained proceed token; Unit 2 proceeded under the parent-retained native token, with no child settle.
- Scope: 0.1, 1.1, 1.2, 2.1, and 2.2 only. Unit 3+ is untouched.
- Unit 1 authored changed lines: 375 / 400 at its delivered checkpoint; current five-path Unit 2 candidate: 265 / 400 (254 additions + 11 deletions versus HEAD).

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
- No PNG parsing, dimensions, provenance, IPC, renderer, compiler, export, dependency, commit, push, PR, or RDD work was performed.

## Next recommendation

- After this bounded remediation, Unit 2 is ready for the parent-controlled verification/delivery handoff; task 3.1 remains outside this apply slice.

## Verification Notes

- No commit, push, PR, RDD, or review lifecycle was invoked.
- Tasks 0.1, 1.1, 1.2, 2.1, and 2.2 are checked; prior Unit 1 history and rollback record are preserved.

## Focused remediation — Unit 2 durability/recovery

- Delivery remains `auto-chain` with `stacked-to-main`; this remediation is limited to Unit 2 and is capped at 200 changed lines.
- Remediation delta: 48 authored changed lines (20 source/test lines plus 28 additive progress/evidence lines); no Unit 3+ files were touched.
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
- The parent-controlled verification/delivery handoff is the next step; Unit 3/PNG/IPC remains untouched.

## Maintainer-authorized final correction — Unit 2

- Scope: source-mutating Prettier normalization and retained-state reachability test only; no production semantics changed; Unit 3/PNG/IPC remains untouched.
- Correction delta: 91 authored changed lines (+88 / -3) from the pre-correction candidate; within the 100-line cap.
- Final five-path candidate accounting versus HEAD: 265 authored changed lines (254 additions + 11 deletions).
- Reachability evidence: exact equality now covers unique initial, replay, current, undo, redo, and snapshot asset hashes.
- Focused evidence: Prettier check, Vitest (2 files/23 tests), typecheck, and `git diff --check` all exit 0.
- Runtime harness: focused filesystem suite exit 0; temporary roots cleaned and no focused Vitest/tsc/pnpm processes remain.
- Safe evidence revision: `sha256:1ceeb6ac55950d002f4baf859c0d415741642aa6bb64b0545256e2589efc999c` (path-delimited hash of the three normalized Unit 2 TypeScript files).
- Handoff: parent-controlled Unit 2 verification/delivery; no stage, commit, push, review, native-token operation, or reset.
