# Model-Agnostic Co-Review Handshake Implementation Plan

<!-- cspell:ignore EEXIST co-review refocus -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a committed `npx aitm co-review` tool that safely coordinates an artifact owner and external reviewer until explicit acceptance or a human-governed review-turn interception.

**Architecture:** A routed, dependency-free Node.js CLI stores an atomic current-state projection and append-only events in a caller-selected ignored directory. A focused protocol library owns role, claim, Git/artifact, immutable-round, review-budget, and continuation invariants; a separate help renderer provides context-reset recovery documentation before any initialization or filesystem mutation.

**Tech Stack:** Node.js 22+ ESM, `node:test`, built-in filesystem/crypto/child-process APIs, Git CLI, existing AITM command registry and self-documentation catalog.

## Global Constraints

- The committed public surface is `npx aitm co-review`; no model-, issue-, or artifact-specific executable is introduced.
- The caller selects an ignored local runtime directory with `--dir <path>`; protocol state never becomes an AITM or GitHub source of truth.
- Roles are `owner`, `reviewer`, and `human`; caller-supplied identities are provenance, not authentication.
- The owner alone edits and commits the authoritative artifact; reviewer operations require the artifact, index, and branch to remain at the preceding owner handoff.
- Every accepted exchange artifact is immutable and SHA-256 hashed.
- Reviewer decisions are exactly `accepted` or `changes-requested`; acceptance is terminal and wins on the last allowed turn.
- `--max-turns <N>` counts every reviewer handoff, including an imported review.
- A final allowed `changes-requested` review requires an immutable summary and enters `intervention-required`.
- `continue --additional-turns <N> --approved-by <identity> [--focus <file>]` adds budget, never resets used turns, and returns control to the owner.
- Help must explain what, why, who, when, where, and how; it must work before initialization and perform no repository discovery, locking, network access, or writes.
- Wait is read-only, defaults to 55 seconds, and refuses values above 60 seconds.
- A surviving mutex is reported and never stolen automatically.
- Use test-driven development: observe each focused test fail for the intended reason before adding production behavior.
- Do not push, rebase, merge to trunk, or mutate the #1117 worktree while executing this plan.

---

## File Structure

- Create: `scripts/review/co-review.mjs` — strict argument parsing, command dispatch, output, exit-code mapping, and ESM main guard.
- Create: `scripts/review/lib/protocol.mjs` — state schema, paths, hashing, Git validation, mutex, initialization, status, claim, wait, handoffs, and continuation.
- Create: `scripts/review/lib/help.mjs` — mutation-free top-level and per-command recovery documentation.
- Modify: `scripts/lib/self-doc.mjs` — canonical routed-command metadata for `co-review`.
- Modify: `scripts/task-tracker/lib/command-surface/entrypoints.mjs` — classify the new executable as `agent-callable-standalone`.
- Create: `scripts/tests/unit/review/co-review.test.mjs` — focused CLI, protocol, help, failure-atomicity, and end-to-end tests in temporary Git repositories.
- Preserve: `docs/superpowers/specs/2026-08-14-cross-agent-spec-review-handshake-design.md` — approved behavior and source provenance.
- Preserve: `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1117-state-components/.tmp/1117-review/r1-claude-review.md` — external immutable input; tests use their own fixture and never alter this file.

## Shared Interfaces

`scripts/review/lib/protocol.mjs` exports:

```js
export const STATE_SCHEMA = 'aitm.co-review/v1';
export const EVENT_SCHEMA = 'aitm.co-review-event/v1';
export const ProtocolError;
export function initializeProtocol(options);
export function readProtocol(options);
export function statusProtocol(options);
export function claimTurn(options);
export function handoffOwner(options);
export function handoffReviewer(options);
export function continueProtocol(options);
export async function waitForTurn(options);
```

