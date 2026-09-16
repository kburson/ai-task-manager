# Nested-Epic Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add executable decomposition classification, Plan-exit enforcement,
visible waivers, and sanctioned plan-to-child issue generation for oversized
AITM work.

**Architecture:** A pure policy module owns plan signal extraction,
classification, linked-plan resolution, and waiver validation. A small
registered guard and read-only command consume that policy. A second pure module
turns numbered plan sections into deterministic child fragments, while a thin
verb validates every draft and delegates live creation only to
`npx aitm create-issue --shape sub-issue`.

**Tech Stack:** Node.js ESM, `node:test`, AITM guard registry, GitHub Project
field readers, AITM command catalog, sanctioned `create-issue` orchestration.

**Governing specification:**
`docs/superpowers/specs/2026-08-03-nested-epic-decomposition-design.md`

**Reference commit:** `67683dfa5808830e766077db2449f45140e80909`

## Global Constraints

- Never invoke `gh issue create`; confirmed children must pass through
  `npx aitm create-issue --shape sub-issue`.
- Never mutate a source issue during `decompose-check` or `split-plan --dry-run`.
- Fixed thresholds are review at 16 hours/3 tasks/2 verifier groups and must
  split at 24 hours/4 tasks or XL plus 2 verifier groups.
- A waiver is valid only as the six-field visible `## Decomposition Waiver`
  section defined by the specification.
- Resolve linked plan paths inside the repository root; reject traversal and
  unreadable paths.
- The source issue becomes the coordination epic through child linkage; do not
  retitle, relabel, close, or supersede it.
- Validate all generated drafts before the first live child creation.
- Stop on the first live child-creation failure and report partial success;
  never delete already-created issues.
- Keep every production file focused and under the repository line policy.
- Follow TDD: observe each targeted test fail before adding its implementation.

---

### Task 1: Pure Decomposition Policy

**Files:**

- Create: `scripts/task-tracker/lib/decomposition-policy.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/decomposition-policy.test.mjs`

**Interfaces:**

- Produces:
  - `extractPlanTasks(planText) -> PlanTask[]`
  - `classifyDecomposition({ size, estimateHours, planText }) -> DecompositionResult`
  - `linkedPlanPath(body) -> string | null`
  - `resolvePlanPath({ projectDir, body, overridePath }) -> { path, source }`
  - `parseDecompositionWaiver(body) -> WaiverResult`
- `PlanTask` is
  `{ number: number, kind: 'task'|'milestone', title: string, heading: string,
body: string, commands: string[] }`.
- `DecompositionResult` is
  `{ status, signals, taskCount, verificationGroupCount, tasks }`.
- Consumed by Tasks 2–4 without GitHub or filesystem side effects.

- [ ] **Step 1: Write failing classification and parser tests**

Add table-driven tests with the exact public behavior:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDecomposition,
  extractPlanTasks,
  linkedPlanPath,
  parseDecompositionWaiver,
  resolvePlanPath,
} from '../../../lib/decomposition-policy.mjs';

