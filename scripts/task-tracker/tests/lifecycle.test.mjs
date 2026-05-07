#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dir, '..', 'task-tracker.mjs');

const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-lifecycle-'));
mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
writeFileSync(
  path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
  JSON.stringify({ repo: 'test-owner/test-repo' }, null, 2)
);
const env = { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: sandbox, TT_SKIP_NETWORK: '1' };

let r = await pexec('node', [CLI, '#321'], { env });
assert.match(r.stdout, /Active: #321/);

r = await pexec('node', [CLI, 'review', '#321'], { env });
assert.match(r.stdout, /Review #321/);
assert.match(r.stdout, /paused/i);

let state = JSON.parse(readFileSync(path.join(sandbox, '.ai-task-manager', 'task-tracker-state.json'), 'utf8'));
assert.equal(state.active, null);
assert.equal(state.lastActive, '#321');

r = await pexec('node', [CLI, 'close', '#321'], { env });
assert.match(r.stdout, /Closed #321/);

r = await pexec('node', [CLI, 'help'], { env });
assert.match(r.stdout, /\/task review #N/);
assert.match(r.stdout, /\/task close \[#N\]/);

rmSync(sandbox, { recursive: true });
console.log('lifecycle.test.mjs: all passed');
