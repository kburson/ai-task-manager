# Refinement GraphQL Traffic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task after implementation authorization. Steps use checkbox syntax for tracking.

**Goal:** Reduce redundant refinement traffic while preserving admission, publication ownership, recovery and fail-closed behavior.

**Architecture:** Load child authority only after strict kind and complete child-presence classification, with a bounded final root continuity fence. Replace only concrete field-effect observations with fresh, typed, identity-bound readers; retain complete authority checkpoints. Prove traffic at real production boundaries with a stateful offline transport and a separately retained pre-change source baseline.

**Tech Stack:** Existing Node ESM, node:test, GitHub CLI transport adapters, GraphQL usage classifier; no new runtime dependencies.

**Spec:** [Accepted design](../specs/2026-10-20-2073-refinement-graphql-traffic-design.md), SHA256 `04682ad4c797d328b4675d866af6908e061b256cb15ad82fe523fb9363cc7d68`, plus [owner budget decision](../reviews/2073/plan/SAR/owner-budget-decision.md).

## Global Constraints

- Scope remains #2073 in full. Planning only is currently authorized; no product implementation is performed by writing or reviewing this document.
- Preserve complete authorization, ownership, intent, before-record and final authority observations. No changes to durable subject keys, digest schemas, publication state machine or recovery protocol.
- Choose fresh reads on every adapter invocation. No observation sharing, checkpoint cache, invalidation API or modifications to executeEstimateWriter are required.
- Hook limits remain three pages per connection, five seconds remote, six seconds total and 4 MiB per response. A partial connection, malformed identity, stale phase, timeout or unavailable observation refuses admission.
- Each narrow logical read has a 30-second aggregate deadline, three pages per connection and 4 MiB per response. Late results cannot update an observation after refusal.
- Additional issue and item node IDs are invocation-local metadata; the sealed four-key subject and old records remain compatible.
- Use only retained local source for traffic comparison. Unknown shapes and attempted real networking fail the offline test. Unknown point costs and opaque HTTP expansion remain explicitly unknown.
- The owner replaced the provisional four-hour target and five-hour ceiling with a 6.5-hour budget and acknowledged a 6–9-hour risk range. Neither budget nor performance is proven by this plan.

## Review Focus

1. An unmarked legitimate leaf is admissible, but malformed, misplaced, duplicate and unknown kind markers must refuse (Task 2).
2. Missing values are legitimate null only with complete current field definitions, correct type and exact item ownership; unrelated field variants must not create false missing evidence (Task 3).
3. A provider may apply a mutation and then lose its acknowledgement; recovery must read fresh state and not duplicate an applied effect (Task 4).
4. An offline fixture that returns fields not selected can invent a traffic win; selection-aware responses and independent request budgets must expose that defect (Task 1).
5. Older publication records have no new node IDs; target identity must be reacquired without rewriting subject, intent or ownership evidence (Tasks 3 and 4).

## Scope

Optimize conditional child loading in native admission and concrete Estimate, Size and body effect reads. Measure successful changed publication and leaf admission, bound the extra parent fence cost, and retain public route and recovery proof. Excludes saga redesign, shared caches, provider telemetry changes, #2039 implementation and broad query cleanup.

## Context

The local inventory found usable injection seams in all three ghClient ports, hook deps.graphql, versioned issue write deps.pexec, and local plan-content reading. No baseline remote transport overlay is presently necessary. Existing success-port fixtures prove behavior but cannot prove traffic. Parent verified retained local source commit `52ff0fe734cf682c604695ab0c7b005f512c2844`; the reviewer has not run Git. See [original estimate](../reviews/2073/plan/SAR/local-inventory-estimate.md).

## Acceptance Criteria

- [ ] Valid empty leaves avoid nested child project fields; strict classification and every existing refusal remain effective.
- [ ] Epic children, pagination, readiness and observed root drift are checked within unchanged hook deadlines.
- [ ] Fresh concrete reads prove identity, field definitions, typed values and null completeness without replacing full checkpoints.
- [ ] Changed and unchanged outcomes, unknown writes, old records and every shared caller remain compatible.
- [ ] Immutable baseline and optimized runs use identical fixture populations and transport semantics, equal successful business outcomes, independently fixed ceilings, and strictly fewer dispatches for changed publication.
- [ ] Actual native hook and refine routing are demonstrated separately from the accurately named publication measurement boundary.
- [ ] Required tests, formatting and repository audits pass during implementation; retained reports distinguish execution results from this planning forecast.

