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

1. An unmarked legitimate leaf is admissible, but malformed, misplaced, duplicate and unknown kind markers must refuse (Task 1).
2. Missing values are legitimate null only with complete current field definitions, correct type and exact item ownership; unrelated field variants must not create false missing evidence (Task 2).
3. A provider may apply a mutation and then lose its acknowledgement; recovery must read fresh state and not duplicate an applied effect (Task 2).
4. An offline fixture that returns fields not selected can invent a traffic win; selection-aware responses and independent request budgets must expose that defect (Task 1).
5. Older publication records have no new node IDs; target identity must be reacquired without rewriting subject, intent or ownership evidence (Task 2).

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
- Labels: bug

## Story Intent

- **Beneficiary:** An operator refining governed GitHub work.
- **Capability:** Obtain equivalent safe refinement with fewer redundant remote observations.
- **Need:** Unconditional child hydration and repeated broad effect reads consume request budget and delay work.
- **Value or failure prevented:** Faster refinement without bypassed authority, lost ownership or unsafe recovery.

## File and interface map

| File                                                                                         | Change and responsibility                                                                                |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `scripts/task-tracker/lib/decomposition-kind.mjs`                                            | Create strict classifier exported as classifyDecompositionKind(body), returning kind and reason strings. |
| `scripts/task-tracker/lib/decomposition-authority.mjs`                                       | Delegate existing private genuineKind semantics to the classifier; preserve collected reason behavior.   |
| `scripts/task-tracker/lib/decomposition-hook-authority.mjs`                                  | Separate presence, graph and final fence phases with bounded continuity checks.                          |
| `scripts/task-tracker/lib/decomposition-target-observation.mjs`                              | Create createFieldEffectReaders and identity, definition, value and body validation.                     |
| `scripts/task-tracker/lib/decomposition-field-writer.mjs`                                    | Bind new readers inside makeEffects; preserve adapters, mutations and writer protocol.                   |
| `scripts/tests/helpers/refinement-traffic-provider.mjs`                                      | Create query-aware stateful transport, ledger and independent budget assertion.                          |
| `scripts/tests/fixtures/refinement-traffic-cases.mjs`                                        | Create raw fixture populations and real-boundary invocation wiring.                                      |
| `scripts/tests/fixtures/refinement-traffic-runner.mjs`                                       | Create isolated source-root runner and Markdown evidence report.                                         |
| `scripts/tests/integration/task-tracker/lib/refinement-traffic-budget.integration.test.mjs`  | Create baseline, provider-fidelity and dispatch-budget tests.                                            |
| `scripts/tests/integration/task-tracker/lib/decomposition-hook-traffic.integration.test.mjs` | Create strict-kind, phased pagination, race and native-hook routing tests.                               |
| `scripts/tests/unit/task-tracker/lib/decomposition-target-observation.test.mjs`              | Create focused target identity, typed-null and bound tests.                                              |
| `scripts/tests/integration/task-tracker/lib/refinement-target-recovery.integration.test.mjs` | Create real writer recovery, old record and public route tests.                                          |
| `scripts/tests/integration/task-tracker/lib/decomposition-hook.cases.mjs`                    | Update existing hook snapshots to selected presence and phase shapes.                                    |
| `scripts/tests/helpers/native-decomposition-hook-fixture.mjs`                                | Update native fixture for actual phase selections.                                                       |
| `scripts/tests/fixtures/estimation-publication.mjs`                                          | Adapt fresh target transport in existing compatibility fixture.                                          |
| `scripts/tests/fixtures/publication-subprocess.fixture.mjs`                                  | Adapt persisted-state target transport and preserve old recovery modes.                                  |
| `docs/superpowers/reviews/2073/implementation/refinement-traffic-report.md`                  | Create implementation results, source and fixture hashes, exact request ledgers and limitations.         |

Production files estimate-writer-publication.mjs, decomposition-publication.mjs, decomposition-projection.mjs, and decomposition-assessment.mjs remain unchanged. Shared callers project-tether.mjs, update-event-fields.mjs, refine.mjs, apply-reevaluate.mjs and decomposition-migration-writer.mjs exercise the same new concrete writer; no caller bypass is introduced.

## Numeric limits and independent budgets

The target binding query is one dispatch. Each project-value read follows two connections (item fieldValues and project fields), first 100, at most three pages each. Fetch their first pages together; at most five dispatches complete both. Each body read is one dispatch. There is no cross-invocation reuse. Every continuation repeats and validates relevant node identity; project continuations include project ID, item continuations include issue and project identity.

Hook presence, child graph and final fence select children first 50 with a three-page cap (150 maximum). Root project memberships are first 50, selected item values first 100, comments first 100. Each of up to 150 children has memberships first 50, selected values first 100, labels first 100 and dependencies first 100, each capped at three pages. A conservative structural maximum is 1,217 requests: seven initial root requests, three graph requests, 1,200 child continuations, seven fence requests. The five-second remote deadline normally refuses long before that maximum; neither cap permits partial success. The fence excludes comments and nested child fields.

