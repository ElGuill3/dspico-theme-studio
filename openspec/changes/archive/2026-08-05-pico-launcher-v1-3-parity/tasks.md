# Tasks: Pico Launcher v1.3.0 Parity

## Review Workload Forecast

Lines: S1 80–120; S2 120–180; S3 300–380; S4 280–360; S5 300–390; S6 280–390; S7 220–300. Total 1,580–2,120.

delivery_strategy: auto-chain
chain_strategy: stacked-to-main
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

V1/V2 retained. Initial supported host: Linux x64 only; repeated Linux x64 outputs must match. macOS/Windows are outside the current supported-host set until separately evidenced, not failed requirements. The exact v1.3.0 12-file cartridge scope is unchanged. Unsupported: selector assets, `preview.bin`, `icon.bmp`, WAV, `launchTransition`, animation/timing, fonts, covers, SD, launcher mutation, AI/cloud.

| Unit | Changes | Read dependencies | Verify | Rollback delta |
|---|---|---|---|---|
| 1 Safety | `packages/dspico-contract/src/index.ts`; `apps/studio/src/{main.ts,studio-ipc.ts,preload.ts,renderer/renderer.tsx,renderer/renderer-shell.test.ts,studio-ipc.test.ts}`; `e2e/lifecycle.spec.ts`; receipt N/A. | specs/design. | `pnpm test -- apps/studio/src/studio-ipc.test.ts`; `pnpm test:e2e -- e2e/lifecycle.spec.ts`; hardware N/A: block-only. | RB: remove only Unit 1 test/e2e evidence hunks in `apps/studio/src/studio-ipc.test.ts`, `apps/studio/src/renderer/renderer-shell.test.ts`, and `e2e/lifecycle.spec.ts`; RETAIN safety guards in `packages/dspico-contract/src/index.ts`, `apps/studio/src/main.ts`, `preload.ts`, `studio-ipc.ts`, and `renderer/renderer.tsx`. 80–120. |
| 2 Profile | `packages/dspico-contract/src/profile-v1-3.ts`; `packages/test-fixtures/src/{capture.ts,capture.test.ts,launcher-v1.ts}`; `packages/test-fixtures/evidence/pico-launcher-v1-3-profile.json`; `e2e/lifecycle.spec.ts`. | Unit 1; commit `b087565651c83081dd65552863f5efc2f28e489c`; reject `f3ae632`. | `pnpm test -- packages/test-fixtures/src/capture.test.ts`; N/A: read-only; clean/hash evidence. | RB: delete evidence; revert profile/capture/filename hunks; preserve Unit 1. 120–180. |
| 3 Material | `packages/dspico-contract/src/{index.ts,index.test.ts}`; `packages/theme-core/src/{parity-model-v1.ts,parity-history-v1.ts,parity-migration-v1.ts,index.ts,preview.ts,parity-history-v1.test.ts,parity-migration-v1.test.ts,preview.test.ts}`; `apps/studio/src/{project-file-session.ts,portable-project-store.ts,portable-project-store.test.ts}`; `e2e/lifecycle.spec.ts`. | U1–2; specs; `packages/test-fixtures/evidence/pico-launcher-v1-3-profile.json`. | `pnpm test -- packages/theme-core/src/{parity-history-v1.test.ts,parity-migration-v1.test.ts,preview.test.ts} apps/studio/src/portable-project-store.test.ts packages/dspico-contract/src/index.test.ts`; `pnpm test:e2e -- e2e/lifecycle.spec.ts`; hardware N/A: offline. | RB: delete new theme tests; revert Material/store/preview hunks; preserve Units 1–2/block. 300–380. |
| 4 Codecs | `packages/dspico-contract/src/{codecs-v1-3.ts,index.ts,index.test.ts}`; `packages/test-fixtures/src/{capture.ts,capture.test.ts,launcher-v1.ts}`; `e2e/lifecycle.spec.ts`; `scripts/compare-theme-outputs.sh`. | Units 1–3; profile/Material; `packages/test-fixtures/evidence/pico-launcher-v1-3-profile.json`. | `pnpm test -- packages/dspico-contract/src/index.test.ts`; `pnpm verify:package`; repeat-output script on Linux x64; macOS/Windows outside current host set. | RB: revert codec/index/capture hunks; delete script/manifests; preserve Units 1–3. 280–360. |
| 5 Custom model | `packages/dspico-contract/src/{custom-v1-3.ts,index.ts,custom-compiler-v1.test.ts}`; `e2e/lifecycle.spec.ts`. | Units 1–4; visual contract; `packages/test-fixtures/evidence/pico-launcher-v1-3-profile.json`. | `pnpm test -- packages/dspico-contract/src/custom-compiler-v1.test.ts`; `pnpm test:e2e -- e2e/lifecycle.spec.ts`; hardware N/A: no publication. | RB: revert Custom model/completeness hunks; preserve Units 1–4/block. 300–390. |
| 6 Publication/UI | `packages/dspico-contract/src/index.ts`; `apps/studio/src/{export-writer.ts,export-writer.test.ts,main.ts,studio-ipc.ts,preload.ts,project-file-session.ts,portable-project-store.ts,studio-ipc.test.ts,portable-project-store.test.ts,renderer/renderer.tsx,renderer/workspace/read-only-workspace.tsx,renderer/workspace/workspace-model.ts}`; `e2e/lifecycle.spec.ts`; `packages/test-fixtures/receipts/v1.3.0/<fixture>/visual-receipt.json`. | U1–5; visual. | `pnpm test -- apps/studio/src/export-writer.test.ts apps/studio/src/studio-ipc.test.ts apps/studio/src/portable-project-store.test.ts`; `pnpm verify:package`; `pnpm test:e2e -- e2e/lifecycle.spec.ts`; missing receipt blocks. | RB: revert export-writer/complete-export/IPC/UI hunks; delete visual receipt; restore Unit 1 block; preserve Units 1–5. 280–390. |
| 7 BCSTM | `packages/dspico-contract/src/{bcstm-v1-3.ts,bcstm-v1-3.test.ts,index.ts}`; `e2e/lifecycle.spec.ts`; `packages/test-fixtures/receipts/v1.3.0/<fixture>/bcstm-receipt.json`. | U1–6; receipts; `packages/test-fixtures/evidence/pico-launcher-v1-3-profile.json`. | `pnpm test -- packages/dspico-contract/src/bcstm-v1-3.test.ts`; `pnpm verify:package`; `pnpm test:e2e -- e2e/lifecycle.spec.ts`; missing receipt blocks. | RB: delete BCSTM files/receipt; revert BCSTM gate hunks; preserve Units 1–6 bytes. 220–300. |

