# #1847 Single Agent Review — round 2 and revision disposition

## Identity and scope

- Reviewer and revising author: GPT-6 Astra, the same agent as SAR round 1.
- Effective reasoning effort: not exposed to this reviewer.
- Reviewed artifact: `docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md`.
- Reviewed commit: `854d2448969db48816f2916adc2f8f877c1ca396`.
- Source baseline: `4187a64fae6319808ec350f3beb0f126fc36769b`.
- Review mode: design review followed by authored corrections in the same round.
- Output revision: the same specification filename, transported in
  `.scratch/gh/1847-sar-revised-spec-r2.md`.
- The parent mechanically saves and commits the authored revision. Its resulting
  commit is the input to the next SAR round.

This review read the exact committed artifact using `git show`. It checked
material design consistency and repository integration boundaries. It did not
require an implementation or code-test proof to assess the design.

## Verdict on the reviewed commit

**Revision required; corrections authored in this round.**

Round 1's canonical Plan-approval and canonical proof-reset findings are closed
at the design level. Its ownership and recovery findings were substantially
addressed, but the new recovery protocol contained an identity contradiction and
needed an explicit terminal relationship. Two additional consistency gaps
affected legacy preservation and lock ordering.

These three findings have been corrected in the accompanying full specification.
This is not yet a terminal clean report: the next round must review the committed
corrections.

## Findings and dispositions

### R2-1 — P1: Recovery proposal identity contradicted transaction immutability

**Reviewed pointers:** Lines 125–153, 392–415, and 472–512; sections
“Interface,” “Durable revision log and fence,” and
“Recovery, abort, and forward repair.”

The specification required a new sealed recovery proposal and new authorization
for another executor or changed observed authority. It also stated that reusing
a transaction ID with different proposal bytes was a conflict. A recovery
therefore could not both preserve the original transaction identity and change
its executor/observations as required.

Using a new transaction implicitly instead would leave a second ambiguity:
the document did not specify how a repair's terminal result cleared the original
transaction's pending fence. An interrupted repair also needed durable access to
the actual effective repair proposal, not merely the original prepared archive.

**Correction authored:**

- Distinguish immutable root transaction identity from per-operation identity.
- Add `operationId` to sealed proposals and revision events.
- Reject changed bytes for an existing operation ID and reject a second original
  preparation under an existing root transaction.
- Define one ordered issue revision-event chain, initial preparation, authorized
  replacement of its effective operation, and one terminal outcome for the root.
- Require `recovery-authorized` to archive the complete new proposal,
  observations, and any additional original bytes.
- Define applied repair as closing the original fence while recording both
  the originally intended result and the approved repaired result.
- Reconcile event IDs and bytes before retrying uncertain publication.
- Resume the effective plan's recognized prefix without rederiving it from a
  partially changed body. A later resume of a repair follows that repair plan.
- Distinguish new-revision before-state validation from recovery progress
  validation.

The correction adds no new external recovery service or approval product.

**Disposition:** Addressed in authored round-2 revision; verify committed
state-machine text in round 3.

### R2-2 — P2: Legacy preservation conflicted with declaration-only and binding rules

**Reviewed pointers:** Lines 209–213, 249–253, and 274–298; sections
“Stage and editing boundaries,” “Semantic identity and digest,” and
“Current-proof invalidation and historical preservation.”

The specification allowed unchanged legacy individual proof to survive but also
required all resulting criteria to have declaration-only citations and said
unbound old evidence could not qualify. An implementation following the stricter
sentences would discard or refuse the very individual proof the invalidation
table promised to preserve.

The identity paragraph also needed to say explicitly that body-version and
proof-stamping changes do not regenerate the survivor IDs originally derived
from a before-body digest.

**Correction authored:**

- Limit declaration-only replacement requirements to changed/replacement criteria.
- Add a derived `preserved-individual` disposition identifying exact archived
  proof bytes, criterion identity, dependency hashes, and destination revision.
- Permit only that exact legacy individual proof to qualify through the
  disposition, subject to fresh dependency validation.
- State that this is continued eligibility of historical execution, not a new
  execution receipt or a fabricated claim of original revision binding.
- Keep aggregate evidence wholly excluded from preservation and keep canonical
  reset complete.
- Freeze a complete initial legacy identity map; resolve survivors through its
  successor mappings rather than recomputing IDs from mutated body bytes.

**Disposition:** Addressed in authored round-2 revision. Canonical carry-forward
remains excluded; no general evidence-migration subsystem was added.

### R2-3 — P2: Two lock layers needed an explicit acquisition order

**Reviewed pointers:** Lines 351–370; section “Writer ownership and serialization.”

