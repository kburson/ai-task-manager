// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, mkdirSync, writeFileSync, symlinkSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createActivatedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { readClosedBindingLedger, markClosedBinding } from '../../../../task-tracker/lib/worktree-binding-lifecycle.mjs';

test('terminal binding ledger is physically owned and unavailable control never becomes an empty ledger', async () => {
  const root = await createActivatedRuntimeRootFixture('terminal-ledger-durable-');
  const target = path.join(root, '.ai-task-manager', 'runtime', 'store', 'fleet', 'closed-bindings.json');
  try {
    assert.deepEqual(readClosedBindingLedger(root), { schema: 1, sessions: {} });
    markClosedBinding({ mainWorktreePath: root, sessionId: 'fixture-session', issue: '#1857', closedAt: '2026-10-01T00:00:00Z' });
    const original = readFileSync(target);
    const volatile = path.join(root, '.tmp', 'closed.json');
    mkdirSync(path.dirname(volatile), { recursive: true });
    writeFileSync(volatile, original);
    rmSync(target);
    symlinkSync(volatile, target);
    assert.throws(() => readClosedBindingLedger(root), { code: 'RUNTIME_OVERRIDE_UNSAFE' });
    rmSync(target);
    const control = path.join(root, '.ai-task-manager', 'runtime', 'control.json');
    const prior = readFileSync(control);
    writeFileSync(control, '{}');
    assert.throws(() => readClosedBindingLedger(root), { code: 'RUNTIME_CONTROL_INVALID' });
    writeFileSync(control, prior);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