Fix these fixture ceilings before optimized source runs. They are conservative regression gates, not measured baseline values or promised percentage improvements:

| Fixture and boundary                   | Baseline dispatch ceiling | Optimized dispatch ceiling | Required comparison                                                                            |
| -------------------------------------- | ------------------------: | -------------------------: | ---------------------------------------------------------------------------------------------- |
| Empty leaf, hook                       |                         1 |                          1 | Same decision; optimized selection has no child fields.                                        |
| Two-child epic, hook                   |                         1 |                          3 | Same readiness; graph and final fence costs explicit.                                          |
| Leaf with two comment pages, hook      |                         2 |                          3 | Same authority; final fence required after multi-request collection.                           |
| Changed Estimate and Size, publication |                       512 |                        384 | Same completed semantic outcome and optimized dispatch count strictly below measured baseline. |
| Already matching values, publication   |                        16 |                         16 | Same unchanged outcome and zero writes.                                                        |

For the changed-publication fixture also impose per-family maxima: membership 96, projection 96, issue-body-read 160, body-write 32, project-field-write 8, repository-link 4, target-binding 1, target-project 80, target-body 40, field-options 4. Baseline target families are zero. Unknown family is an error; total ceiling independently applies even when family ceilings permit more. Count all CLI dispatches, including opaque non-GraphQL commands; report GraphQL requests separately and do not invent their hidden HTTP request counts. A new request at a saturated family and an unclassified request must each fail the oracle. If unmodified baseline exceeds a declared ceiling, stop and review the budget before any optimized measurement; do not manufacture a passing baseline.

## Implementation Tasks

### Task 1: Deliver conditional admission with retained baseline evidence (2.25h)

#### Story Intent

- **Beneficiary:** The operator admitting governed work and the reviewer evaluating its traffic.
- **Capability:** Admit leaves without nested child reads and reproduce equivalent outcomes against retained source.
- **Need:** Unconditional child hydration wastes traffic, and existing doubles cannot establish savings.
- **Value or failure prevented:** Reduce leaf traffic while preserving authority and truthful reproducible evidence.

**Files:** Create the provider helper, traffic-cases fixture, source-root runner and traffic-budget integration test named in the map. Create the implementation report with baseline evidence before production changes.

**Interfaces:** createTrafficProvider({ population, shapes, failureSchedule = [] }) returns { graphql, pexec, execFile, spawn, ledger, state, failureSchedule, close, assertNoEscapes }. Each transport implements the existing callback, promise or stream contract. makeTrafficFixture({ sourceRoot, fixtureId, projectDir }) returns { cfg, subject, provider, deps, invoke, snapshot, close }; invoke(boundary) accepts hook, publication, refine-entry-route or refine-completion-route. runSourceBoundary({ sourceRoot, fixtureId, boundary, reportPath }) runs a fresh Node subprocess and returns { outcome, ledger, sourceHash, fixtureHash, configurationHash }. assertTrafficBudget(ledger, budget) throws on unknown family or exceeded ceilings. semanticOutcome(snapshot) returns issue body, project values, publication phase, before values and subject; omit only timestamps from report metadata, preserving business body bytes and digests.

- [ ] **Step 1: Write provider-fidelity and budget failures.** Use node:test and node:assert/strict, import the provider and budget helper, and raw fixture populations. Each test gets a temporary directory, t.after cleanup and the repository story tag for #2073.

