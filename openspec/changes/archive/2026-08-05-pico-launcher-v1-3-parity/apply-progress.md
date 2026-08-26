# Apply Progress: Pico Launcher v1.3.0 Parity

**Change**: `pico-launcher-v1-3-parity`
**Mode**: Standard mode with behavior-first RED evidence; Strict TDD disabled.
**Artifact store**: OpenSpec + Engram.
**Delivery**: `auto-chain`, `stacked-to-main`; Units 1 (`Safety`), 2 (`Profile`), 3 (`Material`), 4 (`Codecs`), 5 (`Custom model`), 6 (`Publication/UI`), and 7 (`BCSTM`) are `passed` / `complete`. The next route is `sdd-verify`.
**Execution window**: Unit 1 completed `2026-08-05T05:06:43-06:00`; Unit 2 completed `2026-08-05T05:52:00-06:00`; Unit 3 implementation and final verification completed `2026-08-05T06:45:32-06:00`; Unit 4 implementation and final verification completed in the prior executor batch; Unit 5 implementation and final verification completed in the prior executor batch; Unit 6 implementation and final verification completed `2026-08-05T09:03:09-06:00`; Unit 7 implementation and final verification completed `2026-08-05T09:53:42-06:00`.
**Native settlement**: Parent acquired and settled Units 1–7; every outcome is `passed` and every terminal state is `complete`. Unit 6's first implementation attempt failed because its packaged harness was invalidated at 248 candidate lines; a maintainer-authorized harness-only rescope then passed and completed on the unchanged candidate. Unit 7 settled at native authoritative `changed_lines=2`; the final internal remediation reset is parent-settled `passed` / `complete` at native authoritative `changed_lines=199`. This artifact synchronization reopened no native operation.

| Unit | Native outcome | Terminal state | Native authoritative changed_lines | evidence_revision |
|---|---|---|---:|---|
| Unit 1 (`Safety`) | `passed` | `complete` | 117 | `e52e2c80eea393ddc2cc8ac0acbb26e9e54943a685d1dc047d1406625b05547e` |
| Unit 2 (`Profile`) | `passed` | `complete` | 143 | `3323ca0b7426d7b1194f7a595323815e13b9eea93db67f81f759e56ee59a8a69` |
| Unit 3 (`Material`) | `passed` | `complete` | 197 | `52ff23f6edf6b95a34b60b3e43f3bd8b21a874d72cbab7c279d83bff2481a0b0` |
| Unit 4 (`Codecs`) | `passed` | `complete` | 2 | `cedc4592f5f2adf1f95702707b78aefd69e104bc78fc84fe4b48e0a412c1ee3e` |
| Unit 5 (`Custom model`) | `passed` | `complete` | 120 | `bb73931328458b32db1569c055dd500eca8fc1a493332b04086d208a27820699` |
| Unit 6 (`Publication/UI`) | `passed` | `complete` | 248 | `ec87cd55bd7ead9c712aef1918ce3f42ade034e1e18cb7adbfbdd18191248886` |
| Unit 7 (`BCSTM`) | `passed` | `complete` | 2 | `911e450a0923232b8f86f0178ac0f30823077334583a8de94f9d581e251f9479` |

## Completed Tasks

- [x] 1.1 RED four routes: renderer affordance, preload capability, IPC request boundary, and main/publication boundary.
- [x] 1.2 Add the fail-closed Custom export guard before publication/profile work.
- [x] 2.1 RED hostile/dirty capture and consuming-code filename precedence; 2.2 pin profile.
- [x] 3.1 Listed Material tests for refusal/replay/Chromium approximation; 3.2 successful warning acknowledgment persistence/invalidation, labels, migration.
- [x] 4.1 Create `scripts/compare-theme-outputs.sh`; codec tests; cross-host blocked.
- [x] 5.1 Typed ranges, exact 12-file completeness, blocked export.
- [x] 6.1 AtomicExportWriter interruption/recovery evidence; 6.2 complete Custom publication wiring, UI readiness gate, and visual receipt gate.
- [x] 7.1 RED BCSTM accept/reject/determinism; 7.2 gated pass-through and source-matching receipt gate.

## Implementation

- Custom projects still create, open, save, edit, and preview.
- Material export remains on its existing validation/compiler/writer path.
- Custom export now returns an explicit `custom.export-blocked` diagnostic or safety-baseline error before validation, source reads, destination selection, compilation, or `AtomicExportWriter` publication.
- The renderer keeps the edge-to-edge shell and accessibility tree, disables the Custom export affordance, and exposes the English safety-baseline message.
- The v1.3.0 profile is pinned separately with immutable source/fixture evidence; publication completion and BCSTM implementation are recorded in Units 6–7, while visual/BCSTM receipts and later audio playback features were not started.

## Behavior-First RED/GREEN Evidence

| Boundary | RED evidence before guard | GREEN result |
|---|---|---|
| Renderer | Shell assertion failed because the Custom export button was not disabled. | Native button is disabled for Custom and the safety message is rendered. |
| Preload | API invocation reached the Custom writer instead of returning a block. | `export("custom")` returns `canExport: false` and `custom.export-blocked` without IPC. |
| IPC | Custom request reached `exportCustom` and the writer stub. | Direct `{ kind: "export" }` on V2 returns the diagnostic before `validateCustom` or `exportCustom`. |
| Main/publication | Custom plan/publication path was reachable. | Main `exportCustom` fails before destination selection and writer invocation; E2E confirms no theme folder or ZIP. |

## Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | Requested `pnpm test -- apps/studio/src/studio-ipc.test.ts` was unavailable because `pnpm` is not installed (exit 127). Equivalent fallback `npm test -- --run apps/studio/src/studio-ipc.test.ts packages/dspico-contract/src/custom-compiler-v1.test.ts apps/studio/src/renderer/renderer-shell.test.ts` passed: 3 files, 35 tests, exit 0; final window `2026-08-05T05:06:04-06:00`–`05:06:08-06:00`. |
| Material regression | `npm test -- --run packages/dspico-contract/src/index.test.ts` passed: 19 tests, exit 0, `2026-08-05T05:03:32-06:00`–`05:03:34-06:00`. |
| Runtime harness | Requested `pnpm test:e2e -- e2e/lifecycle.spec.ts` used fallback `npm run test:e2e -- e2e/lifecycle.spec.ts`; packaged Electron build/typecheck and Playwright passed: 2 tests, exit 0, `2026-08-05T05:06:13-06:00`–`05:06:26-06:00`. Material bytes remained unchanged; Custom export routes produced no `export/theme/` or `export/theme.zip`. |
| Diff hygiene | `git diff --check` passed with no output. |
| Rollback boundary | Remove only Unit 1 test/e2e evidence hunks in `apps/studio/src/studio-ipc.test.ts`, `apps/studio/src/renderer/renderer-shell.test.ts`, and `e2e/lifecycle.spec.ts`; RETAIN safety guards in `packages/dspico-contract/src/index.ts`, `apps/studio/src/main.ts`, `apps/studio/src/preload.ts`, `apps/studio/src/studio-ipc.ts`, and `apps/studio/src/renderer/renderer.tsx`. Never revert all eight paths. |

## Authored Line Accounting

**Native authoritative changed_lines: 117** across implementation/test paths: **86 additions + 31 deletions**, below the 120-line authored cap. OpenSpec/Engram artifacts are persistence records and are excluded from this implementation/test budget.

Exact changed implementation/test paths:

- `apps/studio/src/main.ts`
- `apps/studio/src/preload.ts`
- `apps/studio/src/renderer/renderer-shell.test.ts`
- `apps/studio/src/renderer/renderer.tsx`
- `apps/studio/src/studio-ipc.test.ts`
- `apps/studio/src/studio-ipc.ts`
- `e2e/lifecycle.spec.ts`
- `packages/dspico-contract/src/index.ts`

This eight-path implementation/test set matches the Unit 1 Changes column, including `apps/studio/src/renderer/renderer-shell.test.ts`.

Evidence revision method: SHA-256 each exact path, concatenate sorted manifest lines in the listed order, then SHA-256 the manifest bytes.

