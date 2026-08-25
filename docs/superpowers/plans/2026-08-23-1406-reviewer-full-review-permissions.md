# SHA-Bound Co-Review Orchestration Implementation Plan

<!-- cspell:ignore ACDMRTUXB -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace co-review's same-user capability sandbox with a one-worktree,
SHA-bound orchestration and evidence protocol that permits deep review under
ordinary repository safeguards.

**Architecture:** Protocol authority rests on canonical caller/runtime/worktree
identity, exact commits, clean tracked state, single-artifact commit deltas, and
provider-native session provenance embedded in every claimed turn. The
co-review-specific Bash and direct-write policy is deleted while ordinary
guards retain their existing decisions; generated handoffs and operator guides
describe cooperative roles and bounded polling. Real-Git, memory-boundary,
installed-hook-chain, provenance-envelope, and full A-to-B relay tests prove the
resulting boundary.

**Tech Stack:** Node.js ES modules, `node:test`, Git subprocesses through
`execFileSync`, JSONL protocol state, Claude/Codex/Grok installed hook fixtures,
Markdown documentation, markdownlint-cli2, CSpell, Prettier, ESLint.

**Reference specification:**
`docs/superpowers/specs/2026-08-23-1406-reviewer-full-review-permissions-design.md`
at independently accepted commit `218e5cc16d93cf204568930e5d4a84146764aada`.

**Execution state:** Tasks 1 through 4 and the Task 2 replay amendment are
complete at the commits recorded below. Task 5 is the newly discovered
provider/session provenance implementation. Tasks 6 through 8 are the revised
acceptance, authority-metadata, and final-verification sequence.

**Remaining focused execution forecast:** 17 hours after this plan revision:
Task 5 provider/session provenance 9h; Task 6 installed-chain and A-to-B
acceptance 4h; Task 7 package/corpus/test-impact authority 1h; Task 8 complete
verification and fresh-runtime handoff 3h. Completed Tasks 1–4 and the routed
replay repair are excluded. The governed issue remains frozen at Size XL and 32
human hours; this adaptive remaining-work forecast does not rewrite either field
or the historical Plan-approval forecast record.

## Amendment Discovery Evidence

- The first four implementation checkpoints are durable and independently
  reviewed: one-worktree authority `b57c04c3`, clean/artifact-only handoffs
  `de5fcdd6`, capability-policy retirement `0fb856d5`, and relay guidance
  `6bc346cc` plus `623ec40b`.
- The first Task 6 attempt found immediate owner and terminal reviewer handoff
  replay was not idempotent. The repair and refusal-semantics correction landed
  in the owning protocol task at `079d1125` and `495c0496`; the covering suite
  passed 203/203 before the acceptance task resumed.
- The resumed acceptance baseline passed 93/93. A carrier audit then proved the
  second gap before any acceptance-test edit: `co-review.mjs` resolves and
  publishes provider/session only for reviewer claims; `index.mjs` stores only
  reviewer `claimedProvider`/`claimedSid`; protocol claims contain only
  role/actor/process/host/time; and start/terminal manifests cannot bind owner
  evidence to the session that produced it.
- Occupancy and task-session records cannot substitute for protocol evidence:
  occupancy is one operational row per issue, while task session references do
  not bind both co-review roles to their evidence handoffs. Encoding a session
  in the freely configured actor string would be fabricated provenance.
- A boolean-only probe confirmed this Codex tool environment exports at least
  one of `CODEX_THREAD_ID` or `CODEX_SESSION_ID`; the independent Claude review
  confirmed `CLAUDE_CODE_SESSION_ID` in its session. No session value was
  printed or persisted. The two-session acceptance is operationally reachable.
- Independent Claude Opus 5 review accepted the amended specification at
  `218e5cc1`. Its non-blocking D1 observation identified the exported
  `sessionIdEnvKeys()` helper as a mis-implementation trap because it calls
  `detectProvider`, prepends the orchestrator key, and flattens provider
  attribution. Task 5 prohibits that helper explicitly.

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
- New runtimes use the additive `provider-session/v1` provenance profile.
  Every real claim resolves provider and `sid` together from exactly one
  adapter's provider-native session keys, persists that pair in the claim and
  handoff, and carries it into selected terminal evidence.
- The profiled resolver enumerates adapters directly through `listProviders()`
  and `getProvider(name).sessionIdEnvKeys`. It must not call
  `detectProvider()`, `resolveSessionId()`, or the same-named
  `sessionIdEnvKeys()` helper from `scripts/task-tracker/lib/session-id.mjs`;
  consult `detectionEnvKeys`; accept `AI_TASK_MANAGER_SESSION_ID`; or use a
  transcript/default fallback.
- Native keys from no adapter refuse as required. Native keys from multiple
  adapters, or conflicting values across one adapter's aliases, refuse as
  ambiguous without printing session values.
- Legacy runtimes remain readable and already-accepted legacy runtimes remain
  available for finalization, but active profile-less runtimes cannot claim,
  hand off, or be reinitialized into the profile.
- Preserve ordinary dangerous-command, path-scope, active-task worktree,
  GitHub, AITM-path, commit-ownership, installed-guard, and activity-state
  behavior.
- Preserve every version-1 envelope name. Provenance additions are the
  accepted additive profile, not a schema-version rename.
- Exit 4 means durable acceptance with archive publication pending. Never
  repeat the terminal handoff; use the exact printed finalize retry.
- Terminal archive publication is post-acceptance and outside pre-handoff
  tracked-state checks.
- Do not hot-patch or reuse the active #1381 constrained runtime.
- #1381 is the convergence ancestor and #1406 is the first and final defect hop
  for this concern. Do not create a successor defect from #1406. Repair an
  in-scope failure in its owning task; record a genuinely deferred convergence
  observation only in #1381. If progress would require another defect hop,
  stop and report that this implementation plan is flawed.
- Use test-driven development: observe each focused test fail for the intended
  reason before implementing its production change.

## Develop-Stage Amendment Gate

The original Plan-review exit gate completed before Develop. Its human
Plan-approval marker and frozen forecast record remain historical authority and
must not be overwritten, generalized, or replayed. There is no sanctioned
Develop-to-Plan rollback and no new `/task plan-approve` call in this amendment.

- [x] Preserve #1381 as the sole convergence story and keep its constrained
      runtime untouched.
- [x] Preserve the completed #1406 issue-body hydration, stable verification
      command IDs, visible decomposition waiver, and human approval marker.
- [x] Record the discovery that the original acceptance task could not bind
      owner evidence to an authoritative provider/session and stop before
      fabricating coverage or creating a successor defect.
- [x] Revise and independently review the governing specification. Accepted
      authority is commit `218e5cc16d93cf204568930e5d4a84146764aada` with no
      blocking findings.
- [x] Obtain explicit human approval of those exact accepted specification
      bytes before revising this plan. Approval authority: `kburson`, in Codex
      task/session `01a030a5-4e5b-75f2-bbaf-b3c7991151b7`, responding `yes` to
      the prompt that named exact specification commit `218e5cc1`; the approval
      immediately preceded the plan revision.