```js
const ledger = [{ family: 'target-binding', operation: 'TargetBinding' }];
assert.doesNotThrow(() =>
  assertTrafficBudget(ledger, {
    total: 1,
    families: { 'target-binding': 1 },
  })
);
assert.throws(
  () =>
    assertTrafficBudget([...ledger, ...ledger], {
      total: 1,
      families: { 'target-binding': 1 },
    }),
  new RegExp('budget')
);
assert.throws(
  () =>
    assertTrafficBudget([{ family: 'unclassified' }], {
      total: 9,
      families: { 'target-binding': 1 },
    }),
  new RegExp('unclassified')
);
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

- [ ] **Step 3: Wire real source-root boundaries.** Dynamically import production modules from sourceRoot with file URLs. Replace all three mutable ghClient ports before invoking collectors. Hook receives provider.graphql; versioned body writes receive existing deps.pexec. Inject only local readPlanAtCommit, binding, filesystem directory, clock and transport ports. Do not replace readIssue, readProject, readForecast, readBackIssue, runtime.collect, publishField, publishRefinementRevision or effects with success values. Install installStubGh from scripts/tests/fixtures/stub-gh.mjs first to provide a fail-closed PATH shim, then install all three provider ports. In this isolated subprocess only, unset TT_SKIP_NETWORK so real admission runs; its policy intentionally refuses that flag even with injected transport. The installed shim must record zero fallback calls; assertNoEscapes checks it before restore. Never run this environment against the real gh binary. Restore ports and isolate each source tree in its own subprocess.

Use baseline source below this repository so installed node_modules resolve locally. Raw populations include a legitimate issue with code kind in the progress section, configured project and field IDs, valid assignment and viewer, a valid body-field block, valid plan bytes and forecasts, and an epic with two ready children. Changed publication starts at Estimate 2 and Size S, targets 3 and M; unchanged starts at 3 and M. Reuse estimationIssueBody only as a raw body builder. Freeze Date to 2026-10-20T00:00:00.000Z in the isolated runner and choose deterministic operation and intent keys so body and digest equality are meaningful.

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

#### Admission implementation and proof

#### Admission purpose

- **Beneficiary:** The operator admitting a leaf or parent for planning.
- **Capability:** Avoid unnecessary child authority while retaining exact parent readiness.
- **Need:** Broad snapshots hydrate children indiscriminately and phased reads can observe drift.
- **Value or failure prevented:** Reduce leaf query shape without stale parent admission.

**Files:** Create decomposition-kind.mjs and decomposition-hook-traffic.integration.test.mjs; modify decomposition-authority.mjs, decomposition-hook-authority.mjs, decomposition-hook.cases.mjs and native-decomposition-hook-fixture.mjs.

**Interfaces:** classifyDecompositionKind(body) returns { kind, reasons } using existing genuineKind grammar and fence masking. Retain the hook collector public signature and return schema. New phase helpers remain private.

- [ ] **Step 1: Add failing classification and phase tests.** Copy authority malformed-marker, missing-marker and wrong-section cases into table-driven classifier checks. No marker yields code and no reasons; duplicate, unknown and misplaced markers retain existing reasons. Missing, truncated or contradictory child presence refuses; a non-epic with children refuses; an empty epic still uses parent readiness; complete empty leaves select no nested child fields.

```js
assert.deepEqual(classifyDecompositionKind('A legitimate unmarked issue.'), {
  kind: 'code',
  reasons: [],
});
assert.ok(classifyDecompositionKind('<!-- aitm-issue-kind kind="unknown" -->').reasons.length);
await fixture.invoke('hook');
assert.equal(fixture.provider.ledger.length, 1);
assert.equal(fixture.provider.ledger[0].selectedChildProjectFields, false);
```

The fixture is the Task 1 makeTrafficFixture result for empty-leaf. Assert its normalized admission outcome is successful as well as request shape.

- [ ] **Step 2: Run red, extract strict classification, and narrow the first query.** Move genuineKind without changing valid syntax or reason strings; delegate from full authority and hook. Keep root id, number, repository nameWithOwner and required authority plus shallow child IDs with pageInfo, omit nested child fields. A complete empty presence connection permits the non-epic leaf branch. A nonempty non-epic refuses immediately. An epic delegates full child-inventory completion to the graph phase; do not separately paginate its presence read. Epic graph phase repeats root id, repository nameWithOwner and body and complete child IDs alongside existing child evidence.

```js
const classification = classifyDecompositionKind(root.body);
reasons.push(...classification.reasons);
const needsGraph = classification.kind === 'epic';
const hasUnexpectedChildren = !needsGraph && childIds.length > 0;
```

Refuse using existing collector result construction if classification has reasons or hasUnexpectedChildren; do not continue with a default code kind after classification failure. Preserve all root and child pagination bounds.

- [ ] **Step 3: Add final fence and race tests.** Any multi-request collection rereads root identity, repository nameWithOwner and body, assignment and viewer, configured membership and relevant field/status evidence plus complete shallow child IDs. Compare sorted child identity sets, root body, selected item identity and relevant typed values. Refuse observed additions/removals, body/kind change, reassignment, item/membership change, relevant field change or incomplete fence. Validate each continuation root/child/item identity and duplicate nodes before merging. No retry loop. Document that child content and comments are not an atomic snapshot.

Use failureSchedule entries `{ afterDispatch: number, change: object }` to change body, item, child and assignment between phases. Test three complete pages, required fourth page, child reordering without content drift, missing nodes, deadline exhaustion and a late promise that cannot alter a returned refusal.

- [ ] **Step 4: Update both existing hook fixtures to answer selected phases; run green and commit** with message `perf: load refinement child authority conditionally`.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/decomposition-hook-traffic.integration.test.mjs scripts/tests/integration/task-tracker/lib/decomposition-reestimate-admission.test.mjs scripts/tests/integration/task-tracker/lib/decomposition-review-fixes.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-authority.test.mjs
```

