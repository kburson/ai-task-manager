#!/usr/bin/env node
// @story #190
// @story #1773
// Asserts that .ai-task-manager/templates/session-boot.md (and its template source) exists,
// lists each required Tier-1 file by exact path, and contains a recovery-protocol
// section. Source-of-truth file is templates/session-boot.md (installed copy is
// gitignored).

import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const repoRoot = path.resolve(__dirname, '../../../..');

const TEMPLATE = path.join(repoRoot, 'templates', 'session-boot.md');

const REQUIRED_TIER1_PATHS = [
  'skill/shared/router.md',
  '.ai-task-manager/templates/pickup-directive.md',
  '.ai-task-manager/task-tracker.json',
];

test('session-boot.md template exists', () => {
  assert.ok(existsSync(TEMPLATE), `missing template: ${TEMPLATE}`);
});

test('session-boot.md references every required Tier-1 file by exact path', () => {
  const body = readFileSync(TEMPLATE, 'utf8');
  for (const p of REQUIRED_TIER1_PATHS) {
    assert.ok(body.includes(p), `session-boot.md must reference Tier-1 file by exact path: ${p}`);
  }
});

test('session-boot.md contains a recovery-protocol section', () => {
  const body = readFileSync(TEMPLATE, 'utf8');
  assert.match(
    body,
    /##\s+Recovery protocol/i,
    'session-boot.md must have a "Recovery protocol" section'
  );
  assert.match(
    body,
    /aitm-boot-recovered/,
    'recovery protocol must mention the aitm-boot-recovered sentinel'
  );
});

test('session-boot.md contains the explicit "summary is not the rule" warning', () => {
  const body = readFileSync(TEMPLATE, 'utf8');
  assert.match(
    body,
    /not\s+a\s+substitute|not\s+authoritative|paraphrase/i,
    'session-boot.md must warn that compacted summaries are not source-of-truth'
  );
});

test('session-boot.md documents Compact vs Clear vs Restart', () => {
  const body = readFileSync(TEMPLATE, 'utf8');
  assert.match(body, /Compact/);
  assert.match(body, /Clear/);
  assert.match(body, /Restart|Fresh|fresh/);
});

test('every Tier-1 file referenced by session-boot.md actually exists on disk', () => {
  for (const p of REQUIRED_TIER1_PATHS) {
    const abs = path.join(repoRoot, p);
    assert.ok(existsSync(abs), `boot index references missing file: ${p}`);
  }
});

test('boot recovery invalidates guidance receipts after context reset', () => {
  const body = readFileSync(TEMPLATE, 'utf8');
  assert.match(body, /receipt/i);
  assert.match(body, /compact/i);
  assert.match(body, /[Cc]lear/);
  assert.match(body, /fresh worker|restart/i);
  assert.match(body, /sentinel/i);
  assert.match(body, /discard|invalidate|expired/i);
});

test('all frozen guidance obligations retain a protocol anchor or enforcement path', () => {
  const map = JSON.parse(
    readFileSync(path.join(repoRoot, 'scripts/tests/fixtures/1558/rule-guidance-map.json'), 'utf8')
  );
  assert.equal(map.rows.length, 41);
  for (const row of map.rows) {
    assert.ok(row.enforcementPath || row.retainedProtocolRule, `${row.id}: no destination`);
    if (row.enforcementPath) {
      assert.ok(
        existsSync(path.join(repoRoot, row.enforcementPath)),
        `${row.id}: enforcement missing`
      );
    }
    if (row.retainedProtocolRule) {
      const destination = path.join(repoRoot, row.retainedProtocolRule);
      assert.ok(existsSync(destination), `${row.id}: protocol missing`);
      assert.ok(
        readFileSync(destination, 'utf8').includes(row.protocolAnchor),
        `${row.id}: protocol anchor missing`
      );
    }
    assert.ok(
      existsSync(path.join(repoRoot, row.documentation.path)),
      `${row.id}: documentation missing`
    );
  }
});
