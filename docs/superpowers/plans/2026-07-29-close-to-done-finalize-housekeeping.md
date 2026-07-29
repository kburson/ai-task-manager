# Close-to-Done Convergence Corrective Implementation Plan

<!-- cspell:words housekeep resumable -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the initial #925 implementation so background child
convergence cannot mutate the active parent session, epic integrity fails closed,
aberration recovery survives fresh processes, and review authority remains
truthful in installed consumer projects.

**Architecture:** Keep the existing move-state saga and replace its fixed
post-commit tail assumption with two explicit effect profiles. Put strict child
inventory, structured recovery state, and review authority behind typed internal
interfaces. Both explicit close and `pull-next` continue to use the shared
closed-issue convergence service, but background convergence excludes
session-local side effects.

**Tech Stack:** Node.js 22+, ECMAScript modules, `node:test`, GitHub CLI,
GraphQL, injected runtime capabilities, AITM issue-body mutation, npm pack
consumer fixtures.

## Global Constraints

- Baseline is commit `89a2770`; Tasks 1–5 from the prior plan already exist on
  the branch and are corrected in place rather than reimplemented from scratch.
- `task-owner` remains the default profile and preserves the exact current
  eight-step post-commit order.
- `background-convergence` keeps issue/project effects and excludes all
  session-local effects.
- Profile and review-authority selection are typed internal parameters, never
  public CLI flags or ambient environment variables.
- Unknown profiles fail before the authoritative board write.
- A successful empty child snapshot is distinct from a failed/unknown snapshot.
- Pending unauthorized-close recovery is durable, machine-readable, and
  resumable by a fresh explicit-close or `pull-next` invocation.
- Missing reviewer metadata never proves Full-Auto or human approval.
- Existing close-first, repair, disposition, cascade, dirty-tree, guard, and
  local-merge behavior remains unchanged.
- Every production change follows RED → GREEN and ends in an issue-scoped
  commit.

---

### Task 1: Introduce Effect-Scoped Move-Tail Profiles

**Files:**

- Create: `scripts/task-tracker/lib/move-state/tail-profiles.mjs`
- Create:
  `scripts/task-tracker/tests/unit/lib/move-state/move-state-tail-profiles.test.mjs`
- Create:
  `scripts/task-tracker/tests/slow/core/packaged-tail-profile-consumer.test.mjs`
- Modify: `scripts/task-tracker/lib/move-state/post-commit-tail.mjs`
- Modify: `scripts/task-tracker/lib/move-state/move-state-core.mjs`
- Modify: `scripts/gh/move-state.mjs`
- Modify: `scripts/task-tracker/runtime.mjs`
- Test:
  `scripts/task-tracker/tests/unit/lib/move-state/move-state-terminal-tail-isolation.test.mjs`
- Test:
  `scripts/task-tracker/tests/unit/lib/move-state/move-state-core.test.mjs`

**Interfaces:**

- `resolveTailProfile(name = 'task-owner') -> { name, scopes }`.
- `selectTailSteps(steps, profileName) -> step[]`.
- Every default tail step carries
  `scope: 'issue' | 'project' | 'session'`.
- `runMoveStateInProcess(issue, state, { tailProfile, reviewAuthority, ... })`
  forwards both values directly to `runMoveStateHost`.
- `runMoveStateHost({ ..., tailProfile = 'task-owner', reviewAuthority = null })`
  validates and attaches them to the saga context.

- [ ] **Step 1: Write the failing pure and packaged-consumer profile tests**

Create tests that pin both profile scope sets, the exact selected step names,
the default behavior, and unknown-profile refusal:

```js
test('task-owner preserves the exact legacy tail', () => {
  assert.deepEqual(
    selectTailSteps(DEFAULT_TAIL_STEPS, 'task-owner').map((s) => s.name),
    [
      'dispatchOnEnterActions',
      'refreshKanbanStateCache',
      'emitFullAutoReviewAudit',
      'unparkDoneDependents',
      'emitOutOfBandAudit',
      'syncTrackerState',
      'syncEventFields',
      'endTaskTracking',
    ]
  );
});

test('background convergence excludes every session effect', () => {
  assert.deepEqual(
    selectTailSteps(DEFAULT_TAIL_STEPS, 'background-convergence').map((s) => s.name),
    [
      'dispatchOnEnterActions',
      'refreshKanbanStateCache',
      'emitFullAutoReviewAudit',
      'unparkDoneDependents',
      'emitOutOfBandAudit',
      'syncEventFields',
    ]
  );
});

test('unknown profiles fail closed', () => {
  assert.throws(() => resolveTailProfile('typo'), /unknown move-tail profile/);
});
```