`evidence_revision`: `e52e2c80eea393ddc2cc8ac0acbb26e9e54943a685d1dc047d1406625b05547e`

## Cleanup and Process Evidence

- No commit, push, PR, RDD, or review lifecycle was performed. The native settlement table records all four parent attempts; the Unit 1 attempt passed with terminal state `complete` and native authoritative changed_lines `117`; no child-owned token operation occurred.
- Final process check at `2026-08-05T05:06:43-06:00`: `electron=NONE`, `playwright=NONE`, `vite=NONE`.
- Hardware receipt: N/A; this slice proves block-only safety and explicitly publishes no Custom package.

## Unit 2 Implementation

- `packages/dspico-contract/src/profile-v1-3.ts` defines the immutable `v1.3.0` profile identity, 12 visual filenames, and source/fixture evidence hashes; compatibility rules are defined in `packages/test-fixtures/src/launcher-v1.ts:19-25`.
- `packages/test-fixtures/src/launcher-v1.ts` and `packages/test-fixtures/evidence/pico-launcher-v1-3-profile.json` pin the clean authority manifest at commit `b087565651c83081dd65552863f5efc2f28e489c` and tag `v1.3.0`; the unpublished `f3ae63279ab72bc6c83124c752ec79f3247db437` is rejected.
- `packages/test-fixtures/src/capture.ts` canonicalizes the configured root, rejects moved/dirty/wrong-HEAD/wrong-tag repositories, uses shell-free read-only `git show`, and hashes Git output as raw bytes so binary fixtures cannot drift through UTF-8 decoding.
- `packages/test-fixtures/src/capture.test.ts` covers hostile selectors, moved roots, staged/unstaged/untracked state, wrong HEAD/tag/unpublished commit, exact consuming-code filename precedence, and checked-in evidence.

## Unit 2 Behavior-First RED/GREEN Evidence

| Boundary | RED evidence before implementation | GREEN result |
|---|---|---|
| Repository selector | Hostile selector and moved-root cases reached source capture or lacked an explicit refusal. | Shell-free canonical-root validation rejects both before any `show` call. |
| Repository state | Staged, unstaged, and untracked states were not all rejected before source reads. | Every dirty state fails before `show`; wrong HEAD, unpublished commit, and wrong tag fail likewise. |
| Consuming-code precedence | Fixture path assertions did not prove the code-used `gridcellSelectedPltt.bin` spelling. | The allowlist contains the consuming-code filename and excludes the documentation-like typo. |
| Evidence | Capture did not enforce the pinned source/fixture digest. | The exact tag/commit, eight source/fixture hashes, and manifest digest are checked with no fallback. |

## Unit 2 Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | Requested `pnpm test -- packages/test-fixtures/src/capture.test.ts` is unavailable because `pnpm` is not installed. Equivalent `npm test -- --run packages/test-fixtures/src/capture.test.ts` passed: 1 file, 13 tests, exit 0, `2026-08-05T05:51:54-06:00`. |
| Static checks | `npm run typecheck` passed, exit 0; `npx prettier --check --print-width 120 --trailing-comma all packages/dspico-contract/src/profile-v1-3.ts packages/test-fixtures/src/capture.ts packages/test-fixtures/src/capture.test.ts packages/test-fixtures/src/launcher-v1.ts packages/test-fixtures/evidence/pico-launcher-v1-3-profile.json` passed; `git diff --check` passed with no output. |
| Runtime harness | N/A — Unit 2 is a read-only authority/evidence capture boundary and has no application runtime or hardware behavior to launch. |
| Authority evidence | Clean authority worktree, exact tag/HEAD, eight source/fixture hashes, and manifest digest `068f1efdc2bda015bacc70a94473ac79c0754938ff96823368206b13bf5ceb46` were verified. |
| Rollback boundary | Delete `packages/test-fixtures/evidence/pico-launcher-v1-3-profile.json`; revert only Unit 2 hunks in `packages/dspico-contract/src/profile-v1-3.ts`, `packages/test-fixtures/src/capture.ts`, `packages/test-fixtures/src/capture.test.ts`, and `packages/test-fixtures/src/launcher-v1.ts`; preserve all Unit 1 guards/tests and unrelated work. |

## Unit 2 Authored Line Accounting

**Native authoritative changed_lines: 143.** The retained **178 changed lines** (**134 additions + 44 deletions**) is a separate, non-authoritative manual current-path snapshot across the four implementation/test paths. It must not be used for native budget accounting; the parent native transaction's `143` is authoritative. The checked-in evidence JSON and OpenSpec/Engram records are persistence artifacts and are excluded from both metrics.

Exact changed implementation/test paths:

- `packages/dspico-contract/src/profile-v1-3.ts`
- `packages/test-fixtures/src/capture.ts`
- `packages/test-fixtures/src/capture.test.ts`
- `packages/test-fixtures/src/launcher-v1.ts`

Evidence revision method: SHA-256 each exact Unit 2 path including the checked-in evidence JSON, concatenate sorted `path sha256` lines with trailing newlines, then SHA-256 the manifest bytes.

| Path | SHA-256 |
|---|---|
| `packages/dspico-contract/src/profile-v1-3.ts` | `28db97a87b19e387cfcf0a144892dd26f90ea7882d68fe7c81f3f69eb315a86a` |
| `packages/test-fixtures/evidence/pico-launcher-v1-3-profile.json` | `6f1dee4164b3e9eb7b23dc60ffd09c4237e81ef4812d7ed716817528c86d63ec` |
| `packages/test-fixtures/src/capture.test.ts` | `5c19e75813ad24273f7b39d9adf5215de9790cedb40b782bd89d19881f67bdef` |
| `packages/test-fixtures/src/capture.ts` | `1d651e2fdaf21628b3367c71b41a1350924f77f3369fcd3ba5b6a6334b91b07a` |
| `packages/test-fixtures/src/launcher-v1.ts` | `73c0c45a098c18135a2c71ccca7529f63c0e4f1b9b26d1dc19008d5fe696dedb` |

`evidence_revision`: `3323ca0b7426d7b1194f7a595323815e13b9eea93db67f81f759e56ee59a8a69`

## Unit 2 Cleanup and Process Evidence

- No commit, push, PR, RDD, or review lifecycle was performed. The parent Unit 2 native attempt passed with terminal state `complete` and native authoritative changed_lines `143`; no child-owned token operation occurred.
- The broader `packages/dspico-contract/src/index.test.ts` remains a downstream Unit 3 integration concern: its existing index export still expects legacy `f3ae632`; Unit 2 intentionally did not edit the Unit 3 `index.ts` surface. Unit 2 focused evidence remains green.

## Unit 3 Implementation

- `packages/theme-core/src/parity-model-v1.ts` defines the schema-discriminated canonical Material project, immutable profile identity, typed RGB8 fields, migration decisions, legacy evidence, and refusal errors.
- `packages/theme-core/src/parity-history-v1.ts` provides create/current/replay, atomic semantic operations, undo/redo, deterministic save, and refusal of malformed or newer parity bytes.
- `packages/theme-core/src/parity-migration-v1.ts` performs explicit V1/V2 read-only migration, preserves exact source bytes and SHA-256 evidence, records mappings/exclusions, and requires decisions before Save As.
- `packages/dspico-contract/src/index.ts` validates canonical v1.3 Material fields, rejects transition-bearing output, binds diagnostics/fingerprints to profile evidence, persists only valid warning acknowledgments, and emits deterministic canonical output.
- `apps/studio/src/main.ts` maps the existing Material boundary to only `primaryColor` and `darkTheme`; Custom blocking remains unchanged.
- `packages/theme-core/src/preview.ts` labels launcher-vector-backed Material properties separately from Chromium approximations.
- `apps/studio/src/project-file-session.ts` is generic over legacy or parity persisted projects, and `apps/studio/src/portable-project-store.ts` adds atomic parity Save/Open with `evidence/sha256/<hash>.json` source preservation.
- Existing V1/V2 and Custom routes remain intact; the existing Studio IPC Material route is intentionally not replaced in this slice because its broader IPC/UI integration belongs to the later publication/UI work unit.

