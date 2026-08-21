#!/usr/bin/env node
// @story #704
// `dod-stamp <key>`/`ac-stamp` used to execute a declared verifier command
// keyed only on local session state, with no check against the issue's live
// lifecycle state. That let `dod-stamp tests` run `npm run test:all` directly
// during Develop, bypassing the Develop-Phase Verification Contract
// (CLAUDE.md: full regression runs exclusively at the Test stage, via a
// sandboxed `promote` run).
//
// These tests prove `dod-stamp tests` refuses — without invoking the
// verifier — when the issue's live state is `develop`, and proceeds normally
// once it's `test` or later. `ac-stamp` gets the mirrored case since it
// shares the same `assertVerifierStateAllowed` gate.

import { strict as assert } from 'node:assert';
import { after, afterEach, before, test } from 'node:test';
import path from 'node:path';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import { verbDodStamp } from '../../../../task-tracker/verbs/dod-stamp.mjs';
import { verbAcStamp } from '../../../../task-tracker/verbs/ac-stamp.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { pexecGithubBodyStore } from '../../../helpers/pexec-body-store.mjs';
import {
  createVerificationReceipt,
  upsertVerificationReceipt,
} from '../../../../task-tracker/lib/verification-receipt.mjs';

const RESTRICTED_CMD = 'npm run test:all';
const AC_LABEL = 'full suite must pass';

function bodyWithDod(command = RESTRICTED_CMD) {
  return [
    '## Definition of Done',
    '',
    '#### Functional (verified at Test)',
    '',
    `- [ ] All automated tests pass <!-- aitm-verified cmd="\`${command}\`" --> <!-- dod:functional:tests -->`,
    '- [ ] Lint and format checks pass <!-- dod:functional:lint -->',
    '- [ ] Acceptance criteria met <!-- dod:functional:acs -->',
    '',
  ].join('\n');
}

function bodyWithAc(command = RESTRICTED_CMD) {
  return [
    '## Acceptance Criteria',
    '',
    `- [ ] ${AC_LABEL} <!-- aitm-verified cmd="\`${command}\`" -->`,
    '',
  ].join('\n');
}

let tmpRoot;
let fakeBin;
let savedPath;

before(() => {
  tmpRoot = mkdtempSync(path.join(projectScratchDir('test'), 'stamp-state-gate-'));
  fakeBin = path.join(tmpRoot, 'bin');
  mkdirSync(fakeBin, { recursive: true });
  const ghPath = path.join(fakeBin, 'gh');
  writeFileSync(
    ghPath,
    [
      '#!/usr/bin/env bash',
      'sub="$2"',
      'f="$AITM_FAKE_BODY_FILE"',
      'if [ "$sub" = "view" ]; then cat "$f"; exit 0; fi',
      'if [ "$sub" = "edit" ]; then cat > "$f"; exit 0; fi',
      'exit 0',
    ].join('\n') + '\n'
  );
  chmodSync(ghPath, 0o755);
  savedPath = process.env.PATH;
  process.env.PATH = `${fakeBin}:${process.env.PATH}`;
});