For the packaged test, use `projectScratchDir('test')`,
`npm pack --json --pack-destination`, and
`npm install --ignore-scripts <tgz>` in a generated consumer package. From that
consumer, run a Node module that imports the installed profile and tail modules,
executes spy steps, and prints:

```text
task-owner=8
background-convergence=6
session-effects=0
```

Assert the installed package still contains `bin/aitm.mjs`,
`skill/adapters/codex/SKILL.md`, and both profiled move-state modules.

- [ ] **Step 2: Verify both tests RED**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/move-state/move-state-tail-profiles.test.mjs
node --test scripts/task-tracker/tests/slow/core/packaged-tail-profile-consumer.test.mjs
```

Expected: both FAIL because `tail-profiles.mjs` and step scopes do not exist.

- [ ] **Step 3: Implement the pure profile registry**

Implement:

```js
export const TAIL_PROFILE_TASK_OWNER = 'task-owner';
export const TAIL_PROFILE_BACKGROUND_CONVERGENCE = 'background-convergence';

const PROFILE_SCOPES = Object.freeze({
  [TAIL_PROFILE_TASK_OWNER]: Object.freeze(['issue', 'project', 'session']),
  [TAIL_PROFILE_BACKGROUND_CONVERGENCE]: Object.freeze(['issue', 'project']),
});

export function resolveTailProfile(name = TAIL_PROFILE_TASK_OWNER) {
  const normalized = String(name || TAIL_PROFILE_TASK_OWNER);
  const scopes = PROFILE_SCOPES[normalized];
  if (!scopes) throw new Error(`unknown move-tail profile: ${normalized}`);
  return { name: normalized, scopes };
}

export function selectTailSteps(steps, profileName) {
  const { scopes } = resolveTailProfile(profileName);
  const allowed = new Set(scopes);
  return (steps || []).filter((step) => allowed.has(step.scope || 'issue'));
}
```

Annotate the default registry without changing order:

```js
{ name: 'dispatchOnEnterActions', scope: 'project', fn: dispatchOnEnterActions }
{ name: 'refreshKanbanStateCache', scope: 'project', fn: refreshKanbanStateCache }
{ name: 'emitFullAutoReviewAudit', scope: 'issue', fn: emitFullAutoReviewAudit }
{ name: 'unparkDoneDependents', scope: 'project', fn: unparkDoneDependents }
{ name: 'emitOutOfBandAudit', scope: 'issue', fn: emitOutOfBandAudit }
{ name: 'syncTrackerState', scope: 'session', fn: syncTrackerState }
{ name: 'syncEventFields', scope: 'issue', fn: syncEventFields }
{ name: 'endTaskTracking', scope: 'session', fn: endTaskTracking }
```

Make `runPostCommitTail` iterate
`selectTailSteps(steps, ctx.tailProfile)`.

- [ ] **Step 4: Validate before mutation and forward typed context**

At the start of both `moveState(ctx)` and `runMoveStateHost`, resolve the
profile before any guard/evidence/status mutation. Extend the in-process runner:

```js
export async function runMoveStateInProcess(
  issue,
  state,
  {
    env: envOverride,
    silent = false,
    extraArgs = [],
    skipNetwork = false,
    tailProfile = 'task-owner',
    reviewAuthority = null,
  } = {},
  deps = {}
) {
  // existing capture logic
  code = await host({ argv, env: mergedEnv, tailProfile, reviewAuthority });
}
```

Set `ctx.tailProfile` and `ctx.reviewAuthority` in `runMoveStateHost`.
Do not add argv flags.

- [ ] **Step 5: Verify profile and legacy-tail compatibility**

Run:

```bash
node --test \
  scripts/task-tracker/tests/unit/lib/move-state/move-state-tail-profiles.test.mjs \
  scripts/task-tracker/tests/unit/lib/move-state/move-state-terminal-tail-isolation.test.mjs \
  scripts/task-tracker/tests/unit/lib/move-state/move-state-core.test.mjs \
  scripts/task-tracker/tests/unit/lib/move-state/transition-plan.test.mjs \
  scripts/task-tracker/tests/unit/core/state-machine-self-transition.test.mjs