### Task 2: Deliver fresh typed effect observations with recovery (2.25h)

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
  subject: fixture.subject,
  cfg: fixture.cfg,
  graphql: fixture.provider.graphql,
});
assert.deepEqual(await readers.readProjectValues(), { estimate: 2, size: 'S' });
fixture.provider.state.projectValues.estimate = 0;
assert.deepEqual(await readers.readProjectValues(), { estimate: 0, size: 'S' });
fixture.provider.state.projectValues.estimate = null;
assert.deepEqual(await readers.readProjectValues(), { estimate: null, size: 'S' });
fixture.provider.state.fieldDefinitions.delete(fieldIdFor(fixture.cfg, 'estimate'));
await assert.rejects(readers.readProjectValues(), new RegExp('definition'));
```

- [ ] **Step 2: Run red and implement binding plus bounded page collection.** Resolve repository owner/name and issue number to node ID; independently resolve subject.projectItemId to ProjectV2Item, project.id and Issue content id/number/repository. Both issue identities must agree with the four-key subject and cfg. Do not assume every caller's projectItemForIssue fixture returns issueId. Each project read queries the exact item and configured project's current fields, not all issues or all membership candidates.

```graphql
query TargetBinding($owner: String!, $repo: String!, $number: Int!, $item: ID!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      id
      number
      repository {
        nameWithOwner
      }
    }
  }
  node(id: $item) {
    __typename
    ... on ProjectV2Item {
      id
      project {
        id
      }
      content {
        __typename
        ... on Issue {
          id
          number
          repository {
            nameWithOwner
          }
        }
      }
    }
  }
}
```

Fetch first 100 field values and project fields together. Continue each incomplete connection at most twice and reject incomplete completion. Include type and field identity for every value union branch, including computed fields, following the existing hook's ProjectV2ItemFieldValueCommon plus computed-field fragments. Read number for NumberValue and optionId/name for SingleSelectValue. Definitions include id, dataType, and SingleSelect options id/name; validate configured Estimate NUMBER and Size SINGLE_SELECT IDs against complete current definitions. Reject duplicate target IDs and duplicate option IDs/names. Unrelated complete field values are ignored after their identity is accounted for; they must not appear as anonymous empty objects.

A target absent from complete values is null only when its valid definition exists. A present numeric target must be finite and nonnegative; preserve zero. A present Size must resolve to a current option ID and one of XS, S, M, L, XL. Type mismatch, malformed value, null provider node or GraphQL errors refuse. Verify item/content/project identity on every value page and project ID on every definition page. Use one monotonic deadline shared by both connections, pass remaining time to each request, bound serialized injected responses as well as CLI maxBuffer, and prevent late result installation.

- [ ] **Step 3: Implement strict body read and wire adapters.** Read exact bound Issue id, number, repository and body. Inventory current and legacy field block markers before parseIssueFieldDb: exactly one recognized, syntactically complete block is required; missing, duplicate, mixed legacy/current and malformed blocks refuse. In a valid block, missing estimate or size keys preserve legacy null compatibility. A present key must satisfy the same scalar rules; invalid values do not silently become null. Keep existing apply body mutation and before/final authority checks.

```js
const readers = await createFieldEffectReaders({ subject, cfg, graphql: deps.targetGraphql });
const readEstimate = async () =>
  observedEstimateEffect((await readers.readProjectValues()).estimate);
const readSize = async () => observedEstimateEffect((await readers.readProjectValues()).size);
const readFields = async () => observedEstimateEffect(await readers.readBodyFields());
```

Build these callbacks within the existing async effects factory in publishFieldEstimateRevision. Keep extraEffects first, stable effect IDs/resources/targetIdentity, unchanged writeField and applyBody signatures and unchanged shortcut behavior. Never add issueId to subject or persist reader metadata. No shared project result between readEstimate and readSize; each is fresh after writes and during recovery.

- [ ] **Step 4: Run green, including five-dispatch worst-case project read, one-dispatch body read and one binding dispatch; commit** with message `perf: narrow concrete refinement effect reads`.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/decomposition-target-observation.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-projection.test.mjs scripts/tests/unit/task-tracker/gh/lib/project-tether.test.mjs
```

#### Recovery and actual public routing

#### Recovery purpose

- **Beneficiary:** The operator recovering interrupted refinement.
- **Capability:** Continue safely after uncertain writes through every actual caller.
- **Need:** Narrow observations affect shared publication and legacy records.
- **Value or failure prevented:** Avoid duplicate mutations, stale effects and a benchmark of an unused helper.

**Files:** Create refinement-target-recovery.integration.test.mjs; extend the raw traffic cases and provider from Task 1. Keep production caller and state-machine files unchanged.

**Interfaces:** Add fixture failureSchedule entries { family, occurrence, mode } where mode is fail-before-apply or apply-then-throw. Add fixtureId legacy-pending and changed-refine-route. invoke('publication') calls actual publishFieldEstimateRevision with actual writeField and versioned body writer transport. invoke('refine-entry-route') calls actual runRefine and stops with a known injected promotion sentinel only after completed publication; this is route evidence, not a successful whole-command performance result. invoke('refine-completion-route') exercises the normal public completion path through stateful provider responses.

- [ ] **Step 1: Add red recovery assertions.** An applied Estimate with a lost acknowledgement must be observed freshly and never applied twice; a failure before apply must be retried exactly once. Keep concurrent third-party changes and owner replacement cases, requiring refusal before further effects. Assertions inspect state plus mutation ledger, not only returned statuses.