Host determinism: Linux x64 is the sole supported host for this release. `scripts/compare-theme-outputs.sh <destination> <repeat>` runs `diff -ru` on `theme/`, `cmp` on `theme.zip` and `theme/report.json`, and `sha256sum` into external `<destination>.sha256`/`<repeat>.sha256` manifests; pass only when repeated same-project/commit/lockfile outputs and hashes match. macOS/Windows are outside the current supported-host set until separately evidenced, not failed requirements.

Visual receipt: stop launcher; copy export content to `/_pico/themes/<folder>/`; edit top-level `"theme":"<folder>"` in `/_pico/settings.json`, preserve keys; safely eject; start from scratch; inspect Material `top`/`bottom` and Custom `gridcellSelected`, `bannerListCellSelected`, `scrim`. Save `{launcherTag,launcherCommit,fileHashes,observations,pass}` at `packages/test-fixtures/receipts/v1.3.0/<fixture>/visual-receipt.json`; no UI selection claim.

BCSTM receipt separately at `packages/test-fixtures/receipts/v1.3.0/<fixture>/bcstm-receipt.json`: use `/_pico/themes/<folder>/`, setting/restart procedure; inspect BGM source/path/bytes; save `{launcherTag,launcherCommit,fileHashes,observations,pass}`. Missing receipt blocks claims; never fabricate.

## Ordered Tasks

- [x] 1.1 RED four routes; 1.2 guard before profile.
- [x] 2.1 RED hostile/dirty capture and consuming-code filename precedence; 2.2 pin profile.
- [x] 3.1 Listed Material tests for refusal/replay/Chromium approximation; 3.2 successful warning acknowledgment persistence/invalidation, labels, migration.
- [x] 4.1 Create `scripts/compare-theme-outputs.sh`; codec tests; repeated Linux x64 output match; other hosts outside current support.
- [x] 5.1 Typed ranges, exact 12-file completeness, blocked export.
- [x] 6.1 RED `apps/studio/src/export-writer.test.ts`: AtomicExportWriter interruption preserves prior output; 6.2 publication/UI/receipt.
- [x] 7.1 RED BCSTM accept/reject/determinism; 7.2 gated pass-through/receipt.

## Settlement and Routing

- Unit 6 initial implementation attempt: `failed`; 248 candidate lines; the packaged harness was invalidated.
- Maintainer-authorized rescope: harness-only remediation on the unchanged Unit 6 candidate; no code, task/progress, test, or native operation was reopened.
- Unit 6 remediation: `passed` / `complete`; `TMPDIR=/tmp/opencode/dspico-unit6-package npm run verify:package` exited `0`; one Linux x64 package, one ASAR verification, and packaged runtime `2/2` passed; candidate bytes did not drift.
- Unit 6 evidence revision remains `ec87cd55bd7ead9c712aef1918ce3f42ade034e1e18cb7adbfbdd18191248886`.
- Unit 7 parent settlement: `passed` / `complete`; native authoritative `changed_lines=2`; `evidence_revision` is `911e450a0923232b8f86f0178ac0f30823077334583a8de94f9d581e251f9479`.
- The 142-line Unit 7 candidate snapshot is non-authoritative for native accounting; all seven implementation tasks are complete and the next route is `sdd-verify`.
- No visual or BCSTM receipt, playback parity, or hardware result is claimed; missing evidence remains a publication gate.

## Maintainer-authorized bounded correction

- `linux-host-scope-and-evidence-kind`: correct host scope to repeated Linux x64 determinism and require generated Custom reports to preserve evidence `kind` with an explicit software-fixture-only / `hardwareParityClaimed: false` boundary.
- This correction does not reopen the seven completed tasks, expand the exact v1.3.0 cartridge scope, or create a physical receipt claim.
