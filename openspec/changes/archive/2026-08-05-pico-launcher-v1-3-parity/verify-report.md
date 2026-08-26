```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:3a5c94b4a62f8cc8b8405cd015948c621d929186a0b82102660b4c2c6d3118f8
verdict: pass
blockers: 0
critical_findings: 0
requirements: 18/18
scenarios: 34/34
test_command: 'env CI=1 NO_COLOR=1 FORCE_COLOR=0 TMPDIR="/home/guill3/.cache/dspico-final-verify-linux-x64-20260805-fresh/tmp-tests" NODE_COMPILE_CACHE="/home/guill3/.cache/dspico-final-verify-linux-x64-20260805-fresh/node-cache-tests" npm test'
test_exit_code: 0
test_output_hash: sha256:b738947ae0669b2cf1dbb8d75672f74861d21fc2b741615eb771eedb18860fa7
build_command: 'env CI=1 NO_COLOR=1 FORCE_COLOR=0 TMPDIR="/home/guill3/.cache/dspico-final-verify-linux-x64-20260805-fresh/tmp-package" NODE_COMPILE_CACHE="/home/guill3/.cache/dspico-final-verify-linux-x64-20260805-fresh/node-cache-package" npm run verify:package'
build_exit_code: 0
build_output_hash: sha256:b3c8315a01cad2ee829370fd3db77f6dc535a24ebcdfc5ff208ae7309b234dc2
```

## Verification Report

**Change**: `pico-launcher-v1-3-parity`
**Version**: Pico Launcher `v1.3.0` at `b087565651c83081dd65552863f5efc2f28e489c`
**Mode**: Standard; Strict TDD disabled
**Artifact store**: OpenSpec + Engram
**Supported host**: Linux x64 only
**Verdict**: **PASS WITH WARNINGS**

All 7 tasks, 18 requirements, and 34 scenarios are complete under the amended supported-host scope. Current format, full unit/integration tests, typecheck, lint, Electron E2E, Linux x64 package, ASAR, packaged-runtime, immutable profile, and focused parity/report gates passed. The 33-path candidate remained byte-identical before and after execution at `sha256:3a5c94b4a62f8cc8b8405cd015948c621d929186a0b82102660b4c2c6d3118f8`.

macOS and Windows are outside the supported-host set and are not blockers. Physical visual and BCSTM receipts remain unavailable and unclaimed; this is compliant only because Custom publication, BCSTM availability, and every hardware/playback claim remain gated. Generated Material and Custom reports preserve source/fixture evidence `kind` and state `softwareFixtureOnly: true` plus `hardwareParityClaimed: false`; scenario 28 passed at runtime.

### Result Contract

| Field | Result |
|---|---|
| Status | `success` |
| Implementation mutation | None; parent `max_changed_lines=0` boundary respected |
| Native operations | None; no acquire, settle, reset, terminal, review, or archive operation was performed |
| Tasks | 7/7 complete |
| Requirements | 18/18 compliant |
| Scenarios | 34/34 compliant |
| Evidence revision | `sha256:3a5c94b4a62f8cc8b8405cd015948c621d929186a0b82102660b4c2c6d3118f8` |
| Evidence preimage | Exact 33-line digest/path manifest reproduced below and preserved with command logs |
| Next route | Parent completes final-verification transaction with these exact report bytes, then `sdd-archive` |

### Completeness

| Metric | Value |
|---|---:|
| Tasks total | 7 |
| Tasks complete | 7 |
| Tasks incomplete | 0 |
| Requirements total | 18 |
| Requirements compliant | 18 |
| Scenarios total | 34 |
| Scenarios compliant | 34 |

OpenSpec and Engram proposal, six specs, design, tasks, apply-progress, and prior verify-report artifacts were retrieved. Both stores agree on the Linux x64-only scope, report evidence boundary, 7/7 completed tasks, parent-settled correction, and candidate revision. The authoritative spec count is 18 requirements and 34 scenarios.

### Build & Tests Execution