## Unit 3 Behavior-First RED/GREEN Evidence

| Boundary | RED evidence before implementation | GREEN result |
|---|---|---|
| Canonical lifecycle | Parity history symbols and deterministic replay/save behavior were absent. | Create, semantic replay, undo/redo, save, reopen, and refusal tests pass. |
| Legacy migration | Legacy ambiguity, source preservation, and newer-format refusal had no parity implementation. | V1/V2 migration requires explicit decisions, preserves source bytes/hash, records exclusions, and refuses unsupported versions. |
| Diagnostics | Existing validation used legacy profile identity and output fields. | v1.3 profile-bound fingerprints, warning acknowledgment persistence/invalidation, transition refusal, and canonical Material fields pass. |
| Preview | Existing preview claims did not distinguish launcher-backed fields from browser approximation. | `primaryColor`/`darkTheme` receive truthful fidelity labels. |
| Persistence boundary | No parity store API or evidence sidecar test existed. | Portable parity Save/Open is atomic at the project-file rename boundary and writes legacy source evidence separately. |

## Unit 3 Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `npm test -- packages/theme-core/src/parity-history-v1.test.ts packages/theme-core/src/parity-migration-v1.test.ts packages/theme-core/src/preview.test.ts packages/dspico-contract/src/index.test.ts apps/studio/src/portable-project-store.test.ts apps/studio/src/project-file-session.test.ts` passed: 6 files, 39 tests, exit 0, start `2026-08-05T06:43:47-06:00`. |
| Regression command | `npm test -- packages/theme-core/src packages/dspico-contract/src apps/studio/src` passed: 18 files, 185 tests, exit 0, start `2026-08-05T06:44:44-06:00`. |
| Static checks | `npm run typecheck`, targeted `npx eslint`, targeted Prettier check for all Unit 3 paths, and `git diff --check` passed with exit 0/no output. |
| Runtime harness | `npm run test:e2e -- e2e/lifecycle.spec.ts` rebuilt the packaged Electron harness and passed: 2 Playwright tests, exit 0; existing offline Material/Custom lifecycle remained green. No hardware operation occurred in this executor evidence; the parent Unit 3 native attempt is recorded above. |
| Repository-wide format note | `npm run format:check` still reports pre-existing Unit 1 formatting warnings in `apps/studio/src/renderer/renderer-shell.test.ts`, `apps/studio/src/renderer/renderer.tsx`, and `e2e/lifecycle.spec.ts`; they were not changed in Unit 3 to preserve prior-slice rollback boundaries. |
| Rollback boundary | Delete the new parity model/history/migration/preview tests and revert only Unit 3 hunks in `apps/studio/src/{main.ts,project-file-session.ts,portable-project-store.ts,portable-project-store.test.ts}`, `packages/dspico-contract/src/{index.ts,index.test.ts}`, and `packages/theme-core/src/{index.ts,preview.ts}`; retain Unit 1 guards/e2e and Unit 2 profile/capture/evidence. |

## Unit 3 Authored Line Accounting

**Native authoritative changed_lines: 197.** The retained **357 changed lines** (**285 additions + 72 deletions**) is a separate, non-authoritative manual current-path snapshot across the 14 Unit 3 implementation/test paths. It must not be used for native budget accounting; the parent native transaction's `197` is authoritative. OpenSpec/Engram artifacts and unchanged lifecycle E2E coverage are excluded from both metrics.

Exact changed implementation/test paths:

- `apps/studio/src/main.ts`
- `apps/studio/src/project-file-session.ts`
- `apps/studio/src/portable-project-store.test.ts`
- `apps/studio/src/portable-project-store.ts`
- `packages/dspico-contract/src/index.test.ts`
- `packages/dspico-contract/src/index.ts`
- `packages/theme-core/src/index.ts`
- `packages/theme-core/src/parity-history-v1.test.ts`
- `packages/theme-core/src/parity-history-v1.ts`
- `packages/theme-core/src/parity-migration-v1.test.ts`
- `packages/theme-core/src/parity-migration-v1.ts`
- `packages/theme-core/src/parity-model-v1.ts`
- `packages/theme-core/src/preview.test.ts`
- `packages/theme-core/src/preview.ts`

Evidence revision method: SHA-256 each exact Unit 3 path, concatenate sorted `path sha256` lines with trailing newlines, then SHA-256 the manifest bytes.

| Path | SHA-256 |
|---|---|
| `apps/studio/src/main.ts` | `0b4b82f296edcc3eb2a04481eedbe8047c9164ee3a4fcf75df5fd2a2639b3f48` |
| `apps/studio/src/portable-project-store.test.ts` | `418ddbe7a451f1b2d029baf0f223c3d15c0aa824d0bb4fe42b837f35d781cefe` |
| `apps/studio/src/portable-project-store.ts` | `9679c4a2d216d8cfc1281e696d115f53455038c0cd0a044e40e8b2a5fed7f2c3` |
| `apps/studio/src/project-file-session.ts` | `0061bf0a83393c2e2635440dbe89b147994bd405f3f773867c1f66c2e19c9512` |
| `packages/dspico-contract/src/index.test.ts` | `989836c07e8e5f85c80efeeffb48ba544bac58b5cea76ea60e5fe61bcdcf5a8e` |
| `packages/dspico-contract/src/index.ts` | `4daabfba8e87550c43a74c3728a9766f7b566c7f51640178245b1655fb4a8d86` |
| `packages/theme-core/src/index.ts` | `265bf72a9459523971a07849869b786f50b320685020fe283fa3e85ca674ff78` |
| `packages/theme-core/src/parity-history-v1.test.ts` | `0159ee4fd6d2d418e5c691991450ea5f3fa35dec0b5565fac48d8d7e7082e829` |
| `packages/theme-core/src/parity-history-v1.ts` | `b59910ed746d3ac0e672d533d1f114b6498c60fb03e837bbddb02ae618be473b` |
| `packages/theme-core/src/parity-migration-v1.test.ts` | `242d46c474ebd3169282a91fc341a640e37d3f2ac5884b1cccce9163022a0a86` |
| `packages/theme-core/src/parity-migration-v1.ts` | `46ffca26b222680443c2bcb2f0fef8ad174c8ff20307ddfee1c184ccd64df0e7` |
| `packages/theme-core/src/parity-model-v1.ts` | `61d5ee8dc8045c4201b3d3f1c86a7b52512b0da9395072455ae2a1e1eebf89bb` |
| `packages/theme-core/src/preview.test.ts` | `224f729cc2b1fd1bc58b8533755f1dec97c50b81ffcd190b16977e7f8b55e0cc` |
| `packages/theme-core/src/preview.ts` | `6950c0ce6145563ae20e92b301c0c0bc0672fcfdef49ee13283dc1506cb372ce` |

`evidence_revision`: `52ff23f6edf6b95a34b60b3e43f3bd8b21a874d72cbab7c279d83bff2481a0b0`

## Unit 3 Cleanup and Process Evidence

- No commit, push, PR, or review lifecycle was performed. The parent Unit 3 native attempt passed with terminal state `complete` and native authoritative changed_lines `197`; no child-owned token operation occurred.
- Hardware receipt: N/A; this slice is offline Material/core/store behavior and does not claim cartridge parity.

## Unit 4 Implementation

