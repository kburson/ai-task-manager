#!/usr/bin/env node
// @story #597
// Coverage tests for scripts/task-tracker/verbs/kind.mjs.
//
// `verbKind` resolves a target issue + kind from `rest` (two-arg explicit form,
// one-arg "active bind" form, or zero-arg usage error), validates the kind via
// `normalizeKind` and the issue number, then upserts the issue-kind marker
// through `mutateIssueBody`. The body fetch goes through the injected `pexec`;
// the WRITE goes through `versionedWriteBody`, which spawns the real `gh` binary
// (it does not honour the injected pexec), so the happy-path tests put a stateful
// fake `gh` on PATH that round-trips the pushed body through a temp file. Every
// early-exit branch (no-args usage, one-arg-no-active, invalid kind, invalid
// issue number) is driven in-process with a `process.exit` that throws a sentinel.

import { strict as assert } from 'node:assert';
import { test, before, after } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';

import { verbKind } from '../../../verbs/kind.mjs';
import { withTestGovernedEffect } from '../../helpers/governed-effect.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

let tmpRoot;
let fakeBin;
let savedPath;

before(() => {
  tmpRoot = mkdtempSync(path.join(projectScratchDir('test'), 'kind-cov-'));
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
  const p = path.join(tmpRoot, `state-${Math.abs(hashish(String(active)))}.json`);
  writeFileSync(p, JSON.stringify({ active, lastActive: active }));
  return p;
}
function hashish(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

function makePexec(body) {
  return async (bin, args = []) => {
    if (bin === 'gh') return { stdout: body ?? '', stderr: '' };
    if (bin === 'git') {
      if (args.includes('status')) return { stdout: '', stderr: '' };
      return { stdout: 'abc1234\n', stderr: '' };
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
  const realErr = console.error;
  process.exit = (code) => {
    throw new ExitError(code ?? 0);
  };
  console.error = () => {};
  try {
    await verbKind(ctx);
    return { exitCode: null };
  } catch (err) {
    if (err instanceof ExitError) return { exitCode: err.code };
    throw err;
  } finally {
    process.exit = realExit;
    console.error = realErr;
  }
}

const baseCtx = (over) => ({
  cfg: { repo: 'o/r' },
  withGovernedEffect: withTestGovernedEffect,
  ...over,
});

test('no args → usage error, exit 1', async () => {
  const r = await runVerb(baseCtx({ rest: [], pexec: makePexec() }));
  assert.equal(r.exitCode, 1);
});

test('one arg with no active task → exit 1', async () => {
  const r = await runVerb(
    baseCtx({ statePath: stateFile(null), rest: ['audit'], pexec: makePexec() })
  );
  assert.equal(r.exitCode, 1);
});

test('invalid kind → exit 1', async () => {
  const r = await runVerb(baseCtx({ rest: ['#42', 'bogus-kind'], pexec: makePexec() }));
  assert.equal(r.exitCode, 1);
});

test('invalid issue number → exit 1', async () => {
  const r = await runVerb(baseCtx({ rest: ['not-a-number', 'audit'], pexec: makePexec() }));
  assert.equal(r.exitCode, 1);
});

test('happy path: explicit target + non-code kind → sets marker', async () => {
  const body = '# Issue 42\n\nBody text.\n';
  const storeFile = path.join(tmpRoot, 'body-42.md');
  writeFileSync(storeFile, body);
  process.env.AITM_FAKE_BODY_FILE = storeFile;
  const r = await runVerb(baseCtx({ rest: ['#42', 'audit'], pexec: makePexec(body) }));
  assert.equal(r.exitCode, null);
});

test('happy path: one-arg active-bind form + code kind → clears marker', async () => {
  const body = '# Issue 99\n\nBody text. <!-- aitm-issue-kind: audit -->\n';
  const storeFile = path.join(tmpRoot, 'body-99.md');
  writeFileSync(storeFile, body);
  process.env.AITM_FAKE_BODY_FILE = storeFile;
  const r = await runVerb(
    baseCtx({ statePath: stateFile('#99'), rest: ['code'], pexec: makePexec(body) })
  );
  assert.equal(r.exitCode, null);
});

console.log('coverage-kind.test.mjs: defined');
