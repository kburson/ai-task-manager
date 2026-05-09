#!/usr/bin/env node
// Tests for scripts/gh/init-repair.mjs
//   - fills empty kanbanOption* keys via case-insensitive name match
//   - never overwrites populated keys
//   - reports unmatched options (column missing on Status field)
//   - static parse: init-project-config.sh status_opts has 6 entries in expected order

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPAIR = path.resolve(__dir, '../../gh/init-repair.mjs');
const INIT_SH = path.resolve(__dir, '../../gh/init-project-config.sh');

function makeSandbox(cfg) {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-repair-'));
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify(cfg, null, 2) + '\n'
  );
  return sandbox;
}

function readCfg(sandbox) {
  return JSON.parse(readFileSync(path.join(sandbox, '.ai-task-manager', 'task-tracker.json'), 'utf8'));
}

async function runRepair(sandbox, fakeOptions) {
  return pexec('node', [REPAIR], {
    env: {
      ...process.env,
      AI_TASK_MANAGER_PROJECT_DIR: sandbox,
      TT_SKIP_NETWORK: '1',
      TT_REPAIR_FAKE_OPTIONS: JSON.stringify(fakeOptions),
    },
  });
}

// Test 1: backfills all empty kanbanOption* by name match (case-insensitive)
{
  const sandbox = makeSandbox({
    repo: 'o/r',
    projectId: 'PVT_x',
    kanbanFieldId: 'PVTSSF_status',
    kanbanOptionBacklog: '',
    kanbanOptionReady: '',
    kanbanOptionInProgress: '',
    kanbanOptionInReview: '',
    kanbanOptionR4R: '',
    kanbanOptionDone: '',
  });
  const opts = [
    { id: 'OP_b',  name: 'Backlog' },
    { id: 'OP_r',  name: 'Ready' },
    { id: 'OP_ip', name: 'In Progress' },
    { id: 'OP_ir', name: 'In Review' },
    { id: 'OP_r4', name: 'R4R' },
    { id: 'OP_d',  name: 'Done' },
  ];
  const r = await runRepair(sandbox, opts);
  assert.match(r.stdout, /Filled:.*kanbanOptionR4R/);
  const cfg = readCfg(sandbox);
  assert.equal(cfg.kanbanOptionBacklog, 'OP_b');
  assert.equal(cfg.kanbanOptionReady, 'OP_r');
  assert.equal(cfg.kanbanOptionInProgress, 'OP_ip');
  assert.equal(cfg.kanbanOptionInReview, 'OP_ir');
  assert.equal(cfg.kanbanOptionR4R, 'OP_r4');
  assert.equal(cfg.kanbanOptionDone, 'OP_d');
  rmSync(sandbox, { recursive: true });
}

// Test 2: never overwrites populated keys
{
  const sandbox = makeSandbox({
    repo: 'o/r',
    projectId: 'PVT_x',
    kanbanFieldId: 'PVTSSF_status',
    kanbanOptionBacklog: 'EXISTING_B',
    kanbanOptionReady: 'EXISTING_R',
    kanbanOptionInProgress: 'EXISTING_IP',
    kanbanOptionInReview: 'EXISTING_IR',
    kanbanOptionR4R: '',
    kanbanOptionDone: 'EXISTING_D',
  });
  const opts = [
    { id: 'NEW_B',  name: 'Backlog' },
    { id: 'NEW_R',  name: 'Ready' },
    { id: 'OP_r4',  name: 'R4R' },
  ];
  await runRepair(sandbox, opts);
  const cfg = readCfg(sandbox);
  assert.equal(cfg.kanbanOptionBacklog, 'EXISTING_B', 'must not overwrite populated keys');
  assert.equal(cfg.kanbanOptionReady, 'EXISTING_R');
  assert.equal(cfg.kanbanOptionDone, 'EXISTING_D');
  assert.equal(cfg.kanbanOptionR4R, 'OP_r4', 'must fill empty key');
  rmSync(sandbox, { recursive: true });
}

// Test 3: unmatched columns reported, config not corrupted
{
  const sandbox = makeSandbox({
    repo: 'o/r',
    projectId: 'PVT_x',
    kanbanFieldId: 'PVTSSF_status',
    kanbanOptionBacklog: '',
    kanbanOptionReady: '',
    kanbanOptionInProgress: '',
    kanbanOptionInReview: '',
    kanbanOptionR4R: '',
    kanbanOptionDone: '',
  });
  // Missing R4R column
  const opts = [
    { id: 'OP_b',  name: 'Backlog' },
    { id: 'OP_r',  name: 'Ready' },
    { id: 'OP_ip', name: 'In Progress' },
    { id: 'OP_ir', name: 'In Review' },
    { id: 'OP_d',  name: 'Done' },
  ];
  const r = await runRepair(sandbox, opts);
  assert.match(r.stdout, /Unmatched.*kanbanOptionR4R/);
  const cfg = readCfg(sandbox);
  assert.equal(cfg.kanbanOptionR4R, '', 'unmatched key stays empty');
  assert.equal(cfg.kanbanOptionBacklog, 'OP_b');
  rmSync(sandbox, { recursive: true });
}

// Test 4: idempotent — second run reports nothing to repair
{
  const sandbox = makeSandbox({
    repo: 'o/r',
    projectId: 'PVT_x',
    kanbanFieldId: 'PVTSSF_status',
    kanbanOptionBacklog: 'OP_b',
    kanbanOptionReady: 'OP_r',
    kanbanOptionInProgress: 'OP_ip',
    kanbanOptionInReview: 'OP_ir',
    kanbanOptionR4R: 'OP_r4',
    kanbanOptionDone: 'OP_d',
  });
  const r = await runRepair(sandbox, []);
  assert.match(r.stdout, /Nothing to repair/i);
  rmSync(sandbox, { recursive: true });
}

// Test 5: static parse — init-project-config.sh status_opts contains 6 columns in order
{
  const sh = readFileSync(INIT_SH, 'utf8');
  const m = sh.match(/status_opts='(\[[\s\S]*?\])'/);
  assert.ok(m, 'should find status_opts assignment in init-project-config.sh');
  const arr = JSON.parse(m[1]);
  assert.equal(arr.length, 6, `status_opts must have 6 entries, got ${arr.length}`);
  const names = arr.map(o => o.name);
  assert.deepEqual(names, ['Backlog', 'Ready', 'In Progress', 'In Review', 'R4R', 'Done'],
    'status_opts names must be in canonical order');
}

console.log('init-repair.test.mjs: all passed');
