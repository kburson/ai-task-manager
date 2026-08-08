#!/usr/bin/env node
// @story #610
// Coverage tests for the async `verbCheck` orchestrator in
// scripts/task-tracker/verbs/check.mjs (split from coverage-check.test.mjs to
// stay under the 400-line per-file cap; the pure-helper tests live in the
// sibling file).
//
// `verbCheck` reads its issue body through the injected `pexec`, but its WRITES
// go through `mutateIssueBody` → `versionedWriteBody`, which spawns the real
// `gh` binary (it does NOT honour the injected `pexec`). So happy-path writes
// use a stateful fake `gh` on PATH that round-trips the pushed body through a
// temp file (`AITM_FAKE_BODY_FILE`). Every early-exit branch is driven
// in-process with a fake `pexec` and a `process.exit` that throws a sentinel.

import { strict as assert } from 'node:assert';
import { test, before, after } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';

import { verbCheck } from '../../../verbs/check.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import { statePath as resolveStatePath } from '../../../paths.mjs';

const AC_PLAIN = 'plain ac no verifier';
const AC_VERIFIED = 'verified ac unchecked';
const AC_VERIFIED_CHECKED = 'verified ac checked';
const AC_DUP = 'dup label';
const DOD_TESTS = 'All automated tests pass';
const DOD_ACS = 'Acceptance criteria met';
const DOD_LINT_CHECKED = 'Lint and format checks pass';

function fixtureBody() {
  return [
    '## Acceptance Criteria',
    '',
    `- [ ] ${AC_PLAIN} <!-- aitm-non-demonstrable -->`,
    `- [ ] ${AC_VERIFIED} <!-- aitm-verified cmd="\`echo ok\`" -->`,
    `- [x] ${AC_VERIFIED_CHECKED} <!-- aitm-verified cmd="\`echo ok\`" -->`,
    `- [ ] ${AC_DUP}`,
    `- [ ] ${AC_DUP}`,
    '',
    '## Definition of Done',
    '',
    '### Functional (verified at Test)',
    '',
    `- [ ] ${DOD_TESTS} <!-- aitm-verified cmd="\`npm run test:all\`" --> <!-- dod:functional:tests -->`,
    `- [ ] ${DOD_ACS} <!-- dod:functional:acs -->`,
    `- [x] ${DOD_LINT_CHECKED} <!-- aitm-verified cmd="\`npm run lint\`" --> <!-- dod:functional:lint -->`,
    '',
    '<!-- aitm-fields: {"schema":1,"values":{}} -->',
    '',
  ].join('\n');
}

// ===========================================================================
// verbCheck orchestrator
// ===========================================================================

let tmpRoot;
let fakeBin;
let savedPath;
let storeFile;

before(() => {
  tmpRoot = mkdtempSync(path.join(projectScratchDir('test'), 'check-cov-'));
  fakeBin = path.join(tmpRoot, 'bin');
  mkdirSync(fakeBin, { recursive: true });
  // Stateful fake gh: `view` cats the body store; `edit --body-file -` writes
  // stdin back to it; label-only edits and any other subcommand exit 0 without
  // touching stdin (so they never block on an unconnected pipe).
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
// Write a state file with the given `active`. `legacyState` (optional) writes a
// legacy `state` field that `readBoundState` surfaces for the stage-bound gate.
function stateFile(active, legacyState) {
  const p = path.join(tmpRoot, `state-${stateCounter++}.json`);
  const obj = { active, lastActive: active };
  if (legacyState) obj.state = legacyState;
  writeFileSync(p, JSON.stringify(obj));
  return p;
}

function makePexec(body) {
  return async (bin) => {
    if (bin === 'gh') return { stdout: body ?? '', stderr: '' };
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
    await verbCheck(ctx);
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
  ...over,
});

// Reset the body store to the pristine fixture before any write-path test.
function resetStore() {
  writeFileSync(storeFile, fixtureBody());
}

test('verbCheck: no active task → exit 1', async () => {
  const r = await runVerb(
    baseCtx({ statePath: stateFile(null), rest: [AC_PLAIN], pexec: makePexec() })
  );
  assert.equal(r.exitCode, 1);
});

test('verbCheck: discover bucket active → exit 1', async () => {
  const r = await runVerb(
    baseCtx({ statePath: stateFile('discover'), rest: [AC_PLAIN], pexec: makePexec() })
  );
  assert.equal(r.exitCode, 1);
});

test('verbCheck: empty label → exit 1', async () => {
  const r = await runVerb(baseCtx({ statePath: stateFile('#777'), rest: [], pexec: makePexec() }));
  assert.equal(r.exitCode, 1);
});

test('verbCheck: not-found label → exit 1', async () => {
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['totally absent'],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, 1);
});

test('verbCheck: ambiguous label → exit 1', async () => {
  const r = await runVerb(
    baseCtx({ statePath: stateFile('#777'), rest: [AC_DUP], pexec: makePexec(fixtureBody()) })
  );
  assert.equal(r.exitCode, 1);
});

test('verbCheck: evidence-gated AC without stamp → exit 1', async () => {
  const r = await runVerb(
    baseCtx({ statePath: stateFile('#777'), rest: [AC_VERIFIED], pexec: makePexec(fixtureBody()) })
  );
  assert.equal(r.exitCode, 1);
});

test('verbCheck: happy path single toggle (uncheck) → no exit', async () => {
  // Unchecking an already-checked box is a `[x]`→`[ ]` write, which the proof
  // guard does NOT gate (only `[ ]`→`[x]` ticks need an evidence marker), so
  // this exercises the gate→toggle→mutateBody write path without a stamp.
  resetStore();
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: [AC_VERIFIED_CHECKED],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, null);
});

