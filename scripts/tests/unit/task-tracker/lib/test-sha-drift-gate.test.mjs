#!/usr/bin/env node
// @story #154 #1089 #1344
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
} from '../../../../task-tracker/lib/markers.mjs';
import { runVerbTest } from '../../../../task-tracker/verbs/test.mjs';
import {
  createVerificationReceipt,
  upsertVerificationReceipt,
} from '../../../../task-tracker/lib/verification-receipt.mjs';

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
assert.match(
  body,
  new RegExp(`aitm-verified[^>]*sha="${SHA}"`),
  'green Test proof must name the exact commit verified by the sandbox'
);

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
const exactShaAutoTickCalls = testSrc.match(
  /autoTickVerified\(\s*[^,]+,\s*results,\s*ts,\s*\{\s*sha\s*\}\s*\)/g
);
assert.equal(
  exactShaAutoTickCalls?.length ?? 0,
  2,
  'both the pre-write and fresh-base auto-tick folds receive the verified sha'
);

// --- 5. Sandbox SHA drift refuses before run proof is published ------------

const DRIFT_SHA = 'f'.repeat(40);
const fingerprint = (identity) => ({
  commitSha: SHA,
  environment: {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    lockfileHash: `sha256:${'a'.repeat(64)}`,
    configHashes: { 'package.json': `sha256:${'b'.repeat(64)}` },
    sandbox: { kind: 'worktree', identity, clean: true },
  },
});
const receipt = createVerificationReceipt({
  issueNumber: 1000,
  stage: 'develop-final',
  fingerprint: fingerprint('/outer'),
  commands: [
    {
      classification: 'lint-full',
      command: 'npm',
      args: ['run', 'lint'],
      exitCode: 0,
      durationMs: 1,
    },
    {
      classification: 'format-full',
      command: 'npm',
      args: ['run', 'format:check'],
      exitCode: 0,
      durationMs: 1,
    },
  ],
  now: () => '2026-05-17T20:00:00.000Z',
});
let driftBody = upsertVerificationReceipt(
  [
    '<!-- aitm-last-known-state: develop -->',
    '## Verification Commands',
    '- [ ] `npm run lint`',
  ].join('\n'),
  receipt
);
const driftResult = await runVerbTest({
  cfg: fakeCfg,
  issueNumber: 1000,
  projectDir: repoRoot,
  now: () => '2026-05-17T20:00:00.000Z',
  deps: {
    fetchBody: async () => driftBody,
    mutateBody: async ({ mutate }) => {
      driftBody = mutate(driftBody);
      return { status: 'ok' };
    },
    postComment: async () => {},
    getHeadSha: async () => SHA,
    getSandboxHeadSha: async () => DRIFT_SHA,
    buildFingerprint: ({ projectDir }) =>
      fingerprint(projectDir === repoRoot ? '/outer' : '/sandbox'),
    runDevelopFinalization: async () => {
      throw new Error('valid exact-SHA Develop receipt must be reused');
    },
    createWorktree: async () => {},
    removeWorktree: async () => {},
    npmCi: async () => {},
    execInSandbox: async () => {
      throw new Error('SHA drift must refuse before Verification Commands execute');
    },
  },
});

assert.equal(driftResult.status, 'develop-evidence-invalid');
assert.deepEqual(driftResult.reasons, [{ code: 'sha-mismatch', expected: SHA, actual: DRIFT_SHA }]);
assert.doesNotMatch(
  driftBody,
  /<!-- aitm-verified\b/,
  'SHA drift must not publish command-backed run proof'
);

console.log('test-sha-drift-gate: PASS');
