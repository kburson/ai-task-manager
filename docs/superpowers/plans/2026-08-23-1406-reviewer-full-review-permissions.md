# SHA-Bound Co-Review Orchestration Implementation Plan

<!-- cspell:ignore ACDMRTUXB -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace co-review's same-user capability sandbox with a one-worktree,
SHA-bound orchestration and evidence protocol that permits deep review under
ordinary repository safeguards.

**Architecture:** Protocol authority moves to canonical caller/runtime/worktree
identity, exact commits, clean tracked state, and single-artifact commit deltas.
The co-review-specific Bash and direct-write policy is deleted while ordinary
guards retain their existing decisions; generated handoffs and operator guides
describe cooperative roles and bounded polling. Real-Git, memory-boundary,
installed-hook-chain, and full A-to-B relay tests prove the resulting boundary.

**Tech Stack:** Node.js ES modules, `node:test`, Git subprocesses through
`execFileSync`, JSONL protocol state, Claude/Codex/Grok installed hook fixtures,
Markdown documentation, markdownlint-cli2, CSpell, Prettier, ESLint.

**Reference specification:**
`docs/superpowers/specs/2026-08-23-1406-reviewer-full-review-permissions-design.md`
at commit `67903c3c`.

## Global Constraints

- Co-review is an orchestration and evidence protocol, not a same-user
  capability sandbox.
- Both participants use one canonical physical worktree; require
  `callerRoot === runtimeRoot === state.repositoryRoot` for every protocol
  command, including initialization.
- Each handoff requires clean staged and unstaged tracked state.
- This remains a single-authoritative-artifact protocol. From
  `state.artifact.commit` to the proposed owner commit, only
  `state.artifact.path` may change.
- An imported review is valid only when `review-of === HEAD` at initialization.
- Protocol runtime evidence remains ignored and untracked. Re-run ignore-status
  validation at both owner and reviewer handoffs.
- Reviewer `HEAD` equality continues through the existing `assertIntegrity()`
  path; do not duplicate that mechanism.
- Claims establish role/provenance only. They must not alter Bash, Edit, Write,
  NotebookEdit, or apply_patch outcomes.
- Preserve ordinary dangerous-command, path-scope, active-task worktree,
  GitHub, AITM-path, commit-ownership, installed-guard, and activity-state
  behavior.
- Preserve protocol and terminal archive schemas.
- Exit 4 means durable acceptance with archive publication pending. Never
  repeat the terminal handoff; use the exact printed finalize retry.
- Terminal archive publication is post-acceptance and outside pre-handoff
  tracked-state checks.
- Do not hot-patch or reuse the active #1381 constrained runtime.
- Record deferred convergence concerns only in #1381; do not create one
  successor defect per guard failure.
- Use test-driven development: observe each focused test fail for the intended
  reason before implementing its production change.

## Plan-Review Exit Gate

This gate runs after this plan receives independent review acceptance and
before `/task plan-approve #1406`; it is not an implementation task.

- [ ] Record the independently accepted plan commit. Pause #1406, then return
      to #1381's recorded worktree
      (`.worktrees/939-full-auto-merge`, branch
      `codex/1381-governed-delivery-convergence-spec`) without touching its
      ignored constrained co-review runtime.
- [ ] Resume #1381 only long enough to update its body with the governed
      `issue-body` verb and ignored operation file
      `.tmp/gh/1381-convergence-operation.json`. Use one or more
      `aitm.issue-body-operation/v1` named-section replacements
      against the fresh body version. Add the accepted spec commit, accepted
      plan commit, the canonical same-worktree A-to-B acceptance story, the
      #1365/#1369 disposition, and every item under the specification's
      `Deferred Convergence Concerns` section. Read the persisted body back,
      verify the new body version and exact inserted text, then pause #1381.
- [ ] Confirm #1381 remains the sole convergence and end-to-end acceptance
      story; do not create individual successor issues for #1365, #1369, or
      observed guard failures.
- [ ] Return to this #1406 worktree and resume #1406. Its current issue body
      still describes the superseded Bash-only/direct-write-confinement model.
      Replace its `User Story`, `Scope`, `Fix Direction`, `Out of Scope`,
      `Plan Metadata`, `Acceptance Criteria`, and `Verification Commands`
      sections through governed `/task issue-body` operations so they match
      the accepted specification and plan. Preserve every AITM marker and
      lifecycle section; read back and verify each persisted body version.
- [ ] The hydrated #1406 acceptance criteria must cover: normal tool outcomes
      independent of a live claim; one canonical physical worktree; clean
      tracked state at both handoffs; artifact-only A-to-B commit scope;
      exact-HEAD import; immutable-SHA stale-decision refusal; ordinary-guard
      preservation; installed-hook capability parity; same-worktree
      A-to-B relay; idempotent terminal acceptance and exit-4 finalization;
      operator guidance; and full quality gates.
- [ ] Declare runnable verifier commands for every demonstrable #1406
      criterion, including the focused protocol/guard tests, installed-chain
      integration, documentation checks, fast suite, slow suite, lint, and
      formatting. Remove commands for tests deleted by this plan.
- [ ] Invoke `/task plan-approve #1406` only after both issue-body updates are
      durable and independently checked. Do not implement, push, deliver,
      merge, promote, approve, or close as part of this gate.

---

## File Map

### New files

- `scripts/task-tracker/lib/apply-patch-targets.mjs` — ordinary apply_patch
  multi-target parser relocated out of the retired co-review module.
- `scripts/tests/unit/task-tracker/lib/apply-patch-targets.test.mjs` — focused
  parser behavior and malformed-patch failures.
- `scripts/tests/integration/task-tracker/lib/co-review-reviewer-capability.test.mjs`
  — complete installed-hook-chain and owner/reviewer capability regression.
- Corresponding JSON membership records under
  `scripts/tests/fixtures/test-corpus-post-snapshot/**`.

### Production files modified