Every operation receives `cwd` and `dir`; mutators also receive the command-specific
fields named below. `ProtocolError` has stable `code`, `message`, and `exitCode`
properties. Exit code 0 means success/help, 1 means runtime/integrity/protocol
refusal, 2 means invalid usage, and 3 means bounded wait timeout.

`scripts/review/lib/help.mjs` exports:

```js
export const COMMANDS;
export function helpRequest(argv);
export function renderHelp(command);
```

`helpRequest(argv)` returns `{ requested: true, command: null|string }` for `help`,
`--help`, `help <command>`, and `<command> --help`; otherwise `{ requested: false }`.

### Task 1: Commit the recovery-grade command and help surface

**Files:**

- Create: `scripts/tests/unit/review/co-review.test.mjs`
- Create: `scripts/review/lib/help.mjs`
- Create: `scripts/review/co-review.mjs`
- Modify: `scripts/lib/self-doc.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/entrypoints.mjs`

**Interfaces:**

- Produces: `helpRequest(argv)` and `renderHelp(command)`.
- Produces initially: CLI help guard and a normal-execution placeholder that reports
  `co-review:not-implemented` without touching disk.
- Produces: registry route `co-review -> scripts/review/co-review.mjs` in group
  `Review`.

- [ ] **Step 1: Write failing help and routing tests**

Start the test file with `// @story #1266`. Use `spawnSync(process.execPath, ...)`
and a fresh `mkdtempSync` directory that contains no repository. Add exact assertions:

```js
test('top-level help is recovery-grade and safe before initialization', () => {
  for (const args of [['help'], ['--help']]) {
    const result = runCli(args, { cwd: emptyRoot });
    assert.equal(result.status, 0, result.stderr);
    for (const heading of [
      'WHAT',
      'WHY',
      'WHO',
      'WHEN',
      'WHERE',
      'HOW',
      'LIFECYCLE',
      'COMMANDS',
      'OPTION GLOSSARY',
      'ARTIFACT FORMAT',
      'EXIT CODES',
      'CONTEXT-RESET CHECKLIST',
    ])
      assert.match(result.stdout, new RegExp(heading));
    assert.deepEqual(readdirSync(emptyRoot), []);
  }
});

test('every command has standalone recovery help in both forms', () => {
  for (const command of ['init', 'status', 'claim', 'wait', 'handoff', 'continue']) {
    const canonical = runCli(['help', command], { cwd: emptyRoot });
    const flag = runCli([command, '--help'], { cwd: emptyRoot });
    assert.equal(canonical.status, 0, canonical.stderr);
    assert.equal(flag.stdout, canonical.stdout);
    for (const field of [
      'Purpose',
      'Authorized caller',
      'Prerequisites',
      'Usage',
      'Arguments',
      'Effects',
      'Validations',
      'Output',
      'Exit codes',
      'State transition',
      'Idempotency',
      'Examples',
      'Failure recovery',
      'Next commands',
    ])
      assert.match(canonical.stdout, new RegExp(field));
  }
});

test('co-review is a routed agent-callable standalone command', async () => {
  const { SELF_DOC } = await import('../../../lib/self-doc.mjs');
  const { EXECUTABLE_ENTRYPOINTS } =
    await import('../../../task-tracker/lib/command-surface/entrypoints.mjs');
  assert.equal(SELF_DOC['co-review'].path, 'scripts/review/co-review.mjs');
  assert.deepEqual(
    EXECUTABLE_ENTRYPOINTS.find((row) => row.command === 'co-review'),
    {
      path: 'scripts/review/co-review.mjs',
      classification: 'agent-callable-standalone',
      command: 'co-review',
    }
  );
});
```

