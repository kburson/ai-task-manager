// @story #698
// Regression: heal-stage-rollups CLI must never fall through to write mode.
// `--help` used to launch a full-corpus write sweep (observed live 2026-07-04:
// ~257 issues mutated by a documentation probe); unknown flags were silently
// ignored; the zero-arg default was write. Contract now: help exits 0 before
// config/gh, unknown flags exit 2, dry-run is the default, `--apply` writes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { parseHealArgs } from '../../../../../maintenance/lib/heal-stage-rollups-core.mjs';
import { projectScratchDir } from '../../../../lib/scratch-dir.mjs';

const repoRoot = new URL('../../../../../..', import.meta.url).pathname;
const script = join(repoRoot, 'scripts/maintenance/heal-stage-rollups.mjs');

// ---- parseHealArgs (pure) ----

test('help tokens short-circuit to {help:true}', () => {
  for (const argvList of [['--help'], ['-h'], ['help'], ['--apply', '--help']]) {
    assert.deepEqual(parseHealArgs(argvList), { help: true });
  }
});

test('unknown flags return an error instead of falling through', () => {
  assert.deepEqual(parseHealArgs(['--bogus']), { error: 'unknown flag: --bogus' });
  assert.deepEqual(parseHealArgs(['--force']), { error: 'unknown flag: --force' });
  assert.deepEqual(parseHealArgs(['--verbose']), { error: 'unknown flag: --verbose' });
});

test('zero arguments defaults to dry-run', () => {
  assert.deepEqual(parseHealArgs([]), { mode: 'dry-run', issue: null, yes: false });
});

test('write mode requires an explicit --apply (or --write alias)', () => {
  assert.deepEqual(parseHealArgs(['--apply']), { mode: 'write', issue: null, yes: false });
  assert.deepEqual(parseHealArgs(['--write']), { mode: 'write', issue: null, yes: false });
  assert.deepEqual(parseHealArgs(['--dry-run']), { mode: 'dry-run', issue: null, yes: false });
});

test('--verify wins over --apply (scan only)', () => {
  assert.deepEqual(parseHealArgs(['--verify']), { mode: 'verify', issue: null, yes: false });
  assert.deepEqual(parseHealArgs(['--verify', '--apply']), {
    mode: 'verify',
    issue: null,
    yes: false,
  });
});

test('--issue extracts the number with or without # prefix', () => {
  assert.deepEqual(parseHealArgs(['--issue', '123']), {
    mode: 'dry-run',
    issue: '123',
    yes: false,
  });
  assert.deepEqual(parseHealArgs(['--issue', '#123', '--apply']), {
    mode: 'write',
    issue: '123',
    yes: false,
  });
  assert.deepEqual(parseHealArgs(['--issue']), { error: '--issue requires a number' });
  assert.deepEqual(parseHealArgs(['--issue', '--apply']), { error: '--issue requires a number' });
});

test('--yes is parsed and passed through', () => {
  assert.deepEqual(parseHealArgs(['--apply', '--yes']), {
    mode: 'write',
    issue: null,
    yes: true,
  });
});

// ---- script-level guards (spawned from a bare cwd: no config, no gh) ----

function runScript(argvList) {
  const bareCwd = mkdtempSync(join(projectScratchDir('test'), 'heal-rollups-cli-'));
  return spawnSync(process.execPath, [script, ...argvList], {
    encoding: 'utf8',
    cwd: bareCwd,
    env: { ...process.env, PATH: '/usr/bin:/bin' },
  });
}

test('--help prints usage and exits 0 before config or gh are touched', () => {
  const res = runScript(['--help']);
  assert.equal(res.status, 0, `expected exit 0\nstderr: ${res.stderr}`);
  assert.match(res.stdout, /heal-stage-rollups/);
  assert.match(res.stdout, /--apply/);
});

test('unknown flag exits 2 with a diagnostic, never reaching the write path', () => {
  const res = runScript(['--bogus']);
  assert.equal(res.status, 2, `expected exit 2\nstdout: ${res.stdout}`);
  assert.match(res.stderr, /unknown flag: --bogus/);
  assert.match(res.stderr, /Usage:/);
});
