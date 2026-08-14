// @story #869
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
  entrypointCandidates,
  hookBootstrapCommand,
} from '../../../../task-tracker/lib/guard-entrypoint.mjs';

test('entrypointCandidates: node_modules first, repo-relative second', () => {
  assert.deepEqual(entrypointCandidates('scripts/task-tracker/hooks/memory-index.mjs'), [
    'node_modules/ai-task-manager/scripts/task-tracker/hooks/memory-index.mjs',
    'scripts/task-tracker/hooks/memory-index.mjs',
  ]);
});

test('hookBootstrapCommand embeds both candidates, node_modules first', () => {
  const cmd = hookBootstrapCommand('scripts/task-tracker/hooks/on-stop.mjs');
  const nm = cmd.indexOf('node_modules/ai-task-manager/scripts/task-tracker/hooks/on-stop.mjs');
  const repo = cmd.indexOf('"scripts/task-tracker/hooks/on-stop.mjs"');
  assert.ok(nm !== -1 && repo !== -1 && nm < repo);
});

test('hookBootstrapCommand normalizes process.argv so isMain + argv[2] work', () => {
  const cmd = hookBootstrapCommand('scripts/task-tracker/hooks/on-ask.mjs', 'pause');
  // argv is rewritten to [argv0, resolvedPath, ...extraArgs] before import
  assert.match(cmd, /process\.argv\s*=\s*\[process\.argv\[0\],\s*p/);
  assert.match(cmd, /"pause"/, 'extra arg is embedded');
  assert.match(cmd, /import\(pathToFileURL\(p\)\.href\)/);
});

test('hookBootstrapCommand fails OPEN (exit 0) when neither candidate resolves', () => {
  const cmd = hookBootstrapCommand('scripts/task-tracker/hooks/on-stop.mjs');
  assert.match(cmd, /process\.exit\(0\)/);
  assert.doesNotMatch(cmd, /process\.exit\(2\)/, 'hooks are non-security; do not fail closed');
});

test('end-to-end: shim actually runs a module main-block that gates on argv[1]', () => {
  // Prove the argv normalization makes an isMain-gated module execute. Claude
  // Code hands the `node -e "<program>"` payload to node verbatim (NOT through a
  // POSIX shell — a shell would strip the embedded JSON double-quotes), so the
  // faithful reproduction extracts the program and runs it as a single -e argv.
  const relDir = path.join('.tmp', 'inspect');
  mkdirSync(path.resolve(relDir), { recursive: true });
  const fixtureRel = path.join(relDir, 'fixture-hook.mjs');
  const fixtureAbs = path.resolve(fixtureRel);
  writeFileSync(
    fixtureAbs,
    "if (process.argv[1]?.endsWith('/fixture-hook.mjs')) process.stdout.write('RAN:' + (process.argv[2] ?? ''));\n"
  );
  try {
    const cmd = hookBootstrapCommand(fixtureRel, 'PHASE');
    const program = cmd.slice(cmd.indexOf('"') + 1, cmd.lastIndexOf('"'));
    const out = execFileSync('node', ['-e', program], { cwd: process.cwd(), encoding: 'utf8' });
    assert.equal(out, 'RAN:PHASE');
  } finally {
    rmSync(fixtureAbs, { force: true });
  }
});