Fixture cleanup runs in `test.afterEach` with
`rmSync(root, { recursive: true, force: true })`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
```

Expected: FAIL because `scripts/review/co-review.mjs` and `help.mjs` do not exist and
the command is absent from the registry.

- [ ] **Step 3: Implement the complete help model and early guard**

In `help.mjs`, define frozen command metadata for all six commands. Render top-level
sections and per-command fields named by the test. Include copyable fresh/imported
flows, finding/disposition markers, budget arithmetic, acceptance precedence,
interception summary, continuation/refocus, mutex behavior, common refusals, and
this recovery checklist:

```text
1. Run: npx aitm co-review status --dir <path>
2. Confirm the configured artifact, exact commit, role identity, lifecycle, and budget.
3. If available, claim with the displayed actor command.
4. If claimed by you, complete only your role's immutable artifacts and handoff.
5. If intervention-required, stop and ask the human; do not invent approval.
6. If accepted, stop; the protocol is terminal.
7. If locked or drifted, preserve files and escalate with the printed diagnostics.
```

In `co-review.mjs`, place `helpRequest(process.argv.slice(2))` before imports or calls
that discover Git/runtime state. Use a dynamic import of `protocol.mjs` only after
help returns false. The main guard calls `runCli`, writes stdout/stderr, and maps
errors to exit codes. Until Task 2, normal commands throw:

```js
throw new Error('co-review:not-implemented; no state changed; run `npx aitm co-review --help`');
```

- [ ] **Step 4: Register the command in both canonical surfaces**

Add this row to `ROUTABLE_SELF_DOC`, plus exhaustive `ROUTABLE_ARGUMENTS` and
`ROUTABLE_CONTRACTS` entries:

```js
'co-review': {
  group: 'Review',
  path: 'scripts/review/co-review.mjs',
  synopsis: 'Coordinate immutable owner/reviewer artifact rounds through explicit acceptance.',
  audience: 'Artifact owner, external reviewer, or human continuation authority.',
  usage: 'aitm co-review <init|status|claim|wait|handoff|continue> [options]',
},
```

Arguments enumerate every public subcommand and flag. Contract examples include
`npx aitm co-review --help` and `npx aitm co-review status --dir .tmp/1117-review`.
Add `['scripts/review/co-review.mjs', 'co-review']` to the standalone entrypoints.

- [ ] **Step 5: Run focused and command-catalog tests to verify GREEN**

Run:

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
node --test scripts/tests/unit/task-tracker/lib/executable-entrypoint-classification.test.mjs
node --test scripts/tests/unit/task-tracker/lib/command-catalog-policy.test.mjs
npx aitm help co-review
```

Expected: all tests PASS; help exits 0 and prints the complete recovery page without
creating a runtime directory.

- [ ] **Step 6: Commit the help and routed surface**

```bash
git add scripts/review/co-review.mjs scripts/review/lib/help.mjs \
  scripts/lib/self-doc.mjs scripts/task-tracker/lib/command-surface/entrypoints.mjs \
  scripts/tests/unit/review/co-review.test.mjs
git commit -m "[#1266] feat: add co-review recovery help surface"
```

### Task 2: Implement atomic storage and fresh/imported initialization

**Files:**

- Modify: `scripts/tests/unit/review/co-review.test.mjs`
- Create: `scripts/review/lib/protocol.mjs`
- Modify: `scripts/review/co-review.mjs`

**Interfaces:**

- Produces: `initializeProtocol(options) -> State` and
  `readProtocol({ cwd, dir }) -> State`.
- Produces state/event schemas and `ProtocolError`.
- Consumes: CLI option parser maps kebab-case flags to the Shared Interfaces names.

- [ ] **Step 1: Add failing initialization tests**

Create a temporary Git repository helper that configures an identity, writes and
commits `docs/artifact.md`, and ignores `.tmp/`. Add cases for fresh init, imported
R1, exact idempotent retry, different-config refusal, same identity refusal,
non-positive budget, nonignored/tracked directory, outside paths, unreachable commit,
artifact/index mismatch, lock survival, state/event schemas, and SHA-256 format.
The core assertions are:

```js
const fresh = initializeProtocol({
  cwd: root,
  dir: '.tmp/review',
  artifact: 'docs/artifact.md',
  owner: 'owner-agent',
  reviewer: 'reviewer-agent',
  maxReviewTurns: 6,
});
assert.deepEqual(
  {
    lifecycle: fresh.lifecycle,
    currentRole: fresh.currentRole,
    turnState: fresh.turnState,
    round: fresh.round,
    reviewTurnsUsed: fresh.reviewTurnsUsed,
    maxReviewTurns: fresh.maxReviewTurns,
  },
  {
    lifecycle: 'active',
    currentRole: 'owner',
    turnState: 'available',
    round: 1,
    reviewTurnsUsed: 0,
    maxReviewTurns: 6,
  }
);

const imported = initializeProtocol({
  cwd: root,
  dir: '.tmp/imported',
  artifact: 'docs/artifact.md',
  owner: 'owner-agent',
  reviewer: 'reviewer-agent',
  maxReviewTurns: 6,
  importReview: '.tmp/imported/r1-review.md',
  reviewOf: initialCommit,
});
assert.equal(imported.currentRole, 'owner');
assert.equal(imported.round, 2);
assert.equal(imported.reviewTurnsUsed, 1);
assert.equal(imported.remainingReviewTurns, 5);
assert.match(imported.lastHandoff.artifacts.review.sha256, /^sha256:[a-f0-9]{64}$/);
```

Snapshot `state.json`, `events.jsonl`, and lock paths before each expected refusal and
assert byte equality afterward.

- [ ] **Step 2: Run focused tests and verify RED**

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `protocol.mjs` or missing exported
initialization behavior.

- [ ] **Step 3: Implement paths, hashing, Git helpers, schemas, and mutex**

Implement containment with `path.relative`, SHA-256 with `createHash`, Git calls with
`execFileSync('git', args, { cwd, shell: false })`, and errors through:

```js
export class ProtocolError extends Error {
  constructor(code, detail, { exitCode = 1, next } = {}) {
    super(
      `co-review:${code}${detail ? `: ${detail}` : ''}; no state changed${next ? `; next: ${next}` : ''}`
    );
    this.name = 'ProtocolError';
    this.code = code;
    this.exitCode = exitCode;
  }
}
```

The mutex uses atomic `mkdirSync(lockPath)`, writes `owner.json`, and removes only the
lock it acquired. On `EEXIST`, read owner metadata if possible and report
`lock-owner-unavailable` otherwise; never remove the existing lock.

State writes use a same-directory `wx` temporary file plus `renameSync`. Events are
newline-delimited frozen transition snapshots with matching revision and mirrored
budget fields. Validate all inputs before appending the event; after mutation reread
and validate state.

- [ ] **Step 4: Implement fresh and imported initialization**

Resolve the Git root/worktree, require the runtime directory to be inside it and
ignored via `git check-ignore`, require the artifact to be a tracked regular file,
and verify worktree/index/HEAD equality. Fresh init records owner round 1 available.
Imported init requires paired `importReview`/`reviewOf`, checks the review is inside
the runtime directory and distinct from state paths, verifies `reviewOf` is a commit
reachable from the current branch and contains the exact artifact blob, hashes R1,
records reviewer turn 1, and starts owner round 2.

- [ ] **Step 5: Connect strict CLI parsing for `init` and `status`**

Reject unknown flags, missing flag values, positional spillover, and incomplete
import pairs with exit code 2. Map:

```js
init --dir --artifact --owner --reviewer --max-turns [--import-review --review-of]
status --dir [--json]
```

Human status output prints lifecycle, actor/role, round, claim, artifact/ref, used /
max / remaining budget, integrity, last handoff, and a copyable next command. JSON
prints the validated state plus computed integrity and next action.

