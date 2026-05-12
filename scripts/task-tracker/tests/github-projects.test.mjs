import assert from 'node:assert/strict';
import { splitRepo } from '../../gh/lib/github-projects.mjs';

assert.deepEqual(splitRepo('kburson/ai-task-manager'), {
  owner: 'kburson',
  repoName: 'ai-task-manager',
});

assert.throws(() => splitRepo('not-a-repo'), /invalid repo/);

console.log('github-projects.test.mjs: all passed');
