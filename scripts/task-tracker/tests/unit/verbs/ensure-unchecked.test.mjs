#!/usr/bin/env node
// @story #660
// AC2 — `ensureUnchecked` (verb + `setChecklistLine` core, desired='unchecked').
//
// `ensureUnchecked` converges a matched checklist line to `- [ ]` regardless of
// its current glyph, and is idempotent: a second invocation on an
// already-unchecked line is a byte-identical no-op. It NEVER checks, runs NO
// evidence-tick gate (un-ticking can never fabricate a passed criterion), and
// treats the otherwise-special labels (`deep dive complete`, `discussion
// complete`) as ordinary checkbox text — those marker routes are checked-only,
// so under `ensureUnchecked` they are NOT taken.
//
// Harness mirrors coverage-check-verb.test.mjs (fake `gh` on PATH +
// process.exit sentinel).

import { strict as assert } from 'node:assert';
import { test, before, after } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'node:fs';

import { setChecklistLine, setChecklistLines, verbEnsureUnchecked } from '../../../verbs/check.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

const AC_PLAIN = 'plain ac no verifier';
const AC_VERIFIED_CHECKED = 'verified ac checked';

function fixtureBody() {
  return [
    '## Acceptance Criteria',
    '',
    `- [ ] ${AC_PLAIN}`,
    `- [x] ${AC_VERIFIED_CHECKED} <!-- aitm-verified cmd="\`echo ok\`" -->`,
    '',
    '<!-- aitm-fields: {"schema":1,"values":{}} -->',
    '',
  ].join('\n');
}

// ===========================================================================
// setChecklistLine — pure core (desired='unchecked')
// ===========================================================================

test('setChecklistLine: unchecks a checked line (changed)', () => {
  const r = setChecklistLine('- [x] foo', 'foo', 'unchecked');
  assert.equal(r.status, 'set');
  assert.equal(r.changed, true);
  assert.equal(r.alreadyChecked, true);
  assert.equal(r.body, '- [ ] foo');
});

test('setChecklistLine: already-unchecked is a byte-identical no-op', () => {
  const src = '- [ ] foo';
  const r = setChecklistLine(src, 'foo', 'unchecked');
  assert.equal(r.status, 'set');
  assert.equal(r.changed, false);
  assert.equal(r.alreadyChecked, false);
  assert.equal(r.body, src); // unchanged
});

test('setChecklistLine: unchecked desired never checks an unchecked line', () => {
  const r = setChecklistLine('- [ ] foo', 'foo', 'unchecked');
  assert.equal(r.body, '- [ ] foo'); // still unchecked
});

test('setChecklistLine: preserves trailing evidence markers on untick', () => {
  const src = '- [x] foo <!-- aitm-verified cmd="`x`" -->';
  const r = setChecklistLine(src, 'foo', 'unchecked');
  assert.equal(r.body, '- [ ] foo <!-- aitm-verified cmd="`x`" -->');
});

test('setChecklistLines: folds untick across labels with per-label results', () => {
  const body = '- [x] a\n- [ ] b\n- [x] c';
  const { body: out, results } = setChecklistLines(body, ['a', 'b'], 'unchecked');
  assert.equal(out, '- [ ] a\n- [ ] b\n- [x] c');
  assert.deepEqual(
    results.map((r) => [r.label, r.status, r.changed]),
    [
      ['a', 'set', true],
      ['b', 'set', false], // already unchecked → no-op
    ]
  );
});

// ===========================================================================
// verbEnsureUnchecked orchestrator
// ===========================================================================

let tmpRoot;
let fakeBin;
let savedPath;
let storeFile;

before(() => {
  tmpRoot = mkdtempSync(path.join(projectScratchDir('test'), 'ensure-unchecked-'));
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
    await verbEnsureUnchecked(ctx);
    return { exitCode: null };
  } catch (err) {
    if (err instanceof ExitError) return { exitCode: err.code };
    throw err;
  } finally {
    process.exit = realExit;
  }
}

const baseCtx = (over) => ({ cfg: { repo: 'o/r' }, projectDir: tmpRoot, ...over });
const readStore = () => readFileSync(storeFile, 'utf8');
function resetStore() {
  writeFileSync(storeFile, fixtureBody());
}

test('verbEnsureUnchecked: unchecks a checked AC and writes [ ]', async () => {
  resetStore();
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: [AC_VERIFIED_CHECKED],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, null);
  assert.match(readStore(), new RegExp(`- \\[ \\] ${AC_VERIFIED_CHECKED}`));
});

test('verbEnsureUnchecked: idempotent re-run on already-unchecked is a no-op', async () => {
  resetStore();
  const r = await runVerb(
    baseCtx({ statePath: stateFile('#777'), rest: [AC_PLAIN], pexec: makePexec(fixtureBody()) })
  );
  assert.equal(r.exitCode, null);
  assert.equal(readStore(), fixtureBody()); // byte-identical, no churn
});

test('verbEnsureUnchecked: never checks an unchecked AC', async () => {
  resetStore();
  const r = await runVerb(
    baseCtx({ statePath: stateFile('#777'), rest: [AC_PLAIN], pexec: makePexec(fixtureBody()) })
  );
  assert.equal(r.exitCode, null);
  assert.match(readStore(), new RegExp(`- \\[ \\] ${AC_PLAIN}`)); // still unchecked
});

test('verbEnsureUnchecked: runs NO evidence gate when un-ticking a verifier AC', async () => {
  // The checked verifier AC carries no fresh proof; un-ticking it must still
  // succeed (the evidence gate is checked-only — it can never block an untick).
  resetStore();
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: [AC_VERIFIED_CHECKED],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, null);
  assert.match(readStore(), new RegExp(`- \\[ \\] ${AC_VERIFIED_CHECKED}`));
});

test('verbEnsureUnchecked: "deep dive complete" is ordinary text, not the marker route', async () => {
  // No checkbox line matches the special label → generic not-found, exit 1.
  // Proves the deep-dive route (which would stamp aitm-deep-dive-complete) is
  // NOT taken under ensureUnchecked.
  resetStore();
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['deep dive complete'],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, 1);
  assert.doesNotMatch(readStore(), /aitm-deep-dive-complete/);
});

test('verbEnsureUnchecked: "discussion complete" is ordinary text, not the discuss route', async () => {
  resetStore();
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['discussion complete'],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, 1);
  assert.doesNotMatch(readStore(), /aitm-discussed/);
});

console.log('ensure-unchecked.test.mjs: defined');
