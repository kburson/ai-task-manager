#!/usr/bin/env node
// @story #84
// Unit tests for migrate-plan-approved.mjs.
//
// Cases:
//   1. Legacy checked -> marker written, checkbox stripped.
//   2. Legacy unchecked -> checkbox stripped, NO marker written.
//   3. Already has marker, no legacy -> no-op.
//   4. No trace of either -> no-op.
//   5. Marker already present AND legacy checked -> strip only, do not append second marker.
//   6. runMigrate writes only when body changed.

import { strict as assert } from 'node:assert';
import {
  migratePlanApprovedBody,
  runMigrate,
} from '../../../../task-tracker/migrate-plan-approved.mjs';
import { PLAN_APPROVED_RE as APPROVAL_MARKER_RE } from '../../../../task-tracker/lib/markers.mjs';

const NOW = () => '2026-05-11T12:00:00.000Z';

// 1. Legacy checked -> marker written.
{
  const body = `## AC\n\n- [ ] do thing\n- [x] Plan approved by human\n\n## Next\n`;
  const r = migratePlanApprovedBody(body, { now: NOW });
  assert.equal(r.action, 'stripped-and-marker-added');
  assert.equal(r.changed, true);
  assert.doesNotMatch(r.body, /Plan approved by human/);
  assert.match(r.body, APPROVAL_MARKER_RE);
  assert.match(r.body, /<!-- aitm-plan-approved ts="2026-05-11T12:00:00\.000Z" -->/);
}

// 2. Legacy unchecked -> strip only.
{
  const body = `## AC\n\n- [ ] do thing\n- [ ] Plan approved by human\n\n## Next\n`;
  const r = migratePlanApprovedBody(body, { now: NOW });
  assert.equal(r.action, 'stripped-unchecked');
  assert.equal(r.changed, true);
  assert.doesNotMatch(r.body, /Plan approved by human/);
  assert.doesNotMatch(r.body, APPROVAL_MARKER_RE);
}

// 3. Already has marker, no legacy -> no-op.
{
  const body = `## AC\n\nx\n\n<!-- aitm-plan-approved: 2026-05-10T00:00:00.000Z -->\n`;
  const r = migratePlanApprovedBody(body, { now: NOW });
  assert.equal(r.action, 'noop-marker-present');
  assert.equal(r.changed, false);
  assert.equal(r.body, body);
}

// 4. No trace of either -> no-op.
{
  const body = `## AC\n\n- [ ] do thing\n`;
  const r = migratePlanApprovedBody(body, { now: NOW });
  assert.equal(r.action, 'noop-no-trace');
  assert.equal(r.changed, false);
  assert.equal(r.body, body);
}

// 5. Marker already present AND legacy checked -> strip only.
{
  const body = `## AC\n\n- [x] Plan approved by human\n\n<!-- aitm-plan-approved: 2026-05-10T00:00:00.000Z -->\n`;
  const r = migratePlanApprovedBody(body, { now: NOW });
  assert.equal(r.action, 'stripped-marker-already-present');
  assert.equal(r.changed, true);
  assert.doesNotMatch(r.body, /Plan approved by human/);
  // Only one marker.
  const matches = r.body.match(/<!-- aitm-plan-approved:/g) || [];
  assert.equal(matches.length, 1);
}

// 6. runMigrate writes only when body changed.
{
  const writes = [];
  const deps = {
    fetchIssueBody: async () => ({ body: '## AC\n\n- [ ] do thing\n' }),
    writeIssueBody: async ({ body }) => {
      writes.push(body);
    },
  };
  const r = await runMigrate({ issueNumber: 1, cfg: { repo: 'o/r' }, deps });
  assert.equal(r.changed, false);
  assert.equal(writes.length, 0);

  const writes2 = [];
  const deps2 = {
    fetchIssueBody: async () => ({ body: '## AC\n\n- [x] Plan approved by human\n' }),
    writeIssueBody: async ({ body }) => {
      writes2.push(body);
    },
  };
  const r2 = await runMigrate({ issueNumber: 1, cfg: { repo: 'o/r' }, deps: deps2 });
  assert.equal(r2.changed, true);
  assert.equal(writes2.length, 1);
  assert.match(writes2[0], APPROVAL_MARKER_RE);
}

console.log('migrate-plan-approved.test.mjs: all passed');
