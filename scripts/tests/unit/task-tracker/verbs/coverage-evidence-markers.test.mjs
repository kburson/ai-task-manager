#!/usr/bin/env node
// @story #612
// Coverage tests for scripts/task-tracker/verbs/evidence-markers.mjs.
//
// Two exports plus two internal helpers:
//   - runEvidenceMarkers(...) — orchestration core with injectable
//     `fetchIssueBody` / `mutateIssueBody` deps. Tested directly across audit
//     (clean / issues-found), backfill (changed+write, dry-run, unchanged,
//     ambiguous), the unknown-mode throw, and both required-arg throws.
//   - verbEvidenceMarkers(ctx) — the CLI wrapper. parseArgs, printAudit, and the
//     success/exit branches are driven through the real verb with a view-only
//     fake `gh` on PATH (so defaultFetchIssueBody returns a controlled body) and
//     process.exit trapped via an ExitError sentinel.

import { strict as assert } from 'node:assert';
import { test, before, after } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';

import {
  runEvidenceMarkers,
  verbEvidenceMarkers,
} from '../../../../task-tracker/verbs/evidence-markers.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

const tmpRoot = mkdtempSync(path.join(projectScratchDir('test'), 'evidence-markers-cov-'));

// ---------------------------------------------------------------------------
// Fixture bodies
// ---------------------------------------------------------------------------
const CLEAN_BODY = [
  '## Acceptance Criteria',
  '',
  '- [ ] does the thing <!-- aitm-verified cmd="`npm test`" -->',
  '',
  '## Verification Commands',
  '',
  '- [ ] `npm test`',
  '',
].join('\n');

// Drives all three printAudit loops: a bare AC (missing-evidence), an AC whose
// declared command is absent from Verification Commands (missing-verification-
// command), and a Verification-Commands entry nothing references (stale).
const ISSUES_BODY = [
  '## Acceptance Criteria',
  '',
  '- [ ] bare ac',
  '- [ ] ac with cmd <!-- aitm-verified cmd="`npm test`" -->',
  '',
  '## Verification Commands',
  '',
  '- [ ] `npm run lint`',
  '',
].join('\n');

const BACKFILL_BODY = [
  '## Acceptance Criteria',
  '',
  '- [ ] needs backfill',
  '',
  '## Verification Commands',
  '',
].join('\n');

const CFG = { repo: 'o/r' };

// ---------------------------------------------------------------------------
// View-only fake `gh` on PATH for the verb tests. defaultFetchIssueBody runs
// `gh issue view … --json body --jq .body`; the stub cats the fixture file
// named by AITM_FAKE_BODY_FILE so the verb path needs no real GitHub.
// ---------------------------------------------------------------------------
let savedPath;
const binDir = path.join(tmpRoot, 'gh-bin');
const fakeBodyFile = path.join(tmpRoot, 'fake-body.md');

mkdirSync(binDir, { recursive: true });
writeFileSync(fakeBodyFile, CLEAN_BODY);
const ghScript = [
  '#!/usr/bin/env bash',
  'if [ "$1" = "issue" ] && [ "$2" = "view" ]; then',
  '  cat "$AITM_FAKE_BODY_FILE"',
  '  exit 0',
  'fi',
  'exit 0',
  '',
].join('\n');
writeFileSync(path.join(binDir, 'gh'), ghScript);
chmodSync(path.join(binDir, 'gh'), 0o755);

