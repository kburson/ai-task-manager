# Decomposed Epic WBS Plan-Exit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admit a `must-split` epic from Plan to Develop once its accepted plan's WBS is faithfully instantiated as immediate linked children.

**Architecture:** Add a focused reconciliation module that parses each child's source-plan claim and compares one-to-one WBS coverage, titles, and pinned plan bytes. The existing decomposition guard orchestrates issue-kind detection, paginated child retrieval, and `git show`; the existing epic-children guard remains solely responsible for child lifecycle readiness.

**Tech Stack:** Node.js ES modules, Node test runner, GitHub GraphQL through the existing `gh` adapter, and Git CLI through injected `execFile` boundaries.

## Global Constraints

- Preserve `decompose-check`'s underlying `must-split` classification and exit behavior.
- Accept complete WBS structure, not a `split-plan --confirm` execution marker.
- Require one immediate child per accepted-plan task using source path, full source section, normalized title, and byte-equivalent pinned plan content.
- Compare plan file content rather than requiring commit SHA equality.
- Ignore unrelated children, but block children that claim the accepted plan with an unknown section or claim an expected section with contradictory provenance.
- Preserve the complete Decomposition Waiver path.
- Leave child Ready-for-Planning admission to `plan-exit-epic-children-r4p-or-beyond`; do not require child deep dives before the parent enters Develop.
- Fail closed with issue-numbered diagnostics when GitHub, metadata, or pinned Git content is unreadable.
- Do not modify the accepted #1268 specification or implementation plan, and do not include #1272.
- Do not push, merge, rebase, force-update, or open a pull request.
- Use strict TDD: observe each newly added test fail before adding its production implementation.

---

### Task 1: Add pure WBS coverage reconciliation

**Files:**

- Create: `scripts/task-tracker/lib/decomposition-wbs-coverage.mjs`
- Modify: `scripts/gh/lib/wave-admission.mjs:215-252`
- Modify: `scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/epic-r4p-orchestration.test.mjs:406-440`

**Interfaces:**

- Consumes: `visibleMetadataFieldValue(body, 'Plan Metadata', key)` and an injected async `readPlanAtCommit({ planCommit, planPath })`.
- Produces: `parseWbsChildClaim(child)` and `reconcileWbsCoverage({ tasks, acceptedPlanPath, acceptedPlanText, children, readPlanAtCommit })`.
- Returns: `{ ok, expectedCount, coveredCount, matched, missingTasks, duplicateClaims, provenanceMismatches, unknownSections, blockers }`.
- Extends: `fetchAllSubIssueNodes` GraphQL selection with `title`; pagination and snapshot verification remain unchanged.

- [ ] **Step 1: Write failing claim and reconciliation tests**

Add this import and focused fixtures to
`scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs`:
Change its existing first line to `// @story #1052 #1279`.

```js
import {
  parseWbsChildClaim,
  reconcileWbsCoverage,
} from '../../../../task-tracker/lib/decomposition-wbs-coverage.mjs';
import { classifyDecomposition } from '../../../../task-tracker/lib/decomposition-policy.mjs';

const SOURCE_PLAN = 'docs/plan.md';

function wbsChild({
  number,
  task,
  sourcePlan = SOURCE_PLAN,
  sourcePlanCommit = 'child-plan-commit',
  sourcePlanSection = task.heading,
  title = task.title,
} = {}) {
  return {
    number,
    title,
    body: [
      '## Plan Metadata',
      `- **Source-plan**: ${sourcePlan}`,
      `- **Source-plan-commit**: ${sourcePlanCommit}`,
      `- **Source-plan-section**: ${sourcePlanSection}`,
    ].join('\n'),
  };
}
```

Add tests with these exact assertions:

```js
test('parses visible WBS child provenance without trusting Generated-by', () => {
  const task = { number: 1, title: 'Classifier', heading: '### Task 1: Classifier' };
  assert.deepEqual(parseWbsChildClaim(wbsChild({ number: 1201, task })), {
    number: 1201,
    title: 'Classifier',
    sourcePlan: SOURCE_PLAN,
    sourcePlanCommit: 'child-plan-commit',
    sourcePlanSection: '### Task 1: Classifier',
  });
});

test('reconciles complete WBS coverage against content-equivalent pinned plans', async () => {
  const acceptedPlanText = planText(6, 6);
  const tasks = classifyDecomposition({ planText: acceptedPlanText }).tasks;
  const reads = [];
  const result = await reconcileWbsCoverage({
    tasks,
    acceptedPlanPath: SOURCE_PLAN,
    acceptedPlanText,
    children: tasks.map((task, index) => wbsChild({ number: 1273 + index, task })),
    readPlanAtCommit: async (input) => {
      reads.push(input);
      return acceptedPlanText;
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.expectedCount, 6);
  assert.equal(result.coveredCount, 6);
  assert.equal(reads.length, 1, 'identical commit/path reads are cached');
});

test('reports missing, duplicate, unknown, title, path, and content contradictions', async () => {
  const acceptedPlanText = planText(4, 4);
  const tasks = classifyDecomposition({ planText: acceptedPlanText }).tasks;
  const result = await reconcileWbsCoverage({
    tasks,
    acceptedPlanPath: SOURCE_PLAN,
    acceptedPlanText,
    children: [
      wbsChild({ number: 1401, task: tasks[0] }),
      wbsChild({ number: 1402, task: tasks[0] }),
      wbsChild({ number: 1403, task: tasks[1], title: 'Wrong title' }),
      wbsChild({ number: 1404, task: tasks[2], sourcePlan: 'docs/wrong.md' }),
      wbsChild({
        number: 1405,
        task: tasks[2],
        sourcePlanSection: '### Task 99: Unknown',
      }),
      wbsChild({ number: 1406, task: tasks[3] }),
    ],
    readPlanAtCommit: async ({ planPath }) =>
      planPath === SOURCE_PLAN ? `${acceptedPlanText}\nchanged` : acceptedPlanText,
  });
  assert.equal(result.ok, false);
  assert.ok(result.duplicateClaims.some((item) => /#1401.*#1402/.test(item)));
  assert.ok(result.provenanceMismatches.some((item) => /#1403.*title/.test(item)));
  assert.ok(result.provenanceMismatches.some((item) => /#1404.*Source-plan/.test(item)));
  assert.ok(result.unknownSections.some((item) => /#1405.*Task 99/.test(item)));
  assert.ok(result.blockers.some((item) => /pinned plan content differs/.test(item)));
});

test('unrelated children coexist but cannot satisfy a missing WBS task', async () => {
  const acceptedPlanText = planText(2, 2);
  const tasks = classifyDecomposition({ planText: acceptedPlanText }).tasks;
  const unrelated = wbsChild({
    number: 1500,
    task: { title: 'Follow-on', heading: '### Task 50: Follow-on' },
    sourcePlan: 'docs/other-plan.md',
  });
  const result = await reconcileWbsCoverage({
    tasks,
    acceptedPlanPath: SOURCE_PLAN,
    acceptedPlanText,
    children: [wbsChild({ number: 1501, task: tasks[0] }), unrelated],
    readPlanAtCommit: async () => acceptedPlanText,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingTasks, [tasks[1].heading]);
  assert.doesNotMatch(result.blockers.join('\n'), /#1500/);
});
```

In the existing pagination test in
`scripts/tests/unit/task-tracker/lib/epic-r4p-orchestration.test.mjs`, retain the
query argument and assert that the full child snapshot asks for titles:

```js
gqlFn: async (query, variables) => {
  if (variables.after == null && query.includes('stateReason')) {
    assert.match(query, /\btitle\b/);
  }
  afters.push(variables.after);
  return {
    repository: {
      issue: {
        subIssues:
          variables.after == null
            ? {
                totalCount: 2,
                nodes: [{ id: 'I1', number: 1 }],
                pageInfo: { hasNextPage: true, endCursor: 'c1' },
              }
            : {
                totalCount: 2,
                nodes: [{ id: 'I2', number: 2 }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
      },
    },
  };
},
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs \
  scripts/tests/unit/task-tracker/lib/epic-r4p-orchestration.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`scripts/task-tracker/lib/decomposition-wbs-coverage.mjs`; the child-query test
also fails until `title` is selected.

- [ ] **Step 3: Implement child claim parsing and one-to-one reconciliation**

Create `scripts/task-tracker/lib/decomposition-wbs-coverage.mjs` with this implementation:

```js
// @story #1279
import { visibleMetadataFieldValue } from './decomposition-policy.mjs';

const SECTION = 'Plan Metadata';

export function parseWbsChildClaim(child = {}) {
  return {
    number: Number(child.number),
    title: String(child.title || '').trim(),
    sourcePlan: visibleMetadataFieldValue(child.body || '', SECTION, 'Source-plan'),
    sourcePlanCommit: visibleMetadataFieldValue(
      child.body || '',
      SECTION,
      'Source-plan-commit'
    ),
    sourcePlanSection: visibleMetadataFieldValue(
      child.body || '',
      SECTION,
      'Source-plan-section'
    ),
  };
}

function childRef(claim) {
  return `#${Number.isInteger(claim.number) && claim.number > 0 ? claim.number : 'unknown'}`;
}

function unique(values) {
  return [...new Set(values)];
}

