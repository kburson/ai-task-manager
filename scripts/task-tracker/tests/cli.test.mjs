#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const pexec = promisify(execFile);

const __dir = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dir, '..', 'task-tracker.mjs');

const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-cli-'));
mkdirSync(path.join(sandbox, '.claude'), { recursive: true });
const env = { ...process.env, CLAUDE_PROJECT_DIR: sandbox, TT_SKIP_NETWORK: '1' };

// Test 1: status with no active → "no active task"
let r = await pexec('node', [CLI, 'status'], { env });
assert.match(r.stdout, /no active task/i);

// Test 2: config lists defaults
r = await pexec('node', [CLI, 'config'], { env });
assert.match(r.stdout, /wpm/);
assert.match(r.stdout, /180/);

// Test 3: config set then read
await pexec('node', [CLI, 'config', 'wpm', '175'], { env });
r = await pexec('node', [CLI, 'config'], { env });
assert.match(r.stdout, /wpm.*175/);

// Test 4: end with nothing active is a no-op
r = await pexec('node', [CLI, 'end'], { env });
assert.match(r.stdout, /no active task/i);

// Test 5: /task #107 starts a task (network skipped)
let r5 = await pexec('node', [CLI, '#107'], { env });
assert.match(r5.stdout, /Active: #107/);

// Test 6: /task status reflects active
r5 = await pexec('node', [CLI, 'status'], { env });
assert.match(r5.stdout, /Active: #107/);

// Test 7: /task pause flushes and sets lastActive
r5 = await pexec('node', [CLI, 'pause'], { env });
assert.match(r5.stdout, /Paused #107/);

r5 = await pexec('node', [CLI, 'status'], { env });
assert.match(r5.stdout, /Last active: #107/);

// Test 8: /task start resumes
r5 = await pexec('node', [CLI, 'start'], { env });
assert.match(r5.stdout, /Resumed #107/);

// Test 9: /task #108 auto-ends #107
r5 = await pexec('node', [CLI, '#108'], { env });
assert.match(r5.stdout, /Active: #108/);
assert.match(r5.stdout, /Previous: #107/);

// Test 10: /task plan starts planning bucket
r5 = await pexec('node', [CLI, 'plan'], { env });
assert.match(r5.stdout, /planning bucket/i);

r5 = await pexec('node', [CLI, 'status'], { env });
assert.match(r5.stdout, /planning bucket/i);

// Test 11: /task new "Title" with network skip just clears bucket
const envNew = { ...env, TT_FAKE_NEW_ISSUE: '#999' };
r5 = await pexec('node', [CLI, 'new', 'Fake Title'], { env: envNew });
assert.match(r5.stdout, /Active: #999/);

rmSync(sandbox, { recursive: true });
console.log('cli.test.mjs: status/config/end passed');