- `packages/dspico-contract/src/codecs-v1-3.ts` implements deterministic little-endian XBGR555 direct color, A3I5 indexed textures with 32-entry palettes, and A5I3 indexed textures with 8-entry palettes.
- Codec policy is versioned as `le-xbgr555-a3i5-a5i3-round-half-up-median-cut-v1`: round-half-up channel/alpha quantization, transparent index/padding zero, deterministic integer median-cut with R/G/B tie order, lexical palettes, and nearest-color/lowest-index ties.
- `packages/dspico-contract/src/codecs-v1-3.test.ts` and `packages/test-fixtures/goldens/codecs-v1-3/codec-v1.json` provide behavior-first codec goldens, exact 12-file names/sizes, repeatability, and invalid-dimension refusal.
- `packages/dspico-contract/src/index.ts` exports the codec API without changing Units 1–3 behavior.
- `scripts/compare-theme-outputs.sh` compares real `theme/` trees, `theme.zip`, `theme/report.json`, and external SHA-256 manifests, including optional project/package/lockfile identity files. It is Linux-only; cross-host comparison remains BLOCKED.
- The pinned profile/evidence and existing capture precedence test were read dependencies only; no Unit 2 profile, capture, launcher, or evidence bytes were mutated.
- No Unit 6+ code, tests, artifacts, native operation, commit, push, PR, or RDD work was performed.

## Unit 4 Behavior-First RED/GREEN Evidence

| Boundary | RED evidence before implementation | GREEN result |
|---|---|---|
| Direct color | Codec module and v1.3 direct packing API were absent. | Little-endian XBGR555 bytes, bit-15 transparency, and channel quantization match the golden. |
| Indexed color | A3I5/A5I3 palette/index behavior had no v1.3 implementation. | Alpha/index packing, lexical palette order, transparent slot zero, and deterministic repeat output pass. |
| Consuming filenames | No codec-generated visual file set enforced the launcher spelling. | Exact `gridcellSelectedPltt.bin` and all 12 profile filenames are emitted; typo `gridcellPlttSelected.bin` is absent. |
| Repeatability | No Linux output comparison script existed. | Real theme paths, ZIP/report bytes, project/lockfile identity, and external SHA-256 manifests compare deterministically. |

## Unit 4 Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `npm test -- packages/dspico-contract/src/codecs-v1-3.test.ts packages/test-fixtures/src/capture.test.ts packages/dspico-contract/src/index.test.ts` passed: 3 files, 34 tests, exit 0, start `2026-08-05T07:16:49-06:00`. |
| Equivalent package regression (npm) | `npm test -- packages/dspico-contract/src packages/test-fixtures/src` passed: 5 files, 51 tests, exit 0, start `2026-08-05T07:17:12-06:00`; this is recorded separately from the required pnpm gate. |
| Required package gate | `pnpm verify:package` was unavailable because `pnpm` is unavailable in the environment; it was not retried and is not claimed as passed. |
| Static checks | `npm run typecheck` passed; targeted ESLint passed; targeted Prettier passed for all Unit 4 paths; `bash -n scripts/compare-theme-outputs.sh` passed; `git diff --check` and new-file diff checks passed with no output. |
| Repeatability harness | `scripts/compare-theme-outputs.sh /tmp/dspico-codec-compare-left.fNd2c1 /tmp/dspico-codec-compare-right.pU1rWY` passed and matched real `theme/`, `theme.zip`, `theme/report.json`, project, lockfile, and external `.sha256` manifests. |
| Package runtime | N/A — Unit 4 is a deterministic codec/library and Linux comparison-script boundary; the focused tests and real-path script exercise the applicable runtime behavior. |
| Hardware/cross-host | N/A/BLOCKED — no hardware parity claim; macOS/Windows second-host evidence remains unavailable and was not implied. |
| Cleanup/process | Parent Unit 4 native attempt was acquired and settled `passed`/`complete` with authoritative `changed_lines=2`; no native operation was performed in this artifact-only correction. No commit, push, PR, RDD, or review lifecycle was performed. |
| Rollback boundary | Delete `packages/dspico-contract/src/{codecs-v1-3.ts,codecs-v1-3.test.ts}`, `packages/test-fixtures/goldens/codecs-v1-3/`, and `scripts/compare-theme-outputs.sh`; revert only the Unit 4 export line in `packages/dspico-contract/src/index.ts`; preserve all Units 1–3 code, tests, evidence, hashes, and rollback boundaries. |

## Unit 4 Candidate Delta Forecast

**Non-authoritative candidate delta snapshot: 302 changed lines** across the five Unit 4 paths: **302 additions + 0 deletions**, within the parent-authorized 360-line cap. This snapshot is not native accounting; the parent-settled Unit 4 native result of **2 changed lines** takes precedence for authoritative budgeting.

Exact Unit 4 paths:

- `packages/dspico-contract/src/codecs-v1-3.test.ts`
- `packages/dspico-contract/src/codecs-v1-3.ts`
- `packages/dspico-contract/src/index.ts`
- `packages/test-fixtures/goldens/codecs-v1-3/codec-v1.json`
- `scripts/compare-theme-outputs.sh`

Evidence revision method: SHA-256 each exact Unit 4 path, concatenate sorted `path sha256` lines with trailing newlines, then SHA-256 the manifest bytes.

| Path | SHA-256 |
|---|---|
| `packages/dspico-contract/src/codecs-v1-3.test.ts` | `1c3b32ea0b86b4c84bfd4397cc75b970a1d20e29bf43ee982e1f1b2c266afec8` |
| `packages/dspico-contract/src/codecs-v1-3.ts` | `c240bacf365f8bc00aa8df68c3e2e9e8f21e59a0ba368dee1444a538f5c7efa7` |
| `packages/dspico-contract/src/index.ts` | `ffc71e7b538c7fe7da9611bc27f69f5498e15651b1e19349ba769270930e9cba` |
| `packages/test-fixtures/goldens/codecs-v1-3/codec-v1.json` | `dd970dc2334d0cdfa725585c5898d5cf5ff56dae6423f4a3e1ac5fb0fe1405b4` |
| `scripts/compare-theme-outputs.sh` | `ec98fd1eb6f6dbc39cd53d0f93d1ec68e89924af333cf3adf0b0d8250215e9e7` |

`evidence_revision`: `cedc4592f5f2adf1f95702707b78aefd69e104bc78fc84fe4b48e0a412c1ee3e`

## Unit 4 Cleanup and Process Evidence

- Parent authorization remains `unit-4-codecs-evidence`, max 360, attempts 2. The parent Unit 4 attempt is `passed`/`complete` with authoritative `changed_lines=2`; no acquire, settle, or reset was performed in this artifact-only correction.
- Unit 4 makes no hardware parity claim. Cross-host comparison remains explicitly BLOCKED.

## Unit 5 Implementation

- `packages/dspico-contract/src/custom-v1-3.ts` defines typed v1.3 Custom RGB8 colors, screen positions, text/icon/cover objects, closed visual-slot specifications, source provenance, and deterministic validation results.
- The validator accepts only launcher-consumed Custom JSON fields, enforces integer RGB `0..255`, screen-safe positions, positive in-screen text widths, complete nested objects, export rights, normalized source provenance, and rejects unsupported fields.
- `CUSTOM_VISUAL_SLOTS_V1` pins the exact 12 consuming filenames, geometry, codec, and lengths; `CUSTOM_VISUAL_TOTAL_BYTES_V1` is `230496`.
- `packages/dspico-contract/src/index.ts` exports the Unit 5 model without changing Units 1–4 behavior. The existing `custom.export-blocked` diagnostic and IPC/E2E publication block remain unchanged.
- No Unit 6+ code, tests, artifacts, native operation, commit, push, PR, or RDD work was performed.

## Unit 5 Behavior-First RED/GREEN Evidence

| Boundary | RED evidence before implementation | GREEN result |
|---|---|---|
| Typed model | Import of the new `custom-v1-3.js` contract failed because the module did not exist. | Complete launcher layout/color objects validate without mutation. |
| Safe ranges/unsupported fields | No v1.3 Custom validator existed for partial objects, off-screen positions, or transition fields. | Partial/unsafe/unsupported input returns deterministic blocking diagnostics. |
| Visual completeness/provenance | No closed 12-slot, exact-length, total-byte, or rights-bound package validator existed. | Exact 12 slots total `230496` bytes and require matching normalized export provenance. |
| Publication gate | Custom publication remains guarded by `custom.export-blocked`. | Complete dependent model still does not enable publication; E2E confirms no Custom output. |

## Unit 5 Work Unit Evidence

