// @story #1852
import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryRuntime } from '../../../../fixtures/criteria-revision-runtime.mjs';
const api = await import('../../../../../task-tracker/lib/criteria-revision/domain.mjs').catch(
  (e) => {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  }
);
const register = (r) =>
  api.registerRevisionDomain(
    {
      repository: r.context.repository,
      commonDir: r.identity.commonDirectory,
      host: r.identity.hostId,
      quiescenceConfirmed: true,
    },
    r.ports
  );
test('registration requires explicit quiescence and runtime-derived host and common directory', () => {
  assert.equal(typeof api.registerRevisionDomain, 'function');
  const r = memoryRuntime();
  assert.throws(
    () =>
      api.registerRevisionDomain(
        {
          repository: r.context.repository,
          commonDir: '/elsewhere',
          host: 'host-one',
          quiescenceConfirmed: true,
        },
        r.ports
      ),
    /domain-runtime-mismatch/
  );
  assert.throws(
    () =>
      api.registerRevisionDomain(
        {
          repository: r.context.repository,
          commonDir: '/git/common',
          host: 'host-one',
          quiescenceConfirmed: false,
        },
        r.ports
      ),
    /quiescence-required/
  );
  const d = register(r);
  assert.equal(api.resolveRevisionDomain(r.context, r.ports).epoch, d.epoch);
  r.identity.commonDirectory = '/independent';
  assert.throws(() => register(r), /domain-mismatch/);
  r.identity.commonDirectory = '/git/common';
  r.identity.hostId = 'foreign';
  assert.throws(() => register(r), /domain-mismatch/);
});
test('pending or unknown transactions refuse domain movement and disablement', () => {
  const r = memoryRuntime();
  register(r);
  r.ports.observePending = () => true;
  assert.throws(
    () => api.resolveRevisionDomain({ ...r.context, enabled: false }, r.ports),
    /domain-pending/
  );
  r.identity.commonDirectory = '/other';
  assert.throws(() => api.resolveRevisionDomain(r.context, r.ports), /domain-pending/);
  r.identity.commonDirectory = '/git/common';
  r.ports.observePending = () => null;
  assert.throws(
    () => api.resolveRevisionDomain({ ...r.context, enabled: false }, r.ports),
    /domain-pending-unknown/
  );
});
test('restart changes the domain incarnation and unregistered resolution stays disabled', () => {
  const r = memoryRuntime();
  assert.equal(api.resolveRevisionDomain(r.context, r.ports), null);
  const a = register(r),
    b = register(r);
  assert.notEqual(a.epoch, b.epoch);
  r.identity.bootId = 'new-boot';
  assert.throws(() => api.resolveRevisionDomain(r.context, r.ports), /domain-restart/);
});
