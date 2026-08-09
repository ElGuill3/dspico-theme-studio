# Cartridge Test Handoff Specification

## Purpose

Define a safe physical-test exchange and reusable visual evidence without turning candidate bytes into a publishable cartridge package.

## Requirements

### Requirement: Separate NOT READY cartridge handoff

The system MUST generate a separately labeled `NOT READY — CARTRIDGE TEST ONLY` handoff containing candidate visual bytes, optional prepared WAVs, target identity, hashes, and test instructions. It MUST NOT create a ready ZIP, compatibility claim, direct installation, or ordinary-export approval from this handoff.

#### Scenario: Generate a physical-test handoff

- GIVEN candidate bytes are needed to obtain physical evidence
- WHEN the user requests the cartridge-test handoff
- THEN the handoff MUST be marked not ready and MUST include exact component hashes and instructions

#### Scenario: Keep handoff separate from export

- GIVEN a handoff exists but a required receipt or validation gate is absent
- WHEN the user requests ordinary export
- THEN export MUST remain blocked and the handoff MUST NOT be treated as a ready artifact

### Requirement: Reusable full-manifest visual receipts

A visual receipt MUST bind receipt/schema version and component, tester, device/cartridge and launcher build, ISO-8601 test date, the complete ordered manifest with file SHA-256 values, profile and codec/policy hashes, non-empty observations, and explicit pass/fail. A passing receipt MAY be reused across projects only when every visual manifest entry and all bound identities match exactly; project name and path MUST NOT establish validity.

#### Scenario: Reuse identical visual evidence

- GIVEN two projects have identical complete ordered visual manifests, profile hash, and codec/policy hashes
- WHEN the second project requests visual evidence
- THEN the passing receipt MAY be reused without another visual test

#### Scenario: Refuse incomplete or mismatched evidence

- GIVEN a manifest entry, profile hash, codec/policy hash, observation, or receipt identity differs or is absent
- WHEN receipt reuse is evaluated
- THEN the receipt MUST be rejected and visual readiness MUST remain blocked

### Requirement: Component-scoped receipt staleness

The system MUST invalidate evidence by affected component: visual edits invalidate reusable visual receipts, BCSTM replacement invalidates its source receipt, and WAV recipe changes alter project output but MUST continue to use capability-level WAV evidence rather than require a per-project receipt.

#### Scenario: Invalidate only affected evidence

- GIVEN valid visual, WAV capability, and independent BCSTM evidence
- WHEN one component's bytes or recipe changes
- THEN only the affected component's receipt or gate MUST become stale, with no cross-component promotion
