# #1486 Epic Graph-Node Authority Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents for this issue.

**Goal:** Consolidate five parent branch-authority adapters behind one tested mapper and injectable parent-body fetcher without changing caller-visible lineage behavior.

**Architecture:** A new policy-neutral `graph-node-authority.mjs` module owns graph-node normalization and worktree-marker parsing. Existing callers retain relationship discovery, synchronous versus asynchronous I/O, and outward error presentation while delegating all authority mapping and reusable parent-body fetching to the shared module.

**Tech Stack:** Node.js ES modules, `node:test`, GitHub GraphQL through the existing `gql`/`splitRepo` helpers, and AITM's existing worktree-location and lineage resolvers.

## Global Constraints

- Preserve `resolveEpicLineage` role and branch semantics.
- Preserve `resolveCurrentIssueWorktreeLocation` parsing and selection semantics.
- A valid body with no marker preserves canonical `feature/epic/<N>` fallback.
- Malformed, ambiguous, missing, or unreadable authority fails closed.
- `parentAuthoritativeBranch` and `parentAuthorityError` are mutually exclusive.
- Close-gate child objects retain `number`, `title`, and `closeReason`.
- The source-edit hook remains synchronous.
- Do not add caching, persistence, retry, or new graph service behavior.
- Do not dispatch subagents; execute this plan inline.

---

### Task 1: Define the shared authority contract

**Files:**

- Create: `scripts/tests/unit/task-tracker/lib/graph-node-authority.test.mjs`
- Create: `scripts/task-tracker/lib/graph-node-authority.mjs`

**Interfaces:**

- Consumes: `resolveCurrentIssueWorktreeLocation(body)` from `issue-worktree-location.mjs`; injected `gql(query, variables)` and `splitRepo(repo)`.
- Produces: `buildGraphNodeAuthority({ parent, children, ownBody, parentBody, mapChild })` and `fetchParentIssueBody({ parentIssue, cfg, deps })`.

- [ ] **Step 1: Write the failing shared-contract tests**

Create a dynamic-import test so the first failure is an explicit missing-contract assertion rather than an uncaught module error. Then define cases for valid custom parent authority, no-marker fallback, malformed and ambiguous authority, own authority, rich child mapping, invalid identities, missing parent body, null-parent no-fetch, injected successful fetch, and unavailable fetched body.

```js
// @story #1486
import assert from 'node:assert/strict';
import { test } from 'node:test';

const moduleUrl = new URL('../../../../task-tracker/lib/graph-node-authority.mjs', import.meta.url);

test('shared graph-node authority contract exists', async () => {
  const contract = await import(moduleUrl).catch(() => null);
  assert.ok(contract, 'graph-node-authority shared module must exist');
  assert.equal(typeof contract.buildGraphNodeAuthority, 'function');
  assert.equal(typeof contract.fetchParentIssueBody, 'function');
});
```

- [ ] **Step 2: Run the shared test and confirm RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/graph-node-authority.test.mjs
```

Expected: FAIL only because `graph-node-authority.mjs` and its exported contract do not exist.

- [ ] **Step 3: Implement the minimal pure mapper**

Implement normalization and parsing in one module. The core shape is:

```js
import { resolveCurrentIssueWorktreeLocation } from './issue-worktree-location.mjs';

function positiveIssue(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`graph-node-authority: ${label} must be a positive integer`);
  }
  return number;
}

function defaultMapChild(child) {
  return positiveIssue(child?.number ?? child, 'child issue');
}

