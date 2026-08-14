#!/usr/bin/env node
// @story #675 (AC1)
// A web-UI-authored issue never runs preflight-issue.mjs, so its body has no
// `aitm-entered-backlog` marker at all. scaffold-web-issue.mjs's pure
// functions (needsBacklogScaffold/scaffoldBody) are what the `issues:
// [opened]` GitHub Action (.github/workflows/scaffold-web-issue.yml) calls to
// detect and fix that at creation time. Covered here without any network/gh
// dependency — the Action itself is exercised only by GitHub at issue-open
// time, so this test is the guarantee the scaffolding logic stays correct.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { needsBacklogScaffold, scaffoldBody } from '../../../../gh/scaffold-web-issue.mjs';
import { parseEntryMarkersFirstVisit } from '../../../../task-tracker/lib/stage-entry-markers.mjs';

const WEB_AUTHORED_BODY = '## Summary\nSomething broke.\n';

test('needsBacklogScaffold: true for a web-authored body with no entry markers', () => {
  assert.equal(needsBacklogScaffold(WEB_AUTHORED_BODY), true);
});

test('needsBacklogScaffold: false once aitm-entered-backlog is present', () => {
  const scaffolded = scaffoldBody({ body: WEB_AUTHORED_BODY, createdAt: '2026-06-01T00:00:00Z' });
  assert.equal(needsBacklogScaffold(scaffolded), false);
});

test('scaffoldBody: stamps aitm-entered-backlog at the issue createdAt', () => {
  const createdAt = '2026-06-01T00:00:00Z';
  const scaffolded = scaffoldBody({ body: WEB_AUTHORED_BODY, createdAt });
  const markers = parseEntryMarkersFirstVisit(scaffolded);
  assert.equal(markers.backlog, createdAt);
});

test('scaffoldBody: no-op when aitm-entered-backlog already present (create-issue.mjs-authored)', () => {
  const already = scaffoldBody({ body: WEB_AUTHORED_BODY, createdAt: '2026-06-01T00:00:00Z' });
  const again = scaffoldBody({ body: already, createdAt: '2026-06-02T00:00:00Z' });
  assert.equal(again, already);
});

test('scaffoldBody: falls back to now() when createdAt is not supplied', () => {
  const scaffolded = scaffoldBody({ body: WEB_AUTHORED_BODY });
  const markers = parseEntryMarkersFirstVisit(scaffolded);
  assert.ok(markers.backlog, 'expected a backlog marker to be stamped');
  assert.ok(Number.isFinite(Date.parse(markers.backlog)));
});
