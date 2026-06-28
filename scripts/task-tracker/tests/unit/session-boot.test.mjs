#!/usr/bin/env node
// @story #190
// Asserts that .ai-task-manager/templates/session-boot.md (and its template source) exists,
// lists each required Tier-1 file by exact path, and contains a recovery-protocol
// section. Source-of-truth file is templates/session-boot.md (installed copy is
// gitignored).

import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

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