export function buildGraphNodeAuthority({
  parent = null,
  children = [],
  ownBody,
  parentBody,
  mapChild = defaultMapChild,
} = {}) {
  const normalizedParent = parent == null ? null : positiveIssue(parent, 'parent issue');
  if (!Array.isArray(children)) throw new Error('graph-node-authority: children must be an array');
  if (typeof mapChild !== 'function') {
    throw new Error('graph-node-authority: mapChild must be a function');
  }
  const node = { parent: normalizedParent, children: children.map(mapChild) };
  if (typeof ownBody === 'string') {
    try {
      const own = resolveCurrentIssueWorktreeLocation(ownBody);
      if (own) {
        node.authoritativeBranch = own.worktreeBranch;
        node.authoritativeWorktree = own.worktreePath;
      }
    } catch (error) {
      return { ...node, authorityError: error.message };
    }
  }
  if (normalizedParent == null) return node;
  if (typeof parentBody !== 'string') {
    throw new Error(`graph-node-authority: parent #${normalizedParent} body unavailable`);
  }
  try {
    const parentLocation = resolveCurrentIssueWorktreeLocation(parentBody);
    return parentLocation
      ? { ...node, parentAuthoritativeBranch: parentLocation.worktreeBranch }
      : node;
  } catch (error) {
    return { ...node, parentAuthorityError: error.message };
  }
}
```

- [ ] **Step 4: Implement the injectable parent-body fetcher**

Use the existing parameterized query and dynamic default dependencies:

```js
export async function fetchParentIssueBody({ parentIssue, cfg, deps = {} } = {}) {
  if (parentIssue == null) return undefined;
  const parent = positiveIssue(parentIssue, 'parent issue');
  if (!cfg?.repo) throw new Error('graph-node-authority: cfg.repo is required');
  const github =
    deps.gql && deps.splitRepo ? deps : await import('../../gh/lib/github-projects.mjs');
  const { owner, repoName } = github.splitRepo(cfg.repo);
  const data = await github.gql(
    `query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) { issue(number: $issue) { body } }
    }`,
    { owner, repo: repoName, issue: parent }
  );
  const body = data?.repository?.issue?.body;
  if (typeof body !== 'string') {
    throw new Error(`graph-node-authority: parent #${parent} body unavailable`);
  }
  return body;
}
```

- [ ] **Step 5: Run the shared tests and confirm GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/graph-node-authority.test.mjs
```

Expected: every shared-contract case passes with no warning output.

- [ ] **Step 6: Commit the shared contract**

```bash
git add scripts/task-tracker/lib/graph-node-authority.mjs scripts/tests/unit/task-tracker/lib/graph-node-authority.test.mjs
git commit -m "[#1486] feat: add shared graph-node authority adapter"
```

### Task 2: Migrate asynchronous cut-child and merge-back consumers

**Files:**

- Modify: `scripts/task-tracker/cut-child-worktree.mjs`
- Modify: `scripts/tests/unit/task-tracker/cut-child-worktree.test.mjs`
- Modify: `scripts/task-tracker/merge-back.mjs`
- Modify: `scripts/tests/unit/task-tracker/merge-back.test.mjs`

**Interfaces:**

- Consumes: Task 1's `buildGraphNodeAuthority` and `fetchParentIssueBody`.
- Produces: unchanged `cutChildWorktree`, `buildMergeBackGraphNode`, `loadMergeBackGraph`, and `realGraphNode` behavior with no local parent-body query.

- [ ] **Step 1: Add failing migration assertions**

Add behavior tests that inject the shared parent-body dependency, prove custom authority, no-marker fallback, parser failure before Git, merge-back own authority, and two-node prefetch. Add a source assertion that both production files import the shared module and contain neither `query($owner` nor direct `resolveCurrentIssueWorktreeLocation`/`resolveCurrentIssueWorktreeBranch` calls.

```js
assert.match(source, /graph-node-authority\.mjs/);
assert.doesNotMatch(source, /query\(\$owner/);
assert.doesNotMatch(source, /resolveCurrentIssueWorktree(?:Location|Branch)\s*\(/);
```

- [ ] **Step 2: Run both suites and confirm RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/cut-child-worktree.test.mjs scripts/tests/unit/task-tracker/merge-back.test.mjs
```

Expected: new structural assertions fail on the duplicated imports/query/mapping while existing behavior cases remain green.

- [ ] **Step 3: Migrate cut-child**

Replace the inline query and parser with the shared functions. Preserve propagation explicitly:

```js
const parentBody = await fetchParentIssueBody({ parentIssue: parent, cfg, deps });
const node = buildGraphNodeAuthority({ parent, children, parentBody });
if (node.parentAuthorityError) throw new Error(node.parentAuthorityError);
return node;
```

- [ ] **Step 4: Migrate merge-back**

Keep `buildMergeBackGraphNode` as a compatibility wrapper whose only mapping work is shared delegation. Translate the shared missing-parent-body error back to the existing `merge-back: parent #N body unavailable` message if the current test contract requires it.

