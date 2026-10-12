# #1924 Truthful Partial Transition Reporting Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, with one fresh final reviewer. Continue the accepted source repair under active #1918 in the existing parent worktree.

**Goal:** Report verified board, sentinel, transition-comment and item facts after native failure or cancellation, before private holder cleanup.

**Architecture:** Cancel and join the original running emitter before taking a final snapshot, keeping the private preparation holder alive. A fixed read-only Store comparison revalidates the held interlock, actual holder identity/header, complete native chronology and current resources; a detached DATA projection derives only completed facts. Neither projection nor reporting grants mutation/reentry authority.

**Tech Stack:** Node.js, node:test, complete original native fixtures, Markdown.

**Spec:** docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md; original Task5 in docs/superpowers/plans/2026-09-30-1847-governed-criteria-revisions.md; live #1924 Scope.

## Baseline and sequence

Input cd0250019 includes reviewed dispatcher/cache1913 and compensation1916. The actual catch in prepareNativeStageAtBoundary always emits itemId empty and board/sentinel false even after confirmed14/15/16. Cancellation currently happens only in finally; joined work must settle before reporting its snapshot. Within wave6, do1924 before1915 so fresh reentry uses truthful failure results. Both have only1920 as native blocker; this changes no issue edges or scope. Existing full recovery regression remains owned1915/1923/1925.

## Global Constraints

- Native1847→1855→1918→1924; existing branch/worktree and active parent source sequencing exception; no new defect/prerequisite issues or lifecycle shortcuts.
- Preserve original algorithms, all fixtures/assertions/cases, authority/current-source guards and common-interlock-before-resource-lock order.
- No new compensation effects, caller callbacks/after bytes, execution brands from DATA, authority caches or production activation.
- Node/Markdown only; unchanged600000ms per file/semantic section,1200s focused command,45-minute sandbox; maximum four isolated native processes.
- Six prospective incremental human hours remain below24; reassess before more code if threshold reached. Exclude passive tests/CI and inherited work.
- Whole-feature/Linux/full/slow/consumer-union and ordinary child lifecycle remain pending under1917/1918. Retain this plan workspace until aggregate reconciliation.

## Review Focus

- Original work must be cancelled and joined before the final report snapshot; no later effect may invalidate the returned facts.
- A changed snapshot or identity across a reporting await must yield explicitly unverified progress, never stale committed facts.
- Public DATA/accessors or a copied holder tuple must not qualify current facts or read getters.
- Interrupted readback must distinguish verified facts from an effect that landed without confirmation; reporting must never repair it.
- Partial facts must preserve the original error/exit and must not authorize replay, production activation, or unrelated writers.

## Task 1: Derive current facts and connect the failure facade

**Modify:** scripts/task-tracker/lib/criteria-revision/stage-execution.mjs; store.mjs; scripts/task-tracker/lib/move-state/move-state-core.mjs.
**Extend:** scripts/tests/integration/task-tracker/lib/native-stage-continuation-fixture.mjs.
**Create:** criteria-revision-partial-reporting.test.mjs plus four independently registered genuine wrappers in the same integration directory.

**Consumes:** actual private preparation identity, held backend/capability/context, original header and completed native prefixes.
**Produces:** readMemoryNativeStagePartialFacts({backend,capability,context,holder}) returning detached report DATA; Core assertNativeStagePartialHolder(holder,backend) is a no-return comparison against the actual live WeakMap holder; deriveRecordedNativeStagePartialFacts({journal}) derives DATA only.

- [ ] Add genuine native profiles stopping before sentinel15, transition-comment16, dispatcher17, and after an interrupted comment16 effect write. Preserve complete original setup, exact resource/host-byte assertions and all original profiles. Literal expectations are board true/item PVTI_subject in all four; sentinel false only at14; transitionCommitPresent true only at completed16. Run and watch actual facade RED before code.

