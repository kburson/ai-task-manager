# Reviewer Co-Review Command Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the live provider/session-bound reviewer run only the generated co-review status, handoff-help, and reviewer-handoff commands while every broader Bash mutation remains fail-closed.

**Architecture:** Add a pure closed-grammar classifier beside the existing Bash mutation-target extractor, then compare its structured output with the live reviewer grant inside the co-review write policy. Extend the grant with the exact owner-handoff commit, keep authority-file refusal ahead of every allowance, and leave all protocol mutation and archive publication inside the co-review CLI.

**Tech Stack:** Node.js 22+ ESM, `node:test`, the AITM PreToolUse Bash guard, main-worktree co-review index, immutable co-review protocol, and Git-backed test fixtures.

## Global Constraints

- Recognize only `npx aitm co-review status --dir <runtime> [--json]`, `npx aitm co-review help handoff`, and reviewer `npx aitm co-review handoff ...`.
- Accept exactly one literal shell command with no pipes, redirects, composition, expansion, environment prefixes, wrappers, alternate executables, unknown flags, or duplicate flags.
- Require the repository-local AITM executable so `npx` cannot install or resolve a remote package.
- Compare runtime, actor, pending review, reviewed owner-handoff commit, decision, optional summary, provider, and session with live protocol authority.
- Keep co-review protocol validation authoritative for locking, state rereads, integrity, findings, supplements, budget, decision semantics, events, state, and archive writes.
- Keep direct reviewer writes limited to the exact session-bound pending review artifact.
- Do not modify, import, or impersonate the suspended #939 review; a fresh #939 co-review begins only after #1365 is integrated.
- Add no runtime dependency.

---

### Task 1: Strict reviewer command classifier

**Files:**

- Create: `scripts/task-tracker/lib/reviewer-co-review-command.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs`

**Interfaces:**

- Consumes: original Bash command bytes and `{ projectDir, exists }`.
- Produces: `classifyReviewerCoReviewCommand(command, options)` returning either `{ recognized: false, reason }` or one of the structured recognized command results below.

```js
{ recognized: true, kind: 'status', runtimeDir, json }
{ recognized: true, kind: 'help-handoff' }
{
  recognized: true,
  kind: 'reviewer-handoff',
  runtimeDir,
  actor,
  reviewPath,
  reviewOf,
  decision,
  summaryPath,
  message,
}
```

- [ ] **Step 1: Add exact generated-command acceptance tests**

Add this import to `scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs`:

```js
import { classifyReviewerCoReviewCommand } from '../../../../task-tracker/lib/reviewer-co-review-command.mjs';
```

Extend the existing `node:fs` import with `existsSync`, then add:

```js
function classifierFixture() {
  const projectDir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-review-command-'));
  const localBin = path.join(projectDir, 'node_modules', '.bin', 'aitm');
  mkdirSync(path.dirname(localBin), { recursive: true });
  writeFileSync(localBin, '#!/usr/bin/env node\n', 'utf8');
  const classify = (command, overrides = {}) =>
    classifyReviewerCoReviewCommand(command, {
      projectDir,
      exists: existsSync,
      ...overrides,
    });
  return { projectDir, localBin, classify };
}

test('reviewer command classifier accepts only the generated lifecycle forms', () => {
  const { classify } = classifierFixture();
  assert.deepEqual(classify('npx aitm co-review status --dir .tmp/co-review/p1'), {
    recognized: true,
    kind: 'status',
    runtimeDir: '.tmp/co-review/p1',
    json: false,
  });
  assert.deepEqual(classify('npx aitm co-review status --json --dir .tmp/co-review/p1'), {
    recognized: true,
    kind: 'status',
    runtimeDir: '.tmp/co-review/p1',
    json: true,
  });
  assert.deepEqual(classify('npx aitm co-review help handoff'), {
    recognized: true,
    kind: 'help-handoff',
  });

  const handoff = classify(
    'npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude ' +
      '--review .tmp/co-review/p1/round-2-reviewer-review.md ' +
      '--review-of 0123456789012345678901234567890123456789 ' +
      '--decision accepted --message "review complete"'
  );
  assert.deepEqual(handoff, {
    recognized: true,
    kind: 'reviewer-handoff',
    runtimeDir: '.tmp/co-review/p1',
    actor: 'claude',
    reviewPath: '.tmp/co-review/p1/round-2-reviewer-review.md',
    reviewOf: '0123456789012345678901234567890123456789',
    decision: 'accepted',
    summaryPath: null,
    message: 'review complete',
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the RED state**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `reviewer-co-review-command.mjs`.

- [ ] **Step 3: Add the adversarial closed-grammar tests**

Append:

```js
test('reviewer command classifier rejects every broader shell and CLI form', () => {
  const { classify, localBin } = classifierFixture();
  const rejected = [
    'npx aitm co-review status --dir .tmp/co-review/p1 && touch owned',
    'npx aitm co-review status --dir .tmp/co-review/p1 > .tmp/status.json',
    'npx aitm co-review status --dir "$RUNTIME"',
    'npx aitm co-review status --dir $(pwd)',
    'PATH=/bin npx aitm co-review status --dir .tmp/co-review/p1',
    'bash -lc "npx aitm co-review status --dir .tmp/co-review/p1"',
    'node scripts/review/co-review.mjs status --dir .tmp/co-review/p1',
    './node_modules/.bin/aitm co-review status --dir .tmp/co-review/p1',
    'npx aitm close 1365',
    'npx aitm co-review claim --dir .tmp/co-review/p1 --actor claude',
    'npx aitm co-review help status',
    'npx aitm co-review status --dir .tmp/co-review/p1 --dir .tmp/co-review/p2',
    'npx aitm co-review status --dir ../outside',
    'npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude',
    'npx aitm co-review handoff --dir .tmp/co-review/p1 --actor claude ' +
      '--review .tmp/co-review/p1/r.md --review-of abc --decision maybe ' +
      '--message review',
  ];
  for (const command of rejected) {
    assert.equal(classify(command).recognized, false, command);
  }
  assert.equal(
    classify('npx aitm co-review status --dir .tmp/co-review/p1', {
      exists: (candidate) => candidate !== localBin,
    }).recognized,
    false
  );
});
```

- [ ] **Step 4: Implement the minimal pure classifier**

Create `scripts/task-tracker/lib/reviewer-co-review-command.mjs` with this closed parser:

```js
import { existsSync } from 'node:fs';
import path from 'node:path';

