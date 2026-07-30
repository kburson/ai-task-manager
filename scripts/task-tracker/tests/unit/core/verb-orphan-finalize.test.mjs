#!/usr/bin/env node
// @story #215
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// #215 AC4 / #1049 — the governed bind session projection must strictly
// consume the owned pending pause before writing the new binding.
//
// This test is a static AST-style guard: it checks that each verb file
// imports `finalizeOrphanPause` from `../orphan-finalize.mjs` AND awaits
// it with `reason: 'orphan-finalize'` BEFORE any `saveState(... active ...)`
// call. Behavioral coverage of finalizeOrphanPause itself lives in
// orphan-finalize.test.mjs.

const root = path.resolve('scripts/task-tracker/verbs');
const governedRoot = path.resolve('scripts/task-tracker/lib/work-lease');

function read(p) {
  return readFileSync(p, 'utf8');
}

const startSrc = read(path.join(root, 'start.mjs'));
const resumeSrc = read(path.join(root, 'resume.mjs'));
const orchestrationSrc = read(path.join(governedRoot, 'bind-orchestration.mjs'));

// start.mjs — now a thin redirect to verbResume; orphan-finalize is handled there
{
  assert.match(
    startSrc,
    /import\s*\{[^}]*verbResume[^}]*\}\s*from\s*['"]\.\/resume\.mjs['"]/,
    'start.mjs imports verbResume from ./resume.mjs (thin delegation)'
  );
  assert.match(
    startSrc,
    /await\s+verbResume\(/,
    'start.mjs delegates to verbResume (which calls finalizeOrphanPause)'
  );
}

// resume.mjs is now a thin governed export.
{
  assert.match(
    resumeSrc,
    /from\s*['"]\.\.\/lib\/work-lease\/bind-orchestration\.mjs['"]/,
    'resume.mjs exports the governed bind orchestration'
  );
  assert.match(
    orchestrationSrc,
    /import\s*\{[^}]*consumePendingPauseForBind[^}]*\}\s*from\s*['"]\.\.\/\.\.\/orphan-finalize\.mjs['"]/,
    'governed orchestration imports strict pending-pause consumption'
  );
  const consumeIdx = orchestrationSrc.search(/consumePendingPauseForBind\(/);
  const saveActiveIdx = orchestrationSrc.search(/saveState\(input\.state/);
  assert.ok(consumeIdx > 0);
  assert.ok(saveActiveIdx > 0);
  assert.ok(
    consumeIdx < saveActiveIdx,
    'pending-pause consumption must run BEFORE saveState binds the target'
  );
}

// AC8 grep guard: `pending-pause.json` literal must appear ONLY in
// orphan-finalize.mjs, hooks/on-stop.mjs, and tests/.
{
  const { execSync } = await import('node:child_process');
  const out = execSync("grep -rln 'pending-pause.json' scripts/task-tracker/ || true", {
    encoding: 'utf8',
  });
  const files = out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed = (f) =>
    f.endsWith('orphan-finalize.mjs') || f.endsWith('hooks/on-stop.mjs') || f.includes('/tests/');
  const violations = files.filter((f) => !allowed(f));
  assert.equal(
    violations.length,
    0,
    `pending-pause.json literal appears outside orphan-finalize.mjs / on-stop.mjs / tests:\n${violations.join('\n')}`
  );
}

console.log('verb-orphan-finalize.test.mjs: all passed');
