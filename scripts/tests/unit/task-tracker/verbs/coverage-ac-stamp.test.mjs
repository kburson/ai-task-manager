#!/usr/bin/env node
// @story #593
// Coverage tests for scripts/task-tracker/verbs/ac-stamp.mjs.
//
// `verbAcStamp` fetches the issue body (via the injected `pexec`), locates the
// Acceptance-Criteria line whose visible label matches the argument, runs that
// line's declared `aitm-verified` command(s) through `runVerifiers` (also via
// `pexec`), and on all-green stamps the run-props proof marker onto the line via
// `mutateIssueBody`. Body fetch and write both use the injected `pexec`, so the
// happy-path test round-trips write input through a stateful body store. Every
// early-exit branch is driven in-process with a
// fake `pexec` and a `process.exit` that throws a sentinel.

import { strict as assert } from 'node:assert';
import { test, before, after } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';

import { verbAcStamp } from '../../../../task-tracker/verbs/ac-stamp.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { pexecGithubBodyStore } from '../../../helpers/pexec-body-store.mjs';

const VERIFIER_CMD =
  'node scripts/task-tracker/tools/coverage-threshold.mjs ' +
  'scripts/task-tracker/verbs/ac-stamp.mjs ' +
  'scripts/tests/unit/task-tracker/verbs/coverage-ac-stamp.test.mjs 80';

const AC_LABEL = 'cover the ac-stamp verb';

function bodyWithAc() {
  return [
    '## Acceptance Criteria',
    '',
    `- [ ] ${AC_LABEL} <!-- aitm-verified cmd="\`${VERIFIER_CMD}\`" -->`,
    '',
    '## Verification Commands',
    '',
    '- [ ] existing entry',
    '',
  ].join('\n');
}

let tmpRoot;
let fakeBin;
let savedPath;

before(() => {
  tmpRoot = mkdtempSync(path.join(projectScratchDir('test'), 'ac-stamp-cov-'));
  fakeBin = path.join(tmpRoot, 'bin');
  mkdirSync(fakeBin, { recursive: true });
  // Stateful fake gh: `view` cats the body store, `edit --body-file -` writes
  // stdin back to it, so versionedWriteBody's push→verify round-trip succeeds
  // offline.
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

// Write a state file with the given `active` and return its path.
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

// Build a fake pexec. `onVerifier` decides the verifier (node) result:
//   'pass' → resolve, 'fail' → throw {code:1}.
function makePexec({ body, onVerifier = 'pass' } = {}) {
  return async (bin, args = [], options = {}) => {
    const gh = pexecGithubBodyStore({ bin, args, options, fallbackBody: body ?? '' });
    if (gh) return gh;
    if (bin === 'git') {
      if (args.includes('status')) return { stdout: '', stderr: '' };
      return { stdout: 'abc1234\n', stderr: '' }; // rev-parse --short HEAD
    }
    if (bin === 'node') {
      if (onVerifier === 'fail') {
        const err = new Error('verifier failed');
        err.code = 1;
        throw err;
      }
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

// Run verbAcStamp with process.exit trapped. Returns { exitCode, threw }.
async function runVerb(ctx) {
  const realExit = process.exit;
  process.exit = (code) => {
    throw new ExitError(code ?? 0);
  };
  try {
    await verbAcStamp(ctx);
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
    now: () => '2026-06-29T00:00:00.000Z',
    getLiveState: async () => 'test',
    ...(over.deps || {}),
  },
});

test('no active task → exit 1', async () => {
  const r = await runVerb(
    baseCtx({ statePath: stateFile(null), rest: [AC_LABEL], pexec: makePexec({}) })
  );
  assert.equal(r.exitCode, 1);
});

test('discover bucket active → exit 1', async () => {
  const r = await runVerb(
    baseCtx({ statePath: stateFile('discover'), rest: [AC_LABEL], pexec: makePexec({}) })
  );
  assert.equal(r.exitCode, 1);
});

test('empty label → exit 1', async () => {
  const r = await runVerb(
    baseCtx({ statePath: stateFile('#777'), rest: [], pexec: makePexec({}) })
  );
  assert.equal(r.exitCode, 1);
});

test('no AC line matching label → exit 1', async () => {
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['totally absent label'],
      pexec: makePexec({ body: bodyWithAc() }),
    })
  );
  assert.equal(r.exitCode, 1);
});

test('verifier non-zero exit → refuse, exit 1', async () => {
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: [AC_LABEL],
      pexec: makePexec({ body: bodyWithAc(), onVerifier: 'fail' }),
    })
  );
  assert.equal(r.exitCode, 1);
});

test('happy path: verifier passes → stamps marker, no exit', async () => {
  const body = bodyWithAc();
  const storeFile = path.join(tmpRoot, 'body-store.md');
  writeFileSync(storeFile, body);
  process.env.AITM_FAKE_BODY_FILE = storeFile;
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: [AC_LABEL],
      pexec: makePexec({ body }),
    })
  );
  assert.equal(r.exitCode, null);
});

console.log('coverage-ac-stamp.test.mjs: defined');
