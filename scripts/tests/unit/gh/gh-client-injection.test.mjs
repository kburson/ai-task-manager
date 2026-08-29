// @story #1409
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ghClient, pexec } from '../../../gh/lib/gh-client.mjs';
import { deps as githubProjectsDeps } from '../../../gh/lib/github-projects.mjs';
import { deriveAndRescan } from '../../../task-tracker/lib/review-derive-rescan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const SCOPED_MODULES = [
  'scripts/task-tracker/lib/apply-reevaluate.mjs',
  'scripts/task-tracker/lib/apply-refinement-estimate.mjs',
  'scripts/task-tracker/lib/discuss-label.mjs',
  'scripts/task-tracker/lib/estimation/runtime-adapter.mjs',
  'scripts/task-tracker/lib/issue-body-push.mjs',
  'scripts/task-tracker/lib/markers.mjs',
  'scripts/task-tracker/lib/review-derive-rescan.mjs',
  'scripts/task-tracker/lib/worktree-relocation-guard.mjs',
  'scripts/task-tracker/runtime.mjs',
  'scripts/task-tracker/verbs/ac-stamp.mjs',
  'scripts/task-tracker/verbs/approve.mjs',
  'scripts/task-tracker/verbs/block.mjs',
  'scripts/task-tracker/verbs/check.mjs',
  'scripts/task-tracker/verbs/close.mjs',
  'scripts/task-tracker/verbs/demote.mjs',
  'scripts/task-tracker/verbs/dod-stamp.mjs',
  'scripts/task-tracker/verbs/epic-reconcile.mjs',
  'scripts/task-tracker/verbs/evidence-markers.mjs',
  'scripts/task-tracker/verbs/inflate-estimate.mjs',
  'scripts/task-tracker/verbs/kind.mjs',
  'scripts/task-tracker/verbs/plan-approve.mjs',
  'scripts/task-tracker/verbs/promote.mjs',
  'scripts/task-tracker/verbs/reconcile.mjs',
  'scripts/task-tracker/verbs/refine.mjs',
  'scripts/task-tracker/verbs/review.mjs',
  'scripts/task-tracker/verbs/supersede.mjs',
  'scripts/task-tracker/verbs/test.mjs',
  'scripts/task-tracker/verbs/unblock.mjs',
  'scripts/task-tracker/verbs/user-story.mjs',
];

test('shared pexec resolves the injectable client at invocation time', async () => {
  assert.equal(githubProjectsDeps, ghClient, 'legacy github-projects seam aliases one client');
  const original = ghClient.pexec;
  const calls = [];
  ghClient.pexec = async (...args) => {
    calls.push(args);
    return { stdout: 'ok', stderr: '' };
  };
  try {
    assert.deepEqual(await pexec('gh', ['api', 'rate_limit'], { timeout: 1234 }), {
      stdout: 'ok',
      stderr: '',
    });
    assert.deepEqual(calls, [['gh', ['api', 'rate_limit'], { timeout: 1234 }]]);
  } finally {
    ghClient.pexec = original;
  }
});

test('all 29 scoped modules resolve through the shared client', () => {
  assert.equal(SCOPED_MODULES.length, 29);
  let directImports = 0;
  for (const relativePath of SCOPED_MODULES) {
    const source = readFileSync(path.join(ROOT, relativePath), 'utf8');
    assert.doesNotMatch(
      source,
      /(?:const|let|var)\s+\w+\s*=\s*promisify\(execFile\)/,
      relativePath
    );
    if (/gh-client\.mjs/.test(source)) directImports += 1;
    else assert.match(source, /\{[^}]*\bpexec\b[^}]*\}\s*=\s*ctx/s, relativePath);
  }
  assert.equal(directImports, 25, '25 modules import the client; four consume runtime ctx.pexec');
});

test('derive-and-rescan falls back to the shared client without changing calls', async () => {
  const original = ghClient.pexec;
  const calls = [];
  ghClient.pexec = async (file, args, options) => {
    calls.push({ file, args, options });
    if (file === 'git') return { stdout: 'abc123\n', stderr: '' };
    return { stdout: 'live body', stderr: '' };
  };
  try {
    const result = await deriveAndRescan({
      issueNumber: 1409,
      repo: 'o/r',
      scanBody: 'stale body',
      deps: {
        deriveAndStampFunctionalDod: async ({ deps }) => {
          assert.equal(deps.pexec, pexec);
          return { status: 'ok' };
        },
        nowIso: () => '2026-08-29T00:00:00.000Z',
      },
    });
    assert.equal(result.scanBody, 'live body');
    assert.deepEqual(calls, [
      { file: 'git', args: ['rev-parse', '--short', 'HEAD'], options: { timeout: 5000 } },
      {
        file: 'gh',
        args: ['issue', 'view', '1409', '-R', 'o/r', '--json', 'body', '--jq', '.body'],
        options: { timeout: 30000 },
      },
    ]);
  } finally {
    ghClient.pexec = original;
  }
});