- [ ] **Step 6: Run focused tests and verify GREEN**

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
```

Expected: initialization and help tests PASS; no refusal changes state/events.

- [ ] **Step 7: Commit atomic initialization**

```bash
git add scripts/review/co-review.mjs scripts/review/lib/protocol.mjs \
  scripts/tests/unit/review/co-review.test.mjs
git commit -m "[#1266] feat: initialize co-review protocols"
```

### Task 3: Implement status integrity, role-safe claims, and bounded waits

**Files:**

- Modify: `scripts/tests/unit/review/co-review.test.mjs`
- Modify: `scripts/review/lib/protocol.mjs`
- Modify: `scripts/review/co-review.mjs`

**Interfaces:**

- Produces: `statusProtocol`, `claimTurn`, and `waitForTurn` from Shared Interfaces.
- Consumes: initialized state, immutable artifact registry, mutex, and CLI parser.

- [ ] **Step 1: Add failing state/claim/wait tests**

Add exact cases: owner claim success, reviewer wrong-role refusal, other claimant
refusal, exact claimant idempotency with no event/revision increase, accepted and
intervention claim refusal, artifact drift detection, immediately available wait,
timeout code 3 with unchanged state/events, maximum timeout refusal, and wait that
observes a handoff written during polling. Core assertions:

```js
const claimed = claimTurn({ cwd: root, dir, actor: 'owner-agent' });
assert.equal(claimed.turnState, 'claimed');
assert.equal(claimTurn({ cwd: root, dir, actor: 'owner-agent' }).revision, claimed.revision);
assert.throws(() => claimTurn({ cwd: root, dir, actor: 'reviewer-agent' }), /co-review:wrong-role/);

const before = snapshotProtocol(root, dir);
const timeout = await waitForTurn({
  cwd: root,
  dir,
  actor: 'reviewer-agent',
  timeoutSeconds: 0.02,
  pollMilliseconds: 5,
});
assert.equal(timeout.status, 'timeout');
assert.deepEqual(snapshotProtocol(root, dir), before);
```

- [ ] **Step 2: Run focused tests and verify RED**

Expected: FAIL because `claimTurn`/`waitForTurn` are absent.

- [ ] **Step 3: Implement integrity-aware status and idempotent claim**

`statusProtocol` rehashes every handed-off artifact and compares recorded Git
artifact/index/branch anchors. It returns `integrity: { ok, errors }` without writing.
All mutators call the same validation under the mutex. Claim maps configured identity
to the current role, records pid/host/time, increments exactly one revision/event,
and treats only an exact same-identity claim retry as idempotent.

- [ ] **Step 4: Implement bounded read-only wait**

Validate actor and `0 <= timeoutSeconds <= 60`; default to 55. Poll status at no more
than 250ms intervals, return immediately only when that actor's role is available,
return terminal/intervention states without pretending availability, and return
`{ status: 'timeout', state }` at the deadline. The CLI maps timeout to exit code 3
and prints the observed state and next action.

- [ ] **Step 5: Run focused tests and verify GREEN**

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
```

Expected: claim, status integrity, and wait cases PASS.

- [ ] **Step 6: Commit turn acquisition**

```bash
git add scripts/review/co-review.mjs scripts/review/lib/protocol.mjs \
  scripts/tests/unit/review/co-review.test.mjs
git commit -m "[#1266] feat: add co-review claims and bounded waits"
```

### Task 4: Implement the owner's committed artifact-plus-response handoff

**Files:**

- Modify: `scripts/tests/unit/review/co-review.test.mjs`
- Modify: `scripts/review/lib/protocol.mjs`
- Modify: `scripts/review/co-review.mjs`

**Interfaces:**

- Produces: `handoffOwner({ cwd, dir, actor, response, artifact, commit, answers,
message }) -> State`.
- Consumes: current owner claim, preceding review registry, Git helpers, and immutable
  artifact hashing.

- [ ] **Step 1: Add failing owner-handoff tests**

