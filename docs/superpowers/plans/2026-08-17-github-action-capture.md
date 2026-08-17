<!-- @story #1295 -->
<!-- cspell:ignore backchannels extensionless -->

# GitHub-Bound Action Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an opt-in, behavior-preserving observation shim that records
AITM's real GitHub-bound traffic in a temporary, per-issue corpus for later
offline-cache design.

**Architecture:** The public `aitm` dispatcher detects a main-worktree enable
marker and delegates with a package-owned `gh` shim first on `PATH`. The shim
records one crash-safe action directory per call, invokes the pre-resolved real
`gh`, streams its result unchanged, and records the outcome. A standalone
control command enables, disables, reports, and summarizes the corpus.

**Tech Stack:** Node.js 22+ ESM, `node:test`, `node:child_process`, atomic
filesystem writes, SHA-256, existing AITM fleet/path and credential-policy
helpers.

## Global Constraints

- GitHub issues, Project fields, and Git commit history remain authoritative.
- Capture is disabled by default and creates no artifacts while disabled.
- Capture failures warn and fail open; the original GitHub call still runs.
- Exact raw bytes are stored only when the existing credential policy accepts
  them; environment variables are never serialized.
- Artifacts live under the main worktree's `.tmp/aitm/action-capture/` tree.
- Each repository and issue has independent sequence allocation and action
  directories; there is no shared append file.
- Offline replay, offline authority, task pickup, Git transport, archival, and
  cloud-agent backchannels are out of scope.
- No production code is written before its failing test is observed.

---

### Task 1: Pure classification and record metadata

**Files:**

- Create: `scripts/tests/unit/task-tracker/lib/action-capture.test.mjs`
- Create: `scripts/task-tracker/lib/action-capture.mjs`

**Interfaces:**

- Produces: `classifyGhCall(args, stdin) -> { operationClass, mutationKind }`
- Produces: `describeBytes(bytes, { storePath }) -> metadata`
- Produces: `actionCaptureRoot(projectDir)`, `captureIssueDir(input)`
- Consumes: `assertNoCredentialValues` and `findMainWorktreePath`

- [ ] **Step 1: Write failing classification tests**

```js
test('classifies governed GitHub mutation families', () => {
  const cases = [
    [['issue', 'edit', '42', '--body-file', '-'], '', 'issue-body'],
    [['issue', 'comment', '42', '--body', 'note'], '', 'issue-comment'],
    [['issue', 'edit', '42', '--add-label', 'x'], '', 'issue-labels'],
    [['issue', 'edit', '42', '--add-assignee', '@me'], '', 'issue-ownership'],
    [['issue', 'close', '42'], '', 'issue-close'],
    [['issue', 'reopen', '42'], '', 'issue-reopen'],
    [['api', 'graphql', '--input', '-'], '{"query":"mutation { x }"}', 'graphql'],
    [['api', '-X', 'PATCH', 'repos/o/r/issues/42'], '', 'rest'],
  ];
  for (const [args, stdin, kind] of cases) {
    assert.deepEqual(classifyGhCall(args, Buffer.from(stdin)), {
      operationClass: 'mutation',
      mutationKind: kind,
    });
  }
  assert.equal(classifyGhCall(['issue', 'view', '42'], Buffer.alloc(0)).operationClass, 'read');
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/action-capture.test.mjs
```

Expected: FAIL because `action-capture.mjs` does not exist.

- [ ] **Step 3: Implement the pure classifier and byte descriptor**

```js
export function classifyGhCall(args = [], stdin = Buffer.alloc(0)) {
  const argv = args.map(String);
  const command = argv[0] || '';
  const subcommand = argv[1] || '';
  if (command === 'issue' && subcommand === 'create') return mutation('issue-create');
  if (command === 'issue' && subcommand === 'comment') return mutation('issue-comment');
  if (command === 'issue' && subcommand === 'close') return mutation('issue-close');
  if (command === 'issue' && subcommand === 'reopen') return mutation('issue-reopen');
  if (command === 'issue' && subcommand === 'edit') return classifyIssueEdit(argv);
  if (command === 'api') return classifyApi(argv, stdin);
  return { operationClass: 'read', mutationKind: null };
}
```

