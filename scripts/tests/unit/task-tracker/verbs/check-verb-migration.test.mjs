#!/usr/bin/env node
// @story #660
// AC3 — `check` deprecation + repo-wide migration.
//
// The legacy `check` verb is retained only as a deprecated alias of
// `ensureChecked` — it no longer TOGGLES. This file pins the two
// migration-visible behaviors:
//
//   1. Running legacy `check` on an already-checked box is a no-op — it does
//      NOT uncheck (the defining regression #660 fixes). A deprecation notice
//      is emitted on stderr.
//   2. No instructional `task check "<label>"` toggle call site and no "Toggle
//      a checkbox" description survive anywhere in the canonical live set
//      (README, docs sans archive, skill, templates, code guidance strings).
//      The deprecation machinery (manifest alias, help alias line, the verb's
//      own deprecation notice) does NOT match `task check "` so it is exempt.
//      node_modules, docs/archive, .tmp, and the tests dir are excluded.
//
// Harness mirrors coverage-check-verb.test.mjs (stateful injected pexec +
// process.exit sentinel); the grep arm shells out to `grep`.

import { strict as assert } from 'node:assert';
import { test, before, after } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'node:fs';

import { verbCheck } from '../../../../task-tracker/verbs/check.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { pexecGithubBodyStore } from '../../../helpers/pexec-body-store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url)) + '/..';
// scripts/tests/unit/task-tracker/verbs → repo root is five levels up.
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const AC_CHECKED = 'already checked criterion';

function fixtureBody() {
  return [
    '## Acceptance Criteria',
    '',
    `- [x] ${AC_CHECKED}`,
    '',
    '<!-- aitm-fields: {"schema":1,"values":{}} -->',
    '',
  ].join('\n');
}

// ===========================================================================
// 1. Legacy `check` is a deprecated, non-toggling alias
// ===========================================================================

let tmpRoot;
let fakeBin;
let savedPath;
let storeFile;

before(() => {
  tmpRoot = mkdtempSync(path.join(projectScratchDir('test'), 'check-migration-'));
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
      'if [ "$sub" = "edit" ]; then',
      '  for a in "$@"; do if [ "$a" = "--body-file" ]; then cat > "$f"; break; fi; done',
      '  exit 0',
      'fi',
      'exit 0',
    ].join('\n') + '\n'
  );
  chmodSync(ghPath, 0o755);
  savedPath = process.env.PATH;
  process.env.PATH = `${fakeBin}:${process.env.PATH}`;
  storeFile = path.join(tmpRoot, 'body-store.md');
  writeFileSync(storeFile, fixtureBody());
  process.env.AITM_FAKE_BODY_FILE = storeFile;
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

let stateCounter = 0;
function stateFile(active) {
  const p = path.join(tmpRoot, `state-${stateCounter++}.json`);
  writeFileSync(p, JSON.stringify({ active, lastActive: active }));
  return p;
}

function makePexec(body) {
  return async (bin, args = [], options = {}) => {
    const gh = pexecGithubBodyStore({ bin, args, options, fallbackBody: body ?? '' });
    if (gh) return gh;
    return { stdout: '', stderr: '' };
  };
}

class ExitError extends Error {
  constructor(code) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

async function runCheck(ctx) {
  const realExit = process.exit;
  const realWrite = process.stderr.write.bind(process.stderr);
  let stderr = '';
  process.stderr.write = (chunk) => {
    stderr += chunk;
    return true;
  };
  process.exit = (code) => {
    throw new ExitError(code ?? 0);
  };
  try {
    await verbCheck(ctx);
    return { exitCode: null, stderr };
  } catch (err) {
    if (err instanceof ExitError) return { exitCode: err.code, stderr };
    throw err;
  } finally {
    process.exit = realExit;
    process.stderr.write = realWrite;
  }
}

const baseCtx = (over) => ({ cfg: { repo: 'o/r' }, projectDir: tmpRoot, ...over });
const readStore = () => readFileSync(storeFile, 'utf8');

test('legacy `check` on an already-checked box does NOT uncheck (no toggle)', async () => {
  writeFileSync(storeFile, fixtureBody());
  const r = await runCheck(
    baseCtx({ statePath: stateFile('#777'), rest: [AC_CHECKED], pexec: makePexec(fixtureBody()) })
  );
  assert.equal(r.exitCode, null);
  assert.match(readStore(), new RegExp(`- \\[x\\] ${AC_CHECKED}`)); // still checked
});

test('legacy `check` emits a deprecation notice on stderr', async () => {
  writeFileSync(storeFile, fixtureBody());
  const r = await runCheck(
    baseCtx({ statePath: stateFile('#777'), rest: [AC_CHECKED], pexec: makePexec(fixtureBody()) })
  );
  assert.match(r.stderr, /deprecated/i);
  assert.match(r.stderr, /ensureChecked/);
});

// ===========================================================================
// 2. Repo-wide migration: no surviving toggle call sites / descriptions
// ===========================================================================

function grepCount(pattern) {
  // grep exits 1 with no matches; `|| true` keeps execSync from throwing.
  // Excludes mirror the canonical-live-set definition in the header. A single
  // grep with --exclude-dir prunes traversal up front (never walks
  // node_modules/worktree checkouts) instead of piping through five separate
  // `grep -v` processes — each spawned subprocess carries a fixed cost that
  // dominates this test's wall time under sandboxed/CI execution (#993).
  const cmd =
    `grep -rn --include='*.md' --include='*.mjs' ` +
    `--exclude-dir=node_modules --exclude-dir=archive --exclude-dir=worktrees ` +
    `--exclude-dir=.worktrees --exclude-dir=.tmp --exclude-dir=tests ` +
    `-e ${JSON.stringify(pattern)} . 2>/dev/null || true`;
  const out = execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', shell: '/bin/bash' }).trim();
  return out;
}

test('no instructional `task check "<label>"` toggle call site survives', () => {
  const hits = grepCount('task check "');
  assert.equal(hits, '', `unexpected surviving call sites:\n${hits}`);
});

test('no "Toggle a checkbox" description survives', () => {
  const hits = grepCount('Toggle a checkbox');
  assert.equal(hits, '', `unexpected surviving descriptions:\n${hits}`);
});

console.log('check-verb-migration.test.mjs: defined');
