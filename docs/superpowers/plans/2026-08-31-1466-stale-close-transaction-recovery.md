# Stale Close Transaction Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit, audited, fail-closed restart for a stale Delivered close transaction that has completed only pre-terminal steps, then use it to close #1461.

**Architecture:** A focused supersession module owns strict record validation, comment projection, intent reuse, live-state authorization, and guarded body replacement. `verbClose` owns sequencing: establish fresh delivery and Review authority, prove clean/live pre-terminal state, persist and read back immutable supersession evidence, replace the protected body transaction, then resume the existing idempotent close saga from an empty completed-step list.

**Tech Stack:** Node.js ES modules, built-in `node:test`, GitHub CLI REST calls through injected `pexec`, canonical AITM marker codecs, the versioned issue-body mutator, and existing close-convergence helpers.

## Global Constraints

- The only entry point is `npx aitm close #N --restart-stale-transaction`; it stays distinct from `--repair` and cannot be combined with `--force`, `--repair`, or a disposition lane.
- Recovery requires an open Review issue, the matching active assignment and recorded worktree binding, a clean checkout, and exact current-HEAD Test, Review, and delivery authority.
- Only the contiguous prefixes `[]`, `[timing]`, `[timing, estimation]`, and `[timing, estimation, lifecycle]` are restartable.
- Any durable or live evidence of `board`, `disposition`, `issue`, `labels`, or `binding` completion refuses before mutation.
- The immutable supersession comment must be created and read-back verified before the protected body marker changes.
- A retry reuses the replacement transaction ID already named by matching supersession evidence; it never rotates identity after evidence exists.
- The replacement transaction uses the current accepted SHA, current Review authority, and `completedSteps: []`; the existing close saga performs all terminal work.
- Generic issue-body protected-marker enforcement and ordinary close behavior remain unchanged.
- #1466 is an independent blocker, not a native #1117 child; retain the approved dependency order #1466 -> #1461 -> #1462 -> #1463 -> #1117 -> #937.
- Work serially in `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1117-state-components`; preserve `node_modules/ai-task-manager -> ..` and unrelated worktree content.

---

## File map

- Create `scripts/task-tracker/lib/delivered-close-supersession.mjs`: strict supersession record/comment codec, intent resolution, pre-terminal authorization, comment write/readback orchestration, and guarded transaction replacement.
- Create `scripts/tests/unit/task-tracker/lib/delivered-close-supersession.test.mjs`: pure and injected-I/O coverage for malformed records, conflicts, lost responses, retry reuse, live-state refusal, and exact body replacement.
- Modify `scripts/task-tracker/verbs/close.mjs`: parse the explicit flag, establish fresh authority, gather live recovery evidence, call the supersession module before terminal mutation, and resume the existing saga with the replacement transaction.
- Modify `scripts/tests/helpers/close-convergence-wiring-helpers.mjs`: expose restart flags, mutable comment fixtures, comment call counters, dirty-check injection, and accepted-SHA overrides to close wiring tests.
- Modify `scripts/tests/unit/task-tracker/verbs/close-delivered-idempotence.test.mjs`: prove the full restart path, audit-before-body ordering, replay, retries, and fail-closed boundaries.
- Modify `scripts/tests/unit/task-tracker/verbs/close-convergence-wiring.test.mjs`: prove close-level authority/readback refusals and unchanged ordinary convergence.
- Verify `scripts/tests/unit/task-tracker/verbs/issue-body.test.mjs`: lock the existing refusal to alter protected Delivered close markers through the generic body verb.
- Modify `scripts/task-tracker/verbs/help-data.mjs`, `scripts/task-tracker/lib/command-surface/catalog.mjs`, and `scripts/tests/unit/task-tracker/verbs/help.test.mjs`: document and lock the public contract.

---

### Task 1: Strict supersession model and guarded replacement

**Files:**

- Create: `scripts/task-tracker/lib/delivered-close-supersession.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/delivered-close-supersession.test.mjs`
- Read: `scripts/task-tracker/lib/close-convergence.mjs`
- Reuse: `scripts/task-tracker/lib/resident-action-ledger-codec.mjs`

**Interfaces:**

