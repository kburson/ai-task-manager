// @story #1855
// Passive actual receipt HEAD reads: no execution or stage authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';
import * as native from '../../../../task-tracker/lib/develop-exit-receipt-guard.mjs';
const invocation = {
  guard: native.developExitReceiptGuard,
  run: native.developExitReceiptGuard.run,
  id: native.GUARD_ID,
};
function context(s) {
  return {
    issueNumber: 124,
    toState: 'test',
    body: '## Verification Commands\n',
    projectDir: s.context.sourceRoot,
  };
}

test('receipt capture retains the actual native HEAD read on exact returned refusal', async () => {
  const s = createSandbox();
  try {
    const ctx = context(s),
      result = await native.developExitReceiptGuard.run(ctx);
    assert.equal(result.ok, false);
    assert.match(result.reason, /receipt-missing/);
    const captured = native.readDevelopReceiptReadData(result, invocation);
    assert.equal(captured.projectDir, s.context.sourceRoot);
    assert.equal(captured.head.cwd, s.context.sourceRoot);
    assert.equal(
      captured.head.stdout,
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: s.context.sourceRoot, encoding: 'utf8' })
    );
    assert.equal(captured.head.exitCode, 0);
    assert.equal(captured.head.stderr, '');
    assert.ok(Object.isFrozen(captured) && Object.isFrozen(captured.head));
    assert.equal(native.readDevelopReceiptReadData({ ...result }, invocation), null);
    assert.equal(native.readDevelopReceiptReadData(result), null);
    assert.equal(
      native.readDevelopReceiptReadData(result, { ...invocation, guard: { ...invocation.guard } }),
      null
    );
  } finally {
    s.dispose();
  }
});

test('receipt capture retains actual swallowed Git failure as unavailable data', async () => {
  const s = createSandbox();
  try {
    const ctx = { ...context(s), projectDir: path.join(s.context.root, 'home') };
    const result = await native.developExitReceiptGuard.run(ctx);
    assert.equal(result.ok, false);
    const captured = native.readDevelopReceiptReadData(result, invocation);
    assert.notEqual(captured.head.exitCode, 0);
    assert.equal(captured.head.cwd, ctx.projectDir);
    assert.match(captured.head.stderr, /not a git repository/);
  } finally {
    s.dispose();
  }
});

for (const kind of ['head', 'reader', 'bypass', 'proxy'])
  test(`receipt capture unavailable for ${kind} input without changing ordinary guard semantics`, async () => {
    const s = createSandbox();
    try {
      const ctx = context(s);
      if (kind === 'head') ctx.headSha = 'a'.repeat(40);
      if (kind === 'reader')
        ctx.deps = {
          readDevelopReceipt: async () => ({
            ok: true,
            stage: 'develop-final',
            commitSha: execFileSync('git', ['rev-parse', 'HEAD'], {
              cwd: s.context.sourceRoot,
              encoding: 'utf8',
            }).trim(),
          }),
        };
      if (kind === 'bypass') ctx.toState = 'review';
      if (kind === 'proxy')
        ctx.deps = new Proxy(
          {},
          {
            ownKeys() {
              throw new Error('optional introspection unavailable');
            },
          }
        );
      const result = await native.developExitReceiptGuard.run(ctx);
      assert.equal(result.ok, kind === 'reader' || kind === 'bypass');
      assert.equal(native.readDevelopReceiptReadData(result, invocation), null);
    } finally {
      s.dispose();
    }
  });

test('receipt native registry bridge compares original invocation and keeps result data detached', async () => {
  const s = createSandbox();
  try {
    const registry =
      await import('../../../../task-tracker/lib/guard-registry.mjs?receipt-capture');
    registry.registerGuard('develop', 'exit', native.developExitReceiptGuard);
    const result = await registry.runGuards('develop', 'test', context(s));
    const data = await registry.readNativeGuardReadData(result);
    assert.equal(data.length, 1);
    assert.equal(data[0].invocation.guardId, native.GUARD_ID);
    assert.equal(data[0].data.head.exitCode, 0);
    assert.equal(await registry.readNativeGuardReadData({ ...result }), null);
    registry.GUARDS.develop.exit.length = 0;
    registry.registerGuard('develop', 'exit', { ...native.developExitReceiptGuard });
    assert.equal(
      await registry.readNativeGuardReadData(
        await registry.runGuards('develop', 'test', context(s))
      ),
      null
    );
  } finally {
    s.dispose();
  }
});

test('optional receipt capture never invokes a changing deps getter before the original HEAD read', async () => {
  const s = createSandbox();
  try {
    const ctx = context(s),
      order = [];
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: s.context.sourceRoot,
      encoding: 'utf8',
    }).trim();
    Object.defineProperty(ctx, 'projectDir', {
      get() {
        order.push('projectDir');
        return s.context.sourceRoot;
      },
    });
    let calls = 0;
    Object.defineProperty(ctx, 'deps', {
      get() {
        order.push('deps');
        calls++;
        return calls === 1
          ? {}
          : {
              readDevelopReceipt: async () => ({
                ok: true,
                stage: 'develop-final',
                commitSha: sha,
              }),
            };
      },
    });
    const result = await native.developExitReceiptGuard.run(ctx);
    assert.equal(result.ok, false, 'ordinary single getter access selects the native reader');
    assert.equal(calls, 1);
    assert.deepEqual(order, ['projectDir', 'projectDir', 'deps']);
    assert.equal(native.readDevelopReceiptReadData(result, invocation), null);
  } finally {
    s.dispose();
  }
});
