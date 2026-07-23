#!/usr/bin/env node
// @story #464
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const ROOT = path.resolve(__dir, '..', '..', '..', '..');
const CLI = path.join(ROOT, 'bin', 'cli.mjs');

const target = mkdtempSync(path.join(projectScratchDir('test'), 'install-claude-cmd-test-'));
try {
  await pexec('node', [CLI, 'install', '--target', target]);
  const stub = readFileSync(path.join(target, '.claude', 'commands', 'task.md'), 'utf8');
  assert.match(
    stub,
    /State Transition Verb Map \(8-state model\)/,
    'Claude task.md stub must name the 8-state model'
  );
  assert.match(
    stub,
    /Backlog → On Deck → Refine → Plan → Develop → Test → Review → Done/,
    'Claude task.md stub must include On Deck in the state chain'
  );
  assert.match(stub, /\/task plan #N/, 'Claude task.md stub must name the plan verb');
  assert.match(stub, /\/task test #N/, 'Claude task.md stub must name the test verb');
  console.log('install-claude-command.test.mjs: all assertions passed');
} finally {
  rmSync(target, { recursive: true, force: true });
}
