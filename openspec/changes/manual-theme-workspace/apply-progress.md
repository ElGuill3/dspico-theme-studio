# Apply Progress: Unit 1 — V2 Authority

## Status

- Change: `manual-theme-workspace`
- Work unit: `unit-1-test-remediation` (parent: `unit-1-v2-authority`).
- Mode: Standard (Strict TDD disabled); remediation is test-only.
- Delivery: auto-chain, stacked-to-main; baseline `8c5cff63ca8a251fb7b384e05b221b506474933` recognized.
- Native authorization: parent retained the proceed token; maintainer authorized this bounded test-only remediation.
- Scope: 0.1, 1.1, and 1.2 only. Unit 2+ is untouched.
- Cumulative Unit 1 authored changed lines: 375 / 400 (281 prior + 81 test lines + 13 progress lines).

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

## Next recommendation

- Unit 1 still requires independent verification and stacked-to-main delivery before Unit 2.
- Do not start task 2.1 or any Unit 2 implementation from this remediation.

## Verification Notes

- No commit, push, PR, RDD, or review lifecycle was invoked.
- Completed task checkboxes remain unchanged; prior Unit 1 history and rollback record are preserved.
