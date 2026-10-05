<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-26997eff0c0ae32bf519416e6fa943fa"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-01-1859-reviewed-scope-evidence-design.md"
artifact_commit: "47d3b1992fcff5c3e79dd66aa4a5396666c740b6"
artifact_blob: "ccc18a57bfb5547f636806c5e4b24915254b564c"
artifact_digest: "sha256:85f1e2955149f25e10140f095d870f55d21f63910318d3ac87d779a96db953b9"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "gpt-6-astra"
  session_fingerprint: "sha256:ec5e5f99be5aed2ba8c242c7512b5c5173677c7962b3c3eba78436fd41234fc3"
  identity_source: "runtime"
started_at: "2026-10-01T18:25:35.480Z"
submitted_at: "2026-10-01T18:43:50.619Z"
finding_ids: []
answered_finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Addressed all four findings after checking the cited source. The revision makes
legacy adoption explicit, moves full record history to immutable issue comments,
defines verifier eligibility precisely and requires readiness in the bound
operator checkout. The normal terminal delivery boundary remains unchanged.

## Finding dispositions

- R1-F001 — Accepted. Only newly generated children with the explicit Scope policy
  marker receive whole-Scope evidence requirements. Unversioned hatch/web ticks
  retain existing behavior; explicitly recorded old targets validate individually.
  Accepted Test never bypasses an existing reviewed pointer. No historical evidence
  is synthesized and old Generated-by prose does not trigger adoption.
- R1-F002 — Accepted. Full records now live in append-only same-issue comments;
  bounded body pointers identify current records. Six pointers are at most 2,304
  bytes independent of refresh count. Twenty full refreshes retain at most 120
  comments at the specified limits. Body-capacity refusal includes a supported
  operator recovery for unrelated long-form prose. Comment-before-body ordering,
  orphan preservation, request-based reconciliation and concurrent successor
  refusal address the new two-resource transaction. Readiness validates current
  records, not an unbounded historical traversal.
- R1-F003 — Accepted. One pure verifier-bearing predicate covers consolidated and
  legacy declarations/proof, vc-list, visible vc:N references and AC/DoD markers.
  Recognized malformed forms refuse. Writer, mutation validation and readiness
  share the predicate; tests must cover each named representation.
- R1-F004 — Accepted. Realpath/branch/HEAD belong to the bound non-detached operator
  checkout. Explicit projectDir anchors all reads. Different linked/main/sandbox
  checkouts refuse with return-to-bound-checkout recovery. Sandboxes emit Test
  receipts that are consumed in the operator checkout; ignored attachments must
  survive there until readiness.

## Changes made

Updated schema storage and history semantics, bounded sizing and recovery,
compatibility/readiness rules, verifier eligibility, checkout identity, transaction
ordering and acceptance cases. Also incorporated the optional suggestions:
record after the final Develop commit, treat other same-line marker additions as
content changes, and name Review's dropped-decision rendering seam in AC3.

## Declined changes and rationale

None of the findings were declined. Selected durable issue comments over in-body
history compaction because repeated compaction would still need a durable store
for complete historical records and would enlarge marker-mutation authority.

## Verification

Compared the findings with check.mjs classifyUnverifiedTick, split-plan.mjs
renderScope, the accepted-Test completeness early return and the current
normalization/Review/Close seams already recorded by SAR. Targeted Prettier and
Markdown checks are run before submission; no runtime implementation or tests are
claimed. The comment storage and policy marker are proposed behavior requiring
the implementation tests listed in the revised specification.
