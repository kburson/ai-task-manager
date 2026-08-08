#!/usr/bin/env node
// @story #154 #1089
// #154 — Test→Review SHA drift gate.
//
// Coverage:
//   1. `aitm-test-started` marker stamped by runVerbTest before sandbox runs.
//   2. Marker round-trip: build, parse, insert, re-insert (refresh) — idempotent.
//   3. Source-level wiring: verbReview parses the marker and refuses on drift.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  TEST_STARTED_RE,
  buildTestStartedMarker,
  hasTestStartedMarker,
  parseTestStartedMarker,
  insertTestStartedMarker,
} from '../../../lib/markers.mjs';
import { runVerbTest } from '../../../verbs/test.mjs';

const here = dirname(fileURLToPath(import.meta.url)) + '/..';
const repoRoot = join(here, '..', '..', '..', '..');

// --- 1. Marker shape -------------------------------------------------------

const marker = buildTestStartedMarker('abc1234', '2026-05-17T20:00:00.000Z');
// #377 — writer now emits the consolidated property grammar.
assert.equal(marker, '<!-- aitm-test-started sha="abc1234" ts="2026-05-17T20:00:00.000Z" -->');
// Legacy colon grammar still parses (back-compat until #369 corpus sweep).
assert.deepEqual(
  parseTestStartedMarker('<!-- aitm-test-started: 9f8e7d6:2026-05-17T20:00:00.000Z -->'),
  {
    sha: '9f8e7d6',
    ts: '2026-05-17T20:00:00.000Z',
  }
);
assert.ok(TEST_STARTED_RE.test(marker));
assert.ok(hasTestStartedMarker(`# heading\n\n${marker}\n`));
assert.equal(hasTestStartedMarker('# heading\n\nno marker'), false);

const parsed = parseTestStartedMarker(`prelude\n${marker}\nend`);
assert.deepEqual(parsed, { sha: 'abc1234', ts: '2026-05-17T20:00:00.000Z' });

// --- 2. Insert + refresh ---------------------------------------------------

const baseBody = '## Scope\n\nstuff\n';
const onceStamped = insertTestStartedMarker(baseBody, 'abc1234', '2026-05-17T20:00:00.000Z');
assert.ok(hasTestStartedMarker(onceStamped));
const refreshed = insertTestStartedMarker(onceStamped, 'def5678', '2026-05-17T21:00:00.000Z');
const allMarkers = refreshed.match(/aitm-test-started/g) || [];
assert.equal(allMarkers.length, 1, 'refresh must replace, not duplicate');
assert.deepEqual(parseTestStartedMarker(refreshed), {
  sha: 'def5678',
  ts: '2026-05-17T21:00:00.000Z',
});

// --- 3. runVerbTest stamps the marker BEFORE sandbox runs ------------------

const writes = [];
let body = '## Scope\n\n## Verification Commands\n\n- [ ] `npm test`\n';
const SHA = '0123456789abcdef0123456789abcdef01234567';
let sandboxRan = false;
let stampedBeforeSandbox = false;

const fakeCfg = { repo: 'x/y' };
const result = await runVerbTest({
  cfg: fakeCfg,
  issueNumber: 999,
  projectDir: repoRoot,
  now: () => '2026-05-17T20:00:00.000Z',
  deps: {
    fetchBody: async () => body,
    // #295 — closure form; runs against live `body` and updates it.
    mutateBody: async ({ mutate }) => {
      const before = body;
      const next = mutate(before);
      if (next === before) return { status: 'no-op' };
      writes.push(next);
      body = next;
      if (!sandboxRan && hasTestStartedMarker(next)) {
        stampedBeforeSandbox = true;
      }
      return { status: 'ok' };
    },
    postComment: async () => {},
    getHeadSha: async () => SHA,
    createWorktree: async () => {},
    removeWorktree: async () => {},
    npmCi: async () => {},
    execInSandbox: async () => {
      sandboxRan = true;
      return { exit: 0, stdout: '', stderr: '' };
    },
    moveState: async () => {},
    logIssueTime: async () => {},
  },
});

assert.equal(result.status, 'passed');
assert.ok(stampedBeforeSandbox, '`aitm-test-started` must be written before execInSandbox runs');
const finalParsed = parseTestStartedMarker(body);
assert.ok(finalParsed, 'final body must contain aitm-test-started');
assert.equal(finalParsed.sha, SHA);

// --- 4. Source-level wiring: review.mjs reads the marker -------------------

const reviewSrc = readFileSync(join(repoRoot, 'scripts/task-tracker/verbs/review.mjs'), 'utf8');
assert.ok(
  /parseTestStartedMarker/.test(reviewSrc),
  'verbs/review.mjs must import parseTestStartedMarker for the SHA-drift gate'
);
assert.ok(
  /HEAD drifted/.test(reviewSrc),
  'verbs/review.mjs must emit a "HEAD drifted" remediation message'
);

const testSrc = readFileSync(join(repoRoot, 'scripts/task-tracker/verbs/test.mjs'), 'utf8');
assert.match(testSrc, /getSandboxHeadSha/, 'Test reads the sandbox HEAD independently');
assert.match(testSrc, /sandboxSha !== sha/, 'Test refuses an outer/sandbox exact-SHA mismatch');

console.log('test-sha-drift-gate: PASS');