test('classifies fixed decomposition thresholds with must-split precedence', () => {
  const cases = [
    [{ size: 'M', estimateHours: 8, planText: taskPlan(2, 1) }, 'story-ok'],
    [{ size: 'XL', estimateHours: 12, planText: '' }, 'needs-decomposition-review'],
    [{ size: 'L', estimateHours: 16, planText: '' }, 'needs-decomposition-review'],
    [{ size: 'M', estimateHours: 8, planText: taskPlan(3, 1) }, 'needs-decomposition-review'],
    [{ size: 'XL', estimateHours: 12, planText: taskPlan(2, 2) }, 'must-split'],
    [{ size: 'L', estimateHours: 24, planText: '' }, 'must-split'],
    [{ size: 'M', estimateHours: 8, planText: taskPlan(4, 1) }, 'must-split'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(classifyDecomposition(input).status, expected);
  }
});

test('extracts only exact numbered H3 tasks and explicit verifier syntax', () => {
  const tasks = extractPlanTasks(`
## Task 9: ignored depth
### Task 1: Parser
Run: \`node --test parser.test.mjs\`
### Milestone 2: CLI
**Verification Commands:**
\`\`\`sh
node --test cli.test.mjs
\`\`\`
#### Task 3: ignored depth
`);
  assert.deepEqual(
    tasks.map(({ number, kind, title, commands }) => ({ number, kind, title, commands })),
    [
      { number: 1, kind: 'task', title: 'Parser', commands: ['node --test parser.test.mjs'] },
      { number: 2, kind: 'milestone', title: 'CLI', commands: ['node --test cli.test.mjs'] },
    ]
  );
});
```

Include focused cases for command deduplication, duplicate task numbers,
case-insensitive headings, missing inputs, linked metadata precedence, commit
suffix stripping, repository traversal refusal, and all waiver validity rules.

- [ ] **Step 2: Run the policy test and verify RED**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/decomposition-policy.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`scripts/task-tracker/lib/decomposition-policy.mjs`.

- [ ] **Step 3: Implement the pure policy module**

Implement fixed constants and explicit precedence:

```js
export const DECOMPOSITION_THRESHOLDS = Object.freeze({
  reviewEstimateHours: 16,
  splitEstimateHours: 24,
  reviewTaskCount: 3,
  splitTaskCount: 4,
  reviewVerificationGroups: 2,
  splitXlVerificationGroups: 2,
});

export function classifyDecomposition({ size = null, estimateHours = null, planText = '' } = {}) {
  const tasks = extractPlanTasks(planText);
  const verificationGroupCount = tasks.filter((task) => task.commands.length > 0).length;
  const signals = collectSignals({ size, estimateHours, tasks, verificationGroupCount });
  const mustSplit = signals.some((signal) => signal.level === 'must-split');
  const needsReview = signals.some((signal) => signal.level === 'review');
  return {
    status: mustSplit ? 'must-split' : needsReview ? 'needs-decomposition-review' : 'story-ok',
    signals,
    taskCount: tasks.length,
    verificationGroupCount,
    tasks,
  };
}
```

Use `metadataFieldValue` for Plan Metadata and `path.resolve` plus
`path.relative` to enforce repository containment. Parse waiver fields with the
shared `metadata-section.mjs` grammar where possible; reject duplicates before
building the normalized field object.

- [ ] **Step 4: Run the policy test and verify GREEN**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/decomposition-policy.test.mjs
```

Expected: PASS for threshold, task extraction, path, and waiver cases.

- [ ] **Step 5: Commit the policy**

```bash
git add scripts/task-tracker/lib/decomposition-policy.mjs \
  scripts/task-tracker/tests/unit/lib/decomposition-policy.test.mjs
git commit -m "[#1052] feat(decomposition): classify oversized plans"
TT_FULL_AUTO=1 npx aitm commit-trace 1052
```

---

### Task 2: Plan-Exit Guard and Read-Only Check Command

**Files:**

- Create: `scripts/task-tracker/lib/decomposition-plan-exit-guard.mjs`
- Create: `scripts/task-tracker/verbs/decompose-check.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/decomposition-plan-exit-gate.test.mjs`
- Modify: `scripts/task-tracker/states/plan.mjs`
- Modify: `scripts/task-tracker/verbs/promote.mjs`

**Interfaces:**

- Consumes Task 1's classifier, path resolver, and waiver parser.
- Produces:
  - `evaluateIssueDecomposition({ issueNumber, cfg, body, planOverride, deps })`
  - `decompositionPlanExitGuard` with id `plan-exit-decomposition`
  - `runDecomposeCheck({ issueNumber, cfg, planOverride, deps })`
  - `verbDecomposeCheck(ctx)`.
- The evaluator result is
  `{ classification, waiver, effectiveStatus, planDiagnostic }`.

- [ ] **Step 1: Write failing guard and command tests**

Exercise the guard without network access:

```js
test('plan exit refuses must-split without a valid visible waiver', async () => {
  const result = await decompositionPlanExitGuard.run({
    issueNumber: 1052,
    cfg: { repo: 'o/r', projectId: 'P' },
    body: bodyWithPlanMetadata('docs/plan.md'),
    deps: {
      decomposition: {
        projectValuesForIssue: async () => ({ size: 'XL', estimate: 12 }),
        readFile: () => taskPlan(2, 2),
        projectDir: '/repo',
      },
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /plan-exit-decomposition: must-split/);
});

test('plan exit admits must-split with a complete waiver and preserves warning', async () => {
  const result = await decompositionPlanExitGuard.run(waivedContext());
  assert.equal(result.ok, true);
  assert.match(result.warn, /waiver accepted/);
});
```

Also assert story-ok no-op, review warning, plan-load diagnostic behavior,
registration in `plan.exitGuards`, refusal translation to
`decomposition-refused`, human output, JSON output, and exit code 3.

- [ ] **Step 2: Run the guard test and verify RED**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/decomposition-plan-exit-gate.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for the new guard or command.

- [ ] **Step 3: Implement the evaluator, guard, and command**

Keep I/O behind the evaluator seam:

```js
export async function evaluateIssueDecomposition({
  issueNumber,
  cfg,
  body,
  planOverride = null,
  deps = {},
}) {
  const values = await (deps.projectValuesForIssue || projectValuesForIssue)({
    cfg,
    fieldDefs: (deps.loadProjectFieldDefs || loadProjectFieldDefs)(),
    issueNumber,
  });
  const resolved = resolvePlanPath({
    projectDir: deps.projectDir || getProjectDir(),
    body,
    overridePath: planOverride,
  });
  const planText = resolved.path ? (deps.readFile || readFileSync)(resolved.path, 'utf8') : '';
  const classification = classifyDecomposition({
    size: values.size ?? null,
    estimateHours: values.estimate ?? null,
    planText,
  });
  const waiver = parseDecompositionWaiver(body);
  return {
    classification,
    waiver,
    effectiveStatus:
      classification.status === 'must-split' && waiver.ok ? 'waived' : classification.status,
    planDiagnostic: resolved,
  };
}
```

Register `decompositionPlanExitGuard` before `planEpicChildrenGuard`. Add
`'plan-exit-decomposition': 'decomposition-refused'` to
`REFUSAL_ID_TO_STATUS`.

- [ ] **Step 4: Run targeted guard and existing registry tests**

Run:

```bash
node --test \
  scripts/task-tracker/tests/unit/lib/decomposition-plan-exit-gate.test.mjs \
  scripts/task-tracker/tests/unit/lib/guard-registry-plan-exit.test.mjs \
  scripts/task-tracker/tests/unit/lib/guard-parity-plan-develop.test.mjs
```

Expected: PASS with the new guard registered once and existing Plan guards
unchanged.

- [ ] **Step 5: Commit the guard and check command**

```bash
git add scripts/task-tracker/lib/decomposition-plan-exit-guard.mjs \
  scripts/task-tracker/verbs/decompose-check.mjs \
  scripts/task-tracker/tests/unit/lib/decomposition-plan-exit-gate.test.mjs \
  scripts/task-tracker/states/plan.mjs scripts/task-tracker/verbs/promote.mjs
git commit -m "[#1052] feat(workflow): enforce decomposition at Plan exit"
TT_FULL_AUTO=1 npx aitm commit-trace 1052
```

---

### Task 3: Pure Plan-to-Child Draft Builder

**Files:**

- Create: `scripts/task-tracker/lib/split-plan.mjs`
- Create: `scripts/task-tracker/tests/unit/verbs/split-plan.test.mjs`

**Interfaces:**

- Consumes Task 1's `extractPlanTasks`.
- Produces:
  - `validateSplitTasks(tasks) -> { ok, errors }`
  - `buildSplitProposals(input) -> SplitProposal[]`
  - `writeProposalFragments({ proposal, scratchDir, writeFile }) -> FragmentPaths`
- `SplitProposal` contains title, task identity, scope, AC, Story Origin, Plan
  Metadata, verification commands, and sanctioned creator arguments.

- [ ] **Step 1: Write failing proposal tests**

Pin exact provenance and evidence scoping:

```js
test('builds one deterministic child proposal per numbered task', () => {
  const proposals = buildSplitProposals({
    sourceIssue: 1052,
    outerParent: 1048,
    planPath: 'docs/superpowers/plans/example.md',
    planCommit: 'abc1234',
    governingSpec: 'docs/superpowers/specs/example-design.md',
    planText: `### Task 1: Classifier\nRun: \`node --test classifier.test.mjs\``,
  });
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].title, 'Classifier');
  assert.match(proposals[0].planMetadata, /\*\*Parent-epic\*\*: #1048/);
  assert.match(proposals[0].planMetadata, /\*\*Nested-epic\*\*: #1052/);
  assert.match(proposals[0].planMetadata, /\*\*Source-plan-commit\*\*: abc1234/);
  assert.match(proposals[0].acceptanceCriteria, /aitm-verified vc-list="vc:1"/);
});
```

Cover root sources, nested sources, command order/deduplication, task-bound
Scope, exact source-section labels, duplicate number refusal, empty titles, and
missing verifiers.

- [ ] **Step 2: Run the proposal test and verify RED**

Run:

```bash
node --test scripts/task-tracker/tests/unit/verbs/split-plan.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`scripts/task-tracker/lib/split-plan.mjs`.