## Plan Metadata

- Priority: P0
- Size: M
- Estimate: 6.5 hours; forecast risk range 6–9 hours
- Labels: performance

## Story Intent

- **Beneficiary:** An operator refining governed GitHub work.
- **Capability:** Obtain equivalent safe refinement with fewer redundant remote observations.
- **Need:** Unconditional child hydration and repeated broad effect reads consume request budget and delay work.
- **Value or failure prevented:** Faster refinement without bypassed authority, lost ownership or unsafe recovery.

## File and interface map

| File | Change and responsibility |
| --- | --- |
| `scripts/task-tracker/lib/decomposition-kind.mjs` | Create strict classifier exported as classifyDecompositionKind(body), returning kind and reason strings. |
| `scripts/task-tracker/lib/decomposition-authority.mjs` | Delegate existing private genuineKind semantics to the classifier; preserve collected reason behavior. |
| `scripts/task-tracker/lib/decomposition-hook-authority.mjs` | Separate presence, graph and final fence phases with bounded continuity checks. |
| `scripts/task-tracker/lib/decomposition-target-observation.mjs` | Create createFieldEffectReaders and identity, definition, value and body validation. |
| `scripts/task-tracker/lib/decomposition-field-writer.mjs` | Bind new readers inside makeEffects; preserve adapters, mutations and writer protocol. |
| `scripts/tests/helpers/refinement-traffic-provider.mjs` | Create query-aware stateful transport, ledger and independent budget assertion. |
| `scripts/tests/fixtures/refinement-traffic-cases.mjs` | Create raw fixture populations and real-boundary invocation wiring. |
| `scripts/tests/fixtures/refinement-traffic-runner.mjs` | Create isolated source-root runner and Markdown evidence report. |
| `scripts/tests/integration/task-tracker/lib/refinement-traffic-budget.integration.test.mjs` | Create baseline, provider-fidelity and dispatch-budget tests. |
| `scripts/tests/integration/task-tracker/lib/decomposition-hook-traffic.integration.test.mjs` | Create strict-kind, phased pagination, race and native-hook routing tests. |
| `scripts/tests/unit/task-tracker/lib/decomposition-target-observation.test.mjs` | Create focused target identity, typed-null and bound tests. |
| `scripts/tests/integration/task-tracker/lib/refinement-target-recovery.integration.test.mjs` | Create real writer recovery, old record and public route tests. |
| `scripts/tests/integration/task-tracker/lib/decomposition-hook.cases.mjs` | Update existing hook snapshots to selected presence and phase shapes. |
| `scripts/tests/helpers/native-decomposition-hook-fixture.mjs` | Update native fixture for actual phase selections. |
| `docs/superpowers/reviews/2073/implementation/refinement-traffic-report.md` | Create implementation results, source and fixture hashes, exact request ledgers and limitations. |

Production files estimate-writer-publication.mjs, decomposition-publication.mjs, decomposition-projection.mjs, and decomposition-publication-schema.mjs remain unchanged. Shared callers project-tether.mjs, update-event-fields.mjs, refine.mjs, apply-reevaluate.mjs and decomposition-migration-writer.mjs exercise the same new concrete writer; no caller bypass is introduced.

## Numeric limits and independent budgets

The target binding query is one dispatch. Each project-value read follows two connections (item fieldValues and project fields), first 100, at most three pages each. Fetch their first pages together; at most five dispatches complete both. Each body read is one dispatch. There is no cross-invocation reuse. Every continuation repeats and validates relevant node identity; project continuations include project ID, item continuations include issue and project identity.

