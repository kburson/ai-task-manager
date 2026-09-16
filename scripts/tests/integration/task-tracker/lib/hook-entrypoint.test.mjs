// @story #869 #1631
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
  entrypointCandidates,
  hookBootstrapCommand,
  guardBootstrapCommand,
  failClosedHookBootstrapCommand,
} from '../../../../task-tracker/lib/guard-entrypoint.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

test('entrypointCandidates: scoped package first, repo-relative second', () => {
  assert.deepEqual(entrypointCandidates('scripts/task-tracker/hooks/memory-index.mjs'), [
    'node_modules/@kburson/ai-task-manager/scripts/task-tracker/hooks/memory-index.mjs',
    'scripts/task-tracker/hooks/memory-index.mjs',
  ]);
});

test('hookBootstrapCommand embeds both candidates, scoped package first', () => {
  const cmd = hookBootstrapCommand('scripts/task-tracker/hooks/on-stop.mjs');
  const scoped = cmd.indexOf(
    'node_modules/@kburson/ai-task-manager/scripts/task-tracker/hooks/on-stop.mjs'
  );
  const repo = cmd.indexOf('\\"scripts/task-tracker/hooks/on-stop.mjs\\"');
  assert.ok(scoped !== -1 && repo !== -1 && scoped < repo);
  assert.doesNotMatch(cmd, /node_modules\/ai-task-manager\//);
});

test('hookBootstrapCommand normalizes process.argv so isMain + argv[2] work', () => {
  const cmd = hookBootstrapCommand('scripts/task-tracker/hooks/on-ask.mjs', 'pause');
  // argv is rewritten to [argv0, resolvedPath, ...extraArgs] before import
  assert.match(cmd, /process\.argv\s*=\s*\[process\.argv\[0\],\s*p/);
  assert.ok(cmd.includes('\\"pause\\"'), 'extra arg is embedded and shell-quoted');
  assert.match(cmd, /import\(pathToFileURL\(p\)\.href\)/);
});

test('hookBootstrapCommand fails OPEN (exit 0) when neither candidate resolves', () => {
  const cmd = hookBootstrapCommand('scripts/task-tracker/hooks/on-stop.mjs');
  assert.match(cmd, /process\.exit\(0\)/);
  assert.doesNotMatch(cmd, /process\.exit\(2\)/, 'hooks are non-security; do not fail closed');
});

test('end-to-end: shim actually runs a module main-block that gates on argv[1]', () => {
  const relDir = mkdtempSync(path.join(projectScratchDir('test'), 'shell-bootstrap-'));
  const fixtureRel = path.join(relDir, 'fixture-hook.mjs');
  const fixtureAbs = path.resolve(fixtureRel);
  writeFileSync(
    fixtureAbs,
    "if (process.argv[1]?.endsWith('/fixture-hook.mjs')) process.stdout.write('RAN:' + (process.argv[2] ?? ''));\n"
  );
  try {
    const phase =
      'PHASE "quoted" \'single\' $HOME $(printf INJECTED) `printf INJECTED` \\slash\nnext';
    for (const build of [hookBootstrapCommand, failClosedHookBootstrapCommand]) {
      const cmd = build(path.relative(process.cwd(), fixtureRel), phase);
      const out = execFileSync('/bin/sh', ['-c', cmd], { cwd: process.cwd(), encoding: 'utf8' });
      assert.equal(out, `RAN:${phase}`);
    }
  } finally {
    rmSync(relDir, { recursive: true, force: true });
  }
});

test('shell dispatch preserves missing-entrypoint exit codes and Grok denial JSON', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'missing-bootstrap-'));
  try {
    for (const [command, status, diagnostic, grok] of [
      [hookBootstrapCommand('scripts/task-tracker/hooks/on-stop.mjs'), 0, 'skipping', false],
      [guardBootstrapCommand('bash-guard'), 2, 'failing closed', false],
      [
        failClosedHookBootstrapCommand(
          'scripts/task-tracker/hooks/grok-wire.mjs',
          '--handler',
          'bash-guard'
        ),
        2,
        'failing closed',
        true,
      ],
    ]) {
      const result = spawnSync('/bin/sh', ['-c', command], { cwd: dir, encoding: 'utf8' });
      assert.equal(result.status, status, result.stderr);
      assert.match(result.stderr, new RegExp(`entrypoint unresolved.*${diagnostic}\\n$`));
      if (grok)
        assert.deepEqual(JSON.parse(result.stdout), {
          decision: 'deny',
          reason: 'AITM Grok hook entrypoint is unavailable: grok-wire.mjs',
        });
      else assert.equal(result.stdout, '');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('shell guard chooses scoped bytes first and falls back to source bytes', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'guard-bootstrap-'));
  try {
    const repoPath = path.join(dir, 'scripts/task-tracker/bash-guard.mjs');
    const scopedPath = path.join(
      dir,
      'node_modules/@kburson/ai-task-manager/scripts/task-tracker/bash-guard.mjs'
    );
    for (const [file, marker] of [
      [repoPath, 'source'],
      [scopedPath, 'scoped'],
    ]) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, `process.stdout.write('${marker}'); process.exit(2);`);
    }
    for (const marker of ['scoped', 'source']) {
      const result = spawnSync('/bin/sh', ['-c', guardBootstrapCommand('bash-guard')], {
        cwd: dir,
        encoding: 'utf8',
      });
      assert.equal(result.status, 2, result.stderr);
      assert.equal(result.stdout, marker);
      if (marker === 'scoped') rmSync(scopedPath);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