const SHELL_META_RE = /[\0\r\n;&|<>`$*?{}()[\]~]/;
const HANDOFF_VALUE_FLAGS = new Set([
  'dir',
  'actor',
  'review',
  'review-of',
  'decision',
  'summary',
  'message',
]);

function reject(reason) {
  return { recognized: false, reason };
}

function shellWords(input) {
  if (SHELL_META_RE.test(input)) return null;
  const words = [];
  let word = '';
  let quote = '';
  let escaped = false;
  let started = false;
  for (const char of input) {
    if (escaped) {
      word += char;
      escaped = false;
      started = true;
    } else if (char === '\\' && quote !== "'") {
      escaped = true;
    } else if (quote) {
      if (char === quote) quote = '';
      else word += char;
      started = true;
    } else if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (/\s/.test(char)) {
      if (started) words.push(word);
      word = '';
      started = false;
    } else {
      word += char;
      started = true;
    }
  }
  if (quote || escaped) return null;
  if (started) words.push(word);
  return words;
}

function literalPath(value) {
  if (!value || value.includes('\\')) return false;
  const segments = value.split('/');
  return !segments.includes('.') && !segments.includes('..');
}

function options(words, valueFlags, booleanFlags = new Set()) {
  const out = new Map();
  for (let index = 0; index < words.length; index += 1) {
    const token = words[index];
    if (!token.startsWith('--') || token.length === 2) return null;
    const name = token.slice(2);
    if (out.has(name)) return null;
    if (booleanFlags.has(name)) {
      out.set(name, true);
      continue;
    }
    if (!valueFlags.has(name)) return null;
    const value = words[index + 1];
    if (value === undefined || value.startsWith('--') || value.length === 0) return null;
    out.set(name, value);
    index += 1;
  }
  return out;
}

export function classifyReviewerCoReviewCommand(command, config = {}) {
  const projectDir = path.resolve(config.projectDir || process.cwd());
  const exists = config.exists || existsSync;
  const localAitm = path.join(projectDir, 'node_modules', '.bin', 'aitm');
  if (!exists(localAitm)) return reject('local-aitm-unavailable');

  const words = shellWords(String(command || ''));
  if (!words || words.length < 4) return reject('not-one-literal-command');
  if (words[0] !== 'npx' || words[1] !== 'aitm' || words[2] !== 'co-review') {
    return reject('entrypoint');
  }

  const [name, ...rest] = words.slice(3);
  if (name === 'help') {
    return rest.length === 1 && rest[0] === 'handoff'
      ? { recognized: true, kind: 'help-handoff' }
      : reject('help-grammar');
  }
  if (name === 'status') {
    const parsed = options(rest, new Set(['dir']), new Set(['json']));
    const runtimeDir = parsed?.get('dir');
    if (!parsed || parsed.size < 1 || parsed.size > 2 || !literalPath(runtimeDir)) {
      return reject('status-grammar');
    }
    return {
      recognized: true,
      kind: 'status',
      runtimeDir,
      json: parsed.get('json') === true,
    };
  }
  if (name !== 'handoff') return reject('co-review-command');

  const parsed = options(rest, HANDOFF_VALUE_FLAGS);
  const required = ['dir', 'actor', 'review', 'review-of', 'decision', 'message'];
  if (!parsed || required.some((flag) => !parsed.get(flag))) return reject('handoff-grammar');
  if (![6, 7].includes(parsed.size)) return reject('handoff-option-count');
  if (!['accepted', 'changes-requested'].includes(parsed.get('decision'))) {
    return reject('handoff-decision');
  }
  for (const flag of ['dir', 'review', 'summary']) {
    const value = parsed.get(flag);
    if (value !== undefined && !literalPath(value)) return reject(`handoff-${flag}`);
  }
  return {
    recognized: true,
    kind: 'reviewer-handoff',
    runtimeDir: parsed.get('dir'),
    actor: parsed.get('actor'),
    reviewPath: parsed.get('review'),
    reviewOf: parsed.get('review-of'),
    decision: parsed.get('decision'),
    summaryPath: parsed.get('summary') ?? null,
    message: parsed.get('message'),
  };
}
```

- [ ] **Step 5: Run the focused test and confirm the classifier is GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs
```

Expected: all existing and new tests PASS.

- [ ] **Step 6: Commit the classifier slice**

```bash
git add scripts/task-tracker/lib/reviewer-co-review-command.mjs scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs
git commit -m "[#1365] test: define reviewer co-review command grammar"
```

### Task 2: Live-grant projection and policy allowance

**Files:**

- Modify: `scripts/review/lib/index.mjs`
- Modify: `scripts/task-tracker/lib/co-review-write-policy.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs`

**Interfaces:**

- Consumes: Task 1 classifier result as `input.reviewerCommand`.
- Produces: `resolveReviewerGrant()` result with `ownerHandoffCommit`; policy allowance `{ decision: 'allow', reason: 'session-bound-co-review-command', grant }`.

- [ ] **Step 1: Extend the policy fixture with live command authority**

In `policyFixture()`, add these properties to `grant`:

```js
reviewer: 'claude',
ownerHandoffCommit: '0123456789012345678901234567890123456789',
```

Extend the fixture's `evaluate()` defaults with:

```js
reviewerCommand: { recognized: false, reason: 'not-co-review' },
```

Add a helper and tests:

```js
function matchingHandoff({ dir, pending, grant }) {
  return {
    recognized: true,
    kind: 'reviewer-handoff',
    runtimeDir: dir,
    actor: grant.reviewer,
    reviewPath: pending,
    reviewOf: grant.ownerHandoffCommit,
    decision: 'accepted',
    summaryPath: null,
    message: 'review complete',
  };
}

test('matching reviewer status, help, and handoff commands use the session grant', () => {
  const fixture = policyFixture();
  const status = fixture.evaluate({
    toolName: 'Bash',
    targets: [],
    ambiguousMutation: true,
    reviewerCommand: {
      recognized: true,
      kind: 'status',
      runtimeDir: fixture.dir,
      json: false,
    },
  });
  assert.equal(status.reason, 'session-bound-co-review-command');

  const help = fixture.evaluate({
    toolName: 'Bash',
    targets: [],
    ambiguousMutation: true,
    reviewerCommand: { recognized: true, kind: 'help-handoff' },
  });
  assert.equal(help.reason, 'session-bound-co-review-command');

  const handoff = fixture.evaluate({
    toolName: 'Bash',
    targets: [],
    ambiguousMutation: true,
    reviewerCommand: matchingHandoff(fixture),
  });
  assert.equal(handoff.reason, 'session-bound-co-review-command');
});

test('reviewer command fields must agree exactly with live authority', () => {
  const fixture = policyFixture();
  const base = matchingHandoff(fixture);
  const mutations = [
    { runtimeDir: path.join(fixture.projectDir, '.tmp', 'other') },
    { actor: 'codex' },
    { reviewPath: path.join(fixture.dir, 'other.md') },
    { reviewOf: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    { decision: 'changes-requested', summaryPath: path.join(fixture.projectDir, 'outside.md') },
  ];
  for (const mutation of mutations) {
    const result = fixture.evaluate({
      toolName: 'Bash',
      targets: [],
      ambiguousMutation: true,
      reviewerCommand: { ...base, ...mutation },
    });
    assert.equal(result.decision, 'deny');
  }
});
```

- [ ] **Step 2: Run the focused test and confirm policy stays RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs
```

Expected: FAIL because recognized commands still reach `reviewer mutation destinations are incomplete or ambiguous`.

- [ ] **Step 3: Project the exact owner-handoff commit from live state**

In `resolveReviewerGrant()` in `scripts/review/lib/index.mjs`, replace its return with:

```js
const ownerHandoffCommit =
  live.lastHandoff?.from === 'owner' && typeof live.lastHandoff.commit === 'string'
    ? live.lastHandoff.commit
    : null;
if (!ownerHandoffCommit) continue;
return Object.freeze({
  ...clone(row),
  liveRevision: live.revision,
  round: live.round,
  ownerHandoffCommit,
});
```

Add an assertion to the existing index grant test in the same test corpus that the returned commit equals the live owner's commit. Do not derive the value from Git `HEAD`; the protocol's last owner handoff is the authority.

- [ ] **Step 4: Implement exact command-to-grant comparison**

Add these helpers above `evaluateCoReviewWrite()` in `scripts/task-tracker/lib/co-review-write-policy.mjs`:

```js
function canonicalCommandPath(value, projectDir) {
  return canonicalTarget(targetAbsolute(value, projectDir));
}

function reviewerCommandMismatch(command, grant, projectDir) {
  if (!command?.recognized) return 'unrecognized';
  if (command.kind === 'help-handoff') return null;

  const runtime = canonicalCommandPath(command.runtimeDir, projectDir);
  const grantedRuntime = canonicalTarget(path.resolve(grant.dir));
  if (runtime !== grantedRuntime) return 'runtime';
  if (command.kind === 'status') return null;
  if (command.kind !== 'reviewer-handoff') return 'kind';
  if (command.actor !== grant.reviewer) return 'actor';
  if (canonicalCommandPath(command.reviewPath, projectDir) !== canonicalPending(grant)) {
    return 'review';
  }
  if (command.reviewOf !== grant.ownerHandoffCommit) return 'review-of';
  if (!['accepted', 'changes-requested'].includes(command.decision)) return 'decision';
  if (command.summaryPath) {
    const summary = canonicalCommandPath(command.summaryPath, projectDir);
    if (!inside(grantedRuntime, summary)) return 'summary';
  }
  return null;
}
```

Inside the existing `if (grant) {` branch, before the read-only and ambiguous-target checks, add:

```js
if (input.toolName === 'Bash' && input.reviewerCommand?.recognized) {
  try {
    const mismatch = reviewerCommandMismatch(input.reviewerCommand, grant, projectDir);
    if (!mismatch) {
      return { decision: 'allow', reason: 'session-bound-co-review-command', grant };
    }
    return deny(`reviewer co-review command disagrees with live authority: ${mismatch}`);
  } catch (error) {
    return deny(`reviewer co-review command canonicalization failed: ${error.message}`);
  }
}
```

Keep the authority-file check where it already runs: it must execute before grant resolution and before this allowance.

- [ ] **Step 5: Add authority-ordering and wrong-session regressions**

Append tests proving:

```js
test('authority targets deny before an otherwise matching reviewer command', () => {
  const fixture = policyFixture();
  const result = fixture.evaluate({
    toolName: 'Bash',
    targets: [path.join(fixture.projectDir, '.tmp/aitm/fleet/co-review-index.json')],
    ambiguousMutation: false,
    reviewerCommand: matchingHandoff(fixture),
  });
  assert.equal(result.code, 'co-review-authority-file');
});

test('a recognized command cannot cross provider-session ownership', () => {
  const fixture = policyFixture();
  const result = fixture.evaluate({
    toolName: 'Bash',
    provider: 'codex',
    sid: 'other-session',
    resolveGrant: () => null,
    targets: [],
    ambiguousMutation: true,
    reviewerCommand: matchingHandoff(fixture),
  });
  assert.equal(result.decision, 'deny');
  assert.match(result.reason, /different provider session/);
});
```

- [ ] **Step 6: Run the focused test and confirm the policy is GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs
```

Expected: all tests PASS, including the pre-existing pending-file and symlink tests.

- [ ] **Step 7: Commit the grant and policy slice**

```bash
git add scripts/review/lib/index.mjs scripts/task-tracker/lib/co-review-write-policy.mjs scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs
git commit -m "[#1365] fix: authorize session-bound reviewer commands"
```

### Task 3: Bash-guard wiring and real guard-to-CLI regression

**Files:**

- Modify: `scripts/task-tracker/bash-guard.mjs`
- Create: `scripts/tests/unit/task-tracker/core/reviewer-co-review-command-boundary.test.mjs`

**Interfaces:**

- Consumes: `classifyReviewerCoReviewCommand()` from Task 1 and the policy input from Task 2.
- Produces: a PreToolUse pass with empty stdout for a matching reviewer command; all refusals still emit the existing block JSON.

- [ ] **Step 1: Add the end-to-end failing boundary test**

Create `scripts/tests/unit/task-tracker/core/reviewer-co-review-command-boundary.test.mjs`:

```js
// @story #1365
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  cleanupTemporaryRoots,
  realRepositoryFixture,
  runCli,
} from '../../../fixtures/co-review-fixture.mjs';

const GUARD = path.resolve('scripts/task-tracker/bash-guard.mjs');
const REVIEWER_ENV = {
  ...process.env,
  AI_TASK_MANAGER_SESSION_ID: 'reviewer-command-boundary-1365',
  GROK_AGENT: '1',
  GROK_SESSION_ID: 'reviewer-command-boundary-1365',
};

test.afterEach(cleanupTemporaryRoots);

function successfulCli(args, root) {
  const result = runCli(args, { cwd: root, env: REVIEWER_ENV });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function runGuard(root, command) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [GUARD], {
      cwd: root,
      env: REVIEWER_ENV,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(
      JSON.stringify({
        tool_name: 'Bash',
        cwd: root,
        tool_input: { command },
      })
    );
  });
}

