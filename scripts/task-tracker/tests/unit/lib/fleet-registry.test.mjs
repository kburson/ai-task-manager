#!/usr/bin/env node
// @story #309
import { strict as assert } from 'node:assert';
import { existsSync, rmSync } from 'node:fs';
import { projectScratchDir, mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';
import path from 'node:path';
import {
  fleetRegistryPath,
  readFleet,
  writeFleet,
  registerTask,
  deregisterTask,
  setTaskStatus,
} from '../../../fleet-registry.mjs';
import * as fleetRegistry from '../../../fleet-registry.mjs';

const tmp = mkdtempProjectIsolated('tt-fleet-');

try {
  const preferred = fleetRegistryPath(tmp);

  // #573: the fleet registry is main-anchored under `.tmp/aitm/fleet/`. Hard
  // cut — no legacy `.claude`/SHARED_DIR read-fallback.
  assert.equal(preferred, path.join(tmp, '.tmp', 'aitm', 'fleet', 'task-fleet.json'));

  writeFleet(preferred, { '#2': { status: 'active' } });
  assert.ok(existsSync(preferred), 'fleet should write to preferred path');
  let fleet = readFleet(preferred);
  assert.equal(fleet['#2'].status, 'active');

  registerTask(tmp, '#3', '/tmp/worktree', '3-test');
  fleet = readFleet(preferred);
  assert.equal(fleet['#3'].branch, '3-test');
  assert.equal(fleet['#3'].status, 'active');

  const projectedInput = {
    issue: '#1049',
    worktreePath: tmp,
    branch: 'feature/child/1049',
    kind: 'main',
    startedAt: '2026-07-30T12:00:00.000Z',
    status: 'active',
    binding: {
      principalKind: 'worker',
      provider: 'codex',
      agentRunId: 'run-1',
      sessionId: 'session-1',
      hostId: 'host-1',
      pid: 123,
      worktreeId: 'wt:v1:main',
      pathHash: 'path-hash',
      branch: 'feature/child/1049',
      displayPath: tmp,
    },
  };
  const projectionId = 'acquire:request-1:fleet';
  fleetRegistry.registerTaskProjection(tmp, projectedInput, projectionId);
  const projectedBytes = JSON.stringify(readFleet(preferred));
  fleetRegistry.registerTaskProjection(tmp, projectedInput, projectionId);
  assert.equal(JSON.stringify(readFleet(preferred)), projectedBytes, 'projection replay is exact');
  assert.deepEqual(readFleet(preferred)['#1049'], {
    worktreePath: tmp,
    branch: 'feature/child/1049',
    kind: 'main',
    startedAt: '2026-07-30T12:00:00.000Z',
    status: 'active',
    binding: projectedInput.binding,
    projectionId,
  });

  const switchInput = {
    sourceIssue: '#1049',
    targetIssue: '#1051',
    source: projectedInput,
    target: { ...projectedInput, issue: '#1051' },
  };
  const targetLease = {
    projectId: 'project-1',
    leaseId: 'lease-target',
    fencingToken: '9',
    worktreeId: projectedInput.binding.worktreeId,
  };
  const switchProjectionId = 'switchLease:switch-1:fleet';
  fleetRegistry.switchTaskProjection(tmp, switchInput, targetLease, switchProjectionId, 'forward');
  assert.equal(readFleet(preferred)['#1049'], undefined);
  assert.deepEqual(readFleet(preferred)['#1051'], {
    worktreePath: tmp,
    branch: 'feature/child/1049',
    kind: 'main',
    startedAt: '2026-07-30T12:00:00.000Z',
    status: 'active',
    binding: projectedInput.binding,
    lease: targetLease,
    projectionId: switchProjectionId,
  });
  const switchedBytes = JSON.stringify(readFleet(preferred));
  fleetRegistry.switchTaskProjection(tmp, switchInput, targetLease, switchProjectionId, 'forward');
  assert.equal(JSON.stringify(readFleet(preferred)), switchedBytes, 'switch replay is exact');

  const restoredLease = {
    ...targetLease,
    leaseId: 'lease-source-restored',
    fencingToken: '11',
  };
  const compensationProjectionId = 'compensation:compensate-1:fleet';
  fleetRegistry.switchTaskProjection(
    tmp,
    switchInput,
    restoredLease,
    compensationProjectionId,
    'compensation'
  );
  assert.equal(readFleet(preferred)['#1051'], undefined);
  assert.deepEqual(readFleet(preferred)['#1049'], {
    worktreePath: tmp,
    branch: 'feature/child/1049',
    kind: 'main',
    startedAt: '2026-07-30T12:00:00.000Z',
    status: 'active',
    binding: projectedInput.binding,
    lease: restoredLease,
    projectionId: compensationProjectionId,
  });

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