Hook presence, child graph and final fence select children first 50 with a three-page cap (150 maximum). Root project memberships are first 50, selected item values first 100, comments first 100. Each of up to 150 children has memberships first 50, selected values first 100, labels first 100 and dependencies first 100, each capped at three pages. A conservative structural maximum is 1,217 requests: seven initial root requests, three graph requests, 1,200 child continuations, seven fence requests. The five-second remote deadline normally refuses long before that maximum; neither cap permits partial success. The fence excludes comments and nested child fields.

Fix these fixture ceilings before optimized source runs. They are conservative regression gates, not measured baseline values or promised percentage improvements:

| Fixture and boundary | Baseline dispatch ceiling | Optimized dispatch ceiling | Required comparison |
| --- | ---: | ---: | --- |
| Empty leaf, hook | 1 | 1 | Same decision; optimized selection has no child fields. |
| Two-child epic, hook | 1 | 3 | Same readiness; graph and final fence costs explicit. |
| Leaf with two comment pages, hook | 2 | 3 | Same authority; final fence required after multi-request collection. |
| Changed Estimate and Size, publication | 512 | 384 | Same completed semantic outcome and optimized dispatch count strictly below measured baseline. |
| Already matching values, publication | 16 | 16 | Same unchanged outcome and zero writes. |

For the changed-publication fixture also impose per-family maxima: membership 96, projection 96, issue-body-read 160, body-write 32, project-field-write 8, repository-link 4, target-binding 1, target-project 80, target-body 40, field-options 4. Baseline target families are zero. Unknown family is an error; total ceiling independently applies even when family ceilings permit more. Count all CLI dispatches, including opaque non-GraphQL commands; report GraphQL requests separately and do not invent their hidden HTTP request counts. A new request at a saturated family and an unclassified request must each fail the oracle. If unmodified baseline exceeds a declared ceiling, stop and review the budget before any optimized measurement; do not manufacture a passing baseline.

## Implementation Tasks

### Task 1: Establish retained-source traffic evidence (1.75h)

#### Story Intent

- **Beneficiary:** The reviewer evaluating the performance claim.
- **Capability:** Reproduce successful operations against old and new source offline.
- **Need:** Existing doubles replace collectors and return oversized responses.
- **Value or failure prevented:** Prevent fabricated savings caused by skipped work.

**Files:** Create the provider helper, traffic-cases fixture, source-root runner and traffic-budget integration test named in the map. Create the implementation report with baseline evidence before production changes.

**Interfaces:** createTrafficProvider({ population, shapes, failureSchedule = [] }) returns { graphql, pexec, execFile, spawn, ledger, state, failureSchedule, close, assertNoEscapes }. Each transport implements the existing callback, promise or stream contract. makeTrafficFixture({ sourceRoot, fixtureId, projectDir }) returns { cfg, subject, provider, deps, invoke, snapshot, close }; invoke(boundary) accepts hook, publication, refine-entry-route or refine-completion-route. runSourceBoundary({ sourceRoot, fixtureId, boundary, reportPath }) runs a fresh Node subprocess and returns { outcome, ledger, sourceHash, fixtureHash, configurationHash }. assertTrafficBudget(ledger, budget) throws on unknown family or exceeded ceilings. semanticOutcome(snapshot) returns issue body, project values, publication phase, before values and subject; omit only timestamps from report metadata, preserving business body bytes and digests.

- [ ] **Step 1: Write provider-fidelity and budget failures.** Use node:test and node:assert/strict, import the provider and budget helper, and raw fixture populations. Each test gets a temporary directory, t.after cleanup and the repository story tag for #2073.

```js
const ledger = [{ family: 'target-binding', operation: 'TargetBinding' }];
assert.doesNotThrow(() => assertTrafficBudget(ledger, {
  total: 1, families: { 'target-binding': 1 }
}));
assert.throws(() => assertTrafficBudget([...ledger, ...ledger], {
  total: 1, families: { 'target-binding': 1 }
}), new RegExp('budget'));
assert.throws(() => assertTrafficBudget([{ family: 'unclassified' }], {
  total: 9, families: { 'target-binding': 1 }
}), new RegExp('unclassified'));
```

