#!/usr/bin/env node
// @story #541
// Inherited flags alone never prove protected ownership. Both a scrubbed
// environment and an unproven inherited flag must observe real contention.

// @story #1857
// This integration fixture supplies its own actor.
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);

import { strict as assert } from 'node:assert';
import { createActivatedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  projectScratchDir,
  mkdtempProjectIsolated,
} from '../../../../task-tracker/lib/scratch-dir.mjs';
import { withIssueLock } from '../../../../task-tracker/issue-mutator-lock.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
// #764 — move-state.mjs is import-only; spawn the test-only CLI harness instead.
const MOVE_STATE = path.resolve(__dir, '../../helpers/move-state-cli.mjs');
const REPO_ROOT = path.resolve(__dir, '../../../..');

async function setupProjectDir() {
  const dir = await createActivatedRuntimeRootFixture('tt-leak-');
  const cfgDir = path.join(dir, '.ai-task-manager');
  mkdirSync(cfgDir, { recursive: true });
  writeFileSync(
    path.join(cfgDir, 'task-tracker.json'),
    readFileSync(path.join(REPO_ROOT, '.ai-task-manager/task-tracker.json'), 'utf8'),
    'utf8'
  );
  return dir;
}

// Spawn move-state with the ambient env. `scrub` mirrors the production sandbox
// boundary (and the contention-test helpers): delete the leaked flag before the
// child inherits it.
function runMoveState(projDir, issue, { scrub }) {
  const env = { ...process.env, AITM_ISSUE_LOCK_HELD: '1' };
  delete env.AITM_ISSUE_LOCK_PROOF;
  if (scrub) delete env.AITM_ISSUE_LOCK_HELD;
  env.AI_TASK_MANAGER_PROJECT_DIR = projDir;
  env.AITM_VERB_CONTEXT = 'move-state';
  env.TT_SKIP_NETWORK = '1';
  return spawnSync(process.execPath, [MOVE_STATE, String(issue), 'refine'], {
    env,
    encoding: 'utf8',
    cwd: projDir,
  });
}

for (const scrub of [true, false]) {
  test(`AC2: real protected contention survives ${scrub ? 'scrubbed' : 'unproven inherited'} flag`, async () => {
    const projDir = await setupProjectDir();
    const issue = scrub ? 27182 : 16180;
    try {
      await withIssueLock({ issue, projDir }, async () => {
        const res = runMoveState(projDir, issue, { scrub });
        assert.notEqual(res.status, 0, `expected contention, got ${res.status}\n${res.stderr}`);
        assert.match(res.stderr, new RegExp(`issue ${issue} locked by session `));
      });
    } finally {
      rmSync(projDir, { recursive: true, force: true });
    }
  });
}
