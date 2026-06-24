// @story #409
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { withRetry, isTransientGhError, TEST_NO_RETRY_ENV } from '../../../gh/lib/with-retry.mjs';

// This file asserts the real retry/backoff budget. The test runner (#531 AC1)
// exports AITM_TEST_NO_GH_RETRY=1 to every spawned child to collapse the cap to
// 0; neutralize it here so these assertions see production retry behaviour.
delete process.env[TEST_NO_RETRY_ENV];

// No real delays — capture requested sleeps instead.
function makeSleepSpy() {
  const delays = [];
  return { delays, sleep: (ms) => (delays.push(ms), Promise.resolve()) };
}

const transient = () => Object.assign(new Error('gh push failed (1): ETIMEDOUT'), {});

test('retries a transient failure then succeeds', async () => {
  const { delays, sleep } = makeSleepSpy();
  let calls = 0;
  const result = await withRetry(
    () => {
      calls += 1;
      if (calls < 3) throw transient();
      return 'ok';
    },
    { retries: 3, baseDelayMs: 10, sleep }
  );
  assert.equal(result, 'ok');
  assert.equal(calls, 3, 'called until success');
  assert.deepEqual(delays, [10, 20], 'exponential backoff between the two retries');
});

test('rethrows the last error after exhausting retries', async () => {
  const { delays, sleep } = makeSleepSpy();
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(
        () => {
          calls += 1;
          throw transient();
        },
        { retries: 2, baseDelayMs: 10, sleep }
      ),
    /ETIMEDOUT/
  );
  assert.equal(calls, 3, 'first try + 2 retries');
  assert.equal(delays.length, 2, 'slept once per retry, not after the final throw');
});

test('does not retry a non-transient error', async () => {
  const { delays, sleep } = makeSleepSpy();
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(
        () => {
          calls += 1;
          throw new Error('HTTP 404: Not Found');
        },
        { retries: 5, baseDelayMs: 10, sleep }
      ),
    /404/
  );
  assert.equal(calls, 1, 'classifier rejected → single attempt');
  assert.equal(delays.length, 0, 'no backoff for a non-retryable error');
});

test('respects the maxDelayMs ceiling', async () => {
  const { delays, sleep } = makeSleepSpy();
  let calls = 0;
  await withRetry(
    () => {
      calls += 1;
      if (calls < 5) throw transient();
      return 'ok';
    },
    { retries: 10, baseDelayMs: 100, maxDelayMs: 250, sleep }
  );
  // 100, 200, 250(capped from 400), 250(capped from 800)
  assert.deepEqual(delays, [100, 200, 250, 250]);
});

test('isTransientGhError classifies network/5xx/rate-limit, not auth/404', () => {
  assert.ok(isTransientGhError(new Error('ECONNRESET')));
  assert.ok(
    isTransientGhError(Object.assign(new Error('x'), { stderr: 'HTTP 503 Service Unavailable' }))
  );
  assert.ok(isTransientGhError(new Error('You have exceeded a secondary rate limit')));
  assert.ok(isTransientGhError(new Error('gh: connection reset by peer')));
  assert.equal(isTransientGhError(new Error('HTTP 404: Not Found')), false);
  assert.equal(isTransientGhError(new Error('gh auth login required')), false);
  assert.equal(isTransientGhError(null), false);
});