Test body-only selection lacks projectItems and subIssues; graph selection returns only selected child fields. Unknown fingerprints, commands, node IDs and cursors throw. A project-field mutation changes later selected reads; a lost-ack mutation changes state then rejects. Exercise pexec, callback execFile and spawned stdin GraphQL including errors and close events.

- [ ] **Step 2: Run red, then implement the provider.** Use identifyGraphqlOperation and prepareGraphqlQuery from graphql-usage/identity.mjs consistently with current transport. Maintain reviewed normalized query fingerprints and response builders per baseline and optimized shape. Builders read one shared population and emit only selected fields; unknown fingerprints fail. Pagination is cursor-driven with complete pageInfo. Apply actual mutation variables to values, body versions and publication comments.

```js
export function assertTrafficBudget(ledger, budget) {
  const counts = new Map();
  for (const entry of ledger) {
    if (!Object.hasOwn(budget.families, entry.family)) {
      throw new Error(`unclassified request: ${entry.family}`);
    }
    counts.set(entry.family, (counts.get(entry.family) ?? 0) + 1);
  }
  if (ledger.length > budget.total) throw new Error('total budget exceeded');
  for (const [family, count] of counts) {
    if (count > budget.families[family]) throw new Error(`${family} budget exceeded`);
  }
}
```

- [ ] **Step 3: Wire real source-root boundaries.** Dynamically import production modules from sourceRoot with file URLs. Replace all three mutable ghClient ports before invoking collectors. Hook receives provider.graphql; versioned body writes receive existing deps.pexec. Inject only local readPlanAtCommit, binding, filesystem directory, clock and transport ports. Do not replace readIssue, readProject, readForecast, readBackIssue, runtime.collect, publishField, publishRefinementRevision or effects with success values. Keep TT_SKIP_NETWORK=1 and fail unknown transport; direct subprocess gh must fail rather than escape. Restore ports and isolate each source tree in its own subprocess.

Use baseline source below this repository so installed node_modules resolve locally. Raw populations include a legitimate marked solo issue, configured project and field IDs, valid assignment and viewer, a valid body-field block, valid plan bytes and forecasts, and an epic with two ready children. Changed publication starts at Estimate 2 and Size S, targets 3 and M; unchanged starts at 3 and M. Reuse estimationIssueBody only as a raw body builder. Freeze Date to 2026-10-20T00:00:00.000Z in the isolated runner and choose deterministic operation and intent keys so body and digest equality are meaningful.

- [ ] **Step 4: Retain and run baseline before production edits.** These are future implementation commands, not current execution authorization:

```sh
mkdir -p .scratch/2073-baseline
git archive 52ff0fe734cf682c604695ab0c7b005f512c2844 | tar -x -C .scratch/2073-baseline
node scripts/tests/fixtures/refinement-traffic-runner.mjs --source-root .scratch/2073-baseline --fixture changed-publication --boundary publication --report .scratch/2073-baseline-run1.md
node scripts/tests/fixtures/refinement-traffic-runner.mjs --source-root .scratch/2073-baseline --fixture changed-publication --boundary publication --report .scratch/2073-baseline-run2.md
```

Use the same external driver for both roots. Retain its content hash, source commit, archive manifest hashes, fixture and configuration hashes, full ledgers and semantic outcomes in Markdown. Two baseline runs must have equal counts, classifications, mutations and successful outcomes. Record no overlay for known seams. Any newly needed transport-only overlay requires its exact retained patch, hash and review before comparison; no business logic or query changes may enter baseline.