- `scripts/review/lib/runtime-root.mjs`
- `scripts/review/lib/repository-boundary.mjs`
- `scripts/review/lib/protocol.mjs`
- `scripts/review/lib/index.mjs`
- `scripts/review/lib/start.mjs`
- `scripts/task-tracker/activity-guard.mjs`
- `scripts/task-tracker/bash-guard.mjs`
- `scripts/task-tracker/source-edit-gate.mjs`
- `scripts/task-tracker/test-impact-manifest.json`
- `docs/guides/github-native-coordination.md`
- `docs/guides/grok-provider.md`

### Production files deleted

- `scripts/task-tracker/lib/co-review-write-policy.mjs`
- `scripts/task-tracker/lib/mutation-targets.mjs`
- `scripts/task-tracker/lib/reviewer-co-review-command.mjs`

### Existing tests and fixtures modified or deleted

- `scripts/tests/slow/review/co-review-boundaries.test.mjs`
- `scripts/tests/fixtures/co-review-memory-repository.mjs`
- `scripts/tests/fixtures/co-review-handoff-cases.mjs`
- `scripts/tests/fixtures/co-review-start-cases.mjs`
- `scripts/tests/unit/review/co-review-fixture-cost.test.mjs`
- `scripts/tests/unit/review/co-review-index.test.mjs`
- `scripts/tests/unit/review/co-review.test.mjs`
- `scripts/tests/unit/task-tracker/lib/source-edit-gate.test.mjs`
- `scripts/tests/slow/task-tracker/lib/activity-guard.test.mjs`
- `scripts/tests/unit/meta/package-test-corpus.test.mjs`
- `scripts/tests/unit/meta/test-corpus-membership.test.mjs`
- `scripts/tests/unit/providers/coverage-provider-adapter.test.mjs`
- Delete
  `scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs`.
- Delete
  `scripts/tests/unit/task-tracker/core/reviewer-co-review-command-boundary.test.mjs`.
- Remove their post-snapshot membership records and add records for new tests.

---

### Task 1: Enforce One Physical Worktree for Every Protocol Command

**Files:**

- Modify: `scripts/review/lib/runtime-root.mjs`
- Modify: `scripts/review/lib/repository-boundary.mjs`
- Modify: `scripts/review/lib/protocol.mjs`
- Modify: `scripts/tests/slow/review/co-review-boundaries.test.mjs`
- Modify: `scripts/tests/fixtures/co-review-handoff-cases.mjs`

**Interfaces:**

- Consumes: `repository.repositoryRoot(candidate)` and `protocolRoot(cwd, dir,
repository)`.
- Produces: `resolveRuntimeRoot({cwd, dir, repository}) -> {callerRoot, root}`
  only when both roots are identical; otherwise throws
  `RuntimeRootError('repository-identity', detail)`.
- Produces: imported review initialization refusal unless
  `importedCommit === repository.identity(root).head`.

- [ ] **Step 1: Replace the linked-worktree success test with failing
      one-worktree cases**

In `scripts/tests/slow/review/co-review-boundaries.test.mjs`, replace
`absolute runtime keeps linked-worktree integrity and reviewer handoff from main
cwd` with cases covering:

```js
test('every command refuses a sibling linked-worktree runtime', () => {
  const main = repositoryFixture();
  const linked = path.join(main.root, '.worktrees', 'reviewer');
  mkdirSync(path.dirname(linked), { recursive: true });
  git(main.root, 'worktree', 'add', '-b', 'reviewer-branch', linked);
  initializeProtocol({
    cwd: linked,
    dir: '.tmp/review',
    artifact: main.artifact,
    owner: 'owner-agent',
    reviewer: 'reviewer-agent',
    maxReviewTurns: 2,
  });

  assert.throws(
    () => statusProtocol({ cwd: main.root, dir: path.join(linked, '.tmp/review') }),
    /co-review:repository-identity/
  );
  assert.throws(
    () =>
      claimTurn({ cwd: main.root, dir: path.join(linked, '.tmp/review'), actor: 'owner-agent' }),
    /co-review:repository-identity/
  );
});

test('initialization refuses a nested worktree runtime before the folder exists', () => {
  const main = repositoryFixture();
  const linked = path.join(main.root, '.worktrees', 'nested-reviewer');
  mkdirSync(path.dirname(linked), { recursive: true });
  git(main.root, 'worktree', 'add', '-b', 'nested-reviewer-branch', linked);
  const runtime = path.join(linked, '.tmp', 'not-created');

  assert.throws(
    () =>
      initializeProtocol({
        cwd: main.root,
        dir: runtime,
        artifact: main.artifact,
        owner: 'owner-agent',
        reviewer: 'reviewer-agent',
        maxReviewTurns: 2,
      }),
    /co-review:repository-identity/
  );
  assert.equal(existsSync(runtime), false);
});
```

Add a table-driven foreign-runtime assertion for every protocol command path:
`init`, `start`, `status`, `claim`, `wait`, both handoffs, `set-max-turns`,
`supplement`, `continue`, human-good-enough/no-action finalization, archive
finalization, and direct `validatedArchiveSnapshot()`. Build only the minimum
valid lifecycle fixture needed to reach each command; each must refuse with
`co-review:repository-identity` before writing protocol or archive bytes.

- [ ] **Step 2: Add the imported-review strict-ancestor regression**

Extend `scripts/tests/fixtures/co-review-handoff-cases.mjs` with a real or memory
fixture that creates commit A, advances `HEAD` to B without changing the
artifact bytes, and then asserts:

```js
assert.throws(
  () =>
    api.initializeProtocol({
      ...options,
      importReview: options.importReview,
      reviewOf: commitA,
    }),
  /co-review:import-review-head-mismatch/
);
```

Also retain a positive exact-HEAD import assertion.

- [ ] **Step 3: Run the focused tests and confirm the intended failures**

Run:

```bash
node --test \
  scripts/tests/slow/review/co-review-boundaries.test.mjs \
  scripts/tests/unit/review/co-review.test.mjs
```

