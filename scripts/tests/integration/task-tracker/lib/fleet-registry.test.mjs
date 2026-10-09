#!/usr/bin/env node
// @story #309
import { strict as assert } from 'node:assert';
import { existsSync, rmSync } from 'node:fs';
import { createCommittedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);
import path from 'node:path';
import {
  fleetRegistryPath,
  readFleet,
  writeFleet,
  registerTask,
  deregisterTask,
  setTaskStatus,
} from '../../../../task-tracker/fleet-registry.mjs';

const tmp = await createCommittedRuntimeRootFixture('tt-fleet-');

try {
  const preferred = fleetRegistryPath(tmp);

  // #573: the fleet registry is main-anchored under `.tmp/aitm/fleet/`. Hard
  // cut — no legacy `.claude`/SHARED_DIR read-fallback.
  assert.equal(
    preferred,
    path.join(tmp, '.ai-task-manager', 'runtime', 'store', 'fleet', 'task-fleet.json')
  );

  writeFleet(preferred, {
    '#2': {
      status: 'active',
      worktreePath: tmp,
      branch: 'trunk',
      startedAt: '2026-06-17T11:59:00Z',
    },
  });
  assert.ok(existsSync(preferred), 'fleet should write to preferred path');
  let fleet = readFleet(preferred);
  assert.equal(fleet['#2'].status, 'active');

  registerTask(tmp, '#3', '/tmp/worktree', '3-test');
  fleet = readFleet(preferred);
  assert.equal(fleet['#3'].branch, '3-test');
  assert.equal(fleet['#3'].status, 'active');

  setTaskStatus(tmp, '#3', 'paused');
  fleet = readFleet(preferred);
  assert.equal(fleet['#3'].status, 'paused');

  deregisterTask(tmp, '#3');
  fleet = readFleet(preferred);
  assert.equal(fleet['#3'], undefined);

  console.log('fleet-registry.test.mjs: all passed');
} finally {
  rmSync(tmp, { recursive: true });
}
