#!/usr/bin/env node
// @story #509
// Regression: `/task new` must create issues through the sanctioned
// `scripts/gh/create-issue.mjs --shape stub` wrapper, NOT a direct
// `gh issue create`. A raw `gh issue create` skips the canonical body,
// `aitm-fields`, Definition of Done, Pickup Directive, Backlog entry marker,
// project tether, and placeholder substitution. These tests pin the routing
// by capturing what `createNewIssue` shells out to.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import path from 'node:path';
import { createNewIssue } from '../../verbs/new.mjs';

const CFG = {
  repo: 'kburson/ai-task-manager',
  assignee: '@me',
  defaultLabels: ['ai-task'],
  hookNetworkTimeoutMs: 5000,
};

function makeCtx(capture) {
  return {
    cfg: CFG,
    SKIP_NETWORK: false,
    pexec: async (cmd, args) => {
      capture.cmd = cmd;
      capture.args = args;
      return { stdout: 'https://github.com/kburson/ai-task-manager/issues/4242\n', stderr: '' };
    },
  };
}

test('routes through create-issue.mjs --shape stub, not raw gh issue create', async () => {
  const capture = {};
  const issue = await createNewIssue('My new idea', makeCtx(capture));

  // It runs node on the create-issue.mjs wrapper, never the `gh` binary.
  assert.equal(capture.cmd, process.execPath, 'must invoke the node executable, not `gh`');
  assert.notEqual(capture.cmd, 'gh', 'must not shell `gh` directly');

  const scriptArg = capture.args[0];
  assert.equal(
    path.basename(scriptArg),
    'create-issue.mjs',
    'first arg must be the create-issue.mjs wrapper'
  );
  assert.ok(path.isAbsolute(scriptArg), 'wrapper path must be resolved absolutely');

  // The sanctioned stub shape is requested.
  const shapeIdx = capture.args.indexOf('--shape');
  assert.ok(shapeIdx !== -1, '--shape must be passed');
  assert.equal(capture.args[shapeIdx + 1], 'stub', 'must use the stub shape');

  // Title + assignee forwarded.
  const titleIdx = capture.args.indexOf('--title');
  assert.equal(capture.args[titleIdx + 1], 'My new idea');
  assert.ok(capture.args.includes('--assignee'), 'assignee forwarded');

  // Never the direct creation verb.
  assert.ok(
    !(capture.args.includes('issue') && capture.args.includes('create')),
    'must not pass `issue create` (the raw gh path)'
  );

  // Issue number parsed from the wrapper URL output.
  assert.equal(issue, '#4242');
});

test('honors TT_FAKE_NEW_ISSUE short-circuit without shelling out', async () => {
  const capture = {};
  process.env.TT_FAKE_NEW_ISSUE = '#9001';
  try {
    const issue = await createNewIssue('whatever', makeCtx(capture));
    assert.equal(issue, '#9001');
    assert.equal(capture.cmd, undefined, 'no subprocess when faking');
  } finally {
    delete process.env.TT_FAKE_NEW_ISSUE;
  }
});

test('SKIP_NETWORK short-circuits to #0 without shelling out', async () => {
  const capture = {};
  const ctx = makeCtx(capture);
  ctx.SKIP_NETWORK = true;
  const issue = await createNewIssue('whatever', ctx);
  assert.equal(issue, '#0');
  assert.equal(capture.cmd, undefined, 'no subprocess when network skipped');
});
