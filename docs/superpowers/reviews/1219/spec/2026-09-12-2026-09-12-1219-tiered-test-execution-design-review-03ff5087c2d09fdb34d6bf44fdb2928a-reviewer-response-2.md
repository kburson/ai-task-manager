<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-03ff5087c2d09fdb34d6bf44fdb2928a"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-12-1219-tiered-test-execution-design.md"
artifact_commit: "3006d3ac3b82c2b984142ee6005e0d489f8e5b09"
artifact_blob: "6c99f9b434bf7108900a645ca9278f82bd8b9010"
artifact_digest: "sha256:ced02d17da29f8530520b6dd2f308736f6e96bba23813aae791dbe1ece557cd9"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:b442aba55add2575a307df23836f008c2fd2f4224f4758748bf984fd912fefe5"
  identity_source: "runtime"
started_at: "2026-09-12T17:17:14.905Z"
submitted_at: "2026-09-12T17:30:26.685Z"
finding_ids: ["R2-F001","R2-F002","R2-F003","R2-F004","R2-F005","R2-F006"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

All nine turn-1 findings were accepted, and I verified each against the revised
artifact (847 lines at `3006d3ac`, up from 768) rather than against the author's
description of it. Eight are genuinely resolved:

- `R1-F001` — Section 9.4 now calls the head-authored job "an optimization and
  diagnostic, not a trusted enforcement boundary" whose success is "necessary
  platform evidence but never sufficient," and states that the out-of-candidate
  coordinator decision "remains authoritative even when those checks are green."
  Section 5.1 adds the mechanism: the coordinator loads policy and managed
  workflow semantics from the protected base, reads the candidate workflow as
  data, and compares its managed-section digest. Section 12's Protection row now
  demands proof that a candidate rewriting those jobs cannot obtain delivery.
  This is the right resolution and it is placed where the trust actually lives.
- `R1-F002` — Section 10 now defines `test-failure`, `authority-infrastructure`,
  and `deadline-only` classes with common fields, explicitly nullable
  class-specific evidence, per-class remediation, and per-class clearing
  observations.
- `R1-F003` — Section 8.1 replaces the range with the closed set `every-6h`,
  `every-8h`, `every-12h`, `daily`, `weekly`, anchors 6/8/12-hour slots at 00:00
  UTC, has daily select a UTC hour and weekly an ISO weekday plus hour, pins
  minute to zero, and rejects rather than rounds anything else. All three
  sub-day cadences do divide 24 cleanly, so the anchor is well defined.
- `R1-F004` — Section 8.3 adds the operator-dispatched trusted observation,
  correctly fenced: prior GREEN, exact same head, unchanged policy/environment,
  no intervening failure or changed-trunk obligation, provenance recorded, and
  explicitly unable to clear RED, other UNKNOWN causes, or changed-trunk debt.
- `R1-F005` — Section 9.1 makes the branch configurable with `aitm/tia-data` as
  default and specifies deletion/non-fast-forward blocking with the publisher as
  sole fast-forward writer.
- `R1-F006` — Section 9.4 states plainly that tiered governed mutation requires
  authenticated reachability, that offline or unreadable reads fail closed, and
  that no cached green authorizes mutation.
- `R1-F007` — Section 6.4 places the record in the platform user-scoped
  runtime/state directory outside every checkout, keyed by remote host plus
  owner/name rather than clone path.
- `R1-F008` — Section 12 gains the Health admission row covering exactly the
  four cases I raised.
- `R1-F009` — Section 14 now states the order-of-an-hour cost at the audited
  1,055-file inventory.

`R1-F001`'s remedy, however, introduced a new hole that the revision does not
close, and the new section 10 taxonomy was not propagated back into section 9.2,
leaving two normative statements in conflict. Section 1's summary table also
still advertises the cadence range that section 8.1 now forbids.

None of this reopens a settled decision or asks for rework of the accepted
remedies. R2-F001 is a gap created by the fix; R2-F002 and R2-F003 are
reconciliation the fix left undone.

## Findings

### R2-F001 — A PR that changes the managed workflow section now has no defined acceptance path, including the transition PR section 5.2 requires

The new section 5.1 paragraph states that a candidate changing the managed
workflow section "is a policy-transition proposal: it must satisfy the previously
active policy and cannot use its proposed jobs, dependencies, or check names as
authority for its own delivery," and that "the proposed policy becomes eligible
only after it lands on the protected default branch and passes transition
activation."

For same-repository pull requests, GitHub executes the head's workflow
definitions. The previously active policy's job bodies therefore never run on
such a candidate — only the proposed ones do. Requiring the candidate to satisfy
a policy whose jobs cannot execute leaves the coordinator with nothing it can
accept, so as written every managed-workflow change is unmergeable.

This is not a hypothetical edge. Section 5.2 mandates exactly such a PR: "The
reviewed change installs fast PR coverage, required health validation, complete
scheduling, durable publication, and recovery wiring." That PR necessarily
rewrites the managed section of `ci.yml`. Under the new rule it cannot authorize
its own delivery, and the base policy it must satisfy cannot run. The same
applies to any later maintenance of the managed workflow, and to the section 5.3
tiered-to-full-pr transition.

Section 5.1's older sentence — "Where a mode transition changes required
coverage, prove the stronger transition coverage and both sides' relevant wiring
before activating the new policy" — points at the intended answer but assigns it
to no mechanism. Nothing instructs the configuration tooling to emit a candidate
workflow that executes the union of old and proposed coverage, and nothing tells
the coordinator how to evaluate a candidate run against base-policy requirements
when only proposed jobs exist.

Close it by specifying, in section 5.1:

- That the managed workflow generator must emit, for a managed-section-changing
  candidate, a run executing the union of the previously active and proposed
  required coverage, so that old-policy satisfaction is observable on the
  candidate itself.
- That the coordinator evaluates the candidate's executed inventory and
  conclusions against the base policy's required set — inventory identity, not
  job-name identity — rather than requiring base job bodies to have run.
- What happens when the union cannot be expressed or exceeds the executor's
  wall-clock limit, since a full-pr-to-tiered transition on a suite of this size
  would have to run full-pr coverage plus the new tiered wiring in one candidate.
- That this union obligation is what section 12's Mode transitions row proves,
  which currently reads as if it only checks installation and verification order.

### R2-F002 — Section 9.2 still asserts the failure-only UNKNOWN rule that section 10's new taxonomy replaces

Section 9.2's closing paragraph is unchanged from turn 1: "Other UNKNOWN causes
require repaired authority and complete recovery validation."

Section 10's new `authority-infrastructure` class says the opposite in the common
case: it "clears when authority is repaired and a trusted observation establishes
an unambiguous state; if coverage is unknown, that observation must be an
accepted complete result." A complete recovery run is now conditional on
indeterminate coverage, not universal. A repository whose data branch had a
corrupt projection but whose last complete result is intact and unambiguous can
clear under section 10 without a complete run, and cannot under section 9.2.

Two further pieces of the taxonomy did not propagate:

- Section 9.2's RED row still reads "an unresolved failure incident remains" and
  its UNKNOWN row still enumerates raw causes, with no reference to the incident
  classes now defined. The state table and the incident taxonomy should share one
  vocabulary, so a reader can map an observed state to its permitted remediation
  without inferring the correspondence.
- Section 10 places the `deadline-only` class under "One expiring repair lease
  authorizes an incident" and says that class "authorizes the manual trusted
  schedule observation in section 8.3." Section 8.3 describes that operation as
  something "an operator may manually dispatch" with no lease precondition
  stated, and section 10's own opening list of always-available actions includes
  "health reconciliation." Whether clearing a scheduler miss requires first
  claiming a lease is therefore unresolved in the text.

Reconcile sections 8.3, 9.2, and 10 to one incident vocabulary: rewrite section
9.2's closing paragraph to defer to the class-specific clearing rules, reference
the class names in the RED and UNKNOWN rows, and state explicitly whether the
manual observation requires a held `deadline-only` lease or is available as
unleased reconciliation.

### R2-F003 — Section 1's summary table still advertises the cadence range section 8.1 now forbids

The section 1 mode table's "Scheduled complete validation" cell for `tiered`
still reads "Every six hours through once a week; default every eight hours."
Section 8.1 now permits exactly `every-6h`, `every-8h`, `every-12h`, `daily`, and
`weekly`, and requires configuration to reject "every other interval or
incomplete anchor instead of rounding or approximating it."

An adopter reading the summary table would reasonably configure a 36- or 48-hour
cadence, which the range permits and the normative section rejects. This is an
editorial fix, but the table is the document's most-read surface and it currently
contradicts a rule the revision just made strict.

Replace the cell with the enumerated set and the default.

## Required changes

1. Resolve R2-F001. Specify the union-coverage generation rule, the
   inventory-based coordinator evaluation, the behavior when the union is
   inexpressible or over budget, and the corresponding proof in section 12's
   Mode transitions row.
2. Resolve R2-F002. Rewrite section 9.2's closing paragraph to defer to the
   class-specific clearing rules, carry the class names into the RED and UNKNOWN
   rows, and state whether the section 8.3 manual observation requires a held
   `deadline-only` lease.
3. Resolve R2-F003. Replace the section 1 cadence cell with section 8.1's
   enumerated set.

## Optional suggestions

### R2-F004 — Define the admission key when the remote identity is absent or ambiguous

Section 6.4 now keys the host admission record by "stable repository identity
(remote host plus repository owner/name), not by a clone path," which resolves
the turn-1 concern. Three cases still have no defined key: a clone with no remote
configured, a clone with several remotes naming different repositories, and a
fork whose worktrees an author intends to contend with the upstream clone. State
which remote is authoritative, and state what happens when none exists. The
important part is that the fallback must not silently revert to path keying,
since that is precisely the clone-local behavior section 6.4 forbids.

### R2-F005 — Require activation-time proof that the platform can express the publisher as a ruleset bypass actor

Section 9.1 now requires a data-branch ruleset that "permits only the named
trusted publisher workflow identity to perform validated fast-forward writes;
ordinary users, candidates, and test jobs cannot push."

I am not confident that a GitHub repository ruleset can express a bypass actor at
that granularity — a specific workflow rather than an app, role, or team — and I
did not verify it from this session, so I am raising this as a verification
obligation rather than asserting a defect. If the platform cannot name a single
workflow, the achievable grant is likely coarser than the text implies, and the
difference matters because the section 9.3 security argument rests on candidates
and test jobs being unable to write.

Have activation prove the actual configured bypass set, record its real
granularity, and state the fallback if the platform cannot express it — for
example relying on the publisher's compare-and-swap and path/schema validation as
the enforcing layer while the ruleset provides only deletion and
non-fast-forward protection. Section 9.1 already requires those publisher-side
controls "even for that bypass actor," so the fallback is mostly a matter of
saying which layer is load-bearing.

### R2-F006 — Carry the offline-mutation consequence into section 14

Section 9.4 states the fail-closed offline rule clearly, but section 14's
consequences list still mentions only CI outages and the bounded recovery route.
The practical effect worth disclosing alongside the others is that tiered mode
makes every governed mutation require connectivity, so local work on a plane or
a disconnected network is limited to read-only diagnosis. That is a defensible
trade, and section 14 is where an adopter comparing the two modes will look for
it.

## Decision

revisions-requested
