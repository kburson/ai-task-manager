// @story #1855
import { assert, createRevisionMemory, fixture, path, test, withRevisionConsumer } from './native-continuation-fixtures.mjs';
import * as policy from '../../../../task-tracker/lib/criteria-revision/policy.mjs';

test('stage scope comparison retains actual activity and original references without granting body authority', async () => {
  const original = await fixture('baseline', { worktree: process.cwd() });
  const { backend, context } = original;
  const scope = { repository: context.repository, issue: context.issue, projectDir: context.executor.worktree };
  assert.equal(typeof policy.assertNativeRevisionStageScope, 'function');
  assert.throws(() => policy.assertNativeRevisionStageScope({ ...scope, backend, capability: {} }),
    error => error.code === 'revision-authority-unavailable');
  await withRevisionConsumer({ ...scope, activity: 'stage-write', backend }, async capability => {
    const input = { ...scope, backend, capability };
    const before = backend.snapshot;
    assert.equal(policy.assertNativeRevisionStageScope(input), undefined);
    assert.equal(policy.readNativeRevisionStageBody(scope), backend.observation.body.bytes);
    const bytes = backend.observation.body.bytes;
    const calls = [];
    const unowned = { get mutate() { calls.push('native input getter'); return () => bytes; } };
    for (const input of [{}, unowned, null, true]) {
      assert.throws(() => policy.assertRevisionBodyMutation(bytes, bytes, input),
        error => error.code === 'revision-authority-unavailable');
    }
    assert.deepEqual(calls, []);
    // Loading code in a genuine held frame conveys no original invocation.
    const originalMembershipRefusal = error => error.code === 'revision-authority-unavailable' &&
      error.preparationReason === 'original-body-wrapper';
    await assert.rejects(policy.assertNativeStageBodyMutation({}, bytes, bytes), originalMembershipRefusal);
    const coherentButUnowned = { repository: scope.repository, issue: scope.issue, projectDir: scope.projectDir };
    for (const input of [
      coherentButUnowned, { ...coherentButUnowned }, unowned,
      { ...coherentButUnowned, issue: scope.issue + 1 },
      { ...coherentButUnowned, ready: true },
      Object.assign(Object.create(coherentButUnowned), {}),
    ]) assert.throws(() => policy.assertRevisionBodyMutation(bytes, bytes, input), originalMembershipRefusal);
    assert.deepEqual(calls, []);
    assert.deepEqual(backend.snapshot, before);
    for (const changed of [
      { ...input, capability: {} }, { ...input, backend: createRevisionMemory(backend.snapshot) },
      { ...input, issue: context.issue + 1 }, { ...input, repository: 'foreign/repository' },
      { ...input, projectDir: path.join(context.executor.worktree, 'foreign') }, { ...input, ready: true },
      Object.assign(Object.create({ ready: true }), input),
    ]) assert.throws(() => policy.assertNativeRevisionStageScope(changed),
      error => error.code === 'revision-authority-unavailable');
    const accessor = { ...input };
    Object.defineProperty(accessor, 'backend', { enumerable: true, get() { calls.push('getter'); return backend; } });
    assert.throws(() => policy.assertNativeRevisionStageScope(accessor),
      error => error.code === 'revision-authority-unavailable');
    assert.deepEqual(calls, []);
    assert.deepEqual(backend.snapshot, before);
    // Scope comparison is not body authority, even for coherent fixture state.
    const changed = backend.observation; changed.body.bytes += '\nUnrelated current body change.\n';
    backend.replaceAuthority(changed);
    assert.equal(policy.assertNativeRevisionStageScope(input), undefined);
    assert.throws(() => policy.readNativeRevisionStageBody(scope),
      error => error.code === 'revision-authority-unavailable');
    backend.replaceAuthority(before.observation);
  });
  await withRevisionConsumer({ ...scope, activity: 'body-write', backend }, capability => {
    assert.throws(() => policy.assertNativeRevisionStageScope({ ...scope, backend, capability }),
      error => error.code === 'revision-authority-unavailable');
  });
});