- [ ] **Step 5: Run provider and baseline tests green and commit this independently passing measurement deliverable** with message `test: retain offline refinement traffic baseline`. Add optimized expectations only with their owning changes; do not commit deliberately failing tests.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/refinement-traffic-budget.integration.test.mjs
```

### Task 2: Make admission conditional and continuity-checked (1.5h)

#### Story Intent

- **Beneficiary:** The operator admitting a leaf or parent for planning.
- **Capability:** Avoid unnecessary child authority while retaining exact parent readiness.
- **Need:** Broad snapshots hydrate children indiscriminately and phased reads can observe drift.
- **Value or failure prevented:** Reduce leaf query shape without stale parent admission.

**Files:** Create decomposition-kind.mjs and decomposition-hook-traffic.integration.test.mjs; modify decomposition-authority.mjs, decomposition-hook-authority.mjs, decomposition-hook.cases.mjs and native-decomposition-hook-fixture.mjs.

**Interfaces:** classifyDecompositionKind(body) returns { kind, reasons } using existing genuineKind grammar and fence masking. Retain the hook collector public signature and return schema. New phase helpers remain private.

- [ ] **Step 1: Add failing classification and phase tests.** Copy authority malformed-marker, missing-marker and wrong-section cases into table-driven classifier checks. No marker yields code and no reasons; duplicate, unknown and misplaced markers retain existing reasons. Missing, truncated or contradictory child presence refuses; a non-epic with children refuses; an empty epic still uses parent readiness; complete empty leaves select no nested child fields.

```js
assert.deepEqual(classifyDecompositionKind('A legitimate unmarked issue.'), {
  kind: 'code', reasons: []
});
assert.ok(classifyDecompositionKind('<!-- aitm:issue-kind=unknown -->').reasons.length);
await fixture.invoke('hook');
assert.equal(fixture.provider.ledger.length, 1);
assert.equal(fixture.provider.ledger[0].selectedChildProjectFields, false);
```

The fixture is the Task 1 makeTrafficFixture result for empty-leaf. Assert its normalized admission outcome is successful as well as request shape.

- [ ] **Step 2: Run red, extract strict classification, and narrow the first query.** Move genuineKind without changing valid syntax or reason strings; delegate from full authority and hook. Keep required root authority and complete shallow child IDs with pageInfo, omit nested child fields. Resolve complete presence before deciding leaf. Epic graph phase repeats root id and body and complete child IDs alongside existing child evidence.

```js
const classification = classifyDecompositionKind(root.body);
reasons.push(...classification.reasons);
const needsGraph = classification.kind === 'epic';
const hasUnexpectedChildren = !needsGraph && childIds.length > 0;
```

Refuse using existing collector result construction if classification has reasons or hasUnexpectedChildren; do not continue with a default code kind after classification failure. Preserve all root and child pagination bounds.

- [ ] **Step 3: Add final fence and race tests.** Any multi-request collection rereads root identity/body, assignment/viewer, configured membership and relevant field/status evidence plus complete shallow child IDs. Compare sorted child identity sets, root body, selected item identity and relevant typed values. Refuse observed additions/removals, body/kind change, reassignment, item/membership change, relevant field change or incomplete fence. Validate each continuation root/child/item identity and duplicate nodes before merging. No retry loop. Document that child content and comments are not an atomic snapshot.

Use failureSchedule entries `{ afterDispatch: number, change: object }` to change body, item, child and assignment between phases. Test three complete pages, required fourth page, child reordering without content drift, missing nodes, deadline exhaustion and a late promise that cannot alter a returned refusal.

- [ ] **Step 4: Update both existing hook fixtures to answer selected phases; run green and commit** with message `perf: load refinement child authority conditionally`.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/decomposition-hook-traffic.integration.test.mjs scripts/tests/integration/task-tracker/lib/decomposition-reestimate-admission.test.mjs scripts/tests/integration/task-tracker/lib/decomposition-review-fixes.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-authority.test.mjs
```

### Task 3: Add fresh typed concrete effect observations (1.5h)

#### Story Intent

- **Beneficiary:** The operator publishing governed Estimate and Size changes.
- **Capability:** Observe exact concrete targets without recollecting unrelated authority.
- **Need:** Every effect read currently repeats a full broad authority collection.
- **Value or failure prevented:** Reduce redundant dispatches without treating missing evidence as null.

**Files:** Create decomposition-target-observation.mjs and decomposition-target-observation.test.mjs; modify decomposition-field-writer.mjs only at effect construction and read callbacks.

