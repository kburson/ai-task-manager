<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-b6dab872f635853580a968c0ca954352"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-11-05-2156-spike-deliverable-writer-design.md"
artifact_commit: "48d9f3306ff8e3c7278647ece741ca67cc8cd0c1"
artifact_blob: "7296e37f7bc87ecc45c3110c84ef1f5b7883594e"
artifact_digest: "sha256:4097cb41cfcdf830e71fdbce524a5797fbf1a38da599b059a73646aca365ec07"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:9289af6373656e819643b5ba41787b2c686a71de5fbeed4455e1330583534b19"
  identity_source: "runtime"
started_at: "2026-11-05T10:36:53.054Z"
submitted_at: "2026-11-05T10:56:58.716Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Turn-2 re-review of `docs/superpowers/specs/2026-11-05-2156-spike-deliverable-writer-design.md`
at blob `7296e37f` (digest `sha256:4097cb41…`, commit `48d9f330`), against the
author's turn-1 response and my R1 findings. Re-read the full revised artifact and
rechecked `scripts/task-tracker/lib/issue-kind.mjs` (`DELIVERABLE_MARKER_RE:52`,
`PROGRESS_MARKERS_HEADING_RE:64`, section creation at `:95`, `parseDeliverablePosted`,
`setDeliverablePosted`).

**R1-F001 — resolved.** "Public behavior" no longer claims publication is bound to
HEAD. It now states that the clean tracked worktree/index at the unchanged HEAD is an
invocation precondition, revalidated around the write, not persisted in the
`(url, ts)` marker, and not durable source acceptance. It gives the rationale
(uncommitted runtime/source changes could alter the writer or misrepresent the later
verification subject) and explicitly disclaims HEAD stability after invocation.
Test/Review/delivery receipts retain sole source-acceptance ownership. This matches
`validateNoCommitDeliveryPreflight`, which never consults the marker for source.

**R1-F002 — resolved.** "Mutation, conflicts and readback" now defines the writer's
own scan: exactly one root `## AITM Progress Markers` section bounded by the next root
heading or end of body; absent/duplicate headings refuse; out-of-section occurrences
are ignored (matching existing consumers); every in-section claim under the existing
case-insensitive delimiter/name grammar counts regardless of well-formedness,
including bare, unterminated and fenced ones; more than one refuses; a single claim
must carry closed `url`/`ts`, a canonical ISO timestamp, and round-trip through
`parseDeliverablePosted` to the same values before a no-op is allowed. The
same-URL/non-canonical-`ts` case explicitly refuses rather than inheriting
`setDeliverablePosted`'s loose first-match no-op, and is in the verification list
alongside out-of-section examples, duplicate headings and malformed/unterminated
claims.

Checked one edge: refusing an absent section differs from `setDeliverablePosted`,
which creates the section when missing (`issue-kind.mjs:95`). This is consistent,
not a regression: the command requires spike kind, and `parseIssueKind` reads the kind
marker only from that section, so any admissible target already has exactly the
section the scan requires.

Optional suggestions were handled acceptably: exit codes (0/1/2) and the
`spike-deliverable:<category>` vocabulary are now named; the comment adapter fetches
the full field set and derives the login from the live `user` endpoint; the author
reports live verification that the #2146 report comments match that login; the
local-validator-plus-parity-regression choice over coupling to the epic verb is
justified; the audit/research gap is recorded as out of scope. Keeping operational
coordination content in the spec was declined with a stated reason, which is the
author's call.

## Findings

None.

## Required changes

None.

## Optional suggestions

1. The verification list could add one case for an in-section claim that differs from
   the canonical name only by case (e.g. `AITM-Deliverable-Posted`). The spec says the
   inventory uses the existing case-insensitive grammar, so such a claim counts and,
   alongside a valid one, must refuse as a duplicate. A test pins that the new scan
   really uses the case-insensitive grammar and not a stricter literal.

## Decision

accepted