Test a first owner handoff without `answers`; an imported-review owner handoff with
complete dispositions; wrong role/unclaimed turn; response outside runtime; response
aliasing state/review/artifact; missing/duplicate/unknown/invented finding
dispositions; rejected finding without evidence; deferred finding without follow-up
issue and safe boundary; wrong artifact path; unreachable/not-current commit; commit
missing artifact; dirty worktree artifact; dirty index; branch drift; recorded-review
drift; and failure atomicity.

Use these exact fixture markers:

```markdown
[finding:F-001] Missing terminal outcome
[finding:F-002] Budget behavior is ambiguous
```

```markdown
[finding:F-001] [disposition:accepted]
Revised section: Terminal acceptance.

[finding:F-002] [disposition:accepted-with-modification]
Revised section: Human interception.
```

The success assertion is:

```js
assert.deepEqual(pick(handoffOwner(options), ['currentRole', 'turnState', 'round']), {
  currentRole: 'reviewer',
  turnState: 'available',
  round: 2,
});
assert.equal(state.lastHandoff.commit, exactCommit);
assert.match(state.lastHandoff.artifacts.response.sha256, /^sha256:/);
```

- [ ] **Step 2: Run focused tests and verify RED**

Expected: FAIL because `handoffOwner` is absent.

- [ ] **Step 3: Implement finding/disposition validation**

Parse unique `[finding:<ID>]` markers from the preceding review and the response.
Every preceding ID appears exactly once in the response with exactly one of
`accepted`, `accepted-with-modification`, `rejected`, or `deferred`; no response-only
ID is allowed. A rejected block must contain `[evidence:<repo-relative-path-or-command>]`.
A deferred block must contain `[follow-up:#N]` and `[safe-boundary:<text>]`.

- [ ] **Step 4: Implement exact committed-artifact validation and handoff**

Resolve `<commit>^{commit}` to a full SHA, require it to equal the current branch
HEAD, require `git cat-file -e <sha>:<artifact>`, compare that blob byte-for-byte to
both `git show :<artifact>` and the worktree file, and require no artifact/index
diff. Hash response/answered review/artifact, append the owner handoff, clear claim,
and make the reviewer available without consuming a reviewer turn.

- [ ] **Step 5: Route strict owner handoff arguments**

The single `handoff` subcommand dispatches by configured actor identity. For an
owner it requires:

```text
--dir --actor --response --artifact --commit --message [--answers]
```

Reject reviewer-only `--review`, `--review-of`, `--decision`, and `--summary` flags.
On refusal, print the invariant, “no state changed,” and the relevant handoff help.

- [ ] **Step 6: Run focused tests and verify GREEN**

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
```

Expected: every owner handoff and refusal test PASS.

- [ ] **Step 7: Commit owner handoff**

```bash
git add scripts/review/co-review.mjs scripts/review/lib/protocol.mjs \
  scripts/tests/unit/review/co-review.test.mjs
git commit -m "[#1266] feat: verify owner co-review handoffs"
```

### Task 5: Implement reviewer decisions, budget interception, and human continuation

**Files:**

- Modify: `scripts/tests/unit/review/co-review.test.mjs`
- Modify: `scripts/review/lib/protocol.mjs`
- Modify: `scripts/review/co-review.mjs`

**Interfaces:**

- Produces: `handoffReviewer({ cwd, dir, actor, review, reviewOf, decision, summary,
message }) -> State`.
- Produces: `continueProtocol({ cwd, dir, additionalTurns, approvedBy, focus }) -> State`.
- Consumes: current reviewer claim and exact preceding owner handoff.

- [ ] **Step 1: Add failing reviewer decision/budget tests**

Cover invalid/implicit decision; wrong `reviewOf`; review outside/aliasing runtime;
duplicate finding IDs; artifact/index/HEAD drift; accepted before limit; accepted on
last turn; changes requested with remaining turns; final changes requested without
summary; final changes requested with immutable summary; imported R1 accounting;
accepted terminal refusals; intervention claim/handoff refusal; continuation only
from intervention; positive added turns; required approval; cumulative arithmetic;
focus hashing; focus alias/outside/drift refusal; and continuation failure atomicity.

Core assertions:

```js
const acceptedLast = handoffReviewer({
  ...lastAllowedTurnOptions,
  decision: 'accepted',
});
assert.equal(acceptedLast.lifecycle, 'accepted');
assert.equal(acceptedLast.reviewTurnsUsed, acceptedLast.maxReviewTurns);

