<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-03ff5087c2d09fdb34d6bf44fdb2928a"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-12-1219-tiered-test-execution-design.md"
artifact_commit: "3dcfecec1c6a64f25372e44bf71ab3d182e082c1"
artifact_blob: "b0071bed5c3738111d9e21a5b0f5333c8108a8a2"
artifact_digest: "sha256:93bc5ed4ec50214957e36152768ba769b79290b2c5c8b1359964f1ed3e05c567"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:b442aba55add2575a307df23836f008c2fd2f4224f4758748bf984fd912fefe5"
  identity_source: "runtime"
started_at: "2026-09-12T17:17:14.905Z"
submitted_at: "2026-09-12T17:37:27.506Z"
finding_ids: ["R3-F001","R3-F002"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Accepted. All three required turn-2 findings and all three optional suggestions
are resolved in the artifact at `3dcfecec` (879 lines, up from 847). I verified
each against the revised text rather than the author's description:

- `R2-F001` — Section 5.1 now closes the hole its own turn-1 remedy opened. The
  managed generator "must emit a transition run containing the union of the
  active policy's required coverage and the proposed policy's activation
  probes," and the coordinator "evaluates authenticated native outcomes and
  executed inventory against the protected-base requirement set; it does not
  require the base's job bodies or names to have run." The over-bound case is
  answered rather than deferred: an inexpressible, unreconciled, or over-budget
  union refuses delivery and must be decomposed into additive preparatory PRs
  that each satisfy the active policy, or wait for a reviewed bound change to
  land first, with the coordinator never accepting a partial union or silently
  raising a wall-clock limit. That makes the section 5.2 transition PR mergeable
  by a stated route instead of by exception, and it fails closed. Section 12's
  Mode transitions row now proves exactly this obligation.
- `R2-F002` — Section 9.2's RED row names `test-failure`, its UNKNOWN row names
  `authority-infrastructure` and `deadline-only`, and its closing paragraph
  delegates clearing to section 10 with the conditional complete-run rule stated
  correctly: authority-infrastructure "requires complete recovery validation only
  when coverage is indeterminate." The lease question is answered in both
  directions — section 8.3 calls the manual observation "a reconciliation
  operation without a repair lease because it does not authorize source or
  durable-authority repair," and section 10 narrows the lease itself to "any
  source or durable-authority mutation for a `test-failure` or
  `authority-infrastructure` incident," while keeping authority-infrastructure
  diagnosis and read-only reconciliation outside it. The added reclassification
  clause — if the manual observation exposes another incident, it reclassifies
  and follows the applicable lease rule — closes the path I would otherwise have
  asked about next.
- `R2-F003` — Section 1's cadence cell now reads `every-6h`, `every-8h`
  (default), `every-12h`, `daily`, or `weekly`, matching section 8.1 exactly.
- `R2-F004` — Section 6.4 keys admission on provider repository ID plus
  host/owner/name, requires exactly one configured authoritative remote, and
  refuses on a missing remote, conflicting remotes, or an unrecognized fork
  "instead of falling back to a path key" — the specific regression I was
  worried about. Fork-to-upstream contention requires explicit verified mapping.
- `R2-F005` — Section 9.1 replaces the unverifiable claim with an activation-time
  obligation: read the live ruleset, record the platform's actual bypass
  principal and granularity, and prove ordinary users, candidates, and test jobs
  cannot use it. The fallback is explicit — refuse direct publication and use a
  separately reviewed PR-mediated data-write contract or remain `full-pr` — and
  the document now says outright that it "does not record an aspirational
  workflow name as protection." This is the right disposition for a point where
  I could not confirm the platform's capability.
- `R2-F006` — Section 14 discloses the connectivity requirement and contrasts it
  with `full-pr`.

I re-checked the sections I had previously verified for regression: section 8.1's
closed cadence set, section 9.4's reframing of the head-authored job, and section
10's class definitions are all intact. Section 2.2's repository observations still
match what I measured in turn 1 (845/158/52, 1,055 total), and the artifact's
factual claims about `verify-develop.mjs`, `test-impact-selector.mjs`, the lane
definitions, and `ci.yml` remain accurate at the baseline it cites.

Two wording seams remain. Neither blocks acceptance, neither has an ambiguous
remedy, and both are recorded below as optional rather than required precisely
because a reader following sections 8.1 and 5.1 reaches the right behavior
anyway. The design is coherent, its failure modes fail closed, and its security
boundary is now stated where the trust actually lives.

## Findings

None.

## Required changes

None.

## Optional suggestions

### R3-F001 — Two UNKNOWN causes in section 9.2 have no incident class, while the row's action column admits only class-specific remedies

Section 9.2's UNKNOWN row enumerates four causes: "An
`authority-infrastructure` or `deadline-only` incident, no success after first
run starts, overdue obligation, or indeterminate execution." Its action column
reads "Block unrelated work; class-specific reconciliation/recovery only," and
the closing paragraph says "Clearing follows the class-specific rules in section
10."

Two of those causes are ordinary obligations rather than incidents. A changed
trunk whose due complete run has not happened is an overdue obligation with no
section 10 class, and section 8.3 confirms the manual observation cannot clear
"a due obligation for changed trunk." A first run that produced no usable result
is likewise stated in section 9.2 as UNKNOWN rather than never run, and has no
class. Read literally, the action column permits no remedy for either, because
no class-specific rule exists for them.

The behavior is not actually in doubt: section 8.1 step 3 already says that when
there is no valid success, the coordinator runs complete validation or the
authorized recovery path, and section 5.2 covers the first-run case. This is a
terminology seam, not a gap in the design.

A clause in the closing paragraph would close it — something to the effect that
an UNKNOWN arising from a plain due obligation or an unusable first run is
cleared by the ordinary due complete run in section 8.1 step 3, and that only
incident-classed UNKNOWN states route through section 10. That keeps the
promise that a reader can map an observed state to a permitted remedy without
inferring the correspondence, which was the point of the turn-2 reconciliation.

### R3-F002 — Add the transition bound to section 5.1's enumerated configuration contract

Section 5.1 now relies on a "separately configured finite transition bound" to
decide whether a union transition run may proceed, and section 12's Mode
transitions row makes the "explicit transition bound" part of the proof. The
enumerated configuration contract in the same section's opening paragraph still
lists only mode, provider/lane inventory, deterministic mappings, fixture-family
policy, local limits, remote limits, and the tiered-only schedule and health
settings.

Adding the transition bound to that list would keep the section's own inventory
of configuration complete, and would make it clear whether the bound is a
tiered-only value or applies to any managed-workflow change in either mode —
which matters because section 5.3's tiered-to-full-pr transition is also subject
to the union rule.

## Decision

accepted
