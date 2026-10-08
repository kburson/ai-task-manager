// @story #1853
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeLegacyRevisionFixture,
  makeCanonicalRevisionFixture,
} from '../../../../fixtures/criteria-revision.mjs';
const api = await import('../../../../../task-tracker/lib/criteria-revision/legacy.mjs').catch(
  (e) => {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  }
);
test('legacy writes preserve exact sealed body and independent proof, retire shared proof and approvals', () => {
  assert.equal(typeof api.deriveLegacyWrites, 'function');
  const f = makeLegacyRevisionFixture(),
    writes = api.deriveLegacyWrites(f.proposal);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], f.proposal.writeSet[0]);
  const body = writes[0].afterBytes;
  assert.match(body, /- \[ \] Supported model hooks/);
  assert.match(body, /- \[x\] Independent requirement/);
  assert.match(body, /- \[ \] Shared model guard/);
  assert.equal(body.includes('aitm-plan-approved'), false);
  assert.ok(body.includes('aitm-timing-log'));
});
test('canonical transaction and resealed unrelated section/proof changes are not a legacy capability', () => {
  assert.equal(typeof api.deriveLegacyWrites, 'function');
  assert.throws(() => api.deriveLegacyWrites(makeCanonicalRevisionFixture().proposal));
  const f = makeLegacyRevisionFixture(),
    p = structuredClone(f.proposal);
  p.writeSet[0].afterBytes += '\n## Forged\n';
  assert.throws(() => api.deriveLegacyWrites(p));
});
