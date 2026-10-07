// @story #1855
import { test, assert, nativeFinalFixture, mutateIssueBody } from './native-continuation-fixtures.mjs';
import { assertOriginalInvariantBodyRequest } from '../../../../task-tracker/lib/issue-body-mutate.mjs';

test('original invariant request comparison refuses copied and changed requests and expires after native write', async () => {
  const f = await nativeFinalFixture();
  const descriptors = Object.getOwnPropertyDescriptors;
  let captured = null, checked = false;
  // Instrument the actual built-in descriptor call in this isolated test only.
  // The production API exposes neither this request nor a registration setter.
  Object.getOwnPropertyDescriptors = function(value) {
    const result = descriptors(value);
    if (result.mutate?.value?.name === 'guardedMutate' && result.validateMutation?.value?.name === 'validateMutation') captured ??= value;
    return result;
  };
  try {
    const { result, error } = await f.invoke({ receiptMutation: original => mutateIssueBody({ ...original,
      mutate: body => {
        checked = true;
        assert.ok(captured);
        assert.equal(assertOriginalInvariantBodyRequest(captured), undefined);
        assert.throws(() => assertOriginalInvariantBodyRequest({ ...captured }), /native-invariant-body-request/);
        const validator = captured.validateMutation;
        captured.validateMutation = () => { throw new Error('forged validator executed'); };
        assert.throws(() => assertOriginalInvariantBodyRequest(captured), /native-invariant-body-request/);
        captured.validateMutation = validator;
        const transport = captured.deps.pexec;
        captured.deps.pexec = () => { throw new Error('forged transport executed'); };
        assert.throws(() => assertOriginalInvariantBodyRequest(captured), /native-invariant-body-request/);
        captured.deps.pexec = transport;
        assert.equal(assertOriginalInvariantBodyRequest(captured), undefined);
        return original.mutate(body);
      } }) });
    assert.equal(error, undefined);
    assert.equal(result.status, 'move-failed');
    assert.equal(checked, true);
    assert.throws(() => assertOriginalInvariantBodyRequest(captured), /native-invariant-body-request/);
    assert.equal(f.effects.filter(effect => effect === 'body-push').length, 1);
  } finally { Object.getOwnPropertyDescriptors = descriptors; f.dispose(); }
});