| Gate | Exact command | Exit | Result / output hash |
|---|---|---:|---|
| Platform | `uname -sm` | 0 | `Linux x86_64`; Node `v26.0.0`; npm `11.12.1`; pnpm unavailable |
| Check-only formatting | `env CI=1 NO_COLOR=1 FORCE_COLOR=0 TMPDIR="/home/guill3/.cache/dspico-final-verify-linux-x64-20260805-fresh/tmp-format" npm run format:check` | 0 | All matched files use Prettier; `sha256:160f5d8d2a24323f0799bdf6072312b0674d0f60b35bfb4ef0314c3b66d1896a` |
| Full tests | `env CI=1 NO_COLOR=1 FORCE_COLOR=0 TMPDIR="/home/guill3/.cache/dspico-final-verify-linux-x64-20260805-fresh/tmp-tests" NODE_COMPILE_CACHE="/home/guill3/.cache/dspico-final-verify-linux-x64-20260805-fresh/node-cache-tests" npm test` | 0 | 21 files, 227 tests passed; `sha256:b738947ae0669b2cf1dbb8d75672f74861d21fc2b741615eb771eedb18860fa7` |
| Focused parity/report | `env CI=1 NO_COLOR=1 FORCE_COLOR=0 TMPDIR="/home/guill3/.cache/dspico-final-verify-linux-x64-20260805-fresh/tmp-parity" NODE_COMPILE_CACHE="/home/guill3/.cache/dspico-final-verify-linux-x64-20260805-fresh/node-cache-parity" npm test -- packages/dspico-contract/src/index.test.ts packages/dspico-contract/src/custom-compiler-v1.test.ts packages/dspico-contract/src/codecs-v1-3.test.ts packages/dspico-contract/src/bcstm-v1-3.test.ts` | 0 | 4 files, 48 tests passed, including Linux repeat outputs and scenario 28; `sha256:2950658305997438387aba3a5291ffadb2ae2a8ccb7609d22ac6ad1f2d25bdfe` |
| Profile tests | `env CI=1 NO_COLOR=1 FORCE_COLOR=0 TMPDIR="/home/guill3/.cache/dspico-final-verify-linux-x64-20260805-fresh/tmp-profile" NODE_COMPILE_CACHE="/home/guill3/.cache/dspico-final-verify-linux-x64-20260805-fresh/node-cache-profile" npm test -- packages/test-fixtures/src/capture.test.ts` | 0 | 1 file, 13 tests passed; `sha256:a784437cfb596d274ccfe8cb452e064749522c18acc4189dd67e2f92e75d8dd2` |
| Live immutable profile | `env CI=1 NO_COLOR=1 FORCE_COLOR=0 TMPDIR="/home/guill3/.cache/dspico-final-verify-linux-x64-20260805-fresh/tmp-profile" node "/home/guill3/.cache/dspico-final-verify-linux-x64-20260805-fresh/profile-live-verifier.mjs"` | 0 | Canonical clean root, exact tag/HEAD, 8 source hashes, manifest `068f1efdc2bda015bacc70a94473ac79c0754938ff96823368206b13bf5ceb46`; output `sha256:98b5814a9aac4b35491b264fd0ec7cde2c6cd56b21e05d3e8afbc5d34fcb62aa`; verifier `sha256:88471b003e0b8b1a43b69c033fa5b2fd093c45d9ab77a27508ab0b83ff2a997f` |
| Typecheck | `env CI=1 NO_COLOR=1 FORCE_COLOR=0 TMPDIR="/home/guill3/.cache/dspico-final-verify-linux-x64-20260805-fresh/tmp-typecheck" npm run typecheck` | 0 | `tsc --noEmit` passed; `sha256:a2ce6e3c1b5ad7986d55aa5a5c2eb1d575969b2b8c2132365c43296a6f6c35b2` |
| Lint | `env CI=1 NO_COLOR=1 FORCE_COLOR=0 TMPDIR="/home/guill3/.cache/dspico-final-verify-linux-x64-20260805-fresh/tmp-lint" npm run lint` | 0 | ESLint passed; `sha256:257d93ff01848187cc4585594d7bd5c70e6a9595c370ef8ec6be13c12114b07a` |
| E2E | `env CI=1 NO_COLOR=1 FORCE_COLOR=0 TMPDIR="/home/guill3/.cache/dspico-final-verify-linux-x64-20260805-fresh/tmp-e2e" NODE_COMPILE_CACHE="/home/guill3/.cache/dspico-final-verify-linux-x64-20260805-fresh/node-cache-e2e" npm run test:e2e` | 0 | Vite renderer/main builds, TypeScript, and Playwright 2/2 passed; `sha256:fc02771f28c46534036199c264c0695f39f92d9372d92a93d08e03bab915a427` |
| npm package / ASAR / packaged runtime | `env CI=1 NO_COLOR=1 FORCE_COLOR=0 TMPDIR="/home/guill3/.cache/dspico-final-verify-linux-x64-20260805-fresh/tmp-package" NODE_COMPILE_CACHE="/home/guill3/.cache/dspico-final-verify-linux-x64-20260805-fresh/node-cache-package" npm run verify:package` | 0 | One Linux x64 Forge package, ASAR verification, packaged Playwright 2/2; `sha256:b3c8315a01cad2ee829370fd3db77f6dc535a24ebcdfc5ff208ae7309b234dc2` |
| Diff hygiene | `git diff --check` | 0 | No output; `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Candidate identity | SHA-256 each of 33 implementation/test/evidence paths, sort `digest  path` lines, SHA-256 manifest | 0 | Pre/post manifests identical; `sha256:3a5c94b4a62f8cc8b8405cd015948c621d929186a0b82102660b4c2c6d3118f8` |
| Process cleanup | Exact-name probes for Electron, Playwright, and Vite | 0 | No matching runtime process remained |

**Coverage**: Not configured; no percentage or threshold is available.

A non-authoritative attempt to launch an additional temporary `vite-node` disk-comparison harness from the external cache was discarded because Vite refused to load a script outside its project root before candidate code executed. It is not declared as verification evidence. Fresh runtime compliance instead comes from the passing in-repository repeat-output tests, full E2E, and Linux package harness above.

### Supported-Host and Physical-Evidence Boundary

| Boundary | Status | Disposition |
|---|---|---|
| Linux x64 repeat outputs | ✅ PASSED | Material files/report/ZIP and Custom files/report/ZIP repeat byte-identically in current tests |
| Linux x64 package/ASAR/runtime | ✅ PASSED | One current Linux x64 package and packaged runtime 2/2 passed |
| macOS | ➖ OUT OF SCOPE | Not a supported host for this release; no claim and no blocker |
| Windows | ➖ OUT OF SCOPE | Not a supported host for this release; no claim and no blocker |
| Physical visual receipt | ⛔ UNAVAILABLE / UNCLAIMED | Custom publication remains gated; no hardware parity claim |
| Physical BCSTM receipt | ⛔ UNAVAILABLE / UNCLAIMED | BCSTM capability remains gated; no playback parity claim |
| Generated report evidence | ✅ PASSED | Source/fixture `kind` is preserved; `softwareFixtureOnly: true`; `hardwareParityClaimed: false` |

### Spec Compliance Matrix

| # | Requirement | Scenario | Passing runtime evidence | Result |
|---:|---|---|---|---|
| 1 | Immutable Material compatibility profile | Validate a supported Material project | `index.test.ts` complete Material/parity project; live profile verifier | ✅ COMPLIANT |
| 2 | Immutable Material compatibility profile | Reject unsafe or unsupported input | `index.test.ts` malformed, empty, non-Material, newer, range, transition cases | ✅ COMPLIANT |
| 3 | Immutable Material compatibility profile | Prefer consuming evidence over prose | `capture.test.ts` pinned reads and consuming filename precedence | ✅ COMPLIANT |
| 4 | Deterministic diagnostics and acknowledgments | Acknowledge a warning | `index.test.ts` warning fingerprint acknowledgment | ✅ COMPLIANT |
| 5 | Deterministic diagnostics and acknowledgments | Invalidate stale acknowledgment | `index.test.ts` changed normalized value invalidates fingerprint | ✅ COMPLIANT |
| 6 | Explicit v1.3.0 feature boundary | Keep unsupported features out of the profile | `index.test.ts` table covers every named exclusion | ✅ COMPLIANT |
| 7 | Export gate and reproducible bundle | Export a valid Material project | `index.test.ts` folder/report/ZIP; `lifecycle.spec.ts` real Electron export | ✅ COMPLIANT |
| 8 | Export gate and reproducible bundle | Block unsafe or premature export | `index.test.ts`, `studio-ipc.test.ts`, `lifecycle.spec.ts` no-write gate | ✅ COMPLIANT |
| 9 | Export gate and reproducible bundle | Permit dependent Custom export only when complete | Exact compiler package, current-manifest receipt binding, IPC readiness ordering | ✅ COMPLIANT |
| 10 | Byte determinism | Repeat an export | `index.test.ts` and `custom-compiler-v1.test.ts` repeat files/report/ZIP on Linux x64 | ✅ COMPLIANT |
| 11 | Atomic capability publication | Interrupt a Custom publication | `export-writer.test.ts` interruption and deterministic recovery matrix | ✅ COMPLIANT |
| 12 | Physical screen and mode identity | Preview launcher-consumed Material fields | `preview.test.ts`; `lifecycle.spec.ts` dual 256×192 runtime | ✅ COMPLIANT |
| 13 | Physical screen and mode identity | Preserve legacy meaning without rendering it as authority | `preview.test.ts` preserved legacy evidence labeled `exported: false` | ✅ COMPLIANT |
| 14 | Honest fidelity labels | Show source-backed fidelity | `preview.test.ts`; E2E exact `launcher-vector-backed` label | ✅ COMPLIANT |
| 15 | Honest fidelity labels | Show an approximation honestly | `preview.test.ts`; E2E exact `Chromium approximation` label | ✅ COMPLIANT |
| 16 | Versioned Material project lifecycle | Create, save, and reopen a project | parity history, portable store, and E2E lifecycle | ✅ COMPLIANT |
| 17 | Versioned Material project lifecycle | Refuse an unsupported or newer format | migration/history/project-store refusal tests | ✅ COMPLIANT |
| 18 | Versioned Material project lifecycle | Migrate legacy data by save-as | migration and portable-store source-byte evidence tests | ✅ COMPLIANT |
| 19 | Canonical semantic operations | Replay committed edits | `parity-history-v1.test.ts` migration decision plus acknowledgment save/open replay | ✅ COMPLIANT |
| 20 | Canonical semantic operations | Apply a Material field edit | `parity-history-v1.test.ts` atomic `primaryColor`/`darkTheme` operations | ✅ COMPLIANT |
| 21 | Material-only offline boundary | Keep deferred capabilities blocked | E2E API excludes BCSTM; Custom receipt gate blocks publication | ✅ COMPLIANT |
| 22 | Material-only offline boundary | Enforce release dependencies | Custom missing-receipt E2E and BCSTM independent-gate test | ✅ COMPLIANT |
| 23 | Complete v1.3.0 visual package | Block an incomplete package | `custom-compiler-v1.test.ts` missing/mis-sized/misnamed/unauthorized cases | ✅ COMPLIANT |
| 24 | Complete v1.3.0 visual package | Accept a complete package | Exact 12 files, 230,496 bytes, provenance, hashes, receipt binding | ✅ COMPLIANT |
| 25 | Typed Custom JSON and safe ranges | Validate a real Custom layout | `custom-compiler-v1.test.ts` complete launcher layout | ✅ COMPLIANT |
| 26 | Typed Custom JSON and safe ranges | Reject unsafe or partial JSON | `custom-compiler-v1.test.ts` partial/off-screen/unsupported cases | ✅ COMPLIANT |
| 27 | Deterministic indexed visual codecs and evidence | Repeat codec generation | `codecs-v1-3.test.ts` XBGR555/A3I5/A5I3 goldens and repeatability | ✅ COMPLIANT |
| 28 | Deterministic indexed visual codecs and evidence | Bound a hardware claim | Named scenario 28 test preserves source/fixture `kind` and false hardware claim boundary | ✅ COMPLIANT |
| 29 | Atomic Custom diagnostics | Diagnose a short binary | `custom-compiler-v1.test.ts` exact expected/observed byte lengths | ✅ COMPLIANT |
| 30 | Visual-parity dependency | Block audio before visual parity | `bcstm-v1-3.test.ts` independent visual/readiness/receipt diagnostics | ✅ COMPLIANT |
| 31 | Visual-parity dependency | Enable audio after visual parity | `bcstm-v1-3.test.ts` enables pass-through only with all gate inputs | ✅ COMPLIANT |
| 32 | Evidence-backed BCSTM package handling | Accept supported BCSTM input | Strict fixture, source receipt, identity, paths, unchanged bytes | ✅ COMPLIANT |
| 33 | Evidence-backed BCSTM package handling | Reject unsupported audio | Signature/endian/offset/channel/loop mutation cases | ✅ COMPLIANT |
| 34 | Deterministic audio evidence | Repeat BCSTM handling | Repeated metadata/path/hash/pass-through equality on Linux x64 | ✅ COMPLIANT |

**Compliance summary**: 34/34 scenarios compliant; 18/18 requirements compliant.

### Correctness by Requirement

| # | Requirement | Status | Static/runtime evidence |
|---:|---|---|---|
| 1 | Immutable Material compatibility profile | ✅ Implemented | Exact root/tag/commit, 8 hashes, and manifest passed |
| 2 | Deterministic diagnostics and acknowledgments | ✅ Implemented | Stable ordering/fingerprints and acknowledgment invalidation passed |
| 3 | Explicit v1.3.0 feature boundary | ✅ Implemented | All excluded feature diagnostics passed |
| 4 | Export gate and reproducible bundle | ✅ Implemented | Material/Custom reports, checksums, provenance, and gates passed |
| 5 | Byte determinism | ✅ Implemented | Repeated Linux x64 files, reports, hashes, order, and ZIP bytes match |
| 6 | Atomic capability publication | ✅ Implemented | Prior output survives interruptions and staging never becomes ready |
| 7 | Physical screen and mode identity | ✅ Implemented | Two 256×192 screens and consumed-only Material semantics passed |
| 8 | Honest fidelity labels | ✅ Implemented | Exact labels and non-authoritative preview behavior passed |
| 9 | Versioned Material project lifecycle | ✅ Implemented | Canonical save/reopen, refusal, and non-destructive migration passed |
| 10 | Canonical semantic operations | ✅ Implemented | Serializable replay reproduces canonical state and acknowledgments |
| 11 | Material-only offline boundary | ✅ Implemented | Offline actions pass; Custom/BCSTM remain evidence-gated |
| 12 | Complete v1.3.0 visual package | ✅ Implemented | Closed 12-file, 230,496-byte manifest passed |
| 13 | Typed Custom JSON and safe ranges | ✅ Implemented | Complete typed objects pass; unsafe/partial inputs block |
| 14 | Deterministic indexed visual codecs and evidence | ✅ Implemented | Codec goldens and explicit software-versus-hardware report boundary passed |
| 15 | Atomic Custom diagnostics | ✅ Implemented | Exact file/path/range/observed-length diagnostics passed |
| 16 | Visual-parity dependency | ✅ Implemented | Independent visual and receipt gates precede BCSTM |
| 17 | Evidence-backed BCSTM package handling | ✅ Implemented conditionally | Strict DSP-ADPCM pass-through preserves bytes and rejects unsupported input |
| 18 | Deterministic audio evidence | ✅ Implemented conditionally | Linux x64 repeat behavior passes; playback parity remains unclaimed |

### Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| Strict `LauncherParityProjectV1` | ✅ Yes | Schema/profile/history boundary and refusal behavior exist |
| Save As migration | ✅ Yes | Legacy bytes remain exact, separate, and non-destructive |
| Split export routes | ✅ Yes | Renderer, preload, IPC, main, compiler, receipt, and writer ordering passes |
| Evidence-gated publication | ✅ Yes | Current 12-file hashes and receipts gate destination selection/publication |
| Linux x64-only initial support | ✅ Yes | Linux repeat/package evidence passes; macOS/Windows make no claim |
| Deterministic diagnostics | ✅ Yes | Stable ordering, fingerprints, exclusions, and exact observations pass |
| Honest preview | ✅ Yes | Exact fidelity labels and preserved non-exported evidence pass |
| Evidence-bounded reports | ✅ Yes | Material/Custom retain evidence `kind` and explicit no-hardware boundary |
| Later BCSTM pass-through | ✅ Yes | Visual/receipt gates and no-playback claim remain intact |

### Issues Found

**CRITICAL**: None.

**WARNING**

1. Physical visual and BCSTM receipts are absent. This remains compliant only while Custom/BCSTM capabilities stay gated and no hardware or playback claim is made.
2. Coverage is not configured, so no coverage percentage or threshold can be reported.
3. npm 11 warns that project config `node-linker` is unknown and will stop working in the next npm major version.
4. `packageManager` declares pnpm 10.15.0, but pnpm is unavailable; the explicitly requested npm verification path passed.
5. `openspec/config.yaml` still reports no test runner despite current package scripts; the capability cache is stale but did not control this verification.

**SUGGESTION**

- Refresh the SDD testing-capability cache in a later configuration task.
- Resolve the npm `node-linker` warning before the next npm major upgrade.
- Add physical receipts only when enabling the gated hardware-dependent capabilities; never infer them from fixtures.

### Evidence Revision and Canonical Preimage

The implementation/test/evidence candidate was hashed before execution and after cleanup using sorted `digest  path` lines with trailing newlines. OpenSpec artifacts are excluded. Both readings produced:

`sha256:3a5c94b4a62f8cc8b8405cd015948c621d929186a0b82102660b4c2c6d3118f8`

```text
0061bf0a83393c2e2635440dbe89b147994bd405f3f773867c1f66c2e19c9512  apps/studio/src/project-file-session.ts
040c14b1ed817862dd7a50eaa3bd5172d394683bd038682f013088c53b0deb46  packages/theme-core/src/preview.test.ts
051d6547b08f0723e6cabb19dd6089872176915494611ac99b2223db2906ba8e  packages/dspico-contract/src/bcstm-v1-3.ts
0ebd22539f7c8db724a85cf8f8ce15395e29aed9ee886daab2996c23ffe78ed7  packages/theme-core/src/parity-history-v1.test.ts
1c3b32ea0b86b4c84bfd4397cc75b970a1d20e29bf43ee982e1f1b2c266afec8  packages/dspico-contract/src/codecs-v1-3.test.ts
1d651e2fdaf21628b3367c71b41a1350924f77f3369fcd3ba5b6a6334b91b07a  packages/test-fixtures/src/capture.ts
242d46c474ebd3169282a91fc341a640e37d3f2ac5884b1cccce9163022a0a86  packages/theme-core/src/parity-migration-v1.test.ts
265bf72a9459523971a07849869b786f50b320685020fe283fa3e85ca674ff78  packages/theme-core/src/index.ts
28db97a87b19e387cfcf0a144892dd26f90ea7882d68fe7c81f3f69eb315a86a  packages/dspico-contract/src/profile-v1-3.ts
418ddbe7a451f1b2d029baf0f223c3d15c0aa824d0bb4fe42b837f35d781cefe  apps/studio/src/portable-project-store.test.ts
46ffca26b222680443c2bcb2f0fef8ad174c8ff20307ddfee1c184ccd64df0e7  packages/theme-core/src/parity-migration-v1.ts
4d3e2aea09ba2d4e7034110a62faaa85d76735f472f1341b4bf6396db49bc7a5  apps/studio/src/preload.ts
50180c38567bbf31d250659dfe0a3f61dc1c50d1342732851f622fe6a7fd7289  apps/studio/src/renderer/renderer-shell.test.ts
5c19e75813ad24273f7b39d9adf5215de9790cedb40b782bd89d19881f67bdef  packages/test-fixtures/src/capture.test.ts
61d5ee8dc8045c4201b3d3f1c86a7b52512b0da9395072455ae2a1e1eebf89bb  packages/theme-core/src/parity-model-v1.ts
6f1dee4164b3e9eb7b23dc60ffd09c4237e81ef4812d7ed716817528c86d63ec  packages/test-fixtures/evidence/pico-launcher-v1-3-profile.json
73c0c45a098c18135a2c71ccca7529f63c0e4f1b9b26d1dc19008d5fe696dedb  packages/test-fixtures/src/launcher-v1.ts
78379e807feaef29bfe9e77b0e917d80a7fd79c4c65043913ef3434743dcb0f1  e2e/lifecycle.spec.ts
89d9778fd35720813e52cd9aba714c18524b5e2bb8c85f89c0796255fe9e07aa  packages/dspico-contract/src/bcstm-v1-3.test.ts
8b8227c43d1951a5126836c0e74a5dd39b0b39930b51392200903f202d6e91c9  packages/theme-core/src/preview.ts
9679c4a2d216d8cfc1281e696d115f53455038c0cd0a044e40e8b2a5fed7f2c3  apps/studio/src/portable-project-store.ts
a953ef54d65e43b0d4f48c5a80b6c4d755a21575a8db8519eb4959ad0aec10b2  apps/studio/src/renderer/renderer.tsx
a9fcced8f9135c75262af302f34e1ed5e1ce99e6e72a30984cb27c3fb9469046  packages/dspico-contract/src/index.ts
aba2f06cca7febef1100d4843c0a9917eb9a4865e40711580f9045f118222217  packages/dspico-contract/src/custom-v1-3.ts
ae27e03c9c752f8c3f82cecb011858fe64b1d86c7540b36b764b5d5ad69b6143  packages/dspico-contract/src/index.test.ts
b59910ed746d3ac0e672d533d1f114b6498c60fb03e837bbddb02ae618be473b  packages/theme-core/src/parity-history-v1.ts
c240bacf365f8bc00aa8df68c3e2e9e8f21e59a0ba368dee1444a538f5c7efa7  packages/dspico-contract/src/codecs-v1-3.ts
dd2bf490f356eb8c6d02746a8e907f6d91eeeac44d59d4862cdfcfd7c6417acc  apps/studio/src/main.ts
dd970dc2334d0cdfa725585c5898d5cf5ff56dae6423f4a3e1ac5fb0fe1405b4  packages/test-fixtures/goldens/codecs-v1-3/codec-v1.json
ec98fd1eb6f6dbc39cd53d0f93d1ec68e89924af333cf3adf0b0d8250215e9e7  scripts/compare-theme-outputs.sh
f0b19a7d067876cfb762b3753bb651904736d8ee36521925b7616ed3ac706496  apps/studio/src/studio-ipc.test.ts
f40a22a106f9d31cbd813fc412b6736e32a74a5e57674bcc3a6e47a1636279c9  packages/dspico-contract/src/custom-compiler-v1.test.ts
f43b87fd9f1d3bebed95499c86fd9888670db069193ca50ac7239084f9d4e66c  apps/studio/src/studio-ipc.ts
```

### Cleanup and Process Evidence

- No production, test, configuration, task, or apply-progress bytes were edited.
- No native SDD operation, commit, push, PR, RDD, review lifecycle, physical operation, or cross-host claim occurred.
- Generated `.vite/`, `dist/`, `out/`, `test-results/`, `playwright-report/`, and `electron-packager/` paths are absent.
- No Electron, Playwright, or Vite process remained after execution.
- `git diff --check` passed, and the 33-path candidate identity remained unchanged.
- Verification command logs, manifests, and the exact candidate report are preserved under `/home/guill3/.cache/dspico-final-verify-linux-x64-20260805-fresh/`.

### Verdict

**PASS WITH WARNINGS** — all 18 requirements and 34 scenarios pass under the amended Linux x64-only supported-host scope. macOS/Windows are out of scope. Physical receipts remain acceptable only as gated, unavailable, and unclaimed evidence; the implementation currently preserves that boundary.