```

Expected: PASS; the default profile still reports 8/8 tail steps.

- [ ] **Step 6: Commit the profile boundary**

```bash
git add \
  scripts/task-tracker/lib/move-state/tail-profiles.mjs \
  scripts/task-tracker/lib/move-state/post-commit-tail.mjs \
  scripts/task-tracker/lib/move-state/move-state-core.mjs \
  scripts/gh/move-state.mjs \
  scripts/task-tracker/runtime.mjs \
  scripts/task-tracker/tests/unit/lib/move-state/move-state-tail-profiles.test.mjs \
  scripts/task-tracker/tests/slow/core/packaged-tail-profile-consumer.test.mjs
git commit -m "[#925] refactor(move-state): scope post-commit effects"
```

### Task 2: Carry Explicit Review Authority Through Done Auditing

**Files:**

- Modify: `scripts/task-tracker/lib/human-reviewer-audit.mjs`
- Modify: `scripts/task-tracker/lib/move-state/audit-timing.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/human-reviewer-audit.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/move-state/move-state-tail-profiles.test.mjs`

**Interfaces:**

- `reviewAuthority` is `null | 'human-gate' | 'gate-bypassed'`.
- `enforceFullAutoAudit({ ..., reviewAuthority })` gives precedence to a
  genuine non-full-auto approval marker, then explicit authority, then the
  legacy environment fallback.
- `emitFullAutoReviewAudit(ctx)` forwards `ctx.reviewAuthority`.

- [ ] **Step 1: Write the failing authority matrix**

Add table tests:

```js
const cases = [
  {
    name: 'genuine marker wins over a bypass context',
    body: '<!-- aitm-review-approved ts="2026-07-29T00:00:00Z" -->',
    reviewAuthority: 'gate-bypassed',
    expected: 'human-reviewer',
  },
  {
    name: 'explicit bypass records Full-Auto even with a reviewer env',
    body: '',
    env: { TASK_TRACKER_HUMAN_REVIEWER: 'alice' },
    reviewAuthority: 'gate-bypassed',
    expected: 'full-auto',
  },
  {
    name: 'human gate does not become Full-Auto when reviewer env is absent',
    body: '',
    env: {},
    reviewAuthority: 'human-gate',
    expected: 'human-reviewer',
  },
];
```

Assert `human-gate` writes handle `review-gate` when no explicit handle exists,
and `gate-bypassed` posts the Full-Auto audit comment.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/human-reviewer-audit.test.mjs
```

Expected: the explicit-authority cases FAIL because the function still derives
mode only from body plus environment.

- [ ] **Step 3: Implement explicit authority precedence**

Use:

```js
const genuineReviewMarker = body != null && hasGenuineReviewApprovedMarker(body);
const explicitMode =
  reviewAuthority === 'gate-bypassed'
    ? 'full-auto'
    : reviewAuthority === 'human-gate'
      ? 'human-reviewer'
      : null;
const fullAuto = genuineReviewMarker
  ? false
  : explicitMode
    ? explicitMode === 'full-auto'
    : isFullAuto(env);
const handle = getHumanReviewer(env) || (reviewAuthority === 'human-gate' ? 'review-gate' : null);
```

Reject any non-null authority outside the two allowed values. Pass the value
from `emitFullAutoReviewAudit`.

- [ ] **Step 4: Verify auditing compatibility**

Run:

```bash
node --test \
  scripts/task-tracker/tests/unit/lib/human-reviewer-audit.test.mjs \
  scripts/task-tracker/tests/unit/lib/move-state/move-state-tail-profiles.test.mjs \
  scripts/task-tracker/tests/unit/verbs/approve-full-auto-detect.test.mjs \
  scripts/task-tracker/tests/unit/verbs/approve-full-auto-unified.test.mjs
```

Expected: PASS; legacy null-authority behavior remains unchanged.

- [ ] **Step 5: Commit authority plumbing**

```bash
git add \
  scripts/task-tracker/lib/human-reviewer-audit.mjs \
  scripts/task-tracker/lib/move-state/audit-timing.mjs \
  scripts/task-tracker/tests/unit/lib/human-reviewer-audit.test.mjs \
  scripts/task-tracker/tests/unit/lib/move-state/move-state-tail-profiles.test.mjs
git commit -m "[#925] fix(review): preserve explicit close authority"
```

