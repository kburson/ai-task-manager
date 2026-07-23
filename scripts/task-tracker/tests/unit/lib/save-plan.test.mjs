#!/usr/bin/env node
// @story #414
// Unit tests for the `save-plan` verb (#414).
//
// Coverage:
//   - exits 1 when no active discover bucket
//   - exits 1 when --from-file is missing
//   - exits 1 when --from-file file is not found
//   - exits 1 when plan file fails validation (no H1 / no ## Scope)
//   - happy path: saves file to docs/plans/, stamps savedPlanFile in state, prints path
//   - --title override changes saved filename slug
//   - collision avoids overwrite by appending -2 suffix

import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import path from 'node:path';

const VALID_PLAN = '# My Plan\n\n## Scope\nsome scope\n';

function makeState(opts = {}) {
  return {
    active: opts.active ?? 'discover',
    lastActive: null,
    discoverBucket:
      opts.bucket === false
        ? null
        : {
            startedAt: new Date().toISOString(),
            wordsAtStart: 0,
            entries: [],
            ...(opts.bucket || {}),
          },
  };
}

function makeCtx(dir, statePath, rest = []) {
  return { statePath, projectDir: dir, rest };
}

async function runVerb(dir, stateData, rest) {
  const statePath = path.join(dir, 'state.json');
  writeFileSync(statePath, JSON.stringify(stateData), 'utf8');
  const ctx = makeCtx(dir, statePath, rest);

  let exitCode = null;
  let stderrOut = '';
  let stdoutOut = '';

  const origExit = process.exit;
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  const origLog = console.log;

  process.exit = (code) => {
    exitCode = code;
    throw Object.assign(new Error('exit'), { exitCode: code });
  };
  process.stderr.write = (s) => {
    stderrOut += s;
    return true;
  };
  console.log = (...args) => {
    stdoutOut += args.join(' ') + '\n';
  };

  let threw = null;
  try {
    const { verbSavePlan } = await import('../../../verbs/save-plan.mjs');
    await verbSavePlan(ctx);
  } catch (e) {
    threw = e;
  } finally {
    process.exit = origExit;
    process.stderr.write = origStderrWrite;
    console.log = origLog;
  }

  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : null;
  return { exitCode, stderr: stderrOut, stdout: stdoutOut, state, threw };
}

const scratch = projectScratchDir('test');

// --- Case 1: no active discover bucket ----------------------------------------
{
  const dir = mkdtempSync(path.join(scratch, 'sp-no-bucket-'));
  const { exitCode, stderr } = await runVerb(dir, makeState({ active: '#1', bucket: false }), []);
  assert.equal(exitCode, 1, 'should exit 1 when not in discover state');
  assert.match(stderr, /no-active-discover-bucket/);
}

// --- Case 2: --from-file missing ----------------------------------------------
{
  const dir = mkdtempSync(path.join(scratch, 'sp-no-file-'));
  const { exitCode, stderr } = await runVerb(dir, makeState(), []);
  assert.equal(exitCode, 1, 'should exit 1 when --from-file is missing');
  assert.match(stderr, /--from-file/);
}

// --- Case 3: --from-file path does not exist ---------------------------------
{
  const dir = mkdtempSync(path.join(scratch, 'sp-missing-file-'));
  const planPath = path.join(dir, 'nonexistent.md');
  const { exitCode, stderr } = await runVerb(dir, makeState(), ['--from-file', planPath]);
  assert.equal(exitCode, 1, 'should exit 1 when file not found');
  assert.match(stderr, /cannot read --from-file/);
}

// --- Case 4: plan file fails validation (no H1) ------------------------------
{
  const dir = mkdtempSync(path.join(scratch, 'sp-no-h1-'));
  const planPath = path.join(dir, 'bad.md');
  writeFileSync(planPath, '## Scope\njust scope, no title\n', 'utf8');
  const { exitCode, stderr } = await runVerb(dir, makeState(), ['--from-file', planPath]);
  assert.equal(exitCode, 1, 'should exit 1 when H1 is missing');
  assert.match(stderr, /invalid plan file/);
}

// --- Case 5: plan file fails validation (no ## Scope) ------------------------
{
  const dir = mkdtempSync(path.join(scratch, 'sp-no-scope-'));
  const planPath = path.join(dir, 'bad.md');
  writeFileSync(planPath, '# My Plan\n\nNo scope section here.\n', 'utf8');
  const { exitCode, stderr } = await runVerb(dir, makeState(), ['--from-file', planPath]);
  assert.equal(exitCode, 1, 'should exit 1 when ## Scope is missing');
  assert.match(stderr, /invalid plan file/);
}

// --- Case 6: happy path -------------------------------------------------------
{
  const dir = mkdtempSync(path.join(scratch, 'sp-happy-'));
  const planPath = path.join(dir, 'draft.md');
  writeFileSync(planPath, VALID_PLAN, 'utf8');
  const { exitCode, stdout, state } = await runVerb(dir, makeState(), ['--from-file', planPath]);
  assert.equal(exitCode, null, 'should not exit with error');
  assert.match(stdout.trim(), /docs\/plans\/.*\.md/, 'should print saved path');
  assert.ok(state?.discoverBucket?.savedPlanFile, 'savedPlanFile should be stamped in state');
  assert.ok(existsSync(state.discoverBucket.savedPlanFile), 'saved file should exist on disk');
  const saved = readFileSync(state.discoverBucket.savedPlanFile, 'utf8');
  assert.equal(saved, VALID_PLAN, 'saved content should match input');
}

// --- Case 7: --title override changes slug -----------------------------------
{
  const dir = mkdtempSync(path.join(scratch, 'sp-title-'));
  const planPath = path.join(dir, 'draft.md');
  writeFileSync(planPath, VALID_PLAN, 'utf8');
  const { exitCode, state } = await runVerb(dir, makeState(), [
    '--from-file',
    planPath,
    '--title',
    'Custom Title Here',
  ]);
  assert.equal(exitCode, null, 'should not exit with error');
  assert.match(
    state.discoverBucket.savedPlanFile,
    /custom-title-here/,
    'slug should reflect --title override'
  );
}

// --- Case 8: collision appends -2 suffix -------------------------------------
{
  const dir = mkdtempSync(path.join(scratch, 'sp-collision-'));
  const planPath = path.join(dir, 'draft.md');
  writeFileSync(planPath, VALID_PLAN, 'utf8');

  // First save
  const { state: s1 } = await runVerb(dir, makeState(), ['--from-file', planPath]);
  assert.ok(s1?.discoverBucket?.savedPlanFile, 'first save should work');

  // Second save with same content (same slug same date) — restore state to discover
  const { state: s2 } = await runVerb(dir, makeState(), ['--from-file', planPath]);
  assert.ok(s2?.discoverBucket?.savedPlanFile, 'second save should work');
  assert.notEqual(
    s1.discoverBucket.savedPlanFile,
    s2.discoverBucket.savedPlanFile,
    'second path should differ'
  );
  assert.match(s2.discoverBucket.savedPlanFile, /-2\.md$/, 'collision suffix should be -2');
}

console.log('save-plan.test.mjs: all passed');