- [ ] Commit this revised plan, obtain independent plan review, and incorporate
      every blocking correction before resuming implementation.
- [ ] After plan acceptance, update only #1406's `Plan Metadata`, visible
      decomposition-waiver checkpoint text, adaptive focused-duration text,
      discovery narrative, and affected acceptance/verifier wording through a
      governed issue-body operation. Preserve every lifecycle marker, frozen
      XL/32h fields, existing Plan-approval marker, verification-command ID,
      and unrelated section byte. Read the persisted body back and verify the
      exact plan/spec commit mapping. Do not call `/task plan-approve` again.

---

## File Map

### New files

- `scripts/review/lib/provider-session.mjs` — profiled co-review resolver that
  selects one provider/session pair directly from adapter-native keys.
- `scripts/tests/unit/review/co-review-provider-session.test.mjs` — one
  table-driven resolver contract covering success, required, and ambiguous
  environments without exposing session values.
- `scripts/task-tracker/lib/apply-patch-targets.mjs` — ordinary apply_patch
  multi-target parser relocated out of the retired co-review module.
- `scripts/tests/unit/task-tracker/lib/apply-patch-targets.test.mjs` — focused
  parser behavior and malformed-patch failures.
- `scripts/tests/integration/task-tracker/lib/co-review-reviewer-capability.test.mjs`
  — complete installed-hook-chain and owner/reviewer capability regression.
- Corresponding JSON membership records under
  `scripts/tests/fixtures/test-corpus-post-snapshot/**`.

### Production files modified

- `scripts/review/co-review.mjs`
- `scripts/review/lib/archive.mjs`
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
- `scripts/tests/fixtures/co-review-fixture.mjs`
- `scripts/tests/fixtures/co-review-consistency-cases.mjs`
- `scripts/tests/fixtures/co-review-finalization-cases.mjs`
- `scripts/tests/fixtures/co-review-supplement-cases.mjs`
- `scripts/tests/fixtures/co-review-budget-cases.mjs`
- `scripts/tests/fixtures/co-review-handoff-cases.mjs`
- `scripts/tests/fixtures/co-review-start-cases.mjs`
- `scripts/tests/fixtures/co-review-e2e-cases.mjs`
- `scripts/tests/unit/review/co-review-fixture-cost.test.mjs`
- `scripts/tests/unit/review/co-review-finalization.test.mjs`
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

**Status: COMPLETE.** Implemented and verified at
`b57c04c388f8323829a7fbc928f7aea61ceb70f8`. The steps below are the preserved
execution record and must not be rerun as new work.

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

- [x] **Step 1: Replace the linked-worktree success test with failing
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

Exercise both absolute foreign-runtime paths and a relative escape from the
caller root, such as `--dir ../sibling/.tmp/review`. Assert the relative form
resolves to the sibling repository before the same identity refusal.

Repair the existing symlink-escape fixture before changing the resolver. Import
`mkdtempOutsideRepo()` from `scripts/task-tracker/lib/scratch-dir.mjs` and
`rmSync` from `node:fs`. Replace
`temporaryRoot('aitm-co-review-boundary-outside-')` with
`mkdtempOutsideRepo('aitm-co-review-boundary-outside-')`. Change that test's
callback to `(t)` and immediately register
`t.after(() => rmSync(outside, { recursive: true, force: true }))` before
creating the symlink. Keep its existing refusal assertion unchanged.

The repository-local `temporaryRoot()` climbs to the host worktree under Git
root discovery and cannot exercise the `not-a-repository` fallback.

- [x] **Step 2: Add the imported-review strict-ancestor regression**

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

- [x] **Step 3: Run the focused tests and confirm the intended failures**

Run:

```bash
node --test \
  scripts/tests/slow/review/co-review-boundaries.test.mjs \
  scripts/tests/unit/review/co-review.test.mjs
```

Expected: FAIL because sibling/nested runtime calls still succeed and ancestor
imports remain accepted.

- [x] **Step 4: Implement nearest-existing-ancestor root resolution**

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
Document the `not-a-repository` fallback as the routing needed for a lexically
contained runtime symlink whose physical target is an external non-repository
directory. The repaired `mkdtempOutsideRepo()` real-Git case must pass through
the fallback, reach `protocolPaths()`, and fail `path-outside-repository` rather
than being mislabeled as a repository-identity failure. Retain a separate
repository-local symlink case, if useful, with the expected
`repository-identity` result; do not conflate the two topologies.

- [x] **Step 5: Route initialization through the same boundary and reject
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

- [x] **Step 6: Run focused boundary and protocol tests**

Run:

```bash
node --test \
  scripts/tests/slow/review/co-review-boundaries.test.mjs \
  scripts/tests/unit/review/co-review.test.mjs
```

Expected: PASS; absolute and relative foreign-worktree shapes fail before
mutation, the symlink escape preserves its path-containment diagnostic, and
exact-HEAD imports pass.

- [x] **Step 7: Commit the protocol-root boundary**

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

**Status: COMPLETE, INCLUDING ROUTED REPLAY AMENDMENT.** The planned boundary
landed at `de5fcdd68b70eb73819c2803cbb4ac9cfd6098d5`. Task 6 discovery routed the
missing exact-handoff replay behavior back to this owning protocol task; the
minimal implementation and review correction landed at
`079d11256814af1436dd5ccd6509ac03aa17a0b0` and
`495c04963c930efe2f75f21d0f1e3c0818d6c0bc`. The steps below are historical;
do not recreate their RED receipts or replay fixes.

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

- [x] **Step 1: Add failing real-boundary and memory-boundary contract tests**

Add the real-Git assertions only to
`scripts/tests/slow/review/co-review-boundaries.test.mjs`, alongside its
existing `REAL_REPOSITORY_BOUNDARY` contract test:

```js
assert.deepEqual(REAL_REPOSITORY_BOUNDARY.trackedChanges(root), []);
writeFileSync(path.join(root, 'docs/artifact.md'), '# Dirty tracked artifact\n');
assert.deepEqual(REAL_REPOSITORY_BOUNDARY.trackedChanges(root), ['docs/artifact.md']);

const secondCommit = commitArtifact(root, '# Artifact\n\nRevision two.\n');
assert.deepEqual(REAL_REPOSITORY_BOUNDARY.changedPathsBetween(root, initialCommit, secondCommit), [
  'docs/artifact.md',
]);
```

Add the matching in-memory assertions only to
`scripts/tests/unit/review/co-review-fixture-cost.test.mjs`. Do not call the
real boundary from that file: its process counters are module-scoped and the
zero-subprocess contract must remain order-independent. Assert the same results
through `fixture.repository` and preserve:

```js
assert.deepEqual(fixture.processCalls, { git: 0, nodeCli: 0 });
```

- [x] **Step 2: Add failing handoff regressions**

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

- [x] **Step 3: Run focused tests and confirm they fail before implementation**

Run:

```bash
node --test \
  scripts/tests/unit/review/co-review-fixture-cost.test.mjs \
  scripts/tests/unit/review/co-review.test.mjs \
  scripts/tests/slow/review/co-review-boundaries.test.mjs
```

Expected: FAIL because the repository interfaces and handoff checks do not
exist.

- [x] **Step 4: Add the real repository operations**

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

- [x] **Step 5: Add matching zero-subprocess memory operations**

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

- [x] **Step 6: Enforce the checks at owner and reviewer handoff**

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

- [x] **Step 7: Run the focused boundary and handoff tests**

Run the Step 3 command again.

Expected: PASS, including ignored runtime evidence, dirty tracked-state
refusals, single-artifact success, and the zero-subprocess fixture assertion.

- [x] **Step 8: Commit repository cleanliness authority**

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

**Status: COMPLETE.** Implemented and verified at
`0fb856d5d9df640f26f695a5d33a83c37bb5aaad`. The steps below are the preserved
execution record. Packaging and corpus follow-through remains owned by revised
Task 7.

**Files:**

- Create: `scripts/task-tracker/lib/apply-patch-targets.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/apply-patch-targets.test.mjs`
- Create:
  `scripts/tests/integration/task-tracker/lib/co-review-reviewer-capability.test.mjs`
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

- [x] **Step 1: Split parser tests into their future focused file**

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

- [x] **Step 2: Add claim-invariance regression cases before deletion**

In the activity/source-edit tests, run representative Bash, Edit, Write,
NotebookEdit, and apply_patch payloads with no reviewer claim and with a live
claim. Compare the complete hook result objects:

```js
assert.deepEqual(withClaim, withoutClaim);
```

Include ordinary positive and negative cases: documentation edit, `.tmp/**`
review-file write, source write while unbound, malformed apply_patch, and
installed-guard self-edit refusal.

In the new installed-chain integration file, build the minimum temporary
repository and real-installer harness needed to establish a live reviewer
claim. Assert that this representative pipeline succeeds through every
configured Bash guard with the claim:

```js
'git status --short | sed -n "1,5p"';
```

Assert the desired success outcome only; do not embed the old refusal text in
the test source.

- [x] **Step 3: Run the focused tests and record red behavior**

Run:

```bash
node --test \
  scripts/tests/integration/task-tracker/lib/co-review-reviewer-capability.test.mjs

node --test \
  scripts/tests/unit/task-tracker/lib/apply-patch-targets.test.mjs \
  scripts/tests/unit/task-tracker/lib/source-edit-gate.test.mjs \
  scripts/tests/slow/task-tracker/lib/activity-guard.test.mjs \
  scripts/tests/unit/review/co-review-index.test.mjs
```

Expected: the first command FAILS with the runtime diagnostic `reviewer
mutation destinations are incomplete or ambiguous`; record that output as the
installed-chain red receipt without copying the literal into the test file.
The second command FAILS because the new parser module is absent and live
claims still change tool outcomes.

- [x] **Step 4: Relocate the apply_patch parser**

Move `MutationParseError` and `extractApplyPatchTargets()` byte-for-byte into
`apply-patch-targets.mjs`. Update `activity-guard.mjs` and
`source-edit-gate.mjs` imports. Preserve apply_patch targets as ordinary
`filePaths` for normal activity and source-edit classification.

- [x] **Step 5: Remove claim-aware decisions from all installed guards**

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

- [x] **Step 6: Delete retired modules and narrow review-index exports**

Delete the three policy/classifier modules and two obsolete focused test files.
Remove public `resolveReviewerGrant()` and `hasLiveReviewerClaim()` from
`scripts/review/lib/index.mjs`. Remove their unit tests while retaining the
`allowsCoReviewOccupancy()` cases that prove private liveness still works.

- [x] **Step 7: Run focused guard and index tests**

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

- [x] **Step 8: Commit capability-policy retirement**

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
  scripts/tests/slow/task-tracker/lib/activity-guard.test.mjs \
  scripts/tests/integration/task-tracker/lib/co-review-reviewer-capability.test.mjs
git commit -m "[#1406] Retire co-review capability policing"
```

Before committing, inspect `git diff --cached --name-status` and verify that
`git add -A` captured only the explicit create/modify/delete list above.

---

### Task 4: Update Generated Relay Instructions and Operator Guidance

**Status: COMPLETE.** Implemented and verified at
`6bc346ccc506dc3690f78392a311a58f1b4f0bd4`, with the independent reviewer-scope
clarification at `623ec40ba4aeb818c3f0595b1d1478b8d919af53`. The steps below are
the preserved execution record.

**Files:**

- Modify: `scripts/review/lib/start.mjs`
- Modify: `scripts/tests/fixtures/co-review-start-cases.mjs`
- Verify: `scripts/tests/unit/review/co-review.test.mjs`
- Modify: `docs/guides/github-native-coordination.md`
- Modify: `docs/guides/grok-provider.md`
- Modify: `scripts/tests/unit/providers/coverage-provider-adapter.test.mjs`

**Interfaces:**

- Consumes: existing generated canonical worktree/runtime paths,
  `waitCycles`, `waitIntervalSeconds`, and exit-code guidance.
- Produces: owner/reviewer handoffs that describe normal capabilities,
  cooperative role restrictions, one-worktree authority, direct runtime-file
  relay, and exit 4 finalization.

- [x] **Step 1: Replace stale handoff expectations with failing accepted-model
      expectations**

In `co-review-start-cases.mjs`, remove all five stale reviewer-policy
assertions: `narrowly authorizes...`, `arbitrary Bash remains blocked`,
`ordinary quoted prose...supported`, `dynamic shell expressions...remain
blocked`, and `live provider...session...claim`. Then add:

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

- [x] **Step 2: Update documentation coverage tests first**

In `coverage-provider-adapter.test.mjs`, delete required-file assertions for the
retired modules and replace `/pending review artifact/i` with assertions for:

```js
assert.match(coordination, /one canonical physical worktree/i);
assert.match(coordination, /SHA-bound|immutable.*commit/is);
assert.match(coordination, /normal repository.*capabilities/is);
assert.doesNotMatch(coordination, /pending review artifact/i);
```

- [x] **Step 3: Run the focused tests and confirm stale guidance fails**

Run:

```bash
node --test \
  scripts/tests/unit/review/co-review.test.mjs \
  scripts/tests/unit/providers/coverage-provider-adapter.test.mjs
