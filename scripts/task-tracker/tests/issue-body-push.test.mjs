#!/usr/bin/env node
// Tests for scripts/task-tracker/lib/issue-body-push.mjs — the single-use
// body-push helper (#258). Core guarantee: the scratch file is deleted ONLY
// after a successful push; on a rejected push it is preserved for inspection
// and the error is rethrown. All I/O is injected — no network, no real fs.

import { strict as assert } from 'node:assert';
import { pushIssueBody } from '../lib/issue-body-push.mjs';

// Build an injectable deps triple that records calls.
//
// The default `pexec` mock is stateful: `gh issue view` returns the most
// recent body staged to the scratch path (or '' before any push). This is
// the realistic model needed since `pushIssueBody` now routes through
// `versionedWriteBody` (#290), which fetches before each push and verifies
// after.
function makeDeps({ pexecImpl } = {}) {
  const calls = { writes: [], unlinks: [], pexec: [] };
  const stagedBody = { current: '' };
  return {
    calls,
    deps: {
      writeFileSync: (p, body, enc) => {
        calls.writes.push({ p, body, enc });
        stagedBody.current = body;
      },
      unlinkSync: (p) => {
        calls.unlinks.push(p);
      },
      pexec: async (cmd, args, opts) => {
        calls.pexec.push({ cmd, args, opts });
        if (pexecImpl) return pexecImpl({ cmd, args, opts });
        if (cmd === 'gh' && args[0] === 'issue' && args[1] === 'view') {
          return { stdout: stagedBody.current, stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    },
  };
}

// ── happy path: write → push → delete ────────────────────────────────────────
{
  const { calls, deps } = makeDeps();
  const res = await pushIssueBody({
    issueNumber: 258,
    repo: 'o/r',
    body: 'new body',
    scratchPath: '/tmp/scratch-258.md',
    timeout: 1234,
    deps,
  });

  assert.deepEqual(res, { status: 'ok', scratchPath: '/tmp/scratch-258.md' });

  // body was staged to the scratch path; the staged body has the
  // `aitm-body-version` marker appended (epic #288 wire-up).
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.writes[0].p, '/tmp/scratch-258.md');
  assert.match(calls.writes[0].body, /^new body\n+<!-- aitm-body-version: 1 -->/);
  assert.equal(calls.writes[0].enc, 'utf8');

  // pexec sequence: fetch (view) → push (edit) → verify (view).
  const editCalls = calls.pexec.filter((c) => c.args[0] === 'issue' && c.args[1] === 'edit');
  assert.equal(editCalls.length, 1, 'exactly one gh issue edit');
  assert.deepEqual(editCalls[0].args, [
    'issue',
    'edit',
    '258',
    '-R',
    'o/r',
    '--body-file',
    '/tmp/scratch-258.md',
  ]);
  assert.equal(editCalls[0].opts.timeout, 1234);

  // scratch deleted only after the push resolved
  assert.deepEqual(calls.unlinks, ['/tmp/scratch-258.md']);
}

// ── failure path: push rejects → scratch PRESERVED, error rethrown ───────────
// Only the `gh issue edit` (push) throws; `gh issue view` (fetch) still
// returns an empty body so the helper reaches the push step.
{
  const { calls, deps } = makeDeps({
    pexecImpl: ({ args }) => {
      if (args[0] === 'issue' && args[1] === 'view') return { stdout: '', stderr: '' };
      throw new Error('gh exploded');
    },
  });

  await assert.rejects(
    pushIssueBody({
      issueNumber: 258,
      repo: 'o/r',
      body: 'new body',
      scratchPath: '/tmp/scratch-fail.md',
      deps,
    }),
    /gh exploded/
  );

  // body was written (push attempted)...
  assert.equal(calls.writes.length, 1);
  // ...but the scratch was NOT deleted (preserved for inspection/retry).
  assert.deepEqual(calls.unlinks, [], 'scratch must be preserved on push failure');
}

// ── failure path: async-rejecting pexec → scratch preserved ──────────────────
{
  const { calls, deps } = makeDeps({
    pexecImpl: async ({ args }) => {
      if (args[0] === 'issue' && args[1] === 'view') return { stdout: '', stderr: '' };
      throw new Error('network timeout');
    },
  });

  await assert.rejects(
    pushIssueBody({
      issueNumber: 7,
      repo: 'o/r',
      body: 'x',
      scratchPath: '/tmp/scratch-async-fail.md',
      deps,
    }),
    /network timeout/
  );
  assert.deepEqual(calls.unlinks, []);
}

// ── unlink failure after success is non-fatal ────────────────────────────────
{
  const calls = { unlinks: 0 };
  let staged = '';
  const res = await pushIssueBody({
    issueNumber: 1,
    repo: 'o/r',
    body: 'b',
    scratchPath: '/tmp/scratch-unlink-throws.md',
    deps: {
      writeFileSync: (_p, body) => {
        staged = body;
      },
      unlinkSync: () => {
        calls.unlinks += 1;
        throw new Error('already gone');
      },
      pexec: async (cmd, args) => {
        if (cmd === 'gh' && args[0] === 'issue' && args[1] === 'view') {
          return { stdout: staged, stderr: '' };
        }
        return { stdout: '' };
      },
    },
  });
  // delete was attempted and threw, but the call still resolved ok
  assert.equal(calls.unlinks, 1);
  assert.deepEqual(res, { status: 'ok', scratchPath: '/tmp/scratch-unlink-throws.md' });
}

// ── argument validation ──────────────────────────────────────────────────────
{
  await assert.rejects(
    pushIssueBody({ repo: 'o/r', body: 'b', scratchPath: '/tmp/x.md' }),
    /issueNumber is required/
  );
  await assert.rejects(
    pushIssueBody({ issueNumber: 1, body: 'b', scratchPath: '/tmp/x.md' }),
    /repo is required/
  );
  await assert.rejects(
    pushIssueBody({ issueNumber: 1, repo: 'o/r', body: 'b' }),
    /scratchPath is required/
  );
  // issueNumber 0 is rejected only via `== null`? No — 0 is a valid number; the
  // guard uses `== null`, so 0 passes the required check. Confirm it does not
  // throw the "required" error (it would only fail later at the injected push).
  {
    const { deps } = makeDeps();
    const res = await pushIssueBody({
      issueNumber: 0,
      repo: 'o/r',
      body: 'b',
      scratchPath: '/tmp/zero.md',
      deps,
    });
    assert.equal(res.status, 'ok');
  }
}

console.log('issue-body-push.test.mjs: all passed');