Expected: FAIL because sibling/nested runtime calls still succeed and ancestor
imports remain accepted.

- [ ] **Step 4: Implement nearest-existing-ancestor root resolution**

In `scripts/review/lib/runtime-root.mjs`, replace common-directory acceptance
with a resolver shaped as follows:

```js
import { existsSync, realpathSync } from 'node:fs';

function nearestExistingAncestor(candidate) {
  let current = path.resolve(candidate);
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return current;
}

function runtimeRepositoryRoot(repository, runtimePath, callerRoot) {
  try {
    return canonicalRepositoryRoot(repository, nearestExistingAncestor(runtimePath));
  } catch (error) {
    const relative = path.relative(callerRoot, runtimePath);
    const lexicallyInside =
      relative &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative);
    if (lexicallyInside && error instanceof RuntimeRootError && error.code === 'not-a-repository') {
      return callerRoot;
    }
    throw error;
  }
}

export function resolveRuntimeRoot({ cwd = process.cwd(), dir, repository }) {
  const callerRoot = canonicalRepositoryRoot(repository, cwd);
  const runtimePath = path.resolve(callerRoot, String(dir || ''));
  const root = runtimeRepositoryRoot(repository, runtimePath, callerRoot);
  if (root !== callerRoot) {
    throw new RuntimeRootError('repository-identity', `caller=${callerRoot}; runtime=${root}`);
  }
  return { callerRoot, root };
}
```

Delete the local `commonDirectory()` helper. Remove
`commonDirectory()` from `REAL_REPOSITORY_BOUNDARY` and its boundary tests.
Retain the existing symlink-escape test: a lexically contained runtime whose
physical target escapes the repository must still reach `protocolPaths()` and
fail `path-outside-repository`.

- [ ] **Step 5: Route initialization through the same boundary and reject
      ancestor imports**

In `initializeProtocol()`:

```js
const root = protocolRoot(cwd, dir, repository);
```

After resolving `importedCommit`, compare it with the current identity:

```js
const identity = repositoryCall('git', 'repository identity', () => repository.identity(root));
if (importedCommit !== identity.head) {
  fail('import-review-head-mismatch', `${importedCommit}; HEAD=${identity.head}`);
}
```

Keep `assertCommitArtifact()` after the exact-HEAD check for blob validation.

- [ ] **Step 6: Run focused boundary and protocol tests**

Run:

```bash
node --test \
  scripts/tests/slow/review/co-review-boundaries.test.mjs \
  scripts/tests/unit/review/co-review.test.mjs
```

Expected: PASS; both foreign-worktree shapes fail before mutation and exact-HEAD
imports pass.

- [ ] **Step 7: Commit the protocol-root boundary**

```bash
git add \
  scripts/review/lib/runtime-root.mjs \
  scripts/review/lib/repository-boundary.mjs \
  scripts/review/lib/protocol.mjs \
  scripts/tests/slow/review/co-review-boundaries.test.mjs \
  scripts/tests/fixtures/co-review-handoff-cases.mjs
git commit -m "[#1406] Enforce one-worktree co-review roots"
```

---

### Task 2: Enforce Clean Tracked State and Single-Artifact Deltas

**Files:**

- Modify: `scripts/review/lib/repository-boundary.mjs`
- Modify: `scripts/review/lib/protocol.mjs`
- Modify: `scripts/tests/fixtures/co-review-memory-repository.mjs`
- Modify: `scripts/tests/unit/review/co-review-fixture-cost.test.mjs`
- Modify: `scripts/tests/fixtures/co-review-handoff-cases.mjs`
- Modify: `scripts/tests/slow/review/co-review-boundaries.test.mjs`

**Interfaces:**

- Produces: `repository.trackedChanges(root) -> string[]` of staged or unstaged
  tracked paths; ignores untracked files.
- Produces: `repository.changedPathsBetween(root, from, to) -> string[]` of
  committed paths changed between two commits.
- Consumes: existing `state.artifact.commit`, proposed owner commit, and
  `state.artifact.path`.

- [ ] **Step 1: Add failing real-boundary and memory-boundary contract tests**

Extend the boundary and fixture-cost tests with exact interface assertions:

```js
assert.deepEqual(REAL_REPOSITORY_BOUNDARY.trackedChanges(root), []);
writeFileSync(path.join(root, 'docs/artifact.md'), '# Dirty tracked artifact\n');
assert.deepEqual(REAL_REPOSITORY_BOUNDARY.trackedChanges(root), ['docs/artifact.md']);

const secondCommit = commitArtifact(root, '# Artifact\n\nRevision two.\n');
assert.deepEqual(REAL_REPOSITORY_BOUNDARY.changedPathsBetween(root, initialCommit, secondCommit), [
  'docs/artifact.md',
]);
```

For the memory fixture, assert the same results and preserve:

```js
assert.deepEqual(fixture.processCalls, { git: 0, nodeCli: 0 });
```

- [ ] **Step 2: Add failing handoff regressions**

Add table-driven cases that prove both owner and reviewer handoffs refuse:

```js
[
  ['staged tracked drift', stageTrackedFile],
  ['unstaged tracked drift', editTrackedFile],
  ['runtime force-added to index', forceAddRuntime],
];
```

Expected diagnostic patterns:

```js
/co-review:tracked-worktree-dirty/
/co-review:runtime-tracked/
```

Use a tracked non-artifact path such as `README.md` for the staged and unstaged
cases so the new repository-wide cleanliness check, not the existing
reviewer-artifact digest check, is the asserted authority.

Add an owner A-to-B case where B changes `docs/artifact.md` and `README.md` and
expect:

```js
/co-review:artifact-change-scope:README\.md/;
```

Add the positive case where only `docs/artifact.md` changes and ignored runtime
files exist.

- [ ] **Step 3: Run focused tests and confirm they fail before implementation**

Run:

```bash
node --test \
  scripts/tests/unit/review/co-review-fixture-cost.test.mjs \
  scripts/tests/unit/review/co-review.test.mjs \
  scripts/tests/slow/review/co-review-boundaries.test.mjs
```

Expected: FAIL because the repository interfaces and handoff checks do not
exist.

- [ ] **Step 4: Add the real repository operations**

In `createRealRepositoryBoundary()`:

```js
trackedChanges(root) {
  const unstaged = run(root, ['diff', '--name-only', '--diff-filter=ACDMRTUXB', '--']);
  const staged = run(root, ['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB', '--']);
  return [...new Set(`${unstaged}\n${staged}`.split('\n').filter(Boolean))].sort();
},

changedPathsBetween(root, from, to) {
  const output = run(root, ['diff', '--name-only', '--diff-filter=ACDMRTUXB', from, to, '--']);
  return output.split('\n').filter(Boolean).sort();
},
```

The staged and unstaged name-only union deliberately ignores untracked files
and returns normalized Git paths for modifications, additions, deletions,
renames, copies, type changes, and conflicts.

- [ ] **Step 5: Add matching zero-subprocess memory operations**

Track committed snapshots, index, and worktree state already held by
`createMemoryRepository()`. Implement:

```js
trackedChanges() {
  return sortedTrackedDifferences(worktree, index, commits.get(head));
},

changedPathsBetween(_root, from, to) {
  return sortedSnapshotDifferences(commits.get(from), commits.get(to));
},
```

Add a fixture helper for committing an additional tracked path so the
artifact-only negative case does not use real Git.

- [ ] **Step 6: Enforce the checks at owner and reviewer handoff**

Add focused helpers in `protocol.mjs`:

```js
function assertCleanTrackedState(root, repository) {
  const changed = repositoryCall('git', 'tracked worktree state', () =>
    repository.trackedChanges(root)
  );
  if (changed.length > 0) fail('tracked-worktree-dirty', changed.join(', '));
}

function assertArtifactOnlyDelta(root, state, commit, repository) {
  const changed = repositoryCall('git', 'artifact change scope', () =>
    repository.changedPathsBetween(root, state.artifact.commit, commit)
  );
  const outside = changed.filter((candidate) => candidate !== state.artifact.path);
  if (outside.length > 0) fail('artifact-change-scope', outside.join(', '));
}
```

Inside both handoff mutexes, after `assertIntegrity()` and before reading new
exchange evidence:

```js
assertIgnored(root, paths, repository);
assertCleanTrackedState(root, repository);
```

In owner handoff, call `assertArtifactOnlyDelta()` after resolving the proposed
commit but before state mutation. Do not run these checks during terminal
archive publication.

- [ ] **Step 7: Run the focused boundary and handoff tests**

Run the Step 3 command again.

Expected: PASS, including ignored runtime evidence, dirty tracked-state
refusals, single-artifact success, and the zero-subprocess fixture assertion.

- [ ] **Step 8: Commit repository cleanliness authority**

```bash
git add \
  scripts/review/lib/repository-boundary.mjs \
  scripts/review/lib/protocol.mjs \
  scripts/tests/fixtures/co-review-memory-repository.mjs \
  scripts/tests/unit/review/co-review-fixture-cost.test.mjs \
  scripts/tests/fixtures/co-review-handoff-cases.mjs \
  scripts/tests/slow/review/co-review-boundaries.test.mjs
git commit -m "[#1406] Enforce clean single-artifact handoffs"
```

---

### Task 3: Retire Co-Review Capability Policing Without Losing Ordinary Guards

**Files:**

- Create: `scripts/task-tracker/lib/apply-patch-targets.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/apply-patch-targets.test.mjs`
- Modify: `scripts/task-tracker/activity-guard.mjs`
- Modify: `scripts/task-tracker/source-edit-gate.mjs`
- Modify: `scripts/task-tracker/bash-guard.mjs`
- Modify: `scripts/review/lib/index.mjs`
- Modify: `scripts/tests/unit/review/co-review-index.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/source-edit-gate.test.mjs`
- Modify: `scripts/tests/slow/task-tracker/lib/activity-guard.test.mjs`
- Delete: `scripts/task-tracker/lib/co-review-write-policy.mjs`
- Delete: `scripts/task-tracker/lib/mutation-targets.mjs`
- Delete: `scripts/task-tracker/lib/reviewer-co-review-command.mjs`
- Delete: `scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs`
- Delete:
  `scripts/tests/unit/task-tracker/core/reviewer-co-review-command-boundary.test.mjs`

**Interfaces:**

- Produces: `extractApplyPatchTargets(patchText) -> string[]` and
  `MutationParseError` in the new focused module.
- Removes: `extractBashWriteTargets`, `evaluateCoReviewWrite`,
  `classifyReviewerCoReviewCommand`, public `resolveReviewerGrant`, and public
  `hasLiveReviewerClaim`.
- Preserves: private claim liveness reached through
  `allowsCoReviewOccupancy()`.

- [ ] **Step 1: Split parser tests into their future focused file**

Move only the apply_patch cases from
`co-review-write-policy.test.mjs` into the new test:

```js
import {
  extractApplyPatchTargets,
  MutationParseError,
} from '../../../../task-tracker/lib/apply-patch-targets.mjs';

test('extracts every apply_patch destination', () => {
  assert.deepEqual(extractApplyPatchTargets(patchText), [
    'docs/old.md',
    'docs/new.md',
    'src/create.mjs',
    'src/delete.mjs',
  ]);
});

test('rejects malformed apply_patch input or input with no destination', () => {
  for (const input of malformedPatches) {
    assert.throws(() => extractApplyPatchTargets(input), MutationParseError);
  }
});
```

- [ ] **Step 2: Add claim-invariance regression cases before deletion**

In the activity/source-edit tests, run representative Bash, Edit, Write,
NotebookEdit, and apply_patch payloads with no reviewer claim and with a live
claim. Compare the complete hook result objects:

```js
assert.deepEqual(withClaim, withoutClaim);
```

Include ordinary positive and negative cases: documentation edit, `.tmp/**`
review-file write, source write while unbound, malformed apply_patch, and
installed-guard self-edit refusal.

- [ ] **Step 3: Run the focused tests and record red behavior**

Run:

```bash
node --test \
  scripts/tests/unit/task-tracker/lib/apply-patch-targets.test.mjs \
  scripts/tests/unit/task-tracker/lib/source-edit-gate.test.mjs \
  scripts/tests/slow/task-tracker/lib/activity-guard.test.mjs \
  scripts/tests/unit/review/co-review-index.test.mjs
```

Expected: FAIL because the new parser module is absent and live claims still
change tool outcomes.

- [ ] **Step 4: Relocate the apply_patch parser**

Move `MutationParseError` and `extractApplyPatchTargets()` byte-for-byte into
`apply-patch-targets.mjs`. Update `activity-guard.mjs` and
`source-edit-gate.mjs` imports. Preserve apply_patch targets as ordinary
`filePaths` for normal activity and source-edit classification.

- [ ] **Step 5: Remove claim-aware decisions from all installed guards**

From `activity-guard.mjs`, delete Bash target parsing, provider/session
resolution, `evaluateCoReviewWrite()`, and its `deny`/`allow` branches. Do not
delete apply_patch target parsing or the installed-guard self-protection order.

From `source-edit-gate.mjs`, delete provider/session resolution,
`evaluateCoReviewWrite()`, and dependency-injection keys used only by that
policy. Continue into ordinary chore-mode, bound-issue, lifecycle, and
source-edit decisions.

From `bash-guard.mjs`, delete imports and calls for Bash target extraction,
reviewer command classification, provider/session resolution, and co-review
write evaluation. Do not add a co-review replacement classifier, early exit, or
path-scope expansion.

- [ ] **Step 6: Delete retired modules and narrow review-index exports**

Delete the three policy/classifier modules and two obsolete focused test files.
Remove public `resolveReviewerGrant()` and `hasLiveReviewerClaim()` from
`scripts/review/lib/index.mjs`. Remove their unit tests while retaining the
`allowsCoReviewOccupancy()` cases that prove private liveness still works.

- [ ] **Step 7: Run focused guard and index tests**

Run the Step 3 command plus:

```bash
node --test \
  scripts/tests/unit/task-tracker/core/bash-guard-fail-closed.test.mjs \
  scripts/tests/unit/task-tracker/core/bash-guard-tmp-contract.test.mjs \
  scripts/tests/unit/task-tracker/lib/bash-guard-worktree-binding.test.mjs
```

Expected: PASS. No production guard contains
`reviewer mutation destinations are incomplete or ambiguous`, and ordinary
negative cases remain refused.

- [ ] **Step 8: Commit capability-policy retirement**

```bash
git add -A -- \
  scripts/task-tracker/activity-guard.mjs \
  scripts/task-tracker/bash-guard.mjs \
  scripts/task-tracker/source-edit-gate.mjs \
  scripts/task-tracker/lib/apply-patch-targets.mjs \
  scripts/task-tracker/lib/co-review-write-policy.mjs \
  scripts/task-tracker/lib/mutation-targets.mjs \
  scripts/task-tracker/lib/reviewer-co-review-command.mjs \
  scripts/review/lib/index.mjs \
  scripts/tests/unit/review/co-review-index.test.mjs \
  scripts/tests/unit/task-tracker/lib/apply-patch-targets.test.mjs \
  scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs \
  scripts/tests/unit/task-tracker/lib/source-edit-gate.test.mjs \
  scripts/tests/unit/task-tracker/core/reviewer-co-review-command-boundary.test.mjs \
  scripts/tests/slow/task-tracker/lib/activity-guard.test.mjs
git commit -m "[#1406] Retire co-review capability policing"
```

Before committing, inspect `git diff --cached --name-status` and verify that
`git add -A` captured only the explicit create/modify/delete list above.

---

### Task 4: Update Generated Relay Instructions and Operator Guidance

**Files:**

- Modify: `scripts/review/lib/start.mjs`
- Modify: `scripts/tests/fixtures/co-review-start-cases.mjs`
- Modify: `scripts/tests/unit/review/co-review.test.mjs`
- Modify: `docs/guides/github-native-coordination.md`
- Modify: `docs/guides/grok-provider.md`
- Modify: `scripts/tests/unit/providers/coverage-provider-adapter.test.mjs`

**Interfaces:**

- Consumes: existing generated canonical worktree/runtime paths,
  `waitCycles`, `waitIntervalSeconds`, and exit-code guidance.
- Produces: owner/reviewer handoffs that describe normal capabilities,
  cooperative role restrictions, one-worktree authority, direct runtime-file
  relay, and exit 4 finalization.

- [ ] **Step 1: Replace stale handoff expectations with failing accepted-model
      expectations**

In `co-review-start-cases.mjs`, remove the assertion matching
`narrowly authorizes...Arbitrary Bash remains blocked` and add:

```js
assert.match(reviewer, /normal repository inspection, test, build, and Bash capabilities/i);
assert.match(reviewer, /same canonical physical worktree/i);
assert.match(reviewer, /never edit or commit the authoritative artifact/i);
assert.match(reviewer, /write.*review.*Edit.*Write.*apply_patch/is);
assert.match(reviewer, /start.*turn timer immediately/i);
assert.match(reviewer, /without an unrelated bound task/i);
assert.match(reviewer, /routing.*does not.*human.*approval/is);
assert.match(reviewer, /exit 4.*acceptance is already durable/is);
assert.doesNotMatch(reviewer, /Arbitrary Bash remains blocked/i);
```

Add equivalent owner assertions for direct peer-evidence reads, canonical
`HEAD` and clean tracked-state checks, artifact-only inter-round changes,
bounded repeated polling, immediate turn-timer startup, and the distinction
between operational routing and human semantic approval. Retain assertions for
exact status/claim/wait/handoff commands, authoritative evidence paths, and
remaining turn/wait budgets.