**Interfaces:** async createFieldEffectReaders({ subject, cfg, graphql, now, limits }) returns { readProjectValues, readBodyFields }; each method returns a fresh Promise of { estimate: number|null, size: string|null }. Default graphql uses the existing transport with explicit timeout and response bound. now is monotonic; limits default to { maxPages: 3, timeoutMs: 30000, maxResponseBytes: 4194304 }. Errors throw and are converted by the existing writer into unavailable observations. Binding happens once per effects construction, and every actual read rechecks identity against that binding.

- [ ] **Step 1: Add focused failing observations.** The test fixture exposes provider.state and provider.failureSchedule for raw state changes. Acquire binding from repository issue plus item content, then assert finite zero, absent Estimate, absent Size and complete valid definitions yield exact typed values. Test removed definition, changed type, duplicate definition or value, unknown Size option, wrong project, swapped issue content, deleted item, missing issue, truncated page, repeated cursor, fourth page, malformed number and body block ambiguity as refusals.

```js
const readers = await createFieldEffectReaders({
  subject: fixture.subject, cfg: fixture.cfg, graphql: fixture.provider.graphql
});
assert.deepEqual(await readers.readProjectValues(), { estimate: 2, size: 'S' });
fixture.provider.state.projectValues.estimate = 0;
assert.deepEqual(await readers.readProjectValues(), { estimate: 0, size: 'S' });
fixture.provider.state.projectValues.estimate = null;
assert.deepEqual(await readers.readProjectValues(), { estimate: null, size: 'S' });
fixture.provider.state.fieldDefinitions.delete(fixture.cfg.fields.estimate);
await assert.rejects(readers.readProjectValues(), new RegExp('definition'));
```

- [ ] **Step 2: Run red and implement binding plus bounded page collection.** Resolve repository owner/name and issue number to node ID; independently resolve subject.projectItemId to ProjectV2Item, project.id and Issue content id/number/repository. Both issue identities must agree with the four-key subject and cfg. Do not assume every caller's projectItemForIssue fixture returns issueId. Each project read queries the exact item and configured project's current fields, not all issues or all membership candidates.

```graphql
query TargetBinding($owner: String!, $repo: String!, $number: Int!, $item: ID!) {
  repository(owner: $owner, name: $repo) { issue(number: $number) { id number repository { nameWithOwner } } }
  node(id: $item) { __typename ... on ProjectV2Item { id project { id } content { __typename ... on Issue { id number repository { nameWithOwner } } } } }
}
```

Fetch first 100 field values and project fields together. Continue each incomplete connection at most twice and reject incomplete completion. Include type and field identity for every value union branch, including computed fields, following the existing hook's ProjectV2ItemFieldValueCommon plus computed-field fragments. Read number for NumberValue and optionId/name for SingleSelectValue. Definitions include id, dataType, and SingleSelect options id/name; validate configured Estimate NUMBER and Size SINGLE_SELECT IDs against complete current definitions. Reject duplicate target IDs and duplicate option IDs/names. Unrelated complete field values are ignored after their identity is accounted for; they must not appear as anonymous empty objects.

A target absent from complete values is null only when its valid definition exists. A present numeric target must be finite and nonnegative; preserve zero. A present Size must resolve to a current option ID and one of XS, S, M, L, XL. Type mismatch, malformed value, null provider node or GraphQL errors refuse. Verify item/content/project identity on every value page and project ID on every definition page. Use one monotonic deadline shared by both connections, pass remaining time to each request, bound serialized injected responses as well as CLI maxBuffer, and prevent late result installation.

- [ ] **Step 3: Implement strict body read and wire adapters.** Read exact bound Issue id, number, repository and body. Inventory current and legacy field block markers before parseIssueFieldDb: exactly one recognized, syntactically complete block is required; missing, duplicate, mixed legacy/current and malformed blocks refuse. In a valid block, missing estimate or size keys preserve legacy null compatibility. A present key must satisfy the same scalar rules; invalid values do not silently become null. Keep existing apply body mutation and before/final authority checks.

```js
const readers = await createFieldEffectReaders({ subject, cfg, graphql: deps.graphql });
const readEstimate = async () =>
  observedEstimateEffect((await readers.readProjectValues()).estimate);
const readSize = async () =>
  observedEstimateEffect((await readers.readProjectValues()).size);
const readFields = async () =>
  observedEstimateEffect(await readers.readBodyFields());
```