```js
fixture.provider.failureSchedule.push({
  family: 'project-field-write',
  occurrence: 1,
  mode: 'apply-then-throw',
});
await fixture.invoke('publication');
await fixture.invoke('publication');
const estimateWrites = fixture.provider.ledger.filter(
  (entry) => entry.family === 'project-field-write' && entry.field === 'estimate'
);
assert.equal(estimateWrites.length, 1);
assert.equal(fixture.snapshot().publication.status, 'complete');
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

### Task 3: Deliver integrated traffic and safety proof (2h)

#### Story Intent

- **Beneficiary:** The owner deciding whether the optimization is ready.
- **Capability:** Review reproducible counts alongside safety and scope evidence.
- **Need:** Component assertions alone cannot establish equivalent successful integrated behavior.
- **Value or failure prevented:** Prevent declaring savings from early refusal, missing effects or unclassified traffic.

**Files:** Complete refinement-traffic-budget.integration.test.mjs and the implementation report; no new production changes are expected.

- [ ] **Step 1: Add the paired-source regression.** Run the named valid success fixtures against retained baseline and optimized source with identical driver, population, clock and configuration. Check successful outcomes before evaluating savings; already-matching values cannot stand in for changed publication. Run adverse fixtures separately and assert their specified refusal, not success equality.

```js
assert.equal(baseline.outcome.result.status, 'recorded');
assert.equal(optimized.outcome.result.status, 'recorded');
assert.deepEqual(
  semanticOutcome(optimized.outcome.snapshot),
  semanticOutcome(baseline.outcome.snapshot)
);
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

| Design requirement                                                             | Owning proof                                         |
| ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Strict leaf versus parent classification and bounded child completeness        | Task 1 classifier and hook tests.                    |
| Root continuity and parent readiness with preserved deadlines                  | Task 1 phase, fence, pagination and drift tests.     |
| Concrete identity, typed null, definition completeness and strict body parsing | Task 2 target tests.                                 |
| No checkpoint weakening, no durable metadata drift                             | Task 2 shared-writer and old-record cases.           |
| Applied/unknown mutations and post-write freshness                             | Task 2 exact mutation-count recovery tests.          |
| Real entrypoint activation and accurately named measurement boundary           | Tasks 1 and 2 actual hook/refine routes.             |
| Immutable local baseline, selected-response fidelity and independent ceilings  | Tasks 1 and 3 paired runs and negative oracle tests. |
| Honest scope and estimate                                                      | Owner decision, original inventory and final report. |

The 6.5h allocation is a forecast for this full scope, not a deadline that authorizes shortcuts. The harness and adverse recovery cases are the greatest risk; a 6–9h outcome remains plausible. Stop and report if required query shapes, public routes or compatibility defects push scope beyond this forecast. No approval of this plan is implicit in a clean single-agent review, and no implementation is authorized by this plan-writing task.

## Concrete execution contracts

These contracts complete the interfaces used by the three deliverables. The 2.25h admission allocation includes the reusable baseline foundation and phase tests; the 2.25h observation allocation includes recovery and compatibility migration; the 2h integrated-proof allocation includes full provider-shape coverage, paired runs and required review. This redistributes the original work packages without reducing their 6.5h total or risk range. Task boundaries follow independently rejectable behavior, not a native task-count threshold. Native classification remains authoritative.

### Fixture and runner contracts

- makeTrafficFixture receives sourceRoot as an absolute path, a listed fixtureId, and a fresh projectDir under projectScratchDir('test'). It owns raw state `{ issueBody, projectValues, fieldDefinitions, publication }`; fieldDefinitions is a Map keyed by field ID. snapshot() derives publication and before-record data from actual issue body with readDecompositionRecords and readEstimateBeforeRecord, never a fabricated success object.
- invoke('hook') calls evaluateHookDecomposition from decomposition-activity.mjs with activity checkpoint, no deps.decomposition override, real cfg, issue, projectDir, empty targets and provider.graphql plus local readPlanAtCommit. It returns native decision allow or block. Assert decision is allow in successful fixtures.
- runSourceBoundary returns outcome `{ result, snapshot }`; result is the unmodified native return object, snapshot is derived persistent state. Publication success is result.status recorded and snapshot.publication.status complete. Already matching returns unchanged. semanticOutcome consumes snapshot and retains subject, operation IDs, effect targets and every before/intended/permitted digest. Exclude only explicit report keys startedAt, finishedAt, elapsedMs and projectDir. Business timestamps remain pinned and compared.
- failureSchedule accepts either phase changes `{ afterDispatch, change }` or failures `{ family, occurrence, mode }`. change is a shallow raw-state patch applied after dispatch completion; nested projectValues and issue resources are replaced explicitly. Reject invalid schedules. Every ledger entry records index, family, operation shape hash, phase, target, mutation outcome, serialized response bytes and cost with null meaning unknown. Checkpoint numbers are derived from observed authority/effect ordering, never invented to excuse requests.
- Give callback execFile the same promisify.custom behavior as scripts/tests/fixtures/stub-gh.mjs: its promise resolves `{ stdout, stderr }`, not a bare stdout string. Spawn supports stdout and stderr streams, stdin.end(input), error and close(code). pexec body writes preserve options.input and stream compatibility required by versioned-issue-write.mjs.
- All measured production collectors and writers execute. Compatibility fixtures may retain existing collector stubs but are named separately in reports. In-process ports and a refusing first-in-PATH gh shim prevent fallback networking; assertNoEscapes inspects shim calls and rejects fallback. For native hook subprocess smoke use the query-aware fixture gh executable with identical selected-response logic and durable dispatch ledger, not fixed oversized responses.

