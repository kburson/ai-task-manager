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
