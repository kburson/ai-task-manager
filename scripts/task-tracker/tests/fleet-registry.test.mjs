#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  fleetRegistryPath,
  readFleet,
  writeFleet,
  registerTask,
  deregisterTask,
  setTaskStatus,
} from '../fleet-registry.mjs';

const tmp = mkdtempSync(path.join(tmpdir(), 'tt-fleet-'));

try {
  const preferred = fleetRegistryPath(tmp);
  const legacy = path.join(tmp, '.claude', 'task-fleet.json');

  assert.equal(preferred, path.join(tmp, '.ai-task-manager', 'task-fleet.json'));

  mkdirSync(path.dirname(legacy), { recursive: true });
  writeFileSync(legacy, JSON.stringify({ '#1': { status: 'active' } }), { flag: 'w' });
  let fleet = readFleet(preferred);
  assert.equal(fleet['#1'].status, 'active', 'preferred path should read legacy fleet fallback');

  writeFleet(preferred, { '#2': { status: 'active' } });
  assert.ok(existsSync(preferred), 'fleet should write to preferred path');
  fleet = readFleet(preferred);
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