- [ ] **Step 3: Implement validation and rendering**

Render a canonical one-AC child:

```js
function renderAcceptanceCriteria(task) {
  const refs = task.commands.map((_, index) => `vc:${index + 1}`).join(' ');
  return `- [ ] Deliver ${JSON.stringify(task.heading)} exactly as specified in the pinned source plan. <!-- aitm-verified vc-list="${refs}" -->`;
}

function renderPlanMetadata(input, task) {
  return [
    `- **Parent-epic**: #${input.outerParent ?? input.sourceIssue}`,
    `- **Nested-epic**: #${input.sourceIssue}`,
    `- **Governing-spec**: ${input.governingSpec}`,
    `- **Source-plan**: ${input.planPath}`,
    `- **Source-plan-commit**: ${input.planCommit}`,
    `- **Source-plan-section**: ${task.heading}`,
    '- **Generated-by**: `npx aitm split-plan`',
  ].join('\n');
}
```

Fragment writing must accept an injected `writeFile`, create one deterministic
subdirectory per task, and return paths for `scope.md`, `acs.md`,
`story-origin.md`, and `plan-meta.md`.

- [ ] **Step 4: Run the proposal tests and verify GREEN**

Run:

```bash
node --test scripts/task-tracker/tests/unit/verbs/split-plan.test.mjs
```

Expected: PASS for validation, fragments, evidence citations, and provenance.

- [ ] **Step 5: Commit the draft builder**

```bash
git add scripts/task-tracker/lib/split-plan.mjs \
  scripts/task-tracker/tests/unit/verbs/split-plan.test.mjs
