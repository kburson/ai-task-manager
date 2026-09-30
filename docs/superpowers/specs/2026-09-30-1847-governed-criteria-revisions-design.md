# Governed acceptance-criteria revisions

Issue: [#1847](https://github.com/kburson/ai-task-manager/issues/1847).
Date: 2026-09-30. Status: **first draft, pending Refine acceptance**.
Baseline: `4187a64fae6319808ec350f3beb0f126fc36769b` (trunk after #1848).

This is a Backlog design input. Its commit, attachment, and SAR confer no Plan
approval, implementation authority, estimate, size, priority, or label decision.
At Refine, review and accept or revise this draft, then derive those fields
from the agreed scope through normal workflow commands.

## Problem and outcome

An approved requirement correction can contradict existing acceptance criteria.
The ordinary issue-body command correctly refuses protected-marker removal,
but has no supported operation for retiring obsolete verifier declarations and
affected proof. In ai-peer-review #124, session startup/resume handshakes replaced
per-command hooks. Its old unchecked criteria still declare the old verifiers.
Copying those declarations to new text or checking the obsolete criteria would
misrepresent what was verified.

Provide a bounded transaction that archives the previous contract, replaces
selected criteria with unchecked new criteria, retires affected current proof
and approvals, and requires normal verification of the corrected contract.
Keep ordinary marker, checkbox, and proof-introduction protections intact.

## Repository evidence

- `scripts/task-tracker/verbs/issue-body.mjs` exposes only replace-exact and
  replace-section; preserveAitmMarkers compares all AITM comments in order.
- `scripts/task-tracker/lib/issue-body-mutate.mjs` independently enforces marker
  loss, checkbox proof, proof introduction, section loss, and marker advances.
- `scripts/task-tracker/lib/versioned-issue-write.mjs` supplies fresh reads,
  versioning, bounded retry, conflict checks, and read-back. It is not a GitHub
  server-side compare-and-swap or a multi-resource transaction.
- `scripts/task-tracker/lib/ac-evidence.mjs` distinguishes declarations from
  execution evidence. Short label-derived keys alone cannot identify revisions.
- `scripts/task-tracker/lib/verification-receipt-retirement.mjs` demonstrates
  exact stage/receipt retirement; its internal allowance is not a public bypass.
- `scripts/task-tracker/lib/story-approval-binding-guard.mjs` checks story and
  intent digests. AC revisions need binding even if those digests remain equal.
- `scripts/task-tracker/lib/github-records/` supplies envelopes, capsule chains,
  authority locators, contract invalidation, and projection repair. Resolve the
  actual issue authority; legacy bodies and canonical contracts differ.

These are inspected integration surfaces, not evidence that the proposal exists.

## Alternatives

**A — dedicated revision transaction (selected).** Exact preconditions,
attributable authorization, durable history, and targeted invalidation.

**B — override ordinary replacement.** Smaller patch, but an unrestricted
marker-loss/reset option grants routine edits authority to erase proof. Reject.

**C — manual rewrite and rerun tests.** Does not bind authorization, archive the
old contract, or prevent stale approvals qualifying. Reject.

## Proposed interface and authorization

Register `criteria-revise` actions prepare, apply, status, and recover.
These are proposed interfaces, not available commands at this baseline.

Prepare is read-only. Resolve repository/issue authority, exact active
session/worktree and singleton owner, body version/full SHA-256 digest,
contract revision/epoch where present, selected exact section bytes, replacement
criteria, changed VC entries, reason, and affected authority. Render a sealed
proposal and invalidation manifest. Never execute a proposed verifier.

Apply accepts a closed `aitm.criteria-revision/v1` operation referencing the
proposal and attributable authorization. Seal repository, issue, transaction
ID, before/after semantic-contract digests, selected criterion occurrences,
replacement bytes, verifier changes, dependent receipt/approval identities,
authority epoch, and reason. Reusing an ID with other bytes is a conflict.
No complete replacement body, arbitrary section/marker selectors, shell command,
caller-supplied proof, unknown keys, or invariant-disable flag is accepted.

Require authorization for the exact proposal bytes. A validated host human
message or authenticated human GitHub approval must prove actor, repository,
issue, proposal digest, and current authority. Agent-written approval text,
booleans, model assertions, Full-Auto alone, and unrelated earlier approvals
are insufficient. Record human authorizer and executing session separately.
Refine must verify the concrete adapter and wire schema before acceptance.

## State and scope rules

Allow preparation in Backlog through Review. Apply in Refine, Ready for Planning,
Plan, or Develop. Backlog remains draft-only. Test/Review first use normal
one-step demotions to Develop. Done, closed, delivered, and actively transitioning
issues refuse apply. Revision itself does not move stages.

Version one edits Acceptance Criteria and only the root Verification Commands
entries required by that correction. Duplicate headings, duplicate logical
criteria, ambiguous matches, missing VC IDs, and unclassifiable authority refuse.
Preserve unrelated sections/markers except sanctioned version normalization
and explicit transaction projections.

If Scope, User Story, Story Intent, or the linked plan needs correction, seal
its current digest and require separate governed edits. Until new Plan approval
covers all corrected inputs and the revised contract digest, Develop exit and
later authority are blocked. Return to Plan through normal demotions for approval;
an AC rewrite cannot silently repair the plan.

Replacement criteria are unchecked with explicit declaration-only citations.
Validate syntax/resolution without stamping success. Preserve an unchanged
criterion's individual proof only if text, resolved verifier bytes, source
bindings, and criterion identity remain valid. Retire uncertain dependencies.
Changed VC bytes invalidate every dependent AC/DoD item, including unchanged text.

## Invalidation and history

Archive original bytes and parsed identities before changing current authority.
Classify declarations, execution proof, approvals, lifecycle events, and
coordination/identity markers distinctly. Split consolidated declaration/proof
markers without carrying execution properties into replacement declarations.

Enumerate affected AC/VC/DoD proof, Plan approval, Test receipts, Agent Review,
Final Review approval, and record-backed counterparts. Whole-contract aggregate
receipts are invalid after any semantic AC revision, even at equal HEAD with
unchanged commands. Preserve original historical execution facts and receipts.

Uncheck affected projections. Derived acs/checkboxes authority becomes invalid.
Retain timing history, lifecycle entry events, assignment, session/worktree,
unrelated criteria, and unrelated individual proof. Never remove delivery
records to make a delivered issue editable.

Plan approval, Test, and Review must bind to the revised semantic contract.
Equal labels, reused VC IDs, or equal HEAD cannot revive old aggregate evidence.
Unbound old receipts do not qualify after revision. All dependent consumers
must honor the revision fence, not just the body editor.

## Recoverable transaction

GitHub bodies and comments cannot be written atomically. A canonical prepared
record fences writers, stampers, stage transitions, approval, deliver, and close.
Local journals are caches; recovery from another checkout reads GitHub authority.

1. Resolve current authority and acquire its exclusive coordinator/writer grant
   and local issue mutation lock. Re-read every sealed precondition. If existing
   authority cannot ensure exclusive revision ownership, refuse.
2. Publish and verify a prepared record containing exact archived bytes,
   digests, authorization, reason, and invalidation manifest. That record is the
   pending fence. Missing, unreadable, duplicate, or conflicting authority blocks.
3. Compute replacement from the fresh body. A transaction-derived capability
   permits only enumerated retirements/projection resets; every other invariant
   remains active. Record-backed issues update canonical contract authority
   through its supported path before repairing body projections.
4. Verify affected authority and full body, version, retained markers, unchecked
   declarations, and retired claims. Re-read grant, state, and authorization.
5. Append and read back an applied record binding archived before state to exact
   verified after state. Only verified terminal authority clears the fence.

Before prepare, failure writes nothing. After prepare, recover may apply the
same sealed proposal only while preconditions hold. After body change but before
finalization, recognize exact after bytes and finish the same transaction.
Uncertain transport outcomes require authoritative reconciliation before retry.
Partial or third-party changes retain the fence and require an explicitly
authorized repair proposal; never merge onto a different contract.

Do not automatically roll back retired proof into current authority. Abort
before any change must prove exact original authority remains and record a
terminal abort. Partial application needs forward repair. Repeated apply/recover
converges to one outcome without duplicate archives or approval reuse.
Unknown authority formats and archive-size limits refuse before prepare;
never truncate historical proof.

Document the cooperative-writer boundary. Local locks cannot prevent ungoverned
GitHub edits; detect drift at each boundary. Do not claim server-side atomicity
or protection against writers that ignore canonical authority.

## Explain, audit, and guidance

Expose typed criteria-revision-required, revision-pending, revision-conflict,
revision-authorization-required, and revision-approval-stale outcomes with
registered next actions. Pending transactions expose status/recover; missing
authority is indeterminate. No automatic bypass or stage skip.

Immutable audit records contain repository/issue, transaction, authorizer,
executor, reason, time, digests, predecessor, before/after sections, original
proof/approval identities, and terminal outcome. Respect existing record size
and secret policies; an incomplete archive refuses preparation.

## Verification design

Use #124-shaped fixtures without changing the live consumer. Prove:

- Authorized exact Develop correction archives obsolete unchecked declarations;
  replacements are unchecked with no inherited proof.
- Consolidated and legacy proof classify correctly; declaration absence cannot
  produce zero-command green; changed verifiers invalidate all dependencies.
- Wrong actors, stale versions/digests/epochs, foreign bindings, ambiguity,
  malformed citations, and conflicting transaction IDs refuse without writes.
- Failure injection at every write/read-back boundary and fresh-checkout recovery
  prove idempotence and fence enforcement by every lifecycle consumer.
- Ordinary edits still refuse marker loss and fabricated proof; targeted
  retirement cannot remove anything outside the sealed manifest.
- Legacy and canonical-contract issues preserve history; ambiguous mixed
  authority refuses; old exact-HEAD Test/Review receipts cannot qualify.
- The corrected fixture obtains new Plan approval and passes normal AC, Test,
  Review, delivery, and close gates using newly generated actual evidence.

Existing #1847 root verification commands remain the initial test contract.
Refine/deep dive may add focused coverage through governed issue operations.
Writing or reviewing this draft satisfies no implementation checkbox.

## Refine acceptance and exclusions

Before acceptance, verify authorization adapters, exclusive grant semantics,
consumer inventory, invalidation mappings, and record-schema compatibility.
These are explicit validation obligations, not approved implementation estimates.
Use accepted scope to derive estimate, size, labels, and priority at Refine.

Exclude live ai-peer-review #124 criteria edits, ai-peer-review package work,
AITM #1841 records, generic invariant disabling, automatic approval, stage skips,
and unrelated refactoring. SAR findings remain draft feedback; SAR does not
ratify implementation, lifecycle approval, or delivery.
