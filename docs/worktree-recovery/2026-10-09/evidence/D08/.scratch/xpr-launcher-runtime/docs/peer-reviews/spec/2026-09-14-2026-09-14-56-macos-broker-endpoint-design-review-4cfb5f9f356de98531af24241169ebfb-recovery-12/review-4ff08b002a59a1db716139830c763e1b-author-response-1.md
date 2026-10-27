<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-4ff08b002a59a1db716139830c763e1b"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "23b9f849c1aebff7a13b90c2b1aaadcec5ef3539"
artifact_blob: "e30ce667425c3dd6c956d95ee227816c0a2ea123"
artifact_digest: "sha256:34086abb9f80aa9e4731e0f43986c9969c95ae65cf23058a20fa7e5c833e9ec7"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:6fb402d9aaaee78b6d6cc7660d9c4397dcb9a9ba2810d0d15bb7cf930fc1d6ab"
  identity_source: "runtime"
started_at: "2026-09-14T18:33:41.212Z"
submitted_at: "2026-09-14T18:40:19.578Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

The revision makes metadata schema v1 exhaustive, preserves the retained-handle
discipline on the authority path, and adds verification for safe endpoint-parent
absence. It also closes the three optional precedence and summary ambiguities.

## Finding dispositions

- Finding 1 — accepted. Schema v1 now declares two closed optional groups,
  `unreconciled_predecessor` and `startup_collision`, with exact shapes and null
  semantics.
- Finding 2 — accepted. `openPrivateDirectory` now receives the retained
  `cacheRootHandle`; a cache-root pathname is explicitly insufficient.
- Finding 3 — accepted. The safe-absence endpoint-parent branch now has a
  dedicated test alongside the unsafe-replacement branch.

## Changes made

- Added closed metadata object shapes, state semantics, schema validation, and
  round-trip verification for predecessor and collision diagnostics.
- Declared missing/null POSIX layout versions and non-null Windows layout
  versions schema-invalid with broker-integrity handling.
- Corrected the authority-directory interface and extended pathname-rejection
  verification to both authority and endpoint chains.
- Added the safe-absence whole-user fence, evidence retention, no-recreation,
  no-unlink, and no-redirect verification case.
- Acknowledged the byte-exact Unicode-normalization false positive and its input
  convergence recovery.
- Corrected the data-flow summary so endpoint-root and endpoint-directory work
  happens only after the project lock is held.

## Declined changes and rationale

None.

## Verification

- Rechecked every required writer against the now-closed metadata schema.
- Ran `npx prettier --check` on the correction and this response.
- Ran `git diff --check` and scanned the corrected interfaces and verification
  matrix for contradictory remnants.