```

Expected: FAIL on the old restricted reviewer prose and pending-artifact docs.

- [x] **Step 4: Rewrite generated reviewer and owner guidance**

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

- [x] **Step 5: Update both operator guides**

Replace exact-pending-review-artifact capability language with the same four
facts: normal capabilities, one canonical worktree, cooperative role
separation, and immutable SHA/blob/digest authority. Add that session routing,
continuation, and automated handoffs do not create human semantic approval.
Preserve unrelated Grok installation/session guidance and GitHub occupancy
guidance.

- [x] **Step 6: Run focused handoff and documentation tests**

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

- [x] **Step 7: Commit generated and operator guidance**

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

### Task 5: Bind Every Claimed Turn to Provider-Native Session Provenance

**Discovery owner:** This task owns the production gap that stopped the former
Task 5 acceptance attempt. That attempt proved the installed-chain baseline and
the routed replay fix green, then stopped before test edits because production
persisted reviewer provider/session only. This is in-scope #1406 work, not a
successor defect. If the interfaces below cannot carry the accepted design,
stop and report the plan as flawed rather than creating another defect hop.

**Files:**

- Create: `scripts/review/lib/provider-session.mjs`
- Create: `scripts/tests/unit/review/co-review-provider-session.test.mjs`
- Modify: `scripts/review/co-review.mjs`
- Modify: `scripts/review/lib/protocol.mjs`
- Modify: `scripts/review/lib/index.mjs`
- Modify: `scripts/review/lib/start.mjs`
- Modify: `scripts/review/lib/archive.mjs`
- Modify: `scripts/tests/fixtures/co-review-handoff-cases.mjs`
- Modify: `scripts/tests/fixtures/co-review-start-cases.mjs`
- Modify: `scripts/tests/fixtures/co-review-e2e-cases.mjs`
- Modify: `scripts/tests/fixtures/co-review-fixture.mjs`
- Modify: `scripts/tests/fixtures/co-review-consistency-cases.mjs`
- Modify: `scripts/tests/fixtures/co-review-finalization-cases.mjs`
- Modify: `scripts/tests/fixtures/co-review-supplement-cases.mjs`
- Modify: `scripts/tests/fixtures/co-review-budget-cases.mjs`
- Modify: `scripts/tests/unit/review/co-review-fixture-cost.test.mjs`
- Modify: `scripts/tests/slow/review/co-review-boundaries.test.mjs`
- Modify: `scripts/tests/unit/review/co-review.test.mjs`
- Modify: `scripts/tests/unit/review/co-review-index.test.mjs`
- Modify: `scripts/tests/unit/review/co-review-finalization.test.mjs`

**Interfaces:**

- Produces `resolveProfiledProviderSession({ env, listProviders, getProvider })`,
  returning `{ provider, sid }` only when exactly one adapter contributes one
  unique non-empty native value.
- Refuses no contributor with `co-review:provider-session-id-required` and
  multiple contributors or conflicting same-adapter aliases with
  `co-review:provider-session-id-ambiguous`. Ambiguity diagnostics may name
  provider/key candidates but never session values.
- Extends `claimTurn()` and both handoffs with required `provider` and `sid`
  inputs for `provider-session/v1` runtimes.
- Persists one exact claim record and immutable handoff claim reference carrying
  revision, role, actor, provider, `sid`, process, host, and timestamp.
- Publishes reviewer operational index state only after the authoritative
  protocol claim and derives the index row from the returned claim.
- Copies selected terminal evidence provenance only from each selected handoff
  claim reference.

- [ ] **Step 1: Add one table-driven native provider/session resolver test**

Create `co-review-provider-session.test.mjs` with a table that supplies opaque
fake values for the declared Claude, Codex, and Grok native keys and proves:

```js
[
  [
    'one Claude key',
    { CLAUDE_CODE_SESSION_ID: 'claude-a' },
    { provider: 'claude', sid: 'claude-a' },
  ],
  ['one Codex key', { CODEX_THREAD_ID: 'codex-a' }, { provider: 'codex', sid: 'codex-a' }],
  ['one Grok key', { GROK_SESSION_ID: 'grok-a' }, { provider: 'grok', sid: 'grok-a' }],
  [
    'identical aliases',
    { CODEX_THREAD_ID: 'codex-a', CODEX_SESSION_ID: 'codex-a' },
    { provider: 'codex', sid: 'codex-a' },
  ],
];
```

Add negative rows for an empty environment; `AI_TASK_MANAGER_SESSION_ID` alone;
`CODEX_HOME` or `GROK_AGENT` alone; native keys from two adapters; and different
values across Claude's or Codex's aliases. Required and ambiguity assertions
must compare the exact error code and prove that the diagnostic omits every
opaque session value.

In the same new test file, add a second table over Claude, Codex, and Grok. For
each adapter, drive owner claim, owner handoff, reviewer claim, and reviewer
handoff through the profiled CLI or its injected command handler using only that
adapter's declared native key. Assert each returned/persisted claim and handoff
names the expected provider and opaque `sid`. Reuse the five negative environment
shapes above at the CLI boundary so the concrete provider-adapter contract is
proved in this file rather than in the already-completed documentation coverage
test. `coverage-provider-adapter.test.mjs` remains verification-only outside
Task 5 and is not staged by this task.

Import only `listProviders` and `getProvider` from the provider registry. Add a
source-level completion assertion or equivalent automated inspection proving
the profiled resolver does not import or call `detectProvider()`,
`resolveSessionId()`, or the exported `sessionIdEnvKeys()` helper from
`scripts/task-tracker/lib/session-id.mjs`. That same-named helper is Claude
finding D1: it calls `detectProvider`, prepends the orchestrator override, and
flattens away adapter attribution. It is forbidden even though general
task-tracker callers retain it.

- [ ] **Step 2: Add failing provenance-profile and legacy tests**

Extend the protocol/start fixtures so new initialization expects:

```js
state.initialization.claimProvenance === 'provider-session/v1';
startManifest.initialization.claimProvenance === 'provider-session/v1';
```

Keep every version-1 envelope name. Add fixtures for a profile-less active
runtime and an already-accepted profile-less runtime. Assert that status remains
readable for both, already-accepted finalization remains available, and active
legacy claim, handoff, and re-initialization refuse with
`co-review:provenance-profile-required`. Re-initialization must refuse before
the exact-JSON sameness path. Imported review initialization records the
explicit `imported-unclaimed/v1` provenance mode without inventing a provider,
`sid`, or claim reference and cannot supply selected terminal evidence.

- [ ] **Step 3: Add failing claim, handoff, replay, and role-separation tests**

For both roles, call `claimTurn()` with provider/session input and require the
persisted `state.claim` and claim event to contain the exact record. Prove an
identical actor/provider/session retry is idempotent and a different provider or
`sid` receives `co-review:claim-conflict` with no byte change.

Add a failing human-readable status assertion while a claim is live. It must
render the claim's role, actor, provider, `sid`, revision, and time. Keep the JSON
assertion that receives the full claim through `statusProtocol()` and prove
neither surface exposes credentials or transcript content.

Require each handoff to receive the same provider/session as the live claim and
copy this immutable reference before clearing the claim:

```js
{
  revision,
  role,
  actor,
  provider,
  sid,
  at,
}
```

A live or immediate replay call with another provider/session must receive
`co-review:handoff-session-mismatch` before consuming evidence or returning
replay success. Preserve the ordinary stale-replay refusal semantics established
by `495c0496`; do not broaden the replay recognizer or translate unrelated
`ProtocolError` diagnostics.

At every real claim after a peer handoff, refuse equality with the opposite
role's latest handoff pair using `co-review:session-role-conflict`. Prove each
role may reuse its own persistent pair on later rounds. The first owner claim in
a fresh runtime and after `imported-unclaimed/v1` has no comparison pair and
must succeed; the rule first binds at the reviewer's first real claim.

- [ ] **Step 4: Migrate every existing profiled fixture call site explicitly**

In `co-review-fixture.mjs`, export stable opaque test identities such as:

```js
export const PROFILED_SESSIONS = Object.freeze({
  owner: Object.freeze({ provider: 'codex', sid: 'fixture-owner-sid' }),
  reviewer: Object.freeze({ provider: 'claude', sid: 'fixture-reviewer-sid' }),
});

