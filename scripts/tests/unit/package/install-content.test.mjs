// @story #1692
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyManagedHookContract,
  matchesManagedHookContract,
  renderClaudeCommandStub,
  renderProviderSkillStub,
} from '../../../package/install-content.mjs';

test('provider content is selected by declarative contract key', () => {
  assert.match(renderProviderSkillStub('claude'), /skill\/adapters\/claude\/SKILL\.md/);
  assert.match(renderProviderSkillStub('codex'), /skill\/adapters\/codex\/SKILL\.md/);
  assert.match(renderProviderSkillStub('grok'), /skill\/adapters\/grok\/SKILL\.md/);
  assert.match(renderClaudeCommandStub(), /Ready for Planning/);
});

test('managed hook comparison ignores unrelated user keys', () => {
  const installed = applyManagedHookContract(
    'codex',
    { userSetting: true },
    { memoryIndexHook: false }
  );
  installed.userSetting = 'preserved';

  assert.equal(matchesManagedHookContract('codex', installed, { memoryIndexHook: false }), true);
  assert.equal(installed.userSetting, 'preserved');
  assert.ok(installed.hooks.SessionStart.length > 0);
});

test('managed hook application is idempotent and memory opt-in changes only managed hooks', () => {
  const once = applyManagedHookContract('grok', { custom: { retained: true } });
  const twice = applyManagedHookContract('grok', once);
  assert.deepEqual(twice, once);

  const withMemory = applyManagedHookContract('grok', once, { memoryIndexHook: true });
  assert.deepEqual(withMemory.custom, { retained: true });
  assert.equal(matchesManagedHookContract('grok', withMemory, { memoryIndexHook: true }), true);
});
