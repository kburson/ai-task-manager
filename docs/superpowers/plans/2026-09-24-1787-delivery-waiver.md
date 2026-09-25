# Generic Delivery Waiver With Disclosure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator authorize one named PR-delivery divergence with a host-verified human statement, then deliver, close, and recover using an explicitly waived receipt without weakening ordinary delivery gates.

**Architecture:** Extend workflow-exception records with a delivery-only v2 schema and partitioned chains. Keep Git/provider facts in delivery verification, scope and human authority in workflow policy, consumption in a durable operation journal, and disclosure in exact v3 intent/v4 receipt schemas. Completed transactions validate their pinned authorization; only a new transaction evaluates current grant liveness.

**Tech Stack:** Node.js ESM, existing Node engine `>=24` (Node 26 preferred locally), `node:test`, Git/GitHub, existing canonical JSON and GitHub comment adapters. No new package dependency.

**Spec:** [Accepted #1787 design](../specs/2026-09-24-1787-delivery-waiver-design.md), commit `b02b4b2660caac4ca2df31570d2cee44a1c6a1b0`, blob `4a6fa02c2c951899117601caa47697d167a42b6d`, SHA-256 `bcc6d2bf1f6b8ff50d3c1de1e38e3079a749ce3d7ead82656fba987e742f8ddb`.

**Acceptance:** [Review manifest](../../peer-reviews/spec/2026-09-25-2026-09-24-1787-delivery-waiver-design-review-341532c92eac97134dfede8a4f29fba6/review-341532c92eac97134dfede8a4f29fba6-review-manifest.md), Astra 6 author / Opus 5 reviewer, reviewer consensus accepted; finalization commit `3358b074`. This is peer acceptance, with no signed human-authority attestation.

**Plan status:** Draft for Astra 6 / Opus 5 plan review. Creating this document does not approve implementation, alter issue state, or activate a delivery waiver.

## Global Constraints

- "Do not open an existing family as waivable." All ten existing `delivery-invariant` IDs remain non-waivable.
- Eligible new IDs use `waivable: false` and `waivableWithDisclosure: true`; hard guardrails use both false. Ordinary v1 writes and policy evaluation cannot grant delivery waivers.
- "One PR transaction may waive only that one ID; every other predicate must pass." Do not accumulate grants into a multi-ID override.
- Require `codex-session/v1`, `codex-session-transcript`, and `host-verified-user-message`. Full-Auto, agent messages, request files, labels, and caller booleans are not human authority.
- Require bounded expiry for initial authorization; preserve v1 optional-expiry behavior. Completed waived receipts and confirmed-burn retries use pinned historical authority.
- `deliveryOperationId` is a ULID; workflow store `operationId` remains a `sha256:` write-idempotency digest. A revision does not reset consumption.
- Bind the stable `resolvedTrunkRef`, not the moving trunk tip. Canonicalize using `canonicalRecordJson`; explicitly encode absent PR identity as `null` in the shared scope contract.
- Preserve #1755 records and ordinary intent v1/v2 and receipt v1/v2/v3 behavior. Do not reinterpret attribution authorization as generic delivery authorization.
- Implement #1787 and the common authority contract here. #1783 owns its production no-PR validator, close lane, and terminal receipt. No automatic project-wide merge-policy change.
- Read-only preparation, show, and preflight cannot write comments, bind tasks, mutate timers, create journal refs, or launch providers.
- No hand-editing #1784 records, npm publication, `ai-peer-review` changes, PR creation, merge, or deployment is authorized by this plan.
- Before implementation, reconcile the issue/worktree binding through the task workflow, seed the selected worktree if needed, and run `node scripts/dev-env/verify-local-worktree.mjs`. Do not copy another checkout's `node_modules`.
- New tests carry `// @story #1787`; preserve existing story tags. Use existing test discovery/layout and line-cap rules. Commit only the files for a completed, verified task with `[#1787]` in the subject, or its assigned child issue after sanctioned decomposition.

## Scope and Planning Decisions

This is one implementation plan because the authority, consumption, verifier, and receipt changes form one delivery transaction. Tasks are independently testable boundaries, not independent user-facing releases. Keep the new effect path disconnected until Tasks 2-8 pass.

Carry forward the accepted review's three optional clarifications without changing its sealed spec:

1. Historical waiver dispatch applies to a v4 `result: "waived"` receipt. Ordinary delivered receipts retain their existing paths.
2. The refusal of disclosure-only IDs applies to ordinary/v1 writes; v2 uses the positive delivery validator. Current grant evaluation occurs only at initial authorization.
3. Recompute `waiverScopeDigest` inside the v2 envelope validator and refuse mismatch, even when the outer payload hash is valid.

### Consumption Serialization Decision

The spec requires durable single use and serialization. The existing `issue-mutator-lock.mjs` is a local advisory filesystem lock. `evidence-v2/journal-authority.mjs` is also local and tied to a synthetic-context contract. Neither proves mutual exclusion between independent hosts. GitHub comment append plus readback alone cannot establish an exclusive writer.

For this plan, use a narrow append-only Git journal on the configured repository, at `refs/heads/aitm/delivery-waivers/<issue>`. Serialize transitions at the issue ref, with consumption indexed by `(repository, issue, deliveryOperationId)` inside its validated history. The issue-wide ref also prevents different operation IDs from concurrently superseding the same original intent. It is an adjacent transaction/consumption ledger, not an authorization source. Grants remain immutable GitHub workflow-exception comments. The journal contains only canonical bounded intent/consumption/receipt-publication data and references to the existing grant; it contains no source tree, transcripts, credentials, or arbitrary files.

Each state transition creates a commit whose sole parent is the previously observed journal commit and advances exactly that ref using an explicit expected OID. The empty expectation permits first creation only. This uses the documented [explicit-value Git lease semantics](https://git-scm.com/docs/git-push#Documentation/git-push.txt---force-with-leaseltrefnamegtltexpectgt). The adapter must independently require a direct descendant and must never use unrestricted force, delete a journal ref, update a task/trunk branch, change the index, or check out the journal. Git remote identity must match the resolved repository. Repository permissions that forbid the journal cause a truthful refusal, not fallback to a local lock.

Per-operation states are `intent-requesting -> intent-confirmed -> burned -> receipt-requesting -> completed`. Before any v3 intent POST, the first CAS transition reserves the original intent exclusively and pins the exact v3 intent ID, bytes, grant revision/digests, and process-run nonce. Only the invocation winning that transition may POST the pinned intent once. A competing caller of the same operation can reconcile its exact comment; a different operation targeting that original intent refuses. An operation cannot change its reserved bytes, source intent, or grant after reservation. Pre-reservation re-scoping needs fresh approval; drift after reservation refuses this attempt without overwriting evidence or automatically creating a replacement operation.

`intent-confirmed` records the unique matching intent comment ID and authoritative creation timestamp. Reservation is not a burn: current grant liveness, body/delivery scope, and all non-waived evidence must still pass immediately before `burned`, the immutable authorization/consumption event. The `receipt-requesting` transition similarly pins exact receipt bytes and a process-run nonce before any receipt POST. Later invocations may reconcile either pending request but cannot POST it again based solely on an empty comment listing. A completed write with a lost response is recovered by exact readback. An unresolved request remains `indeterminate`, with no automatic timeout takeover or replacement operation. This deliberately preserves uncertainty instead of risking duplicate durable intents or receipts.

There is no supported force-republish or abandon-and-replace command in #1787. If a request remains unresolved after complete exact readback, the operation is terminally blocked for automated progress: a `receipt-requesting` operation has spent its approval; an `intent-requesting` operation has reserved publication but has not burned approval. Both retain their reservation and prohibit replacement. Emit the typed hard guardrail `delivery-waiver-ambiguity` with `outcome: 'indeterminate'`, operation ID, pending stage, and a bounded escalation instruction: preserve the journal and comment evidence, stop delivery/close retries that attempt mutation, and escalate through the supported defect/incident workflow to a repository administrator with this evidence. A later exact original comment can still be reconciled read-only and the original operation continued; empty listings, elapsed time, or an administrator's assertion alone never permit a new POST. Genuine recovery that cannot establish the original write requires a separately designed and explicitly authorized recovery mechanism, not manual record edits, grant replacement, or an undocumented backdoor.

This remote journal is a concrete implementation choice for plan review, not a claim that the spec already selected this backend. Task 6 must prove its cross-host behavior using two clones and a disposable bare remote before the effect path is wired. No real remote refs are created while generating or reviewing this plan.

## File Map

All paths below are repository-relative. New modules are intentionally narrow; do not move unrelated verifier or workflow code.

| Responsibility                        | Create                                                                                    | Modify                                                                                                                                                                                                                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog and diagnostics               | focused catalog/default-refusal tests                                                     | `scripts/task-tracker/lib/workflow-policy/catalog.mjs`, `consumer-coverage.mjs`; `scripts/task-tracker/lib/delivery-verification.mjs`                                                                                                                             |
| Scope, request, approval statement    | `scripts/task-tracker/lib/workflow-policy/delivery-scope.mjs`, `delivery-request.mjs`     | `scripts/task-tracker/verbs/workflow-exception.mjs`                                                                                                                                                                                                               |
| Schema and partitioned chains         | `scripts/task-tracker/lib/workflow-policy/exception-partitions.mjs`                       | `exception-record.mjs`, `exception-store.mjs`, `snapshot.mjs`, `evaluator.mjs`, `preflight.mjs` under the same directory                                                                                                                                          |
| Typed authority and pinned evidence   | `scripts/task-tracker/lib/workflow-policy/delivery-waiver-authority.mjs`                  | existing authority loader call sites; preserve `authority-resolver.mjs`'s v1 contract                                                                                                                                                                             |
| Consumption/publication state machine | `scripts/task-tracker/lib/delivery-waiver-consumption.mjs`, `delivery-waiver-journal.mjs` | effect-time dependency injection in `scripts/task-tracker/verbs/deliver.mjs`                                                                                                                                                                                      |
| Waived schemas and projections        | `scripts/task-tracker/lib/delivery-waiver-evidence.mjs`                                   | `scripts/task-tracker/lib/delivery-records.mjs`                                                                                                                                                                                                                   |
| Verifier and deliver effects          | `scripts/task-tracker/lib/delivery-waiver-transaction.mjs`                                | `scripts/task-tracker/lib/delivery-verification.mjs`, `scripts/task-tracker/verbs/deliver.mjs`                                                                                                                                                                    |
| Close/recovery/disclosure             | focused recovery tests                                                                    | `scripts/task-tracker/lib/close-delivery-receipt.mjs`, `reopened-close-recovery.mjs`, `false-delivery-close-recovery.mjs`, `action-decision/deliver.mjs`, `action-decision/close.mjs`, `action-decision/presentation.mjs`; `scripts/task-tracker/verbs/close.mjs` |
| CLI/help/package                      | new package smoke and integration tests                                                   | `scripts/task-tracker/verbs/help-data.mjs`; `scripts/task-tracker/lib/command-surface/catalog.mjs`, `routing.mjs`; `scripts/task-tracker/verbs/workflow-preflight.mjs`; `docs/guides/workflow.md`; `skill/shared/rules/deliver.md`                                |

`workflow-exception` already has a dispatch case in `scripts/task-tracker/task-tracker.mjs`; extend its subcommands instead of adding a second verb. It must retain no `PREFLIGHT_MODE` entry. `scripts/lib/self-doc.mjs` is not this verb's help source. Existing `scripts/`, `skill/`, and `docs/guides/` package entries cover the proposed shipped files; do not pack this planning document or change `package.json` merely to include runtime files.

## Shared Interfaces

These are proposed signatures to implement, not claims that the exports exist today. The owning task defines each function before consumers use it. Keep production exports and test imports identical.

```js
// workflow-policy/delivery-scope.mjs (Task 3)
// Scope has exactly these keys. Return deeply frozen data.
const scopeKeys = [
  'schema',
  'repository',
  'issue',
  'exceptionKind',
  'pullRequest',
  'acceptedHeadSha',
  'baseRef',
  'resolvedTrunkRef',
  'requirementId',
  'deliveryOperationId',
];
// buildDeliveryScope(input) -> { scope, waiverScopeDigest, partitionKey }
// scope.schema = 'aitm.delivery-exception-scope/v1'
// partitionKey = canonicalRecordJson([repository, issue, exceptionKind,
//                                  requirementId, deliveryOperationId])

// workflow-policy/exception-partitions.mjs (Task 4)
// partitionWorkflowExceptions({ records, repository, issue })
// -> { ordinary: StoredRecord[], delivery: Map<partitionKey, StoredRecord[]> }
// StoredRecord is the existing { envelope, commentNodeId, body, authorLogin,
//                              createdAt, updatedAt } runtime shape.

// workflow-policy/delivery-waiver-authority.mjs (Task 5)
// resolveDeliveryWaiver({ records, scope, scopeIdentity, now, runtime })
// -> { outcome: 'waived', grant: Envelope, waiverScopeDigest, waiverReasonDigest }
//  | { outcome: 'missing', grant: null }
// Invalid/unreadable authority throws DeliveryWaiverAuthorityError with
// { category, requirementId, outcome: 'missing'|'indeterminate', remediation }.
// verifyPinnedDeliveryWaiver({ grant, burn, intent, scope, runtime }) -> evidence
// This has no `now` input and never invokes the current-grant resolver.
// runtime.verifyGrantAuthority(grant) reuses the Codex source loader and exact
// statement verification; it must not accept an unchecked authority object.

// delivery-waiver-consumption.mjs (Task 6)
// ensureWaiverIntent({ candidate, journal, comments, runId }) -> confirmed intent
// candidate pins the original intent ID/digest and exact rendered v3 intent.
// ensureDeliveryWaiverBurn({ candidate, journal }) -> { burn, burnOid, journalOid }
// publishWaivedReceipt({ burn, receiptBody, journal, comments, runId })
// -> { status: 'created'|'existing', comment, journalOid }
// journal.read() -> { oid: null|string, operations: Map, originalIntentOwners: Map }
// Each operation projects { state, intentPublication, burn, burnOid, publication }.
// burnOid is the immutable first burned-event commit; journalOid/oid is the CAS tip.
// journal.compareAndAppend({ expectedOid, entry }) -> confirmed snapshot
// comments.list() -> fully paginated exact comment records
// comments.create(body) -> provider comment result; transport failure is uncertain

// delivery-waiver-evidence.mjs (Task 7)
// validatePinnedWaiverEvidence({ intent, receipt, grant, burn, originalIntent })
// -> immutable, structurally consistent pinned evidence; no I/O or current time
// buildWaivedReceiptInput({ verifiedFacts, intent, grant, burn, burnOid })
// -> complete v4 builder input; refuses missing/mismatched confirmed burn evidence

// delivery-verification.mjs (Task 8), generic-waiver return contract only:
// Before burn: { deliveryDisposition: 'waived', verifiedFacts, receiptInput: null }
// Pinned path: same verifiedFacts plus a complete, reproducible receiptInput.
// verifiedFacts = { baseReceiptInput, providerMergeMethod, observedMergeMethod,
//                   observedFailureCategory, waivedRequirementId }
// baseReceiptInput contains ordinary factual fields, not terminal waiver authority.

// delivery-waiver-transaction.mjs (Task 9)
// runDeliveryWaiverTransaction({ context, originalIntent, records, deps })
// -> the existing runDeliver result shape with v3 intent and v4 receipt
```

`scope.issue` maps explicitly to the existing delivery record `issueNumber`, `scope.pullRequest` to `prNumber`, and `scope.acceptedHeadSha` to `expectedHeadSha`. Do not spread the scope into an exact-key delivery record.

Task order: `1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11`. Task 6's isolated transport tests can be developed after Task 3, but its integration cannot precede Task 5. No concurrent edits to the large verifier, record module, or deliver verb.

## Task 1: Characterize Existing Refusals and Historical Receipts

**Files:** Create `scripts/tests/unit/task-tracker/lib/delivery-default-refusals.test.mjs`. Read/reuse `scripts/tests/unit/task-tracker/verbs/deliver-test-harness.mjs`; extend its options only if a fixture cannot otherwise express the reproduction. Run existing `delivery-records.test.mjs`, `delivery-verification-attribution.test.mjs`, and `close-waived-delivery-receipt.test.mjs` under `scripts/tests/unit/task-tracker/lib/`.

**Interfaces:** Consume existing `makeHarness`, `deliver`, and `mergePendingIntent`; produce executable characterization of the pending-intent/merge-method refusal and existing schema selection. Preserve the harness's #939 defaults; the later end-to-end test builds explicit #1784/#1785 data rather than globally renaming this shared harness.

- [ ] Add a characterization test before changing production code:

```js
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { makeHarness, deliver, mergePendingIntent } from '../verbs/deliver-test-harness.mjs';

test('pending squash intent refuses a provider-reported merge', async () => {
  const h = makeHarness();
  await mergePendingIntent(h);
  h.data.prMergeMethod = 'merge';
  h.data.historyMergeMethod = 'merge';
  const writes = h.calls.createIssueComment;
  await assert.rejects(
    () => deliver(h),
    (error) => {
      assert.equal(error.category, 'merge-method');
      return true;
    }
  );
  assert.equal(h.calls.createIssueComment, writes);
});
```

- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/delivery-default-refusals.test.mjs`. Expect the characterization to pass against the current behavior. `mergePendingIntent` creates the pending intent and marks the PR merged; mutate its data observations afterward so provider and Git both say merge.
- [ ] Add explicit ordinary v1 intent/v1 receipt, warning v2 receipt, and #1755 v2 intent/v3 receipt round-trip assertions using the current builders. Add single-failure no-grant, wrong accepted SHA, missing merged PR, wrong target, unreachable merge, and malformed intent cases; preserve their existing categories/exit behavior and zero terminal writes. Separately label three reorder-sensitive multiple-failure fixtures: provider/intent method mismatch plus invalid merge SHA, invalid `mergedAt`, or valid-but-unknown Git topology. Record their current `merge-method` outcome; Task 8 owns the explicit new expectations in the same commit as the spec-required reorder. These three fixtures are not a promise of unchanged error precedence.
- [ ] Run the new file plus the three existing suites named above. Record the baseline and commit the characterization as `test: characterize delivery waiver boundaries [#1787]`.

## Task 2: Add Per-ID Capabilities and Complete Diagnostic Coverage

**Files:** Modify `scripts/task-tracker/lib/workflow-policy/catalog.mjs`, `consumer-coverage.mjs`, and `scripts/task-tracker/lib/delivery-verification.mjs`. Create `scripts/tests/unit/task-tracker/lib/delivery-verification-catalog-ids.test.mjs`; extend `scripts/tests/unit/task-tracker/lib/workflow-policy/catalog.test.mjs`.

**Interfaces:** Add `validateDeliveryWaiverIds(requirementIds, deliveryScope)` in the catalog. Export a frozen `VERIFICATION_DIAGNOSTICS` registry and strict `deliveryRequirementId(category)` from the verifier. Extend `DeliveryVerificationError` with immutable `requirementId` and `outcome` while preserving its existing category/message prefix.

- [ ] Write failing capability tests:

```js
const scope = {
  exceptionKind: 'delivery.invariant-waiver',
  requirementId: 'delivery.verification.merge-method',
};
assert.throws(() => validateWaiverIds([scope.requirementId]), /non-waivable/);
assert.deepEqual(validateDeliveryWaiverIds([scope.requirementId], scope), [scope.requirementId]);
assert.throws(() => validateDeliveryWaiverIds(['delivery.verification.waiver-authority'], scope));
```

- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/delivery-verification-catalog-ids.test.mjs scripts/tests/unit/task-tracker/lib/workflow-policy/catalog.test.mjs`; expect missing exports/new-ID failures.
- [ ] Implement all category-to-ID rows from the spec, including source-disagreement and the four resolver guardrail categories, with this explicit finer split permitted by the spec: `input` and `input-keys` map to new hard ID `delivery.verification.input-contract` in `delivery-waiver-guardrail`, with both capability flags false. `merge-before-intent` and `intent-created-at` retain `delivery.verification.intent-integrity`. Eight eligible verifier IDs use disclosure-only capability; four IDs (`input-contract`, `merge-method-evidence`, `attribution-waiver-authority`, and `waiver-authority`) are hard guardrails. Preserve all ten original hard delivery IDs.

```js
function deliveryItem(id, guardrail = false) {
  return Object.freeze({
    id,
    family: guardrail ? 'delivery-waiver-guardrail' : 'delivery-pr-verifier',
    waivable: false,
    waivableWithDisclosure: !guardrail,
  });
}
```

- [ ] Test exact one-ID validation, kind/ID mismatch, empty arrays, duplicate IDs, ordinary IDs, all hard guards, unknown IDs, and callers attempting to override an error's requirement ID. Extend `CONSUMER_DECLARATIONS` for the actual PR-verifier, authority-resolver, and pinned-evidence consumers.
- [ ] Add negative raising-site fixtures with a valid `delivery.verification.intent-integrity` grant: missing verifier functions, non-object PR/intent input, bad exact keys, invalid `recovery`, and malformed external `intentInput` all still refuse under `delivery.verification.input-contract`. Run these structural guards before evaluating any eligible predicate; they cannot be waived or translated into intent integrity.
- [ ] Compare every literal `verificationError(...)` category in the source to registry entries and execute table-driven failure fixtures. A strict lookup must throw for a new unknown category; the existing diagnostic fallback cannot fabricate its ID. Re-run Task 1 to verify this mapping-only task preserves existing categories, including the labelled pre-reorder fixtures. Task 8 alone changes their declared precedence. Commit as `feat: address delivery predicates without ordinary waiver access [#1787]`.

## Task 3: Implement Canonical Scope and the V2 Envelope

**Files:** Create `scripts/task-tracker/lib/workflow-policy/delivery-scope.mjs`. Modify `scripts/task-tracker/lib/workflow-policy/exception-record.mjs`. Create `scripts/tests/unit/task-tracker/lib/delivery-waiver-scope.test.mjs`; extend `scripts/tests/unit/task-tracker/lib/workflow-policy/exception-record.test.mjs`.

**Interfaces:** Implement `buildDeliveryScope` from Shared Interfaces. Extend `createWorkflowExceptionEnvelope`/`validateWorkflowExceptionEnvelope` using exact schema dispatch; preserve all v1 keys and behavior. V2 adds exactly `scopeKind`, `deliveryScope`, and `waiverScopeDigest` to the v1 payload keys. Its `requirementIds` contains one matching ID and `constraints` is empty.

- [ ] Add a complete scope fixture and failing digest tests:

```js
const scope = {
  schema: 'aitm.delivery-exception-scope/v1',
  repository: 'kburson/ai-task-manager',
  issue: 1784,
  exceptionKind: 'delivery.invariant-waiver',
  pullRequest: 1785,
  acceptedHeadSha: 'a'.repeat(40),
  baseRef: 'trunk',
  resolvedTrunkRef: 'origin/trunk',
  requirementId: 'delivery.verification.merge-method',
  deliveryOperationId: '01M2H000000000000000000002',
};
const first = buildDeliveryScope(scope);
assert.equal(first.waiverScopeDigest, buildDeliveryScope({ ...scope }).waiverScopeDigest);
assert.notEqual(
  first.waiverScopeDigest,
  buildDeliveryScope({ ...scope, acceptedHeadSha: 'b'.repeat(40) }).waiverScopeDigest
);
assert.throws(() => buildDeliveryScope({ ...scope, resolvedTrunkSha: 'c'.repeat(40) }));
```

- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/delivery-waiver-scope.test.mjs scripts/tests/unit/task-tracker/lib/workflow-policy/exception-record.test.mjs`; expect new scope/v2 cases to fail.
- [ ] Implement exact-key/type validation and canonical hashing with existing primitives:

```js
const waiverScopeDigest = `sha256:${createHash('sha256')
  .update(canonicalRecordJson(deliveryScope), 'utf8')
  .digest('hex')}`;
```

- [ ] Dispatch on `payload.schema` and `scopeKind` before exact payload keys/capability validation. V2 calls `validateDeliveryWaiverIds`, requires empty constraints, canonical bounded expiry, and recomputed scope digest equality. Preserve envelope authority/payload-hash checks, bounded rendering, edited-comment refusal, and exact parse/render round trips.
- [ ] Test positive create/parse/readback data; each changed scope field; wildcard/null PR on the PR lane; unknown kind/schema; ordinary IDs; digest mismatch with a freshly correct outer payload hash; agent/unsupported-host authority; null/expired timestamps; non-empty constraints. The shared scope codec may describe explicit-null local-trunk scope, but #1787's production v2 kind validator must refuse that unimplemented authorization kind.
- [ ] Re-run the two suites and existing v1 fixtures. Commit as `feat: define delivery-scoped workflow exception records [#1787]`.

## Task 4: Partition Exception Chains and Preserve Ordinary Policy

**Files:** Create `scripts/task-tracker/lib/workflow-policy/exception-partitions.mjs`. Modify `exception-record.mjs`, `exception-store.mjs`, `snapshot.mjs`, `preflight.mjs`, and `evaluator.mjs` under `scripts/task-tracker/lib/workflow-policy/`. Create `scripts/tests/unit/task-tracker/lib/workflow-policy/exception-partitions.test.mjs`; extend `scripts/tests/integration/task-tracker/verbs/workflow-exception.test.mjs` and `workflow-preflight.test.mjs`.

**Interfaces:** Implement `partitionWorkflowExceptions`. Preserve `resolveWorkflowExceptionRecords` as the ordinary-chain compatibility facade, and add `resolveDeliveryExceptionChain({ records, partitionKey, repository, issue, scopeIdentity, now })`. Extend store `record/revise/revoke/show` selection with an exact delivery partition selector; no caller may select a record solely by position in the issue's comment list.

- [ ] Add failing coexistence tests using existing workflow-exception integration fixtures. Record an ordinary review bundle, then two delivery grants under different operation keys. Ordinary decisions and constraints must be unchanged; each delivery head/revision must be isolated.

```js
const grouped = partitionWorkflowExceptions({ records, repository, issue });
assert.equal(grouped.ordinary.length, 1);
assert.equal(grouped.delivery.size, 2);
assert.deepEqual(
  evaluateWorkflowPolicy({ ...ordinaryContext, records: ordinaryEvaluatorRecords }).prohibitions,
  expectedOrdinaryProhibitions
);
```

Here `records` are actual envelopes produced by Task 3 and existing v1 fixture builders; `ordinaryEvaluatorRecords` must come from the ordinary resolver, not a handcrafted authorization boolean.

- [ ] Run the new partition test and the two integration suites; expect issue-wide chain/write assumptions to fail for coexistence.
- [ ] Partition after exact record validation but before resolving chains, write preconditions, or readback. Keep one ordinary chain. Require one immutable exception ID per delivery key, uniqueness across delivery partitions, contiguous revisions, one root/head, and no cross-partition predecessor/supersedes links.
- [ ] Include discriminator, full scope, and scope digest in `desiredPolicy`, `policyOf`, equality, and the final store write-idempotency hash. Mint/select the ULID before hashing the scope; do not put store `operationId` into its own preimage. Address v2 revocation by its exact partition and retain the immutable chain key.
- [ ] Add fork, duplicate root/head, unknown schema, transport ambiguity, wrong partition readback, operation-digest collision, and pre-burn re-scoping tests. Require fresh approval after re-scoping; consumed operation availability is independent of grant revision.
- [ ] Partition `authorityRevisions`, not only active records. Render kind/key/disposition for delivery history and preserve ordinary history. The overall snapshot hash may change. Ordinary evaluation never grants a disclosure-only requirement; ordinary deny constraints still block. Re-run v1 evaluator and slow lifecycle tests, then commit as `feat: isolate delivery exception chains from workflow policy [#1787]`.

## Task 5: Add Exact Human Preparation, Recording, and Authority Resolution

**Files:** Create `scripts/task-tracker/lib/workflow-policy/delivery-request.mjs`, `delivery-waiver-authority.mjs`. Modify `scripts/task-tracker/verbs/workflow-exception.mjs`, `verbs/help-data.mjs`, and `scripts/task-tracker/lib/command-surface/catalog.mjs`, `routing.mjs`. Create `scripts/tests/unit/task-tracker/lib/delivery-waiver-authority.test.mjs` and its fixture-only helper `delivery-waiver-authority-fixtures.mjs` in the same directory; extend `scripts/tests/integration/task-tracker/verbs/workflow-exception.test.mjs` and existing command-policy tests. Keep each test file below the repository's 800-code-line cap; fixture helpers do not register tests or change the named suite command.

**Interfaces:** `prepareDeliveryWaiver({ input, facts, ids }) -> { proposal, statement, request }`; `deliveryApprovalStatement({ action, proposalDigest }) -> string`; `resolveDeliveryWaiver` and `DeliveryWaiverAuthorityError` as above. Use `resolveWorkflowExceptionAuthority`/`createCodexSessionSourceLoader` and the exact-statement verification pattern in the #1755 verb; do not import a test-only host assertion into production.

- [ ] Write failing parser/preparation tests. Add `workflow-exception prepare #N --input-file <proposal.json> --json` to the existing verb, preserving existing record/show/revise/revoke grammar. Delivery operations accept exactly one issue per request. Preparation generates no approval source and performs no write.
- [ ] Define closed `aitm.delivery-waiver-proposal/v1` input keys: `schema`, `action`, `exceptionId`, `priorRecordId`, `priorRevision`, `requirementId`, `reason`, `expiresAt`, and `deliveryOperationId`. `action` is exactly `record`, `revise`, or `revoke`. For first record preparation, exception/operation IDs are null and generated once into the returned proposal; a repeat retains both IDs. Prior record/revision are null for record and an exact existing record ID/positive revision for revise/revoke. Revise/revoke retain the addressed chain's exception/operation/requirement IDs. Derive repository, issue, PR/head/refs, original intent, and body scope through live reads; refuse a stale prior selector. For revoke, retain the selected grant's delivery scope; use the explicitly approved bounded future `expiresAt` for the new revoked envelope so the existing after-recording timestamp rule is respected even when the old grant expired. This timestamp cannot reactivate a revoked chain or change historical burn authority. Preparation is reachable for all three actions through the input discriminator, without a new CLI verb.
- [ ] Define the generated v2 request's exact keys as `schema`, `action`, `authorizationSource`, `constraints`, `exceptionId`, `expiresAt`, `reason`, `requirementIds`, `scopeKind`, `deliveryScope`, `waiverScopeDigest`, `scopeIdentity`, `priorRecordId`, `priorRevision`, and `proposalDigest`. Schema is `aitm.workflow-exception-request/v2` for record/revise and `aitm.workflow-exception-revocation/v2` for revoke; both use this explicit key set, `constraints: []`, and one matching requirement. `authorizationSource` is null only in a prepared draft; write validation requires the genuine user-message source. Require the command action, request action, and schema to agree. Preserve all v1 request contracts.
- [ ] Hash a closed proposal preimage containing `schema: 'aitm.delivery-waiver-approval/v1'`, `action`, `repository`, `issue`, `scopeIdentity`, `waiverScopeDigest`, `exceptionId`, `reasonDigest`, `expiresAt`, `priorRecordId`, and `priorRevision`. Use canonical JSON and the existing `sha256:` convention. Persist these facts through the v2 envelope's existing scope/policy/revision/predecessor/authority fields; recompute the digest from those fields and the pinned predecessor for historical authority verification. Do not add undeclared fields to the accepted envelope schema. Compute the proposal digest before loading the human message. Use a deterministic statement:

```js
export function deliveryApprovalStatement({ action, proposalDigest }) {
  return `Authorize ${action} of delivery exception proposal ${proposalDigest}.`;
}
// After resolving the genuine user message:
if (authority.statement !== expectedStatement) {
  throw new DeliveryWaiverAuthorityError('delivery-waiver-authority', 'missing');
}
```

- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/delivery-waiver-authority.test.mjs scripts/tests/integration/task-tracker/verbs/workflow-exception.test.mjs scripts/tests/unit/task-tracker/core/command-manifest.test.mjs scripts/tests/unit/task-tracker/lib/command-catalog-policy.test.mjs`; expect new preparation/v2 cases to fail.
- [ ] Implement resolver lookup for the exact key, current expiry/revocation/body scope, capability, reason, and human authority. Expose the four-category registry from the spec with immutable hard guardrail ID. Unreadable or ambiguous evidence is `indeterminate`; absent grant returns `missing`. Re-fetch scope and the addressed prior record immediately before record/revise/revoke writes and refuse drift. Do not mint a new exception or operation on record retry. Revoke never authorizes delivery and must remain possible for an expired or body-stale grant: validate the exact selected historical policy plus a fresh current-body approval statement, without requiring the grant to be currently usable for delivery.
- [ ] Exercise full prepare -> exact human statement -> write -> readback flows for record, revise, and revoke. Test stale prior record/revision, changed body scope after preparation, changing action without reapproval, null IDs on retry, canonical digest reconstruction from stored authority, and revoking an expired grant. No test may bypass preparation by hand-supplying an unverifiable proposal digest.
- [ ] Test genuine user versus assistant/injected text, wrong statement/source hash, changed reason/expiry/scope/action, wrong issue/PR/head/base/operation, empty/placeholder reasons, unsupported host, null expiry, and read failures. Test each resolver raising branch and typed rendering; no ordinary-prefix parsing. Preserve missing-scope-section remediation.
- [ ] Keep no `PREFLIGHT_MODE` entry for the verb, and assert prepare/show cause zero binding/timer/comment/provider effects. Re-run parser policy and v1 CLI fixtures; commit as `feat: prepare and verify scoped delivery waiver authority [#1787]`.

## Task 6: Implement Durable Single-Use Consumption and Publication

**Files:** Create `scripts/task-tracker/lib/delivery-waiver-consumption.mjs`, `delivery-waiver-journal.mjs`, `scripts/tests/unit/task-tracker/lib/delivery-waiver-consumption.test.mjs`, and `scripts/tests/integration/task-tracker/lib/delivery-waiver-journal.test.mjs`. Put reusable unit fixture setup in adjacent `delivery-waiver-consumption-fixtures.mjs` and two-clone/process setup in integration helper `delivery-waiver-journal-harness.mjs`. Helpers register no tests; all cases remain reachable through the named test files, each below the 800-code-line cap.

**Interfaces:** Implement Shared Interfaces' journal, intent reservation, burn, and publication APIs. Use schema `aitm.delivery-waiver-consumption/v1` for the immutable burn and `aitm.delivery-waiver-journal-entry/v1` for transitions. Burn keys are exactly `schema`, `repository`, `issue`, `deliveryOperationId`, `waiverRecordId`, `waiverRevision`, `waiverScopeDigest`, `waiverReasonDigest`, `acceptedHeadSha`, `intentId`, `mergeCommitSha`, `authorizedAt`, and `grantDigest`. The canonical operation key excludes grant revision. Journal entries contain exactly `schema`, `sequence`, `predecessorOid`, `repository`, `issue`, `deliveryOperationId`, `state`, `intentPublication`, `burn`, and `publication`. `intentPublication` has exactly `originalIntentId`, `originalIntentDigest`, `intentId`, `intentBody`, `intentDigest`, `runId`, `commentNodeId`, and `createdAt`; its last two fields are null until confirmation. `burn` is null until consumed. `publication` is null until receipt requesting, then has exactly `receiptBody`, `receiptDigest`, `runId`, and nullable `commentNodeId`. Preserve all immutable fields in later transitions. Project all operations and original-intent ownership from the full issue history, not only its last event.

- [ ] Write failing state-machine tests: one operation/two intents, same-intent retry, revised grant after burn, duplicate/conflicting burns, lost burn response, lost receipt response, and unreadable journal. Assert no receipt POST occurs unless a confirmed matching burn and successful requesting transition exist.

```js
const results = await Promise.allSettled([
  ensureDeliveryWaiverBurn({ candidate: firstIntentBurn, journal: hostA }),
  ensureDeliveryWaiverBurn({ candidate: secondIntentBurn, journal: hostB }),
]);
assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
assert.equal((await hostA.read()).operations.get(operationId).state, 'burned');
```

`hostA` and `hostB` use separate journal adapters against the same disposable bare remote; `operationId` is the fixture's reserved operation. First seed its confirmed intent. Candidate objects have the exact burn keys above; one matches the reserved intent, the other has a different valid intent ID and must refuse.

- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/delivery-waiver-consumption.test.mjs scripts/tests/integration/task-tracker/lib/delivery-waiver-journal.test.mjs`; expect absent journal/state-machine APIs to fail.
- [ ] Implement canonical bounded journal objects using Git plumbing (`hash-object`, `mktree`, `commit-tree`) with argument arrays and explicit stdin. Resolve and validate the remote repository first. Read the exact remote ref; fetch and verify its complete single-parent chain and canonical entry. Never use the worktree index for journal objects. Build only the permitted direct-child transition.

```js
const ref = `refs/heads/aitm/delivery-waivers/${issue}`;
const args = [
  'push',
  '--porcelain',
  '--no-follow-tags',
  `--force-with-lease=${ref}:${expectedOid ?? ''}`,
  'origin',
  `${nextOid}:${ref}`,
];
// Execute only after validating ref components, remote identity, entry schema,
// and nextOid's sole parent (or parentless creation when expectedOid is null).
```

- [ ] Re-read remote authority after every push, including transport errors. Exact confirmed state permits continuation; differing intent/digest refuses; unknown outcome remains indeterminate. A requesting winner must match the invocation's original run nonce; observing another winner never permits its POST. A stale CAS caused by an unrelated operation may retry only after replaying the entire history and revalidating ownership/state. No unrelated ref is updated and no ref is deleted. The journal never grants a waiver: only Task 5's validated grant plus fresh complete verifier evidence can construct the initial burn after intent confirmation.
- [ ] Implement `ensureWaiverIntent` with the same request-once/readback discipline as receipt publication. Reserve before POST, read back exact bytes and provider comment metadata, reject duplicate/conflicting comments, then CAS to confirmed. Require one original-intent owner across all operation IDs and one intent per operation. A crash or ambiguous POST never causes a second intent append. Later grant revision or scope drift after reservation refuses without silently changing the frozen intent.
- [ ] Derive `burnOid` from the unique historical commit that first transitions this operation to `burned`; it is not a field in that commit's payload, avoiding a self-hash. Preserve this OID in the projected operation through receipt transitions and unrelated operation appends. `journalOid` is only the current CAS cursor. Receipt/evidence builders pin `burnOid`, never the moving journal tip. Verify that the pinned burn commit remains in the validated remote history; a missing/reset/non-descendant history refuses rather than treating the operation as fresh.
- [ ] Implement the publication state machine described above. Verify byte-identical comment readback and provider metadata, reject multiple or divergent matching comments, and record completion with a CAS transition. A restarted invocation that sees `receipt-requesting` may reconcile a present exact comment but cannot replay an uncertain POST. Return an existing completed receipt idempotently.
- [ ] Implement the terminal automated-progress refusal and human escalation contract from Consumption Serialization Decision. Test a confirmed requesting transition with a lost POST outcome and no matching comment: return typed `indeterminate`/hard ambiguity, stage/operation identity, and explicit escalation text; state whether approval is burned, and make no POST, new operation, or terminal lifecycle write. Test that this is neither `missing` nor idempotent success. A later unique exact original comment may reconcile; elapsed time, repeated empty listings, a changed grant, or a supplied operator assertion never unlock a replay. Task 10 must preserve these fields in operator output.
- [ ] Use two clones and separate processes to prove one intent POST, burn, and receipt POST across same-operation attempts; also race two valid operation grants against one original intent and require only one intent publication. Insert crash checkpoints before push, after remote acceptance, before each POST, after each POST, and before confirmation/completion writes. Test unrelated operations interleaved on the issue journal, delayed readback, and expiry/revocation after reservation but before burn. Simulate branch-write refusal and remote identity mismatch; both fail closed. Test no-grant preparation and read-only preflight perform zero pushes. Commit as `feat: serialize delivery waiver consumption durably [#1787]`.

## Task 7: Add V3 Intent, V4 Receipt, and Pinned Evidence Validation

**Files:** Create `scripts/task-tracker/lib/delivery-waiver-evidence.mjs` and `scripts/tests/unit/task-tracker/lib/delivery-waived-receipt.test.mjs`. Modify `scripts/task-tracker/lib/delivery-records.mjs`; extend `scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs`.

**Interfaces:** Extend existing builders, renderers, parsers, `authorizedIntentBytes`, and `projectDeliveryRecords`; implement `validatePinnedWaiverEvidence` and `buildWaivedReceiptInput`. V3 uses all ordinary intent keys plus the spec's generic-waiver fields, `originalIntentId`, `originalIntentCreatedAt`, `originalIntentDigest`, `waiverGrant` (canonical envelope), `providerMergeMethod`, and `observedMergeMethod`. Receipt v4 uses the ordinary receipt base plus generic-waiver fields, canonical grant, full confirmed burn with its digest and immutable `burnOid`, and pinned observations. Do not serialize the latest journal CAS cursor into a receipt. It must not acquire #1755 attribution fields by spread or implicit schema selection.

- [ ] Add failing exact-key/schema tests. Build a valid grant and burn using Tasks 3-6, a valid original v1 intent using the existing builder, then a v3 intent and v4 receipt. Assert schema, visible result, immutable references, and round-trip canonical equality.

```js
assert.equal(intent.schema, 'aitm.delivery-intent/v3');
assert.equal(receipt.schema, 'aitm.delivery-receipt/v4');
assert.equal(receipt.result, 'waived');
assert.equal(receipt.waivedRequirementId, 'delivery.verification.merge-method');
assert.notEqual(authorizedIntentBytes(originalIntent), authorizedIntentBytes(intent));
assert.doesNotThrow(() =>
  validatePinnedWaiverEvidence({
    intent,
    receipt,
    grant,
    burn,
    originalIntent,
  })
);
```

- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/delivery-waived-receipt.test.mjs scripts/tests/unit/task-tracker/lib/delivery-records.test.mjs`; expect new-schema cases to fail.
- [ ] Implement explicit schema selection and exact version-specific keys. Reuse canonical envelope validation, bounded text/record size guards, secret-data checks, digests, and deep freezing. Hash the bounded human reason separately from the scope; preserve authorizing principal (including null when unknown) and recording actor. Keep one waived ID, even when several categories map to it.
- [ ] Assemble terminal input only after confirmed consumption. `buildWaivedReceiptInput` checks agreement of verified facts, intent, grant, burn, and immutable burn OID, then supplies all required v4 fields. Null/absent burn, conflicting scope/operation/intent/merge SHA, or a provisional fact report passed directly to `buildDeliveryReceipt` must refuse. Pure tests use explicit validated fixtures; Task 9 supplies actual remote-confirmed evidence.
- [ ] Pin the original authorization, not the later waiver recording time, for temporal checks. Require the original intent's exact stored digest and its real comment timestamp. Validate grant/burn/intent/receipt identity and scope agreement; reject revocation effective before authorization. Pinned validation must have no current-clock dependency.
- [ ] Add a narrow v1-to-v3 graph transition to `validateIntentGraph`: the v3 must directly supersede the chronological live original v1, retain its exact repository/issue/PR/head/base and all ordinary authorized intent fields, and pin its full canonical record digest plus provider creation timestamp. A changed schema/added generic-waiver fields are permitted only through this validated transition, not a global removal of `same-key-divergence`. Require that the predecessor has no terminal receipt. Retain duplicate-ID, fork, order, cycle, multiple-tip, and operation-reuse guards. Reject v2-to-v3 composition in this issue because the singular generic waiver does not incorporate #1755 authority.
- [ ] Test projection of the complete `[original v1, superseding v3, terminal v4]` comment history, not just standalone codecs. Include negatives for changed original merge method/message/head/base, missing or wrong predecessor/digest/time, an already-receipted predecessor, v2 predecessor, unrelated same-key divergence, and competing successors. Require unique operation-to-intent ownership in projection. Test unknown/mixed version pairs, extra/missing keys, altered reason/scope/grant/burn digest, excessive comment size, and duplicate receipts. Re-run every legacy record fixture, then commit as `feat: represent waived delivery with pinned evidence [#1787]`.

## Task 8: Evaluate One Waiver Without Skipping Other Predicates

**Files:** Modify `scripts/task-tracker/lib/delivery-verification.mjs`; extend Task 2's diagnostic tests and `scripts/tests/unit/task-tracker/lib/delivery-default-refusals.test.mjs`; create `scripts/tests/unit/task-tracker/lib/delivery-waiver-reverification.test.mjs`.

**Interfaces:** Extend `verifyDeliveredPullRequest` with generic-waiver evidence distinct from existing #1755 `waivedEvidence`. Define two validated evidence forms: fresh current authority from Task 5 with the original intent (and confirmed v3 intent when available), or historical pinned authority with its real burn. Select the form from verified durable transaction state inside Task 9/10, never from CLI/caller mode flags. Fresh verification requires no burn and returns only provisional `verifiedFacts` with `receiptInput: null`; the historical form reconstructs full input through Task 7's assembler after validating its burn. The receipt builder derives `result` from complete generic-waiver evidence, not an arbitrary result override. Add `evaluateDeliveryPredicate({ category, observedFailure, waiver, failures })` as a module-local helper; it records a provisional waived decision for an eligible exact ID and never performs I/O, grant lookup, burn, or receipt writes. Evidence needed to compute later predicates must exist even when a predicate is waived. Preserve the existing return contracts for ordinary and #1755 paths.

Add exact `GENERIC_WAIVER_VERIFICATION_INPUT_KEYS = [...VERIFICATION_INPUT_KEYS, 'genericWaiverEvidence']`; do not widen `WAIVED_VERIFICATION_INPUT_KEYS`. Admit it only for validated fresh v1-original/v3-candidate or pinned v3 inputs. V3 without generic evidence, v2 with generic evidence, mixed `waivedEvidence`/`genericWaiverEvidence`, unknown schemas, and extra keys refuse under `input-contract`. Ordinary v1 without the new field and attribution v2 retain their exact existing input key sets. The new field is evidence to validate, never an authorization flag.

- [ ] Add a failing motivating verifier fixture: authorized squash; merged PR metadata says merge; two-parent Git topology proves merge; accepted Test/Review/head, target, original intent, attribution, and reachability all valid. Expect one provisional waived decision and no side effects.

```js
const verified = await verifyDeliveredPullRequest(input);
assert.equal(verified.deliveryDisposition, 'waived');
assert.equal(verified.receiptInput, null);
assert.equal(verified.verifiedFacts.observedMergeMethod, 'merge');
assert.equal(verified.verifiedFacts.providerMergeMethod, 'merge');
assert.equal(verified.verifiedFacts.waivedRequirementId, 'delivery.verification.merge-method');
assert.equal(writes.length, 0);
```

`input` uses the existing verifier's injected Git/provider functions, the original intent, and genuinely resolved fresh grant evidence, with no burn or terminal receipt. `writes` records any injected effect callback and must remain empty. Add a separate pinned fixture with actual Task 7 records, a confirmed burn, and full receipt reconstruction. Reject fake mode booleans, incomplete historical evidence, and an attempted receipt build from provisional facts.

- [ ] Run the new reverification suite and Task 1/2 suites; expect generic-waiver behavior to fail initially.
- [ ] Move method equality after independently collecting valid optional provider metadata and known Git topology. Provider null stays null. Source disagreement, unknown topology, unavailable evidence, invalid input needed by subsequent checks, and all authority self-checks remain hard refusals. Translate typed resolver errors without changing their hard requirement ID. All `input`/`input-keys` raises use Task 2's non-waivable `input-contract` mapping, including the ordinary and external verifier entrypoints.
- [ ] In the same commit as the reorder, update only Task 1's labelled multiple-failure expectations: equality mismatch plus invalid merge SHA now yields `merge-commit-sha`; plus invalid merge timestamp yields `merged-at`; plus otherwise-valid but unknown Git topology yields `merge-method-unknown` under the hard `merge-method-evidence` ID. Keep single-failure no-grant categories and exit behavior unchanged. Add disagreement/invalid-provider observations as separate hard-guard fixtures, and preserve the default refusal and zero-write invariant in every case. Record the intentional precedence changes rather than silently weakening the baseline.
- [ ] Accumulate failed requirement IDs before deciding to waive; two distinct IDs refuse before burn. Continue every other predicate. Never synthesize a head, PR, merge commit, timestamp, or reachability proof to keep a waived path running. An ID's catalog eligibility does not remove close's independent hard prerequisites.
- [ ] Add a pinned re-verification path that recomputes live facts while reproducing stored provider observation/receipt bytes. Test current provider metadata appearing/disappearing, conflicting metadata, changed topology, unrelated trunk advancement, post-expiry authorization, and current-grant resolver spies that throw if called. Preserve ordinary and attribution-waiver behavior apart from the explicitly enumerated spec-required merge-observation precedence changes above. Commit as `feat: verify disclosed delivery waivers without hidden passes [#1787]`.

## Task 9: Wire Effect-Time Delivery and Retry Recovery

**Files:** Create `scripts/task-tracker/lib/delivery-waiver-transaction.mjs`. Modify `scripts/task-tracker/verbs/deliver.mjs`. Create `scripts/tests/integration/task-tracker/delivery-waiver-merge-method.integration.test.mjs`; extend `scripts/tests/unit/task-tracker/verbs/deliver.test.mjs` and its harness.

**Interfaces:** Implement `runDeliveryWaiverTransaction`; add dependency ports for Task 5's authority resolver and Task 6's journal/publication adapter to `createDefaultDeliverDeps`. Keep `runDeliver`'s existing result shape and exit behavior. Explicitly attach the generic transaction path to the already-merged PR with an existing authorized intent; the user must not need the unreachable historical `--reconcile-merge-method` branch.

- [ ] Build a fully isolated #1784 / PR #1785 integration fixture from existing deliver/close harness patterns. Set body sections, accepted markers, issue binding, PR identity, Git topology, and original authorized intent to that fixture's exact IDs. Do not mutate live GitHub data or globally rename the shared #939 harness.
- [ ] First assert no grant yields the original method refusal and no burn/receipt. Then record a real fixture v2 grant and assert a v3 superseding intent, confirmed burn, and exactly one v4 waived receipt. Count provider actions: this already-merged path emits no second merge action.

```js
assert.equal(first.receipt.result, 'waived');
assert.equal(first.intent.schema, 'aitm.delivery-intent/v3');
const writesAfterFirst = calls.receiptPosts;
const retry = await runDeliver(sameTransactionInput);
assert.deepEqual(retry.receipt, first.receipt);
assert.equal(calls.receiptPosts, writesAfterFirst);
assert.equal(calls.providerActions, 0);
```

- [ ] Run the new integration file and deliver unit suite; expect the granted path to fail before wiring.
- [ ] Dispatch from verified durable state: existing v4 receipt -> pinned verification/idempotent return; exact confirmed burn -> same-intent pinned retry; otherwise -> fresh current authority. On a fresh attempt resolve the grant, verify original-intent/live facts without a burn, construct the v3 candidate with those observations, then select/resume its immutable reservation through `ensureWaiverIntent`. Never use ordinary unconditional `appendIntent` for this write. Confirm the exact v3 intent before burn, retaining the original intent identity/timestamp. Re-read issue, PR, grants, and complete live verifier evidence at the consumption boundary. Place burn after the last non-waived verification, including late reachability. Only then call `buildWaivedReceiptInput` with the confirmed burn and `burnOid`, build the v4 receipt, and enter receipt publication. Tests assert this order and that missing/failed verification prevents the burn while an unconfirmed burn prevents receipt assembly/publication.
- [ ] Use Task 6's journal for receipt publication rather than the old unconditional POST/retry block. On scope change, two failed IDs, wrong grant, revised consumed operation, conflicting intent, lost write, or unresolved journal state, return a structured refusal and do not emit an ordinary receipt or terminal lifecycle effects.
- [ ] Test race injections after preparation, before intent reservation/publication, after intent readback, before burn, and during receipt publication. Assert the actual projected comment history remains valid with one v3 successor after two-host contention, including different operations naming one predecessor. Include revoked/expired grant before burn, fresh human approval after pre-reservation re-scoping, explicit post-reservation drift refusal, and confirmed-burn retry after expiry. Re-run existing deliver-close, historical/external recovery, and #1755 integration suites. Commit as `feat: consume delivery waivers at the receipt boundary [#1787]`.

## Task 10: Support Close, Recovery, and Read-Only Disclosure

**Files:** Modify `scripts/task-tracker/lib/close-delivery-receipt.mjs`, `reopened-close-recovery.mjs`, `false-delivery-close-recovery.mjs`, `action-decision/deliver.mjs`, `action-decision/close.mjs`, `action-decision/presentation.mjs`, `workflow-policy/snapshot.mjs`, `workflow-policy/preflight.mjs`, `scripts/task-tracker/verbs/workflow-preflight.mjs`, and `scripts/task-tracker/verbs/close.mjs`. Extend existing close/recovery/preflight tests; create `scripts/tests/unit/task-tracker/lib/delivery-waiver-close-recovery.test.mjs`.

**Interfaces:** `requireDeliveryReceipt` explicitly admits v3-intent/v4-receipt pairs; `verifyCloseDeliveryReceipt` uses Task 7 pinned evidence plus Task 8 live verification and retains canonical receipt equality. Recovery validators use the same exact pair validation. Preflight adds a typed `deliveryExceptions` projection, leaving ordinary decisions/history intact; version its report if an exact-key public parser requires a new shape.

- [ ] Add failing post-burn/post-expiry close tests and reopened/false-delivery bundle tests. Current-grant resolution must be unreachable on the historical path:

```js
deps.resolveDeliveryWaiver = () => {
  throw new Error('historical close attempted current authorization');
};
const result = await verifyCloseDeliveryReceipt(closeInput);
assert.equal(canonicalRecordJson(result.receipt), canonicalRecordJson(storedReceipt));
assert.equal(journalWrites, 0);
assert.equal(receiptPosts, 0);
```

- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/delivery-waiver-close-recovery.test.mjs scripts/tests/unit/task-tracker/lib/reopened-close-recovery.test.mjs scripts/tests/unit/task-tracker/lib/false-delivery-close-recovery.test.mjs scripts/tests/integration/task-tracker/verbs/workflow-preflight.test.mjs`; expect new pair/waived-rendering assertions to fail.
- [ ] Keep ordinary v1/v2/v3 receipt dispatch unchanged. On v4, re-read immutable grant/burn/original-intent evidence and current PR/Git facts; remove intent-method coercion for this path only. Preserve exact byte comparison and ordinary issue/head/target/merged/reachability requirements. Later expiry/revocation does not erase valid completed evidence; edited or mismatched pinned evidence refuses.
- [ ] After creating a waived receipt, append its completed transition and events for another operation on the same issue. Re-read and close the original receipt: `burnOid` and every canonical receipt byte must remain unchanged although the journal tip has advanced. Cover confirmed-burn retry, lost completion response, missing burn ancestry, and an attempted replacement of `burnOid` with the current tip.
- [ ] Explicitly admit v3/v4 in the two recovery modules; do not widen version checks to ranges or accept schema-name-only evidence. Preserve old supported combinations and reject mixed pairs. Do not fix unrelated pre-existing #1755 recovery exclusions in this task.
- [ ] Render ordinary delivered, attribution waived, generic waived, blocked, and indeterminate distinctly in action explanations, deliver/close output, issue audit, and parsed projections. Use structured category/requirement/outcome fields. Narrow `--reconcile-merge-method` guidance to its actual historical/external lanes and point pending-intent failures to preparation.
- [ ] Add zero-effect spies for preflight/show: no comments, timers, bindings, providers, or remote-ref writes. Test `indeterminate` is not rendered as missing or passed. Test local-trunk records never authorize a PR waiver and PR grants never authorize no-PR close. Commit as `feat: close and explain pinned waived deliveries [#1787]`.

## Task 11: Package, Document, and Verify the Full Contract

**Files:** Modify `docs/guides/workflow.md`, `skill/shared/rules/deliver.md`, `scripts/task-tracker/verbs/help-data.mjs`. Create `scripts/tests/integration/task-tracker/lib/package-delivery-waiver-smoke.test.mjs`. Extend `scripts/tests/integration/task-tracker/delivery-waiver-merge-method.integration.test.mjs` and `scripts/tests/slow/task-tracker/workflow-exception-lifecycle.test.mjs` where relevant.

**Interfaces:** The installed package exposes the same prepare/record/show/revise/revoke workflow, read-only explanations, and delivery behavior as the checkout. No package publication is performed by verification.

- [ ] Add a package smoke test following `package-workflow-exception-smoke.test.mjs`: pack into a disposable repository-local test directory, install the tarball, verify runtime modules/guide inclusion, and execute help, read-only preparation with mocked ports, and codec round trips. The test must not assert that repository planning files are packed.
- [ ] Document proposal creation, exact Codex approval, recording, normal deliver retry, expiry versus historical verification, journal permission requirements, and Task 6's terminal unresolved-publication refusal/escalation. Explicitly disclose the availability limitation: no force-republish or fresh-grant escape path exists for an uncertain outstanding write; burned approval stays spent. State that a request file or `--reason` never grants authority and automatic cleanup/force deletion is unsupported. Explain one durable journal branch per waived issue, cumulative event/object growth, and default refspec visibility in clones. Recommend filtering audit branches out of ordinary branch displays; any optional narrowed fetch configuration must retain the adapter's explicit exact journal fetch and never imply journal deletion or automatic configuration changes.
- [ ] Add the complete end-to-end acceptance matrix below and run it before broad gates. Include ordinary delivery and #1755 in the same regression run; assert the #1784/#1785 fixture reaches close with result visibly waived and no normal-pass backfill.
- [ ] Run:

```sh
node --test scripts/tests/unit/task-tracker/lib/delivery-verification-catalog-ids.test.mjs scripts/tests/unit/task-tracker/lib/delivery-waiver-scope.test.mjs scripts/tests/unit/task-tracker/lib/delivery-waiver-authority.test.mjs scripts/tests/unit/task-tracker/lib/delivery-waiver-consumption.test.mjs scripts/tests/unit/task-tracker/lib/delivery-waiver-reverification.test.mjs scripts/tests/unit/task-tracker/lib/delivery-waived-receipt.test.mjs scripts/tests/unit/task-tracker/lib/delivery-default-refusals.test.mjs scripts/tests/unit/task-tracker/lib/delivery-waiver-close-recovery.test.mjs
node --test scripts/tests/integration/task-tracker/delivery-waiver-merge-method.integration.test.mjs scripts/tests/integration/task-tracker/lib/delivery-waiver-journal.test.mjs scripts/tests/integration/task-tracker/lib/package-delivery-waiver-smoke.test.mjs
npm test
npm run test:integration
npm run test:slow
npm run lint
npm run format:check
```

- [ ] Keep the explicit three-file integration command as the focused new-feature check, then run the entire integration lane; none of the existing or extended integration suites is excluded. This includes workflow-exception/preflight, ordinary deliver-close, #1755, external recovery, and package-workflow-exception regressions. Fix failures in the owning task rather than weakening expected refusals or skipping tests; the enumerated Task 8 precedence rebaseline is intentional, not a waiver of this gate. Run `node scripts/task-tracker/verify-develop.mjs` in the correctly bound implementation worktree when required by that workflow. Record commands, actual counts, artifact head, and any unavailable external checks truthfully. Commit as `docs: verify and explain generic delivery waiver workflow [#1787]`.

## Acceptance Matrix and Spec Coverage

| Spec obligation                          | Owning tasks | Required evidence                                                                                          |
| ---------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------- |
| Existing hard gates and default refusals | 1, 2, 8, 9   | No-grant baseline; all ten hard IDs; ordinary v1 write/evaluator bypass negatives                          |
| Complete stable requirement IDs          | 2, 5, 8      | Verifier call-site and resolver-registry coverage; actual consumer declarations                            |
| Scope/digest/operation identity          | 3, 4         | Every scope-field mutation; unrelated trunk tip advancement; independent ULID and final write digest       |
| V2 exact validation and v1 compatibility | 3, 4         | Positive codec/readback; null expiry, extra keys, bad digest, nonempty constraints, unknown kind negatives |
| Ordinary/delivery coexistence            | 4, 10        | Store writes, isolated chain revisions, separate histories and deny constraints                            |
| Host-verified human authority            | 5            | Exact statement tied to proposal; non-Codex, assistant, Full-Auto, replayed source, drift refusal          |
| Single-use and uncertain writes          | 6, 9         | Two-host CAS contention, crash checkpoints, one POST, exact readback, no timeout takeover                  |
| Truthful waived intent/receipt           | 7, 8         | Explicit v3/v4, single ID, all pinned digests, visible waived rendering                                    |
| Original intent temporal authority       | 7, 9         | Superseded pending intent still proves original authorization precedes merge                               |
| Independent merge observations           | 8            | Provider/Git agreement, null metadata, unknown topology and disagreement guards                            |
| Complete effect-time verification        | 8, 9         | All non-waived predicates run; late drift/two-ID failure produces no burn or receipt                       |
| Close after burn/expiry                  | 7, 8, 10     | Canonical byte equality; no current-grant lookup; tampering/live-drift refusal                             |
| Reopened and false-delivery recovery     | 10           | Explicit v3/v4 support with exact correlation and mixed-pair refusal                                       |
| Read-only and operator disclosure        | 5, 10, 11    | Zero-effect spies; typed missing/indeterminate; installed help/guide parity                                |
| #1755/historical/external compatibility  | 1, 7, 9, 11  | Existing suites remain green, no attribution schema migration                                              |
| #1783 boundary                           | 3, 5, 10     | Cross-kind rejection now; shared exact-null scope contract; separate production consumer later             |

### #1783 Handoff

Issue #1783 consumes `buildDeliveryScope`, the partition contract, and common host-authority verification. It may reuse the low-level CAS transport and `(repository, issue, deliveryOperationId)` uniqueness rule, but not #1787's PR-specific intent-publication/consumption schema or `ensureWaiverIntent` state machine: those require a real original PR intent and merge commit. Its own implementation must add an explicit local-trunk journal event schema/validator and version-aware shared-history dispatch, its exact authority kind validator, accepted-head trunk reachability and Test/Review/human proof, and an `authorized-local-trunk` terminal record. Unknown journal schemas remain refusals until that consumer ships; do not fabricate PR fields or widen the current validator to arbitrary events. Its positive local-trunk-close fixture from the spec belongs to that issue's plan; #1787 delivers common authority primitives and cross-lane refusal tests, not a pretend production local-trunk close. This is the accepted Option B split, not a dropped requirement.

## Plan Review and Execution Gate

- [ ] Review this plan with Astra 6 as author and Opus 5 as reviewer before implementation. Review the remote journal choice, receipt-publication uncertainty behavior, v3/v4 exact fields, and #1783 handoff explicitly.
- [ ] If the accepted spec needs a behavioral change during plan review, record it and reopen the spec review; do not silently edit the accepted blob.
- [ ] Preserve #1787 provenance through sanctioned task binding and any agreed child-issue decomposition. This plan does not create issues, set estimates, or advance lifecycle state.
- [ ] After plan acceptance and required lifecycle approval, execute the verified tasks. Do not treat peer consensus on the spec as plan approval or approval to activate a real delivery waiver.

## Author Self-Review

The task map covers every spec section, including the post-review validator, category raising-site, historical dispatch, original-intent time, and recovery-version contracts. Proposed API names and the `issue`/`issueNumber` mapping are centralized above. The accepted spec and review evidence remain unchanged. Test snippets are implementation instructions, not claims of tests already run; all execution checkboxes are intentionally unchecked.