git commit -m "[#1052] feat(planning): render split child proposals"
TT_FULL_AUTO=1 npx aitm commit-trace 1052
```

---

### Task 4: Split Orchestration and Command Surface

**Files:**

- Create: `scripts/task-tracker/verbs/split-plan.mjs`
- Modify: `scripts/task-tracker/tests/unit/verbs/split-plan.test.mjs`
- Modify: `scripts/task-tracker/task-tracker.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/routing.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/catalog.mjs`
- Modify: `scripts/task-tracker/verbs/help-data.mjs`
- Modify: command relationship/baseline files identified by targeted command
  surface tests.

**Interfaces:**

- Consumes Task 2's evaluator and Task 3's proposals/fragments.
- Produces:
  - `runSplitPlan({ issueNumber, mode, planOverride, cfg, deps })`
  - `verbSplitPlan(ctx)`
  - public `decompose-check` and `split-plan` routing/help contracts.

- [ ] **Step 1: Add failing dry-run and confirm orchestration tests**

Use injected creator calls:

```js
test('dry-run preflights every child and performs no live create', async () => {
  const calls = [];
  const result = await runSplitPlan(
    baseInput({
      mode: 'dry-run',
      deps: {
        ...offlineDeps(),
        runCreator: async (args) => {
          calls.push(args);
          return { exitCode: 0, stdout: 'rendered body' };
        },
      },
    })
  );
  assert.equal(result.status, 'dry-run');
  assert.ok(calls.every((args) => args.includes('--dry-run')));
  assert.ok(calls.every((args) => args.includes('--shape') && args.includes('sub-issue')));
});

