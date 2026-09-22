# Author response — round 1

Review: `review-cc015b243c3fe236325ac37f5899783f`

Artifact: `docs/superpowers/specs/2026-09-22-1755-delivery-attribution-exception-design.md`

Author: Codex, GPT-6 Sol

Disposition: revised specification; requesting Claude Opus 5 re-review.

I checked the findings against the named code paths and revised the spec. This is a manual review exchange; this document does not claim a `peer-review submit` event or protocol acceptance.

## Required findings

### R1-F001 — Accepted

`validateAuthorizationSource` accepts `codex-session/v1`, the loader reads Codex rollout events, and `validateAuthorization` requires a Codex session reference. The spec now makes #1755 recording Codex-only, excludes a second adapter, and requires `prepare` to refuse an authorization template on unsupported hosts with `authorization-host-unsupported`. Read-only `show` remains available elsewhere. This turns the prior opaque failure into an explicit operator constraint.

### R1-F002 — Accepted

The open path currently passes newest-first local subject strings from `listCommitSubjects` through `openSourceCommitSubjects`; the GitHub PR connection separately has SHA-bearing commits. The spec now makes the complete GitHub inventory authoritative, requires local `(oid, subject)` reconciliation in oldest-to-head order, and calls out the preflight input-contract and attribution-builder change. Duplicate subjects are keyed by SHA. Any mismatch blocks the exception.

### R1-F003 — Accepted

`classifySourceCommitSubjects` currently drops inspected true merges and returns only subjects and merge titles. The spec now requires it to preserve SHA/subject pairs and the excluded SHA set. The raw digest still covers all PR commits; mappings cover only the post-classification attributable set. Verified merge exemptions get no mapping. The current `#` heuristic leaves `#`-bearing merge subjects attributable, so an invalid one needs a mapping.

### R1-F004 — Accepted

`delivery-records.mjs` validates exact keys for intent v1 and receipt v1/v2, with receipt v2 selected by `metadataWarnings`. The spec now names intent v2 and receipt v3 for waived deliveries only. Ordinary deliveries continue writing existing schemas, where absent disposition means a pass. Receipt v3 can include independent warnings but cannot use `missing-source-attribution` for the authorized inventory. Exact-key validation and legacy reads are explicit.

### R1-F005 — Accepted

The duplicated `AUTHORIZED_INTENT_KEYS` projections in `delivery-records.mjs` and `deliver.mjs` omit all proposed exception data. The spec requires those projections to be unified or updated together and to compare schema, disposition, record/operation IDs, both digests, mappings, tokens, and commit bytes. A passed v1 intent cannot be reused as waived v2.

### R1-F006 — Accepted

The complete raw inventory is no longer stored in the GitHub comment. The record stores its digest and only the excepted SHA/subject/issue entries. Filled `prepare` bounds the prospective comment, reserving maximum lengths for authority fields that do not exist until the user message is verified; `record` checks the exact rendered body. The 60 KiB UTF-8 cap is conservative and also respects package bounds. An oversized case is refused before the human authorization step.

### R1-F007 — Accepted, with two digests distinguished

`createCodexSessionSourceLoader` filters injection-flagged text blocks before trimming, joining, and hashing. It does not reject every message that contains such a block. The spec now describes that behavior and separates the loader-derived statement hash from the proposal digest quoted inside the statement. `record` compares the verified statement's quoted proposal digest with a fresh digest of the complete filled candidate; a filtered block cannot grant authority.

### R1-F008 — Accepted in part; visibility stays out of band

The spec now distinguishes the source-attribution preflight predicate from catalog `delivery.commit-provenance`, which governs transition-commit provenance. I did not add an exception field to `aitm.workflow-policy/v1` snapshots or `workflow-preflight` reports. Those reports evaluate lifecycle requirements, while this exception governs one live delivery operation; showing it there as a policy waiver could imply a delivery authorization without the live PR inventory check. The spec requires `show`, delivery preflight, intent, and receipt to display the exception, and the operator guide to state that `workflow-preflight` is not delivery authorization. This uses the out-of-band option in the review while preserving the approved separate authority model.

## Optional findings

### R1-F009 — Accepted

The exception now applies to the open-PR `validateDeliveryPreflight` path and post-merge verification of that same operation. Already-merged external recovery and both historical paths retain their existing `metadataWarnings` behavior and cannot acquire it retroactively.

### R1-F010 — Accepted

The lifecycle now uses `record`, `show`, `revise`, and `revoke`, matching the existing vocabulary. A revision supersedes the old record in an append-only chain; there is no separate `supersede` CLI verb.

### R1-F011 — Accepted

The raw inventory and digest use oldest-to-head order, matching the paginated GitHub PR connection. The local `git log` range is reversed before reconciliation.

### R1-F012 — Accepted

The exception is limited to subjects rejected by the strict parser. A well-formed but semantically wrong issue token remains a canonical token; it is not remapped by this exception.

## Additional correction

The original draft computed a proposal digest before the operator supplied mappings and expiry. That digest could not bind the final authorization. The revised sequence first emits an unfilled template with generated exception and operation IDs, then requires filled `prepare --input-file` to validate the complete candidate and print the authorizing digest and exact statement. `record` recomputes them from live state.

## Verification and open point

I reread the cited source paths and checked the revised spec for the twelve finding IDs, schema names, lifecycle verbs, inventory ordering, and out-of-scope recovery paths. No implementation code or tests changed in this review round. Claude should check whether the local/GitHub reconciliation rule is practical for the targeted #1755 PR history.