`describeBytes` must always return `{ bytes, sha256, stored, redacted, file }`.
It checks the original UTF-8 bytes with `assertNoCredentialValues`; accepted
bytes may be atomically stored, rejected bytes never are.

- [ ] **Step 4: Run the unit test and verify GREEN**

Run the same command. Expected: all classification tests pass.

- [ ] **Step 5: Commit the pure contract**

```bash
git add scripts/task-tracker/lib/action-capture.mjs scripts/tests/unit/task-tracker/lib/action-capture.test.mjs
git commit -m "feat: define GitHub action capture records [#1295]"
```

### Task 2: Crash-safe allocation and action lifecycle

**Files:**

- Modify: `scripts/task-tracker/lib/action-capture.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/action-capture.test.mjs`

**Interfaces:**

- Produces: `beginCapturedAction(context) -> { actionDir, actionId, sequence, startedAt }`
- Produces: `completeCapturedAction(handle, result) -> outcome`
- Produces: `summarizeActionCorpus({ projectDir, issue }) -> summary`
- Consumes: Task 1 byte and path helpers

- [ ] **Step 1: Write failing storage tests**

```js
test('writes intent before transport and outcome after transport', async () => {
  const handle = beginCapturedAction(fixtureContext());
  assert.equal(existsSync(path.join(handle.actionDir, 'intent.json')), true);
  assert.equal(existsSync(path.join(handle.actionDir, 'outcome.json')), false);
  await completeCapturedAction(handle, {
    exitCode: 7,
    signal: null,
    stdout: Buffer.from('out'),
    stderr: Buffer.from('err'),
  });
  assert.equal(JSON.parse(readFileSync(path.join(handle.actionDir, 'outcome.json'))).exitCode, 7);
});

test('parallel allocations are unique and ordered within one issue', async () => {
  const handles = await Promise.all(
    Array.from({ length: 20 }, () =>
      Promise.resolve().then(() => beginCapturedAction(fixtureContext()))
    )
  );
  assert.equal(new Set(handles.map((handle) => handle.actionDir)).size, 20);
  assert.deepEqual(
    handles.map((handle) => handle.sequence).sort((a, b) => a - b),
    Array.from({ length: 20 }, (_, index) => index + 1)
  );
});
```

- [ ] **Step 2: Run and verify RED**

Expected: FAIL because lifecycle functions are not exported.

- [ ] **Step 3: Implement per-issue allocation and atomic manifests**

Use `mkdirSync(lockDir)` as the exclusive allocator, a stale-lock age bound,
`counter.json.tmp-<pid>-<random>` plus `renameSync`, and `finally` lock cleanup.
Name action directories with a zero-padded sequence and `createRecordId()`.
Write canonical two-space JSON plus one terminal newline.

- [ ] **Step 4: Add secret and summary tests**

```js
test('omits raw credential-bearing bytes but retains original metadata', () => {
  const handle = beginCapturedAction(
    fixtureContext({ stdin: Buffer.from('Bearer ghp_1234567890123456') })
  );
  const intent = readJson(path.join(handle.actionDir, 'intent.json'));
  assert.equal(intent.request.redacted, true);
  assert.equal(intent.request.stored, false);
  assert.equal(existsSync(path.join(handle.actionDir, 'request.bin')), false);
  assert.equal(intent.request.bytes, Buffer.byteLength('Bearer ghp_1234567890123456'));
});
```

The summary fixture must assert call, mutation, read, success, failure,
incomplete, redacted, manifest-byte, raw-byte, by-kind, and largest-record
values.

