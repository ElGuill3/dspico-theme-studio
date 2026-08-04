# Portable Theme Project Assets Specification

## Purpose

Define a movable, recoverable bundle whose JSON and immutable user assets remain one authority.

## Requirements

### Requirement: Portable bundle boundary and addressing

The project MUST be a directory bundle selected as one root. `project.json` MUST be at the root; user-owned PNG bytes MUST be below `assets/sha256/<lowercase-sha256>.png`; JSON references MUST be normalized relative POSIX paths inside that root and MUST NOT be absolute, parent-traversing, ambiguous, symlink-escaping, or renderer-local. Copying/moving the complete directory MUST preserve reopenability; generated exports MUST NOT become source authority.

#### Scenario: Copy and reopen a bundle

- GIVEN a saved root containing `project.json` and referenced assets
- WHEN the whole directory is copied or moved and opened
- THEN the same ID, hashes, layers, history, and render result are recovered

#### Scenario: Refuse an external reference

- GIVEN `project.json` references an absolute, parent, backslash, or symlink-escaping path
- WHEN the bundle is opened
- THEN opening is blocked, original bytes remain untouched, and the reference is diagnosed

### Requirement: Immutable bounded PNG ingestion

The first release MUST accept PNG only. Ingestion MUST verify magic bytes and dimensions before decoding, enforce fixed product-visible byte, decoded-dimension/pixel, and project-count limits, compute lowercase SHA-256 over source bytes, and store immutable content-addressed bytes. Identical bytes MUST deduplicate; names/extensions MUST never grant trust.

#### Scenario: Import and deduplicate a PNG

- GIVEN two imports contain identical valid PNG bytes with different names
- WHEN both are accepted
- THEN one immutable hash identity is used by both layer references

#### Scenario: Reject spoofed or oversized input

- GIVEN a `.png` has invalid magic, dimensions, or a published limit violation
- WHEN import is requested
- THEN no asset or project operation is committed and the violated limit is reported

### Requirement: Normalized pixels and provenance

Accepted PNGs MUST yield repeatable top-left, straight-alpha RGBA8 pixels under the pinned color policy; metadata MUST NOT cause host-dependent orientation or color changes. Each asset MUST retain original name, source/URL, author/credit, license/terms, notice, intended use, and an explicit rights-to-export assertion. `reference-only` assets MUST be excluded from export.

#### Scenario: Record rights before exportability

- GIVEN a decoded asset lacks required rights or license metadata
- WHEN the user attempts to mark it exportable
- THEN it remains reference-only and export reports missing provenance

#### Scenario: Repeat normalization

- GIVEN the same PNG bytes are imported on two supported hosts
- WHEN normalized pixels and policy identity are inspected
- THEN dimensions, pixels, alpha representation, and policy identity are identical

### Requirement: Commit-last recovery and safe reachability

Asset bytes MUST be verified and durably staged before `project.json` can reference them. A crash MAY leave an unreferenced orphan, but MUST NOT leave JSON pointing to missing or mismatched bytes. Reopen MUST detect missing, corrupt, and orphan assets without silent replacement; retention/garbage collection MUST preserve current, snapshot, and undo/redo reachability.

#### Scenario: Recover after a crash before JSON commit

- GIVEN ingestion stages bytes and the process stops before project commit
- WHEN the bundle is reopened
- THEN the prior project remains authoritative and the orphan is reported for recovery/removal

#### Scenario: Detect corruption

- GIVEN a referenced asset is missing or no longer matches its SHA-256 path
- WHEN the project is reopened
- THEN it is not silently repaired or exported and a blocking diagnostic identifies the asset

### Requirement: Offline sandbox asset boundary

Import, decode, verification, and reads MUST remain offline and main/core-owned behind narrow validated IPC. The renderer MUST receive only approved metadata, pixels, thumbnails, or render data; raw paths, Node APIs, shell commands, external converters, and network access MUST NOT cross the boundary.

#### Scenario: Attempt a forbidden asset read

- GIVEN the renderer requests a raw path, network URL, shell command, or converter
- WHEN the request reaches the application boundary
- THEN it is denied and no project or asset state changes