### Task 3: Add Strict Sub-Issue Board Snapshots

**Files:**

- Create: `scripts/task-tracker/lib/sub-issue-board-snapshot.mjs`
- Create:
  `scripts/task-tracker/tests/unit/lib/sub-issue-board-snapshot.test.mjs`
- Modify: `scripts/task-tracker/runtime.mjs`
- Modify: `scripts/task-tracker/lib/runtime-capabilities.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/runtime-capabilities.test.mjs`

**Interfaces:**

- `normalizeSubIssueBoardSnapshot(data, projectId)`.
- Runtime capability:
  `fetchSubIssueBoardSnapshot(issueNumber) ->`
  `{ status: 'ok', children } | { status: 'unknown', error }`.
- `children` is `Array<{ number, boardState }>` and every successful child
  state is canonical.
- Legacy `fetchSubIssues(issueNumber)` delegates and returns number strings only
  when the strict snapshot is `ok`.

- [ ] **Step 1: Write failing strict-snapshot tests**

Cover a real leaf, two Done children, missing repository issue, missing project
item, null Status, and thrown query:

```js
assert.deepEqual(normalizeSubIssueBoardSnapshot(leafData, 'P1'), {
  status: 'ok',
  children: [],
});
assert.deepEqual(normalizeSubIssueBoardSnapshot(twoDoneChildren, 'P1'), {
  status: 'ok',
  children: [
    { number: 11, boardState: 'done' },
    { number: 12, boardState: 'done' },
  ],
});
assert.equal(normalizeSubIssueBoardSnapshot(missingProjectItem, 'P1').status, 'unknown');
```

Add a runtime source/capability test proving the GraphQL query requests child
project id and Status name in one query.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test \
  scripts/task-tracker/tests/unit/lib/sub-issue-board-snapshot.test.mjs \
  scripts/task-tracker/tests/unit/lib/runtime-capabilities.test.mjs
```

Expected: FAIL because the strict capability is absent.

- [ ] **Step 3: Implement the pure normalizer and runtime query**

Import `normalizeStateId` from `./lifecycle-policy/index.mjs`. The normalizer
returns `unknown` when the repository issue is absent or any child lacks a
matching project item/status:

```js
export function normalizeSubIssueBoardSnapshot(data, projectId) {
  const issue = data?.repository?.issue;
  if (!issue) return { status: 'unknown', error: 'issue unavailable' };
  const children = issue.subIssues?.nodes;
  if (!Array.isArray(children)) return { status: 'unknown', error: 'children unavailable' };
  const normalized = [];
  for (const child of children) {
    const items = child?.projectItems?.nodes || [];
    const item = items.find((node) => node?.project?.id === projectId);
    const boardState = normalizeStateId(item?.fieldValueByName?.name);
    if (!child?.number || !boardState) {
      return { status: 'unknown', error: `child #${child?.number || '?'} board unknown` };
    }
    normalized.push({ number: child.number, boardState });
  }
  return { status: 'ok', children: normalized };
}
```

The runtime catches query errors into `{status:'unknown', error}`. Keep the
legacy facade additive:

```js
ctx.fetchSubIssues = async (issueNum) => {
  const snapshot = await ctx.fetchSubIssueBoardSnapshot(issueNum);
  return snapshot.status === 'ok' ? snapshot.children.map((child) => child.number) : [];
};
```

- [ ] **Step 4: Verify snapshot and existing GraphQL contracts**

Run:

```bash
node --test \
  scripts/task-tracker/tests/unit/lib/sub-issue-board-snapshot.test.mjs \
  scripts/task-tracker/tests/unit/lib/runtime-capabilities.test.mjs \
  scripts/task-tracker/tests/unit/lib/graphql-params.test.mjs \
  scripts/task-tracker/tests/unit/lib/closed-issue-integrity.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit strict inventory**

```bash
git add \
  scripts/task-tracker/lib/sub-issue-board-snapshot.mjs \
  scripts/task-tracker/runtime.mjs \
  scripts/task-tracker/lib/runtime-capabilities.mjs \
  scripts/task-tracker/tests/unit/lib/sub-issue-board-snapshot.test.mjs \
  scripts/task-tracker/tests/unit/lib/runtime-capabilities.test.mjs
git commit -m "[#925] fix(close): fail closed on child inventory"
```