export async function reconcileWbsCoverage({
  tasks = [],
  acceptedPlanPath,
  acceptedPlanText,
  children = [],
  readPlanAtCommit,
} = {}) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('wbs-coverage: tasks are required');
  }
  if (!String(acceptedPlanPath || '').trim()) {
    throw new Error('wbs-coverage: acceptedPlanPath is required');
  }
  if (typeof acceptedPlanText !== 'string') {
    throw new Error('wbs-coverage: acceptedPlanText is required');
  }
  if (!Array.isArray(children)) throw new Error('wbs-coverage: children must be an array');
  if (typeof readPlanAtCommit !== 'function') {
    throw new Error('wbs-coverage: readPlanAtCommit is required');
  }

  const expectedBySection = new Map(tasks.map((task) => [task.heading, task]));
  const expectedTitles = new Set(tasks.map((task) => task.title));
  const claims = children.map(parseWbsChildClaim);
  const relevant = claims.filter(
    (claim) =>
      claim.sourcePlan === acceptedPlanPath ||
      expectedBySection.has(claim.sourcePlanSection) ||
      expectedTitles.has(claim.title)
  );
  const missingTasks = [];
  const duplicateClaims = [];
  const provenanceMismatches = [];
  const unknownSections = [];
  const matched = [];
  const planReads = new Map();

  async function pinnedPlan(claim) {
    const key = `${claim.sourcePlanCommit}\u0000${claim.sourcePlan}`;
    if (!planReads.has(key)) {
      planReads.set(
        key,
        Promise.resolve(
          readPlanAtCommit({
            planCommit: claim.sourcePlanCommit,
            planPath: claim.sourcePlan,
          })
        )
      );
    }
    return planReads.get(key);
  }

  for (const claim of relevant) {
    if (claim.sourcePlan === acceptedPlanPath && !expectedBySection.has(claim.sourcePlanSection)) {
      unknownSections.push(
        `${childRef(claim)} claims unknown Source-plan-section ${JSON.stringify(
          claim.sourcePlanSection
        )}`
      );
    }
  }

  for (const task of tasks) {
    const candidates = relevant.filter((claim) => claim.sourcePlanSection === task.heading);
    if (candidates.length === 0) {
      missingTasks.push(task.heading);
      continue;
    }
    if (candidates.length > 1) {
      duplicateClaims.push(
        `${task.heading} is claimed by ${candidates.map(childRef).join(', ')}`
      );
      continue;
    }
    const claim = candidates[0];
    const errors = [];
    if (claim.sourcePlan !== acceptedPlanPath) {
      errors.push(
        `${childRef(claim)} Source-plan ${JSON.stringify(claim.sourcePlan)} does not match ${JSON.stringify(
          acceptedPlanPath
        )}`
      );
    }
    if (claim.title !== task.title) {
      errors.push(
        `${childRef(claim)} title ${JSON.stringify(claim.title)} does not match ${JSON.stringify(
          task.title
        )}`
      );
    }
    if (!claim.sourcePlanCommit) {
      errors.push(`${childRef(claim)} Source-plan-commit is missing`);
    }
    if (errors.length === 0) {
      try {
        if ((await pinnedPlan(claim)) !== acceptedPlanText) {
          errors.push(`${childRef(claim)} pinned plan content differs from the accepted plan`);
        }
      } catch (error) {
        errors.push(`${childRef(claim)} pinned plan is unreadable: ${error.message}`);
      }
    }
    if (errors.length > 0) provenanceMismatches.push(...errors);
    else matched.push({ task, child: claim });
  }

  const blockers = unique([
    ...missingTasks.map((heading) => `wbs-missing-task: ${heading}`),
    ...duplicateClaims.map((detail) => `wbs-duplicate-claim: ${detail}`),
    ...provenanceMismatches.map((detail) => `wbs-provenance-mismatch: ${detail}`),
    ...unknownSections.map((detail) => `wbs-unknown-section: ${detail}`),
  ]);
  return {
    ok: blockers.length === 0 && matched.length === tasks.length,
    expectedCount: tasks.length,
    coveredCount: matched.length,
    matched,
    missingTasks,
    duplicateClaims,
    provenanceMismatches,
    unknownSections,
    blockers,
  };
}
```

In `scripts/gh/lib/wave-admission.mjs`, add `title` beside `number` in the
`fetchAllSubIssueNodes` GraphQL node selection:

```graphql
nodes {
  id
  number
  title
  state
  stateReason
  body
```

- [ ] **Step 4: Run the focused reconciliation tests and confirm GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs \
  scripts/tests/unit/task-tracker/lib/epic-r4p-orchestration.test.mjs
```

Expected: PASS, including complete coverage, cached content-equivalent reads,
contradiction diagnostics, and unrelated-child behavior.

- [ ] **Step 5: Commit the reconciliation unit**

```bash
git add scripts/task-tracker/lib/decomposition-wbs-coverage.mjs \
  scripts/gh/lib/wave-admission.mjs \
  scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs \
  scripts/tests/unit/task-tracker/lib/epic-r4p-orchestration.test.mjs
git commit -m "[#1279] feat: reconcile epic plan WBS coverage"
```

### Task 2: Wire WBS coverage into Plan-exit admission

**Files:**

- Modify: `scripts/task-tracker/lib/decomposition-plan-exit-guard.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs`

**Interfaces:**

- Consumes: `parseIssueKind(body)`, `linkedPlanPath(body)`, `fetchAllSubIssueNodes`, and `reconcileWbsCoverage`.
- Injects through `ctx.deps.decomposition`: `fetchWbsChildren`, `readPlanAtCommit`, `readFile`, and `projectDir`.
- Preserves: `evaluateIssueDecomposition`, its return shape, `decompose-check`, waiver semantics, and guard registry order.
- Produces: a successful warning `plan-exit-decomposition: WBS instantiated (N/N)` or issue-numbered `wbs-*` blockers.

- [ ] **Step 1: Add failing guard-level epic admission tests**

Extend the test context so an epic body can be produced without changing the
existing default code-kind cases:

```js
function epicMarker() {
  return '\n## AITM Progress Markers\n\n<!-- aitm-issue-kind kind="epic" -->\n';
}

function completeEpicContext(taskCount = 6) {
  const text = planText(taskCount, taskCount);
  const ctx = context({ size: 'L', estimate: 16, text, bodySuffix: epicMarker() });
  const tasks = classifyDecomposition({ planText: text }).tasks;
  ctx.deps.decomposition.fetchWbsChildren = async () =>
    tasks.map((task, index) => wbsChild({ number: 1273 + index, task }));
  ctx.deps.decomposition.readPlanAtCommit = async () => text;
  return ctx;
}
```

Add these tests:

```js
test('plan exit admits a must-split epic with complete linked WBS coverage', async () => {
  const result = await decompositionPlanExitGuard.run(completeEpicContext());
  assert.equal(result.ok, true);
  assert.match(result.warn, /WBS instantiated \(6\/6\)/);
});

test('plan exit reports exact incomplete epic WBS blockers', async () => {
  const ctx = completeEpicContext(4);
  const children = await ctx.deps.decomposition.fetchWbsChildren();
  ctx.deps.decomposition.fetchWbsChildren = async () => children.slice(0, 3);
  const result = await decompositionPlanExitGuard.run(ctx);
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((item) => /wbs-missing-task: ### Task 4/.test(item)));
});

test('plan exit keeps a non-epic must-split issue blocked even if child-shaped data exists', async () => {
  const ctx = context({ size: 'L', estimate: 16, text: planText(4, 4) });
  ctx.deps.decomposition.fetchWbsChildren = async () => {
    throw new Error('must not fetch children for code kind');
  };
  const result = await decompositionPlanExitGuard.run(ctx);
  assert.equal(result.ok, false);
  assert.match(result.reason, /must-split/);
});

test('plan exit fails closed when epic WBS evidence cannot be read', async () => {
  const ctx = completeEpicContext(4);
  ctx.deps.decomposition.fetchWbsChildren = async () => {
    throw new Error('GraphQL unavailable');
  };
  const result = await decompositionPlanExitGuard.run(ctx);
  assert.equal(result.ok, false);
  assert.match(result.reason, /wbs-evidence-unreadable: GraphQL unavailable/);
});
```

- [ ] **Step 2: Run the guard tests and confirm RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs
```

Expected: the complete epic case FAILS because the current guard still returns
`plan-exit-decomposition: must-split`; the other existing tests remain green.

- [ ] **Step 3: Add default child and pinned-plan readers**

At the top of `scripts/task-tracker/lib/decomposition-plan-exit-guard.mjs`, add:

```js
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { fetchAllSubIssueNodes } from '../../gh/lib/wave-admission.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';
import { parseIssueKind } from './issue-kind.mjs';
import { reconcileWbsCoverage } from './decomposition-wbs-coverage.mjs';
```

Add `linkedPlanPath` to the existing decomposition-policy import and add these
module-level helpers:

```js
const pexec = promisify(execFile);

async function defaultFetchWbsChildren({ issueNumber, cfg }) {
  return fetchAllSubIssueNodes({
    parentEpicNumber: Number(issueNumber),
    repo: cfg.repo,
  });
}

async function defaultReadPlanAtCommit({ projectDir, planCommit, planPath }) {
  const { stdout } = await pexec('git', ['show', `${planCommit}:${planPath}`], {
    cwd: projectDir,
    timeout: GH_API_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

function mustSplitBlockers(result, codes) {
  return [
    `plan-exit-decomposition: must-split (${codes})${planNote(result)}`,
    'Run `npx aitm split-plan <issue> --dry-run` or add a complete visible `## Decomposition Waiver` section.',
  ];
}
```

- [ ] **Step 4: Implement epic WBS admission in the `must-split` branch**

Replace only the current `if (result.classification.status === 'must-split')`
branch with:

```js
if (result.classification.status === 'must-split') {
  if (result.waiver.ok) {
    return {
      ok: true,
      warn: `plan-exit-decomposition: waiver accepted for must-split (${codes})`,
    };
  }
  if (parseIssueKind(ctx.body || '') !== 'epic') {
    const blockers = mustSplitBlockers(result, codes);
    return { ok: false, reason: blockers.join('; '), blockers };
  }
  try {
    const runtime = ctx.deps?.decomposition || {};
    const projectDir = runtime.projectDir || ctx.projectDir || getProjectDir();
    const acceptedPlanPath = linkedPlanPath(ctx.body || '');
    if (!acceptedPlanPath || !result.planDiagnostic?.path) {
      throw new Error(result.planDiagnostic?.diagnostic || 'accepted plan path unavailable');
    }
    const readFile = runtime.readFile || readFileSync;
    const acceptedPlanText = readFile(result.planDiagnostic.path, 'utf8');
    const fetchWbsChildren = runtime.fetchWbsChildren || defaultFetchWbsChildren;
    const readPlanAtCommit = runtime.readPlanAtCommit || defaultReadPlanAtCommit;
    const children = await fetchWbsChildren({
      issueNumber: Number(ctx.issueNumber),
      cfg: ctx.cfg,
    });
    const coverage = await reconcileWbsCoverage({
      tasks: result.classification.tasks,
      acceptedPlanPath,
      acceptedPlanText,
      children,
      readPlanAtCommit: ({ planCommit, planPath }) =>
        readPlanAtCommit({ projectDir, planCommit, planPath }),
    });
    if (coverage.ok) {
      return {
        ok: true,
        warn: `plan-exit-decomposition: WBS instantiated (${coverage.coveredCount}/${coverage.expectedCount})`,
      };
    }
    const blockers = [
      `plan-exit-decomposition: must-split (${codes}); WBS incomplete`,
      ...coverage.blockers,
    ];
    return { ok: false, reason: blockers.join('; '), blockers };
  } catch (error) {
    const blockers = [
      `plan-exit-decomposition: must-split (${codes})`,
      `wbs-evidence-unreadable: ${error.message}`,
    ];
    return { ok: false, reason: blockers.join('; '), blockers };
  }
}
```

- [ ] **Step 5: Run focused gate and split-plan regression tests**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs \
  scripts/tests/unit/task-tracker/verbs/split-plan.test.mjs
```

Expected: PASS. The complete epic reports `WBS instantiated (6/6)`; incomplete,
non-epic, and unreadable cases fail closed; existing waiver and classification
tests remain green.

- [ ] **Step 6: Commit guard orchestration**

```bash
git add scripts/task-tracker/lib/decomposition-plan-exit-guard.mjs \
  scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs
git commit -m "[#1279] fix: admit epics after WBS creation"
```

### Task 3: Verify the defect branch and preserve the governed boundary

**Files:**

- Verify only; no production or documentation file changes are expected.

**Interfaces:**

- Consumes: the focused Node tests and repository Develop verifier.
- Produces: fresh verification evidence for #1279 without integrating, pushing, or mutating #1268.

- [ ] **Step 1: Run all focused regression tests from a prepared `.tmp` runtime directory**

```bash
mkdir -p .tmp
node --test scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs \
  scripts/tests/unit/task-tracker/lib/decomposition-policy.test.mjs \
  scripts/tests/unit/task-tracker/lib/epic-r4p-orchestration.test.mjs \
  scripts/tests/unit/task-tracker/verbs/split-plan.test.mjs
```

Expected: PASS with zero failures.

- [ ] **Step 2: Run repository Develop verification**

```bash
node scripts/task-tracker/verify-develop.mjs
```

Expected: exit 0. Report any baseline failure exactly and do not alter unrelated
files to hide it.

- [ ] **Step 3: Confirm branch scope and history**

```bash
git status --short
git log --oneline --decorate origin/trunk..HEAD
git diff --stat origin/trunk...HEAD
```

Expected: clean status; one design commit, one plan commit, and the two focused
implementation commits; no #1268 spec/plan or #1272 change.

- [ ] **Step 4: Stop at the integration gate**

Do not merge or cherry-pick #1279 into the #1268 parent worktree. Report the
verified #1279 commit and request the separately required integration approval.
After approval, integrate without rewriting history, rerun the live #1268 Plan
promotion, and then resume child #1273 in governed order.