- Consumes: `readDeliveredCloseTransactions(body)`, `upsertDeliveredCloseTransaction(body, transaction)`, `canonicalJson(value)`, `encodeCanonical(value)`, `decodeCanonical(value)`, `fingerprint(value)`.
- Produces:
  - `DELIVERED_CLOSE_SUPERSESSION_SCHEMA = 'aitm.delivered-close-supersession/v1'`
  - `DELIVERED_CLOSE_RESTART_REASON = 'accepted-sha-corrective-amend'`
  - `authorizeDeliveredCloseRestart(input) -> frozen authorization`
  - `renderDeliveredCloseSupersessionComment(record) -> string`
  - `parseDeliveredCloseSupersessionComment(comment, context) -> frozen evidence`
  - `resolveDeliveredCloseSupersession(input) -> { action, record, evidence }`
  - `ensureDeliveredCloseSupersession(input) -> verified evidence`
  - `replaceStaleDeliveredCloseTransaction(body, authorization, record) -> { body, transaction }`

- [ ] **Step 1: Write failing codec and authorization tests**

Start the new test with `// @story #1466` and fixtures for a stale transaction:

```js
const OLD_SHA = 'a'.repeat(40);
const NEW_SHA = 'b'.repeat(40);
const OLD_TX = Object.freeze({
  schema: 'aitm.delivered-close/v1',
  transactionId: 'old-tx',
  issueNumber: 1461,
  acceptedSha: OLD_SHA,
  reviewAuthority: 'gate-bypassed',
  completedSteps: ['timing'],
});

const live = Object.freeze({
  boardState: 'review',
  issueClosed: false,
  terminalDisposition: null,
  labels: ['ToDo'],
  bindingStatus: 'pending',
});
```

Assert that authorization accepts only the four allowed prefixes and returns the current SHA and Review authority. Add table-driven refusals for same SHA, wrong issue, non-prefix steps, every prefix containing a terminal step, board Done, Delivered disposition, closed issue, no remaining close-managed label, released/unknown binding, and malformed live reads.

Assert comment round-trip and strict rejection of extra/missing keys, invalid SHAs, invalid authorities, a replacement ID equal to the old ID, an ID mismatch between marker and payload, malformed provider author/timestamps, and `updated_at !== created_at`.

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/delivered-close-supersession.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `delivered-close-supersession.mjs`.

- [ ] **Step 3: Implement the strict record and live-state validators**

Use one exact record shape:

```js
const RECORD_KEYS = Object.freeze([
  'completedSteps',
  'issueNumber',
  'newAcceptedSha',
  'newReviewAuthority',
  'oldAcceptedSha',
  'oldTransactionId',
  'reason',
  'replacementTransactionId',
  'repository',
  'schema',
  'supersessionId',
]);

function coreIntent(input) {
  return {
    issueNumber: input.issueNumber,
    repository: input.repository,
    oldTransactionId: input.oldTransaction.transactionId,
    oldAcceptedSha: input.oldTransaction.acceptedSha,
    newAcceptedSha: input.newAcceptedSha,
    completedSteps: [...input.oldTransaction.completedSteps],
    newReviewAuthority: input.newReviewAuthority,
    reason: DELIVERED_CLOSE_RESTART_REASON,
  };
}

function supersessionId(intent) {
  return `close-restart:${fingerprint(canonicalJson(intent)).replace(/^sha256:/, '')}`;
}
```

`authorizeDeliveredCloseRestart` must compare `oldTransaction.completedSteps` against `TERMINAL_CLOSE_STEPS.slice(0, length)`, reject lengths above three, require Review/open/null-disposition, require at least one of `ToDo` or `BLOCKED`, require `bindingStatus === 'pending'`, and return a deep-frozen authorization containing the old transaction, current accepted SHA, current Review authority, and normalized live state.

- [ ] **Step 4: Implement canonical comment rendering and parsing**

Use the existing URL-safe canonical payload codec rather than free-form JSON attributes:

```js
export function renderDeliveredCloseSupersessionComment(record) {
  const valid = validateRecord(record);
  return [
    'AITM Delivered close transaction supersession. Do not edit or delete this comment.',
    'Use the governed close recovery path for any correction.',
    `<!-- aitm-delivered-close-supersession id="${valid.supersessionId}" data="${encodeCanonical(valid)}" -->`,
  ].join('\n');
}
```

