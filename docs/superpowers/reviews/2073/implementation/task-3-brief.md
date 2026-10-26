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
