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
import { test, before, after } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';

import { verbDodStamp } from '../../../verbs/dod-stamp.mjs';
import { verbAcStamp } from '../../../verbs/ac-stamp.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

const RESTRICTED_CMD = 'npm run test:all';
const AC_LABEL = 'full suite must pass';

function bodyWithDod() {
  return [
    '## Definition of Done',
    '',
    '#### Functional (verified at Test)',
    '',
    `- [ ] All automated tests pass <!-- aitm-verified cmd="\`${RESTRICTED_CMD}\`" --> <!-- dod:functional:tests -->`,
    '- [ ] Lint and format checks pass <!-- dod:functional:lint -->',
    '- [ ] Acceptance criteria met <!-- dod:functional:acs -->',
    '',
  ].join('\n');
}

function bodyWithAc() {
  return [
    '## Acceptance Criteria',
    '',
    `- [ ] ${AC_LABEL} <!-- aitm-verified cmd="\`${RESTRICTED_CMD}\`" -->`,
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

function makePexec({ body, verifierCalled }) {
  return async (bin, args = []) => {
    if (bin === 'gh') return { stdout: body ?? '', stderr: '' };
    if (bin === 'git') {
      if (args.includes('status')) return { stdout: '', stderr: '' };
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

const baseCtx = (over) => ({
  cfg: { repo: 'o/r' },
  projectDir: tmpRoot,
  deps: { now: () => '2026-07-05T00:00:00.000Z' },
  ...over,
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

console.log('dod-stamp-state-gate.test.mjs: defined');