| Evidence | Exact result |
|---|---|
| RED focused command | `npm test -- packages/dspico-contract/src/custom-compiler-v1.test.ts` failed as expected before implementation: missing `./custom-v1-3.js`, 1 failed suite, 0 tests collected, start `2026-08-05T07:44:19-06:00`. |
| GREEN focused command | `TMPDIR=/home/guill3/Documents/Hobbies/dspico/dspico-theme-studio npm test -- packages/dspico-contract/src/custom-compiler-v1.test.ts` passed: 1 file, 9 tests, exit 0, start `2026-08-05T07:56:35-06:00`. |
| Package regression | `TMPDIR=/home/guill3/Documents/Hobbies/dspico/dspico-theme-studio npm test -- packages/dspico-contract/src` passed: 4 files, 42 tests, exit 0, start `2026-08-05T07:56:46-06:00`. |
| Static checks | `npm run typecheck`; `npx eslint packages/dspico-contract/src/custom-v1-3.ts packages/dspico-contract/src/custom-compiler-v1.test.ts packages/dspico-contract/src/index.ts`; `npx prettier --check --print-width 120 --trailing-comma all packages/dspico-contract/src/custom-v1-3.ts packages/dspico-contract/src/custom-compiler-v1.test.ts packages/dspico-contract/src/index.ts`; and `git diff --check -- packages/dspico-contract/src/custom-compiler-v1.test.ts packages/dspico-contract/src/index.ts` passed. |
| Runtime/E2E harness | `TMPDIR=/home/guill3/Documents/Hobbies/dspico/dspico-theme-studio npm run test:e2e -- e2e/lifecycle.spec.ts` passed: 2 Playwright tests, exit 0; Custom export remained disabled, returned `custom.export-blocked`, and wrote no `export/theme` or `export/theme.zip`. |
| Broader regression note | `TMPDIR=/home/guill3/Documents/Hobbies/dspico/dspico-theme-studio npm test -- packages/dspico-contract/src packages/test-fixtures/src` had 4 files pass and 1 pre-existing capture test fail: expected `reason: not-repository`, received `reason: moved-root`; no Unit 5 file was implicated. |
| Required pnpm gate | Requested `pnpm` commands were unavailable because pnpm is not installed; npm fallbacks above were used. Default npm focused attempts also hit system error `-122` on write, resolved by the recorded `TMPDIR` fallback. |
| Hardware/cross-host | N/A/BLOCKED — no hardware parity claim; macOS/Windows remain unavailable. |
| Cleanup/process | Parent Unit 5 native attempt was acquired and settled `passed`/`complete` with authoritative `changed_lines=120`; no native operation was performed in this artifact-only correction. No commit, push, PR, RDD, or review lifecycle was performed. |
| Rollback boundary | Delete `packages/dspico-contract/src/custom-v1-3.ts`; revert only the Unit 5 export line in `packages/dspico-contract/src/index.ts` and Unit 5 additions in `packages/dspico-contract/src/custom-compiler-v1.test.ts`; preserve Units 1–4 code, tests, evidence, hashes, and the Custom export block. |

## Unit 5 Candidate Delta Snapshot

**Non-authoritative candidate snapshot: 315 additions + 0 deletions = 315 changed lines** across the three Unit 5 implementation/test paths, within the parent-authorized 390-line cap. The parent-settled native result of **120 changed lines** takes precedence for authoritative budgeting.

Exact Unit 5 paths:

- `packages/dspico-contract/src/custom-v1-3.ts`
- `packages/dspico-contract/src/custom-compiler-v1.test.ts`
- `packages/dspico-contract/src/index.ts` (one Unit 5 export line; prior Unit 1–4 changes retained)

Evidence revision method: SHA-256 each exact Unit 5 path, concatenate sorted `path sha256` lines with trailing newlines, then SHA-256 the manifest bytes.

| Path | SHA-256 |
|---|---|
| `packages/dspico-contract/src/custom-compiler-v1.test.ts` | `aacb846e845788d1e61cec54e74226d76dc2ad4a6c775a789d0ebbb912783140` |
| `packages/dspico-contract/src/custom-v1-3.ts` | `41443843cfbb9f87f332ba647833f950effb0588b0bbf42280904a73b727d078` |
| `packages/dspico-contract/src/index.ts` | `77914fc7b2cbb16c3a4790194038a4bae41cc9b43508f75a0f46e8d57913ab63` |

`evidence_revision`: `bb73931328458b32db1569c055dd500eca8fc1a493332b04086d208a27820699`

## Unit 6 Implementation

- `packages/dspico-contract/src/index.ts` now validates an optional v1.3.0 visual receipt against the pinned launcher tag/commit, the exact 12 visual filenames, SHA-256-shaped file hashes, non-empty observations, and `pass: true`.
- `apps/studio/src/main.ts` loads the receipt from `DSPICO_VISUAL_RECEIPT_PATH` or the E2E root, adds deterministic receipt diagnostics to Custom readiness, and prevents destination selection/writer invocation until validation passes.
- `compileCustomThemeExportV1` emits the exact 12 launcher visual files plus `theme.json` and `report.json`; `apps/studio/src/main.ts` returns all 12 visual paths in the publication receipt.
- `apps/studio/src/studio-ipc.ts` validates Custom readiness before calling `exportCustom`; failed export requests retain the Unit 1 `custom.export-blocked` diagnostic, while validation-only requests return the underlying diagnostics without falsely appending an export-attempt error.
- `apps/studio/src/preload.ts` forwards the Custom export request to the main process, and `apps/studio/src/renderer/renderer.tsx` disables the Custom export affordance until `canExport === true` while showing the safety-baseline message.
- The existing `AtomicExportWriter` and its interruption/recovery tests were reused unchanged; no writer production change or native/hardware operation was performed.
- No visual receipt fixture was fabricated. Missing receipt remains an intentional blocking condition.

## Unit 6 Behavior-First RED/GREEN Evidence

| Boundary | RED evidence before implementation | GREEN result |
|---|---|---|
| Complete Custom bundle | Compiler assertions expected the exact launcher manifest and failed against the prior four-file plan. | Deterministic compiler output contains all 12 visual files, exact total visual bytes `230496`, and matching ZIP/report manifests. |
| IPC publication | Custom export could reach publication without a readiness gate. | Readiness validation precedes `exportCustom`; failed requests never invoke the writer, while ready requests invoke it exactly once. |
| Renderer | The Custom export control remained enabled for an unready project. | The native button is disabled until readiness and renders the English safety-baseline message. |
| Receipt gate | E2E had no missing-receipt refusal/no-write assertion. | Missing receipt produces `custom.visual-receipt-required`, disables Custom export, and leaves neither `export/theme/` nor `export/theme.zip`. |
| Atomic publication | Existing interruption coverage was the applicable writer boundary. | Existing `AtomicExportWriter` interruption/recovery suite remains green: prior folder and ZIP content survive interruption. |

## Unit 6 Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `TMPDIR=/home/guill3/Documents/Hobbies/dspico/dspico-theme-studio npm test -- apps/studio/src/export-writer.test.ts apps/studio/src/studio-ipc.test.ts apps/studio/src/portable-project-store.test.ts packages/dspico-contract/src/custom-compiler-v1.test.ts packages/dspico-contract/src/index.test.ts apps/studio/src/renderer/renderer-shell.test.ts` passed: 6 files, 117 tests, exit 0. |
| Full regression | `TMPDIR=/home/guill3/Documents/Hobbies/dspico/dspico-theme-studio npm test` passed: 20 files, 207 tests, exit 0. |
| Static checks | `npm run typecheck`, targeted ESLint, targeted Prettier check, and `git diff --check` passed with exit 0/no output. |
| Runtime harness | `TMPDIR=/home/guill3/Documents/Hobbies/dspico/dspico-theme-studio npm run test:e2e -- e2e/lifecycle.spec.ts` passed: 2 Playwright tests, exit 0; packaged Electron build/typecheck passed, missing receipt blocked Custom publication, and no Custom output paths were written. |
| Package gate | Initial implementation harness was invalidated. Maintainer-authorized remediation used exactly `TMPDIR=/tmp/opencode/dspico-unit6-package npm run verify:package`; exit 0, one Linux x64 package, one ASAR verification, and packaged runtime 2/2 passed. |
| Hardware/cross-host | N/A/BLOCKED — no hardware receipt was fabricated or claimed; macOS/Windows remain unavailable. |
| Rollback boundary | Revert only Unit 6 receipt/compiler/publication/UI hunks in `packages/dspico-contract/src/{index.ts,custom-compiler-v1.test.ts}`, `apps/studio/src/{main.ts,studio-ipc.ts,preload.ts,renderer/renderer.tsx,renderer/renderer-shell.test.ts,studio-ipc.test.ts}`, and `e2e/lifecycle.spec.ts`; retain Units 1–5, the existing `AtomicExportWriter`, and its tests. Delete a future visual receipt fixture rather than reverting unrelated evidence. |