`parseDeliveredCloseSupersessionComment` must accept the REST comment shape `{ id, body, user: { login }, created_at, updated_at, issue_url }`, require canonical timestamps via `normalizeGitHubInstant`, require `created_at === updated_at`, require the payload repository/issue and `issue_url` to match the requested context, validate the marker/payload identity, and return `{ commentId, authorLogin, createdAt, record, body }`. A body that claims the supersession marker but cannot parse throws `delivered-close-supersession:malformed-comment`; unrelated comments return `null`.

- [ ] **Step 5: Implement intent resolution and guarded body replacement**

`resolveDeliveredCloseSupersession` must scan every comment, reject malformed claimed records, select records naming the old transaction, reject any conflicting core intent or more than one candidate, reuse one exact candidate, and generate a replacement UUID only when no candidate exists.

`replaceStaleDeliveredCloseTransaction` must:

```js
const current = readDeliveredCloseTransactions(body);
if (
  current.length !== 1 ||
  canonicalJson(current[0]) !== canonicalJson(authorization.oldTransaction)
) {
  throw fail('stale-body');
}
if (record.supersessionId !== supersessionId(coreIntent(authorization))) {
  throw fail('audit-authority');
}
const transaction = {
  schema: 'aitm.delivered-close/v1',
  transactionId: record.replacementTransactionId,
  issueNumber: authorization.issueNumber,
  acceptedSha: authorization.newAcceptedSha,
  reviewAuthority: authorization.newReviewAuthority,
  completedSteps: [],
};
return Object.freeze({
  body: upsertDeliveredCloseTransaction(body, transaction),
  transaction: Object.freeze(transaction),
});
```

Also support the lost-body-response retry: if the body already contains the exact replacement transaction named by the one verified record, return it unchanged with `status: 'already-replaced'`. Any other fresh transaction refuses.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/delivered-close-supersession.test.mjs
```

Expected: all supersession codec, authorization, resolution, and replacement tests PASS.

- [ ] **Step 7: Commit the pure recovery model**

```bash
git add scripts/task-tracker/lib/delivered-close-supersession.mjs scripts/tests/unit/task-tracker/lib/delivered-close-supersession.test.mjs
git commit -m "[#1466] feat: model stale close transaction supersession"
```

---

### Task 2: Immutable comment persistence and retry adoption

**Files:**

- Modify: `scripts/task-tracker/lib/delivered-close-supersession.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/delivered-close-supersession.test.mjs`

**Interfaces:**

- Consumes: Task 1 `resolveDeliveredCloseSupersession`, renderer, and parser.
- Produces: `ensureDeliveredCloseSupersession({ authorization, deps })`, where `deps` contains `listComments`, `createComment`, `readComment`, and `randomUUIDFn`.

- [ ] **Step 1: Write failing persistence-order and retry tests**

Cover these exact traces:

1. No record: list -> create -> read by returned ID -> exact body/provider verification.
2. Matching record: list only; no create/read and reuse its replacement transaction ID.
3. Create succeeds but throws/lost response: the next invocation lists the persisted record and reuses it.
4. Created comment readback body differs: reject `comment-readback`.
5. Created comment author/timestamp is missing or the comment was edited: reject provider evidence.
6. Duplicate or conflicting old-transaction claims: reject before create.

Record each injected call in an array and assert exact ordering.

- [ ] **Step 2: Run focused tests and verify RED**

Run the Task 1 test command. Expected: the new persistence tests FAIL because `ensureDeliveredCloseSupersession` is absent.

- [ ] **Step 3: Implement write/readback orchestration**

Use this control flow:

```js
export async function ensureDeliveredCloseSupersession({ authorization, deps }) {
  const comments = await deps.listComments();
  const resolution = resolveDeliveredCloseSupersession({
    ...authorization,
    comments,
    randomUUIDFn: deps.randomUUIDFn,
  });
  if (resolution.action === 'reuse') return resolution.evidence;

  const body = renderDeliveredCloseSupersessionComment(resolution.record);
  const created = await deps.createComment(body);
  const id = String(created?.id ?? '');
  if (!id) throw fail('comment-id');
  const readback = await deps.readComment(id);
  const evidence = parseDeliveredCloseSupersessionComment(readback, {
    repository: authorization.repository,
    issueNumber: authorization.issueNumber,
  });
  if (
    !evidence ||
    evidence.body !== body ||
    canonicalJson(evidence.record) !== canonicalJson(resolution.record)
  ) {
    throw fail('comment-readback');
  }
  return evidence;
}
```

Do not infer success from a thrown create call. The next explicit retry owns recovery by listing authoritative comments.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Task 1 test command. Expected: all tests PASS.

- [ ] **Step 5: Commit immutable persistence**

```bash
git add scripts/task-tracker/lib/delivered-close-supersession.mjs scripts/tests/unit/task-tracker/lib/delivered-close-supersession.test.mjs
git commit -m "[#1466] feat: persist close supersession evidence"
```

---

### Task 3: Wire explicit recovery into `verbClose`

**Files:**

- Modify: `scripts/task-tracker/verbs/close.mjs`
- Modify: `scripts/tests/helpers/close-convergence-wiring-helpers.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/close-delivered-idempotence.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/close-convergence-wiring.test.mjs`

**Interfaces:**

- Consumes: Task 1/2 supersession exports and the existing `ensureDeliveryAuthorized`, `checkDirty`, body mutator, disposition reader, label reader, binding inspector, and convergence snapshot.
- Produces: one `verbClose` recovery branch invoked only when `rest.includes('--restart-stale-transaction')`; its observable result is `{ body, transaction, evidence, status }` through the existing injected close harness.

- [ ] **Step 1: Extend the harness and write the failing happy-path test**

Add `restartStaleTransaction`, `comments`, `commentReadError`, `commentCreateError`, `dirtyWorkspace`, and `acceptedSha` options to `runClose`. Build `rest` as:

```js
const rest = [
  `#${issueNumber}`,
  ...(restartStaleTransaction ? ['--restart-stale-transaction'] : []),
  ...(force ? ['--force'] : []),
];
```

Inject comment adapters that append `comment:list`, `comment:create`, `comment:read`, and `body:mutate` to `calls.order`. The happy path starts with a stale `[timing]` transaction, Review/open/null disposition, `ToDo`, pending binding, and fresh accepted SHA. Assert:

- supersession comment creation occurs before body mutation;
- the replacement transaction uses fresh SHA and `completedSteps: []`;
- all eight normal steps complete;
- timing, estimation, and lifecycle replay despite the old prefix;
- the final transaction retains the replacement transaction ID from the comment.

- [ ] **Step 2: Run the two issue verification suites and verify RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/close-delivered-idempotence.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/close-convergence-wiring.test.mjs
```

