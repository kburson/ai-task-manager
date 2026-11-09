Refs #1490

Repairs the reopened-close recovery as an integration contract. The capability landed in PR #1493 but refused on its first live execution, and the refusal exposed that several of its own authorization conditions verified nothing.

## What was wrong

**The predicate was unsatisfiable.** `runReopenedCloseRecovery` passed `closeSnapshot.stateReason` into a check requiring `REOPENED`. `normalizeIssueCloseSnapshot` returns `stateReason: null` for every OPEN issue, so the condition could never hold in exactly the state it targets.

**Two conditions were decorative.** The verb passed `historicalDelivery.verified: true` and `deliveryVerified: true` as literals, and compared a merge SHA copied from the receipt back against that same receipt. It also fell back to `?? gateInput.acceptedSha` for the review SHA, which lets an accepted-SHA substitution stand in for review evidence.

**The retry path could not work.** The old transaction was read from `decisionInput.closeTransactions[0]`; after the marker is replaced that is the zero-step transaction, so authorization would immediately refuse. `oldTransactionFromRecord` was never called.

The unit suite passed throughout because it fed values directly to the authorizer and never exercised where the verb sourced them.

## What changed

`normalizeIssueCloseSnapshot` now yields `stateReason: 'reopened'` for OPEN + REOPENED. Other OPEN reasons stay null; CLOSED normalization is unchanged; no second API read was added.

Evidence is now a correlated `{pullRequest, intent, receipt}` bundle for each accepted SHA, requiring exact agreement across issue, repository, head and base refs, PR number, merge SHA, intent id, merge method, and provider. Historical delivery is resolved from the close gate's own live PR inventory — selecting the single merged PR whose `headRefOid` is the old accepted SHA — then through the existing PR-scoped parser and `projectDeliveryRecords`. No new marker grammar; `delivery-records.mjs` is untouched. Current delivery carries the verifier's own `verification.receiptInput`, so the cross-check compares independent outputs rather than a value against itself. The review-SHA fallback is removed.

Comment handling moved from substring matching to a strict codec modelled on `delivered-close-supersession.mjs`. Recovery resolution is two-phase: the active transaction is read from the body, and a zero-step replacement locates its durable record and reconstructs the completed original. Read-back verification classifies `mutation.body`, not the captured pre-mutation body. `allowMarkerLoss` is gone.

## Verification at `9c46b66c`

- Recovery module 18/18; new verb-level wiring suite 14/14; close, supersession, and convergence 133/133; help 5/5
- Fast and slow lanes green; `verify-develop`, lint, format clean

The wiring suite pins the SOURCE of every value and the ordering of every durable write. It caught three further defects during this repair: two temporal-dead-zone errors, and `??` in the harness overrides that silently disabled three negative cases. Fixtures use the real delivery builders and renderers; none sets `receipt.status` or injects a transaction after replacement.

Documentation updated in `help-data.mjs`, `command-surface/catalog.mjs`, `help.test.mjs`, `skill/shared/rules/close.md`, and a `docs/guides/workflow.md` section on the costs of reopening a delivered-and-closed issue.
