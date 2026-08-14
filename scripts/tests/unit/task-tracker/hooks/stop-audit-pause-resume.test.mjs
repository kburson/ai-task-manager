#!/usr/bin/env node
// @story #241
import { strict as assert } from 'node:assert';
import {
  auditPauseResume,
  formatWarning,
  runStopAudit,
} from '../../../../task-tracker/hooks/stop-audit-pause-resume.mjs';

const HEADER =
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |\n' +
  '|---|---|---|---|---|---|---|';

// Build a timing-table row whose Description cell tags the given session id,
// mirroring the `sess: <sid> reason: ...` marker that on-ask.mjs emits.
function row(event, sid, reason = 'ask') {
  return `| 2026-06-14 12:00:00 -05:00 | ${event} | 0s | 0s | 0 |  | <!-- sess: ${sid} reason: ${reason} --> |`;
}

function bodyOf(...rows) {
  return [HEADER, ...rows].join('\n') + '\n';
}

// Test 1 (AC7): 3 pause / 2 resume for the bound session → 1-row imbalance.
{
  const sid = 's-241';
  const body = bodyOf(
    row('pause', sid),
    row('resume', sid),
    row('pause', sid),
    row('resume', sid),
    row('pause', sid)
  );
  const audit = auditPauseResume(body, sid);
  assert.equal(audit.pauseCount, 3);
  assert.equal(audit.resumeCount, 2);
  assert.equal(audit.delta, 1);
  assert.equal(audit.balanced, false);

  const warn = formatWarning(241, audit);
  assert.match(warn, /#241/);
  assert.match(warn, /3 pause \/ 2 resume/);
  assert.match(warn, /1 unresumed pause\b/);
}

// Test 2 (AC4): balanced non-zero → no imbalance.
{
  const sid = 's-bal';
  const body = bodyOf(row('pause', sid), row('resume', sid));
  const audit = auditPauseResume(body, sid);
  assert.equal(audit.balanced, true);
  assert.equal(audit.delta, 0);
}

// Test 3 (AC4): trivial 0/0 (empty body, empty string) → balanced.
{
  assert.equal(auditPauseResume('', 's').balanced, true);
  assert.equal(auditPauseResume(bodyOf(), 's-empty').balanced, true);
  assert.equal(auditPauseResume(null, 's').balanced, true);
}

// Test 4: session-slice isolation — rows from a foreign session are excluded.
{
  const sid = 's-mine';
  const body = bodyOf(
    row('pause', sid),
    row('resume', sid),
    row('pause', 's-other'), // foreign — must not count
    row('pause', 's-other')
  );
  const audit = auditPauseResume(body, sid);
  assert.equal(audit.pauseCount, 1);
  assert.equal(audit.resumeCount, 1);
  assert.equal(audit.balanced, true);
}

// Test 5: stray resume → negative delta, "unpaired resume".
{
  const sid = 's-neg';
  const body = bodyOf(row('pause', sid), row('resume', sid), row('resume', sid));
  const audit = auditPauseResume(body, sid);
  assert.equal(audit.delta, -1);
  assert.match(formatWarning(7, audit), /1 unpaired resume\b/);
}

// Test 6 (AC5): no session id → no-op, no warning.
{
  const r = await runStopAudit({ env: {}, deps: { warn: () => assert.fail('warned') } });
  assert.equal(r.status, 'no-session');
}

// Test 7 (AC5): session bound but no active task → no-op, no warning.
{
  const r = await runStopAudit({
    env: { CLAUDE_SESSION_ID: 's7' },
    deps: {
      getActiveTask: () => null,
      warn: () => assert.fail('warned'),
    },
  });
  assert.equal(r.status, 'no-active');
}

// Test 8 (AC2/AC3): end-to-end imbalance through runStopAudit emits exactly
// one warning naming the bound issue and the 1-row delta.
{
  const sid = 's8';
  const body = bodyOf(row('pause', sid), row('resume', sid), row('pause', sid));
  const warnings = [];
  const r = await runStopAudit({
    env: { CLAUDE_SESSION_ID: sid },
    deps: {
      getActiveTask: () => ({ issue: '99' }),
      loadConfig: () => ({ repo: 'o/r' }),
      readTimingCommentBody: async () => body,
      warn: (m) => warnings.push(m),
    },
  });
  assert.equal(r.status, 'warned');
  assert.equal(r.issue, '99');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /#99/);
  assert.match(warnings[0], /1 unresumed pause\b/);
}

// Test 9 (AC4): end-to-end balanced → no warning emitted.
{
  const sid = 's9';
  const body = bodyOf(row('pause', sid), row('resume', sid));
  const warnings = [];
  const r = await runStopAudit({
    env: { CLAUDE_SESSION_ID: sid },
    deps: {
      getActiveTask: () => ({ issue: '100' }),
      loadConfig: () => ({ repo: 'o/r' }),
      readTimingCommentBody: async () => body,
      warn: (m) => warnings.push(m),
    },
  });
  assert.equal(r.status, 'balanced');
  assert.equal(warnings.length, 0);
}

// Test 10: Codex hook payload `session_id` fallback is audited.
{
  const sid = 's-codex-audit';
  const body = bodyOf(row('pause', sid), row('resume', sid), row('pause', sid));
  const warnings = [];
  const r = await runStopAudit({
    env: {},
    hookInput: JSON.stringify({ session_id: sid, hook_event_name: 'Stop' }),
    deps: {
      getActiveTask: () => ({ issue: '101' }),
      loadConfig: () => ({ repo: 'o/r' }),
      readTimingCommentBody: async () => body,
      warn: (m) => warnings.push(m),
    },
  });
  assert.equal(r.status, 'warned');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /#101/);
}

// Test 11 (#983 AC1): the orphan-recovery departure/return pair posted by
// hook-handler.mjs's buildOrphanRecoveryRowSpecs must not register as a false
// imbalance — `pause:orphan-recovery`/`resumed` don't match the strict
// `pause`/`paused`/`resume` equality checks, same as the pre-existing
// `session-end-recovery` row.
{
  const sid = 's-orphan';
  const body = bodyOf(row('pause:orphan-recovery', sid), row('resumed', sid));
  const audit = auditPauseResume(body, sid);
  assert.equal(audit.pauseCount, 0);
  assert.equal(audit.resumeCount, 0);
  assert.equal(audit.delta, 0);
  assert.equal(audit.balanced, true);
}

console.log('stop-audit-pause-resume.test.mjs: all assertions passed');