- [ ] **Step 2: Update documentation coverage tests first**

In `coverage-provider-adapter.test.mjs`, delete required-file assertions for the
retired modules and replace `/pending review artifact/i` with assertions for:

```js
assert.match(coordination, /one canonical physical worktree/i);
assert.match(coordination, /SHA-bound|immutable.*commit/is);
assert.match(coordination, /normal repository.*capabilities/is);
assert.doesNotMatch(coordination, /pending review artifact/i);
```

- [ ] **Step 3: Run the focused tests and confirm stale guidance fails**

Run:

```bash
node --test \
  scripts/tests/unit/review/co-review.test.mjs \
  scripts/tests/unit/providers/coverage-provider-adapter.test.mjs
```

Expected: FAIL on the old restricted reviewer prose and pending-artifact docs.

- [ ] **Step 4: Rewrite generated reviewer and owner guidance**

In `renderReviewerHandoff()`, replace the capability paragraph with text that
states:

```text
Run every protocol and repository command from the canonical worktree above.
The co-review claim establishes reviewer provenance; it does not grant or
remove ordinary tool capabilities. Use normal repository inspection, tests,
builds, and Bash under the installed ordinary guards. Preserve role separation:
never edit or commit the authoritative artifact or prior evidence. Create only
the new review file under the ignored runtime with a direct file-writing tool.
```

Keep the current bounded wait loop, integrity settled-read rule, and exit 4
instructions. Require the reviewer to begin without an unrelated bound task.
Update owner guidance to read the exact peer artifact path from structured
status rather than expecting human-copied content. State that starting,
routing, or continuing a session is not human semantic approval and does not
create an approval marker.

- [ ] **Step 5: Update both operator guides**

Replace exact-pending-review-artifact capability language with the same four
facts: normal capabilities, one canonical worktree, cooperative role
separation, and immutable SHA/blob/digest authority. Add that session routing,
continuation, and automated handoffs do not create human semantic approval.
Preserve unrelated Grok installation/session guidance and GitHub occupancy
guidance.

- [ ] **Step 6: Run focused handoff and documentation tests**

Run the Step 3 command, then:

```bash
npx markdownlint-cli2 --no-globs \
  :docs/guides/github-native-coordination.md \
  :docs/guides/grok-provider.md
npx cspell --no-progress \
  docs/guides/github-native-coordination.md \
  docs/guides/grok-provider.md
```

Expected: all checks PASS and no current operator guidance describes claim-based
tool confinement.

- [ ] **Step 7: Commit generated and operator guidance**

```bash
git add \
  scripts/review/lib/start.mjs \
  scripts/tests/fixtures/co-review-start-cases.mjs \
  scripts/tests/unit/review/co-review.test.mjs \
  docs/guides/github-native-coordination.md \
  docs/guides/grok-provider.md \
  scripts/tests/unit/providers/coverage-provider-adapter.test.mjs
git commit -m "[#1406] Document SHA-bound co-review roles"
```

---

### Task 5: Prove the Installed Hook Chain and Full A-to-B Relay

**Files:**

- Create:
  `scripts/tests/integration/task-tracker/lib/co-review-reviewer-capability.test.mjs`
- Modify: `scripts/tests/fixtures/co-review-e2e-cases.mjs`
- Modify: `scripts/tests/unit/review/co-review-finalization.test.mjs`
- Verify:
  `scripts/tests/integration/task-tracker/verbs/github-record-approval-close-gates.test.mjs`

**Interfaces:**

- Consumes: installed Claude/Grok/Codex guard commands, co-review CLI, provider
  and session environment, and a real temporary Git repository.
- Produces: end-to-end proof that a live claim changes no ordinary tool result,
  owner lifecycle commands remain usable, A cannot approve B, and exit 4
  recovery never repeats terminal handoff.

- [ ] **Step 1: Create the integration test harness and reproduce the original
      failure**

Build a temporary repository with the package installed through its real
installer. Read the installed hook configuration in order and invoke each
matching Bash or direct-write handler with the same payload, provider, session,
and `TT_SKIP_NETWORK=1` environment.

The first test must establish a live reviewer claim, run:

```js
const commands = [
  'git status --short | sed -n "1,5p"',
  'find scripts/review -maxdepth 2 -type f | sort',
  'git branch --show-current',
  'node --test scripts/tests/unit/review/co-review-fixture-cost.test.mjs',
  'npm run build --if-present',
];
```

Before Task 3's production deletion, at least the pipeline must fail with:

```text
reviewer mutation destinations are incomplete or ambiguous
```

- [ ] **Step 2: Add post-fix positive and negative installed-chain assertions**

For every command, assert the complete installed chain returns success with and
without the live claim. Then assert ordinary guards still refuse representative
dangerous command, foreign path, wrong bound worktree, forbidden GitHub body
write, source write while unbound, commit-ownership violation, and
installed-guard self-edit payloads.

For direct tools, compare Edit, Write, NotebookEdit, and apply_patch outcomes
with and without the claim. Create the new review file under `.tmp/review/`
through a direct tool payload.

- [ ] **Step 3: Add explicit owner-command tests during a live reviewer claim**

Run these through the installed chain and then through the CLI:

```js
for (const invocation of [
  ['status', '--dir', runtime],
  ['wait', '--dir', runtime, '--actor', owner, '--timeout', '0'],
  ['set-max-turns', '--dir', runtime, '--max-turns', '4'],
  ['supplement', '--dir', runtime, '--file', supplement],
  ['continue', '--dir', runtime, '--additional-turns', '1'],
]) {
  assertInstalledChainAllows(invocation);
}
```

With the reviewer claim live, the installed-chain assertion proves the guard
does not block any command. Separately invoke each CLI command in its valid
protocol lifecycle—active for status/wait/set-max-turns and
intervention-required for supplement/continue—and assert successful protocol
behavior. Do not weaken command preconditions merely to make one fixture serve
all five cases.

