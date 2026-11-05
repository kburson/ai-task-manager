import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  acquireCoordinatorLease,
  inspectCoordinatorLease,
  requestCoordinatorStop,
} from '../../src/coordinator/lease.mjs';

const NOW = new Date('2026-09-13T12:00:00.000Z');

function workspace(t) {
  const root = path.join(process.cwd(), '.scratch', 'test');
  mkdirSync(root, { recursive: true });
  const value = mkdtempSync(path.join(root, 'coordinator-lease-'));
  t.after(() => rmSync(value, { recursive: true, force: true }));
  return value;
}

test('acquires, heartbeats, inspects, and releases only its exact instance', (t) => {
  const root = workspace(t);
  const controller = acquireCoordinatorLease(root, { kind: 'cli', pid: 42 }, NOW, {
    instanceId: 'instance-01',
    nonce: 'nonce-01',
  });
  assert.equal(inspectCoordinatorLease(root).lease.instance_id, 'instance-01');
  assert.doesNotMatch(readFileSync(controller.paths.lease, 'utf8'), /nonce-01/);
  const refreshed = controller.heartbeat(new Date(NOW.valueOf() + 1000));
  assert.equal(refreshed.heartbeat_sequence, 2);
  controller.release();
  assert.equal(existsSync(controller.paths.lock), false);
  assert.equal(existsSync(controller.paths.lease), false);
});

test('requests stop for only the exact owned instance and makes retry idempotent', (t) => {
  const root = workspace(t);
  const controller = acquireCoordinatorLease(root, { kind: 'cli', pid: 42 }, NOW, {
    instanceId: 'instance-01',
    nonce: 'nonce-01',
  });

  const requested = requestCoordinatorStop(root, NOW);
  assert.equal(requested.instance_id, 'instance-01');
  assert.equal(controller.stopRequested(), true);
  assert.deepEqual(requestCoordinatorStop(root, new Date(NOW.valueOf() + 1000)), requested);

  controller.release();
  assert.equal(existsSync(controller.paths.stop), false);
});

test('refuses contention and never deletes a foreign replacement', (t) => {
  const root = workspace(t);
  const first = acquireCoordinatorLease(root, { kind: 'cli', pid: 42 }, NOW, {
    instanceId: 'instance-01',
    nonce: 'nonce-01',
  });
  assert.throws(
    () =>
      acquireCoordinatorLease(root, { kind: 'app-host', pid: null }, NOW, {
        instanceId: 'instance-02',
        nonce: 'nonce-02',
      }),
    (error) => error.code === 'APR_COORDINATOR_OWNED'
  );

  const foreign = JSON.parse(readFileSync(first.paths.lock, 'utf8'));
  writeFileSync(first.paths.lock, `${JSON.stringify({ ...foreign, token: 'foreign-token' })}\n`);
  first.release();
  assert.equal(existsSync(first.paths.lock), true);
});

test('lease contents alone never override missing or mismatched lock evidence', (t) => {
  const root = workspace(t);
  const controller = acquireCoordinatorLease(root, { kind: 'cli', pid: 42 }, NOW, {
    instanceId: 'instance-01',
    nonce: 'nonce-01',
  });
  rmSync(controller.paths.lock);
  assert.throws(
    () => inspectCoordinatorLease(root),
    (error) => error.code === 'APR_COORDINATOR_STALE'
  );
});
