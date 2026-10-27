# Independent omitted-rank delivery implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. The human requested native completion of #2098 and original #2091; continue through default Full-Auto without another planning handoff.

**Goal:** Independently deliver the retained omitted-rank repair and natively close original #2091 and #2098.

**Architecture:** Keep null in the omitted-rank publication key. Supply rank to fresh body-cache fields and overrideKeys only when explicit. Retain real publication ownership, snapshot validation and retry identity.

**Tech Stack:** Node.js, existing Refine/project-tether tests, immutable Git artifacts and native AITM delivery.

**Spec:** Current #2098 Scope and original #2091 Scope/AC/deep dive; retained repair a71997b22528b96a707730afc77b03c3753c05e6.

## Global Constraints

- Only #2098 and original #2091; no new repair stories, R1 or unfinished aggregate release.
- Independent base is delivered trunk c43857720d147308b843cd96eb019d0ca8c6b851. Preserve the controller, retained worktrees, refs, stashes and Unknown.
- Retain the published manual M/6h prospective budget; no GitHub-history estimates or rubric.
- Preserve omitted-rank null in sealed intent, fresh rank, explicit replacement and absent-rank refusal.
- Keep actual operator identity separate from artifact commit/tree. Each issue requires its own native acceptance, receipt and all eight Close checkpoints.
- Original #2091 must be genuinely CLOSED/Done before #2098 final acceptance and Close.

## Review Focus

1. Missing/null/empty rank preserves fresh persisted rank; explicit rank replaces it.
2. Concurrent rank wins over stale initial data when omitted.
3. Identical interrupted retry keeps the sealed operation ID and null key.
4. Changed and unchanged publication paths preserve rank; truly absent rank still refuses.
5. Isolated source excludes aggregate-only changes and gets genuine exact-source qualification.

## Plan Metadata

- Priority: P0
- Size: M
- Estimate: 6 hours, retained manual source budget
- Rank: 3
- Labels: plan:native-recovery-delivery

## Story Intent

- **Beneficiary:** Backlog operator.
- **Capability:** Independently deliver rank preservation and sealed retry identity, with original #2091 and #2098 each natively Done.
- **Need:** The fresh-body override erases rank with null, and the retained aggregate review cannot accept an independent release.
- **Value or failure prevented:** Preserve rank and sealed identity without weakening validation or claiming wrapper completion before original closure.

## Task 1: Isolate the regression-protected repair

### Story Intent

- **Beneficiary:** Backlog operator.
- **Capability:** Preserve rank through real publication and snapshot validation.
- **Need:** Retained fix must ship independently of the aggregate.
- **Value or failure prevented:** Prevent rank loss without releasing unrelated work.

**Files:** scripts/task-tracker/verbs/refine.mjs; scripts/tests/unit/task-tracker/gh/lib/project-tether-publication.cases.mjs; this plan, deep dive and review record. Only neutral inventory line offsets may change if required by existing checks.

**Interfaces:** Existing runRefine({args,cfg,deps}), actual tether/publication and verifyRefinementSnapshot; same result/schema, explicit-only body rank override.

- [ ] Run clean trunk fast baseline and retain output.
- [ ] Apply retained test-file diff from a71997b22, then run actual importing harness RED before production edits. Eight cases cover changed/unchanged, omitted/explicit/null/empty/fresh rank, pending retry and absent rank.
- [ ] Apply minimal production correction; leave publication key untouched:

```text
...(rankNum != null ? { rank: rankNum } : {})
// overrideKeys:
[
  ...(context ? ['priority', 'size', 'estimate'] : ['priority']),
  ...(rankNum != null ? ['rank'] : []),
]
```

- [ ] Run focused GREEN, quality/full verification, and commit with both [#2098] and [#2091] attribution.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/verbs/refine-verb.test.mjs scripts/tests/unit/task-tracker/verbs/refine-stage-completion.test.mjs scripts/tests/unit/task-tracker/verbs/refine-fields-cache-refresh.test.mjs scripts/tests/unit/task-tracker/verbs/refine-fresh-body-retry.test.mjs scripts/tests/unit/task-tracker/gh/lib/project-tether.test.mjs
npm run lint
npm run format:check
npm test
```

## Task 2: Qualify and close both native issues

### Story Intent

- **Beneficiary:** Delivery owner.
- **Capability:** See both issues natively Done with correlated evidence.
- **Need:** Prior aggregate review cannot accept independent source.
- **Value or failure prevented:** Avoid false wrapper closure and duplicate delivery.

**Files:** Native issue/CI/delivery records, exact-source review document and #2095 table.

**Interfaces:** Consume Task1 source/tree; produce each issue's own acceptance, receipt and complete Close transaction.

- [ ] One fresh independent whole-change review; one bounded RED/GREEN fix pass for Critical/Important findings. Record declined judgments/deferred minors.
- [ ] PR references both issues without auto-closing keywords. Require exact-source full CI, all slow coverage, CodeQL and unexpired artifacts.
- [ ] Renew original #2091 using verification-only rejection, fresh AC/commit provenance, Test/Review and Full-Auto approval. Governed expected-head delivery, receipt reconciliation, native Close; verify all eight steps, CLOSED/Done and released binding.
- [ ] Return to #2098 before qualification. Check original-closure evidence only after live #2091 proof. Run its own AC/Test/Review/approval, explicitly reconstruct its receipt for already-merged source without another provider action, then native Close and verify all eight steps, CLOSED/Done and released binding.
- [ ] Update #2095 at material starts/blockers and each native completion. Keep other work held and preserve Unknown.

**Verification Commands:** Retain native stage/delivery/Close output, then read the live closure records:

```sh
gh issue view 2091 --json state,closedAt,projectItems
gh issue view 2098 --json state,closedAt,projectItems
```

Expected: both CLOSED, non-null closedAt, configured board Done; native Close output and each complete eight-step marker agree. Tests or a merge alone cannot complete Task2.

## Execution rulings

Existing accepted bounded design and current end-to-end instruction authorize inline execution under default Full-Auto. Generic review/CI/acceptance/delivery obligations remain in Scope and native gates. Clarify AC2 to actual original #2091 native closure before #2098 Test, avoiding a future-tense sign-off; no completion outcome is removed.

Plan audit correction: the initial agent invocation omitted TT_FULL_AUTO=1 and the CLI labeled it human. No human review of this new document occurred and no Develop transition used that marker. Renew approval for this completed document with explicit Full-Auto provenance and its canonical audit; preserve the prior event as history.

The global story intent now explicitly includes independent delivery and both native closures, matching the existing Scope and Task2. Native source-binding renewal must record Full-Auto provenance for this clarified intent; the earlier agent-created human label is not human authorization. Plan cancellation refused its snapshot without changing lifecycle state.
