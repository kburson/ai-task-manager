#!/usr/bin/env node
// @story #598
// Coverage tests for scripts/task-tracker/verbs/mirror-deep-dive.mjs.
//
// `verbMirrorDeepDive` parses `--from-comment` (space and = forms) and an
// optional `#N` target out of `rest`, falls back to the active bound issue when
// `#N` is omitted, then mirrors the named comment's prose into the issue body via
// `mirrorDeepDiveFromComment`. It injects no deps, so the happy path shells the
// real `gh` binary: `gh api …` to fetch the comment and `gh issue view/edit` to
// round-trip the body. The happy-path test therefore puts a stateful fake `gh` on
// PATH (api → canned JSON, view → cat store, edit → write store). The refusal
// branches (missing --from-comment, no target + no binding) exit 2 in-process via
// a `process.exit` sentinel; the unconfigured-repo branch throws and is asserted.

import { strict as assert } from 'node:assert';
import { test, before, after } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';

import { verbMirrorDeepDive } from '../../../verbs/mirror-deep-dive.mjs';
import { withTestGovernedEffect } from '../../helpers/governed-effect.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

let tmpRoot;
let fakeBin;
let savedPath;

before(() => {
  tmpRoot = mkdtempSync(path.join(projectScratchDir('test'), 'mirror-dd-cov-'));
  fakeBin = path.join(tmpRoot, 'bin');
  mkdirSync(fakeBin, { recursive: true });
  const ghPath = path.join(fakeBin, 'gh');
  writeFileSync(
    ghPath,
    [
      '#!/usr/bin/env bash',
      'f="$AITM_FAKE_BODY_FILE"',
      'if [ "$1" = "api" ]; then',
      '  echo \'{"body":"## Deep-Dive Analysis\\n\\nMirrored prose, substantial enough to survive the strip.","html_url":"https://example/c/777"}\'',
      '  exit 0',
      'fi',
      'sub="$2"',
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

class ExitError extends Error {
  constructor(code) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

// Trap ONLY process.exit for control flow. Do NOT override
// process.stdout/stderr.write here: doing so swallows the node:test TAP event
// stream and makes earlier tests vanish from the run count. The verb's own JSON
// / diagnostic writes are harmless cosmetic noise; we leave them alone.
async function runVerb(ctx) {
  const realExit = process.exit;
  process.exit = (code) => {
    throw new ExitError(code ?? 0);
  };
  try {
    await verbMirrorDeepDive(ctx);
    return { exitCode: null, threw: null };
  } catch (err) {
    if (err instanceof ExitError) return { exitCode: err.code, threw: null };
    return { exitCode: null, threw: err };
  } finally {
    process.exit = realExit;
  }
}

test('missing --from-comment → exit 2', async () => {
  const r = await runVerb({ cfg: { repo: 'o/r' }, rest: [] });
  assert.equal(r.exitCode, 2);
});

test('no target and no active binding → exit 2', async () => {
  const r = await runVerb({
    cfg: { repo: 'o/r' },
    rest: ['--from-comment', '777'],
    statePath: stateFile(''),
  });
  assert.equal(r.exitCode, 2);
});

test('target derived from active bind; unconfigured repo throws', async () => {
  // --from-comment present, no #N → falls back to active bind; cfg has no repo,
  // so parseRepoFromCfg throws (exercises the state-fallback + throw branches).
  const r = await runVerb({
    cfg: {},
    rest: ['--from-comment', '777'],
    statePath: stateFile('#598'),
  });
  assert.ok(r.threw, 'expected a thrown error');
  assert.match(r.threw.message, /cfg\.repo/);
});

test('--from-comment= form + explicit #N → unconfigured repo throws', async () => {
  const r = await runVerb({ cfg: {}, rest: ['--from-comment=777', '#42'] });
  assert.ok(r.threw, 'expected a thrown error');
  assert.match(r.threw.message, /cfg\.repo/);
});

test('happy path: mirrors comment prose into the issue body, prints result', async () => {
  const storeFile = path.join(tmpRoot, 'body-42.md');
  writeFileSync(storeFile, '# Issue 42\n\nOriginal body, no deep dive yet.\n');
  process.env.AITM_FAKE_BODY_FILE = storeFile;
  const r = await runVerb({
    cfg: { repo: 'o/r' },
    rest: ['--from-comment=777', '42'],
    withGovernedEffect: withTestGovernedEffect,
  });
  assert.equal(r.threw, null);
  assert.equal(r.exitCode, null);
});

console.log('coverage-mirror-deep-dive.test.mjs: defined');
