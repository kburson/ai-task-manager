# Merge-Back Custom Epic Branch Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make governed merge-back deliver a child into its parent epic's recorded custom branch while preserving canonical fallback and every existing Git safety gate.

**Architecture:** Keep branch authority as an opaque Git ref and issue identity as a numeric graph value. Extend lineage results with the already-known parent issue, build fail-closed merge-back graph nodes from durable parent-body authority, and prefetch the child plus immediate-epic nodes before the synchronous merge protocol begins.

**Tech Stack:** Node.js ES modules, `node:test`, GitHub GraphQL through the existing client, injectable Git/process boundaries, real scratch Git repositories.

## Global Constraints

- Follow red-green-refactor; observe focused failures before production edits.
- Use the existing `resolveCurrentIssueWorktreeBranch` parser; do not duplicate marker parsing.
- Treat recorded branches as opaque refs; never parse a custom branch to recover an issue number.
- Canonical `feature/epic/<N>` fallback applies only when a successfully read parent body has no authority marker.
- Malformed or ambiguous authority and missing required graph nodes refuse before any Git or test-runner call.
- Preserve merge-base, rebase, Unit/Integration/Slow tests, `--ff-only`, and success-only cleanup ordering.
- Do not create an alias branch, rename #1220's `cloud-test-automation` branch, or replace any recorded worktree.
- Do not dispatch parallel agents; execute this atomic blocker serially in its recorded worktree.
- After #1485 lands, #1226 must recapture its exact-head timing baseline because changed test blobs invalidate the existing calibration-input digest.

---

## File Map

- Modify `scripts/task-tracker/lib/resolve-epic-lineage.mjs`: expose the graph's numeric parent issue without changing branch-role semantics.
- Modify `scripts/tests/unit/task-tracker/lib/resolve-epic-lineage.test.mjs`: pin `parentIssue` for every role and custom authority.
- Modify `scripts/task-tracker/merge-back.mjs`: add authority-aware graph mapping/prefetch and remove branch-name identity parsing.
- Modify `scripts/tests/unit/task-tracker/merge-back.test.mjs`: cover mapping, prefetch, custom fallback, and zero-mutation refusal.
- Modify `scripts/tests/slow/task-tracker/lib/epic-tree.test.mjs`: prove the custom-parent path with real Git.

### Task 1: Preserve Numeric Parent Identity in Lineage Results

**Files:**

- Modify: `scripts/task-tracker/lib/resolve-epic-lineage.mjs`
- Test: `scripts/tests/unit/task-tracker/lib/resolve-epic-lineage.test.mjs`

**Interfaces:**

- Consumes: `deps.graph(issue) -> { parent, children, authoritativeBranch?, parentAuthoritativeBranch?, authorityError?, parentAuthorityError? }`.
- Produces: `resolveEpicLineage(...) -> { role, branch, epicBranch, parentBranch, parentIssue }`, where `parentIssue` is the graph node's numeric parent or `null`.

- [ ] **Step 1: Extend the exact-result tests first**

Add `parentIssue` to every full-object expectation:

```js
assert.deepEqual(resolveEpicLineage(905, { deps }), {
  role: 'epic',
  branch: 'feature/epic/905',
  epicBranch: 'feature/epic/905',
  parentBranch: 'trunk',
  parentIssue: null,
});

assert.deepEqual(resolveEpicLineage(910, { deps }), {
  role: 'child',
  branch: 'feature/child/910',
  epicBranch: 'feature/epic/905',
  parentBranch: 'feature/epic/905',
  parentIssue: 905,
});
```

Apply the same exact field to nested epic `911`, nested child `920`, standalone story `42`, and the #1284 custom-authority expectation. Add this assertion to prove identity remains independent of the opaque ref:

```js
const customLineage = resolveEpicLineage(910, { deps: custom });
assert.equal(customLineage.parentIssue, 905);
assert.equal(customLineage.epicBranch, 'codex/1268-implementation-plan');
```

- [ ] **Step 2: Run the focused lineage test and observe RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/resolve-epic-lineage.test.mjs
```

Expected: FAIL because every current result omits `parentIssue`.

- [ ] **Step 3: Add the minimal additive result field**

After the existing node destructure, retain its parent identity:

```js
const { parent = null, children = [] } = node;
const parentIssue = parent;
```

Add `parentIssue` to all three return shapes without changing any existing branch selection:

```js
if (role === 'story') {
  return { role, branch, epicBranch: null, parentBranch: trunk, parentIssue };
}

if (role === 'epic') {
  return {
    role,
    branch,
    epicBranch: branch,
    parentBranch: parentEpicBranch || trunk,
    parentIssue,
  };
}