test('confirm validates all drafts before the first live creation', async () => {
  const phases = [];
  await runSplitPlan(
    baseInput({
      mode: 'confirm',
      deps: creatorDeps(phases),
    })
  );
  assert.deepEqual(phases, ['dry:1', 'dry:2', 'live:1', 'live:2']);
});
```

Add a partial-success test where live child 2 exits 6; assert child 3 is never
attempted and the result retains child 1's parsed issue number.

- [ ] **Step 2: Run orchestration and command-surface tests to verify RED**

Run:

```bash
node --test \
  scripts/task-tracker/tests/unit/verbs/split-plan.test.mjs \
  scripts/task-tracker/tests/unit/core/command-manifest.test.mjs \
  scripts/task-tracker/tests/unit/lib/command-catalog-policy.test.mjs
```

Expected: split orchestration exports are missing and command manifest does not
yet know both verbs.

- [ ] **Step 3: Implement orchestration with the sanctioned creator boundary**

Construct creator argv exactly once:

```js
function creatorArgs({ proposal, fragments, sourceIssue, dryRun }) {
  return [
    'create-issue',
    '--title',
    proposal.title,
    '--shape',
    'sub-issue',
    '--scope-file',
    fragments.scope,
    '--ac-file',
    fragments.acceptanceCriteria,
    '--story-origin-file',
    fragments.storyOrigin,
    '--plan-metadata-file',
    fragments.planMetadata,
    '--parent',
    String(sourceIssue),
    ...(dryRun ? ['--dry-run'] : []),
  ];
}
```

The default runner must execute the current Node binary against the repository
orchestrator entrypoint, not spawn a shell and not invoke `gh`. Parse created
issue numbers only from `/issues/<N>` output. Return a structured partial result
instead of retrying.

- [ ] **Step 4: Wire dispatch, routing, catalog, and self-documenting help**

Add both verb routes and switch cases. Help contracts must include:

```js
'decompose-check': {
  summary: 'Classify whether a planned issue is atomic or requires decomposition.',
  usage: '/task decompose-check <issue> [--plan <path>] [--json]',
  related: ['split-plan', 'plan', 'promote'],
},
'split-plan': {
  summary: 'Draft or create sanctioned child issues from numbered plan sections.',
  usage: '/task split-plan <issue> (--dry-run|--confirm) [--plan <path>] [--json]',
  related: ['decompose-check', 'create-issue'],
},
```

Match the surrounding `help-data.mjs` schema exactly rather than introducing a
new help authority.

- [ ] **Step 5: Run targeted orchestration and command tests**

Run:

```bash
node --test \
  scripts/task-tracker/tests/unit/verbs/split-plan.test.mjs \
  scripts/task-tracker/tests/unit/lib/decomposition-plan-exit-gate.test.mjs \
  scripts/task-tracker/tests/unit/core/command-manifest.test.mjs \
  scripts/task-tracker/tests/unit/lib/command-catalog-policy.test.mjs \
  scripts/task-tracker/tests/unit/lib/command-catalog-parser-policy.test.mjs