```js
export function buildMergeBackGraphNode(input = {}) {
  try {
    return buildGraphNodeAuthority(input);
  } catch (error) {
    if (/parent #\d+ body unavailable/.test(error.message)) {
      throw new Error(error.message.replace('graph-node-authority:', 'merge-back:'));
    }
    throw error;
  }
}
```

Use `fetchParentIssueBody` in `realGraphNode`; do not change `loadMergeBackGraph` or the Git operation sequence.

- [ ] **Step 5: Run the asynchronous consumer suites and confirm GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/cut-child-worktree.test.mjs scripts/tests/unit/task-tracker/merge-back.test.mjs scripts/tests/unit/task-tracker/lib/graph-node-authority.test.mjs
```

Expected: all cases pass and source assertions find no retained duplicate query or authority parser.

- [ ] **Step 6: Commit the asynchronous migrations**

```bash
git add scripts/task-tracker/cut-child-worktree.mjs scripts/task-tracker/merge-back.mjs scripts/tests/unit/task-tracker/cut-child-worktree.test.mjs scripts/tests/unit/task-tracker/merge-back.test.mjs
git commit -m "[#1486] refactor: share async graph authority mapping"
```

### Task 3: Migrate synchronous and raw-query consumers

**Files:**

- Modify: `scripts/task-tracker/epic-base-edit-guard.mjs`
- Modify: `scripts/tests/unit/task-tracker/epic-base-edit-guard.test.mjs`
- Modify: `scripts/task-tracker/lib/close-gates-lineage.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/close-gates-lineage.test.mjs`
- Modify: `scripts/task-tracker/lib/decomposition-delivery-readiness.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/decomposition-delivery-readiness.test.mjs`

**Interfaces:**

- Consumes: Task 1's pure `buildGraphNodeAuthority` only.
- Produces: unchanged synchronous hook decisions, close-gate rich child nodes, and decomposition `branch-authority:` blocker behavior.

- [ ] **Step 1: Add failing per-consumer source and behavior assertions**

For each production file, assert a shared-module import and no direct worktree-location parser invocation. Add or retain explicit behavior cases for malformed/ambiguous markers. For close gates, assert rich child equality:

```js
assert.deepEqual(node.children, [{ number: 910, title: 'Child', closeReason: 'COMPLETED' }]);
```

For decomposition readiness, assert the exact prefix:

```js
assert.ok(result.blockers.some((value) => value.startsWith('branch-authority: ')));
```

- [ ] **Step 2: Run the three suites and confirm RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/epic-base-edit-guard.test.mjs scripts/tests/unit/task-tracker/lib/close-gates-lineage.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-delivery-readiness.test.mjs
```

Expected: structural assertions fail while existing behavior characterization remains green.

- [ ] **Step 3: Migrate the synchronous edit guard**

Keep the existing synchronous `gh api graphql` transport. Replace its inline result object with:

```js
const result = buildGraphNodeAuthority({
  parent: node.parent?.number ?? null,
  children: node.subIssues?.nodes ?? [],
  ownBody: node.body,
  parentBody: node.parent?.body,
});
```

Do not change `computeEvaluation`; it already turns `authorityError` or `parentAuthorityError` into the existing unresolved decision.

- [ ] **Step 4: Migrate close-gate mapping**

Delegate `closeGraphNodeFromQuery` to the shared mapper with an injected rich-child mapper:

```js
return buildGraphNodeAuthority({
  parent: node.parent?.number ?? null,
  children: node.subIssues?.nodes ?? [],
  parentBody: node.parent?.body,
  mapChild: (child) => ({
    number: Number(child.number),
    title: child.title || '',
    closeReason: child.stateReason || null,
  }),
});
```

- [ ] **Step 5: Migrate decomposition readiness**

Build the representative child node through the shared mapper and preserve the current prefix:

```js
const node = buildGraphNodeAuthority({
  parent: Number(issueNumber),
  children: [],
  parentBody: epicBody || '',
});
if (node.parentAuthorityError) throw new Error(node.parentAuthorityError);
const lineage = resolveEpicLineage(representative, { deps: { graph: () => node } });
```

