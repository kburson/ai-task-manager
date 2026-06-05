#!/usr/bin/env node
// Control helper: mimics registerTask's RMW but WITHOUT withLock.
// Used by fleet-registry-concurrent.test.mjs to confirm the race exists
// (i.e. the test would have caught a missing lock).
import {
  fleetRegistryPath,
  readFleet,
  writeFleet,
  findMainWorktreePath,
} from '../fleet-registry.mjs';
const [, , projectDir, issueRef, branch] = process.argv;
const rPath = fleetRegistryPath(findMainWorktreePath(projectDir));
const fleet = readFleet(rPath);
const ms = Number(process.env.FLEET_REGISTRY_TEST_DELAY_MS || 0);
if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
fleet[issueRef] = {
  worktreePath: `./.tmp/test/wt-${issueRef.replace('#', '')}`,
  branch,
  startedAt: new Date().toISOString(),
  status: 'active',
};
writeFleet(rPath, fleet);