## Unit 6 Settlement and Remediation

- **Initial implementation attempt**: `failed`; candidate snapshot was exactly **196 additions + 52 deletions = 248 changed lines** across the nine Unit 6 paths; the packaged harness was invalidated.
- **Maintainer-authorized rescope**: harness-only remediation using the unchanged candidate. No source or task/progress changes, no separate tests, and no native operation were reopened; only the authorized packaged acceptance harness ran.
- **Remediation result**: `passed` / `complete` after exactly one external-TMPDIR npm package acceptance. Packaging produced one Linux x64 package; one `app.asar` was verified; packaged runtime acceptance passed `2/2`.
- **Candidate integrity**: before/after path manifests were identical; no candidate byte drift; `evidence_revision` remains `ec87cd55bd7ead9c712aef1918ce3f42ade034e1e18cb7adbfbdd18191248886`.
- **Cleanup/process**: `/tmp/opencode/dspico-unit6-package`, `electron-packager/`, and `out/` were absent after cleanup; no Electron Forge/Packager processes remained.
- **Receipt/hardware**: no visual receipt was created, validated, or claimed; no hardware result is claimed.

## Unit 6 Authored Line Accounting

Parent-settled `changed_lines` is **248** for the unchanged Unit 6 candidate. The initial attempt was invalidated by the harness; the maintainer-authorized remediation did not alter candidate bytes. The nine-path candidate remains below the parent-authorized `280–390` review boundary.

Evidence revision method: SHA-256 each Unit 6 evidence path, concatenate sorted `path sha256` lines with trailing newlines, then SHA-256 the manifest bytes. Shared paths include retained earlier-slice bytes by design.

| Path | SHA-256 |
|---|---|
| `apps/studio/src/main.ts` | `7b6aa05be1b3d0663afe29fc677a280d3be4c2b87429232fbeb8fcee5b693b5a` |
| `apps/studio/src/preload.ts` | `4d3e2aea09ba2d4e7034110a62faaa85d76735f472f1341b4bf6396db49bc7a5` |
| `apps/studio/src/renderer/renderer-shell.test.ts` | `50180c38567bbf31d250659dfe0a3f61dc1c50d1342732851f622fe6a7fd7289` |
| `apps/studio/src/renderer/renderer.tsx` | `a953ef54d65e43b0d4f48c5a80b6c4d755a21575a8db8519eb4959ad0aec10b2` |
| `apps/studio/src/studio-ipc.test.ts` | `f0b19a7d067876cfb762b3753bb651904736d8ee36521925b7616ed3ac706496` |
| `apps/studio/src/studio-ipc.ts` | `f43b87fd9f1d3bebed95499c86fd9888670db069193ca50ac7239084f9d4e66c` |
| `e2e/lifecycle.spec.ts` | `665909e7d13e29d79acd793c79b49a83ec13e9d135e48523126be7b29913fed6` |
| `packages/dspico-contract/src/custom-compiler-v1.test.ts` | `24f6add7e2cfd77f127b98bc1c0a8af2667c6782b15410d0e472787e06f9db12` |
| `packages/dspico-contract/src/index.ts` | `dbbae942a770fb714e30457239cf7f74fd73b84f405796434ac6ae6295075694` |

`evidence_revision`: `ec87cd55bd7ead9c712aef1918ce3f42ade034e1e18cb7adbfbdd18191248886`

## Unit 6 Cleanup and Process Evidence

- No commit, push, PR, RDD, or review lifecycle was performed.
- The initial harness failure was remediated exactly once with the external TMPDIR; generated package/temp paths were cleaned and candidate bytes remained unchanged.
- No visual receipt or hardware result is claimed.

## Unit 7 Implementation

- `packages/dspico-contract/src/bcstm-v1-3.ts` implements strict little-endian `CSTM` v1.3 BCSTM validation for the launcher DSP-ADPCM container: signature/endian/version/header, aligned INFO/SEEK/DATA blocks, stream/channel/track/channel-codec metadata, block geometry, seek/data bounds, and loop ranges.
- BCSTM source identity uses a synchronous browser-compatible SHA-256 implementation; no Node-only crypto import remains in the shared contract, so the renderer and E2E Vite bundles build successfully.
- `validateBcstmV13` requires the complete visual baseline and an independent source-matching BCSTM receipt before pass-through. `createBcstmPassThroughV13` preserves the exact source bytes and emits deterministic source/bundle/launcher paths without decoding, conversion, or playback-parity claims.
- `packages/dspico-contract/src/bcstm-v1-3.test.ts` covers strict accept/reject behavior, malformed structural mutations, actual SHA-256 identity, independent receipt gates, deterministic paths, and byte-preserving pass-through.
- `e2e/lifecycle.spec.ts` asserts BCSTM import/export APIs remain unavailable before a gated runtime boundary exists; no UI/IPC BCSTM publication route was added.
- No visual or BCSTM receipt fixture was fabricated. Missing real receipt evidence remains an intentional runtime/publication gate.

## Unit 7 Behavior-First RED/GREEN Evidence

| Boundary | RED evidence before implementation | GREEN result |
|---|---|---|
| BCSTM parser | Focused BCSTM suite initially failed because the source-matching receipt was accepted without a source hash. | Strict parser rejects signature, endian, offset, channel, loop, geometry, and unsupported metadata mutations; valid fixture parses. |
| Receipt gate | Pass-through had no independent visual/BCSTM proof contract. | Visual prerequisite, visual receipt, and source-matching BCSTM receipt are separate deterministic diagnostics. |
| Pass-through | No deterministic BCSTM source/bundle/launcher result existed. | Exact input bytes are copied unchanged and paths are derived from the verified SHA-256 source identity. |
| Browser boundary | E2E Vite build failed when the shared contract imported `node:crypto`. | Pure synchronous SHA-256 keeps the shared contract browser-compatible; E2E and package builds pass. |

## Unit 7 Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test command | `TMPDIR=/tmp/opencode/dspico-unit7-focused npm test -- packages/dspico-contract/src/bcstm-v1-3.test.ts packages/dspico-contract/src/index.test.ts packages/dspico-contract/src/custom-compiler-v1.test.ts` passed: 3 files, 28 tests, exit 0. |
| Full regression | `TMPDIR=/tmp/opencode/dspico-unit7-full-tests npm test` passed: 21 files, 209 tests, exit 0. |
| Static checks | `npm run typecheck`, `npm run lint`, targeted ESLint, and targeted Prettier checks for the BCSTM files passed with exit 0. |
| Runtime harness | `NODE_COMPILE_CACHE=/tmp/opencode/dspico-unit7-node-cache TMPDIR=/tmp/opencode/dspico-unit7-e2e npm run test:e2e` passed: Vite builds, TypeScript check, and 2 Playwright tests, exit 0. The applicable BCSTM runtime assertion confirms import/export APIs are not exposed before gating; no real playback boundary exists. |
| Package gate | `NODE_COMPILE_CACHE=/tmp/opencode/dspico-unit7-package-cache npm run verify:package` passed: one Linux x64 package, ASAR verification, and packaged runtime 2/2, exit 0. |
| Hardware/receipt | N/A/BLOCKED — no visual or BCSTM receipt was created or claimed; no playback or hardware parity result is implied. |
| Rollback boundary | Delete `packages/dspico-contract/src/{bcstm-v1-3.ts,bcstm-v1-3.test.ts}`; revert only the BCSTM export in `packages/dspico-contract/src/index.ts` and the BCSTM API-unavailable assertion in `e2e/lifecycle.spec.ts`; preserve Units 1–6 bytes and their receipt/safety gates. |