export function profiledSession(role) {
  return { ...PROFILED_SESSIONS[role] };
}
```

Add a matching `profiledEnv(role, baseEnv)` helper for CLI fixtures. It must
remove every registered provider-native session key from the inherited
environment, then set only the selected role's native key. Retire the current
single `SYNTHETIC_REVIEWER_ENV` default for profiled claim/handoff calls;
`AI_TASK_MANAGER_SESSION_ID` and detection-only keys cannot stand in for either
role. Non-claim lifecycle calls may retain a neutral environment when they do
not invoke the profiled resolver.

Update every claim/handoff call in these seven modules to spread the matching
role identity explicitly, or route it through a named fixture wrapper that does
so without masking negative tests:

- `scripts/tests/fixtures/co-review-fixture.mjs`
- `scripts/tests/fixtures/co-review-consistency-cases.mjs`
- `scripts/tests/fixtures/co-review-finalization-cases.mjs`
- `scripts/tests/fixtures/co-review-supplement-cases.mjs`
- `scripts/tests/fixtures/co-review-budget-cases.mjs`
- `scripts/tests/unit/review/co-review-fixture-cost.test.mjs`
- `scripts/tests/slow/review/co-review-boundaries.test.mjs`

Also migrate the already-owned `co-review-handoff-cases.mjs`,
`co-review.test.mjs`, `scripts/review/lib/protocol.mjs`, and
`scripts/review/co-review.mjs` call sites. Do not make `bindProtocol()` silently
inject provenance into every call: required-field, wrong-session, ambiguity,
and legacy tests must retain a direct way to omit or conflict the inputs. Add a
census assertion or review command over `claimTurn(`, `handoffOwner(`, and
`handoffReviewer(`, plus CLI `claim` and `handoff` invocations, proving that
every new-runtime call site is either explicitly profiled or deliberately
marked as a negative or legacy case. This step is mechanical fixture migration,
not a new production rule.

- [ ] **Step 5: Add failing post-claim index-publication tests**

Drive the real CLI claim path and inject reviewer-index publication failure
after the protocol claim is durable. Assert exit 1 with
`co-review:index-publication-pending`, the exact retry command, one claim event,
and unchanged authoritative protocol bytes on retry except for the repaired
operational index.

Change `recordReviewerClaim()` to an atomic upsert sourced from the returned
protocol state and claim: register an absent row, repair a stale row with the
same registration identity, then record the reviewer claim. An unreadable store
or registration-identity conflict preserves suspect bytes and returns exit 1
with `co-review:index-authority-conflict`; automatic retry is not represented as
repair. Keep occupancy one-row-per-issue and reviewer-only. It is an operational
sharing cache, not owner provenance authority.

- [ ] **Step 6: Add failing start and archive provenance tests**

Require state, event, handoff, start-manifest, prepared-archive, and
terminal-archive validation to enforce the profile whenever it is present. The
fresh A-to-B fixture must select owner response and reviewer review handoffs,
then require the prepared and rendered terminal manifests to carry each exact
claim reference alongside the existing actor, round, commit, blob, digest,
decision, and path relationships.

Delete or alter each provider/session/claim-reference field in turn and require
a pre-preparation, pre-publication, and foreign-recovery refusal. Prove archive
construction never re-resolves the current environment, reads configured actor
strings as provenance, or consults the co-review/occupancy index. The sole
source is the selected handoff event's claim reference.

- [ ] **Step 7: Run the combined focused tests and record the intended RED**

Run:

```bash
node --test \
  scripts/tests/unit/review/co-review-provider-session.test.mjs \
  scripts/tests/unit/review/co-review-index.test.mjs \
  scripts/tests/unit/review/co-review-fixture-cost.test.mjs \
  scripts/tests/unit/review/co-review.test.mjs \
  scripts/tests/unit/review/co-review-finalization.test.mjs \
  scripts/tests/slow/review/co-review-boundaries.test.mjs
```

Expected: FAIL because the focused resolver and provenance profile do not exist,
claims/handoffs omit provider/session, reviewer-index publication precedes the
authoritative claim, and archives source no handoff claim provenance. Record the
distinct intended failures before editing production.

- [ ] **Step 8: Implement the single profiled resolver**

In `provider-session.mjs`, enumerate `listProviders()`, read each adapter through
`getProvider(name)`, and collect its non-empty `sessionIdEnvKeys` values. Select
one adapter only when it is the sole contributor and its values collapse to one
unique string. Return `{ provider: adapter.name, sid }`.

Do not infer an active provider first. Do not inspect `detectionEnvKeys`, apply
registry priority, use an implicit Claude default, accept
`AI_TASK_MANAGER_SESSION_ID`, or call any general session-id helper. Keep
general task-tracker session resolution unchanged outside profiled co-review.

- [ ] **Step 9: Implement the additive protocol profile and claim authority**

Stamp `state.initialization.claimProvenance = 'provider-session/v1'` on every new
runtime and copy it into the start manifest. Add profile-aware validators for
state, events, both handoffs, and imported-unclaimed initialization without
renaming any version-1 envelope.

Extend `claimTurn()`, `handoffOwner()`, and `handoffReviewer()` with provider and
`sid`. Persist the exact claim event, enforce idempotency/conflict and cross-role
rules, and copy the claim reference into a successful handoff before clearing
`state.claim`. Preserve mutex, integrity, canonical-root, ignored-runtime,
clean-tracked-state, artifact-only, round, timer, budget, and evidence checks in
their existing order unless the accepted specification explicitly requires the
new provenance check earlier.

- [ ] **Step 10: Route every profiled CLI claim and handoff through the resolver**

In `co-review.mjs`, resolve provider/session for both owner and reviewer claims
and both handoffs, then pass the pair into protocol functions. Delete the
current reviewer-only `detectProvider()`/`resolveSessionId()` imports and the
`FALLBACK_SESSION_ID` comparison. Their absence is a greppable completion
condition.

Update `formatStatus()` so a live claim renders role, actor, provider, `sid`,
revision, and time. Preserve `none` when no claim is live. JSON status continues
to serialize the validated state; add the Step 3 unit assertion for both
surfaces so acceptance cannot accidentally prove JSON only.

After a successful reviewer protocol claim, publish the reviewer operational
index from the returned authoritative claim. Implement the retryable and
terminal index diagnostics from Step 5 without rolling back or duplicating the
protocol claim.

- [ ] **Step 11: Build archive provenance from selected handoffs only**

In `archive.mjs`, derive owner and reviewer evidence provenance from the claim
reference embedded in each selected handoff event. Include the exact pair and
claim identity in prepared and rendered manifests, validate it during normal
inspection and foreign recovery, and reject environment/index/role-derived
substitutes. Keep legacy archive reading behind its explicit profile-less path.

- [ ] **Step 12: Run focused GREEN and targeted quality checks**

Run the Step 7 command, then:

```bash
npx prettier --check \
  scripts/review/co-review.mjs \
  scripts/review/lib/provider-session.mjs \
  scripts/review/lib/protocol.mjs \
  scripts/review/lib/index.mjs \
  scripts/review/lib/start.mjs \
  scripts/review/lib/archive.mjs \
  scripts/tests/fixtures/co-review-handoff-cases.mjs \
  scripts/tests/fixtures/co-review-start-cases.mjs \
  scripts/tests/fixtures/co-review-e2e-cases.mjs \
  scripts/tests/fixtures/co-review-fixture.mjs \
  scripts/tests/fixtures/co-review-consistency-cases.mjs \
  scripts/tests/fixtures/co-review-finalization-cases.mjs \
  scripts/tests/fixtures/co-review-supplement-cases.mjs \
  scripts/tests/fixtures/co-review-budget-cases.mjs \
  scripts/tests/unit/review/co-review-provider-session.test.mjs \
  scripts/tests/unit/review/co-review-fixture-cost.test.mjs \
  scripts/tests/unit/review/co-review.test.mjs \
  scripts/tests/unit/review/co-review-index.test.mjs \
  scripts/tests/unit/review/co-review-finalization.test.mjs \
  scripts/tests/slow/review/co-review-boundaries.test.mjs
npx eslint \
  scripts/review/co-review.mjs \
  scripts/review/lib/provider-session.mjs \
  scripts/review/lib/protocol.mjs \
  scripts/review/lib/index.mjs \
  scripts/review/lib/start.mjs \
  scripts/review/lib/archive.mjs \
  scripts/tests/fixtures/co-review-handoff-cases.mjs \
  scripts/tests/fixtures/co-review-start-cases.mjs \
  scripts/tests/fixtures/co-review-e2e-cases.mjs \
  scripts/tests/fixtures/co-review-fixture.mjs \
  scripts/tests/fixtures/co-review-consistency-cases.mjs \
  scripts/tests/fixtures/co-review-finalization-cases.mjs \
  scripts/tests/fixtures/co-review-supplement-cases.mjs \
  scripts/tests/fixtures/co-review-budget-cases.mjs \
  scripts/tests/unit/review/co-review-provider-session.test.mjs \
  scripts/tests/unit/review/co-review-fixture-cost.test.mjs \
  scripts/tests/unit/review/co-review.test.mjs \
  scripts/tests/unit/review/co-review-index.test.mjs \
  scripts/tests/unit/review/co-review-finalization.test.mjs \
  scripts/tests/slow/review/co-review-boundaries.test.mjs
git diff --check
```

Expected: every focused test and targeted quality check passes. Search current
production to confirm no profiled path calls the three forbidden helpers and no
diagnostic or persisted file prints a session value.

- [ ] **Step 13: Commit authoritative provider/session provenance**

```bash
git add \
  scripts/review/co-review.mjs \
  scripts/review/lib/provider-session.mjs \
  scripts/review/lib/protocol.mjs \
  scripts/review/lib/index.mjs \
  scripts/review/lib/start.mjs \
  scripts/review/lib/archive.mjs \
  scripts/tests/fixtures/co-review-handoff-cases.mjs \
  scripts/tests/fixtures/co-review-start-cases.mjs \
  scripts/tests/fixtures/co-review-e2e-cases.mjs \
  scripts/tests/fixtures/co-review-fixture.mjs \
  scripts/tests/fixtures/co-review-consistency-cases.mjs \
  scripts/tests/fixtures/co-review-finalization-cases.mjs \
  scripts/tests/fixtures/co-review-supplement-cases.mjs \
  scripts/tests/fixtures/co-review-budget-cases.mjs \
  scripts/tests/unit/review/co-review-provider-session.test.mjs \
  scripts/tests/unit/review/co-review-fixture-cost.test.mjs \
  scripts/tests/unit/review/co-review.test.mjs \
  scripts/tests/unit/review/co-review-index.test.mjs \
  scripts/tests/unit/review/co-review-finalization.test.mjs \
  scripts/tests/slow/review/co-review-boundaries.test.mjs
git commit -m "[#1406] Bind co-review evidence to provider sessions"
```

Inspect the staged name-status list before committing. No
`session-id.mjs`/provider-adapter behavior, schema-version rename, issue body,
runtime evidence, #1381 file, or successor defect belongs in this commit.

---

### Task 6: Prove the Installed Hook Chain and Full A-to-B Relay

**Files:**

- Modify:
  `scripts/tests/integration/task-tracker/lib/co-review-reviewer-capability.test.mjs`
- Modify: `scripts/tests/fixtures/co-review-e2e-cases.mjs`
- Modify: `scripts/tests/unit/review/co-review-finalization.test.mjs`
- Verify:
  `scripts/tests/integration/task-tracker/verbs/github-record-approval-close-gates.test.mjs`

**Interfaces:**

- Consumes: installed Claude/Grok/Codex guard commands, co-review CLI, provider
  and session environment, profiled claim/handoff/archive envelopes, and a real
  temporary Git repository.
- Produces: end-to-end proof that a live claim changes no ordinary tool result,
  owner lifecycle commands remain usable, every evidence-producing turn binds
  to its distinct native provider/session, A cannot approve B, and exit 4
  recovery never repeats terminal handoff.

- [ ] **Step 1: Extend the installed-chain harness across deep-review commands**

Extend Task 3's temporary repository and real-installer harness. Read the
installed hook configuration in order and invoke each matching Bash or
direct-write handler with the same payload, provider, session, and
`TT_SKIP_NETWORK=1` environment.

The test must establish a live reviewer claim and expand the already-green
pipeline case to:

```js
const commands = [
  'git status --short | sed -n "1,5p"',
  'find scripts/review -maxdepth 2 -type f | sort',
  'git branch --show-current',
  'node --test scripts/tests/unit/review/co-review-fixture-cost.test.mjs',
  'npm run build --if-present',
];
```

This is an acceptance-only extension after Task 3's production change. Its
red-before-green receipt is the installed-chain failure captured in Task 3;
do not recreate the retired diagnostic or add a synthetic failing assertion.

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
assert.deepEqual(repository.changedPathsBetween(root, A, B), ['docs/artifact.md']);
assert.throws(() => reviewerHandoff({ reviewOf: A, currentArtifact: B }), /co-review:review-of/);
assert.deepEqual(repeatIdenticalHandoff(), firstResult);
assert.throws(conflictingReuse, /co-review:/);
```

Drive separate owner and reviewer provider/session identities against the same
physical worktree and runtime. Launch each provider-scoped command environment
with only that role's own provider-native session keys; explicitly unset the
other adapters' native keys so a child-of-parent test launch does not inherit a
second contributor and correctly fail as ambiguous. Do not unset ordinary
non-session environment needed by the installer. Assert the persisted owner and
reviewer claims name different providers and different `sid` values.

Simulate bounded waits with timeout 0/1 so the test stays deterministic; assert
exit 3 timeout, exit 0 wake, every configured cycle record, final status plus
the human-visible stall report at cycle exhaustion, and no unconfigured extra
poll. Inject one integrity refusal and assert exactly one settled re-read before
the episode stops.

After terminal acceptance, inspect status and the archive manifest and assert
every artifact, response, review, actor, provider/session, round, decision,
blob/digest, claim-reference, and commit relationship binds to the expected A
or B evidence. Re-run inspection and foreign-archive recovery under unrelated
current environment values to prove the archive is handoff-sourced rather than
re-derived.

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

### Task 7: Reconcile Packaging, Test Corpus, and Test-Impact Authority

**Files:**

- Modify: `scripts/tests/unit/meta/package-test-corpus.test.mjs`
- Modify: `scripts/tests/unit/meta/test-corpus-membership.test.mjs`
- Modify: `scripts/task-tracker/test-impact-manifest.json`
- Add/delete JSON records under
  `scripts/tests/fixtures/test-corpus-post-snapshot/**`

**Interfaces:**

- Consumes: final production/test file set from Tasks 1–6.
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
'package/scripts/review/lib/provider-session.mjs',
'package/scripts/review/lib/runtime-root.mjs',
'package/scripts/review/lib/repository-boundary.mjs',
```

- [ ] **Step 2: Reconcile post-snapshot records**

Delete records for the two deleted tests. Add schema-1 records for the new
parser unit test, provider/session resolver unit test, and installed-chain
integration test using their deterministic paths, for example:

```json
{
  "schema": 1,
  "path": "scripts/tests/unit/task-tracker/lib/apply-patch-targets.test.mjs"
}
```

Do not edit the frozen pre-move manifest.

- [ ] **Step 3: Add the net-new test-impact rule**

Append a rule shaped as follows, using only final paths that exist after Tasks
1–6:

```json
{
  "sources": [
    "scripts/task-tracker/activity-guard.mjs",
    "scripts/task-tracker/bash-guard.mjs",
    "scripts/task-tracker/source-edit-gate.mjs",
    "scripts/task-tracker/lib/apply-patch-targets.mjs",
    "scripts/review/co-review.mjs",
    "scripts/review/lib/provider-session.mjs",
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
    "scripts/tests/unit/review/co-review-provider-session.test.mjs",
    "scripts/tests/unit/review/co-review-index.test.mjs",
    "scripts/tests/unit/review/co-review-fixture-cost.test.mjs",
    "scripts/tests/unit/review/co-review.test.mjs",
    "scripts/tests/unit/review/co-review-finalization.test.mjs",
    "scripts/tests/unit/task-tracker/lib/apply-patch-targets.test.mjs"
  ],
  "reason": "SHA-bound one-worktree co-review authority, provider-session evidence, and installed guard behavior"
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

Expected: PASS with no retired module/test reference and all three new tests
present in corpus authority.

- [ ] **Step 5: Search current production, tests, and operator docs for stale
      policy references**

Run:

```bash
rg -n \
  "co-review-write-policy|mutation-targets|reviewer-co-review-command|pending review artifact|reviewer mutation destinations are incomplete or ambiguous|Arbitrary Bash remains blocked" \
  scripts docs/guides
rg -n \
  "detectProvider|resolveSessionId|sessionIdEnvKeys\\(|FALLBACK_SESSION_ID" \
  scripts/review/co-review.mjs scripts/review/lib
```

Expected: neither search returns a match. There is no production,
current-test, or current-guide stale policy reference and no forbidden general
provider/session helper on the profiled CLI path. Historical specifications,
plans, and review evidence under `docs/superpowers/**` are excluded from the
policy cleanup and remain immutable.

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

### Task 8: Run Full Verification and Prepare Fresh Official Acceptance

**Files:**

- Verify only; do not change source to make this task pass without returning to
  the owning failed task.
- Runtime output: new ignored directory under `.tmp/` for fresh official
  co-review acceptance.

**Interfaces:**

- Consumes: all commits from Tasks 1–7.
- Produces: complete focused/full-suite receipts and a fresh-runtime handoff for
  official A-to-B acceptance after integration.

- [ ] **Step 1: Verify the final tracked file boundary**

Run:

```bash
git status --short
git diff --name-status c74408db033c2d50df8b25e9fcaf11dee46f579a..HEAD
git diff --check c74408db033c2d50df8b25e9fcaf11dee46f579a..HEAD
```

Expected: clean worktree; only planned production, test, fixture, guide, and
manifest paths plus the amended specification and reviewed plan artifacts
changed; no whitespace errors.

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
  scripts/tests/unit/review/co-review-provider-session.test.mjs \
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
npm run lint
npm run format:check
```

Expected: every command exits 0. `npm run lint` includes Markdown lint and
spelling, so do not run those two nested scripts redundantly here. Do not claim
Test readiness from a partial suite.

- [ ] **Step 4: Verify installed artifacts and stale-reference absence**

Run:

```bash
npm pack --dry-run
rg -n \
  "reviewer mutation destinations are incomplete or ambiguous|Arbitrary Bash remains blocked|pending review artifact" \
  scripts docs/guides
rg -n \
  "detectProvider|resolveSessionId|sessionIdEnvKeys\\(|FALLBACK_SESSION_ID" \
  scripts/review/co-review.mjs scripts/review/lib
```

Expected: package includes `apply-patch-targets.mjs` and
`provider-session.mjs`, excludes retired modules, and the stale-reference search
returns no current production/guide matches. The forbidden-helper search also
returns no match anywhere on the co-review CLI or library path, including the
removed `FALLBACK_SESSION_ID` import/comparison.

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
claim. Give each session an environment containing only its own provider-native
session keys and explicitly remove the other provider-native keys. Execute the
specification's exact A → changes-requested → B → accepted scenario with bounded
repeated waits. Confirm the two persisted claim pairs are distinct and the
archive reproduces them from selected handoffs under an unrelated inspection
environment. Do not import any claim, response, review, or acceptance from the
old #1381 runtime.

- [ ] **Step 8: Stop at the governed handoff boundary**

Report the exact implementation commit, focused/full verification receipts,
fresh runtime path, and any remaining deferred #1381 concerns. Do not push,
deliver, merge, promote, approve, close, or mutate #1381.

---

### Task 9: Correct Cumulative Active-Time Review Validation

This Review-stage amendment supersedes Task 8 Step 8 only for the explicitly
approved #1406 validator repair. It creates no successor defect and does not
change #1406 timing evidence or any timing repair command.

**Files:**

- Modify:
  `scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence.test.mjs`
- Modify:
  `scripts/task-tracker/lib/agent-review/validators/timing-log-sequence.mjs`

**Interfaces:**

- Consumes: `SUSPICIOUS_GAP_SEC`, adjacent timing-row timestamps, departure
  classification, and the existing `validate(context)` contract.
- Produces: the same `{ pass, failures }` result, with the threshold applied
  only to an individual unbracketed adjacent-row wall-clock span.

- [ ] **Step 1: Add the failing cumulative-active regression**

Add a validator test that constructs several active spans shorter than eight
hours, separates them with explicit `pause`/`resumed` pairs, and finishes with a
`develop:completed` row carrying `<!-- row-sec: a=33466 i=43626 -->`.

```js
test('passes cumulative active time above eight hours when every active span is bounded', () => {
  const rows = [
    [T(0), 'develop:started'],
    ['2026-07-14 07:00:00 -05:00', 'pause'],
    ['2026-07-14 09:00:00 -05:00', 'resumed'],
    ['2026-07-14 16:00:00 -05:00', 'pause'],
    ['2026-07-14 18:00:00 -05:00', 'resumed'],
    [
      '2026-07-14 20:00:00 -05:00',
      'develop:completed',
      'development complete',
      '<!-- row-sec: a=33466 i=43626 -->',
    ],
  ];
  const res = validate(logCtx(rows, GOOD_STAGES));
  assert.equal(res.pass, true, JSON.stringify(res.failures));
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence.test.mjs
```

Expected: FAIL only because the cumulative `row-sec.activeSec` check reports a
`suspicious active duration` objection.

- [ ] **Step 3: Remove the cumulative-cache threshold check**

In `timing-log-sequence.mjs`, remove `parseRowSecMarker` from the import and
delete only this block:

```js
const rowSec = parseRowSecMarker(row.raw);
if (rowSec && rowSec.activeSec > SUSPICIOUS_GAP_SEC) {
  failures.push(/* cumulative-duration objection */);
}
```

Retain the adjacent-row wall-clock comparison against
`SUSPICIOUS_GAP_SEC`. Update the existing #899-shaped regression to assert that
this wall-clock check, rather than cumulative cache inspection, rejects the
unbracketed many-hour span.

- [ ] **Step 4: Verify GREEN and surrounding timing coverage**

Run:

```bash
node --test \
  scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence.test.mjs \
  scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence-audit-rows.test.mjs \
  scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence-update-slug.test.mjs
```

Expected: PASS with the new cumulative-duration regression, existing
unbracketed-gap refusal, explicit-pause acceptance, stage walk, and audit-row
coverage all green.

- [ ] **Step 5: Commit the focused repair**

```bash
git add \
  scripts/task-tracker/lib/agent-review/validators/timing-log-sequence.mjs \
  scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence.test.mjs
git commit -m "[#1406] Validate timing gaps instead of cumulative work"
```

- [ ] **Step 6: Re-run governed #1406 verification**

Demote #1406 to Develop before editing source, complete the RED/GREEN cycle,
then run the issue's exact Verification Commands and Functional DoD at one
clean tracked HEAD. Return through Test and re-run the Agent Review Gate. Do not
touch #1407, #1381, or #939.

---

### Task 10: Recover Delivery Across a Structurally Verified Branch Merge

This post-merge amendment repairs #1406's own governed close path. It creates no
successor defect and does not relax attribution for ordinary commits or open
pull requests.

**Files:**

- Modify: `scripts/task-tracker/verbs/deliver.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/deliver.test.mjs`
- Create:
  `scripts/tests/unit/task-tracker/verbs/deliver-merged-source-attribution.test.mjs`
- Create:
  `scripts/tests/fixtures/test-corpus-post-snapshot/unit/task-tracker/verbs/deliver-merged-source-attribution.test.mjs.json`

- [ ] **Step 1: Add failing merged-recovery topology tests**

Add a merged-PR recovery case whose immutable source records include attributed
ordinary commits plus one unattributed commit. Prove that the case succeeds only
when inspection of that exact SHA returns the same title and at least two
parents. Add refusals for a one-parent commit and an inspected-title mismatch.
Also prove the open-PR path remains strict and never applies the exception.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
node --test \
  scripts/tests/unit/task-tracker/verbs/deliver-merged-source-attribution.test.mjs \
  scripts/tests/unit/task-tracker/verbs/deliver.test.mjs
```

Expected: the structurally valid merged-recovery case fails with
`delivery-preflight:attribution` before the implementation change.

- [ ] **Step 3: Implement the narrow structural exception**

Retain immutable `{ oid, messageHeadline }` records returned by GitHub. During
merged-PR recovery only, inspect each unattributed record's repository commit
object. Omit that subject from attribution input only when the SHA is valid, the
inspected title exactly matches the GitHub headline, and the object has at least
two valid parent SHAs. On missing, malformed, unreadable, or mismatched evidence,
leave the subject in strict attribution input so preflight fails closed.

- [ ] **Step 4: Verify focused GREEN and delivery regressions**

```bash
node --test \
  scripts/tests/unit/task-tracker/verbs/deliver-merged-source-attribution.test.mjs \
  scripts/tests/unit/task-tracker/verbs/deliver.test.mjs \
  scripts/tests/unit/task-tracker/lib/delivery-attribution.test.mjs \
  scripts/tests/unit/task-tracker/lib/delivery-provider-action.test.mjs \
  scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs
```

Expected: all tests pass, including external recovery, ordinary attribution
refusal, provider-action delivery, and exact-byte verification.

- [ ] **Step 5: Commit and rebuild governed evidence**

Commit the amendment and repair with `[#1406]` attribution, run #1406's complete
Verification Commands and Functional DoD at the new clean HEAD, return through
Test and Review, obtain exact-head approval, then deliver and close #1406. Pause
immediately after verifying Done; do not touch #1407, #1381, or #939.

---

### Task 11: Close a Terminal Review Handoff Without Recursive Reengagement

This close-stage amendment repairs #1406's own terminal timing path. It creates
no successor defect and preserves the existing interruption guard for every
non-terminal lifecycle opener.

**Files:**

- Modify: `scripts/task-tracker/gh-timing-comment.mjs`
- Modify:
  `scripts/tests/unit/task-tracker/lib/terminal-review-handoff.test.mjs`

- [ ] **Step 1: Reproduce the live recursive close failure**

Add a regression with an open interruption followed by `review:passed` and
`issue:wrap`. Verify RED with `Maximum call stack size exceeded`.

- [ ] **Step 2: Exempt only a terminal handoff closer from reengagement insertion**

Use the canonical `closesTerminalReviewHandoff` event policy so `issue:wrap`
closes the handoff directly. Keep synthetic `resumed` insertion unchanged for
ordinary lifecycle openers.

- [ ] **Step 3: Verify, commit, and rebuild governed evidence**

Run the terminal-handoff, departure-guard, close-order, and approval-boundary
tests; then run #1406's complete verification at one clean tracked HEAD. Return
through Test and Review, obtain exact-head approval, deliver, and close #1406.
Pause immediately after verifying Done; do not touch #1407, #1381, or #939.
