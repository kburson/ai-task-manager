#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measure, BUDGETS } from '../measure-context.mjs';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dir, '..', 'measure-context.mjs');

// Programmatic API: budgets respected for each mode (Epic #114 ACs).
const idle = measure({ mode: 'idle' });
assert.equal(idle.status, 'OK', `idle ${idle.total} exceeded ${BUDGETS.idle}`);
assert.ok(idle.total <= BUDGETS.idle);

const invokedClaude = measure({ mode: 'invoked', adapter: 'claude' });
assert.equal(
  invokedClaude.status,
  'OK',
  `invoked(claude) ${invokedClaude.total} exceeded ${BUDGETS.invoked}`
);

const invokedCodex = measure({ mode: 'invoked', adapter: 'codex' });
assert.equal(
  invokedCodex.status,
  'OK',
  `invoked(codex) ${invokedCodex.total} exceeded ${BUDGETS.invoked}`
);

const active = measure({ mode: 'active' });
assert.equal(active.status, 'OK', `active ${active.total} exceeded ${BUDGETS.active}`);

// CLI: --all exits 0 when all budgets pass and emits one section per mode.
const r = await pexec('node', [SCRIPT, '--all']);
assert.match(r.stdout, /idle:/);
assert.match(r.stdout, /invoked/);
assert.match(r.stdout, /active/);
assert.doesNotMatch(r.stdout, /\[OVER\]/);

// CLI: --json emits parseable JSON array.
const j = await pexec('node', [SCRIPT, '--all', '--json']);
const parsed = JSON.parse(j.stdout);
assert.equal(parsed.length, 3);
assert.ok(parsed.every((p) => typeof p.total === 'number' && p.status));

// CLI: --idle alone returns just one section.
const i = await pexec('node', [SCRIPT, '--idle']);
assert.match(i.stdout, /idle:/);
assert.doesNotMatch(i.stdout, /invoked/);

console.log('measure-context.test.mjs OK');