## Unit 7 Candidate Delta and Evidence Revision

**Non-authoritative Unit 7 candidate snapshot: 142 additions + 0 deletions = 142 changed lines** across the two new BCSTM files plus one export line and one E2E assertion. This is below the parent-authorized 300-line cap and is not native accounting; parent settlement is `passed` / `complete` at authoritative `changed_lines=2`.

Evidence revision method: SHA-256 each exact Unit 7 implementation/test path, concatenate sorted `path sha256` lines with trailing newlines, then SHA-256 the manifest bytes. No receipt path is included because no receipt was fabricated.

| Path | SHA-256 |
|---|---|
| `e2e/lifecycle.spec.ts` | `78379e807feaef29bfe9e77b0e917d80a7fd79c4c65043913ef3434743dcb0f1` |
| `packages/dspico-contract/src/bcstm-v1-3.test.ts` | `89d9778fd35720813e52cd9aba714c18524b5e2bb8c85f89c0796255fe9e07aa` |
| `packages/dspico-contract/src/bcstm-v1-3.ts` | `051d6547b08f0723e6cabb19dd6089872176915494611ac99b2223db2906ba8e` |
| `packages/dspico-contract/src/index.ts` | `c7c7d18c90a75f173aac2daf5c6dbd1f802f89bb67ac2c0340c28513e34b4f9e` |

`evidence_revision`: `911e450a0923232b8f86f0178ac0f30823077334583a8de94f9d581e251f9479`

## Unit 7 Cleanup and Process Evidence

- No commit, push, PR, RDD, review lifecycle, native operation, or hardware operation was performed.
- Generated compile/package caches were kept outside the repository and removed after each command; no cache paths remain in `git status`.
- Unit 7 parent settlement is `passed` / `complete`; real BCSTM handling remains blocked until a separately captured receipt exists.
- All seven implementation tasks are checked complete; the next route is `sdd-verify`.

## Remaining Tasks

- [x] 5.1 Typed Custom ranges and exact 12-file completeness.
- [x] 6.1–6.2 Complete atomic Custom publication/UI and receipt gate; parent settlement passed and is complete.
- [x] 7.1 BCSTM pass-through and receipt gate; implementation/evidence complete, real receipt remains a gate.

**Next recommended**: `sdd-verify`. All seven implementation tasks and parent settlements are complete; no receipt or hardware claim is made.

## Final Internal Remediation Reset

**Kind**: Maintainer-authorized bounded final internal remediation for the SDD runtime state; this is not a new feature unit and does not reopen any of the seven tasks.
**Parent authorization**: native reset+acquire budget `max_changed_lines=200`, `max_attempts=2`.
**Native settlement**: Parent settlement for this reset/remediation is `passed` / `complete` with native authoritative `changed_lines=199`. This synchronization performed no native operations. Native review lineage fields are intentionally absent because this is an SDD runtime reset, not review remediation; no review envelopes were fabricated.
**Task state**: 7/7 remain complete and checked above.
**Delivery boundary**: one internal correction batch; no commit, push, PR, RDD, or review lifecycle.

### Remediation Result Contract

| Field | Result |
|---|---|
| Status | `passed` / `complete` for the final internal remediation; external evidence remains blocked/unclaimed |
| Candidate mutation | None in this artifact-only synchronization; the settled eight-path remediation candidate is unchanged |
| Native changed lines | `199` parent-authoritative settled value |
| Tasks | 7/7 complete |
| Evidence revision | `sha256:65f8ce16487c5572ed46bd38ea09ed06c43220fcb17d4af6268d925e8ed225e1` |
| Hardware / host claims | macOS, Windows, physical visual, and physical BCSTM remain blocked/unclaimed |
| Next route | Fresh final `sdd-verify`; do not archive |

### Parent Settlement Synchronization

| Field | Settled value |
|---|---|
| Maintainer authorization | Final internal remediation reset, bounded by max 200 lines / 2 attempts |
| Final internal remediation | `passed` / `complete` |
| Native authoritative changed_lines | `199` |
| Candidate evidence revision | `sha256:65f8ce16487c5572ed46bd38ea09ed06c43220fcb17d4af6268d925e8ed225e1` |
| Package / E2E | Passed; package/ASAR/runtime and E2E evidence retained above |
| External evidence | Cross-host and physical visual/BCSTM receipts remain blocked/unclaimed |
| Tasks | 7/7 complete |
| Next phase | Fresh `sdd-verify` |

This is an artifact-only settlement synchronization. It contains no code, test, command, native, or review-lineage operation.

### Exact Remediation Paths and Lines

| Path | Current lines | Remediation |
|---|---:|---|
| `apps/studio/src/main.ts` | 97–104, 172–181 | Recheck the receipt against hashes of the just-compiled 12 visual outputs before destination selection or atomic publication. |
| `packages/dspico-contract/src/index.ts` | 162–216, 414–455 | Add explicit v1.3 exclusion diagnostics and optional exact-current-output receipt-manifest binding. |
| `packages/dspico-contract/src/index.test.ts` | 1–13, 77–97, 169–185 | Cover every named exclusion and stale/current 12-file receipt manifests. |
| `packages/dspico-contract/src/custom-v1-3.ts` | 179 | Report `Uint8Array.byteLength` as the observed short-binary length. |
| `packages/dspico-contract/src/custom-compiler-v1.test.ts` | 324–335 | Assert the exact short binary observed length. |
| `packages/theme-core/src/preview.ts` | 20–45, 52–76, 105–121 | Expose labeled, non-exported preserved legacy migration evidence without changing the exact fidelity labels. |
| `packages/theme-core/src/preview.test.ts` | 1–4, 23–49 | Assert preserved evidence labeling and exact `launcher-vector-backed` / `Chromium approximation` labels. |
| `packages/theme-core/src/parity-history-v1.test.ts` | 1–10, 45–72 | Exercise migration-decision plus warning-acknowledgment replay through save/open. |

### Work Unit Evidence

| Gate | Exact command | Result |
|---|---|---|
| Focused tests | `CI=1 NO_COLOR=1 FORCE_COLOR=0 TMPDIR=/tmp/opencode/dspico-final-remediation-focused NODE_COMPILE_CACHE=/tmp/opencode/dspico-final-remediation-node-cache npm test -- packages/dspico-contract/src/index.test.ts packages/dspico-contract/src/custom-compiler-v1.test.ts packages/theme-core/src/preview.test.ts packages/theme-core/src/parity-history-v1.test.ts` | Exit 0; 4 files, 46 tests passed. |
| Full tests | `CI=1 NO_COLOR=1 FORCE_COLOR=0 TMPDIR=/tmp/opencode/dspico-final-remediation-full-tests NODE_COMPILE_CACHE=/tmp/opencode/dspico-final-remediation-full-cache npm test` | Exit 0; 21 files, 226 tests passed; output hash `sha256:4dec57366903e4e9cf76a1825b1bbd6e84105ae0a071bf925e223597b77db4bb`. |
| Static | `CI=1 NO_COLOR=1 FORCE_COLOR=0 npm run typecheck && CI=1 NO_COLOR=1 FORCE_COLOR=0 npm run lint && CI=1 NO_COLOR=1 FORCE_COLOR=0 npm run format:check && git diff --check` | Exit 0; typecheck, ESLint, Prettier, and diff hygiene passed. |
| E2E | `CI=1 NO_COLOR=1 FORCE_COLOR=0 TMPDIR=/tmp/opencode/dspico-final-remediation-e2e NODE_COMPILE_CACHE=/tmp/opencode/dspico-final-remediation-e2e-cache npm run test:e2e` | Exit 0; Vite builds, TypeScript check, and 2 Playwright tests passed; output hash `sha256:172392f36202bb7a5e1b664261dd638b163e4b157987278b0cc740d16697db2f`. |
| Package / ASAR / packaged runtime | `TMPDIR=/home/guill3/.cache/dspico-final-remediation-package npm run verify:package` | Exit 0; one Linux-x64 package, ASAR checks, and packaged runtime 2/2 passed; output hash `sha256:c07bb01bb8b292beda5cc34bce69db6de4db4b3303ab14e674a8c854d6201109`. |

