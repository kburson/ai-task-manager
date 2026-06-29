// @story #160
// Approve verb posts a `### 📝 Review Notes` comment with the right source
// tag in each mode.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runApprove } from '../../verbs/approve.mjs';

function makeDeps({ tty, env = {}, drivers = [], comments = [], fields = {} } = {}) {
  const posted = [];
  const written = [];
  let body =
    '## Definition of Done\n\n#### Lifecycle (auto-ticked at Review/Close)\n- [ ] Passed final human review\n- [ ] Story closed and moved to Done\n- [ ] Timing data flushed to issue\n';
  return {
    posted,
    written,
    assertBound: () => {},
    fetchIssueBody: async () => body,
    // #295 — verb writes through `mutateIssueBody({mutate})`; closure runs on FRESH base.
    mutateIssueBody: async ({ mutate }) => {
      const before = body;
      const next = mutate(before);
      if (next !== before) {
        body = next;
        written.push(next);
      }
      // #655 — surface the verified live body so approve's read-back assertion
      // sees the stamped aitm-review-approved marker.
      return { status: next !== before ? 'ok' : 'no-op', body };
    },
    getBoardState: async () => 'review',
    nowIso: () => '2026-05-17T00:00:00Z',
    detectFullAuto: () => {
      if (env.TT_FULL_AUTO === '1') return { fired: true, signals: 'env=1,tty=0,ci=0' };
      if (tty === false) return { fired: true, signals: 'env=0,tty=0,ci=0' };
      return { fired: false, signals: '' };
    },
    postComment: async ({ body }) => {
      posted.push(body);
    },
    fetchComments: async () => comments,
    fetchProjectValues: async () => fields,
    promptDrivers: async () => drivers,
    deriveDrivers: () => ['auto driver A', 'auto driver B'],
  };
}

test('runApprove in human mode posts notes with human source from stdin drivers', async () => {
  const deps = makeDeps({ tty: true, drivers: ['rationale one', 'rationale two'] });
  const result = await runApprove({
    issueNumber: 999,
    cfg: { repo: 'o/r' },
    projectDir: '.',
    deps,
  });
  assert.equal(result.status, 'approved');
  assert.equal(result.notesSource, 'human');
  assert.equal(deps.posted.length, 1);
  assert.match(deps.posted[0], /### 📝 Review Notes/);
  assert.match(deps.posted[0], /- rationale one/);
  assert.match(deps.posted[0], /- rationale two/);
  assert.match(deps.posted[0], /aitm-review-notes-source: human/);
});

test('runApprove in full-auto mode posts notes with auto source and derived drivers', async () => {
  const deps = makeDeps({ tty: false, env: { TT_FULL_AUTO: '1' } });
  const result = await runApprove({
    issueNumber: 999,
    cfg: { repo: 'o/r' },
    projectDir: '.',
    deps,
  });
  assert.equal(result.status, 'approved');
  assert.equal(result.fullAuto, true);
  assert.equal(result.notesSource, 'auto');
  assert.equal(deps.posted.length, 1);
  assert.match(deps.posted[0], /aitm-review-notes-source: auto/);
  assert.match(deps.posted[0], /- auto driver A/);
});

test('runApprove in human mode skips notes comment when no drivers entered', async () => {
  const deps = makeDeps({ tty: true, drivers: [] });
  const result = await runApprove({
    issueNumber: 999,
    cfg: { repo: 'o/r' },
    projectDir: '.',
    deps,
  });
  assert.equal(result.status, 'approved');
  assert.equal(deps.posted.length, 0);
});

test('runApprove still ticks lifecycle even if notes-post fails', async () => {
  const deps = makeDeps({ tty: false, env: { TT_FULL_AUTO: '1' } });
  deps.postComment = async () => {
    throw new Error('network down');
  };
  const result = await runApprove({
    issueNumber: 999,
    cfg: { repo: 'o/r' },
    projectDir: '.',
    deps,
  });
  assert.equal(result.status, 'approved');
  assert.equal(deps.written.length, 1);
  assert.match(deps.written[0], /- \[x\] Passed final human review/);
});
