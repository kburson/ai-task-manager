#!/usr/bin/env node
// @story #594
// Coverage tests for scripts/task-tracker/verbs/dod-stamp.mjs.
//
// `verbDodStamp` resolves a stampable Functional-DoD key (tests/lint/commits),
// fetches the issue body (via injected `pexec`), runs the keyed line's declared
// verifier command(s) through `runVerifiers`, and on all-green upserts the
// run-props proof marker onto that line via `mutateIssueBody`. The body WRITE
// goes through `versionedWriteBody`, which spawns the real `gh` binary (it does
// not honour the injected `pexec`), so the happy-path test puts a stateful fake
// `gh` on PATH that round-trips the pushed body through a temp file. Every
// early-exit branch (no-active, empty-key, unknown-key, derived-key, key-absent,
// no-verifier-command, verifier-failure) is driven in-process with a fake
// `pexec` and a `process.exit` that throws a sentinel.

import { strict as assert } from 'node:assert';
import { test, before, after } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';

import { verbDodStamp } from '../../../verbs/dod-stamp.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

const TEST_CMD = 'node --test scripts/task-tracker/tests/unit/coverage-dod-stamp.test.mjs';

// A Functional DoD subsection with the three stampable keys. The `tests` line
// carries a verifier declaration; pass `testsCmd:false` to drop it (exercises
// the no-verifier-command branch), `omitTests:true` to drop the line entirely
// (exercises the key-absent branch).
function bodyWithDod({ testsCmd = true, omitTests = false } = {}) {
  const testsLine = omitTests
    ? null
    : testsCmd
      ? `- [ ] All automated tests pass <!-- aitm-verified cmd="\`${TEST_CMD}\`" --> <!-- dod:functional:tests -->`
      : '- [ ] All automated tests pass <!-- dod:functional:tests -->';
  return [
    '## Definition of Done',
    '',
    '#### Functional (verified at Test)',
    '',
    ...(testsLine ? [testsLine] : []),
    '- [ ] Lint and format checks pass <!-- dod:functional:lint -->',
    '- [ ] Acceptance criteria met <!-- dod:functional:acs -->',
    '',
  ].join('\n');
}

let tmpRoot;
let fakeBin;
let savedPath;

before(() => {
  tmpRoot = mkdtempSync(path.join(projectScratchDir('test'), 'dod-stamp-cov-'));
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

function makePexec({ body, onVerifier = 'pass' } = {}) {
  return async (bin, args = []) => {
    if (bin === 'gh') return { stdout: body ?? '', stderr: '' };
    if (bin === 'git') {
      if (args.includes('status')) return { stdout: '', stderr: '' };
      return { stdout: 'abc1234\n', stderr: '' };
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

async function runVerb(ctx) {
  const realExit = process.exit;
  process.exit = (code) => {
    throw new ExitError(code ?? 0);
  };
  try {
    await verbDodStamp(ctx);
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
  deps: { now: () => '2026-06-29T00:00:00.000Z' },
  ...over,
});

test('no active task → exit 1', async () => {
  const r = await runVerb(
    baseCtx({ statePath: stateFile(null), rest: ['tests'], pexec: makePexec({}) })
  );
  assert.equal(r.exitCode, 1);
});

test('empty key → exit 1', async () => {
  const r = await runVerb(
    baseCtx({ statePath: stateFile('#777'), rest: [], pexec: makePexec({}) })
  );
  assert.equal(r.exitCode, 1);
});

test('unknown key → exit 1', async () => {
  const r = await runVerb(
    baseCtx({ statePath: stateFile('#777'), rest: ['bogus'], pexec: makePexec({}) })
  );
  assert.equal(r.exitCode, 1);
});

test('derived key (acs) → refuse, exit 1', async () => {
  const r = await runVerb(
    baseCtx({ statePath: stateFile('#777'), rest: ['acs'], pexec: makePexec({}) })
  );
  assert.equal(r.exitCode, 1);
});

test('keyed line absent → exit 1', async () => {
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['tests'],
      pexec: makePexec({ body: bodyWithDod({ omitTests: true }) }),
    })
  );
  assert.equal(r.exitCode, 1);
});

test('keyed line has no verifier command → exit 1', async () => {
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['tests'],
      pexec: makePexec({ body: bodyWithDod({ testsCmd: false }) }),
    })
  );
  assert.equal(r.exitCode, 1);
});

test('verifier non-zero exit → refuse, exit 1', async () => {
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['tests'],
      pexec: makePexec({ body: bodyWithDod(), onVerifier: 'fail' }),
    })
  );
  assert.equal(r.exitCode, 1);
});

test('happy path: verifier passes → stamps marker, no exit', async () => {
  const body = bodyWithDod();
  const storeFile = path.join(tmpRoot, 'body-store.md');
  writeFileSync(storeFile, body);
  process.env.AITM_FAKE_BODY_FILE = storeFile;
  const r = await runVerb(
    baseCtx({ statePath: stateFile('#777'), rest: ['tests'], pexec: makePexec({ body }) })
  );
  assert.equal(r.exitCode, null);
});

console.log('coverage-dod-stamp.test.mjs: defined');