after(() => {
  process.env.PATH = savedPath;
  delete process.env.AITM_FAKE_BODY_FILE;
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

afterEach(() => {
  delete process.env.AITM_FAKE_BODY_FILE;
});

function stateFile(active) {
  const p = path.join(tmpRoot, `state-${Math.abs(hashish(active))}.json`);
  writeFileSync(p, JSON.stringify({ active, lastActive: active }));
  return p;
}
function hashish(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

const RECEIPT_SHA = 'a'.repeat(40);

function testFingerprint(commitSha = RECEIPT_SHA) {
  return {
    commitSha,
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      lockfileHash: `sha256:${'a'.repeat(64)}`,
      configHashes: { 'package.json': `sha256:${'b'.repeat(64)}` },
      sandbox: { kind: 'worktree', identity: '/sandbox', clean: true },
    },
  };
}

function greenTestReceipt({ issueNumber = 778, executionContext } = {}) {
  return createVerificationReceipt({
    issueNumber,
    stage: 'test',
    fingerprint: testFingerprint(),
    commands: [
      ['lint-full', 'lint'],
      ['format-full', 'format:check'],
      ['test-unit', 'test:unit'],
      ['test-integration', 'test:integration'],
      ['test-slow', 'test:slow'],
    ].map(([classification, script]) => ({
      classification,
      command: 'npm',
      args: ['run', script],
      exitCode: 0,
      durationMs: 10,
    })),
    executionContext,
    now: () => '2026-08-01T18:00:00.000Z',
  });
}

function makePexec({ body, verifierCalled, headSha = 'abc1234' }) {
  return async (bin, args = [], options = {}) => {
    const gh = pexecGithubBodyStore({ bin, args, options, fallbackBody: body ?? '' });
    if (gh) return gh;
    if (bin === 'git') {
      if (args.includes('status')) return { stdout: '', stderr: '' };
      if (args.includes('HEAD') && !args.includes('--short')) {
        return { stdout: `${headSha}\n`, stderr: '' };
      }
      return { stdout: 'abc1234\n', stderr: '' };
    }
    if (bin === 'npm') {
      if (verifierCalled) verifierCalled.ran = true;
      return { stdout: '', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  };
}

class ExitError extends Error {
  constructor(code) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

async function runVerb(fn, ctx) {
  const realExit = process.exit;
  process.exit = (code) => {
    throw new ExitError(code ?? 0);
  };
  try {
    await fn(ctx);
    return { exitCode: null };
  } catch (err) {
    if (err instanceof ExitError) return { exitCode: err.code };
    throw err;
  } finally {
    process.exit = realExit;
  }
}

const baseCtx = (over = {}) => ({
  cfg: { repo: 'o/r' },
  projectDir: tmpRoot,
  ...over,
  deps: {
    now: () => '2026-07-05T00:00:00.000Z',
    buildFingerprint: ({ commitSha }) => testFingerprint(commitSha),
    ...(over.deps || {}),
  },
});

test('dod-stamp tests: refuses in develop, verifier never runs', async () => {
  const body = bodyWithDod();
  const verifierCalled = {};
  const r = await runVerb(
    verbDodStamp,
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['tests'],
      pexec: makePexec({ body, verifierCalled }),
      deps: { getLiveState: async () => 'develop' },
    })
  );
  assert.equal(r.exitCode, 1);
  assert.equal(verifierCalled.ran, undefined);
});

test('dod-stamp tests: proceeds normally once in test state', async () => {
  const body = bodyWithDod();
  const storeFile = path.join(tmpRoot, 'body-store-tests.md');
  writeFileSync(storeFile, body);
  process.env.AITM_FAKE_BODY_FILE = storeFile;
  const verifierCalled = {};
  const r = await runVerb(
    verbDodStamp,
    baseCtx({
      statePath: stateFile('#778'),
      rest: ['tests'],
      pexec: makePexec({ body, verifierCalled }),
      deps: { getLiveState: async () => 'test' },
    })
  );
  assert.equal(r.exitCode, null);
  assert.equal(verifierCalled.ran, true);
});

test('ac-stamp: refuses a restricted verifier command in develop, verifier never runs', async () => {
  const body = bodyWithAc();
  const verifierCalled = {};
  const r = await runVerb(
    verbAcStamp,
    baseCtx({
      statePath: stateFile('#779'),
      rest: [AC_LABEL],
      pexec: makePexec({ body, verifierCalled }),
      deps: { getLiveState: async () => 'develop' },
    })
  );
  assert.equal(r.exitCode, 1);
  assert.equal(verifierCalled.ran, undefined);
});

test('ac-stamp: proceeds normally once in test state', async () => {
  const body = bodyWithAc();
  const storeFile = path.join(tmpRoot, 'body-store-ac.md');
  writeFileSync(storeFile, body);
  process.env.AITM_FAKE_BODY_FILE = storeFile;
  // Isolated projectDir → isolated verifier-run cache, so this doesn't hit
  // the cache entry the dod-stamp "test state" case above just populated for
  // the same (cmd, sha) pair.
  const isolatedProjectDir = mkdtempSync(path.join(tmpRoot, 'ac-cache-'));
  const verifierCalled = {};
  const r = await runVerb(
    verbAcStamp,
    baseCtx({
      projectDir: isolatedProjectDir,
      statePath: stateFile('#780'),
      rest: [AC_LABEL],
      pexec: makePexec({ body, verifierCalled }),
      deps: { getLiveState: async () => 'test' },
    })
  );
  assert.equal(r.exitCode, null);
  assert.equal(verifierCalled.ran, true);
});

test('dod-stamp tests: Review + valid receipt reuses and does not spawn npm', async () => {
  const executionContext = {
    worktreePath: '/test-sandbox',
    branch: 'sandbox-branch',
    boundIssue: 781,
  };
  const body = upsertVerificationReceipt(
    bodyWithDod(),
    greenTestReceipt({ issueNumber: 781, executionContext })
  );
  const storeFile = path.join(tmpRoot, 'body-store-review-reuse.md');
  writeFileSync(storeFile, body);
  process.env.AITM_FAKE_BODY_FILE = storeFile;
  const verifierCalled = {};
  const r = await runVerb(
    verbDodStamp,
    baseCtx({
      statePath: stateFile('#781'),
      rest: ['tests'],
      pexec: makePexec({ body, verifierCalled, headSha: RECEIPT_SHA }),
      deps: { getLiveState: async () => 'review' },
    })
  );
  assert.equal(r.exitCode, null);
  assert.equal(verifierCalled.ran, undefined);
  const persisted = readFileSync(storeFile, 'utf8');
  assert.match(persisted, /worktree="\/test-sandbox"/);
  assert.match(persisted, /branch="sandbox-branch"/);
  assert.match(persisted, /bound-issue="781"/);
});

test('dod-stamp tests: Review + stale receipt refuses and does not spawn npm', async () => {
  const body = upsertVerificationReceipt(bodyWithDod(), greenTestReceipt({ issueNumber: 782 }));
  const storeFile = path.join(tmpRoot, 'body-store-review-stale.md');
  writeFileSync(storeFile, body);
  process.env.AITM_FAKE_BODY_FILE = storeFile;
  const verifierCalled = {};
  const r = await runVerb(
    verbDodStamp,
    baseCtx({
      statePath: stateFile('#782'),
      rest: ['tests'],
      pexec: makePexec({ body, verifierCalled, headSha: 'c'.repeat(40) }),
      deps: { getLiveState: async () => 'review' },
    })
  );
  assert.equal(r.exitCode, 1);
  assert.equal(verifierCalled.ran, undefined);
});

test('dod-stamp tests: Test + valid receipt reuses and does not spawn npm', async () => {
  const body = upsertVerificationReceipt(bodyWithDod(), greenTestReceipt({ issueNumber: 783 }));
  const storeFile = path.join(tmpRoot, 'body-store-test-reuse.md');
  writeFileSync(storeFile, body);
  process.env.AITM_FAKE_BODY_FILE = storeFile;
  const verifierCalled = {};
  const r = await runVerb(
    verbDodStamp,
    baseCtx({
      statePath: stateFile('#783'),
      rest: ['tests'],
      pexec: makePexec({ body, verifierCalled, headSha: RECEIPT_SHA }),
      deps: { getLiveState: async () => 'test' },
    })
  );
  assert.equal(r.exitCode, null);
  assert.equal(verifierCalled.ran, undefined);
  const persisted = readFileSync(storeFile, 'utf8');
  assert.doesNotMatch(persisted, /worktree="/);
  assert.doesNotMatch(persisted, /branch="/);
  assert.doesNotMatch(persisted, /bound-issue="/);
});

test('ac-stamp: Review + valid receipt reuses Test provenance and does not spawn npm', async () => {
  const executionContext = {
    worktreePath: '/test-sandbox-ac',
    branch: 'sandbox-ac-branch',
    boundIssue: 784,
  };
  const body = upsertVerificationReceipt(
    bodyWithAc(),
    greenTestReceipt({ issueNumber: 784, executionContext })
  );
  const storeFile = path.join(tmpRoot, 'body-store-ac-review-reuse.md');
  writeFileSync(storeFile, body);
  process.env.AITM_FAKE_BODY_FILE = storeFile;
  const verifierCalled = {};
  const r = await runVerb(
    verbAcStamp,
    baseCtx({
      statePath: stateFile('#784'),
      rest: [AC_LABEL],
      pexec: makePexec({ body, verifierCalled, headSha: RECEIPT_SHA }),
      deps: { getLiveState: async () => 'review' },
    })
  );
  assert.equal(r.exitCode, null);
  assert.equal(verifierCalled.ran, undefined);
  const persisted = readFileSync(storeFile, 'utf8');
  assert.match(persisted, /worktree="\/test-sandbox-ac"/);
  assert.match(persisted, /branch="sandbox-ac-branch"/);
  assert.match(persisted, /bound-issue="784"/);
});

test('Review + uncovered lint refuses on both stamp surfaces without spawning npm', async () => {
  const cases = [
    { fn: verbDodStamp, issue: 785, body: bodyWithDod('npm run lint'), rest: ['tests'] },
    { fn: verbAcStamp, issue: 786, body: bodyWithAc('npm run lint'), rest: [AC_LABEL] },
  ];
  for (const item of cases) {
    const verifierCalled = {};
    const r = await runVerb(
      item.fn,
      baseCtx({
        statePath: stateFile(`#${item.issue}`),
        rest: item.rest,
        pexec: makePexec({ body: item.body, verifierCalled, headSha: RECEIPT_SHA }),
        deps: { getLiveState: async () => 'review' },
      })
    );
    assert.equal(r.exitCode, 1, String(item.issue));
    assert.equal(verifierCalled.ran, undefined, String(item.issue));
  }
});

test('Review + issue-mismatched receipt refuses on both stamp surfaces', async () => {
  const cases = [
    { fn: verbDodStamp, issue: 787, body: bodyWithDod(), rest: ['tests'] },
    { fn: verbAcStamp, issue: 788, body: bodyWithAc(), rest: [AC_LABEL] },
  ];
  for (const item of cases) {
    const body = upsertVerificationReceipt(item.body, greenTestReceipt({ issueNumber: 999 }));
    const verifierCalled = {};
    const r = await runVerb(
      item.fn,
      baseCtx({
        statePath: stateFile(`#${item.issue}`),
        rest: item.rest,
        pexec: makePexec({ body, verifierCalled, headSha: RECEIPT_SHA }),
        deps: { getLiveState: async () => 'review' },
      })
    );
    assert.equal(r.exitCode, 1, String(item.issue));
    assert.equal(verifierCalled.ran, undefined, String(item.issue));
  }
});

test('unavailable live state refuses on both stamp surfaces', async () => {
  const cases = [
    { fn: verbDodStamp, issue: 789, body: bodyWithDod('npm run lint'), rest: ['tests'] },
    { fn: verbAcStamp, issue: 790, body: bodyWithAc('npm run lint'), rest: [AC_LABEL] },
  ];
  for (const item of cases) {
    const verifierCalled = {};
    const r = await runVerb(
      item.fn,
      baseCtx({
        statePath: stateFile(`#${item.issue}`),
        rest: item.rest,
        pexec: makePexec({ body: item.body, verifierCalled, headSha: RECEIPT_SHA }),
        deps: {
          getLiveState: async () => {
            throw new Error('state unavailable');
          },
        },
      })
    );
    assert.equal(r.exitCode, 1, String(item.issue));
    assert.equal(verifierCalled.ran, undefined, String(item.issue));
  }
});

console.log('dod-stamp-state-gate.test.mjs: defined');
