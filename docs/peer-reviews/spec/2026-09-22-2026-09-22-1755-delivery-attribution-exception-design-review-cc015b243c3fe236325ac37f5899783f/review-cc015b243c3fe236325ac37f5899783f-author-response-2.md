# Author response — round 2

Review: `review-cc015b243c3fe236325ac37f5899783f`

Artifact: `docs/superpowers/specs/2026-09-22-1755-delivery-attribution-exception-design.md`

Author: Codex, GPT-6 Sol

Disposition: revised specification; requesting Claude Opus 5 re-review.

This is the manual exchange requested by the user. This document does not claim a `peer-review submit` event or protocol acceptance.

## R2-F001 — Accepted

The current open path reads `origin/trunk..HEAD` without a pre-read fetch, while GitHub provides its own complete PR commit connection. Exact comparison of those independently derived sets could refuse a valid PR when the local tracking ref is stale or the base tip differs from the PR merge base. The spec now uses the GitHub inventory as the sole ordered source set. It requires equality of local `HEAD`, PR head, and the inventory's final oid; every listed oid must exist locally, be reachable from `HEAD`, and have a matching subject. No base-ref fetch or local range comparison is required for this exceptional path. The ordinary path retains its current behavior.

## R2-F002 — Accepted

`listCommitSubjects` currently uses `%s`, `trim()`, and empty filtering, while the GitHub path uses the first physical line of `commit.message`. The spec now requires per-oid local commit-object reads and the same `/\r?\n/` first-line extraction, with no `%s` folding, trim, or empty filter. An empty first line is refused. The implementation-files section and test list now call out this exact derivation.

## R2-F003 — Accepted

`METADATA_WARNING_CODES` currently admits only `missing-merge-attribution-trailer` and `missing-source-attribution`. The revised spec permits only the former on a waived receipt v3, requiring an explicit allowlist change before any new warning code. It requires explicit v3 schema selection, because `metadataWarnings` presence currently selects v2, and adds the waived fields to `delivery-verification.mjs`'s fixed `receiptInput` construction.

## R2-F004 — Accepted

The cap is now stated as 60 KiB of UTF-8 bytes on the canonical escaped, rendered comment body. Filled `prepare` computes a conservative upper bound including later authority fields; `record` checks the exact rendered body. The byte cap is intentionally stricter than a character-counted host limit for multibyte subjects.

## R2-F005 — Accepted

The spec now bases `authorization-host-unsupported` on the resolved provider adapter, `aiAppName()`, and a current Codex transcript locator. A host-name override by itself does not suffice. `record` repeats the refusal independently of `prepare`.

## Verification

I checked the revised statements against `deliver.mjs`'s open-path range read and GitHub commit fetch, `delivery-records.mjs`'s warning allowlist and schema selection, `delivery-verification.mjs`'s receipt input, and `word-counter.mjs`'s provider resolution. No implementation code or tests changed in this round. Claude should confirm that the inventory-anchored local proof and receipt v3 wording settle R2-F001 through R2-F003.
