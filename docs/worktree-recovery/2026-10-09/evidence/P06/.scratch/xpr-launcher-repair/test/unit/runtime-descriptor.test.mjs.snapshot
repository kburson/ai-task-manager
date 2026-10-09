import test from 'node:test';
import assert from 'node:assert/strict';

import { assertRequestedReviewer, validateRuntimeDescriptor } from '../../src/startup/runtime.mjs';

const runtime = Object.freeze({
  schema: 'ai-peer-review.runtime/v1',
  classification: 'XPR',
  ownership: 'broker',
  transport_mode: 'manual',
  reviewer: {
    selector: 'claude',
    provider: 'anthropic',
    host: 'claude-code',
    model_id: 'fixture-opus',
    model_display: 'Fixture Opus',
    effort: 'high',
  },
  adapter_version: '1.0.0',
  project_root_digest: 'a'.repeat(64),
});

const reviewer = Object.freeze({
  role: 'reviewer',
  provider: 'anthropic',
  host: 'claude-code',
  model_id: 'fixture-opus',
  model_display: 'Fixture Opus',
  session_fingerprint: `sha256:${'b'.repeat(64)}`,
  identity_source: 'runtime',
  joined_at: '2026-09-14T12:00:00.000Z',
});

const observation = Object.freeze({
  provider: 'anthropic',
  host: 'claude-code',
  model_id: 'fixture-opus',
  effort: 'high',
  adapter_version: '1.0.0',
  assurance: 'runtime',
});

test('validates the closed runtime descriptor without resume handles', () => {
  assert.deepEqual(validateRuntimeDescriptor(runtime), runtime);
  assert.deepEqual(
    validateRuntimeDescriptor({ ...runtime, reviewer: { ...runtime.reviewer, effort: 'maximum' } }),
    { ...runtime, reviewer: { ...runtime.reviewer, effort: 'maximum' } }
  );
  assert.throws(() => validateRuntimeDescriptor({ ...runtime, unexpected: true }), {
    code: 'APR_USAGE',
  });
  assert.throws(
    () =>
      validateRuntimeDescriptor({
        ...runtime,
        reviewer: { ...runtime.reviewer, session_id: 'secret' },
      }),
    { code: 'APR_USAGE' }
  );
});

test('requires a joining reviewer to match the sealed provider, surface, model, effort, and adapter', () => {
  assert.equal(assertRequestedReviewer(runtime, reviewer, observation), true);
  for (const [identity, observed] of [
    [{ ...reviewer, provider: 'openai' }, observation],
    [{ ...reviewer, host: 'codex' }, observation],
    [{ ...reviewer, model_id: 'other-model' }, observation],
    [reviewer, { ...observation, effort: 'medium' }],
    [reviewer, { ...observation, adapter_version: '2.0.0' }],
  ]) {
    assert.throws(() => assertRequestedReviewer(runtime, identity, observed), {
      code: 'APR_IDENTITY_CONFLICT',
    });
  }
});

test('permits only an explicitly labeled manual declaration with exact requested values', () => {
  const declared = { ...reviewer, identity_source: 'declared' };
  assert.equal(
    assertRequestedReviewer(runtime, declared, { ...observation, assurance: 'declared' }),
    true
  );
  assert.throws(() => assertRequestedReviewer(runtime, declared, observation), {
    code: 'APR_IDENTITY_CONFLICT',
  });
});