before(() => {
  savedPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${savedPath}`;
  process.env.AITM_GH_TEST_DOUBLE_BIN = binDir;
  process.env.AITM_FAKE_BODY_FILE = fakeBodyFile;
});

after(() => {
  if (savedPath !== undefined) process.env.PATH = savedPath;
  delete process.env.AITM_GH_TEST_DOUBLE_BIN;
});

function setFakeBody(body) {
  writeFileSync(fakeBodyFile, body);
}

// ---------------------------------------------------------------------------
// process.exit trap
// ---------------------------------------------------------------------------
class ExitError extends Error {
  constructor(code) {
    super(`exit(${code})`);
    this.code = code;
  }
}

async function runVerb(ctx) {
  const realExit = process.exit;
  process.exit = (code) => {
    throw new ExitError(code ?? 0);
  };
  try {
    await verbEvidenceMarkers(ctx);
    return { exitCode: null };
  } catch (err) {
    if (err instanceof ExitError) return { exitCode: err.code };
    throw err;
  } finally {
    process.exit = realExit;
  }
}

// ===========================================================================
// runEvidenceMarkers — direct, via injected deps
// ===========================================================================

test('runEvidenceMarkers: audit clean body → status clean', async () => {
  const r = await runEvidenceMarkers({
    issueNumber: 1,
    mode: 'audit',
    cfg: CFG,
    deps: { fetchIssueBody: async () => CLEAN_BODY },
  });
  assert.equal(r.status, 'clean');
  assert.equal(r.audit.ok, true);
});

test('runEvidenceMarkers: audit issues body → status issues-found', async () => {
  const r = await runEvidenceMarkers({
    issueNumber: 1,
    mode: 'audit',
    cfg: CFG,
    deps: { fetchIssueBody: async () => ISSUES_BODY },
  });
  assert.equal(r.status, 'issues-found');
  assert.equal(r.audit.ok, false);
  assert.ok(r.audit.missingEvidence.length >= 1);
});

test('runEvidenceMarkers: defaults to audit mode when mode omitted', async () => {
  const r = await runEvidenceMarkers({
    issueNumber: 1,
    cfg: CFG,
    deps: { fetchIssueBody: async () => CLEAN_BODY },
  });
  assert.equal(r.status, 'clean');
});

test('runEvidenceMarkers: backfill changed body → writes via mutateBody', async () => {
  let wrote = null;
  const r = await runEvidenceMarkers({
    issueNumber: 7,
    mode: 'backfill',
    cfg: CFG,
    mappings: { 'needs backfill': ['npm test'] },
    deps: {
      fetchIssueBody: async () => BACKFILL_BODY,
      mutateIssueBody: async (args) => {
        wrote = args;
        // exercise the closure that rebuilds against the fresh base
        const rebuilt = args.mutate(BACKFILL_BODY);
        assert.match(rebuilt, /aitm-verified/);
        return { status: 'ok' };
      },
    },
  });
  assert.equal(r.status, 'backfilled');
  assert.ok(wrote, 'mutateIssueBody was called');
  assert.equal(wrote.issueNumber, 7);
  assert.deepEqual(r.addedEvidenceLabels, ['needs backfill']);
});

test('runEvidenceMarkers: backfill dry-run does not write', async () => {
  let called = false;
  const r = await runEvidenceMarkers({
    issueNumber: 7,
    mode: 'backfill',
    cfg: CFG,
    dryRun: true,
    mappings: { 'needs backfill': ['npm test'] },
    deps: {
      fetchIssueBody: async () => BACKFILL_BODY,
      mutateIssueBody: async () => {
        called = true;
        return {};
      },
    },
  });
  assert.equal(r.status, 'dry-run');
  assert.equal(called, false);
});

test('runEvidenceMarkers: backfill with unchanged body skips write', async () => {
  let called = false;
  const r = await runEvidenceMarkers({
    issueNumber: 7,
    mode: 'backfill',
    cfg: CFG,
    mappings: {},
    deps: {
      fetchIssueBody: async () => CLEAN_BODY,
      mutateIssueBody: async () => {
        called = true;
        return {};
      },
    },
  });
  assert.equal(r.status, 'backfilled');
  assert.equal(called, false, 'no write when body is unchanged');
});

test('runEvidenceMarkers: backfill without mapping → ambiguous', async () => {
  const r = await runEvidenceMarkers({
    issueNumber: 7,
    mode: 'backfill',
    cfg: CFG,
    mappings: {},
    deps: { fetchIssueBody: async () => BACKFILL_BODY },
  });
  assert.equal(r.status, 'ambiguous');
  assert.ok(r.ambiguousLabels.includes('needs backfill'));
});

test('runEvidenceMarkers: unknown mode throws', async () => {
  await assert.rejects(
    () =>
      runEvidenceMarkers({
        issueNumber: 1,
        mode: 'bogus',
        cfg: CFG,
        deps: { fetchIssueBody: async () => CLEAN_BODY },
      }),
    /unknown mode bogus/
  );
});

test('runEvidenceMarkers: throws without issueNumber', async () => {
  await assert.rejects(() => runEvidenceMarkers({ cfg: CFG }), /issueNumber is required/);
});

test('runEvidenceMarkers: throws without cfg.repo', async () => {
  await assert.rejects(() => runEvidenceMarkers({ issueNumber: 1 }), /cfg\.repo is required/);
});

// ===========================================================================
// verbEvidenceMarkers — via real verb + view-only fake gh
// ===========================================================================

test('verbEvidenceMarkers: no issue number → usage, exit 1', async () => {
  const r = await runVerb({ cfg: CFG, rest: ['audit'] });
  assert.equal(r.exitCode, 1);
});

test('verbEvidenceMarkers: backfill without --map-file → exit 2', async () => {
  const r = await runVerb({ cfg: CFG, rest: ['backfill', '#5'] });
  assert.equal(r.exitCode, 2);
});

test('verbEvidenceMarkers: audit issues body prints audit, status issues-found', async () => {
  setFakeBody(ISSUES_BODY);
  const r = await runVerb({ cfg: CFG, rest: ['#5'] });
  assert.equal(r.exitCode, null);
});

test('verbEvidenceMarkers: audit clean body → exits normally', async () => {
  setFakeBody(CLEAN_BODY);
  const r = await runVerb({ cfg: CFG, rest: ['audit', '#5'] });
  assert.equal(r.exitCode, null);
});

test('verbEvidenceMarkers: backfill dry-run with map-file', async () => {
  setFakeBody(BACKFILL_BODY);
  const mapPath = path.join(tmpRoot, 'map-dry.json');
  writeFileSync(mapPath, JSON.stringify({ 'needs backfill': ['npm test'] }));
  const r = await runVerb({
    cfg: CFG,
    rest: ['backfill', '#5', '--map-file', mapPath, '--dry-run'],
  });
  assert.equal(r.exitCode, null);
});

test('verbEvidenceMarkers: backfill ambiguous → exit 3', async () => {
  setFakeBody(BACKFILL_BODY);
  const mapPath = path.join(tmpRoot, 'map-empty.json');
  writeFileSync(mapPath, JSON.stringify({}));
  const r = await runVerb({
    cfg: CFG,
    rest: ['backfill', '#5', '--map-file', mapPath],
  });
  assert.equal(r.exitCode, 3);
});

console.log('coverage-evidence-markers.test.mjs: defined');