The first `/tmp` package attempt found zero Forge packages after finalization (`sha256:10877edab39a2c74830f4273c4019e347c87f8e95c826254f2e4377f060190c4`); the retry then hit system error `-122` while writing the external capture. No source or harness code was changed. Re-running the same package gate with the external home-cache `TMPDIR` above restored the package/ASAR/runtime evidence, proving the failure was temporary-filesystem/harness state rather than a candidate-caused defect.

### Cleanup and Rollback

- Removed generated `.vite/`, `dist/`, `out/`, `test-results/`, `playwright-report/`, and all remediation temp/cache roots after evidence capture.
- Final process probe: no Electron, Playwright, or Vite process remained; `git diff --check` passed.
- No visual or BCSTM receipt was created, accepted, or claimed; no macOS/Windows or physical operation was attempted.
- Rollback boundary: revert only the remediation hunks in the eight paths listed above. Preserve all prior Unit 1–7 implementation/test bytes, task checkboxes, profile evidence, and receipt-blocking behavior.

## Maintainer-authorized bounded correction: `linux-host-scope-and-evidence-kind`

**Authorization**: parent maximum `80` changed lines, maximum `2` attempts. This is one bounded correction batch, not a new feature unit or task reopening.
**Parent settlement**: correction `passed` / `complete`; native authoritative `changed_lines=38`.
**Artifact-only sync**: no code, tests, or native operations were performed in this synchronization.
**Status**: all seven implementation tasks remain complete (`7/7`); focused, full, static/normalization, E2E, and package gates all passed; fresh `sdd-verify` is still required.
**Scope**: Linux x64 is the sole supported host; repeated Linux x64 export bytes must match. macOS/Windows are outside the current supported-host set until separately evidenced, not failed requirements. The exact v1.3.0 12-file cartridge scope is unchanged.

### Correction paths and lines

| Path | Lines | Change |
|---|---:|---|
| `packages/dspico-contract/src/index.ts` | 18–53, 797–812, 880–892 | Preserve profile evidence `kind` in Material/Custom reports and add `softwareFixtureOnly: true` / `hardwareParityClaimed: false` at the report root. |
| `packages/dspico-contract/src/custom-compiler-v1.test.ts` | 222–240 | Scenario 28 test proves source/fixture `kind` preservation and the no-physical-receipt claim boundary. |
| `openspec/changes/pico-launcher-v1-3-parity/proposal.md` | 14–15, 53, 69 | Record Linux x64 host scope, non-failed macOS/Windows disposition, exact cartridge scope, and repeated-output success criterion. |
| `openspec/changes/pico-launcher-v1-3-parity/design.md` | 5, 42, 56–59, 73 | Align host, report evidence, verification, hardware, and unchanged cartridge-scope decisions. |
| `openspec/changes/pico-launcher-v1-3-parity/specs/dspico-compatibility-validation/spec.md` | 7 | State the initial supported host. |
| `openspec/changes/pico-launcher-v1-3-parity/specs/deterministic-theme-export/spec.md` | 7, 30, 36 | Scope determinism to repeated Linux x64 output and require truthful report evidence boundary. |
| `openspec/changes/pico-launcher-v1-3-parity/specs/custom-visual-authoring/spec.md` | 43, 53–55 | Bind codec repeatability/report claims to Linux x64 and scenario 28 boundary fields. |
| `openspec/changes/pico-launcher-v1-3-parity/specs/validated-bcstm-audio/spec.md` | 43 | Scope repeated BCSTM evidence to Linux x64 without a physical claim. |
| `openspec/changes/pico-launcher-v1-3-parity/tasks.md` | 14, 21, 26, 37, 52–55 | Merge host/report correction without reopening tasks or expanding cartridge scope. |

### Behavior-first RED/GREEN evidence

| Boundary | RED | GREEN |
|---|---|---|
| Scenario 28 report contract | `TMPDIR=/tmp/opencode/dspico-linux-host-scope-red NODE_COMPILE_CACHE=/tmp/opencode/dspico-linux-host-scope-red-cache npm test -- packages/dspico-contract/src/custom-compiler-v1.test.ts` — exit 1; 1 of 11 tests failed because report evidence had no `kind` and no boundary. | `TMPDIR=/tmp/opencode/dspico-linux-host-scope-final-focused NODE_COMPILE_CACHE=/tmp/opencode/dspico-linux-host-scope-final-focused-cache npm test -- packages/dspico-contract/src/custom-compiler-v1.test.ts packages/dspico-contract/src/index.test.ts packages/dspico-contract/src/codecs-v1-3.test.ts` — exit 0; 3 files, 46 tests. |

### Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused | Final focused command above — exit 0; 46 tests passed, including named scenario 28. |
| Full | `TMPDIR=/tmp/opencode/dspico-linux-host-scope-final-full NODE_COMPILE_CACHE=/tmp/opencode/dspico-linux-host-scope-final-full-cache npm test` — exit 0; 21 files, 227 tests passed. |
| Static / normalization | `npm run typecheck && npm run lint && npm run format:check && git diff --check` — exit 0; TypeScript, ESLint, Prettier, and diff hygiene passed. |
| Runtime E2E | `TMPDIR=/home/guill3/.cache/dspico-linux-host-scope-e2e NODE_COMPILE_CACHE=/home/guill3/.cache/dspico-linux-host-scope-e2e-cache npm run test:e2e` — exit 0; Vite/TypeScript and Playwright 2/2 passed. |
| Package | `TMPDIR=/home/guill3/.cache/dspico-linux-host-scope-package NODE_COMPILE_CACHE=/home/guill3/.cache/dspico-linux-host-scope-package-cache npm run verify:package` — exit 0; one Linux x64 package, ASAR verification, and packaged runtime 2/2 passed. |
| External evidence | No macOS/Windows run; external physical visual/BCSTM receipts remain unclaimed. |

### Evidence revision and rollback

`evidence_revision`: `sha256:3a5c94b4a62f8cc8b8405cd015948c621d929186a0b82102660b4c2c6d3118f8`.

Method: SHA-256 each current implementation/test path in the prior 33-path candidate, sort `digest  path` lines, and SHA-256 the manifest bytes. OpenSpec artifacts are excluded from this candidate identity. Parent settlement records native authoritative `changed_lines=38`; this artifact-only sync performed no native operation.

Rollback boundary: revert only the report helper/type/field changes in `packages/dspico-contract/src/index.ts` and the scenario-28 test in `packages/dspico-contract/src/custom-compiler-v1.test.ts`; revert the seven listed OpenSpec artifact corrections as one documentation transaction. Preserve all prior Unit 1–7 implementation/test bytes, task checkboxes, exact v1.3.0 cartridge scope, and receipt-blocking behavior.

**Next route**: fresh `sdd-verify`; do not archive. No commit, push, PR, RDD, or physical operation was performed.

### Parent Settlement Synchronization

| Field | Settled value |
|---|---|
| Correction | `linux-host-scope-and-evidence-kind` |
| Status | `passed` / `complete` |
| Native authoritative changed lines | `38` |
| Evidence revision | `sha256:3a5c94b4a62f8cc8b8405cd015948c621d929186a0b82102660b4c2c6d3118f8` |
| Supported host | Linux x64 sole supported host |
| Gates | Focused, full, static/normalization, E2E, and package all passed |
| External physical receipts | Unclaimed |
| Tasks | `7/7` complete |
| Next phase | Fresh `sdd-verify` |

This is an artifact-only synchronization. No code, tests, native operations, commit, push, PR, RDD, or physical operation was performed.