Hook and observation tests import assert from node:assert/strict, test from node:test, path from node:path, and projectScratchDir from the source scratch-dir.mjs. Use mkdtempSync plus t.after cleanup under projectScratchDir('test'). Resolve sourceRoot as path.resolve('.') and instantiate fixture in every test. Import classifyDecompositionKind from its new production file, fieldIdFor from project-fields.mjs, and makeTrafficFixture from traffic-cases. The source-root runner resolves production imports from supplied sourceRoot and never imports optimized production modules into baseline execution.

### Target query and parser contracts

The helper graphql signature is async ({ query, variables = {}, timeout, maxResponseBytes }) returning the standard envelope `{ data, errors? }`. Binding, value and body reads use this shape. Its default wrapper uses late-bound pexec from gh-client.mjs, serializes query and variables as CLI arguments, sets timeout and maxBuffer, parses stdout, and returns the envelope. It does not confuse github-projects.gql's unwrapped data with an envelope. The optional new writer test seam is deps.targetGraphql, passed as graphql. Existing deps.graphql retains its prior meaning.

```js
const fieldIds = {
  estimate: fieldIdFor(cfg, 'estimate'),
  size: fieldIdFor(cfg, 'size'),
};
if (!fieldIds.estimate || !fieldIds.size || fieldIds.estimate === fieldIds.size) {
  throw new Error('target-definition-config');
}
const readers = await createFieldEffectReaders({
  subject,
  cfg,
  graphql: deps.targetGraphql,
});
```

A present target must have Object.hasOwn(value, 'number') or Object.hasOwn(value, 'optionId') as applicable. For NumberValue, explicit number null means unset; otherwise require typeof number to be number, finite and nonnegative. For SingleSelectValue, explicit optionId null denotes unset only if selected name is also null; require both selected properties. Non-null optionId must resolve uniquely in current options and name must exactly agree with the option enum name. Missing properties refuse. Missing target entry in a complete values connection remains null only after its current definition is proved. Body values use explicit null or absent keys in a valid block; strings, arrays and invalid enum values refuse.

Keep the strict body parser private in decomposition-target-observation.mjs. Scan case-insensitive block-like opening and closing candidates containing aitm-fields or legacy ai-task-manager field start/end names, including unterminated HTML comments, before calling the permissive parser. Accept exactly one syntactically valid current comment range or one ordered complete legacy range; all candidates must belong to it. JSON must be a non-array object, with values absent (legacy flat object) or a non-array object; reject explicit values null or non-object. Legacy content must contain one json fence and parse one object with the same envelope rules. Reject duplicate delimiters, dangling start/end, duplicate valid blocks, mixed forms and malformed block-like text beside a valid block. Require parseIssueFieldDb ok with start/end equal to the sole accepted range before reading scalars. Preserve the general parser. Tests include valid block plus dangling current prefix, orphan legacy end, malformed JSON, values:null, missing keys, explicit null and zero.

### Additional exact files and routing proof

Modify `scripts/tests/fixtures/estimation-publication.mjs` and `scripts/tests/fixtures/publication-subprocess.fixture.mjs` to supply deps.targetGraphql with fresh responses derived from their existing getBody/getProject or persisted state, exact item identity and valid definitions. Preserve their full-authority stubs for compatibility; they are not measured traffic. Add a target-only helper in the new provider helper so these fixtures share query semantics without importing real-boundary fixture policy. Existing configured field aliases are resolved through fieldIdFor; do not invent cfg.fields. The helper signature is `createTargetFixtureGraphql({ cfg, issueNumber, itemId, getBody, getProject })`, returning `{ graphql, calls }`; compatibility fixtures pass graphql as targetGraphql.

In Task 1's hook integration test, invoke actual activity-guard.mjs and source-edit-gate.mjs subprocess entrypoints using runNativeHookFixture and complete local binding, config and lock fixtures. Exercise leaf allow and drift refusal with selected provider responses. Add a real decompositionPlanExitGuard.run({ issueNumber, cfg, projectDir, body, toState: 'develop', deps: { graphql, readPlanAtCommit } }) call without a runtime-success override; it reaches the same collector through evaluateIssueDecomposition. Assert native allow/refusal and retain readiness and ownership behavior. These are routing proofs, not real lifecycle transitions.

```sh
node --test scripts/tests/integration/task-tracker/lib/decomposition-hook-traffic.integration.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs scripts/tests/integration/task-tracker/lib/artifact-write-policy.test.mjs scripts/tests/integration/task-tracker/lib/source-edit-gate-workflow-policy.test.mjs
```

### Remaining independent ceilings

Classify each dispatch by exact reviewed shape into exactly one family. Hook families are hook-root, hook-root-continuation, hook-graph, hook-child-continuation and hook-fence. Empty leaf allows only root=1 (total1); two-child epic baseline root=1 (total1), optimized root=1, graph=1, fence=1 (total3); two-page-comments leaf baseline root=1, root-continuation=1 (total2), optimized adds fence=1 (total3). Unlisted families are forbidden. Full bounded hook pagination allows root=1, root-continuation=6, graph=3, child-continuation=1200, fence=7 (total1217). This assumes initial epic presence is not separately completed. Drift, malformed input and deadline fixtures use this fixed cap with no business mutations; assert earlier exact phase counts where failure points are known.