- [ ] **Step 5: Run and verify GREEN, then commit**

```bash
node --test scripts/tests/unit/task-tracker/lib/action-capture.test.mjs
git add scripts/task-tracker/lib/action-capture.mjs scripts/tests/unit/task-tracker/lib/action-capture.test.mjs
git commit -m "feat: persist crash-safe action capture [#1295]"
```

### Task 3: Dispatcher injection and `gh` shim

**Files:**

- Create: `scripts/task-tracker/action-capture-bin/gh`
- Modify: `scripts/task-tracker/lib/action-capture.mjs`
- Modify: `bin/aitm.mjs`
- Create: `scripts/tests/slow/task-tracker/lib/action-capture-integration.test.mjs`

**Interfaces:**

- Produces: `prepareActionCaptureEnv({ env, cwd, command }) -> env`
- Produces: `runGhCaptureShim(args, deps) -> Promise<number>`
- Consumes: Task 2 action lifecycle and enable marker

- [ ] **Step 1: Write a failing dispatcher integration test**

Create a git-isolated `.tmp/test/` sandbox, a fake executable `gh`, and an
enabled marker. Spawn `node bin/aitm.mjs board 1295` from the sandbox and also
invoke the exported dispatcher seam with injected spawn options. The fake
binary asserts `intent.json` exists before it consumes
stdin, writes distinct stdout/stderr, and exits 23. Assert the caller receives
the same streams and exit 23 and the corpus contains the matching outcome.

- [ ] **Step 2: Run and verify RED**

Run:

```bash
node --test scripts/tests/slow/task-tracker/lib/action-capture-integration.test.mjs
```

Expected: FAIL because dispatcher injection and the shim do not exist.

- [ ] **Step 3: Implement environment preparation**

`prepareActionCaptureEnv` must:

1. return the original environment object unchanged when disabled;
2. resolve the real `gh` before changing `PATH`;
3. derive repository and active issue from config/state without network I/O;
4. create one invocation ULID and serialize only non-secret correlation values;
5. prepend `scripts/task-tracker/action-capture-bin` once; and
6. warn and return the original environment on any setup failure.

Change `delegate(targetPath, args)` to accept an environment and pass it to
`spawnSync`; do not alter cwd, stdio, shell, or status mapping.

- [ ] **Step 4: Implement the executable shim**

The extensionless script has a Node shebang, imports `runGhCaptureShim`, and
sets `process.exitCode` to the returned real exit code. The core function reads
stdin, begins the action, spawns only `AITM_CAPTURE_REAL_GH`, tees complete
stdout/stderr to the parent, completes the action, and preserves signals. It
must run the real binary even when every capture operation throws.

- [ ] **Step 5: Verify GREEN and commit**

```bash
node --test scripts/tests/unit/task-tracker/lib/action-capture.test.mjs scripts/tests/slow/task-tracker/lib/action-capture-integration.test.mjs
git add bin/aitm.mjs scripts/task-tracker/action-capture-bin/gh scripts/task-tracker/lib/action-capture.mjs scripts/tests/slow/task-tracker/lib/action-capture-integration.test.mjs
git commit -m "feat: observe aitm gh subprocesses [#1295]"
```

### Task 4: Operator controls, summary, and documentation

**Files:**

- Create: `scripts/task-tracker/capture-actions.mjs`
- Modify: `scripts/lib/self-doc.mjs`
- Modify: `bin/aitm-registry.mjs`
- Modify: `scripts/tests/slow/task-tracker/lib/aitm-dispatcher.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/action-capture.test.mjs`
- Create: `docs/guides/action-capture.md`

**Interfaces:**

- Produces CLI: `npx aitm capture-actions <on|off|status|summary> [--issue N] [--json]`
- Consumes: marker and summary functions from Task 2

- [ ] **Step 1: Write failing control and help tests**