The revision introduced a strict interlock alongside existing issue/resource
locks but only required a “consistent” ordering. Existing verbs can acquire an
issue lock before delegating to lower-level writers. If the strict interlock
were added only at a lower-level writer while another entry point took it first,
opposite acquisition order could deadlock.

**Correction authored:**

- Acquire all strict repository/issue interlocks first, sorted by normalized
  repository and numeric issue.
- Acquire existing issue locks in the same order, then resource-local locks.
- Release in reverse order.
- Place initial strict acquisition at the public mutating entry point before an
  existing issue-locked delegate.
- Reject first acquisition from beneath an already-held issue/resource lock.
- Require nested calls to reuse the runtime capability.
- Determine multi-issue scope before locking, or release and restart with the
  expanded set rather than extending the held set out of order.

**Evidence:** The previously inspected issue lock/delegation model and the
reviewed specification's explicit addition of a second lock layer.

**Disposition:** Addressed in authored round-2 revision without changing the
selected single-host/common-directory topology.

## Round-1 finding closure assessment

| Finding | Assessment against reviewed commit and this revision |
|---|---|
| SAR-1: Canonical Plan approval | Design-level closure in reviewed commit: adapter and canonical record/guard path are explicitly within #1847, with normal planning requirements preserved |
| SAR-2: Exclusive admission | Selected local cooperative topology is explicit; R2-3 supplies the missing lock ordering |
| SAR-3: Interrupted recovery | Resource-state table and successor authorization exist; R2-1 removes the proposal-identity contradiction and defines root termination/effective-plan replay |
| SAR-4: Canonical selective preservation | Closed by complete canonical reset; R2-2 resolves the separate legacy preservation wording |

## Other checks

- **Authorization:** The selected adapter uses the existing
  `aitm.authorization-source/v1` Codex user-message pattern. Exact proposal
  digest includes operation identity and executor. No user signing-key
  provisioning or caller-chosen transcript loader is introduced.
- **Supported topology:** Mutation is confined to the registered local common
  directory and linked worktrees. Independent-clone and cross-host pending
  recovery are explicitly unsupported, with read-only status retained.
- **Canonical approval:** The design adds the missing adapter rather than
  assuming the baseline directory refusal is already resolved.
- **Canonical reset:** Current projections and accepted IDs reset; historical
  facts remain. No canonical evidence carry-forward is implied.
- **Current canonical authority:** Recovery does not manufacture a coordinator
  grant. The revision explicitly reports `revision-authority-unavailable` and
  preserves the fence if its governed restoration path is unavailable.
- **Stages:** Backlog remains draft-only; apply does not move state; Test/Review
  demote normally; every semantic revision requires fresh Plan approval.
- **Scope:** The correction stays within revision admission, identity,
  preservation, and recovery. No implementation, unrelated defect investigation,
  issue creation, or prerequisite chain was added.

## Source evidence and verification method

The review used the exact specification at
`854d2448969db48816f2916adc2f8f877c1ca396` and the source evidence established
during round 1. Targeted baseline reads also checked:

- `github-records/delivery-contract.mjs`: draft construction and sealing differ
  from sealed amendment; the proposed draft-epoch behavior is an explicit
  scoped extension, not a claim about existing behavior.
- `github-records/coordination-authority.mjs`: coordinator replacement has its
  own validated authority path; revision recovery must not mint that authority.
- Previously inspected `issue-mutator-lock.mjs`,
  `workflow-policy/authority-resolver.mjs`, `contract-write.mjs`,
  `capsule-chain.mjs`, and `plan-approve.mjs` support the integration
  boundaries and limitations retained in this revision.

No implementation test was run or claimed. A design can converge while its
future implementation and Refine validation remain outstanding.

## Residual Refine and implementation obligations

These are execution/validation obligations, not additional unresolved design
findings:

1. Confirm that the selected single-host/common-directory topology meets the
   intended consumer's requirements.
2. Validate the supported host's actual message representation and trusted
   transcript selection.
3. Enumerate concrete producer/consumer entry points and apply the specified
   outer interlock/fence contract, including delegated and repair paths.
4. Implement the declared closed nested schemas and authority-specific Plan,
   draft amendment, and sealed amendment adapters.
5. Implement and run the specified failure-injection, authorization, identity,
   lock-order, preservation, and end-to-end lifecycle tests.
6. Size and prioritize the agreed scope at Refine.

## Authority and continuation

The issue remains Backlog and the specification remains pending Refine
acceptance. This review/revision does not approve a Plan, authorize implementation,
satisfy an implementation checkbox, or confer ai-peer-review protocol acceptance.

The same Astra agent must review the committed round-2 revision next. The SAR
continues; this report does not stop at findings.
