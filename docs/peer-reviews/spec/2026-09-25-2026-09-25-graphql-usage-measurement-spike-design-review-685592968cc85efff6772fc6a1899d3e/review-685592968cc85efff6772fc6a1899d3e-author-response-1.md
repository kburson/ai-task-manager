<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-685592968cc85efff6772fc6a1899d3e"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-25-graphql-usage-measurement-spike-design.md"
artifact_commit: "b0e9c6897f09418bef886e505c369fd02a341b9f"
artifact_blob: "3dccf9eae14c5060df42956268a561b22dc3bef0"
artifact_digest: "sha256:863337a74957ab88a549e1d4cc693c7af873c13c682e5fd9695e282a87f10e04"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:290f380b468b3c8b3ed7fcb5ee7a936dccade3481b185d9c0614cd38f3826e76"
  identity_source: "runtime"
started_at: "2026-09-25T21:58:50.372Z"
submitted_at: "2026-09-25T22:04:46.763Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Accepted both required findings and incorporated the three optional clarifications.
The report's common-root boundary is now explicit and AC6's comparison contract
uses the same complete-cost gate as AC5.

## Finding dispositions

- **Finding 1 (common-root identity) — Accepted.** Added `commonRootId` to observations and manifest rows,
  derived consistently from the canonical absolute common-directory path on the
  local machine. Reports declare their single aggregated root, classify manifest
  rows for other roots as `out-of-root`, and reject foreign-root observations from
  totals. The minimum concurrent sample explicitly requires two worktrees sharing
  that report root. Separate-clone/account-wide completeness is not inferred.
- **Finding 2 (AC6 point-reduction gate) — Accepted.** AC6 now supports measured volume reductions with coverage
  limits and conditions point-reduction claims on the complete-coverage gate for
  the compared group in both intervals, with matched coverage and workload.

The reviewer body's two required changes are addressed by title here. Its sealed
`finding_ids` array is empty; the package rejected literal unsealed finding IDs
in the first submit attempt. This response therefore preserves the empty sealed
ID set while dispositioning both substantive changes. No package-generated
protected metadata or finding authority was edited manually.

## Changes made

The point-gate section explicitly states that groups containing mutations cannot
pass under the current unavailable-cost policy. They select volume before the
run, unless an exact mutation source is subsequently demonstrated.

Common-root resolution now falls back from unsupported `--path-format` to plain
`--git-common-dir`, resolving relative output against the exact consuming-worktree
cwd and validating the directory before probing. Failures receive a distinct
resolution-unavailable diagnostic rather than a permission/storage label. This
avoids relying on an unverified minimum-version assertion.

The builder/shim sentence now names the shim as the single record owner instead
of using an ambiguous pronoun. Only the builder strips its private response alias.

## Declined changes and rationale

None. Cross-clone aggregation remains outside this spike; explicit root coverage
makes that boundary observable without silently widening the collection scope.

## Verification

Prettier and repository Markdown rules check the revised spec; Markdown checks
also cover this editable response body while preserving protocol frontmatter.
`git diff --check` checks whitespace before the package submission. Only the
spike spec and pending author response are edited. No GitHub request or runtime
implementation is part of this specification revision.