test('live reviewer command passes the guard and reaches accepted archived state', async () => {
  const fixture = realRepositoryFixture();
  const dir = '.tmp/co-review/boundary-1365';
  const archiveDir = 'docs/superpowers/reviews/1365/boundary-fixture';
  mkdirSync(path.join(fixture.root, 'node_modules', '.bin'), { recursive: true });
  writeFileSync(path.join(fixture.root, 'node_modules', '.bin', 'aitm'), '#!/usr/bin/env node\n');

  successfulCli(
    [
      'init',
      '--dir',
      dir,
      '--artifact',
      fixture.artifact,
      '--owner',
      'owner-agent',
      '--reviewer',
      'reviewer-agent',
      '--max-turns',
      '3',
      '--archive-dir',
      archiveDir,
    ],
    fixture.root
  );
  successfulCli(['claim', '--dir', dir, '--actor', 'owner-agent'], fixture.root);

  const response = `${dir}/round-1-owner-response.md`;
  writeFileSync(path.join(fixture.root, response), '# Owner response\n\nReady for review.\n');
  successfulCli(
    [
      'handoff',
      '--dir',
      dir,
      '--actor',
      'owner-agent',
      '--response',
      response,
      '--artifact',
      fixture.artifact,
      '--commit',
      fixture.initialCommit,
      '--message',
      'owner handoff complete',
    ],
    fixture.root
  );
  successfulCli(['claim', '--dir', dir, '--actor', 'reviewer-agent'], fixture.root);

  const review = `${dir}/round-2-reviewer-review.md`;
  writeFileSync(path.join(fixture.root, review), '# Review\n\nDecision: accepted.\n');
  const command = [
    'npx aitm co-review handoff',
    `--dir ${dir}`,
    '--actor reviewer-agent',
    `--review ${review}`,
    `--review-of ${fixture.initialCommit}`,
    '--decision accepted',
    '--message "review complete"',
  ].join(' ');

  const guard = await runGuard(fixture.root, command);
  assert.equal(guard.status, 0, guard.stderr);
  assert.equal(guard.stdout, '');

  const accepted = successfulCli(
    [
      'handoff',
      '--dir',
      dir,
      '--actor',
      'reviewer-agent',
      '--review',
      review,
      '--review-of',
      fixture.initialCommit,
      '--decision',
      'accepted',
      '--message',
      'review complete',
    ],
    fixture.root
  );
  assert.equal(accepted.lifecycle, 'accepted');
  assert.equal(accepted.archive.completion, 'complete-and-identical');
  assert.equal(accepted.archivePublication.status, 'published');
});
```

- [ ] **Step 2: Run the boundary test and confirm the original defect**

Run:

```bash
node --test scripts/tests/unit/task-tracker/core/reviewer-co-review-command-boundary.test.mjs
```

Expected: FAIL because the Bash guard emits `reviewer mutation destinations are incomplete or ambiguous` before the command reaches the CLI.

- [ ] **Step 3: Wire the classifier into the Bash guard**

In the dynamic import block of `scripts/task-tracker/bash-guard.mjs`, add:

```js
const { classifyReviewerCoReviewCommand } = await import('./lib/reviewer-co-review-command.mjs');
```

Immediately after `coReviewTargets` is computed, add:

```js
const reviewerCommand = classifyReviewerCoReviewCommand(command, {
  projectDir: projectRoot,
});
```

Pass it to the policy:

```js
const coReview = evaluateCoReviewWrite({
  projectDir: projectRoot,
  worktreePath: projectRoot,
  provider,
  sid,
  toolName: 'Bash',
  targets: coReviewTargets.targets,
  ambiguousMutation: coReviewTargets.ambiguousMutation,
  reviewerCommand,
});
```

Do not add `npx` to `READ_ONLY_COMMANDS` and do not short-circuit any later Bash guard policy.

- [ ] **Step 4: Add negative boundary assertions**

In the same boundary test, after the reviewer claim and before the accepted command, loop over commands that must remain blocked:

```js
for (const denied of [
  `npx aitm co-review handoff --dir ${dir} --actor owner-agent ` +
    `--review ${review} --review-of ${fixture.initialCommit} ` +
    '--decision accepted --message "review complete"',
  `npx aitm co-review handoff --dir ${dir} --actor reviewer-agent ` +
    `--review ${review} --review-of ${fixture.initialCommit} ` +
    '--decision accepted --message "review complete" && touch owned',
  `npx aitm co-review finalize --dir ${dir}`,
]) {
  const refusal = await runGuard(fixture.root, denied);
  assert.equal(refusal.status, 0, refusal.stderr);
  const decision = JSON.parse(refusal.stdout);
  assert.equal(decision.decision, 'block', denied);
}
```

- [ ] **Step 5: Run both focused test files**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs scripts/tests/unit/task-tracker/core/reviewer-co-review-command-boundary.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 6: Commit the hook boundary slice**

```bash
git add scripts/task-tracker/bash-guard.mjs scripts/tests/unit/task-tracker/core/reviewer-co-review-command-boundary.test.mjs
git commit -m "[#1365] fix: pass reviewer commands through Bash guard"
```

### Task 4: Generated handoff and operator documentation

**Files:**

- Modify: `scripts/review/lib/start.mjs`
- Modify: `scripts/tests/fixtures/co-review-start-cases.mjs`
- Modify: `docs/guides/github-native-coordination.md`

**Interfaces:**

- Consumes: the three exact command forms implemented in Tasks 1-3.
- Produces: generated reviewer instructions and operator documentation that describe the allowance without implying generic Bash access.

- [ ] **Step 1: Add the generated-wording regression**

In the existing `start delegates initialization and publishes concrete hashed handoffs before thin output` test in `scripts/tests/fixtures/co-review-start-cases.mjs`, add:

```js
assert.match(reviewer, /narrowly authorizes.*status.*help handoff.*reviewer handoff/is);
assert.match(reviewer, /arbitrary Bash remains blocked/i);
assert.match(reviewer, /live provider.*session.*claim/i);
```

- [ ] **Step 2: Run the co-review test and confirm the wording test is RED**

Run:

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
```