npx aitm decompose-check help
npx aitm split-plan help
```

Expected: all tests pass and both help probes exit 0 without network access.

- [ ] **Step 6: Commit orchestration and command wiring**

```bash
git add scripts/task-tracker/verbs/split-plan.mjs \
  scripts/task-tracker/tests/unit/verbs/split-plan.test.mjs \
  scripts/task-tracker/task-tracker.mjs \
  scripts/task-tracker/lib/command-surface/routing.mjs \
  scripts/task-tracker/lib/command-surface/catalog.mjs \
  scripts/task-tracker/verbs/help-data.mjs
git commit -m "[#1052] feat(cli): split plans through sanctioned creation"
TT_FULL_AUTO=1 npx aitm commit-trace 1052
```

---

### Task 5: Documentation, Impact Mapping, and Governed Verification

**Files:**

- Modify: `docs/guides/sub-issue-nesting.md`
- Modify: `scripts/task-tracker/test-impact-manifest.json`
- Modify: repository baselines only when a focused verifier proves they are
  derived from the new files.

**Interfaces:**

- Documents the exact public contracts implemented by Tasks 1–4.
- Maps each new production path to one or more targeted tests so Develop and
  Test lane selection remains deterministic.

- [ ] **Step 1: Document classification, waiver, split, and recovery workflows**

Add runnable examples:

```markdown
## Executable decomposition review

Run `npx aitm decompose-check 1052` during Plan. `story-ok` proceeds normally,
`needs-decomposition-review` records a warning, and `must-split` blocks Develop
until children exist or a complete visible waiver is present.

Preview child bodies with `npx aitm split-plan 1052 --dry-run`. After inspecting
the complete proposal, create children with
`npx aitm split-plan 1052 --confirm`. Confirm delegates every child to
`npx aitm create-issue --shape sub-issue`; it never calls GitHub issue creation
directly.
```

Include the six-field waiver and partial-success inspection procedure verbatim
from the specification.

- [ ] **Step 2: Add production-to-test impact mappings**

Map:

- policy and check verb → `decomposition-policy.test.mjs`;
- guard and Plan state → `decomposition-plan-exit-gate.test.mjs`;
- split builder/verb → `split-plan.test.mjs`; and
- command-surface files → existing command catalog tests plus both new command
  tests.

- [ ] **Step 3: Run issue-specific verification**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/decomposition-policy.test.mjs
node --test scripts/task-tracker/tests/unit/lib/decomposition-plan-exit-gate.test.mjs
node --test scripts/task-tracker/tests/unit/verbs/split-plan.test.mjs
```

Expected: all targeted tests pass.

- [ ] **Step 4: Run repository quality gates**

Run in this order:

```bash
npm run lint
npm run format:check
npm test
npm run test:slow
git diff --check origin/trunk...HEAD
```

Expected: every command exits 0 and the diff has no whitespace errors.

- [ ] **Step 5: Commit documentation and impact metadata**

```bash
git add docs/guides/sub-issue-nesting.md \
  scripts/task-tracker/test-impact-manifest.json
git commit -m "[#1052] docs(decomposition): explain enforced plan splitting"
TT_FULL_AUTO=1 npx aitm commit-trace 1052
```

- [ ] **Step 6: Run the governed Develop-to-Test workflow**

```bash
TT_FULL_AUTO=1 npx aitm test 1052
```

Expected: the isolated sandbox passes every Verification Commands entry and
moves #1052 to Test.

- [ ] **Step 7: Complete active Agent Review, approval, integration, and close**

```bash
TT_FULL_AUTO=1 npx aitm review 1052
TT_FULL_AUTO=1 npx aitm approve 1052
```

Keep the timer active during code inspection even if the review command pauses
it. After review passes, verify exact origin/trunk ancestry, delta, merge tree,
and whitespace; integrate only the verified fast-forward. Then, under the
user's explicit drive-to-Done authority:

```bash
TT_FULL_AUTO=1 npx aitm close 1052
```

Expected: #1052 is closed and its project status is Done.