- [ ] **Step 6: Run the synchronous/raw suites and confirm GREEN**

Run the Step 2 command again. Expected: every behavioral and structural assertion passes.

- [ ] **Step 7: Commit the remaining migrations**

```bash
git add scripts/task-tracker/epic-base-edit-guard.mjs scripts/task-tracker/lib/close-gates-lineage.mjs scripts/task-tracker/lib/decomposition-delivery-readiness.mjs scripts/tests/unit/task-tracker/epic-base-edit-guard.test.mjs scripts/tests/unit/task-tracker/lib/close-gates-lineage.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-delivery-readiness.test.mjs
git commit -m "[#1486] refactor: unify graph authority consumers"
```

### Task 4: Prove structural absence and governed completion

**Files:**

- Modify: `scripts/tests/unit/task-tracker/lib/graph-node-authority.test.mjs`
- Modify only if measured discovery changes: `scripts/task-tracker/test-impact-manifest.json`

**Interfaces:**

- Consumes: all migrated production files and existing focused suites.
- Produces: permanent duplication guard plus exact-SHA AITM evidence.

- [ ] **Step 1: Add the final five-site structural scan**

Read the five production files and assert all import the shared module, only `epic-base-edit-guard.mjs` retains a GraphQL query for synchronous relationship discovery, and no file directly calls a worktree-location authority parser.

```js
const consumers = [
  'scripts/task-tracker/cut-child-worktree.mjs',
  'scripts/task-tracker/merge-back.mjs',
  'scripts/task-tracker/epic-base-edit-guard.mjs',
  'scripts/task-tracker/lib/close-gates-lineage.mjs',
  'scripts/task-tracker/lib/decomposition-delivery-readiness.mjs',
];
for (const file of consumers) {
  const source = readFileSync(file, 'utf8');
  assert.match(source, /graph-node-authority\.mjs/, file);
  assert.doesNotMatch(source, /resolveCurrentIssueWorktree(?:Location|Branch)\s*\(/, file);
}
```

- [ ] **Step 2: Run the issue-focused command**

```bash
node --test scripts/tests/unit/task-tracker/merge-back.test.mjs scripts/tests/unit/task-tracker/cut-child-worktree.test.mjs scripts/tests/unit/task-tracker/epic-base-edit-guard.test.mjs scripts/tests/unit/task-tracker/lib/close-gates-lineage.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-delivery-readiness.test.mjs scripts/tests/unit/task-tracker/lib/resolve-epic-lineage.test.mjs
```

Expected: all consumer and lineage tests pass.

- [ ] **Step 3: Run the shared command**

```bash
node --test scripts/tests/unit/task-tracker/lib/graph-node-authority.test.mjs
```

Expected: all shared mapper, fetcher, and structural tests pass.

- [ ] **Step 4: Run formatting and lint before full tests**

```bash
npm run format:check
npm run lint
```

Expected: both commands exit 0 without changing files.

- [ ] **Step 5: Run fast and slow repository verification**

```bash
npm test
npm run test:slow
```

Expected: every discovered fast and slow test file passes.

- [ ] **Step 6: Record final commit and audit trail**

```bash
git status --short
git log --oneline -1
npx aitm commit-trace 1486
```

Expected: clean worktree, `[#1486]` latest commit, and updated commit-trail comment.

- [ ] **Step 7: Run governed lifecycle gates**

Run the four AC verifiers at the final implementation SHA, then:

```bash
TT_FULL_AUTO=1 npx aitm test 1486
TT_FULL_AUTO=1 npx aitm review 1486
TT_FULL_AUTO=1 npx aitm approve 1486
```

Expected: exact-SHA Test receipt, Review state, Agent Review Passed, and visible Full-Auto final-review audit.

- [ ] **Step 8: Deliver and close**

Push the reviewed branch, open a PR to `trunk`, wait for hosted CI and CodeQL, run `TT_FULL_AUTO=1 npx aitm deliver 1486`, execute only its exact sanctioned provider-action envelope, rerun delivery for a live receipt, then run `TT_FULL_AUTO=1 npx aitm close 1486`.

Expected: merged PR, live-verified delivery receipt, issue CLOSED/Done, no active #1486 binding, and clean retained worktree.
