#!/usr/bin/env node
// @story #215
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// #215 AC4 — `verbs/start.mjs` and `verbs/resume.mjs` must call
// `finalizeOrphanPause({reason: 'orphan-finalize'})` before binding/resuming.
//
// This test is a static AST-style guard: it checks that each verb file
// imports `finalizeOrphanPause` from `../orphan-finalize.mjs` AND awaits
// it with `reason: 'orphan-finalize'` BEFORE any `saveState(... active ...)`
// call. Behavioral coverage of finalizeOrphanPause itself lives in
// orphan-finalize.test.mjs.

const root = path.resolve('scripts/task-tracker/verbs');

function read(p) {
  return readFileSync(p, 'utf8');
}

const startSrc = read(path.join(root, 'start.mjs'));
const resumeSrc = read(path.join(root, 'resume.mjs'));

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

// resume.mjs
{
  assert.match(
    resumeSrc,
    /import\s*\{[^}]*finalizeOrphanPause[^}]*\}\s*from\s*['"]\.\.\/orphan-finalize\.mjs['"]/,
    'resume.mjs imports finalizeOrphanPause from ../orphan-finalize.mjs'
  );
  assert.match(
    resumeSrc,
    /finalizeOrphanPause\([\s\S]*?reason:\s*['"]orphan-finalize['"]/,
    'resume.mjs calls finalizeOrphanPause with reason: orphan-finalize'
  );
  const finalizeIdx = resumeSrc.search(/finalizeOrphanPause\(/);
  const saveActiveIdx = resumeSrc.search(/saveClaimedState\(ctx,\s*normalizedTarget/);
  assert.ok(finalizeIdx > 0);
  assert.ok(saveActiveIdx > 0);
  assert.ok(
    finalizeIdx < saveActiveIdx,
    'finalizeOrphanPause must run BEFORE the occupancy-aware state save that binds target'
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
