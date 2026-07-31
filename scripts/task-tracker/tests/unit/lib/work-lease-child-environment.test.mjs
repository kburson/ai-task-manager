// @story #1049
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { buildOwnedChildEnvironment } from '../../../lib/work-lease/child-environment.mjs';

const LEASE = Object.freeze({
  projectId: 'project-authoritative',
  leaseId: 'lease-authoritative',
  fencingToken: '42',
  worktreeId: 'worktree-authoritative',
});

function hostileBaseEnvironment() {
  return {
    PATH: process.env.PATH,
    KEEP_ME: 'unrelated-value',
    REMOTE_LEASE_BEARER: 'configured-secret',
    AITM_LEASE_ID: 'stale-lease',
    AITM_FENCING_TOKEN: '7',
    AITM_LEASE_AUTH_TOKEN: 'default-secret',
    AITM_LEASE_TOKEN_ENV: 'REMOTE_LEASE_BEARER',
    AITM_LEASE_HOLDER: 'untrusted-holder',
    AITM_LEASE_RECEIPT: 'untrusted-receipt',
    AITM_LEASE_STALE_VALUE: 'untrusted-stale-value',
  };
}

test('owned child environment clones unrelated values and replaces all ambient lease authority', () => {
  const baseEnv = hostileBaseEnvironment();
  const childEnv = buildOwnedChildEnvironment({
    baseEnv,
    leaseContext: LEASE,
    tokenEnv: 'REMOTE_LEASE_BEARER',
  });

  assert.notEqual(childEnv, baseEnv);
  assert.equal(childEnv.KEEP_ME, 'unrelated-value');
  assert.equal(childEnv.AITM_LEASE_ID, 'lease-authoritative');
  assert.equal(childEnv.AITM_FENCING_TOKEN, '42');
  assert.equal('REMOTE_LEASE_BEARER' in childEnv, false);
  assert.equal('AITM_LEASE_AUTH_TOKEN' in childEnv, false);
  assert.equal('AITM_LEASE_TOKEN_ENV' in childEnv, false);
  assert.equal('AITM_LEASE_HOLDER' in childEnv, false);
  assert.equal('AITM_LEASE_RECEIPT' in childEnv, false);
  assert.equal('AITM_LEASE_STALE_VALUE' in childEnv, false);
  assert.deepEqual(baseEnv, hostileBaseEnvironment(), 'the caller environment is not mutated');
});

test('a real spawned child receives only authoritative lease id and fence', () => {
  const childEnv = buildOwnedChildEnvironment({
    baseEnv: hostileBaseEnvironment(),
    leaseContext: LEASE,
    tokenEnv: 'REMOTE_LEASE_BEARER',
  });
  const stdout = execFileSync(
    process.execPath,
    [
      '-e',
      `process.stdout.write(JSON.stringify(Object.fromEntries(
        Object.entries(process.env).filter(([key]) =>
          key.startsWith('AITM_LEASE_') ||
          key === 'AITM_FENCING_TOKEN' ||
          key === 'REMOTE_LEASE_BEARER' ||
          key === 'KEEP_ME'
        )
      )))`,
    ],
    { encoding: 'utf8', env: childEnv }
  );

  assert.deepEqual(JSON.parse(stdout), {
    AITM_LEASE_ID: 'lease-authoritative',
    AITM_FENCING_TOKEN: '42',
    KEEP_ME: 'unrelated-value',
  });
});

test('owned child environment supports an unleased controller without leaking stale authority', () => {
  const childEnv = buildOwnedChildEnvironment({
    baseEnv: hostileBaseEnvironment(),
    tokenEnv: 'REMOTE_LEASE_BEARER',
  });

  assert.equal(childEnv.KEEP_ME, 'unrelated-value');
  assert.equal(
    Object.keys(childEnv).some(
      (key) => key.startsWith('AITM_LEASE_') || key === 'AITM_FENCING_TOKEN'
    ),
    false
  );
  assert.equal('REMOTE_LEASE_BEARER' in childEnv, false);
});
