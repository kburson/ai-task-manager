// @story #495
// Unit tests for the #495 shared discuss-banner formatters and the
// `finalizeDiscussion` end-banner emission contract. Kept in their own file so
// discuss-marker.test.mjs stays under the 400-line cap.
//
// The formatters are the single source of truth for the 💬 start / ✅ end banner
// text, shared by switch.mjs (bind) and BOTH conclusion paths
// (finalizeDiscussion + check.mjs's "discussion complete" branch). The emission
// test injects `deps.log` + a fake body store so we assert the banner fires
// exactly once after a successful write and never on a write failure, without
// touching global stdout.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  finalizeDiscussion,
  formatDiscussStartBanner,
  formatDiscussEndBanner,
  DISCUSS_START_ICON,
  DISCUSS_END_ICON,
} from '../../../lib/discuss-marker.mjs';

test('formatDiscussStartBanner: 💬-led, interpolates the ref', () => {
  const out = formatDiscussStartBanner('#495');
  assert.ok(out.includes(DISCUSS_START_ICON), 'carries the start icon');
  assert.equal(DISCUSS_START_ICON, '💬', 'start icon is 💬');
  assert.ok(out.includes('DISCUSSION REQUESTED — #495'), 'new wording + ref');
  assert.ok(!out.includes('DISCUSS REQUESTED'), 'old plain wording gone');
});

test('formatDiscussEndBanner: ✅-led, interpolates the ref', () => {
  const out = formatDiscussEndBanner('#495');
  assert.ok(out.includes(DISCUSS_END_ICON), 'carries the end icon');
  assert.equal(DISCUSS_END_ICON, '✅', 'end icon is ✅');
  assert.ok(
    out.includes('DISCUSSION RESOLVED — #495 · implementation may commence'),
    'resolution wording + ref'
  );
});

test('finalizeDiscussion: emits the ✅ end banner exactly once after a successful write', () => {
  return (async () => {
    const base = ['## Scope', '', 'sparse', '', '{discuss}'].join('\n');
    let current = base;
    const logs = [];
    const deps = {
      fetchBody: async () => current,
      pushBody: async (_repo, _n, body) => {
        current = body;
      },
      log: (m) => logs.push(m),
    };
    const res = await finalizeDiscussion({
      issueNumber: 495,
      repo: 'o/r',
      scope: 'Fleshed scope.',
      ts: '2026-06-22T00:00:00Z',
      deps,
    });
    assert.equal(res.status, 'ok', 'write succeeded');
    const banners = logs.filter((m) => String(m).includes('DISCUSSION RESOLVED'));
    assert.equal(banners.length, 1, 'end banner emitted exactly once');
    assert.ok(banners[0].includes('#495'), 'banner names the issue');
    assert.ok(banners[0].includes(DISCUSS_END_ICON), 'banner carries ✅');
  })();
});

test('finalizeDiscussion: does NOT emit the end banner when the body write fails', () => {
  return (async () => {
    const base = ['## Scope', '', 'sparse', '', '{discuss}'].join('\n');
    const logs = [];
    const deps = {
      fetchBody: async () => base,
      pushBody: async () => {
        throw new Error('boom');
      },
      log: (m) => logs.push(m),
    };
    await assert.rejects(
      () =>
        finalizeDiscussion({
          issueNumber: 495,
          repo: 'o/r',
          scope: 'Fleshed scope.',
          ts: '2026-06-22T00:00:00Z',
          deps,
        }),
      /boom/,
      'write failure propagates'
    );
    assert.equal(
      logs.filter((m) => String(m).includes('DISCUSSION RESOLVED')).length,
      0,
      'no end banner on failure'
    );
  })();
});
