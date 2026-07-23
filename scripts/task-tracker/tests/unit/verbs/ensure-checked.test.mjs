#!/usr/bin/env node
// @story #660
// AC1 — `ensureChecked` (verb + `setChecklistLine` core, desired='checked').
//
// `ensureChecked` converges a matched checklist line to `- [x]` regardless of
// its current glyph, and is idempotent: a second invocation on an
// already-checked line is a byte-identical no-op (no write, no evidence gate).
// It NEVER unchecks. The two checked-only special-label routes (`deep dive
// complete` → ensureDeepDive, `discussion complete` → markDiscussed) and the
// `- [ ]`→`- [x]` evidence-tick gate (+ the `--allow-unverified-ticks` honest
// hatch) are preserved from the legacy toggle.
//
// Harness mirrors coverage-check-verb.test.mjs: a stateful fake `gh` on PATH
// round-trips the pushed body through a temp file (mutateIssueBody spawns the
// real `gh`, not the injected pexec), and a `process.exit` sentinel captures
// early-exit branches.

import { strict as assert } from 'node:assert';
import { test, before, after } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'node:fs';

import { setChecklistLine, setChecklistLines, verbEnsureChecked } from '../../../verbs/check.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

const AC_PLAIN = 'plain ac no verifier';
const AC_PROVEN = 'proven ac with execution proof';
const AC_VERIFIED = 'verified ac unchecked';
const AC_VERIFIED_CHECKED = 'verified ac checked';
const AC_DUP = 'dup label';
const DOD_TESTS = 'All automated tests pass';

// A pre-existing execution-proof marker (ts/sha) on the AC_PROVEN line satisfies
// the write-layer checkbox-proof invariant — it is carried through the tick, not
// introduced — so that line is the one realistic "ticks cleanly without the
// hatch" path. A proofless AC (AC_PLAIN) can only be ticked via the honest
// `--allow-unverified-ticks` hatch.
const PROOF = '<!-- aitm-verified ts="2026-01-01T00:00:00Z" sha="abc1234" -->';

function fixtureBody() {
  return [
    '## Acceptance Criteria',
    '',
    `- [ ] ${AC_PLAIN}`,
    `- [ ] ${AC_PROVEN} ${PROOF}`,
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
    '',
    '<!-- aitm-fields: {"schema":1,"values":{}} -->',
    '',
  ].join('\n');
}

// ===========================================================================
// setChecklistLine — pure core (desired='checked')
// ===========================================================================

test('setChecklistLine: ticks an unchecked line (changed)', () => {
  const r = setChecklistLine('- [ ] foo', 'foo', 'checked');
  assert.equal(r.status, 'set');
  assert.equal(r.changed, true);
  assert.equal(r.alreadyChecked, false);
  assert.equal(r.body, '- [x] foo');
});

test('setChecklistLine: already-checked is a byte-identical no-op', () => {
  const src = '- [x] foo';
  const r = setChecklistLine(src, 'foo', 'checked');
  assert.equal(r.status, 'set');
  assert.equal(r.changed, false);
  assert.equal(r.alreadyChecked, true);
  assert.equal(r.body, src); // unchanged
});

test('setChecklistLine: checked desired never unchecks a checked line', () => {
  const r = setChecklistLine('- [x] foo', 'foo', 'checked');
  assert.equal(r.body, '- [x] foo'); // still checked
});

test('setChecklistLine: preserves trailing evidence markers on tick', () => {
  const src = '- [ ] foo <!-- aitm-verified cmd="`x`" -->';
  const r = setChecklistLine(src, 'foo', 'checked');
  assert.equal(r.body, '- [x] foo <!-- aitm-verified cmd="`x`" -->');
});

test('setChecklistLine: not-found', () => {
  assert.equal(setChecklistLine('- [ ] foo', 'bar', 'checked').status, 'not-found');
});

test('setChecklistLine: ambiguous reports count', () => {
  const r = setChecklistLine('- [ ] foo\n- [ ] foo', 'foo', 'checked');
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.count, 2);
});

