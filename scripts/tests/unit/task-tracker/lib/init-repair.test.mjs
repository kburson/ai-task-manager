#!/usr/bin/env node
// @story #28
// Tests for scripts/gh/init-repair.mjs
//   - fills empty kanbanOption* keys via case-insensitive name match
//   - never overwrites populated keys
//   - reports unmatched options (column missing on Status field)
//   - static parse: init-project-config.sh CANONICAL_STATUS_PALETTE has 8 entries in expected order

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const REPAIR = path.resolve(__dir, '../../../gh/init-repair.mjs');
const INIT_SH = path.resolve(__dir, '../../../gh/init-project-config.sh');

function makeSandbox(cfg) {
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-repair-'));
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
  kanbanOptionRefine: '',
  kanbanOptionReadyForPlan: '',
  kanbanOptionPlan: '',
  kanbanOptionDevelop: '',
  kanbanOptionTest: '',
  kanbanOptionReview: '',
  kanbanOptionDone: '',
};

const FULL_OPTS = [
  { id: 'OP_b', name: 'Backlog' },
  { id: 'OP_g', name: 'Refine' },
  { id: 'OP_r4p', name: 'Ready for Planning' },
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
  assert.match(r.stdout, /Filled:.*kanbanOptionRefine/);
  const cfg = readCfg(sandbox);
  assert.equal(cfg.kanbanOptionBacklog, 'OP_b');
  assert.equal(cfg.kanbanOptionRefine, 'OP_g');
  assert.equal(cfg.kanbanOptionReadyForPlan, 'OP_r4p');
  assert.equal(cfg.kanbanOptionPlan, 'OP_a');
  assert.equal(cfg.kanbanOptionDevelop, 'OP_d');
  assert.equal(cfg.kanbanOptionTest, 'OP_v');
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
    kanbanOptionRefine: 'EXISTING_G',
    kanbanOptionReadyForPlan: 'EXISTING_R4P',
    kanbanOptionPlan: 'EXISTING_A',
    kanbanOptionDevelop: 'EXISTING_D',
    kanbanOptionTest: '',
    kanbanOptionReview: 'EXISTING_R',
    kanbanOptionDone: 'EXISTING_DONE',
  });
  await runRepair(sandbox, [
    { id: 'NEW_B', name: 'Backlog' },
    { id: 'OP_v', name: 'Test' },
  ]);
  const cfg = readCfg(sandbox);
  assert.equal(cfg.kanbanOptionBacklog, 'EXISTING_B', 'must not overwrite populated keys');
  assert.equal(cfg.kanbanOptionRefine, 'EXISTING_G');
  assert.equal(cfg.kanbanOptionDone, 'EXISTING_DONE');
  assert.equal(cfg.kanbanOptionTest, 'OP_v', 'must fill empty key');
  rmSync(sandbox, { recursive: true });
}

// Test 3: unmatched columns reported, config not corrupted
{
  const sandbox = makeSandbox(EMPTY_CFG);
  // Missing Validate column
  const opts = FULL_OPTS.filter((o) => o.name !== 'Test');
  const r = await runRepair(sandbox, opts);
  assert.match(r.stdout, /Unmatched.*kanbanOptionTest/);
  const cfg = readCfg(sandbox);
  assert.equal(cfg.kanbanOptionTest, '', 'unmatched key stays empty');
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
    kanbanOptionRefine: 'OP_g',
    kanbanOptionReadyForPlan: 'OP_r4p',
    kanbanOptionPlan: 'OP_a',
    kanbanOptionDevelop: 'OP_d',
    kanbanOptionTest: 'OP_v',
    kanbanOptionReview: 'OP_r',
    kanbanOptionDone: 'OP_done',
  });
  const r = await runRepair(sandbox, []);
  assert.match(r.stdout, /Nothing to repair/i);
  rmSync(sandbox, { recursive: true });
}

// Test 5: static parse — init-project-config.sh canonical Status palette has the
// 8 columns in order. (#415 renamed the former `status_opts` literal to the
// single CANONICAL_STATUS_PALETTE source of truth; #1211 places Ready for Planning
// between Refine and Plan. Name+color coverage lives in
// init-status-palette.test.mjs.)
// Legacy config keys are rewritten in place without changing the option id.
{
  const sandbox = makeSandbox({
    repo: 'o/r',
    projectId: 'PVT_x',
    kanbanFieldId: 'PVTSSF_status',
    kanbanOptionBacklog: 'OP_b',
    kanbanOptionOnDeck: 'OP_assigned',
    kanbanOptionRefine: 'OP_g',
    kanbanOptionPlan: 'OP_a',
    kanbanOptionDevelop: 'OP_d',
    kanbanOptionTest: 'OP_v',
    kanbanOptionReview: 'OP_r',
    kanbanOptionDone: 'OP_done',
  });
  const result = await runRepair(sandbox, []);
  const cfg = readCfg(sandbox);
  assert.equal(cfg.kanbanOptionReadyForPlan, 'OP_assigned');
  assert.ok(!('kanbanOptionOnDeck' in cfg));
  assert.match(result.stdout, /Migrated: legacy Assigned\/On Deck.*kanbanOptionReadyForPlan/);
  rmSync(sandbox, { recursive: true });
}

// Conflicting legacy/canonical ids are never silently resolved.
{
  const sandbox = makeSandbox({
    ...EMPTY_CFG,
    kanbanOptionOnDeck: 'OP_legacy',
    kanbanOptionReadyForPlan: 'OP_canonical',
  });
  await assert.rejects(() => runRepair(sandbox, []), /conflict.*refusing repair/i);
  rmSync(sandbox, { recursive: true });
}

{
  const sh = readFileSync(INIT_SH, 'utf8');
  const m = sh.match(/CANONICAL_STATUS_PALETTE='(\[[\s\S]*?\])'/);
  assert.ok(m, 'should find CANONICAL_STATUS_PALETTE assignment in init-project-config.sh');
  const arr = JSON.parse(m[1]);
  assert.equal(arr.length, 8, `canonical palette must have 8 entries, got ${arr.length}`);
  const names = arr.map((o) => o.name);
  assert.deepEqual(
    names,
    ['Backlog', 'Refine', 'Ready for Planning', 'Plan', 'Develop', 'Test', 'Review', 'Done'],
    'canonical palette names must be in canonical order'
  );
}

console.log('init-repair.test.mjs: all passed');