const stopped = handoffReviewer({
  ...options,
  decision: 'changes-requested',
  summary: '.tmp/review/human-summary.md',
});
assert.equal(stopped.lifecycle, 'intervention-required');
assert.equal(stopped.reviewTurnsUsed, 6);
assert.equal(stopped.remainingReviewTurns, 0);

const resumed = continueProtocol({
  cwd: root,
  dir,
  additionalTurns: 3,
  approvedBy: 'human@example',
  focus: '.tmp/review/refocus.md',
});
assert.equal(resumed.reviewTurnsUsed, 6);
assert.equal(resumed.maxReviewTurns, 9);
assert.equal(resumed.remainingReviewTurns, 3);
assert.equal(resumed.currentRole, 'owner');
assert.equal(resumed.lifecycle, 'active');
```

For “acceptance wins,” configure `maxReviewTurns: 1`, then assert an accepted first
review needs no summary and becomes terminal accepted.

- [ ] **Step 2: Run focused tests and verify RED**

Expected: FAIL because reviewer handoff/continuation behavior is absent.

- [ ] **Step 3: Implement explicit reviewer handoff and acceptance**

Require a claimed reviewer, exact preceding owner commit, immutable review inside
runtime, unique finding IDs, unchanged HEAD/index/artifact, and decision from the
closed set. Increment `reviewTurnsUsed` exactly once. If accepted, record terminal
`accepted`, clear current role/claim, set remaining turns arithmetically, and refuse
all later mutations.

- [ ] **Step 4: Implement changes-requested budget behavior**

When turns remain, clear claim and make the owner available at the next round. When
the increment reaches the maximum, require a distinct immutable summary, hash it,
record `intervention-required`, and expose the exact `continue` syntax as next action.
Never accept a review after used turns already equal max.

- [ ] **Step 5: Implement additive human continuation and refocus**

Only intervention state can continue. Require positive integer additional turns and
nonblank approved-by identity. Preserve used count, add to max, compute remaining,
record approval. If supplied, require focus inside runtime and distinct from every
state/round/summary path, hash it, and record it in state/event. Return an active,
available owner turn without altering round evidence.

- [ ] **Step 6: Route reviewer handoff and continuation flags**

Reviewer handoff requires:

```text
--dir --actor --review --review-of --decision --message [--summary]
```

Continuation requires:

```text
--dir --additional-turns --approved-by [--focus]
```

Reject role-inapplicable or unknown flags with exit 2 before state mutation.

- [ ] **Step 7: Run focused tests and verify GREEN**

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
```

Expected: explicit decisions, acceptance precedence, interception, cumulative
continuation, and refocus tests PASS.

- [ ] **Step 8: Commit terminal and continuation semantics**

```bash
git add scripts/review/co-review.mjs scripts/review/lib/protocol.mjs \
  scripts/tests/unit/review/co-review.test.mjs
git commit -m "[#1266] feat: govern co-review acceptance and turn budgets"
```

### Task 6: Prove the complete workflow and repository integration

**Files:**

- Modify: `scripts/tests/unit/review/co-review.test.mjs`
- Modify if test evidence exposes a defect: `scripts/review/co-review.mjs`
- Modify if test evidence exposes a defect: `scripts/review/lib/protocol.mjs`
- Modify if help evidence exposes a defect: `scripts/review/lib/help.mjs`

**Interfaces:**

