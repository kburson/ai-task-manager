#!/usr/bin/env node
// Tests for scripts/gh/init-repair.mjs
//   - fills empty kanbanOption* keys via case-insensitive name match
//   - never overwrites populated keys
//   - reports unmatched options (column missing on Status field)
//   - static parse: init-project-config.sh status_opts has 7 entries in expected order

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
  return JSON.parse(
    readFileSync(path.join(sandbox, '.ai-task-manager', 'task-tracker.json'), 'utf8')
  );
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

const EMPTY_CFG = {
  repo: 'o/r',
  projectId: 'PVT_x',
  kanbanFieldId: 'PVTSSF_status',
  kanbanOptionBacklog: '',
  kanbanOptionGroom: '',
  kanbanOptionAnalyze: '',
  kanbanOptionDevelopment: '',
  kanbanOptionValidate: '',
  kanbanOptionReview: '',
  kanbanOptionDone: '',
};

const FULL_OPTS = [
  { id: 'OP_b', name: 'Backlog' },
  { id: 'OP_g', name: 'Refine' },
  { id: 'OP_a', name: 'Plan' },
  { id: 'OP_d', name: 'Develop' },
  { id: 'OP_v', name: 'Test' },
  { id: 'OP_r', name: 'Review' },
  { id: 'OP_done', name: 'Done' },
];

// Test 1: backfills all empty kanbanOption* by name match (case-insensitive)
{
  const sandbox = makeSandbox(EMPTY_CFG);
  const r = await runRepair(sandbox, FULL_OPTS);
  assert.match(r.stdout, /Filled:.*kanbanOptionGroom/);
  const cfg = readCfg(sandbox);
  assert.equal(cfg.kanbanOptionBacklog, 'OP_b');
  assert.equal(cfg.kanbanOptionGroom, 'OP_g');
  assert.equal(cfg.kanbanOptionAnalyze, 'OP_a');
  assert.equal(cfg.kanbanOptionDevelopment, 'OP_d');
  assert.equal(cfg.kanbanOptionValidate, 'OP_v');
  assert.equal(cfg.kanbanOptionReview, 'OP_r');
  assert.equal(cfg.kanbanOptionDone, 'OP_done');
  rmSync(sandbox, { recursive: true });
}

// Test 2: never overwrites populated keys
{
  const sandbox = makeSandbox({
    repo: 'o/r',
    projectId: 'PVT_x',
    kanbanFieldId: 'PVTSSF_status',
    kanbanOptionBacklog: 'EXISTING_B',
    kanbanOptionGroom: 'EXISTING_G',
    kanbanOptionAnalyze: 'EXISTING_A',
    kanbanOptionDevelopment: 'EXISTING_D',
    kanbanOptionValidate: '',
    kanbanOptionReview: 'EXISTING_R',
    kanbanOptionDone: 'EXISTING_DONE',
  });
  await runRepair(sandbox, [
    { id: 'NEW_B', name: 'Backlog' },
    { id: 'OP_v', name: 'Test' },
  ]);
  const cfg = readCfg(sandbox);
  assert.equal(cfg.kanbanOptionBacklog, 'EXISTING_B', 'must not overwrite populated keys');
  assert.equal(cfg.kanbanOptionGroom, 'EXISTING_G');
  assert.equal(cfg.kanbanOptionDone, 'EXISTING_DONE');
  assert.equal(cfg.kanbanOptionValidate, 'OP_v', 'must fill empty key');
  rmSync(sandbox, { recursive: true });
}

// Test 3: unmatched columns reported, config not corrupted
{
  const sandbox = makeSandbox(EMPTY_CFG);
  // Missing Validate column
  const opts = FULL_OPTS.filter((o) => o.name !== 'Test');
  const r = await runRepair(sandbox, opts);
  assert.match(r.stdout, /Unmatched.*kanbanOptionValidate/);
  const cfg = readCfg(sandbox);
  assert.equal(cfg.kanbanOptionValidate, '', 'unmatched key stays empty');
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
    kanbanOptionGroom: 'OP_g',
    kanbanOptionAnalyze: 'OP_a',
    kanbanOptionDevelopment: 'OP_d',
    kanbanOptionValidate: 'OP_v',
    kanbanOptionReview: 'OP_r',
    kanbanOptionDone: 'OP_done',
  });
  const r = await runRepair(sandbox, []);
  assert.match(r.stdout, /Nothing to repair/i);
  rmSync(sandbox, { recursive: true });
}

// Test 5: static parse — init-project-config.sh status_opts contains 7 columns in order
{
  const sh = readFileSync(INIT_SH, 'utf8');
  const m = sh.match(/status_opts='(\[[\s\S]*?\])'/);
  assert.ok(m, 'should find status_opts assignment in init-project-config.sh');
  const arr = JSON.parse(m[1]);
  assert.equal(arr.length, 7, `status_opts must have 7 entries, got ${arr.length}`);
  const names = arr.map((o) => o.name);
  assert.deepEqual(
    names,
    ['Backlog', 'Refine', 'Plan', 'Develop', 'Test', 'Review', 'Done'],
    'status_opts names must be in canonical order'
  );
}

console.log('init-repair.test.mjs: all passed');