Build these callbacks within the existing async effects factory in publishFieldEstimateRevision. Keep extraEffects first, stable effect IDs/resources/targetIdentity, unchanged writeField and applyBody signatures and unchanged shortcut behavior. Never add issueId to subject or persist reader metadata. No shared project result between readEstimate and readSize; each is fresh after writes and during recovery.

- [ ] **Step 4: Run green, including five-dispatch worst-case project read, one-dispatch body read and one binding dispatch; commit** with message `perf: narrow concrete refinement effect reads`.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/decomposition-target-observation.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-projection.test.mjs scripts/tests/unit/task-tracker/gh/lib/project-tether.test.mjs
```

### Task 4: Prove recovery and actual public routing (1h)

#### Story Intent

- **Beneficiary:** The operator recovering interrupted refinement.
- **Capability:** Continue safely after uncertain writes through every actual caller.
- **Need:** Narrow observations affect shared publication and legacy records.
- **Value or failure prevented:** Avoid duplicate mutations, stale effects and a benchmark of an unused helper.

**Files:** Create refinement-target-recovery.integration.test.mjs; extend the raw traffic cases and provider from Task 1. Keep production caller and state-machine files unchanged.

**Interfaces:** Add fixture failureSchedule entries { family, occurrence, mode } where mode is fail-before-apply or apply-then-throw. Add fixtureId legacy-pending and changed-refine-route. invoke('publication') calls actual publishFieldEstimateRevision with actual writeField and versioned body writer transport. invoke('refine-entry-route') calls actual runRefine and stops with a known injected promotion sentinel only after completed publication; this is route evidence, not a successful whole-command performance result. invoke('refine-completion-route') exercises the normal public completion path through stateful provider responses.

- [ ] **Step 1: Add red recovery assertions.** An applied Estimate with a lost acknowledgement must be observed freshly and never applied twice; a failure before apply must be retried exactly once. Keep concurrent third-party changes and owner replacement cases, requiring refusal before further effects. Assertions inspect state plus mutation ledger, not only returned statuses.

```js
fixture.provider.failureSchedule.push({
  family: 'project-field-write', occurrence: 1, mode: 'apply-then-throw'
});
await fixture.invoke('publication');
await fixture.invoke('publication');
const estimateWrites = fixture.provider.ledger.filter(
  (entry) => entry.family === 'project-field-write' && entry.field === 'estimate'
);
assert.equal(estimateWrites.length, 1);
assert.equal(fixture.snapshot().publication.status, 'completed');
assert.equal(fixture.snapshot().projectValues.estimate, 3);
```

Adapt the expected first invocation result to the existing protocol's observed completion/refusal; do not weaken the exact final mutation count. Add a pending record created from baseline source with the original four-key subject and no new IDs, then recover with optimized source. Assert old intent, predecessor proof and subject digest remain unchanged while binding is reacquired.

- [ ] **Step 2: Exercise all shared callers.** Use actual project-tether publication and update-event-fields publication, runRefine, apply-reevaluate and decomposition-migration-writer migrate/bind. Preserve ordinary caller-specific authority requirements and real effect callbacks. The existing project-tether-publication.cases.mjs cases are compatibility regressions, not traffic evidence. Assert context owner checks, beforeEffects, beforeEffect, before-record and final complete collectors are still called through production behavior.

The public refine route fixture must reach the actual concrete writer and show its TargetBinding and target read operations after entry. For the bounded entry-route proof, inject a sentinel at the already injectable verbPromote port, let real cleanup/rollback behavior execute, and report the boundary accurately. A separate successful publication-boundary run supplies the savings proof. Do not claim a whole runRefine command success or traffic improvement from the sentinel case. The completion route must use real promotion logic and provider state if claimed successful.

- [ ] **Step 3: Resolve only reader/fixture compatibility defects exposed by tests, run green, and commit** with message `test: preserve refinement publication recovery and routing`.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/refinement-target-recovery.integration.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-governed-recovery.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-review-fixes.test.mjs scripts/tests/unit/task-tracker/lib/plan-publication-recovery.test.mjs scripts/tests/unit/task-tracker/gh/lib/project-tether.test.mjs
```