### Task 4: Make Unauthorized-Close Recovery Durable and Resumable

**Files:**

- Modify: `scripts/task-tracker/lib/markers.mjs`
- Modify: `scripts/task-tracker/lib/closed-issue-convergence.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/closed-issue-actions.test.mjs`
- Create:
  `scripts/task-tracker/tests/unit/lib/closed-issue-recovery.test.mjs`
- Modify: `scripts/task-tracker/lib/body-invariants.mjs`
- Modify: `scripts/task-tracker/lib/gh-edit-guard.mjs`

**Interfaces:**

- `upsertProgressMarker(body, { kind, props })`.
- `readUnauthorizedCloseRecovery(body) -> null | recovery`.
- `upsertUnauthorizedCloseRecovery(body, recovery) -> body`.
- Recovery fields:
  `{ tx, phase, stateReason, unticked, actor, ts }`.
- Phases:
  `intent -> reopened -> review -> timing -> complete`.
- `runClosedIssueConvergence` receives `input.recovery` and adapters
  `writeRecoveryPhase`, `timingAuditPresent`, and `createTransactionId`.

- [ ] **Step 1: Write failing marker grammar tests**

Assert exact structured attributes, fenced-example rejection, replacement
without duplication, and field-DB preservation:

```js
const intent = upsertUnauthorizedCloseRecovery(BODY_WITH_FIELDS, {
  tx: 'tx-1',
  phase: 'intent',
  stateReason: 'completed',
  unticked: ['Agent Review Passed'],
  actor: 'octocat',
  ts: '2026-07-29T20:00:00.000Z',
});
assert.equal((intent.match(/aitm-unauthorized-close/g) || []).length, 1);
assert.deepEqual(readUnauthorizedCloseRecovery(intent), {
  tx: 'tx-1',
  phase: 'intent',
  stateReason: 'completed',
  unticked: ['Agent Review Passed'],
  actor: 'octocat',
  ts: '2026-07-29T20:00:00.000Z',
});
assert.equal(readUnauthorizedCloseRecovery(FENCED_EXAMPLE), null);
```

- [ ] **Step 2: Verify marker RED**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/closed-issue-recovery.test.mjs
```

Expected: FAIL because structured recovery readers/writers do not exist.

- [ ] **Step 3: Implement generic protected-marker upsert**

In `markers.mjs`, add a length-preserving fence masker. It replaces every
non-newline character in fenced blocks with a space, so marker offsets in the
masked string map exactly to the original body:

```js
function maskFencedCodeBlocksPreservingOffsets(body) {
  return String(body || '').replace(FENCED_CODE_BLOCK_RE, (block) =>
    block.replace(/[^\r\n]/g, ' ')
  );
}