Expected: the new restart tests FAIL because the flag is not wired.

- [ ] **Step 3: Add flag validation before any close lane branches**

Immediately after existing flag parsing, add:

```js
const restartStaleTransaction = rest.includes('--restart-stale-transaction');
if (
  restartStaleTransaction &&
  (force || repair || rest.includes('--as') || rest.includes('--answer'))
) {
  throw new Error('delivered-close-supersession:incompatible-flags');
}
```

The dispatcher already owns active-target and assignee preflight. Preserve that authority; do not add a second weaker binding path.

- [ ] **Step 4: Add production comment adapters**

Inside `verbClose`, define injected-or-default adapters using REST:

```js
const supersessionDeps = {
  listComments:
    ctx.listDeliveredCloseSupersessionComments ??
    (async () => {
      const { stdout } = await pexec(
        'gh',
        ['api', '--paginate', '--slurp', `repos/${cfg.repo}/issues/${closeIssueNum}/comments`],
        { timeout: GH_API_TIMEOUT_MS }
      );
      return JSON.parse(String(stdout || '[]')).flat();
    }),
  createComment:
    ctx.createDeliveredCloseSupersessionComment ??
    (async (body) => {
      const { stdout } = await pexec(
        'gh',
        [
          'api',
          `repos/${cfg.repo}/issues/${closeIssueNum}/comments`,
          '--method',
          'POST',
          '-f',
          `body=${body}`,
        ],
        { timeout: GH_API_TIMEOUT_MS }
      );
      return JSON.parse(stdout);
    }),
  readComment:
    ctx.readDeliveredCloseSupersessionComment ??
    (async (id) => {
      const { stdout } = await pexec('gh', ['api', `repos/${cfg.repo}/issues/comments/${id}`], {
        timeout: GH_API_TIMEOUT_MS,
      });
      return JSON.parse(stdout);
    }),
  randomUUIDFn: ctx.randomUUIDFn ?? randomUUID,
};
```

- [ ] **Step 5: Establish fresh authority and live pre-terminal state before writes**