test('setChecklistLines: folds desired across labels, records per-label result', () => {
  const body = '- [ ] a\n- [x] b\n- [ ] c';
  const { body: out, results } = setChecklistLines(body, ['a', 'b', 'missing'], 'checked');
  assert.equal(out, '- [x] a\n- [x] b\n- [ ] c');
  assert.deepEqual(
    results.map((r) => [r.label, r.status, r.changed]),
    [
      ['a', 'set', true],
      ['b', 'set', false], // already checked → no-op
      ['missing', 'not-found', false],
    ]
  );
});

// ===========================================================================
// verbEnsureChecked orchestrator
// ===========================================================================

let tmpRoot;
let fakeBin;
let savedPath;
let storeFile;

before(() => {
  tmpRoot = mkdtempSync(path.join(projectScratchDir('test'), 'ensure-checked-'));
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
    await verbEnsureChecked(ctx);
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

test('verbEnsureChecked: ticks a proof-bearing unchecked AC and writes [x]', async () => {
  resetStore();
  const r = await runVerb(
    baseCtx({ statePath: stateFile('#777'), rest: [AC_PROVEN], pexec: makePexec(fixtureBody()) })
  );
  assert.equal(r.exitCode, null);
  assert.match(readStore(), new RegExp(`- \\[x\\] ${AC_PROVEN}`));
});

test('verbEnsureChecked: idempotent re-run on already-checked is a no-op', async () => {
  resetStore();
  await runVerb(
    baseCtx({ statePath: stateFile('#777'), rest: [AC_PROVEN], pexec: makePexec(fixtureBody()) })
  );
  const afterFirst = readStore();
  // Second run sees the now-checked body (fake gh `view` cats the store).
  const r = await runVerb(
    baseCtx({ statePath: stateFile('#777'), rest: [AC_PROVEN], pexec: makePexec(afterFirst) })
  );
  assert.equal(r.exitCode, null);
  assert.equal(readStore(), afterFirst); // byte-identical, no churn
});

test('verbEnsureChecked: never unchecks an already-checked AC', async () => {
  resetStore();
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: [AC_VERIFIED_CHECKED],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, null);
  assert.match(readStore(), new RegExp(`- \\[x\\] ${AC_VERIFIED_CHECKED}`)); // still checked
});

test('verbEnsureChecked: evidence gate fires on verifier-AC transition → exit 1', async () => {
  resetStore();
  const r = await runVerb(
    baseCtx({ statePath: stateFile('#777'), rest: [AC_VERIFIED], pexec: makePexec(fixtureBody()) })
  );
  assert.equal(r.exitCode, 1);
  assert.match(readStore(), new RegExp(`- \\[ \\] ${AC_VERIFIED} `)); // untouched
});

test('verbEnsureChecked: --allow-unverified-ticks hatch ticks a proofless AC', async () => {
  resetStore();
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['--allow-unverified-ticks', AC_PLAIN],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, null);
  const body = readStore();
  assert.match(body, new RegExp(`- \\[x\\] ${AC_PLAIN}`));
  assert.match(body, /aitm-unverified-tick/); // audit marker recorded
});

test('verbEnsureChecked: --allow-unverified-ticks refused on verifier AC → exit 1', async () => {
  resetStore();
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['--allow-unverified-ticks', AC_VERIFIED],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, 1);
});

test('verbEnsureChecked: special-label "deep dive complete" routes to ensureDeepDive', async () => {
  resetStore();
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['deep dive complete'],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, null);
  assert.match(readStore(), /aitm-deep-dive-complete/); // marker stamped, not a checkbox
});

test('verbEnsureChecked: special-label "discussion complete" marks discussed', async () => {
  resetStore();
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['discussion complete'],
      pexec: makePexec(fixtureBody()),
    })
  );
  assert.equal(r.exitCode, null);
  assert.match(readStore(), /aitm-discussed/);
});

console.log('ensure-checked.test.mjs: defined');