```javascript
assert.equal(result.exit, 4);
assert.equal(result.itemId, 'PVTI_subject');
assert.equal(result.boardMoved, true);
assert.equal(result.sentinelPresent, completed >= 15);
assert.equal(result.transitionCommitPresent, completed === 16);
assert.equal(result.progressVerified, true);
```

- [ ] DATA projection detaches canonical own-DATA before its first await, validates the journal and independently reconstructs board14, sentinel15 and comment16 when present. Only non-null validated readbacks qualify facts; no mutation/constructor runtime membership is created.

```javascript
const boardMoved = steps[13]?.readback != null && steps[13].outcome?.kind === 'confirmed';
const sentinelPresent = boardMoved && steps[14]?.readback != null;
const transitionCommitPresent = sentinelPresent && steps[15]?.readback != null;
return Object.freeze({
  itemId: boardMoved ? header.intent.itemId : '',
  boardMoved,
  sentinelPresent,
  transitionCommitPresent,
  transitionCommitId: transitionCommitPresent ? steps[15].intent.commentId : null,
  progressVerified: true,
});
```

- [ ] Fixed Store reader checks closed own-DATA tuple before property access, actual holder membership and held capability. Capture canonical snapshot; before/after imports/observe/projection, compare exact snapshot, held identity/header and capability. observeRevision must independently validate pending-native-stage/current resources. No admission writes or resource mutation occur.
- [ ] In Core catch, set record.cancelled, reject its gate and await running.catch before projection. Retain actual holder membership until finally. Return original exit4/code/phase/preparationReason plus the verified facts. If current facts cannot qualify, return progressVerified false and no invented committed facts. Finally retains original cancellation/join/holder cleanup; no user-selected signals/callbacks added.

```javascript
if (record) {
  record.cancelled = true;
  record.cancel(preparationRefusal('preparation-cancelled'));
  if (running) await running.catch(() => {});
}
let partial = {
  itemId: '',
  boardMoved: false,
  sentinelPresent: false,
  transitionCommitPresent: false,
  transitionCommitId: null,
  progressVerified: !record,
};
if (record?.header) {
  try {
    partial = await store.readMemoryNativeStagePartialFacts({
      backend: record.backend,
      capability: record.capability,
      context: record.context,
      holder: record.identity,
    });
  } catch {
    partial.progressVerified = false;
  }
}
```

- [ ] Run all four genuine profiles; expect exact retained prefixes/resources and accurate reports with original failure preserved. Commit source slice with1918/1924 attribution.

## Task 2: Cancellation/current/public refusal qualification and one review

**Create:** scripts/tests/unit/task-tracker/lib/criteria-revision/native-stage-partial-boundary.test.mjs.
**Extend:** genuine partial fixture controls under Task1's actual source holder, never a manufactured holder.

- [ ] Public boundary cases refuse null/prototype/extra/symbol/hidden/missing/getter/copy holder tuples with getters0 and no effects. Add genuine reporting-await source/resource/identity changes and original cancellation/join checks; snapshot after return stays unchanged, private holder is unusable, original pending fence still denies ordinary writers.
- [ ] DATA getter mutation across projection awaits remains unread and cannot change the original detached report. Completed readbacks cannot qualify if actual current board/body/comment resource disappears. Incomplete readbacks report only earlier verified facts and confer no recovery or rollback effects.
- [ ] Declare root qualifier using independent AST descriptor discovery and exact four reporting wrappers; preserve all original phase/board/sentinel/transition and ordinary facade cases. Partition complete native groups only if needed; never reduce cases or raise600s/1200s budgets.
- [ ] Run focused root, affected public/DATA and complete original ordinary profiles, package/import checks, full lint/format and diff-check. Record exact exits/counts/durations and known aggregate owners; current local results are not Linux/full/lifecycle receipts. Commit.
- [ ] Request one fresh full-plan reviewer with exact range/spec/ledger and Review Focus. Re-grade by actual effect, one Important/Critical RED→GREEN fix pass plus full owned GREEN; ledger all rulings/costs/declines and deferred minors, no re-review.
