#!/usr/bin/env node
// @story #614
// Coverage for verbs/config.mjs. Drives the real verbConfig across all six
// branches (list / init / get-known / get-unknown→exit1 / set-success /
// set-error→exit1), trapping process.exit and capturing console. The set path
// writes through the real setConfigValue, redirected to a temp projectPath so
// no real project-local config is touched.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verbConfig } from '../../../../task-tracker/verbs/config.mjs';
import { DEFAULTS } from '../../../../task-tracker/config.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

const knownKey = Object.keys(DEFAULTS)[0];

function baseCfg() {
  return {
    ...DEFAULTS,
    _sources: Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, 'default'])),
  };
}

// Run verbConfig with console captured + process.exit trapped.
function run(rest, cfg = baseCfg()) {
  const real = { exit: process.exit, log: console.log, err: console.error };
  const stdout = [];
  const stderr = [];
  let exitCode = null;
  process.exit = (code) => {
    exitCode = code ?? 0;
    throw new Error(`__exit_${exitCode}__`);
  };
  console.log = (...a) => stdout.push(a.join(' '));
  console.error = (...a) => stderr.push(a.join(' '));
  let thrown = null;
  try {
    verbConfig({ rest, cfg });
  } catch (err) {
    if (!/__exit_\d+__/.test(err.message)) thrown = err;
  } finally {
    process.exit = real.exit;
    console.log = real.log;
    console.error = real.err;
  }
  return { exitCode, stdout: stdout.join('\n'), stderr: stderr.join('\n'), thrown };
}

test('no args → prints formatted config', () => {
  const r = run([]);
  assert.equal(r.exitCode, null);
  assert.ok(r.stdout.length > 0);
});

test('init → prints interview guidance', () => {
  const r = run(['init']);
  assert.match(r.stdout, /configuration interview/);
});

test('get known key → prints value + source', () => {
  const r = run([knownKey]);
  assert.match(r.stdout, new RegExp(`${knownKey} = `));
  assert.match(r.stdout, /source: default/);
});

test('get unknown key → error, exit 1', () => {
  const r = run(['definitelyNotAKey']);
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /unknown config key: definitelyNotAKey/);
});

test('set valid key → writes via setConfigValue, prints value', () => {
  // verbConfig calls the real setConfigValue with default paths, which resolve
  // under getProjectDir(). Redirect that to a temp dir via the env override so
  // no real project-local config is touched, then assert the file was written.
  const dir = mkdtempSync(join(projectScratchDir('test'), 'aitm-614-'));
  const prev = process.env.AI_TASK_MANAGER_PROJECT_DIR;
  process.env.AI_TASK_MANAGER_PROJECT_DIR = dir;
  try {
    const r = run(['wpm', '250']);
    assert.equal(r.exitCode, null);
    assert.match(r.stdout, /wpm = .*\(project-local\)/);
    const written = readFileSync(join(dir, '.ai-task-manager', 'task-tracker.json'), 'utf8');
    assert.match(written, /"wpm": 250/);
  } finally {
    if (prev === undefined) delete process.env.AI_TASK_MANAGER_PROJECT_DIR;
    else process.env.AI_TASK_MANAGER_PROJECT_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('set unknown key → setConfigValue throws → error, exit 1', () => {
  const r = run(['notARealKey', 'x']);
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /unknown config key/);
});

console.log('coverage-config.test.mjs: defined');
