# Stale Co-Review Grant Repair Implementation Plan

<!-- cspell:ignore ENOENT -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow an exact live reviewer grant to resolve despite an unrelated stale index row while preserving fail-closed validation for a stale matching grant.

**Architecture:** Keep `resolveReviewerGrant` as the single grant authority. Split its row predicate conceptually into durable claim identity first and fallible filesystem location second; all live-protocol, handoff-commit, and ambiguity checks remain unchanged.

**Tech Stack:** Node.js ESM, `node:test`, synchronous filesystem/path APIs, AITM co-review index and reviewer write-policy modules.

## Global Constraints

- Do not prune, rewrite, or repair co-review index rows during lookup.
- Do not catch canonicalization failures for an identity-matching grant.
- Preserve live-claim, owner-handoff-commit, and ambiguity behavior.
- Preserve the #939 runtime and immutable review evidence exactly as recorded.
- Use repository-local `.tmp/test/` scratch helpers only.

---

## File Structure

- Modify `scripts/review/lib/index.mjs`: reorder grant candidate predicates without changing the public `resolveReviewerGrant(input)` interface.
- Modify `scripts/tests/unit/review/co-review-index.test.mjs`: pin unrelated-stale success and matching-stale fail-closed behavior at the authority boundary.
- Modify `scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs`: pin the reviewer command policy's use of the real resolver when an unrelated stale row precedes the healthy row.

### Task 1: Pin both sides of the grant boundary

**Files:**

- Modify: `scripts/tests/unit/review/co-review-index.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs`

**Interfaces:**

- Consumes: `resolveReviewerGrant({ indexFile, runtimeDir, runtimeRoot, provider, sid, statusProtocol })`.
- Produces: regression coverage proving unrelated rows are ignored before filesystem access and matching rows remain fail-closed.

- [ ] **Step 1: Add the direct authority regressions**

Import `rmSync` in `co-review-index.test.mjs`. Add two tests after the existing runtime-targeting test. The first registers a stale protocol before the healthy fixture, deletes only the stale runtime, and asserts the healthy grant resolves. The second deletes the matching runtime and asserts `ENOENT`:

```js
test('unrelated stale active row cannot block an exact healthy reviewer grant', () => {
  const { indexFile, state, dir } = fixture();
  const staleWorktree = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-stale-index-'));
  const staleDir = path.join(staleWorktree, '.tmp', 'stale-review');
  mkdirSync(staleDir, { recursive: true });
  registerProtocol({
    indexFile,
    state: {
      ...state,
      protocolId: 'stale-protocol',
      repositoryRoot: staleWorktree,
      worktree: staleWorktree,
      roles: { owner: 'StaleOwner', reviewer: 'StaleReviewer' },
      initialization: { runtimeDir: '.tmp/stale-review' },
    },
  });
  recordReviewerClaim({
    indexFile,
    protocolId: 'stale-protocol',
    provider: 'claude',
    sid: 'unrelated-session',
    round: 2,
  });
  registerProtocol({ indexFile, state });
  recordReviewerClaim({
    indexFile,
    protocolId: state.protocolId,
    provider: 'grok',
    sid: 'grok-reviewer-sid',
    round: 2,
  });
  rmSync(staleDir, { recursive: true });
  const live = {
    ...state,
    turnState: 'claimed',
    claim: { role: 'reviewer', actor: 'Reviewer' },
    lastHandoff: { from: 'owner', commit: '0123456789012345678901234567890123456789' },
  };

  const grant = resolveReviewerGrant({
    indexFile,
    runtimeDir: dir,
    runtimeRoot: state.worktree,
    provider: 'grok',
    sid: 'grok-reviewer-sid',
    statusProtocol: () => live,
  });
  assert.equal(grant.protocolId, state.protocolId);
});

test('identity-matching stale runtime remains fail-closed', () => {
  const { indexFile, state, dir } = fixture();
  registerProtocol({ indexFile, state });
  recordReviewerClaim({
    indexFile,
    protocolId: state.protocolId,
    provider: 'grok',
    sid: 'grok-reviewer-sid',
    round: 2,
  });
  rmSync(dir, { recursive: true });
  assert.throws(
    () =>
      resolveReviewerGrant({
        indexFile,
        runtimeDir: state.worktree,
        runtimeRoot: state.worktree,
        provider: 'grok',
        sid: 'grok-reviewer-sid',
        statusProtocol: () => null,
      }),
    /ENOENT/
  );
});
```

- [ ] **Step 2: Add the write-policy regression**

Add a policy test that writes an index containing the unrelated stale claim first and the healthy claim second, uses the real resolver, and asserts an absolute `status` command is allowed:

```js
test('unrelated stale index row cannot deny a matching reviewer status command', () => {
  const { projectDir, dir, grant } = policyFixture();
  const staleWorktree = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-stale-policy-'));
  const staleDir = path.join(staleWorktree, '.tmp', 'stale-review');
  mkdirSync(staleDir, { recursive: true });
  const stale = {
    ...grant,
    protocolId: 'stale',
    dir: staleDir,
    worktree: staleWorktree,
    pendingReviewPath: path.join(staleDir, 'round-2-reviewer-review.md'),
    claimedProvider: 'claude',
    claimedSid: 'unrelated-session',
  };
  const rows = { stale, p1: grant };
  const indexFile = path.join(projectDir, '.tmp', 'aitm', 'fleet', 'co-review-index.json');
  mkdirSync(path.dirname(indexFile), { recursive: true });
  writeFileSync(indexFile, `${JSON.stringify(rows)}\n`);
  rmSync(staleDir, { recursive: true });
  const live = {
    protocolId: 'p1',
    lifecycle: 'active',
    integrity: { ok: true },
    currentRole: 'reviewer',
    turnState: 'claimed',
    claim: { role: 'reviewer', actor: 'claude' },
    lastHandoff: { from: 'owner', commit: grant.ownerHandoffCommit },
  };

  const result = evaluateCoReviewWrite({
    projectDir,
    worktreePath: projectDir,
    provider: 'grok',
    sid: 'sid-1',
    toolName: 'Bash',
    targets: [],
    ambiguousMutation: true,
    reviewerCommand: { recognized: true, kind: 'status', runtimeDir: dir, json: false },
    indexFile,
    readIndex: () => rows,
    authorityFiles: [],
    resolveRuntimeRoot: () => ({ callerRoot: projectDir, root: projectDir }),
    statusProtocol: () => live,
  });

  assert.equal(result.decision, 'allow');
  assert.equal(result.reason, 'session-bound-co-review-command');
});
```

Extend the existing `node:fs` import with `rmSync`.

- [ ] **Step 3: Run the regressions to verify RED**

Run:

```bash
node --test scripts/tests/unit/review/co-review-index.test.mjs
node --test scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs
```

Expected: the unrelated-stale tests fail with `ENOENT` from `realpathSync(row.dir)` inside `resolveReviewerGrant`; the existing tests and matching-stale assertion pass.

### Task 2: Apply the minimal predicate-order repair

**Files:**

- Modify: `scripts/review/lib/index.mjs`
- Test: `scripts/tests/unit/review/co-review-index.test.mjs`
- Test: `scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs`

**Interfaces:**

- Consumes: unchanged `resolveReviewerGrant(input)` arguments.
- Produces: unchanged grant object or `null`; matching candidate path errors still propagate.

- [ ] **Step 1: Reorder the row predicates**

Move durable identity checks ahead of the runtime/worktree predicate:

```js
for (const row of Object.values(rows)) {
  if (
    row.lifecycle !== 'active' ||
    row.claimedRole !== 'reviewer' ||
    row.claimedProvider !== provider ||
    row.claimedSid !== sid ||
    !row.pendingReviewPath ||
    (runtimeDir
      ? realpathSync(path.resolve(row.dir)) !== runtimeDir ||
        !runtimeRoot ||
        realpathSync(path.resolve(row.worktree)) !== runtimeRoot
      : !input.anyWorktree && path.resolve(row.worktree) !== worktreePath)
  ) {
    continue;
  }
```

Do not add a `try/catch` and do not change later live-claim or ambiguity logic.

- [ ] **Step 2: Run focused tests to verify GREEN**

Run:

```bash
node --test scripts/tests/unit/review/co-review-index.test.mjs
node --test scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs
node --test scripts/tests/integration/task-tracker/core/reviewer-co-review-command-boundary.test.mjs
```

Expected: all tests pass with zero failures.

- [ ] **Step 3: Commit the repair**

```bash
git add scripts/review/lib/index.mjs \
  scripts/tests/unit/review/co-review-index.test.mjs \
  scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs
git commit -m '[#1372] fix: ignore unrelated stale reviewer grants'
```

### Task 3: Verify the governed delivery boundary

**Files:**

- Verify only; no new source files.

**Interfaces:**

- Consumes: the committed #1372 repair.
- Produces: exact-HEAD verification receipts and delivery evidence.

- [ ] **Step 1: Run repository verification**

```bash
npm test
npm run test:slow
npm run lint
npm run format:check
git diff --check origin/trunk...HEAD
```

Expected: every command exits 0.

- [ ] **Step 2: Run the AITM Test transition**

Run `npx aitm test 1372`. Expected: every verification command receives an exact-HEAD receipt, the acceptance criteria and Functional DoD items become eligible for individual stamping, and #1372 reaches Test.

- [ ] **Step 3: Deliver and recover #939**

Complete the governed Review, PR, merge, and close sequence for #1372. Then, from the fresh Claude session, retry the generated absolute handoff for the preserved #939 runtime. Confirm protocol integrity is healthy and the immutable `round-2-reviewer-review.md` is unchanged before resuming #939 author work.