Target-only tests allow target-binding=1, target-project=5, target-body=1 (total7) per binding plus one read of each kind. Repeated freshness tests declare integer read counts in their table rows before execution: binding1 plus five per project read plus one per body read. Never derive a cap from emitted requests. Timeout cases use their normal fixed cap and accept no late observation.

Unchanged publication uses membership=4, projection=4, issue-body-read=8 (total16), with writes and target families zero. Two-invocation recovery allows twice changed-publication family maxima, target-binding=2, baseline total1024 and optimized total768. Single-invocation failures use ordinary changed-publication caps and prove no unauthorized effects. Public-route smoke has total2048 and caps membership384, projection384, issue-body-read640, body-write128, project-field-write32, repository-link16, target-binding4, target-project320, target-body160, field-options16, route-read128, route-write64; extra route shapes require exact classification before execution. These generous smoke caps are not savings claims. A cap mismatch blocks the claim and requires retained review before rerun; do not silently fit numbers to optimized output.

For every budget object, construct a synthetic ledger at each family cap and prove one extra fails that family limit; separately saturate total with allowed entries and prove one extra fails total. Use a test-specific total above the family count only when isolating the family assertion, preserving the real budget separately. Unknown and ambiguous shapes fail before counting. Retain fixed fixture budget content hash before both comparison runs. Failed attempts count too.

### Phase baseline and fixture identity

Explicit code bodies contain `<!-- aitm-issue-kind kind="code" -->` under `## AITM Progress Markers`. Include a separate fixture empty-unmarked-leaf with no kind marker; creation shape solo is not an authority kind. Both must allow and omit nested child fields.

Compare every graph response's root ID, number, repository and body with the initial root before using its children. The completed graph inventory, not the partial initial presence list, is the authoritative comparison baseline for the final fence. For an empty non-epic leaf the initial complete empty connection is its baseline. Add a 51-child ready epic: initial presence hasNextPage is true, graph requires two pages and final fence two pages, yielding optimized total5 (root1, graph2, fence2), baseline total2 (root1, root-continuation1). Children fit their own first pages. All other families are zero in this fixture. Replacing one child with a new ID between graph and fence must refuse even when counts match. Graph root body changes before children are merged also refuse. These tests pin the previously implicit comparison baseline.

### Complete test examples

These are concrete tests to add to the named new files after their helpers exist; imports refer to planned files in the file map. The initial run before helper creation fails on the missing module. Task 1's hook test then fails on the old nested selection; Task 2's observation test initially fails on missing helper or stale/null behavior; Task 3's paired regression fails until successful optimized dispatches are strictly lower. Add the repository story-tag comment for #2073 to each test file.

Task 1, decomposition-hook-traffic.integration.test.mjs:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { makeTrafficFixture } from '../../../fixtures/refinement-traffic-cases.mjs';

test('unmarked leaf allows without nested child fields', async (t) => {
  const projectDir = mkdtempSync(path.join(projectScratchDir('test'), 'traffic-leaf-'));
  t.after(() => rmSync(projectDir, { recursive: true, force: true }));

  const fixture = await makeTrafficFixture({
    sourceRoot: path.resolve('.'),
    fixtureId: 'empty-unmarked-leaf',
    projectDir,
  });
  t.after(async () => {
    await fixture.close();
    rmSync(projectDir, { recursive: true, force: true });
  });
  const result = await fixture.invoke('hook');
  assert.equal(result.decision, 'allow');
  assert.equal(fixture.provider.ledger.length, 1);
  assert.equal(fixture.provider.ledger[0].selectedChildProjectFields, false);
  fixture.provider.assertNoEscapes();
});
```

Task 2, decomposition-target-observation.test.mjs:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { createFieldEffectReaders } from '../../../../task-tracker/lib/decomposition-target-observation.mjs';
import { fieldIdFor } from '../../../../task-tracker/project-fields.mjs';
import { makeTrafficFixture } from '../../../fixtures/refinement-traffic-cases.mjs';

test('zero is fresh and a removed definition refuses', async (t) => {
  const projectDir = mkdtempSync(path.join(projectScratchDir('test'), 'traffic-target-'));
  t.after(() => rmSync(projectDir, { recursive: true, force: true }));

  const fixture = await makeTrafficFixture({
    sourceRoot: path.resolve('.'),
    fixtureId: 'changed-publication',
    projectDir,
  });
  t.after(async () => {
    await fixture.close();
    rmSync(projectDir, { recursive: true, force: true });
  });
  const readers = await createFieldEffectReaders({
    subject: fixture.subject,
    cfg: fixture.cfg,
    graphql: fixture.provider.graphql,
  });
  assert.deepEqual(await readers.readProjectValues(), { estimate: 2, size: 'S' });
  fixture.provider.state.projectValues.estimate = 0;
  assert.deepEqual(await readers.readProjectValues(), { estimate: 0, size: 'S' });
  fixture.provider.state.fieldDefinitions.delete(fieldIdFor(fixture.cfg, 'estimate'));
  await assert.rejects(readers.readProjectValues(), new RegExp('definition'));
  fixture.provider.assertNoEscapes();
});
```