test('verbCheck: --allow-unverified-ticks happy path → no exit', async () => {
  resetStore();
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['--allow-unverified-ticks', AC_PLAIN],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, null);
});

test('verbCheck: --allow-unverified-ticks on DoD item → refuse, exit 1', async () => {
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['--allow-unverified-ticks', DOD_TESTS],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, 1);
});

test('verbCheck: --allow-unverified-ticks on verifier AC → refuse, exit 1', async () => {
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['--allow-unverified-ticks', AC_VERIFIED],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, 1);
});

test('verbCheck: batch happy path (uncheck) → no exit', async () => {
  resetStore();
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['--label', AC_VERIFIED_CHECKED],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, null);
});

test('verbCheck: batch with --allow-unverified-ticks → no exit', async () => {
  resetStore();
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['--allow-unverified-ticks', '--label', AC_PLAIN],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, null);
});

test('verbCheck: batch gate failure → exit 1', async () => {
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['--label', DOD_TESTS],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, 1);
});

test('verbCheck: batch not-found label → exit 1', async () => {
  resetStore();
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['--label', 'no such label'],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, 1);
});

test('verbCheck: batch ambiguous label → exit 1', async () => {
  resetStore();
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['--label', AC_DUP],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, 1);
});

test('verbCheck: --labels-file empty + no --label → usage exit 1', async () => {
  const emptyFile = path.join(tmpRoot, 'empty-labels.txt');
  writeFileSync(emptyFile, '\n  \n');
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['--labels-file', emptyFile],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, 1);
});

test('verbCheck: --labels-file with a label → no exit', async () => {
  resetStore();
  const labelsFile = path.join(tmpRoot, 'labels.txt');
  writeFileSync(labelsFile, `${AC_VERIFIED_CHECKED}\n`);
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['--labels-file', labelsFile],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, null);
});

test('verbCheck: "deep dive complete" outside Refine → ensureDeepDive, no exit', async () => {
  resetStore();
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['deep dive complete'],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, null);
});

test('verbCheck: "deep dive complete" while bound in Refine → refuse, exit 1', async () => {
  // Drive readBoundState to `refine` via a dedicated projectDir whose resolved
  // state file carries the legacy `state` field.
  const refineDir = path.join(tmpRoot, 'refine-proj');
  const sp = resolveStatePath(refineDir);
  mkdirSync(path.dirname(sp), { recursive: true });
  writeFileSync(sp, JSON.stringify({ active: '#777', state: 'refine' }));
  const r = await runVerb(
    baseCtx({
      projectDir: refineDir,
      statePath: stateFile('#777'),
      rest: ['deep dive complete'],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, 1);
});

test('verbCheck: "discussion complete" → marks discussed, no exit', async () => {
  resetStore();
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['discussion complete'],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, null);
});

console.log('coverage-check-verb.test.mjs: defined');
