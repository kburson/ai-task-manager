// @story #715
// #715 — verifier for the `board` read verb and the cross-project `gh` guard.
//
// AC1: `aitm board [#N]` prints the bound project's Status (resolving projectId
//      internally), taking the target from `#N` else the active issue, and never
//      falling back to the timing/"No active task" output.
// AC2: the guard refuses every `gh project` number / owner-scan form outright.
// AC3: the guard refuses a `gh api graphql` ProjectV2 op whose id differs from
//      the bound projectId, and allows one that pins only the bound projectId.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveBoardTarget, verbBoard } from '../../../verbs/board.mjs';
import { evaluateGhProject } from '../../../lib/gh-project-guard.mjs';

const BOUND = 'PVT_kwHOABCEY84BXill';

// --- AC1: board target resolution -----------------------------------------

test('resolveBoardTarget: explicit #N wins over active issue', () => {
  assert.equal(resolveBoardTarget(['#715'], '#42'), 715);
  assert.equal(resolveBoardTarget(['715'], '42'), 715);
});

test('resolveBoardTarget: falls back to the active issue', () => {
  assert.equal(resolveBoardTarget([], '#42'), 42);
  assert.equal(resolveBoardTarget([], '42'), 42);
});

test('resolveBoardTarget: null when neither is present', () => {
  assert.equal(resolveBoardTarget([], null), null);
  assert.equal(resolveBoardTarget(['not-a-number'], null), null);
});

// --- AC1: verbBoard prints board Status, not timing -----------------------

function captureLog(fn) {
  const lines = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a) => lines.push(a.join(' '));
  console.error = (...a) => lines.push(a.join(' '));
  return Promise.resolve(fn())
    .finally(() => {
      console.log = origLog;
      console.error = origErr;
    })
    .then(() => lines);
}

test('verbBoard: prints "#N board Status: <state>" from the pinned reader', async () => {
  let queried = null;
  const ctx = {
    rest: ['#715'],
    statePath: '/nonexistent/aitm-state.json',
    getIssueBoardState: async (n) => {
      queried = n;
      return 'Develop';
    },
  };
  const lines = await captureLog(() => verbBoard(ctx));
  assert.equal(queried, 715, 'reader queried the resolved target');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^#715 board Status: Develop$/);
  // AC1 negative: never the timing / "No active task" phrasing.
  assert.doesNotMatch(lines[0], /No active task|Elapsed|words since/);
});

test('verbBoard: reports not-on-board when the pinned reader returns null', async () => {
  const ctx = {
    rest: ['#999'],
    statePath: '/nonexistent/aitm-state.json',
    getIssueBoardState: async () => null,
  };
  const lines = await captureLog(() => verbBoard(ctx));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^#999 is not on the bound project board\.$/);
});

test('verbBoard: usage error and non-zero exit when no target resolvable', async () => {
  const prevExit = process.exitCode;
  const ctx = {
    rest: [],
    statePath: '/nonexistent/aitm-state.json',
    getIssueBoardState: async () => {
      throw new Error('should not be called');
    },
  };
  const lines = await captureLog(() => verbBoard(ctx));
  assert.match(lines[0], /Usage: \/task board/);
  assert.equal(process.exitCode, 1);
  process.exitCode = prevExit; // restore so the test run itself is not marked failed
});

// --- AC2: gh project subcommands refused outright --------------------------

test('evaluateGhProject: blocks `gh project item-list <n> --owner`', () => {
  const r = evaluateGhProject({
    command: 'gh project item-list 1 --owner kburson --format json',
    boundProjectId: BOUND,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /gh project/);
  assert.match(r.reason, /aitm board/);
});

test('evaluateGhProject: blocks other gh project forms (view, item-add)', () => {
  for (const cmd of [
    'gh project view 7 --owner kburson',
    'gh project item-add 3 --owner kburson --url https://github.com/kburson/ai-task-manager/issues/1',
    'gh project field-list 3 --owner kburson',
  ]) {
    assert.equal(evaluateGhProject({ command: cmd, boundProjectId: BOUND }).block, true, cmd);
  }
});

test('evaluateGhProject: a bare mention of "gh project" in prose does not trip', () => {
  // No subcommand word follows — this is a grep/echo, not an invocation.
  const r = evaluateGhProject({
    command: 'echo "use aitm board instead of gh project"',
    boundProjectId: BOUND,
  });
  assert.equal(r.block, false);
});

// --- AC3: gh api graphql ProjectV2 id pinning ------------------------------

test('evaluateGhProject: blocks a ProjectV2 query pinning a non-bound id', () => {
  const cmd =
    'gh api graphql -f query=\'query { node(id: "PVT_notBound12345") { ... on ProjectV2 { title } } }\'';
  const r = evaluateGhProject({ command: cmd, boundProjectId: BOUND });
  assert.equal(r.block, true);
  assert.match(r.reason, /not the bound project/);
});

test('evaluateGhProject: allows a ProjectV2 query pinning only the bound id', () => {
  const cmd = `gh api graphql -f query='query { node(id: "${BOUND}") { ... on ProjectV2 { title } } }'`;
  const r = evaluateGhProject({ command: cmd, boundProjectId: BOUND });
  assert.equal(r.block, false);
});

test('evaluateGhProject: blocks a ProjectV2 query with no pinned id (client filter)', () => {
  const cmd =
    'gh api graphql -f query=\'query { repository(owner:"kburson", name:"ai-task-manager") { issue(number:11) { projectItems(first:10) { nodes { project { number } } } } } }\'';
  const r = evaluateGhProject({ command: cmd, boundProjectId: BOUND });
  assert.equal(r.block, true);
  assert.match(r.reason, /no pinned project id|content\.number/);
});

test('evaluateGhProject: fails closed when boundProjectId is unreadable (null)', () => {
  // Even the exact-id form is refused because we cannot confirm it is the bound board.
  const cmd = `gh api graphql -f query='query { node(id: "${BOUND}") { ... on ProjectV2 { title } } }'`;
  assert.equal(evaluateGhProject({ command: cmd, boundProjectId: null }).block, true);
});

test('evaluateGhProject: ignores non-project gh api graphql (issues, sub-issues)', () => {
  const cmd =
    'gh api graphql -f query=\'query { repository(owner:"kburson", name:"x") { issue(number:1) { title } } }\'';
  assert.equal(evaluateGhProject({ command: cmd, boundProjectId: BOUND }).block, false);
});

test('evaluateGhProject: ignores unrelated commands', () => {
  assert.equal(evaluateGhProject({ command: 'git status', boundProjectId: BOUND }).block, false);
  assert.equal(
    evaluateGhProject({ command: 'gh issue view 715 --json title', boundProjectId: BOUND }).block,
    false
  );
});