- Consumes: all prior public commands and state transitions.
- Produces: end-to-end evidence for fresh and imported protocols, catalog parity,
  formatting, lint, and package tests.

- [ ] **Step 1: Add failing end-to-end and concurrency tests**

Drive the committed CLI in temporary Git repositories, not only library calls. One
fresh scenario runs owner handoff -> reviewer changes -> owner response/revision ->
reviewer acceptance. One imported scenario starts with R1 used=1, reaches final
changes-requested and summary, resumes with added turns/refocus, then accepts. Assert:

```js
assert.deepEqual(
  events.map(({ revision, type }) => ({ revision, type })),
  [
    { revision: 1, type: 'init-import' },
    { revision: 2, type: 'claim' },
    { revision: 3, type: 'owner-handoff' },
    { revision: 4, type: 'claim' },
    { revision: 5, type: 'reviewer-handoff' },
    { revision: 6, type: 'continue' },
    // subsequent claim/handoff revisions remain strictly monotonic
  ]
);
assert.equal(final.lifecycle, 'accepted');
```

Also launch two claim child processes simultaneously and assert one transition event,
one success/idempotent result, no corrupt JSON, and no silently stolen lock.

- [ ] **Step 2: Run end-to-end additions and verify RED**

Expected: at least one failure exposes any missing CLI output, event ordering,
concurrency serialization, or next-action behavior; if no implementation defect is
found, temporarily assert an intentionally incorrect event count, observe RED, then
restore the correct assertion before proceeding.

- [ ] **Step 3: Make the minimum evidence-driven corrections**

Change only the helper/CLI/help behavior identified by Step 2. Preserve schemas and
public flag names. Every error continues to print the invariant, “no state changed,”
and a recovery command.

- [ ] **Step 4: Run focused and command-surface verification**

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
node --test scripts/tests/unit/task-tracker/lib/executable-entrypoint-classification.test.mjs
node --test scripts/tests/unit/task-tracker/lib/command-catalog-policy.test.mjs
npx aitm co-review --help
npx aitm co-review help continue
git diff --check
```

Expected: all tests PASS; both help pages contain their required recovery sections;
diff check is clean.

- [ ] **Step 5: Run repository quality gates**

```bash
npm run lint
npm run format:check
npm test
npm run test:slow
```

Expected: every command exits 0. If an unrelated pre-existing failure appears,
capture exact evidence and do not weaken the gate or broaden #1266 scope.

- [ ] **Step 6: Commit final workflow hardening**

If Task 6 produced changes:

```bash
git add scripts/review/co-review.mjs scripts/review/lib/protocol.mjs \
  scripts/review/lib/help.mjs scripts/tests/unit/review/co-review.test.mjs
git commit -m "[#1266] test: prove complete co-review workflow"
```

If no files changed, record the successful verification outputs without creating an
empty commit.

- [ ] **Step 7: Perform final governed verification**

Run the repository's Develop-final verifier for issue #1266 at a clean exact SHA,
then follow the AITM Develop -> Test -> Review workflow. Do not invoke approval,
close, push, merge, or branch cleanup without the corresponding human gate.

## Plan Self-Review

- Spec coverage: Tasks 1-6 cover standalone routing, mutation-free recovery help,
  atomic local state, model-agnostic roles, fresh/imported flow, immutable artifacts,
  exact Git/index/branch validation, explicit decisions, terminal acceptance,
  `--max-turns`, summary interception, additive continuation, refocus, bounded wait,
  mutex refusal, status recovery, and end-to-end validation.
- Placeholder scan: the plan contains no deferred implementation placeholders; all
  required behavior, interfaces, commands, expected failures, and commit boundaries
  are explicit.
- Type consistency: all tasks use the Shared Interfaces names and the state fields
  `lifecycle`, `currentRole`, `turnState`, `round`, `reviewTurnsUsed`,
  `maxReviewTurns`, and `remainingReviewTurns`.
