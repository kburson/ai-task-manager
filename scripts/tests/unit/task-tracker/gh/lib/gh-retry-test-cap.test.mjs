// @story #531
// #531 AC1 — test-mode `gh` retry cap. With the test-mode env flag set, the
// effective retry budget collapses to 0 so a transient failure fails fast
// instead of looping/backing off (the sandbox hang trigger). With no flag set,
// production retry behaviour is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withRetry } from '../../../../../gh/lib/with-retry.mjs';

const ENV_FLAG = 'AITM_TEST_NO_GH_RETRY';

function transientThrower() {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    const err = new Error('econnreset: connection reset by peer');
    throw err;
  };
  return { fn, calls: () => calls };
}

test('with test-mode flag set, withRetry makes exactly one attempt (0 retries)', async () => {
  const prev = process.env[ENV_FLAG];
  process.env[ENV_FLAG] = '1';
  try {
    const { fn, calls } = transientThrower();
    await assert.rejects(withRetry(fn, { retries: 3, sleep: async () => {} }), /econnreset/);
    assert.equal(calls(), 1, 'fn should be called once — no retries under the flag');
  } finally {
    if (prev === undefined) delete process.env[ENV_FLAG];
    else process.env[ENV_FLAG] = prev;
  }
});

test('without the flag, withRetry honors the configured retry budget', async () => {
  const prev = process.env[ENV_FLAG];
  delete process.env[ENV_FLAG];
  try {
    const { fn, calls } = transientThrower();
    await assert.rejects(withRetry(fn, { retries: 3, sleep: async () => {} }), /econnreset/);
    assert.equal(calls(), 4, 'fn should be called 1 + 3 retries = 4 times');
  } finally {
    if (prev === undefined) delete process.env[ENV_FLAG];
    else process.env[ENV_FLAG] = prev;
  }
});