### Task 5: Close integrated traffic and safety evidence (0.75h)

#### Story Intent

- **Beneficiary:** The owner deciding whether the optimization is ready.
- **Capability:** Review reproducible counts alongside safety and scope evidence.
- **Need:** Component assertions alone cannot establish equivalent successful integrated behavior.
- **Value or failure prevented:** Prevent declaring savings from early refusal, missing effects or unclassified traffic.

**Files:** Complete refinement-traffic-budget.integration.test.mjs and the implementation report; no new production changes are expected.

- [ ] **Step 1: Add the paired-source regression.** Run every fixed fixture against retained baseline and optimized source with identical driver, population, clock and configuration. Check successful outcomes before evaluating budgets; already-matching values cannot stand in for changed publication.

```js
assert.equal(baseline.outcome.status, 'completed');
assert.equal(optimized.outcome.status, 'completed');
assert.deepEqual(semanticOutcome(optimized.outcome), semanticOutcome(baseline.outcome));
assertTrafficBudget(baseline.ledger, budgets.baseline);
assertTrafficBudget(optimized.ledger, budgets.optimized);
assert.ok(optimized.ledger.length < baseline.ledger.length);
```

These variables are the runSourceBoundary results and fixed changed-publication budgets defined in Task 1. Run leaf and epic shape/count tests separately; same request count can be a valid leaf shape win, while the parent graph/fence increase must remain within its declared cap. Append an extra request to a saturated budget and an unknown operation to prove both gates reject.

- [ ] **Step 2: Run focused and repository-required checks.** Execute the commands below. If failure reveals necessary work outside this plan, report it before expanding scope; do not remove authority checks to hit budget. Record each exit status and command in the report. Do not treat this planning document as evidence those commands already passed.

```sh
node --test scripts/tests/integration/task-tracker/lib/refinement-traffic-budget.integration.test.mjs scripts/tests/integration/task-tracker/lib/decomposition-hook-traffic.integration.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-target-observation.test.mjs scripts/tests/integration/task-tracker/lib/refinement-target-recovery.integration.test.mjs
npm run lint:test-layout
npm run lint:story-tags
npm run lint:line-cap
npm run quality
```

- [ ] **Step 3: Retain the final report and review.** Include source hashes, driver/population/configuration hashes, exact rerun commands, every dispatch family and total, baseline/optimized outcome equality, refusal matrix, old-record recovery, public-route boundary and numeric limits. Report GraphQL point cost as observed or unknown and opaque CLI HTTP expansion as unknown. List the unchanged complete checkpoint protocol, remaining non-atomic race limit and budget forecast versus actual implementation time if known. Commit through the governed workflow with message `docs: record refinement traffic and safety evidence` only after review and checks.

## Requirement trace and stop conditions

| Design requirement | Owning proof |
| --- | --- |
| Strict leaf versus parent classification and bounded child completeness | Task 2 classifier and hook tests. |
| Root continuity and parent readiness with preserved deadlines | Task 2 phase, fence, pagination and drift tests. |
| Concrete identity, typed null, definition completeness and strict body parsing | Task 3 target tests. |
| No checkpoint weakening, no durable metadata drift | Tasks 3 and 4 shared-writer and old-record cases. |
| Applied/unknown mutations and post-write freshness | Task 4 exact mutation-count recovery tests. |
| Real entrypoint activation and accurately named measurement boundary | Tasks 2 and 4 actual hook/refine routes. |
| Immutable local baseline, selected-response fidelity and independent ceilings | Tasks 1 and 5 paired runs and negative oracle tests. |
| Honest scope and estimate | Owner decision, original inventory and final report. |

The 6.5h allocation is a forecast for this full scope, not a deadline that authorizes shortcuts. The harness and adverse recovery cases are the greatest risk; a 6–9h outcome remains plausible. Stop and report if required query shapes, public routes or compatibility defects push scope beyond this forecast. No approval of this plan is implicit in a clean single-agent review, and no implementation is authorized by this plan-writing task.
