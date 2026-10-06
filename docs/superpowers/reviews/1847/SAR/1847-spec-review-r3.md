# #1847 Single Agent Review — round 3, terminal report

## Review identity

- Reviewer: GPT-6 Astra, the same agent that performed rounds 1 and 2 and
  authored their specification revisions.
- Effective reasoning-effort setting: not exposed to this reviewer.
- Reviewed artifact:
  `docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md`.
- Exact reviewed commit:
  `31ebcc2d1dedbcc46b57ac8e061575ab314734c2`.
- Source baseline:
  `4187a64fae6319808ec350f3beb0f126fc36769b`.
- Review mode: committed-artifact design review, read-only except this review
  transport document.
- Artifact identity check: the complete committed specification matched the
  round-2 authored transport text exactly.

## Verdict

**SAR converged: no remaining material design findings in the reviewed
specification at `31ebcc2d1dedbcc46b57ac8e061575ab314734c2`.**

No specification revision is required by this round. The selected design is
internally consistent enough to proceed as a Backlog input to Refine. This is
a design-review conclusion, not implementation verification or lifecycle
acceptance.

The same agent completed the requested review-plus-revise loop: round 1 found
and revised four material issues; round 2 found and revised three consistency
issues; round 3 reviewed the committed corrections and found no further material
design issue.

## Round-2 correction verification

| Finding | Reviewed specification | Round-3 assessment |
|---|---|---|
| R2-1: Recovery identity and root terminal outcome | Interface, lines 125–158; durable log, lines 423–461; recovery, lines 530–585 | Closed |
| R2-2: Legacy proof eligibility and surviving identities | Stage/editing rules; semantic identity, lines 256–264; invalidation, lines 299–321 | Closed |
| R2-3: Outer lock ordering | Writer serialization, lines 374–402 | Closed |

### Recovery lineage and terminal authority

The root transaction identifies the original revision. Each authorized operation
has a distinct operation ID and immutable proposal digest. A recovery can change
executor and observed state without violating the original proposal's immutability.

The issue has one ordered revision-event chain. A new original transaction cannot
start while one is pending. Recovery replaces the effective operation within the
same root lineage. The complete recovery proposal and additional archive are
durable, so another admitted checkout can determine which plan to resume.

Applied repair terminates the root fence and records the approved repaired result.
It does not leave an unterminated parent or silently substitute the original
target. A subsequent resume uses the effective repair plan and its recognized
write-set prefix. Exact event identities govern uncertain-publication
reconciliation.

The original-application sequence is read together with the explicit recovery
state machine: a new revision publishes its original prepared event; an
authorized successor uses the defined recovery transition rather than creating
another original preparation. Terminal and duplicate-transition rules prohibit
a second original preparation under the same transaction.

**Assessment:** No remaining material conflict among exact authorization,
immutable original history, changed recovery executor, effective-plan replay,
or one terminal result.

### Legacy preserved individual proof

The specification permits old individual proof only through a derived
`preserved-individual` disposition with exact archived proof identity/bytes,
surviving criterion identity, dependency hashes, and destination revision.
Consumers must also verify current dependencies.

This records continued eligibility of the original execution, not a new run.
It cannot introduce caller-provided proof or carry aggregate authority.
Changed/replacement criteria remain unchecked declarations. Canonical contracts
retain complete current-proof reset without a preservation exception.

The complete initial legacy identity map is frozen and resolved through explicit
successor mappings. Proof stamps, checkboxes, timing, and body-version changes
do not regenerate surviving identities.

**Assessment:** The declaration-only requirement, legacy preservation exception,
semantic identity rules, and aggregate invalidation policy now compose.

### Lock ordering and admitted topology

The strict interlocks are outermost, ordered by normalized repository and numeric
issue. Existing issue locks follow, then resource-local locks. Delegated callers
reuse runtime ownership; lower-level writers cannot first acquire a strict
interlock while already inside an issue/resource lock.

Multi-issue operations determine the lock set first or restart with the expanded
set. Live or uncertain holders cannot be evicted by age. The specification
distinguishes coordinator permission from mutation serialization.

The guarantee is confined to a registered common directory and its linked
worktrees on one host. Quiescence and supported-writer admission are explicit
deployment conditions. Independent clones, cross-host pending recovery, mixed
unsupported writers, and ungoverned GitHub editing are not presented as protected
by the local lock.

**Assessment:** No remaining material lock-order or topology contradiction.

## Round-1 closure confirmation

- **SAR-1, canonical Plan approval:** The missing authority-specific Plan adapter
  remains explicitly in #1847's scope. It preserves normal planning/source
  checks, stores current revision/contract binding, and is consumed by Plan
  exit and downstream guards. It is separate from revision authorization.
- **SAR-2, admission:** The design selects a concrete bounded local interlock
  rather than claiming that grants or comment appends are a distributed mutex.
- **SAR-3, recovery:** Full resource-state classification, successor approval,
  effective-operation replay, forward repair, and root termination are specified.
  Valid current canonical authority remains a prerequisite for a canonical write;
  unavailable authority is reported as a retained fence, not bypassed.
