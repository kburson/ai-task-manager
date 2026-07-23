// @story #642
// Offline coverage-lift for migrate-plan-approved.mjs. Drives the pure transform
// migratePlanApprovedBody through every action branch, the runMigrate
// orchestration (changed → write, unchanged → no write, arg guards), and the
// fetchBody/writeBody gh/fs wrappers through injected deps — no gh, no fs, no
// network.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  migratePlanApprovedBody,
  runMigrate,
  fetchBody,
  writeBody,
} from '../../../migrate-plan-approved.mjs';

const NOW = () => '2026-07-03T00:00:00.000Z';

// ── migratePlanApprovedBody (pure) ────────────────────────────────────────────
test('migrate: no legacy line + no marker → noop-no-trace', () => {
  const r = migratePlanApprovedBody('# Title\n\nbody\n');
  assert.equal(r.changed, false);
  assert.equal(r.action, 'noop-no-trace');
});

test('migrate: no legacy line but marker already present → noop-marker-present', () => {
  const r = migratePlanApprovedBody('body\n\n<!-- aitm-plan-approved: 2026-01-01T00:00:00Z -->\n');
  assert.equal(r.changed, false);
  assert.equal(r.action, 'noop-marker-present');
});

test('migrate: unchecked legacy line → stripped-unchecked, no marker added', () => {
  const src = '# Title\n\n- [ ] Plan approved by human\n\nrest\n';
  const r = migratePlanApprovedBody(src);
  assert.equal(r.action, 'stripped-unchecked');
  assert.equal(r.changed, true);
  assert.doesNotMatch(r.body, /Plan approved by human/);
  assert.doesNotMatch(r.body, /aitm-plan-approved/);
});

test('migrate: checked legacy line + no marker → stripped-and-marker-added', () => {
  const src = '# Title\n\n- [x] Plan approved by human\n\nrest\n';
  const r = migratePlanApprovedBody(src, { now: NOW });
  assert.equal(r.action, 'stripped-and-marker-added');
  assert.equal(r.changed, true);
  assert.doesNotMatch(r.body, /Plan approved by human/);
  assert.match(r.body, /aitm-plan-approved[^>]*2026-07-03T00:00:00\.000Z/);
});

test('migrate: checked legacy line but marker already present → stripped-marker-already-present', () => {
  const src =
    '- [x] Plan approved by human\n\nbody\n\n<!-- aitm-plan-approved: 2026-01-01T00:00:00Z -->\n';
  const r = migratePlanApprovedBody(src);
  assert.equal(r.action, 'stripped-marker-already-present');
  assert.doesNotMatch(r.body, /Plan approved by human/);
});

test('migrate: checked legacy line as the only content → marker-only body', () => {
  const r = migratePlanApprovedBody('- [x] Plan approved by human\n', { now: NOW });
  assert.equal(r.action, 'stripped-and-marker-added');
  assert.match(r.body, /^<!-- aitm-plan-approved[^>]*2026-07-03/);
});

// ── runMigrate orchestration ──────────────────────────────────────────────────
test('runMigrate: changed body → writeIssueBody invoked with new body', async () => {
  const writes = [];
  const r = await runMigrate({
    issueNumber: 642,
    cfg: { repo: 'o/r' },
    deps: {
      fetchIssueBody: async () => ({ body: '- [x] Plan approved by human\n\nbody\n' }),
      writeIssueBody: async ({ body }) => writes.push(body),
    },
  });
  assert.equal(r.changed, true);
  assert.equal(writes.length, 1);
  assert.match(writes[0], /aitm-plan-approved/);
});

test('runMigrate: unchanged body → no write', async () => {
  const writes = [];
  const r = await runMigrate({
    issueNumber: 1,
    cfg: { repo: 'o/r' },
    deps: {
      fetchIssueBody: async () => ({ body: 'plain body, nothing to do\n' }),
      writeIssueBody: async ({ body }) => writes.push(body),
    },
  });
  assert.equal(r.changed, false);
  assert.equal(writes.length, 0);
});

test('runMigrate: missing issueNumber → throws', async () => {
  await assert.rejects(() => runMigrate({ cfg: { repo: 'o/r' } }), /issueNumber is required/);
});

test('runMigrate: missing cfg → throws', async () => {
  await assert.rejects(() => runMigrate({ issueNumber: 5 }), /cfg is required/);
});

// ── fetchBody / writeBody wrappers (injected gh/fs) ───────────────────────────
test('fetchBody: normalizes CRLF from gh stdout', async () => {
  const body = await fetchBody(9, 'o/r', {
    pexec: async () => ({ stdout: 'line1\r\nline2\r\n' }),
  });
  assert.equal(body, 'line1\nline2\n');
});

test('writeBody: stages temp file, calls gh edit, cleans up', async () => {
  const written = [];
  const unlinked = [];
  let ghArgs;
  await writeBody(7, 'o/r', 'new body', {
    scratchDir: () => '/scratch',
    writeFile: (p, b) => written.push({ p, b }),
    unlink: (p) => unlinked.push(p),
    pexec: async (_cmd, args) => {
      ghArgs = args;
      return { stdout: '' };
    },
  });
  assert.equal(written.length, 1);
  assert.equal(written[0].b, 'new body');
  assert.ok(written[0].p.startsWith('/scratch/'));
  assert.ok(ghArgs.includes('--body-file'));
  assert.deepEqual(unlinked, [written[0].p]);
});

test('writeBody: unlink failure is swallowed (best-effort cleanup)', async () => {
  await writeBody(8, 'o/r', 'b', {
    scratchDir: () => '/scratch',
    writeFile: () => {},
    unlink: () => {
      throw new Error('ENOENT');
    },
    pexec: async () => ({ stdout: '' }),
  });
  // no throw = pass
});

console.log('coverage-migrate-plan-approved.test.mjs: ok');
