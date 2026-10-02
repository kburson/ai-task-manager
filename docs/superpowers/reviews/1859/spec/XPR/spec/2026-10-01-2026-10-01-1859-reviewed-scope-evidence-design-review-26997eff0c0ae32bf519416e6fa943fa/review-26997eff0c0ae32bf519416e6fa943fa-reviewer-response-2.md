<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-26997eff0c0ae32bf519416e6fa943fa"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-01-1859-reviewed-scope-evidence-design.md"
artifact_commit: "2147677a1b3ac44fc735850b3a8b85aac9071cb8"
artifact_blob: "9b6febbbd730afa1705542c7286770f81eb66a1e"
artifact_digest: "sha256:696b7483439a92a87ad3264508c9070fb7e9c599279beaa3f782ed126652380a"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:ba9ab2d520084c0520c4b45e5a474836401980c6ba5abb5645340c4b5a5f2084"
  identity_source: "runtime"
started_at: "2026-10-01T18:27:16.529Z"
submitted_at: "2026-10-01T18:44:59.749Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I re-reviewed artifact commit `2147677a` against the four round-1 findings and
the author's response-1. All four are resolved in the spec text, not just in the
response.

- R1-F001 (legacy compatibility) — resolved in "Compatibility and readiness
  boundaries".
  - A new immutable `aitm-scope-evidence-policy:v1` marker, emitted only by the
    split-plan child-generation route, decides which bodies get the whole-Scope
    evidence requirement.
  - Unversioned legacy bodies keep today's unchecked-only completeness and the
    accepted-Test short-circuit (`test-exit-pre-close-completeness-guard.mjs:25`).
    Honest-hatch ticks (`classifyUnverifiedTick` returns `eligible` for narrative
    Scope) and web-UI ticks keep their current behavior.
  - Adoption is never inferred from dates, body versions or Generated-by prose.
  - Any present reviewed pointer is validated on its own, regardless of the
    accepted-Test skip, so an explicitly recorded target can't fall back to glyph
    authority.
  - Fixtures are named for every case I asked about.
- R1-F002 (body exhaustion) — resolved.
  - Full records move to same-issue comments. The body holds only a pointer of at
    most 384 bytes per target (comment ID, record digest, lineage ID), so body
    growth no longer depends on how many times records are refreshed.
  - The 60,000-byte preflight sits below GitHub's roughly 65,536-character limit.
  - The capacity refusal now comes with a concrete operator recovery that doesn't
    prune history.
  - The two-resource ordering (create and read back the comment, then body CAS)
    is spelled out. So are orphan preservation, request-digest reconciliation and
    concurrent-successor refusal.
  - Readiness validates only the current record, so its cost doesn't grow with
    history.
  - Checking the digest on every read handles GitHub comments being editable: an
    edited or deleted current comment blocks instead of being trusted.
- R1-F003 (verifier predicate) — resolved. There is one pure
  `isVerifierBearingScopeTarget` predicate shared by the writer, the mutation
  validator and the readiness guard. It names every representation I listed
  (consolidated `aitm-verified` with cmd/vc-list/ts/sha/evidence, legacy
  `aitm-verified-by`/`aitm-verified-at`, AC/DoD execution markers, vc-list
  attributes, visible `vc:N`). Malformed recognized prefixes refuse.
- R1-F004 (checkout binding) — resolved. The bound checkout is defined as
  physical realpath plus a non-detached branch and HEAD. Other linked, main or
  sandbox checkouts refuse, and the refusal names the bound checkout instead of
  suggesting a re-record. `projectDir` is passed explicitly instead of relying on
  the ambient cwd. Sandbox Test receipts are consumed back in the bound checkout,
  and ignored attachments must be kept until readiness.

The optional suggestions were also taken: record after the final Develop commit,
other same-line markers stale the record on purpose, and the
`verbs/review.mjs` decision-consumption seam is named in AC3.

I found no new blocking defects. The remaining items are wording-level
clarifications the implementation plan can settle, listed below as optional.

## Findings

None.

## Required changes

None.

## Optional suggestions

1. Recovering from a deleted or tampered current comment: the spec says such a
   comment blocks, and that successors name the expected current comment and
   digest. State that a fresh recording can supersede it using the predecessor
   descriptor already in the body pointer (comment ID, digest, lineage), without
   fetching the missing comment. That keeps a human deleting a comment from
   becoming a permanent block.
2. Lines 72 and 68 interact: "Mere prose/backtick examples without a recognized
   verifier/citation do not create an executable declaration" next to
   "standalone `vc:<positive integer>` citations in visible text". Say whether
   `vc:3` inside inline backticks counts as a citation (the conservative choice
   is yes, so it refuses) and cover it with a predicate fixture.
3. "Only these explicitly versioned legacy bodies" in "Compatibility and
   readiness boundaries" reads as a contradiction. Use "policy-marked bodies" so
   it doesn't get confused with the body-version marker.
4. Say whether the reviewed-evidence comment's GitHub author has to match the
   recorded runtime actor when it's read. That's cheap provenance hardening
   against a look-alike envelope posted by another account, even though the
   protected body pointer is already the authority.
5. Add `aitm-scope-evidence-policy` to the explicit marker-loss invariant list
   (`body-invariants.mjs::findLostMarkers`) in the plan so the "protect
   removal" requirement maps to a concrete, testable seam.

## Decision

accepted
