# Round 2 Reviewer Review — Claude

- **Reviewer:** claude
- **Artifact:** `docs/superpowers/specs/2026-08-23-1381-governed-delivery-convergence-design.md`
- **Reviewed commit:** `bc079275f96e1c01e78b41127809c00e349c2426`
- **Decision:** accepted
- **Required supplements:** none active; none to acknowledge.

## Scope of review

Independent design review only. No implementation, plan, or artifact edit was
performed. Evaluated against the author's six submission questions: immutable
accepted-SHA authority, reused-branch handling, receipt/approval/trunk/idempotency
rules, lifecycle for Review/Test defects, acceptance coverage and non-goals, and
whether the design is precise enough to support a later plan without new policy
decisions.

## Verification performed

- Read the artifact at the reviewed commit in full.
- Cross-checked every issue in the Authoritative Incident Baseline against the
  Required-Outcomes table: all 19 issue rows (#1378, #1379, #1380, #1381, #1382,
  #1383, #1384, #1386, #1387, #1388, #1389, #1390, #1392, #1393, #1395, #1397,
  #1399, #1401, #1403) are assigned exactly one outcome family. Coverage is
  complete and non-overlapping.
- Cross-checked accepted-SHA / PR-head / merge-SHA consistency between the issue
  matrix and the PR baseline table for the exact-head cases (#1389→#1385,
  #1392→#1391, #1393→#1394, #1395→#1396, #1397→#1398, #1399→#1400, #1401→#1402,
  #1403→#1404). All exact-head pairings are internally consistent.
- Independently verified the spec's one concrete falsifiable claim against
  `package.json` (via file read, not shell): `npm run lint:docs` is **absent**
  and `npm run lint:md` **exists** (`markdownlint-cli2 "**/*.md"`). The remaining
  Verification-Contract commands (`npm test`, `npm run test:slow`, `npm run lint`,
  `npm run format:check`) all exist as declared. The self-catch in Root-Cause
  Family 4 and the Verification Contract is accurate.

## Findings

All findings below are **advisory and non-blocking**. None alters the accepted
decision; they are recorded for the implementation-plan and governed-issue-update
stages that follow approval.

### [finding:F-001] Verification claim independently confirmed (positive)

The spec correctly identifies that #1381 declares the nonexistent
`npm run lint:docs` and that the real Markdown verifier is `npm run lint:md`.
Confirmed against `package.json`. The design's insistence that a missing declared
verifier is a Test failure — not a documentation discrepancy — is the right
posture and is retained in-issue without a successor defect, consistent with the
no-new-point-defect governance property.

### [finding:F-002] Decision Summary scope range understates converged set

The Decision Summary states the story "integrates the point fixes already
discovered in issues #1384 through #1403." The Reconciliation Ledger and
Required-Outcomes table, however, also converge #1380, #1382, and #1383 (all
`incorporated`). The prose range is narrower than the actual governed set. This
is a narrative-precision nit only; the authoritative baseline matrix and ledger
tables are complete and correct, and they — not the summary sentence — drive
execution. Recommend widening or softening the range when the #1381 body text is
regenerated post-approval.

### [finding:F-003] Standing Full-Auto revalidation is an unstated operational precondition for the live acceptance

`recover-then-close` (#1389, #1392) and `close-delivered` (#1393, #1395, #1397)
depend on approval resolved as "Full-Auto evidence for accepted SHA; standing
policy must be revalidated." The Authority Model and Close Resolution sections
correctly require current session/project standing authorization at close time.
The consequence — that these closes will fail-closed if executed in a session
without standing Full-Auto policy — is correct by design but is not surfaced in
the Real Reused-Branch Acceptance or Verification Contract as an execution
precondition. Recommend the implementation plan record, in the live acceptance
evidence, the approval provenance and standing-policy state in effect at each
close so a fail-closed refusal is distinguishable from a genuine defect. No
design change required.

### [finding:F-004] Shared accepted SHA across #1382/#1383 — confirmed benign, worth an explicit note

\#1382 and #1383 share accepted SHA `e810084f0978de511078403406f008d1683fc10a`.
Because both are `incorporated` and the Incorporated lane resolves by ledger row
keyed on issue number (verifying carrier PR and carrier merge SHA) rather than by
exact-head PR selection, the "exactly one PR whose headRefOid equals the accepted
SHA" authority rule is never exercised for them and no ambiguity arises. This is
correct as written. Recommend the implementation harness include an adversarial
case asserting that two incorporated issues sharing one non-head SHA do not
collide in ledger resolution, to lock the property against future regression.

## Assessment against submission questions

- **Immutable accepted-SHA authority:** Coherent and consistently applied.
  `observedLocalHeadSha` is explicitly barred from replacing `acceptedSha` during
  recovery and close. Accepted.
- **Reused-branch handling (PR A then PR B):** Concretely grounded in real
  incident artifacts (#1397/#1401 on `codex/939-full-auto-merge`) plus a
  deterministic synthetic harness. Accepted.
- **Receipt / approval / trunk-containment / idempotency:** Fully specified,
  including lost-response reconciliation, fail-closed duplicate/divergent handling,
  and read-only retry semantics. Accepted.
- **Lifecycle for Review/Test defects:** Every Review/Test-state incident issue is
  classified (incorporated vs recover-then-close vs close-delivered) with a stated
  basis. Accepted.
- **Acceptance coverage and non-goals:** Acceptance Mapping, Rejected Approaches,
  and Scope Boundary are explicit and mutually reinforcing. Accepted.
- **Precision for a later plan without new policy decisions:** Sufficient. The
  resolver shape, selection order, mode gates, failure matrix, ledger schema, and
  disposition semantics leave the plan to choose filenames and test surfaces, not
  policy. Accepted.

## Decision

**accepted.** The specification converges the #939 incident and its defect set
into #1381 with complete, truthful per-issue disposition, a sound immutable-authority
model, well-defined idempotency and recovery, and explicit non-goals. Its single
concrete falsifiable claim is independently verified. The four findings above are
advisory refinements for the post-approval plan and issue-body update, not
blocking defects.
