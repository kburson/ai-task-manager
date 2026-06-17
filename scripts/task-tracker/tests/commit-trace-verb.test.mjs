#!/usr/bin/env node
// @story #109
import { strict as assert } from 'node:assert';
import { runCommitTrace } from '../verbs/commit-trace.mjs';

{
  const calls = [];
  const r = await runCommitTrace({
    issueNumber: '109',
    cfg: { repo: 'o/r' },
    projectDir: '/repo',
    deps: {
      gitInfo: async (cwd) => {
        calls.push(['gitInfo', cwd]);
        return { sha: 'abcdef1234567890', subject: 's', author: 'a', ts: 't' };
      },
      postCommitTrail: async (args) => {
        calls.push(['postCommitTrail', args.issueNumber, args.repo, args.info.sha]);
        return { action: 'created' };
      },
    },
  });
  assert.equal(r.action, 'created');
  assert.deepEqual(calls, [
    ['gitInfo', '/repo'],
    ['postCommitTrail', '109', 'o/r', 'abcdef1234567890'],
  ]);
}

console.log('commit-trace-verb.test.mjs: all passed');