Expected: FAIL on the three new reviewer-handoff assertions.

- [ ] **Step 3: Add precise reviewer guidance**

In `renderReviewerHandoff()` in `scripts/review/lib/start.mjs`, insert this paragraph immediately after `## Reviewer turn`:

```text
While your live provider/session owns this reviewer claim, AITM narrowly authorizes the generated co-review status command, `co-review help handoff`, and your exact reviewer handoff. Arbitrary Bash remains blocked. A mismatch in runtime, actor, review path, reviewed commit, decision, summary boundary, provider, or session is a refusal; correct the command from current status rather than bypassing the guard.
```

- [ ] **Step 4: Update the operator guide**

Replace the final paragraph of `docs/guides/github-native-coordination.md`'s `Local occupancy and co-review` section with:

```markdown
Co-review reviewers remain unbound: they do not run `/task start #N`. When the
reviewer claims a turn, AITM records the exact provider, real session id,
pending review artifact, and live protocol authority in a main-anchored index.
Edit, Write, and `apply_patch` may write only that exact pending review artifact
for that exact provider/session. Bash additionally recognizes only the
generated `npx aitm co-review status --dir <runtime> [--json]`,
`npx aitm co-review help handoff`, and exact reviewer-handoff forms. The command
must agree with the live runtime, reviewer, pending review, owner-handoff commit,
bounded decision fields, provider, and session; the co-review CLI then
revalidates and mutates under its protocol mutex.