When an open issue has a stale transaction and the flag is present:

1. Call `ensureDeliveryAuthorized()` without the stale durable transaction so Test, Review, delivery receipt, current HEAD, and current Review authority are revalidated.
2. Resolve the recorded issue workspace and call `checkDirty`; any dirty or unreadable result refuses with no `--answer` bypass.
3. Reuse already-read board and issue snapshots, then read disposition, close labels, and binding release status.
4. Call `authorizeDeliveredCloseRestart` with those exact observations.

Do not set `resumeDeliveredCloseTransaction` from the stale marker before this branch completes.

Introduce `const inspectDirty = ctx.checkDirtyWorkspace || checkDirty` and use it for both this strict restart check and the existing ordinary dirty-worktree branch. The harness injects `checkDirtyWorkspace` from its `dirtyWorkspace` option; production retains the current `checkDirty` implementation.

- [ ] **Step 6: Persist audit, replace the marker, and resume the existing saga**

Use audit-before-body ordering:

```js
const evidence = await ensureDeliveredCloseSupersession({
  authorization,
  deps: supersessionDeps,
});
const mutation = await mutateBody({
  issueNumber: Number(closeIssueNum),
  repo: cfg.repo,
  mutate: (base) =>
    replaceStaleDeliveredCloseTransaction(base, authorization, evidence.record).body,
});
if (mutation?.status !== 'ok' || typeof mutation.body !== 'string') {
  throw new Error('delivered-close-supersession:body-write');
}
const replaced = replaceStaleDeliveredCloseTransaction(
  mutation.body,
  authorization,
  evidence.record
);
resumeDeliveredCloseTransaction = replaced.transaction;
resumeConvergeBody = mutation.body;
```

The second call is readback/adoption and must return `already-replaced`; otherwise refuse. Set `resolvedReviewAuthorization` from the fresh authorization, then let the current `refuseDeliveryGate({ durableTransaction })`, dirty-skip for terminal resume, checkpoint writer, and eight-step close pipeline run unchanged.

- [ ] **Step 7: Add fail-closed wiring tests**

Add explicit tests for:

- no transaction, same-SHA transaction, malformed transaction, and terminal prefix;
- board not Review, issue closed, Delivered disposition, no close-managed labels, binding released/unknown, and dirty checkout;
- stale Test/Review/delivery SHA;
- comment list/create/read failures and readback mismatch;
- body mutation refusal and body readback mismatch;
- matching-comment retry with old body;
- matching-comment plus exact replacement-body retry;
- conflicting comment and fresh body without matching comment;
- `--force`, `--repair`, `--answer`, or `--as` combined with restart;
- ordinary no-flag same-SHA and stale-SHA behavior remains byte-for-byte unchanged.

For every refusal, assert zero board, disposition, issue-close, label, and binding writes. For pre-audit refusals, also assert zero comment/body writes.

- [ ] **Step 8: Run focused tests and verify GREEN**

Run the two Task 3 commands plus:

```bash
node --test scripts/tests/unit/task-tracker/lib/close-repair.test.mjs
node --test scripts/tests/unit/task-tracker/lib/close-cross-close.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/issue-body.test.mjs
```

Expected: all tests PASS and ordinary repair/cross-close semantics are unchanged.

- [ ] **Step 9: Commit close orchestration**

```bash
git add scripts/task-tracker/verbs/close.mjs scripts/tests/helpers/close-convergence-wiring-helpers.mjs scripts/tests/unit/task-tracker/verbs/close-delivered-idempotence.test.mjs scripts/tests/unit/task-tracker/verbs/close-convergence-wiring.test.mjs
git commit -m "[#1466] feat: restart stale pre-terminal close transactions"
```

---

### Task 4: Document and lock the public command contract

**Files:**

- Modify: `scripts/task-tracker/verbs/help-data.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/catalog.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/help.test.mjs`

**Interfaces:**

- Consumes: the implemented flag and refusal boundary.
- Produces: self-documenting help and catalog language that downstream command-surface tests can inspect.

- [ ] **Step 1: Write the failing help contract test**

Add assertions that close usage contains `--restart-stale-transaction`, its flag description says it requires a stale pre-terminal transaction plus fresh exact-SHA evidence and writes immutable supersession evidence, and the command catalog states that terminal-boundary or conflicting evidence refuses before mutation.

