// @story #365
// #365 — close.mjs's `tickLifecycleOnClose` ticks the two lifecycle DoD
// checkboxes the close verb owns ("Story closed and moved to Done" /
// `story-closed`, and "Timing data flushed to issue" / `timing-flushed`).
// Since #362 every mutateIssueBody write runs the checkbox-proof gate
// (`findCheckboxesTickedWithoutProof`), which refuses a transition to `- [x]`
// that lacks an adjacent proof marker. These ticks are verb-driven — the close
// action is the verifier — so the call must pass `allowUnverifiedTicks: true`
// to bypass the gate, scoped to this single call site. This regression asserts:
//   1. the call passes allowUnverifiedTicks:true;
//   2. both lifecycle boxes land as `- [x]`;
//   3. no `lifecycle-tick best-effort failed` warning is emitted on stderr;
//   4. the bypass is load-bearing — the same tick WITHOUT the flag is exactly
//      what the real #362 gate refuses (guards against an over-broad bypass).

import assert from 'node:assert/strict';
import { tickLifecycleOnClose } from '../../../verbs/close.mjs';
import { findCheckboxesTickedWithoutProof } from '../../../lib/body-invariants.mjs';

const cfg = { repo: 'kburson/ai-task-manager' };

const FIXTURE = [
  '## Acceptance Criteria',
  '- [x] x <!-- aitm-verified cmd="`npm run test:all`" -->',
  '',
  '#### Lifecycle (auto-ticked at Review/Close)',
  '- [ ] Passed final human review',
  '- [ ] Story closed and moved to Done',
  '- [ ] Timing data flushed to issue',
  '',
].join('\n');

// --- 1-3: tickLifecycleOnClose passes the flag and both boxes tick, no warn ---
{
  let liveBody = FIXTURE;
  let capturedOpts = null;
  const stderrCaptured = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => {
    stderrCaptured.push(String(chunk));
    return true;
  };
  try {
    await tickLifecycleOnClose({
      cfg,
      issueNum: 365,
      pexec: async () => ({ stdout: '', stderr: '' }),
      deps: {
        mutateIssueBody: async (opts) => {
          capturedOpts = opts;
          liveBody = opts.mutate(liveBody);
          return { status: 'ok' };
        },
      },
    });
  } finally {
    process.stderr.write = origWrite;
  }

  assert.ok(capturedOpts, 'mutateIssueBody must be called');
  assert.equal(
    capturedOpts.allowUnverifiedTicks,
    true,
    'close must pass allowUnverifiedTicks:true so the #362 checkbox-proof gate does not refuse the verb-driven lifecycle tick'
  );
  assert.match(
    liveBody,
    /- \[x\] Story closed and moved to Done/,
    'story-closed lifecycle box must land ticked'
  );
  assert.match(
    liveBody,
    /- \[x\] Timing data flushed to issue/,
    'timing-flushed lifecycle box must land ticked'
  );
  assert.equal(
    stderrCaptured.some((s) => s.includes('lifecycle-tick best-effort failed')),
    false,
    'no best-effort failure warning may be emitted on a healthy close'
  );
}

// --- 4: the bypass is load-bearing — the real #362 gate refuses the same tick
//        WITHOUT the flag, proving the flag is what makes the tick legal. ---
{
  let after = null;
  await tickLifecycleOnClose({
    cfg,
    issueNum: 365,
    pexec: async () => ({ stdout: '', stderr: '' }),
    deps: {
      mutateIssueBody: async (opts) => {
        after = opts.mutate(FIXTURE);
        return { status: 'ok' };
      },
    },
  });
  const offenders = findCheckboxesTickedWithoutProof(FIXTURE, after);
  assert.ok(
    offenders.length >= 2,
    'the real #362 gate must flag both newly-ticked lifecycle boxes when proof markers are absent — confirming allowUnverifiedTicks:true is load-bearing, not cosmetic'
  );
}

console.log('close-lifecycle-tick.test.mjs: all passed');