- [ ] **Step 4: Extend the real CLI relay to A → changes requested → B →
      accepted**

Reuse the existing e2e sequence and add assertions that:

```js
assert.equal(changedPathsBetween(A, B), ['docs/artifact.md']);
assert.throws(() => reviewerHandoff({ reviewOf: A, currentArtifact: B }), /co-review:review-of/);
assert.deepEqual(repeatIdenticalHandoff(), firstResult);
assert.throws(conflictingReuse, /co-review:/);
```

Drive separate owner and reviewer provider/session identities against the same
physical worktree and runtime. Simulate bounded waits with timeout 0/1 so the
test stays deterministic; assert exit 3 timeout, exit 0 wake, every configured
cycle record, final status plus the human-visible stall report at cycle
exhaustion, and no unconfigured extra poll. Inject one integrity refusal and
assert exactly one settled re-read before the episode stops.

After terminal acceptance, inspect status and the archive manifest and assert
every artifact, response, review, actor, provider/session, round, decision,
blob/digest, and commit relationship binds to the expected A or B evidence.

- [ ] **Step 5: Prove routing and continuation do not fabricate human
      approval**

In the same end-to-end fixture, preserve a sentinel issue body without a human
review-approval marker. After start, claims, waits, supplements, continuation,
and both agent handoffs, assert that the issue body is unchanged and no
`review:approved` evidence or human semantic-approval marker appears in
protocol events. Assert continuation retains only its existing narrow
authenticated-human provenance.

Run the existing explicit approval-boundary integration test to prove that the
repository's real review-approval workflow remains the only route that creates
human semantic-approval evidence:

```bash
node --test \
  scripts/tests/integration/task-tracker/verbs/github-record-approval-close-gates.test.mjs
```

- [ ] **Step 6: Preserve exit 4 durable acceptance and exact finalize retry**

Force archive publication failure after accepted state, assert exit 4 and one
terminal reviewer-handoff event, then invoke the printed finalize command and
assert archive publication succeeds without another reviewer-handoff event.
Allow the configured archive destination to appear only after durable
acceptance; prove finalization does not re-run pre-handoff tracked-state checks
or reopen the accepted lifecycle.

- [ ] **Step 7: Run the focused integration and finalization tests**

Run:

```bash
node --test \
  scripts/tests/integration/task-tracker/lib/co-review-reviewer-capability.test.mjs \
  scripts/tests/unit/review/co-review-finalization.test.mjs \
  scripts/tests/integration/task-tracker/verbs/github-record-approval-close-gates.test.mjs
```

Expected: PASS with the complete installed chain, same-worktree relay, stale-SHA
refusal, idempotency, human-authority separation, and exit 4 recovery all
demonstrated.

- [ ] **Step 8: Commit installed-chain acceptance**

```bash
git add \
  scripts/tests/integration/task-tracker/lib/co-review-reviewer-capability.test.mjs \
  scripts/tests/fixtures/co-review-e2e-cases.mjs \
  scripts/tests/unit/review/co-review-finalization.test.mjs
git commit -m "[#1406] Prove full-capability co-review relay"
```

---

### Task 6: Reconcile Packaging, Test Corpus, and Test-Impact Authority

**Files:**

- Modify: `scripts/tests/unit/meta/package-test-corpus.test.mjs`
- Modify: `scripts/tests/unit/meta/test-corpus-membership.test.mjs`
- Modify: `scripts/task-tracker/test-impact-manifest.json`
- Add/delete JSON records under
  `scripts/tests/fixtures/test-corpus-post-snapshot/**`

**Interfaces:**

- Consumes: final production/test file set from Tasks 1–5.
- Produces: package assertions with no retired assets, exact corpus membership,
  and a source-to-test impact rule covering all load-bearing co-review changes.

- [ ] **Step 1: Update package asset expectations**

Remove:

```js
'package/scripts/task-tracker/lib/co-review-write-policy.mjs',
'package/scripts/task-tracker/lib/mutation-targets.mjs',
```

Add:

```js
'package/scripts/task-tracker/lib/apply-patch-targets.mjs',
'package/scripts/review/lib/runtime-root.mjs',
'package/scripts/review/lib/repository-boundary.mjs',
```

- [ ] **Step 2: Reconcile post-snapshot records**

Delete records for the two deleted tests. Add schema-1 records for the new
parser unit test and installed-chain integration test using their deterministic
paths, for example:

```json
{
  "schema": 1,
  "path": "scripts/tests/unit/task-tracker/lib/apply-patch-targets.test.mjs"
}
```

Do not edit the frozen pre-move manifest.

- [ ] **Step 3: Add the net-new test-impact rule**

Append a rule shaped as follows, using only final paths that exist after Tasks
1–5:

```json
{
  "sources": [
    "scripts/task-tracker/activity-guard.mjs",
    "scripts/task-tracker/bash-guard.mjs",
    "scripts/task-tracker/source-edit-gate.mjs",
    "scripts/task-tracker/lib/apply-patch-targets.mjs",
    "scripts/review/lib/runtime-root.mjs",
    "scripts/review/lib/repository-boundary.mjs",
    "scripts/review/lib/protocol.mjs",
    "scripts/review/lib/start.mjs",
    "scripts/review/lib/index.mjs",
    "scripts/review/lib/archive.mjs",
    "docs/guides/github-native-coordination.md",
    "docs/guides/grok-provider.md"
  ],
  "tests": [
    "scripts/tests/integration/task-tracker/lib/co-review-reviewer-capability.test.mjs",
    "scripts/tests/slow/review/co-review-boundaries.test.mjs",
    "scripts/tests/unit/review/co-review.test.mjs",
    "scripts/tests/unit/review/co-review-finalization.test.mjs",
    "scripts/tests/unit/task-tracker/lib/apply-patch-targets.test.mjs"
  ],
  "reason": "SHA-bound one-worktree co-review authority and installed guard behavior"
}
```

