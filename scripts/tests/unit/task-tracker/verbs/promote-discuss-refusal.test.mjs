// @story #473
// End-to-end proof that the #405 `{discuss}` directive is full-auto-proof on
// the promote path. Drives the real `runPromote` verb core (not the guard in
// isolation) with injected deps so the whole chain runs hermetically:
//   fetchIssueBody → runGuards(backlog→refine) → discussBlockGuard refusal →
//   REFUSAL_ID_TO_STATUS → refusalsToVerbResult → { status: 'discuss-refused' }.
//
// The decisive assertion: TT_FULL_AUTO=1 is set for the refusal case. Full-auto
// suppresses human *approval* gates, but `runGuards` is never exempted, so the
// directive still blocks. Once the token is stripped (markDiscussed, the same
// resolution `/task check "discussion complete"` performs), the same call
// promotes cleanly.

import { test } from 'node:test';
import '../../../fixtures/offline-gh-auto.mjs';
import assert from 'node:assert/strict';

import { runPromote } from '../../../../task-tracker/verbs/promote.mjs';
import { writeLastKnownState } from '../../../../task-tracker/gh-timing-comment.mjs';
import { markDiscussed } from '../../../../task-tracker/lib/discuss-marker.mjs';
import '../../../../task-tracker/lib/state-bootstrap.mjs';

const TOKEN = '{' + 'discuss' + '}'; // avoid a literal bare token in source
const cfg = { repo: 'owner/name' };

// backlog body carrying a bare directive; recorded state = backlog so the
// transition under test is backlog → refine (smallest exit-guard surface:
// blockedByGuard passes with no aitm-blocked-by marker, leaving only the
// discuss guard in play).
const blockedBody = writeLastKnownState(`## Scope\n\nNeed direction here\n\n${TOKEN}\n`, 'backlog');

function baseDeps() {
  return {
    projectDir: process.cwd(),
    assertBound: () => {},
    getLiveState: async () => 'backlog', // matches recorded → no drift
    runMoveState: async () => 0, // success on the happy path
    spawnVerb: async () => 0,
    postTimingRow: async () => {},
    mutateIssueBody: async ({ mutate }) => {
      // recorded state is present, so the bootstrap branch never fires; this is
      // only a defensive stub.
      mutate('');
      return { status: 'no-op' };
    },
    stampStartTime: async () => {},
  };
}

test('runPromote: TT_FULL_AUTO=1 cannot bypass an unresolved {discuss} directive', async () => {
  const prev = process.env.TT_FULL_AUTO;
  process.env.TT_FULL_AUTO = '1';
  try {
    const res = await runPromote({
      issueNumber: 100,
      cfg,
      deps: { ...baseDeps(), fetchIssueBody: async () => ({ body: blockedBody }) },
    });
    assert.equal(res.status, 'discuss-refused', 'full-auto must NOT bypass the directive');
    assert.ok(Array.isArray(res.blockers) && res.blockers.length >= 1);
    assert.match(res.message, /discuss/i);
    // the surfaced context line points the human at the directive
    assert.ok(
      res.blockers.some((b) => /\{discuss\}/.test(b)),
      'refusal should surface the directive token line'
    );
  } finally {
    if (prev === undefined) delete process.env.TT_FULL_AUTO;
    else process.env.TT_FULL_AUTO = prev;
  }
});

test('runPromote: promotes once the discussion is resolved (token stripped)', async () => {
  const resolvedBody = markDiscussed(blockedBody, { ts: '2026-06-20T00:00:00Z' });
  const res = await runPromote({
    issueNumber: 100,
    cfg,
    deps: { ...baseDeps(), fetchIssueBody: async () => ({ body: resolvedBody }) },
  });
  assert.equal(res.status, 'promoted');
  assert.equal(res.from, 'backlog');
  assert.equal(res.to, 'refine');
});
