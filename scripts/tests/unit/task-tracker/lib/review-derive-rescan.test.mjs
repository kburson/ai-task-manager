// @story #502 #1732
import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveAndRescan } from '../../../../task-tracker/lib/review-derive-rescan.mjs';

const HEAD = 'a'.repeat(40);
const LIVE_BODY = '## Acceptance Criteria\n- [x] Current requirement';
const STALE_BODY = '## Acceptance Criteria\n- [ ] Current requirement';
const ready = { status: 'ready', ok: true, refusals: [], humanDecision: null };

function deps(overrides = {}) {
  return {
    pexec: async (bin, args) => {
      if (bin === 'git' && args[0] === 'rev-parse') return { stdout: HEAD };
      throw new Error(`unexpected command: ${bin}`);
    },
    nowIso: () => '2026-09-21T14:00:00Z',
    refreshAndEvaluate: async () => ready,
    readBack: async () => ({ body: LIVE_BODY, head: HEAD }),
    mutateBody: async () => {
      throw new Error('no normalization is pending');
    },
    ...overrides,
  };
}

test('fresh current body, not the caller snapshot, is scanned when no normalization is pending', async () => {
  const result = await deriveAndRescan({
    issueNumber: 502,
    repo: 'owner/repo',
    scanBody: STALE_BODY,
    deps: deps(),
  });
  assert.equal(result.scanBody, LIVE_BODY);
  assert.equal(result.persisted, false);
  assert.equal(result.decision.status, 'ready');
});

test('failed current-body read refuses instead of returning the stale caller snapshot', async () => {
  await assert.rejects(
    deriveAndRescan({
      issueNumber: 502,
      repo: 'owner/repo',
      scanBody: STALE_BODY,
      deps: deps({
        readBack: async () => {
          throw new Error('network down');
        },
      }),
    }),
    { code: 'normalization-readback-failed' }
  );
});

test('missing complete evaluator cannot enter the old derive-before-readiness path', async () => {
  await assert.rejects(
    deriveAndRescan({
      issueNumber: 502,
      repo: 'owner/repo',
      deps: deps({ refreshAndEvaluate: null }),
    }),
    /complete fresh guard evaluator is required/
  );
});

test('missing execution HEAD refuses instead of stamping unknown provenance', async () => {
  await assert.rejects(
    deriveAndRescan({
      issueNumber: 502,
      repo: 'owner/repo',
      deps: deps({
        pexec: async () => {
          throw new Error('git unavailable');
        },
      }),
    }),
    { code: 'normalization-authority-drift' }
  );
});
