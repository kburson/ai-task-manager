# Issue 1859 specification: review response r1

- Reviewer and revision owner: one GPT-6 Astra agent, medium reasoning.
- Initial draft author: the separate controller agent; Astra did not author r0.
- Method: full-document review; this same Astra agent owns subsequent revisions.
- Input: [spec.r0.md](spec.r0.md).
- Input SHA-256: `c5ba68a902f1629d7d47ea7e33c75ae169d3240b6ab997c9e7959f40641f0496`.
- Source baseline: `1b495236e9b9651c5ffd5ad67d4c7f43238ed44f`.
- Verdict: revise; six actionable findings, all accepted into r1.

## Full-document examination

Read every section: reported defect and source evidence, alternatives, CLI and
eligibility, schema and provenance, mutation/retry/readiness behavior,
normalization outcomes, acceptance coverage and boundaries. Compared the supplied
live issue AC1–4 and vc:1–8 with the document. Read the actual checkbox writer,
proof grammar, body invariants, versioned mutation wrapper, split-plan renderer,
Test completeness guard, projected Review evaluator, normalization implementation,
Review and Close consumers, local-trunk Close reader and relevant test fixtures.
The downstream report remains attributed evidence, not a reproduced failure.

## Findings and dispositions

### SAR-01 — P1: live freshness must not redefine terminal delivery authority

The draft applies checkout/branch/HEAD/file freshness to unspecified readiness
consumers. Close supports delivered and local-trunk evidence whose accepted SHA
and execution location need not equal the original recording checkout. See
`scripts/task-tracker/verbs/close.mjs:2494` and
`scripts/task-tracker/lib/local-trunk-close-read-port.mjs:21`. This would expand
scope into terminal delivery and could block a legitimate close after integration.
Develop/Test-only recording also needs honest recovery advice when stale evidence
is discovered in Review.

Disposition: r1 confines new live checks to authoring, readback and Test-to-Review
readiness. Close changes only diagnostic plumbing. Review recovery uses existing
operator-driven demotion/re-entry; no implicit transition or new terminal receipt.
Regression expectations now explicitly preserve delivered/local-trunk Close.

### SAR-02 — P1: missing-record language risks rejecting established proof

The draft does not distinguish checked items relying on reviewed evidence from
items carrying existing execution proof. The latter is already accepted by
`lineHasProof` in `scripts/task-tracker/lib/body-invariants.mjs:364`. Conversely,
`scripts/task-tracker/lib/test-exit-pre-close-completeness-guard.mjs:25` returns
success early with accepted Test evidence, so glyph checks alone cannot protect
the new route.

Disposition: r1 preserves established execution-proof routes and requires
reviewed-marker validation whenever that family is present. Missing both forms
and unchecked eligible narrative steps block independently of the accepted-Test
skip. Review, promotion and explanation share the complete evaluator.

### SAR-03 — P1: runtime metadata makes retry identity and current history ambiguous

A newly minted actor/timestamp changes the encoded record on every retry.
Selecting a current record only by binding can resurrect an earlier superseded
record when HEAD or artifacts return to old values. The existing writer retries
against fresh bodies (`scripts/task-tracker/lib/issue-body-mutate.mjs:197`), so
history selection cannot depend on a prior body snapshot.

Disposition: r1 defines a stable canonical request digest excluding runtime
metadata; equivalent retries retain the original actor/time. Append-only record
links identify one current chain head. Forks, broken chains and ambiguous heads
refuse; uncertain retries reconcile before appending. Explicit history/body limits
refuse without pruning. Uncheck retains history.

### SAR-04 — P2: raw line matching can select examples or ambiguous sections

`setChecklistLine` scans raw lines (`scripts/task-tracker/verbs/check.mjs:91`),
while existing completeness deliberately strips fenced examples
(`scripts/task-tracker/close-gate.mjs:25`). The proposed Scope eligibility needs an
explicit live-content parser and a content identity distinct from normalized
visible labels (`scripts/task-tracker/lib/ac-evidence.mjs:45`). Otherwise examples
can appear eligible and meaningful target changes may be missed.

Disposition: r1 requires one root Scope section, excludes fenced/commented
examples, shares parsing between writer and validator, specifies current checkbox
grammar and normalized label matching, and hashes target source content excluding
only glyph and reviewed-history markers. Adds corresponding negative cases.

### SAR-05 — P2: mandatory tick transition contradicts refresh and idempotence

The required one-target-tick delta excludes refreshing an already-checked target,
while the same document promises re-attestation. Existing desired-state semantics
already distinguish a changed glyph from a no-op
(`scripts/task-tracker/verbs/check.mjs:76`).

Disposition: r1 defines initial tick plus record, checked refresh plus record,
validated recheck with current evidence, and equivalent checked no-op. Unrelated
bytes remain protected. Tests must cover all four outcomes.

### SAR-06 — P1: Close throws fabricated drift before producing a decision

`evaluateCloseProjection` explicitly throws authority drift for ordinary unchecked
or lifecycle blockers (`scripts/task-tracker/verbs/close.mjs:3644`). Preserving
returned decisions inside normalization cannot repair a decision never returned.
The existing envelope contract also rejects indeterminate with empty refusals
(`scripts/task-tracker/lib/action-decision/evaluate.mjs:212`); an existing integration
fixture uses that malformed shape
(`scripts/tests/integration/task-tracker/lib/action-normalization.test.mjs:151`).

Disposition: r1 explicitly converts known Close prechecks into complete blocked
decisions retaining original labels/reasons. Unknown exceptions remain errors.
Every evaluator result is validated, including no-normalization paths. Malformed
fixtures must remain error cases, while valid blocked/indeterminate fixtures test
preservation before writes, retries and readback.

## Limits and next pass

This is a single Astra agent's iterative review, not independent peer review,
Plan approval, implementation verification or downstream reproduction. No runtime
source, lifecycle state, timer, Git commit or hooks were changed by this reviewer.
The first write attempt encountered the filesystem sandbox before changing any
file; the controller authorized normal per-command elevation for these documents.
R1 requires another complete document review; correcting these findings alone is
not a convergence claim.
