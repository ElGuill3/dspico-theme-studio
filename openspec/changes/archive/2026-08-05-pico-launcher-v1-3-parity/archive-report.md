# Archive Report: Pico Launcher v1.3.0 Parity

## Closure

- **Change**: `pico-launcher-v1-3-parity`
- **Artifact store**: OpenSpec + Engram (hybrid)
- **Closed**: 2026-08-05
- **Status**: success; PASS WITH WARNINGS, intentionally non-blocking
- **Native dispatcher**: `nextRecommended=archive`; `dependencies.archive=ready`; `blockedReasons=[]`
- **Action context**: repo-local; workspace and allowed edit root `/home/guill3/Documents/Hobbies/dspico/dspico-theme-studio`
- **Review gate**: structurally absent. The dispatcher exposed only a `reviewOffer`; no review was discovered, so no receipt gate applied.

## Final State Authority

- Authority: Pico Launcher v1.3.0 at exact commit `b087565651c83081dd65552863f5efc2f28e489c`.
- Final implementation evidence revision: `sha256:3a5c94b4a62f8cc8b8405cd015948c621d929186a0b82102660b4c2c6d3118f8`.
- Final verification report hash: `4511dc073c426c8363eae4b1d738fc9b6b3c46aa14583429363ed56989caeb6d`.
- Final verification: PASS WITH WARNINGS; 7/7 tasks, 18/18 requirements, 34/34 scenarios, 227 tests, E2E 2/2, package/ASAR/runtime 2/2, and 0 blockers/critical findings.
- Linux x64 is the sole supported host for the initial release. macOS and Windows are out of scope until separately evidenced.
- Physical visual and BCSTM receipts remain absent and unclaimed. Capability, publication, hardware, and playback claims remain gated, compliant, and non-blocking.

The intermediate `apply-progress.md` and earlier verification snapshots recorded stale routing such as “fresh `sdd-verify`; do not archive.” Native final status and the final verification facts above supersede those intermediate route claims; the stale wording is preserved only as historical artifact content.

## Tasks Gate

The persisted OpenSpec and Engram task artifacts both show all seven implementation tasks checked. No task reconciliation was required.

## Specs Synced

| Domain | Action | Details |
|---|---|---|
| `dspico-compatibility-validation` | Updated | Replaced obsolete authority with v1.3.0 commit/profile, retained diagnostics scenarios, added the explicit unsupported-feature boundary. |
| `deterministic-theme-export` | Updated | Replaced export/determinism requirements, added dependent Custom gating and atomic capability publication, preserved safe destinations. |
| `material-dual-screen-preview` | Updated | Replaced generic scene semantics with consumed `primaryColor`/`darkTheme` behavior and preserved honest fidelity labels. |
| `offline-material-authoring` | Updated | Replaced lifecycle, semantic-operation, and release-boundary requirements; preserved branching/recovery. |
| `custom-visual-authoring` | Created | Mechanically copied the complete four-requirement v1.3.0 Custom specification. |
| `validated-bcstm-audio` | Created | Mechanically copied the complete three-requirement evidence-gated BCSTM specification. |

## Archive Contents

Archived folder: `openspec/changes/archive/2026-08-05-pico-launcher-v1-3-parity/`

- `exploration.md` ✅
- `proposal.md` ✅
- `specs/` ✅ (six domains)
- `design.md` ✅
- `tasks.md` ✅ (7/7 tasks complete)
- `apply-progress.md` ✅
- `verify-report.md` ✅
- `archive-report.md` ✅ (additive terminal record)

The active source directory `openspec/changes/pico-launcher-v1-3-parity/` no longer exists.

## Engram Traceability

Full artifact observations read before closure:

- Proposal: `#10783` (`sdd/pico-launcher-v1-3-parity/proposal`)
- Aggregate specs: `#10797` (`sdd/pico-launcher-v1-3-parity/spec`)
- Domain specs: `#10790` compatibility, `#10791` export, `#10792` preview, `#10793` offline, `#10794` Custom, `#10795` BCSTM
- Design: `#10800` (`sdd/pico-launcher-v1-3-parity/design`)
- Tasks: `#10803` (`sdd/pico-launcher-v1-3-parity/tasks`)
- Apply progress: `#10839` (`sdd/pico-launcher-v1-3-parity/apply-progress`) and final correction settlement `#10936`
- Verify report: `#10916` (`sdd/pico-launcher-v1-3-parity/verify-report`)

No Engram exploration observation or native review observations existed for this candidate.

## Mechanical Readback

The two new main-spec copies were verified with `diff -r` immediately after copying:

```text
custom-visual-authoring copy diff-r output: <empty>
validated-bcstm-audio copy diff-r output: <empty>
```

The complete change-folder move was verified against its pre-move recursive snapshot with `diff -r`:

```text
archive move diff-r output: <empty>
```

The `git mv` attempt reported the source directory as untracked/empty and the required native `mv` fallback completed the move; the mandatory recursive readback passed with no differences.

## Risks and Warnings

1. Physical visual and BCSTM receipts are absent; this remains safe only while dependent publication and parity claims stay gated.
2. Coverage is not configured, so no coverage percentage or threshold is available.
3. npm 11 reports the project `node-linker` configuration as unknown for a future npm major version.
4. The declared pnpm 10.15.0 is unavailable in the environment; the final npm verification path passed.
5. `openspec/config.yaml` contains a stale no-test-runner capability cache; it did not control the final verification.

No CRITICAL findings or blockers were present. No code edits, tests, commits, pushes, PRs, or RDD operations were performed by archive.