return {
  role,
  branch,
  epicBranch: parentEpicBranch,
  parentBranch: parentEpicBranch,
  parentIssue,
};
```

Update the module contract comment to include `parentIssue` and define it as graph identity, not branch-derived identity.

- [ ] **Step 4: Run the lineage and dependent focused tests**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/resolve-epic-lineage.test.mjs scripts/tests/unit/task-tracker/cut-child-worktree.test.mjs scripts/tests/unit/task-tracker/epic-base-edit-guard.test.mjs
```

Expected: all tests pass with unchanged branch semantics.

- [ ] **Step 5: Commit the independently reviewable lineage change**

```bash
git add scripts/task-tracker/lib/resolve-epic-lineage.mjs scripts/tests/unit/task-tracker/lib/resolve-epic-lineage.test.mjs
git commit -m "fix: preserve parent issue in epic lineage [#1485]"
```

### Task 2: Load Durable Authority and Repair Merge-Back Identity Flow

**Files:**

- Modify: `scripts/task-tracker/merge-back.mjs`
- Test: `scripts/tests/unit/task-tracker/merge-back.test.mjs`
- Test: `scripts/tests/slow/task-tracker/lib/epic-tree.test.mjs`

**Interfaces:**

- Consumes: `resolveCurrentIssueWorktreeBranch(parentBody) -> string | null`, `resolveEpicLineage(...).parentIssue`, existing parent/children fetchers, and the existing Git/test injections.
- Produces: `buildMergeBackGraphNode({ parent, children, parentBody }) -> graphNode` and `loadMergeBackGraph({ child, cfg, deps? }) -> synchronous graph(issue)`.
- `graphNode` contains `{ parent, children }` plus exactly one of `parentAuthoritativeBranch` or `parentAuthorityError` when applicable.

- [ ] **Step 1: Add RED mapping and loader tests**

Import the new interfaces and the existing marker serializer:

```js
import {
  buildMergeBackGraphNode,
  loadMergeBackGraph,
  mergeBack,
} from '../../../task-tracker/merge-back.mjs';
import { serializeIssueWorktreeLocationMarker } from '../../../task-tracker/lib/issue-worktree-location.mjs';
```

Add a valid authority test:

```js
test('#1485: graph mapping preserves a valid parent custom branch', () => {
  const parentBody = serializeIssueWorktreeLocationMarker({
    worktreePath: '/wt/905',
    worktreeBranch: 'cloud-test-automation',
    sessionId: 'session-1',
    ts: '2026-09-02T00:00:00Z',
  });
  assert.deepEqual(buildMergeBackGraphNode({ parent: 905, children: [], parentBody }), {
    parent: 905,
    children: [],
    parentAuthoritativeBranch: 'cloud-test-automation',
  });
});
```

Add table-driven cases proving:

- parent body with no marker emits no authority field;
- a marker missing `ts` emits `parentAuthorityError` containing `malformed`;
- two same-timestamp markers with different branches emit `parentAuthorityError` containing `ambiguous`;
- a non-null parent with `parentBody: undefined` throws `parent body unavailable`.

Add the two-node loader test:

```js
test('#1485: graph loader prefetches child and immediate epic by issue number', async () => {
  const loaded = [];
  const nodes = new Map([
    [910, { parent: 905, children: [] }],
    [905, { parent: null, children: [910] }],
  ]);
  const graph = await loadMergeBackGraph({
    child: 910,
    cfg: { repo: 'owner/repo' },
    deps: {
      loadNode: async (issue) => {
        loaded.push(issue);
        return nodes.get(issue);
      },
    },
  });
  assert.deepEqual(loaded, [910, 905]);
  assert.deepEqual(graph(910), nodes.get(910));
  assert.deepEqual(graph(905), nodes.get(905));
  assert.throws(() => graph(999), /not prefetched/);
});
```

- [ ] **Step 2: Add RED merge-protocol cases**

Add a custom graph whose child points to the opaque parent ref while its numeric edge remains `905`:

```js
const customGraph = (n) =>
  n === 910
    ? { ...GRAPH[910], parentAuthoritativeBranch: 'cloud-test-automation' }
    : (GRAPH[n] ?? { parent: null, children: [] });
```

Assert a successful merge uses `cloud-test-automation` for child rebase and epic checkout/merge, and returns that ref as `result.epic`. Add a separate `parentAuthorityError` graph and assert `git.calls` stays empty and `runTests` is never called.

Extend the existing real-Git #1284 test into a full merge-back proof. Check out the custom epic in the scratch repository's main worktree, advance it, cut and commit the child, call `mergeBack`, and assert:

```js
assert.ok(git(['show', `${customEpic}:child.txt`]).includes('custom child'));
assert.equal(git(['branch', '--list', 'feature/epic/905']), '');
assert.equal(git(['branch', '--list', 'feature/child/910']), '');
assert.ok(!existsSync(childWorktree));
assert.doesNotThrow(() => git(['merge-base', '--is-ancestor', 'trunk', customEpic]));
```

- [ ] **Step 3: Run all new tests and observe RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/merge-back.test.mjs scripts/tests/slow/task-tracker/lib/epic-tree.test.mjs
```

Expected failures:

- missing exports `buildMergeBackGraphNode` and `loadMergeBackGraph`;
- custom merge-back cannot derive an issue from `cloud-test-automation`;
- the production loader has no keyed two-node graph.

- [ ] **Step 4: Implement the fail-closed graph mapper**

Remove the `parseBranchName` import and add:

```js
import { resolveCurrentIssueWorktreeBranch } from './lib/issue-worktree-location.mjs';
```

Implement the pure mapping boundary:

```js
export function buildMergeBackGraphNode({ parent = null, children = [], parentBody } = {}) {
  const normalizedParent = parent == null ? null : Number(parent);
  if (normalizedParent != null && (!Number.isInteger(normalizedParent) || normalizedParent <= 0)) {
    throw new Error('merge-back: parent issue must be a positive integer');
  }
  const normalizedChildren = (children || []).map((child) => Number(child.number ?? child));
  if (normalizedChildren.some((child) => !Number.isInteger(child) || child <= 0)) {
    throw new Error('merge-back: child issues must be positive integers');
  }
  if (normalizedParent == null) return { parent: null, children: normalizedChildren };
  if (typeof parentBody !== 'string') {
    throw new Error(`merge-back: parent #${normalizedParent} body unavailable`);
  }
  try {
    const branch = resolveCurrentIssueWorktreeBranch(parentBody);
    return {
      parent: normalizedParent,
      children: normalizedChildren,
      ...(branch ? { parentAuthoritativeBranch: branch } : {}),
    };
  } catch (error) {
    return {
      parent: normalizedParent,
      children: normalizedChildren,
      parentAuthorityError: error.message,
    };
  }
}
```

- [ ] **Step 5: Implement parent-body loading and the keyed graph**

Add a default parent-body query using the existing GraphQL client:

```js
async function fetchIssueBody(issue, cfg) {
  const { gql, splitRepo } = await import('../gh/lib/github-projects.mjs');
  const { owner, repoName } = splitRepo(cfg.repo);
  const data = await gql(
    `query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) { issue(number: $issue) { body } }
    }`,
    { owner, repo: repoName, issue: Number(issue) }
  );
  const body = data?.repository?.issue?.body;
  if (typeof body !== 'string') {
    throw new Error(`merge-back: parent #${issue} body unavailable`);
  }
  return body;
}
```

Make `realGraphNode` injectable and return the mapper result:

```js
async function realGraphNode(issue, cfg, deps = {}) {
  const fetchParent =
    deps.fetchParentIssue || (await import('./lib/fetch-parent-issue.mjs')).fetchParentIssue;
  const fetchChildren =
    deps.fetchEpicChildren || (await import('./lib/epic-children-gate.mjs')).fetchEpicChildren;
  const fetchBody = deps.fetchIssueBody || fetchIssueBody;
  const parent = await fetchParent({ issueNumber: issue, repo: cfg.repo });
  const children = await fetchChildren({ cfg, parentEpicNumber: issue });
  const parentBody = parent == null ? undefined : await fetchBody(parent, cfg);
  return buildMergeBackGraphNode({ parent, children, parentBody });
}
```

Implement the prefetched synchronous graph:

```js
export async function loadMergeBackGraph({ child, cfg, deps = {} } = {}) {
  const loadNode = deps.loadNode || ((issue) => realGraphNode(issue, cfg, deps));
  const childNode = await loadNode(Number(child));
  if (!childNode) throw new Error(`merge-back: graph node #${child} unavailable`);
  const nodes = new Map([[Number(child), childNode]]);
  if (childNode.parent != null) {
    const epicIssue = Number(childNode.parent);
    const epicNode = await loadNode(epicIssue);
    if (!epicNode) throw new Error(`merge-back: graph node #${epicIssue} unavailable`);
    nodes.set(epicIssue, epicNode);
  }
  return (issue) => {
    const key = Number(issue);
    if (!nodes.has(key)) throw new Error(`merge-back: graph node #${issue} was not prefetched`);
    return nodes.get(key);
  };
}
```

- [ ] **Step 6: Use numeric identity in the pure protocol and keyed graph in production**

Replace branch parsing with the additive lineage field:

```js
const epicIssue = childLineage.parentIssue;
if (!Number.isInteger(epicIssue) || epicIssue <= 0) {
  throw new Error(`merge-back: #${child} has no valid parent epic issue`);
}
const grandparent = resolveEpicLineage(epicIssue, { deps }).parentBranch;
```

In `main`, replace the single-node constant graph with:

```js
const graph = await loadMergeBackGraph({ child, cfg });
```

Pass `graph` directly in `mergeBack`'s dependencies. Do not move graph construction below any Git or test operation.

- [ ] **Step 7: Run focused tests and inspect mutation order**

Run:

```bash
node --test scripts/tests/unit/task-tracker/merge-back.test.mjs scripts/tests/unit/task-tracker/lib/issue-worktree-location.test.mjs scripts/tests/unit/task-tracker/lib/resolve-epic-lineage.test.mjs scripts/tests/slow/task-tracker/lib/epic-tree.test.mjs
```

Expected: all tests pass. Review recorded fake-Git calls to confirm authority errors produce no calls and successful custom merges retain rebase -> tests -> checkout -> `--ff-only` -> cleanup order.

- [ ] **Step 8: Commit the merge-back repair and regression proof**

```bash
git add scripts/task-tracker/merge-back.mjs scripts/tests/unit/task-tracker/merge-back.test.mjs scripts/tests/slow/task-tracker/lib/epic-tree.test.mjs
git commit -m "fix: honor custom epic authority in merge-back [#1485]"
```

### Task 3: Finalize Governed Verification and Recovery Evidence

**Files:**

- Verify: all five files in the File Map
- Preserve: `docs/superpowers/specs/2026-09-02-1485-merge-back-custom-epic-branch-authority-design.md`
- Preserve: `docs/superpowers/plans/2026-09-02-1485-merge-back-custom-epic-branch-authority.md`

**Interfaces:**

- Produces: exact-head Develop/Test receipts for #1485 and a clean branch ready for governed review and delivery.
- Hands off: delivered trunk repair to #1226 recovery; it does not modify #1220 or #1226 inside the #1485 worktree.

- [ ] **Step 1: Run the issue-focused acceptance verifier**

```bash
node --test scripts/tests/unit/task-tracker/merge-back.test.mjs scripts/tests/unit/task-tracker/lib/issue-worktree-location.test.mjs scripts/tests/unit/task-tracker/lib/resolve-epic-lineage.test.mjs scripts/tests/slow/task-tracker/lib/epic-tree.test.mjs
```

Expected: zero failures.

- [ ] **Step 2: Run Develop verification**

```bash
node scripts/task-tracker/verify-develop.mjs
```

Expected: affected-test selection completes with zero failures and reports the changed merge-back/lineage files.

- [ ] **Step 3: Run formatting and lint before complete suites**

```bash
npm run lint
npm run format:check
```

Expected: both commands exit zero without modifying tracked files.

- [ ] **Step 4: Run all bounded test lanes**

```bash
npm run test:unit
npm run test:integration
npm run test:slow
```

Expected: every lane exits zero within its configured ceiling.

- [ ] **Step 5: Confirm exact branch state**

```bash
git status --short
git log --oneline --decorate origin/trunk..HEAD
git diff --check origin/trunk...HEAD
```

Expected: clean status, the #1485 design plus implementation commits only, and no whitespace errors.

- [ ] **Step 6: Drive #1485 through governed completion**

As the new-session orchestrator, run the repository verbs in order and honor every refusal:

```bash
npx aitm test 1485
npx aitm review 1485
```

After independent review is green, request explicit human approval, run `npx aitm approve 1485`, request explicit close authorization, then use `npx aitm deliver 1485` and `npx aitm close 1485` as directed by their live gates. Never use raw GitHub close, raw state mutation, or an unverified merge fallback.

- [ ] **Step 7: Recover #1226 only after #1485 is on trunk**

Return to the recorded #1220 and #1226 worktrees. Verify exact local/remote refs, ancestry, dirty state, and live issue/receipt state before mutation. Synchronize through governed workflows, recapture #1226's Unit/Integration/Slow exact-head artifacts and normalized fixture at the new implementation head, rerun all #1226 verification, and retry governed merge-back/delivery/close without creating `feature/epic/1220`.

- [ ] **Step 8: Continue the #1220 child chain serially**

After #1226 reaches Done and unblocks the chain, re-read #1220 and every live child from GitHub, preserve recorded Rank/dependency order, and drive each eligible child through Plan -> Develop -> Test -> Review -> approved delivery -> Done. Do not rely on the earlier snapshot when current code, issue state, or dependencies disagree.