- **SAR-4, canonical proof:** Complete canonical invalidation follows the existing
  amendment model. Historical evidence stays historical; accepted IDs are not
  carried into the next epoch.

All four are closed at the design level.

## Additional material checks

### Authorization

The design uses the repository's existing trusted Codex user-message source
pattern. The runtime selects the transcript loader; the mutation request cannot
inject its path or observed contents. The exact proposal digest includes the
executor and operation identity. A new executor or changed proposal requires
new human-origin approval.

Attribution remains truthful when the host supplies no named principal. The
host-controlled transcript integrity boundary and unsupported-adapter refusal
are explicit. No new user-managed signing or identity infrastructure is required.

### Declaration versus execution

Preparation and application treat replacement VC strings as inert declaration
data and execute no verifier. Consolidated declaration/execution markers are
split without carrying execution properties to changed criteria. Preserved
legacy execution requires the bounded eligibility disposition. Aggregate
evidence is always invalidated on a semantic revision.

### Canonical and legacy compatibility

Authority resolution chooses the actual contract source. Canonical amendment
and canonical Plan approval are scoped extensions, not asserted baseline
capabilities. Draft canonical revision preserves draft status; sealed revision
uses the amended sealed-contract path.

Never-revised issues retain their existing evidence contracts. Recognized revision
history cannot fall back to a legacy path to ignore the fence or stale approval.
Unknown schema/binding formats refuse qualification.

### Crash and retry behavior

The review walked the specified states: untouched prepared transaction,
capsule-only progress, canonical projection ahead of body, completed after-state
without terminal, uncertain terminal publication, changed executor, authorized
repair interrupted again, and current canonical authority unavailable.

Each has a selected continuation or explicit refusal. Partial authority changes
cannot be aborted as untouched or rolled back into restored old proof. Local
journals do not replace the durable GitHub event history.

These were design-state checks, not executed fault-injection tests.

### Stages and scope

Backlog remains draft-only. Application does not move stages. Test and Review
require normal demotions before application. Every semantic revision invalidates
Plan approval, and Develop cannot exit on stale approval.

Done, closed, delivered, and actively transitioning issues refuse application.
Delivery history cannot be removed to make an issue editable.

The design excludes live ai-peer-review #124 edits, package work, unrelated
records, distributed locking, automatic revision approval, stage skips, and
unrelated refactoring. This SAR created no new issue or prerequisite chain.

## Repository evidence

Material baseline evidence used across the SAR, with targeted rechecks where
needed:

- `verbs/plan-approve.mjs:150–162`: directory authority refusal that the scoped
  canonical adapter must replace.
- `verbs/plan-approve.mjs:480–510`: normal checklist-command and story-binding
  checks that the adapter must preserve.
- `github-records/delivery-contract.mjs:273–310`: draft contract construction;
  draft revision/epoch behavior in the design is an explicit extension.
- `github-records/delivery-contract.mjs:376–403,422–473`: complete canonical
  invalidation and amendment semantics.
- `github-records/contract-write.mjs:171–201`: capsule-before-projection ordering
  and observable interruption states.
- `github-records/capsule-chain.mjs:243–324`: expected-head checks, publication,
  read-back, and fork detection without server-side atomic reservation.
- `github-records/coordination-authority.mjs`: grant authorization and governed
  replacement boundaries.
- `workflow-policy/authority-resolver.mjs`: closed authorization-source shape,
  user-message verification, exact statement hash, and trusted loader pattern.
- `issue-mutator-lock.mjs`: existing advisory lock, delegation, reentrancy, and
  stale-holder behavior distinguished from the proposed stricter interlock.

No implementation success, test result, or provider-refusal attempt is represented
as review evidence. This round inspected the committed design and used repository
source to assess its claims and selected integration work.

## Residual Refine and implementation obligations

These remain necessary future work, distinct from material design findings:

1. Confirm the selected local writer topology meets the intended deployment and
   consumer needs. A broader topology would require a deliberate design change.
2. Validate the trusted host adapter against actual runtime message formats and
   host-controlled source selection.
3. Complete the concrete producer/consumer entry-point inventory, including
   low-level writers, delegated processes, and repair paths.
4. Implement the specified closed schemas, strict outer interlock, durable event
   state machine, authority-specific amendment and Plan adapters, preservation
   checks, and current-revision consumers.
5. Execute the specified authorization, concurrency, fault-injection,
   identity-stability, preservation, and real end-to-end lifecycle tests.
6. Derive estimate, size, priority, and labels from the accepted scope at Refine.

Absence of that future implementation evidence is not a reason to invent further
design findings or prolong this SAR.

## Final authority statement

**Terminal SAR outcome: no remaining material design findings.**

The reviewed specification remains a Backlog draft pending Refine acceptance.
SAR convergence does not confer Refine acceptance, specification ratification,
AITM Plan approval, implementation authority, checkbox completion, or
ai-peer-review protocol acceptance. Those remain separate governed decisions.