Task 3, refinement-traffic-budget.integration.test.mjs:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { runSourceBoundary } from '../../../fixtures/refinement-traffic-runner.mjs';
import { semanticOutcome, trafficBudgets } from '../../../fixtures/refinement-traffic-cases.mjs';
import { assertTrafficBudget } from '../../../helpers/refinement-traffic-provider.mjs';

test('changed publication saves dispatches with identical durable outcome', async () => {
  const baseline = await runSourceBoundary({
    sourceRoot: path.resolve('.scratch/2073-baseline'),
    fixtureId: 'changed-publication',
    boundary: 'publication',
    reportPath: path.resolve('.scratch/2073-paired-baseline.md'),
  });
  const optimized = await runSourceBoundary({
    sourceRoot: path.resolve('.'),
    fixtureId: 'changed-publication',
    boundary: 'publication',
    reportPath: path.resolve('.scratch/2073-paired-optimized.md'),
  });
  assert.equal(baseline.outcome.result.status, 'recorded');
  assert.equal(optimized.outcome.result.status, 'recorded');
  assert.equal(baseline.outcome.snapshot.publication.status, 'complete');
  assert.equal(optimized.outcome.snapshot.publication.status, 'complete');
  assert.deepEqual(
    semanticOutcome(optimized.outcome.snapshot),
    semanticOutcome(baseline.outcome.snapshot)
  );
  assertTrafficBudget(baseline.ledger, trafficBudgets.changedPublication.baseline);
  assertTrafficBudget(optimized.ledger, trafficBudgets.changedPublication.optimized);
  assert.ok(optimized.ledger.length < baseline.ledger.length);
});
```

Export semanticOutcome and trafficBudgets from traffic-cases; trafficBudgets.changedPublication is `{ baseline: { total: 512, families }, optimized: { total: 384, families } }` with the independent family values already specified above, baseline target-family limits zero. Export runSourceBoundary from the runner with CLI execution protected by the usual import.meta.url versus process.argv[1] check. No source-root run may load new target modules when running old source; the baseline boundary only imports modules present in the retained commit. Missing baseline source blocks this paired test with a clear preparation error, rather than skipping it or constructing counts from optimized output.

### Isolation and outcome rules

makeTrafficFixture must set and restore a unique fixture session ID and AI_TASK_MANAGER_PROJECT_DIR/runtime root before production imports or calls. Its ordinary in-process publication deps include projectDir and decomposition.findMainWorktreePath returning that same projectDir, as the existing estimation-publication fixture does. This is a filesystem-location seam, not an authority verdict. Fixture config, lock files, plans and provider state live there. Snapshot the caller's session environment and restore it in close even after failure. Assert every created lock/state path is inside the fixture root. Register cleanup before any operation that can throw.

Native activity/source-hook subprocess smoke must use createBindingFixture from scripts/tests/helpers/binding-generation-fixture.mjs or mkdtempProjectIsolated from scratch-dir.mjs, with a genuine isolated fixture repository and fixture binding generation. Do not let a Git root walk from a plain scratch directory resolve to the user's repository. These fixtures construct local authority inputs; production policy still evaluates them. The source archive supplies executable code only and is never a task-state or lock root. No fixture may reuse the active human session ID, change the real binding, or acquire locks in the real main worktree. assertNoEscapes covers transport fallback; fixture.close additionally verifies filesystem/session isolation.

Valid comparison populations are empty-leaf, empty-unmarked-leaf, two-child-ready-epic, two-page-comments-leaf, 51-child-ready-epic, changed-publication and unchanged-publication. Successful paired equality and strict savings apply to their named boundaries as declared above; strict request reduction is required only for changed-publication. Safety populations (invalid kind, structural inconsistency, incomplete identity/pages/definitions, malformed field blocks, ownership replacement and concurrent drift) retain baseline observations for comparison but assert the optimized refusal and absence of unauthorized effects. Record intentional stricter outcomes instead of coercing them into successful equality. Recovery tests assert native partial/refused/recorded statuses, final complete state and exact application counts for their failure schedule.

The test-only limits argument may lower but never raise the hard page, deadline and response ceilings; reject invalid or larger values. Publication comparison and native route proof remain offline. After implementation verification, any separately authorized live observation is limited to one bounded instrumented invocation using existing usage capture. If a safe comparable transition or quota is unavailable, report live savings unverified; a single live observation is not an A/B comparison without a comparable baseline.

makeTrafficFixture restores any changed environment, Date and transport ports before rejecting if construction fails. The complete test examples register directory cleanup immediately after creation; normal fixture.close restores its own resources before directory deletion. runSourceBoundary always cleans its temporary fixture state and restores runtime globals before subprocess exit, while preserving the requested Markdown report.
