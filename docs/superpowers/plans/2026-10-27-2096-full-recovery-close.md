# Full recovery Close implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. The human explicitly requested re-plan, fix and native completion in this session; execute inline without another planning handoff.

**Goal:** Complete the entire recovery Close of #2096, then genuinely accept, reconcile and close original #2090.

**Architecture:** Keep the existing eight-step Close saga and immutable recovery/supersession records. Resolve the unique durable chain from the completed historical Close to the active replacement; use that same authority at the first Unknown-outcome validation and every retry. Preserve strict live delivery, review, operator, timing-source and binding checks.

**Tech Stack:** Existing Node.js native Close verb, versioned issue-body mutations, canonical outcome writer, Git immutable artifacts, exact-source CI and sanctioned provider delivery.

**Spec:** Current #2096 Scope/AC, docs/immutable-artifact-acceptance.md, the actual failed Close at source1a7599df15a3861d232e8efe0ac07422a0619a52 and human instruction2026-10-27T11:32:47.097Z.

## Global Constraints

- Only #2096 then original #2090. No new repair stories, #2098 implementation or R1.
- Preserve historical Closed/Done transaction480356aa, recovery root c6e8ad8a, supersession to active947edd22, source refs, worktrees, stashes and all historical Unknown values.
- Preserve actual controller SID/root/ref/HEAD/binding independently of selected immutable artifact commit/tree. Retain the recorded root/trunk controller; never reset or impersonate it.
- No GitHub-history estimates, learned rubric, fabricated earlier delivery intent, gate bypass or protected-record edits.
- Completion requires native delivery and all eight native Close steps; tests, Review, a merge and an old closure are insufficient.

## Confirmed defect and full-path audit

The timing step invokes assertFieldsPersisted, which calls ensureCloseEstimationOutcome with supersedeExisting=false. The later estimation step supplies permitsReopenedOutcomeCorrection, but execution never reaches it when the prior canonical Unknown outcome names the old accepted source. This is the live telemetry-source-lineage refusal.

The active transaction already descends through a recovery-backed supersession. Qualifying and delivering this correction creates another source, so recovery must follow a unique canonical chain rather than assume only one successor. The same lineage must survive ordinary interrupted retries and authorize the final own-post-close binding release. No new record grammar is required.

## Review Focus

1. Missing, conflicting, cyclic, wrong-source, wrong-issue or non-human corrective links must not authorize outcome replacement or binding release.
2. Unknown outcomes must retain a real predecessor, canonical timing source, exact new Test proof and honest null totals.
3. An interruption after any of the eight checkpoints must resume only the pending suffix and revalidate current evidence.
4. Ordinary Close and false-delivery recovery must retain their existing refusal behavior; no global supersede=true default.
5. New source delivery and original2090 historical squash reconstruction must use genuine native evidence and never a second merge of PR2094.

## Task 1: Durable lineage and Unknown-outcome ordering

**Files:** Modify scripts/task-tracker/lib/reopened-close-recovery.mjs, scripts/task-tracker/verbs/close.mjs; add scripts/tests/integration/task-tracker/lib/close-recovery-outcome.test.mjs and isolated helper scripts/tests/helpers/2096-close-recovery-outcome.mjs. Extend the existing recovery predicate tests when needed.

**Interfaces:** Consume canonical recovery/supersession records and the active transaction. Produce a validated root-to-active supersession list from findRecoveryBackedReplacement and boolean recovery-backed transaction validation. Pass optional supersessionRecords through authorizeRecoveryBackedDeliveredCloseRestart and permitsReopenedOutcomeCorrection. Pass optional supersedeExisting=false through assertFieldsPersisted into ensureCloseEstimationOutcome.

- [x] Build fixtures using real record constructors/codecs, real verbClose, real assertFieldsPersisted and real createEstimationOutcomeRuntime; use explicit remote qualification and GitHub/timing/state IO boundaries. Real native qualification is separately required by Task2. Seed the genuine prior Unknown outcome and a completed historical Close followed by multiple canonical corrective links.
- [x] Run RED: the valid current-source recovery must fail specifically at telemetry-source-lineage or the missing multi-hop authority; retain logs. Include ordinary retry after timing and after estimation, plus missing/duplicate/wrong link refusals.
- [x] Resolve lineage backwards from the active transaction through uniquely parsed incoming supersessions until the canonical recovery root. Reject ambiguity/cycles/mismatched SHA, repository, issue or review authority; validate every existing record with its canonical codec. Do not synthesize a replacement recovery record.

```js
const backing = findRecoveryBackedReplacement({ body, comments, repository, issueNumber });
// backing.supersessions contains only validated canonical root-to-active links.
const supersedeExisting = permitsReopenedOutcomeCorrection({
  recoveryRecord: backing.record,
  supersessionRecords: backing.supersessions,
  transaction,
});
await assertFieldsPersisted({ ...existingInputs, supersedeExisting });
```

- [x] Restore that durable authority before any incomplete timing validation, including ordinary same-source retries. Supply it to both timing-persistence calls and the later estimation step; preserve false-delivery direct authorization and default false elsewhere.
- [x] Run GREEN: all eight steps finish, exactly one corrected outcome supersedes the old one, old record remains unchanged, null timing persists, own binding releases, unrelated claims refuse. Exercise interrupted suffixes and unchanged ordinary Close refusals.
- [x] Run related recovery/convergence, Unknown-timing, outcome and binding suites. Commit the bounded code, plan and tests against #2096.

## Task 2: Qualify and complete native #2096 then #2090

**Files:** Existing verification/CI receipts, governed issue metadata and #2095 epic table only; no unrelated source.

**Interfaces:** Consume Task1 source and exact-candidate CI; produce actual native Closed/Done records for each original issue in order.

- [ ] Run required lint/format/full fast suite and all actual CI lanes including slow dispatch for the final immutable source. Inspect exact head, artifact expiry and independent code review. Address Critical/Important findings once with RED/GREEN verification; do not create repair stories.
- [ ] Renew #2096 AC/Test/Review against the exact corrected source with actual current operator binding. Preserve source-specific human provenance; do not extend the earlier exact1a approval to another source. Prepare all reviewable evidence before any unavoidable human decision.
- [ ] Deliver through the native action envelope and sanctioned expected-head provider integration; rerun native deliver to independently verify its receipt.
- [ ] Fresh native Close Explain, then native recovery restart. Inspect every returned terminal checkpoint, current CLOSED/Done and released binding. Any refusal remains a blocker, never completion.
- [ ] Bind original2090, renew exact52337be2fd900b55f75b34cf00930ca4a8b1dfb1 acceptance, explicitly reconstruct its observed historical squash delivery for already merged PR2094, and execute native Close. Never merge2094 again or invent an original intent.
- [ ] Keep #2095 WIP, blocker and completion rows current at re-plan, acceptance and each genuine Close. Keep #2098 held with both dependencies visible. Report only actual completions.

## Execution rulings

The latest user instruction authorizes this bounded re-plan and execution together, overriding an additional skill handoff pause. Keep the existing recorded controller workspace rather than introduce identity churn. Use one fresh independent whole-change review after implementation, as required by executing-plans. No new time forecast is derived from historical issue data.
