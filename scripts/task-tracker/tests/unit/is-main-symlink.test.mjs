#!/usr/bin/env node
// @story #478
// Regression: the CLI must run when invoked through a symlinked path (notably
// `node_modules/ai-task-manager -> ..`). Before #478 the `_isMain` guard
// compared the realpath-resolved `import.meta.url` against the non-realpath
// `path.resolve(process.argv[1])`; a symlinked invocation made the two differ,
// the guard returned false, and the entire CLI silently no-op'd with exit 0.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dir, '..', '..', 'task-tracker.mjs');

test('CLI runs through a symlinked invocation path (no silent exit-0 no-op)', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tt-symlink-'));
  const link = path.join(dir, 'task-tracker.mjs');
  symlinkSync(CLI, link);

  // `help` is INIT_EXEMPT — needs no config or network.
  const viaLink = await pexec('node', [link, 'help']);
  const viaReal = await pexec('node', [CLI, 'help']);

  assert.notEqual(
    viaLink.stdout.trim(),
    '',
    'symlinked invocation produced no output (silent no-op)'
  );
  assert.match(viaLink.stdout, /Task Tracker/);
  assert.equal(
    viaLink.stdout,
    viaReal.stdout,
    'symlinked and real invocation must behave identically'
  );
});