No generic `npx`, AITM, or Bash allowance exists. Mixed targets, tracked source,
other `.tmp/**` files, occupancy/index files, protocol state, malformed patches,
shell composition or expansion, alternate executables, wrong-session commands,
and symlink drift fail closed. The index never grants access by itself; every
decision revalidates live protocol state and event integrity.
```

- [ ] **Step 5: Run focused documentation and handoff checks**

Run:

```bash
node --test scripts/tests/unit/review/co-review.test.mjs
npx prettier --check scripts/review/lib/start.mjs scripts/tests/fixtures/co-review-start-cases.mjs docs/guides/github-native-coordination.md
npx markdownlint-cli2 docs/guides/github-native-coordination.md
npx cspell docs/guides/github-native-coordination.md scripts/review/lib/start.mjs
```

Expected: every command exits 0.

- [ ] **Step 6: Commit the documentation slice**

```bash
git add scripts/review/lib/start.mjs scripts/tests/fixtures/co-review-start-cases.mjs docs/guides/github-native-coordination.md
git commit -m "[#1365] docs: explain reviewer command allowance"
```

### Task 5: Full verification and governed handoff

**Files:**

- Verify: `docs/superpowers/specs/2026-08-21-1365-reviewer-co-review-command-guard-design.md`
- Verify: `docs/superpowers/plans/2026-08-21-1365-reviewer-co-review-command-guard.md`
- Verify: all production, test, and documentation files changed in Tasks 1-4.

**Interfaces:**

- Consumes: all prior task deliverables.
- Produces: exact-SHA verification evidence suitable for `/task test 1365` and subsequent independent review.

- [ ] **Step 1: Run the three issue-specific verification commands**

```bash
node --test scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs
node --test scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs scripts/tests/unit/review/co-review.test.mjs
node --test scripts/tests/unit/task-tracker/core/reviewer-co-review-command-boundary.test.mjs
```

Expected: all commands exit 0 with no failed tests.

- [ ] **Step 2: Run formatting and lint before the suites**

```bash
npm run lint
npm run format:check
git diff --check
```

Expected: all commands exit 0 and `git diff --check` prints nothing.

- [ ] **Step 3: Run the repository regression lanes**

```bash
npm test
npm run test:slow
```

Expected: both commands exit 0.

- [ ] **Step 4: Inspect the security-sensitive diff**

```bash
git diff origin/trunk...HEAD -- scripts/task-tracker/lib/reviewer-co-review-command.mjs scripts/task-tracker/lib/co-review-write-policy.mjs scripts/task-tracker/bash-guard.mjs scripts/review/lib/index.mjs scripts/review/lib/start.mjs
git status --short
```

Expected: the diff contains no generic `npx` allowlist, no protocol mutation outside the co-review CLI, and no unrelated files. The status shows only intentional changes.

- [ ] **Step 5: Commit any verification-only corrections and record the trail**

If verification required corrections, commit only those exact files:

```bash
git add scripts docs
git commit -m "[#1365] fix: complete reviewer guard verification"
npx aitm commit-trace 1365
```

If no corrections were required, run only:

```bash
npx aitm commit-trace 1365
```

- [ ] **Step 6: Enter Test through the governed workflow**

```bash
npx aitm test 1365
```

Expected: AITM executes or reuses exact-SHA verification receipts, stamps each satisfied criterion from its cited command, and advances #1365 from Develop to Test without bypass flags.

- [ ] **Step 7: Preserve #939 recovery ordering**

Do not touch `.worktrees/939-full-auto-merge/.tmp/co-review/939-governed-pr-delivery-design-1`. After #1365 is independently reviewed and integrated, synchronize #939 through its governed branch procedure, create a fresh ignored runtime, and ask Claude to review the then-current artifact without importing the old accepted review.
