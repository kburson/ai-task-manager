#!/usr/bin/env node
// Tests for scripts/task-tracker/lib/issue-body-push.mjs — the single-use
// body-push helper (#258). Core guarantee: the scratch file is deleted ONLY
// after a successful push; on a rejected push it is preserved for inspection
// and the error is rethrown. All I/O is injected — no network, no real fs.

import { strict as assert } from 'node:assert';
import { pushIssueBody } from '../lib/issue-body-push.mjs';

// Build an injectable deps triple that records calls.
function makeDeps({ pexecImpl } = {}) {
  const calls = { writes: [], unlinks: [], pexec: [] };
  return {
    calls,
    deps: {
      writeFileSync: (p, body, enc) => {
        calls.writes.push({ p, body, enc });
      },
      unlinkSync: (p) => {
        calls.unlinks.push(p);
      },
      pexec: async (cmd, args, opts) => {
        calls.pexec.push({ cmd, args, opts });
        if (pexecImpl) return pexecImpl({ cmd, args, opts });
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

  // body was staged to the scratch path
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.writes[0].p, '/tmp/scratch-258.md');
  assert.equal(calls.writes[0].body, 'new body');
  assert.equal(calls.writes[0].enc, 'utf8');

  // pushed via `gh issue edit ... --body-file <scratch>` with the timeout
  assert.equal(calls.pexec.length, 1);
  assert.equal(calls.pexec[0].cmd, 'gh');
  assert.deepEqual(calls.pexec[0].args, [
    'issue',
    'edit',
    '258',
    '-R',
    'o/r',
    '--body-file',
    '/tmp/scratch-258.md',
  ]);
  assert.equal(calls.pexec[0].opts.timeout, 1234);

  // scratch deleted only after the push resolved
  assert.deepEqual(calls.unlinks, ['/tmp/scratch-258.md']);
}

// ── failure path: push rejects → scratch PRESERVED, error rethrown ───────────
{
  const { calls, deps } = makeDeps({
    pexecImpl: () => {
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

  // body was written...
  assert.equal(calls.writes.length, 1);
  // ...the push was attempted...
  assert.equal(calls.pexec.length, 1);
  // ...but the scratch was NOT deleted (preserved for inspection/retry).
  assert.deepEqual(calls.unlinks, [], 'scratch must be preserved on push failure');
}

// ── failure path: async-rejecting pexec → scratch preserved ──────────────────
{
  const { calls, deps } = makeDeps({
    pexecImpl: async () => {
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
  const res = await pushIssueBody({
    issueNumber: 1,
    repo: 'o/r',
    body: 'b',
    scratchPath: '/tmp/scratch-unlink-throws.md',
    deps: {
      writeFileSync: () => {},
      unlinkSync: () => {
        calls.unlinks += 1;
        throw new Error('already gone');
      },
      pexec: async () => ({ stdout: '' }),
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
