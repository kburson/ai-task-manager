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