- [ ] **Step 2: Run the help test and verify RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/help.test.mjs
```

Expected: FAIL because help does not mention the new flag.

- [ ] **Step 3: Update help and catalog**

Change close usage to:

```text
/task close [#N] [--force] [--repair] [--restart-stale-transaction] [--answer yes|no|cancel] [--as duplicate|not-planned|incorporated] [--of <N>]
```

Add the flag description:

```text
restart a stale pre-terminal Delivered close transaction only after fresh exact-SHA Test, Review, delivery, clean-worktree, and live-state checks; writes immutable supersession evidence before replacing the protected marker
```

Add `/task close 1461 --restart-stale-transaction` to examples. Extend the catalog preconditions/effects with exact restart authority, immutable audit-first ordering, and terminal-boundary refusal.

- [ ] **Step 4: Run the help test and verify GREEN**

Run the Task 4 test command. Expected: PASS.

- [ ] **Step 5: Commit command documentation**

```bash
git add scripts/task-tracker/verbs/help-data.mjs scripts/task-tracker/lib/command-surface/catalog.mjs scripts/tests/unit/task-tracker/verbs/help.test.mjs
git commit -m "[#1466] docs: expose stale close recovery contract"
```

---

### Task 5: Full verification, governed review, and live #1461 recovery

**Files:**

- Verify all files changed in Tasks 1-4.
- Use governed issue records for #1466 and #1461; do not use raw issue-body mutation.

**Interfaces:**

- Consumes: completed implementation and the existing task workflow.
- Produces: exact-SHA verification evidence for #1466, a completed #1466 close, and an auditable successful recovery/close for #1461.

- [ ] **Step 1: Run focused and complete local verification**

Run, in order:

```bash
node --test scripts/tests/unit/task-tracker/lib/delivered-close-supersession.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/close-delivered-idempotence.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/close-convergence-wiring.test.mjs
node --test scripts/tests/unit/task-tracker/lib/close-repair.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/help.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/issue-body.test.mjs
npm test
npm run test:integration
npm run test:slow
npm run lint
npm run format:check
```

Expected: every command exits 0. Record exact pass counts and final HEAD; do not summarize a partial run as green.

- [ ] **Step 2: Verify repository invariants**

Run:

```bash
test "$(readlink node_modules/ai-task-manager)" = ".."
git status --short
git diff --check origin/trunk...HEAD
git log --oneline --decorate -8
```

Expected: self-link is `..`, worktree is clean, diff check is empty, and all #1466 commits are attributable.

- [ ] **Step 3: Complete #1466 through governed Test and Review**

Use only sanctioned `/task`/`npx aitm` transitions. Stamp each AC with its cited targeted verification command, tick only after evidence exists, stamp Functional DoD, run sandbox Test at the exact implementation SHA, complete Agent Review, record exact-SHA Review approval under current Full-Auto policy, and close #1466 through the ordinary Delivered path. Verify issue state, board Done, transaction completion, local/remote SHA evidence, and hosted CI for the pushed SHA when applicable.

- [ ] **Step 4: Return to #1461 and refresh exact-SHA evidence**

Unblock #1461 only after #1466 is Done. Bind #1461 in the same recorded worktree, confirm the current clean HEAD, rerun its declared Verification Commands, and obtain fresh exact current-HEAD Test and Review approval evidence. Confirm the old transaction still names `8923247b27e5e9efd434dd70b8bbfaff4b65d2f1` with completed prefix `[timing]` and that live state remains open Review with no terminal-boundary effect.

- [ ] **Step 5: Execute and verify the live recovery**

Run:

```bash
npx aitm close 1461 --restart-stale-transaction
```

Expected: the command creates and verifies exactly one supersession comment, replaces the active transaction with the current accepted SHA and empty prefix, replays the ordinary close saga, and converges #1461 to Done. Re-run ordinary `npx aitm close 1461`; expected result is read-only completed convergence with no repeated terminal writes.

- [ ] **Step 6: Record the acceptance evidence and continue the roadmap**

Capture the supersession comment ID, old/new transaction IDs, old/new accepted SHAs, final completed transaction, issue/board/disposition state, binding release, local/remote heads, and CI result. Remove only #1461's #1466 blocker relationship through the governed unblock path. Then continue the authorized serial roadmap at #1462; do not touch #1464.
