#!/usr/bin/env node
// @story #672
// #672 — tickLifecycleOnClose previously had zero retry on transient
// network-class failures from mutateIssueBody's fetchBody/pushBody calls,
// and swallowed the final failure to stderr only, invisible in the close
// verb's terminal summary. This asserts:
//   1. a transient failure (unnamed Error) is retried and a later success
//      is NOT reported as a failure;
//   2. a named content-integrity guard error (e.g. MarkerLossError) is NOT
//      retried — it fails fast on the first attempt;
//   3. exhausting all retries returns { ok: false, message } so the caller
//      can fold a warning into its own summary instead of stderr-only.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { tickLifecycleOnClose } from '../../../../task-tracker/verbs/close.mjs';

const cfg = { repo: 'kburson/ai-task-manager' };

function silenceStderr(fn) {
  const orig = process.stderr.write.bind(process.stderr);
  const captured = [];
  process.stderr.write = (chunk) => {
    captured.push(String(chunk));
    return true;
  };
  return fn(captured).finally(() => {
    process.stderr.write = orig;
  });
}

test('#672 — transient failure is retried and a later success reports ok:true', async () => {
  let calls = 0;
  await silenceStderr(async (captured) => {
    const result = await tickLifecycleOnClose({
      cfg,
      issueNum: 672,
      pexec: async () => ({ stdout: '', stderr: '' }),
      deps: {
        sleep: async () => {},
        mutateIssueBody: async () => {
          calls++;
          if (calls < 3) throw new Error('net/http: TLS handshake timeout');
          return { status: 'ok' };
        },
      },
    });
    assert.equal(calls, 3, 'must retry through the transient failures');
    assert.equal(result.ok, true, 'eventual success must report ok:true');
    assert.equal(
      captured.some((s) => s.includes('lifecycle-tick best-effort failed')),
      false,
      'no failure warning once a retry succeeds'
    );
  });
});

test('#672 — named guard error is not retried', async () => {
  let calls = 0;
  await silenceStderr(async (captured) => {
    const result = await tickLifecycleOnClose({
      cfg,
      issueNum: 672,
      pexec: async () => ({ stdout: '', stderr: '' }),
      deps: {
        sleep: async () => {},
        mutateIssueBody: async () => {
          calls++;
          const err = new Error('mutate dropped invariant marker(s): aitm-fields');
          err.name = 'MarkerLossError';
          throw err;
        },
      },
    });
    assert.equal(calls, 1, 'a deliberate content-integrity refusal must not be retried');
    assert.equal(result.ok, false);
    assert.ok(captured.some((s) => s.includes('lifecycle-tick best-effort failed')));
  });
});

test('#672 — exhausting all retries returns ok:false with a message', async () => {
  let calls = 0;
  await silenceStderr(async () => {
    const result = await tickLifecycleOnClose({
      cfg,
      issueNum: 672,
      pexec: async () => ({ stdout: '', stderr: '' }),
      deps: {
        sleep: async () => {},
        mutateIssueBody: async () => {
          calls++;
          throw new Error('net/http: TLS handshake timeout');
        },
      },
    });
    assert.ok(calls > 1, 'must have attempted more than once');
    assert.equal(result.ok, false);
    assert.match(result.message, /TLS handshake timeout/);
  });
});

console.log('close-lifecycle-tick-retry.test.mjs: all passed');