Assert `on` atomically creates the marker, `off` removes only the marker,
`status` reports enabled/root, `summary --json` emits the exact aggregate, and
the orchestrator registry exposes `capture-actions` with complete self-doc.

- [ ] **Step 2: Run and verify RED**

```bash
node --test scripts/tests/unit/task-tracker/lib/action-capture.test.mjs scripts/tests/slow/task-tracker/lib/aitm-dispatcher.test.mjs
```

- [ ] **Step 3: Implement the control command and self-doc contract**

Add the routable command metadata, arguments, output, exit codes, examples, and
related commands. The command parser rejects unknown combinations. `off` must
not recursively delete the corpus.

- [ ] **Step 4: Write the operator guide**

Document prerequisites, exact on/status/summary/off commands, storage layout,
retention, secret policy, how to compare issue corpora, fail-open warnings, and
the explicit statement that capture does not support replay or offline
authority.

- [ ] **Step 5: Verify GREEN and commit**

```bash
node --test scripts/tests/unit/task-tracker/lib/action-capture.test.mjs scripts/tests/slow/task-tracker/lib/aitm-dispatcher.test.mjs
npx markdownlint-cli2 docs/guides/action-capture.md
git add scripts/task-tracker/capture-actions.mjs scripts/lib/self-doc.mjs bin/aitm-registry.mjs scripts/tests/slow/task-tracker/lib/aitm-dispatcher.test.mjs scripts/tests/unit/task-tracker/lib/action-capture.test.mjs docs/guides/action-capture.md
git commit -m "docs: add action capture operator workflow [#1295]"
```

### Task 5: Exercise the corpus and complete verification

**Files:**

- Runtime only: main-worktree `.tmp/aitm/action-capture/`
- Modify only if failures demand a TDD fix: files from Tasks 1-4

**Interfaces:**

- Consumes: `npx aitm capture-actions on|summary|off`
- Produces: a real #1295 lifecycle corpus for later analysis

- [ ] **Step 1: Enable capture and run deterministic dry-run observations**

```bash
npx aitm capture-actions on
npx aitm capture-actions status
node --test scripts/tests/unit/task-tracker/lib/action-capture.test.mjs scripts/tests/slow/task-tracker/lib/action-capture-integration.test.mjs
npx aitm capture-actions summary --issue 1295 --json
```

Confirm the issue partition, sequence, intent/outcome pairs, sizes, hashes, and
redaction metadata by inspection.

- [ ] **Step 2: Run formatting and linting**

```bash
npm run format:check
npm run lint
```

Expected: exit 0 for each. If formatting fails, run `npm run format`, inspect
the mechanical diff, and rerun both commands before committing.

- [ ] **Step 3: Run focused and repository verification**

```bash
node --test scripts/tests/unit/task-tracker/lib/action-capture.test.mjs scripts/tests/slow/task-tracker/lib/action-capture-integration.test.mjs
npm test
npm run test:slow
```

Expected: every command exits 0 with no failed files.

- [ ] **Step 4: Review requirements and diff**

Read the specification, issue acceptance criteria, `git diff origin/trunk...HEAD`,
and summary corpus. Verify each requirement has code and test evidence. Resolve
every critical or important finding through a new red-green cycle.

- [ ] **Step 5: Commit any verification-only adjustments**

```bash
git add bin/aitm.mjs bin/aitm-registry.mjs scripts/lib/self-doc.mjs scripts/task-tracker/action-capture-bin/gh scripts/task-tracker/capture-actions.mjs scripts/task-tracker/lib/action-capture.mjs scripts/tests/unit/task-tracker/lib/action-capture.test.mjs scripts/tests/slow/task-tracker/lib/action-capture-integration.test.mjs scripts/tests/slow/task-tracker/lib/aitm-dispatcher.test.mjs docs/guides/action-capture.md
git commit -m "test: verify GitHub action capture [#1295]"
```

Skip this commit when verification creates no tracked diff.
