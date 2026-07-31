// @story #869
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { entrypointCandidates, hookBootstrapCommand } from '../../../lib/guard-entrypoint.mjs';

test('entrypointCandidates: node_modules first, repo-relative second', () => {
  assert.deepEqual(entrypointCandidates('scripts/task-tracker/hooks/memory-index.mjs'), [
    'node_modules/ai-task-manager/scripts/task-tracker/hooks/memory-index.mjs',
    'scripts/task-tracker/hooks/memory-index.mjs',
  ]);
});

test('hookBootstrapCommand embeds both candidates, node_modules first', () => {
  const cmd = hookBootstrapCommand('scripts/task-tracker/hooks/on-stop.mjs');
  const nm = cmd.indexOf('node_modules/ai-task-manager/scripts/task-tracker/hooks/on-stop.mjs');
  const repo = cmd.indexOf('\\"scripts/task-tracker/hooks/on-stop.mjs\\"');
  assert.ok(nm !== -1 && repo !== -1 && nm < repo);
});

test('hookBootstrapCommand normalizes process.argv so isMain + argv[2] work', () => {
  const cmd = hookBootstrapCommand('scripts/task-tracker/hooks/on-ask.mjs', 'pause');
  // argv is rewritten to [argv0, resolvedPath, ...extraArgs] before import
  assert.match(cmd, /process\.argv\s*=\s*\[process\.argv\[0\],\s*p/);
  assert.match(cmd, /\\"pause\\"/, 'extra arg is embedded');
  assert.match(cmd, /import\(pathToFileURL\(p\)\.href\)/);
});

test('hookBootstrapCommand fails OPEN (exit 0) when neither candidate resolves', () => {
  const cmd = hookBootstrapCommand('scripts/task-tracker/hooks/on-stop.mjs');
  assert.match(cmd, /process\.exit\(0\)/);
  assert.doesNotMatch(cmd, /process\.exit\(2\)/, 'hooks are non-security; do not fail closed');
});

test('end-to-end: shim actually runs a module main-block that gates on argv[1]', () => {
  // Hook command strings cross a real shell boundary in both Claude and Codex.
  // Prove candidate quotes survive that boundary and argv normalization still
  // makes an isMain-gated module execute.
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
    const out = execFileSync('/bin/sh', ['-c', cmd], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    assert.equal(out, 'RAN:PHASE');
  } finally {
    rmSync(fixtureAbs, { force: true });
  }
});

test('tracked Claude and Codex PostToolUse Bash hooks execute through a real shell', () => {
  const payload = JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command: 'echo post-tool-use-probe' },
    tool_response: {},
  });
  for (const relativePath of ['.claude/settings.json', '.codex/hooks.json']) {
    const config = JSON.parse(readFileSync(path.resolve(relativePath), 'utf8'));
    const entry = config.hooks.PostToolUse.find((candidate) => candidate.matcher === 'Bash');
    const command = entry?.hooks?.[0]?.command;
    assert.equal(typeof command, 'string', relativePath);
    const result = spawnSync(command, {
      cwd: process.cwd(),
      shell: true,
      input: payload,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `${relativePath}: ${result.stderr}`);
    assert.doesNotMatch(result.stderr, /ReferenceError/, relativePath);
  }
});