- [ ] **Step 4: Run packaging, corpus, and impact tests**

Run:

```bash
node --test \
  scripts/tests/unit/meta/package-test-corpus.test.mjs \
  scripts/tests/unit/meta/test-corpus-membership.test.mjs \
  scripts/tests/unit/task-tracker/lib/test-impact-selector.test.mjs
```

Expected: PASS with no retired module/test reference and both new tests present
in corpus authority.

- [ ] **Step 5: Search current production, tests, and operator docs for stale
      policy references**

Run:

```bash
rg -n \
  "co-review-write-policy|mutation-targets|reviewer-co-review-command|pending review artifact|reviewer mutation destinations are incomplete or ambiguous|Arbitrary Bash remains blocked" \
  scripts docs/guides
```

Expected: no production, current-test, or current-guide match. Historical
specifications, plans, and review evidence under `docs/superpowers/**` are
excluded from this cleanup and remain immutable.

- [ ] **Step 6: Commit authority metadata reconciliation**

```bash
git add -A \
  scripts/tests/fixtures/test-corpus-post-snapshot \
  scripts/tests/unit/meta/package-test-corpus.test.mjs \
  scripts/tests/unit/meta/test-corpus-membership.test.mjs \
  scripts/task-tracker/test-impact-manifest.json
git commit -m "[#1406] Reconcile co-review test authority"
```

Inspect the staged name-status list before committing; only the listed metadata
and deterministic membership records may appear.

---

### Task 7: Run Full Verification and Prepare Fresh Official Acceptance

**Files:**

- Verify only; do not change source to make this task pass without returning to
  the owning failed task.
- Runtime output: new ignored directory under `.tmp/` for fresh official
  co-review acceptance.

**Interfaces:**

- Consumes: all commits from Tasks 1–6.
- Produces: complete focused/full-suite receipts and a fresh-runtime handoff for
  official A-to-B acceptance after integration.

- [ ] **Step 1: Verify the final tracked file boundary**

Run:

```bash
git status --short
git diff --name-status 67903c3c..HEAD
git diff --check 67903c3c..HEAD
```

Expected: clean worktree; only planned production, test, fixture, guide, and
manifest paths plus this reviewed plan artifact changed; no whitespace errors.

- [ ] **Step 2: Run all focused #1406 tests together**

Run:

```bash
node --test \
  scripts/tests/unit/task-tracker/lib/apply-patch-targets.test.mjs \
  scripts/tests/unit/task-tracker/lib/source-edit-gate.test.mjs \
  scripts/tests/slow/task-tracker/lib/activity-guard.test.mjs \
  scripts/tests/unit/task-tracker/core/bash-guard-fail-closed.test.mjs \
  scripts/tests/unit/task-tracker/core/bash-guard-tmp-contract.test.mjs \
  scripts/tests/unit/task-tracker/lib/bash-guard-worktree-binding.test.mjs \
  scripts/tests/unit/review/co-review-index.test.mjs \
  scripts/tests/unit/review/co-review-fixture-cost.test.mjs \
  scripts/tests/unit/review/co-review.test.mjs \
  scripts/tests/unit/review/co-review-finalization.test.mjs \
  scripts/tests/slow/review/co-review-boundaries.test.mjs \
  scripts/tests/integration/task-tracker/lib/co-review-reviewer-capability.test.mjs \
  scripts/tests/integration/task-tracker/verbs/github-record-approval-close-gates.test.mjs \
  scripts/tests/unit/meta/package-test-corpus.test.mjs \
  scripts/tests/unit/meta/test-corpus-membership.test.mjs \
  scripts/tests/unit/providers/coverage-provider-adapter.test.mjs
```

Expected: all focused tests PASS with zero failures.

- [ ] **Step 3: Run repository quality gates**

Run each command separately and preserve its exit receipt:

```bash
npm test
npm run test:slow
npm run lint:md
npm run lint:spell
npm run lint
npm run format:check
```

Expected: every command exits 0. Do not claim Test readiness from a partial
suite.

- [ ] **Step 4: Verify installed artifacts and stale-reference absence**

Run:

```bash
npm pack --dry-run
rg -n \
  "reviewer mutation destinations are incomplete or ambiguous|Arbitrary Bash remains blocked|pending review artifact" \
  scripts docs/guides
```

Expected: package includes `apply-patch-targets.mjs` and excludes retired
modules; stale-reference search returns no current production/guide matches.

- [ ] **Step 5: Record per-AC verification through sanctioned #1406 workflow**

For every demonstrable acceptance criterion in the hydrated #1406 body, invoke
`npx aitm ac-stamp` once with that criterion's exact persisted label. Stamp one
criterion at a time. Then run the declared Functional DoD verifiers with
`npx aitm dod-stamp tests`, `npx aitm dod-stamp lint`, and
`npx aitm dod-stamp commits`. Do not bulk-check, edit the body directly, or
infer one receipt from another command.

- [ ] **Step 6: Confirm verification created no unplanned tracked output**

Run:

```bash
git status --short
```

Expected: empty output. The sanctioned issue evidence is remote task metadata,
not a new repository file; make no empty verification commit.

- [ ] **Step 7: Prepare fresh official co-review acceptance**

After the implementation branch is integrated into the branch used for review,
create a brand-new ignored runtime. Both persistent sessions must start in the
same clean physical worktree using corrected installed hooks from their first
claim. Execute the specification's exact A → changes-requested → B → accepted
scenario with bounded repeated waits. Do not import any claim, response, review,
or acceptance from the old #1381 runtime.

- [ ] **Step 8: Stop at the governed handoff boundary**

Report the exact implementation commit, focused/full verification receipts,
fresh runtime path, and any remaining deferred #1381 concerns. Do not push,
deliver, merge, promote, approve, close, or mutate #1381 beyond the separately
authorized Plan-review exit gate.