export function upsertProgressMarker(body, { kind, props = {} } = {}) {
  const marker = serializeMarker(kind, props);
  const src = String(body || '');
  const escapedKind = String(kind).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<!--\\s*aitm-${escapedKind}\\b[^>]*-->`, 'i');
  const match = re.exec(maskFencedCodeBlocksPreservingOffsets(src));
  if (match) {
    return `${src.slice(0, match.index)}${marker}${src.slice(match.index + match[0].length)}`;
  }
  return insertMarkerBeforeFieldDb(src, marker, () => false);
}
```

Use `serializeMarker`/`parseMarker`; store `unticked` as JSON so labels
containing `|`, quotes, or commas round-trip exactly. Keep
`aitm-unauthorized-close` in both invariant registries. Reject an empty or
non-string `kind`, matching the validation style of `appendAuditMarker`.

- [ ] **Step 4: Write failing fresh-invocation recovery tests**

For each injected failure point—intent write, reopen, reopened write, Review
move, Review write, timing post, timing write, completion write—run once,
construct a fresh service invocation from the durable marker store, clear the
failure, and assert:

```js
assert.equal(second.status, 'recovered');
assert.equal(store.phase, 'complete');
assert.equal(calls.filter((call) => call === 'postTimingAudit').length, 1);
```

Also assert `{ok:false, queued:true}` from `postTimingAudit` leaves phase
`review` and returns `status:'failed'`.

- [ ] **Step 5: Implement the phase machine**

Use a rank map and persist after every satisfied effect:

```js
const PHASE_RANK = { intent: 0, reopened: 1, review: 2, timing: 3, complete: 4 };
const atLeast = (phase, target) => PHASE_RANK[phase] >= PHASE_RANK[target];

if (!recovery) recovery = await writeRecoveryPhase('intent', seed);
if (!atLeast(recovery.phase, 'reopened')) {
  if (input.issueClosed) await runStep('reopenIssue');
  recovery = await writeRecoveryPhase('reopened', recovery);
}
if (!atLeast(recovery.phase, 'review')) {
  if (String(input.boardState).toLowerCase() !== 'review') await runStep('moveToReview');
  recovery = await writeRecoveryPhase('review', recovery);
}
if (!atLeast(recovery.phase, 'timing')) {
  if (!(await deps.timingAuditPresent(recovery.tx))) await runStep('postTimingAudit');
  recovery = await writeRecoveryPhase('timing', recovery);
}
recovery = await writeRecoveryPhase('complete', recovery);
```

Treat a failed adapter result as failure, not success. Return the durable phase
and failed step.

- [ ] **Step 6: Verify recovery and action compatibility**

Run:

```bash
node --test \
  scripts/task-tracker/tests/unit/lib/closed-issue-recovery.test.mjs \
  scripts/task-tracker/tests/unit/lib/closed-issue-actions.test.mjs \
  scripts/task-tracker/tests/unit/lib/body-invariants.test.mjs \
  scripts/task-tracker/tests/unit/lib/gh-edit-guard-body.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit resumable recovery**

```bash
git add \
  scripts/task-tracker/lib/markers.mjs \
  scripts/task-tracker/lib/closed-issue-convergence.mjs \
  scripts/task-tracker/lib/body-invariants.mjs \
  scripts/task-tracker/lib/gh-edit-guard.mjs \
  scripts/task-tracker/tests/unit/lib/closed-issue-actions.test.mjs \
  scripts/task-tracker/tests/unit/lib/closed-issue-recovery.test.mjs
git commit -m "[#925] fix(close): persist resumable recovery"
```

### Task 5: Rewire Explicit Close Around Authority Precedence

**Files:**

- Modify: `scripts/task-tracker/verbs/close.mjs`
- Modify: `scripts/task-tracker/lib/close-convergence.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/close-convergence-finalize.test.mjs`
- Create:
  `scripts/task-tracker/tests/unit/verbs/close-convergence-wiring.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/verbs/close-reconcile-lifecycle.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/verbs/close-converge-audit-emission.test.mjs`

**Interfaces:**

- `decideCloseConvergence` additionally accepts `recoveryPhase`.
- Pending recovery outranks dead/noop/close-issue/proceed but remains below
  explicit `repair`.
- `verbClose` consumes `issueBodyMutator.mutate` and
  `githubClient.fetchSubIssueBoardSnapshot`.
- `ctx.convergenceTailProfile` defaults to `task-owner`.

- [ ] **Step 1: Extend the decision table with recovery precedence**

Add tests proving:

```js
assert.deepEqual(
  decideCloseConvergence({
    issueClosed: false,
    boardState: 'review',
    recoveryPhase: 'review',
  }),
  { action: 'aberration', resume: true }
);
assert.deepEqual(
  decideCloseConvergence({
    repair: true,
    issueClosed: false,
    recoveryPhase: 'review',
  }),
  { action: 'proceed', repair: true }
);
```

`phase='complete'` is not pending and follows normal open-state policy.

- [ ] **Step 2: Write failing production-wiring tests**

Drive the real `verbClose` with grouped injected capabilities and assert:

1. A dead issue returns without body or child reads.
2. A completed issue already at Done tolerates a failed best-effort body read.
3. A completed/not-Done issue refuses when strict child snapshot is unknown.
4. A pending recovery on an open issue resumes.
5. Finalize calls `runMoveStateDone` with:

```js
{
  tailProfile: ctx.convergenceTailProfile || 'task-owner',
  reviewAuthority: fullAuto ? 'gate-bypassed' : 'human-gate',
}
```

6. A queued timing audit returns failure and leaves recovery pending.

- [ ] **Step 3: Verify wiring RED**

Run:

```bash
node --test \
  scripts/task-tracker/tests/unit/lib/close-convergence-finalize.test.mjs \
  scripts/task-tracker/tests/unit/verbs/close-convergence-wiring.test.mjs
```

Expected: FAIL on recovery precedence, strict snapshot handling, and profile
arguments.

- [ ] **Step 4: Reorder inspection and use strict capabilities**

Implement this sequence:

1. Read board and issue close snapshot.
2. If `repair`, run the existing pipeline.
3. If closed/non-completed, return `dead` without body/child reads.
4. If closed/completed/Done, run noop housekeeping with best-effort body reads.
5. For open/not-Done, read body to discover pending recovery; a read failure
   fails closed because normal close also requires the body.
6. For closed/completed/not-Done, require a successful body read and strict
   child snapshot before deriving integrity.
7. Execute the shared service.

Use the grouped `issueBodyMutator` seam for every recovery marker write. Remove
the direct `mutateIssueBody` dependency from this branch.

- [ ] **Step 5: Verify explicit-close regressions**

Run:

```bash
node --test \
  scripts/task-tracker/tests/unit/lib/close-convergence-finalize.test.mjs \
  scripts/task-tracker/tests/unit/verbs/close-convergence-wiring.test.mjs \
  scripts/task-tracker/tests/unit/verbs/close-reconcile-lifecycle.test.mjs \
  scripts/task-tracker/tests/unit/verbs/close-converge-audit-emission.test.mjs \
  scripts/task-tracker/tests/unit/lib/close-repair.test.mjs \
  scripts/task-tracker/tests/unit/core/close-emission-order.test.mjs \
  scripts/task-tracker/tests/slow/verbs/coverage-close.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit close authority wiring**

```bash
git add \
  scripts/task-tracker/verbs/close.mjs \
  scripts/task-tracker/lib/close-convergence.mjs \
  scripts/task-tracker/tests/unit/lib/close-convergence-finalize.test.mjs \
  scripts/task-tracker/tests/unit/verbs/close-convergence-wiring.test.mjs \
  scripts/task-tracker/tests/unit/verbs/close-reconcile-lifecycle.test.mjs \
  scripts/task-tracker/tests/unit/verbs/close-converge-audit-emission.test.mjs
git commit -m "[#925] fix(close): enforce convergence authority"
```

### Task 6: Make Pull-Next Use Real Background Convergence

**Files:**

- Modify: `scripts/gh/lib/wave-admission.mjs`
- Modify: `scripts/task-tracker/lib/epic-children-gate.mjs`
- Modify: `scripts/task-tracker/verbs/pull-next.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/epic-child-disposition-gate.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/epic-children-gate-core.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/verbs/pull-next-close-convergence.test.mjs`
- Create:
  `scripts/task-tracker/tests/unit/verbs/pull-next-background-profile.test.mjs`

**Interfaces:**

- Child model adds
  `{ recoveryPhase: null | pendingPhase, recoveryTx: null | string }`.
- GitHub child mapping parses the protected marker from the already-selected
  child body.
- A convergence candidate is either closed/not-Done or has a pending recovery
  phase.
- `defaultConvergeClosedIssue` sets
  `ctx.convergenceTailProfile = 'background-convergence'` before calling
  `verbClose`.

- [ ] **Step 1: Write failing child-mapping tests**

Extend child fixtures with `body` and assert a top-level pending marker maps to
`recoveryPhase`, a completed marker maps to null, and a fenced example maps to
null.

- [ ] **Step 2: Write the failing real-profile adapter test**

Export the default adapter and inject only its constructor/callee seams:

```js
const ctx = { preserveActiveOnConvergence: false };
await defaultConvergeClosedIssue(
  { issueNumber: 101 },
  {
    buildContextFn: () => ctx,
    closeFn: async (received) => {
      assert.equal(received.convergenceTailProfile, 'background-convergence');
      assert.equal(received.preserveActiveOnConvergence, true);
      return { action: 'finalize', status: 'completed' };
    },
  }
);
```

Add a tail integration assertion that a background Done move runs spy
issue/project steps but never the `syncTrackerState` or `endTaskTracking` spies.

- [ ] **Step 3: Verify RED**

Run:

```bash
node --test \
  scripts/task-tracker/tests/unit/verbs/pull-next-background-profile.test.mjs \
  scripts/task-tracker/tests/unit/verbs/pull-next-close-convergence.test.mjs \
  scripts/task-tracker/tests/unit/lib/epic-child-disposition-gate.test.mjs
```

Expected: FAIL because child recovery state and the background profile are not
plumbed.

- [ ] **Step 4: Implement pending-recovery selection**

Fetch/map child body additively and select:

```js
const candidates = children.filter((child) => {
  const rawBoardState = normalizeStateId(child.boardState);
  const closedBehind =
    String(child.state).toLowerCase() === 'done' && rawBoardState && rawBoardState !== 'done';
  return closedBehind || isPendingRecoveryPhase(child.recoveryPhase);
});
```

For a recovered or failed transaction, return `self-heal-paused` and do not
promote. Only `phase='complete'` may continue selection.

- [ ] **Step 5: Verify pull-next, child mapping, and active-parent isolation**

Run:

```bash
node --test \
  scripts/task-tracker/tests/unit/verbs/pull-next-background-profile.test.mjs \
  scripts/task-tracker/tests/unit/verbs/pull-next-close-convergence.test.mjs \
  scripts/task-tracker/tests/unit/verbs/pull-next-verb.test.mjs \
  scripts/task-tracker/tests/unit/lib/epic-child-disposition-gate.test.mjs \
  scripts/task-tracker/tests/unit/lib/epic-children-gate-core.test.mjs \
  scripts/task-tracker/tests/unit/gh/lib/wave-admission.test.mjs
```

Expected: PASS; the active parent state and timer spies remain untouched.

- [ ] **Step 6: Commit background convergence**

```bash
git add \
  scripts/gh/lib/wave-admission.mjs \
  scripts/task-tracker/lib/epic-children-gate.mjs \
  scripts/task-tracker/verbs/pull-next.mjs \
  scripts/task-tracker/tests/unit/lib/epic-child-disposition-gate.test.mjs \
  scripts/task-tracker/tests/unit/lib/epic-children-gate-core.test.mjs \
  scripts/task-tracker/tests/unit/verbs/pull-next-close-convergence.test.mjs \
  scripts/task-tracker/tests/unit/verbs/pull-next-background-profile.test.mjs
git commit -m "[#925] fix(pull-next): isolate child convergence"
```

### Task 7: Prove Repository and Packaged-Consumer Compatibility

**Files:**

- Test:
  `scripts/task-tracker/tests/slow/core/packaged-tail-profile-consumer.test.mjs`
- Modify:
  `scripts/task-tracker/tests/fixtures/state-engine-policy-baseline.mjs`
  only when emitter coordinates changed

**Interfaces:**

- The packed package exposes the same public bins and skill paths as before.
- The consumer test installs the generated `.tgz` under the scoped package name
  and deep-imports internal modules only for verification; this does not create
  a supported public JavaScript API.

- [ ] **Step 1: Re-run the packaged-consumer proof**

```bash
node --test scripts/task-tracker/tests/slow/core/packaged-tail-profile-consumer.test.mjs
```

Expected: PASS with the exact three output lines established by Task 1.

- [ ] **Step 2: Run focused affected-area verification**

Run:

```bash
node --test \
  scripts/task-tracker/tests/unit/lib/move-state/*.test.mjs \
  scripts/task-tracker/tests/unit/lib/close-convergence*.test.mjs \
  scripts/task-tracker/tests/unit/lib/closed-issue-*.test.mjs \
  scripts/task-tracker/tests/unit/lib/sub-issue-board-snapshot.test.mjs \
  scripts/task-tracker/tests/unit/verbs/close-*.test.mjs \
  scripts/task-tracker/tests/unit/verbs/pull-next*.test.mjs \
  scripts/task-tracker/tests/unit/lib/human-reviewer-audit.test.mjs \
  scripts/task-tracker/tests/unit/lib/runtime-capabilities.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run static and full verification**

Run separately and record each exit:

```bash
npm run lint
npm run format:check
npm test
npm run test:slow
npx aitm verify-develop
git diff --check origin/trunk...HEAD
```

Expected: all commands exit 0; fast and slow lane file counts match the current
repository discovery output.

- [ ] **Step 4: Commit any mechanical baseline refresh**

```bash
git add scripts/task-tracker/tests/fixtures/state-engine-policy-baseline.mjs
git commit -m "[#925] test(policy): refresh convergence coordinates"
```

Run this step only if the characterization fixture changed. Do not create an
empty commit.

- [ ] **Step 5: Update the commit trail and enter governed Test**

```bash
npx aitm commit-trace 925
npx aitm test 925
```

Expected: the sandbox verifies every declared command, stamps fresh AC/DoD
evidence, and moves #925 from Develop to Test.
