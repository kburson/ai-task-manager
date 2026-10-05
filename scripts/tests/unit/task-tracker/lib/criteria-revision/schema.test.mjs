// @story #1851
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  makeLegacyRevisionFixture,
  makeCanonicalRevisionFixture,
} from '../../../../fixtures/criteria-revision.mjs';
import { validateRevisionRequest } from '../../../../../task-tracker/lib/criteria-revision/schema.mjs';
import { canonicalRecordJson } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { resolveCoordinatorAuthority } from '../../../../../task-tracker/lib/github-records/coordination-authority.mjs';
import { COMMAND_CATALOG } from '../../../../../task-tracker/lib/command-surface/catalog.mjs';
import { listLifecycleActions } from '../../../../../task-tracker/lib/lifecycle-policy/actions.mjs';
function reseal(p) {
  const rest = { ...p };
  delete rest.proposalDigest;
  p.proposalDigest = `sha256:${createHash('sha256').update(canonicalRecordJson(rest)).digest('hex')}`;
}
for (const make of [makeLegacyRevisionFixture, makeCanonicalRevisionFixture])
  test(`${make.name}: complete initial and recovery requests validate`, () => {
    const f = make();
    assert.equal(validateRevisionRequest(f.request), f.request);
    assert.equal(validateRevisionRequest(f.resumeRequest), f.resumeRequest);
  });
test('unknown nested keys cannot be laundered by resealing', () => {
  const f = makeLegacyRevisionFixture();
  for (const path of [
    [],
    ['executor'],
    ['writerDomain'],
    ['authority'],
    ['before'],
    ['edits'],
    ['edits', 'acceptanceCriteria', 0],
    ['edits', 'acceptanceCriteria', 0, 'replacements', 0],
    ['edits', 'acceptanceCriteria', 0, 'replacements', 0, 'declaration'],
    ['identityMap', 0],
    ['invalidation', 0],
    ['archive'],
    ['archive', 'observation'],
    ['archive', 'definitions', 0],
    ['archive', 'resourceVector'],
    ['writeSet', 0],
    ['after'],
  ]) {
    const r = structuredClone(f.request);
    let value = r.proposal;
    for (const key of path) value = value[key];
    value.unknown = true;
    reseal(r.proposal);
    assert.throws(() => validateRevisionRequest(r), /keys|declaration/);
  }
  for (const key of ['allowMarkerLoss', 'body', 'proof', 'loadUserMessage', 'transcriptPath'])
    assert.throws(() => validateRevisionRequest({ ...f.request, [key]: true }), /keys/);
});
test('caller dispositions, identities and write bytes must reproduce tool derivation', () => {
  const f = makeLegacyRevisionFixture();
  for (const mutate of [
    (p) => (p.invalidation[0].disposition = 'preserved-individual'),
    (p) => {
      p.writeSet[0].afterBytes = 'arbitrary body';
      p.writeSet[0].afterHash = `sha256:${createHash('sha256').update('arbitrary body').digest('hex')}`;
    },
    (p) => (p.identityMap[0].afterIdentities = ['forged']),
  ]) {
    const r = structuredClone(f.request);
    mutate(r.proposal);
    reseal(r.proposal);
    assert.throws(() => validateRevisionRequest(r), /derived|identity|disposition/);
  }
});
test('actions, modes, prior references and recovery-vector digests agree', () => {
  const f = makeLegacyRevisionFixture();
  assert.throws(() => validateRevisionRequest({ ...f.request, action: 'recover' }), /mode/);
  for (const mutate of [
    (p) => (p.observedResourceVector = null),
    (p) => (p.observedResourceVector = 'sha256:' + '0'.repeat(64)),
    (p) => (p.priorTransaction = null),
  ]) {
    const r = structuredClone(f.resumeRequest);
    mutate(r.proposal);
    reseal(r.proposal);
    assert.throws(() => validateRevisionRequest(r), /resource-vector|prior|derived/);
  }
});
test('ID bounds and declaration-only edits reject supplied proof or arbitrary body prose', () => {
  const f = makeLegacyRevisionFixture();
  for (const messageId of ['x'.repeat(257), 'é', 'bad\nmessage'])
    assert.throws(
      () =>
        validateRevisionRequest({
          ...f.request,
          authorizationSource: { ...f.authorizationSource, messageId },
        }),
      /source|identifier/
    );
  for (const mutate of [
    (r) =>
      (r.proposal.edits.acceptanceCriteria[0].replacements[0].text +=
        ' <!-- aitm-verified sha="fake" -->'),
    (r) => (r.proposal.edits.acceptanceCriteria[0].replacements[0].text = '## Scope\nbody'),
    (r) => (r.proposal.edits.verificationCommands[0].command = () => {}),
  ]) {
    const r = structuredClone(f.request);
    mutate(r);
    assert.throws(() => validateRevisionRequest(r));
  }
});
test('no production mutation command, action or public package export is reachable', () => {
  assert.equal(
    COMMAND_CATALOG.some((x) => x.name.startsWith('criteria-revise')),
    false
  );
  assert.equal(
    listLifecycleActions().some((x) => x.id.startsWith('criteria-revise')),
    false
  );
  const pkg = JSON.parse(
    readFileSync(new URL('../../../../../../package.json', import.meta.url), 'utf8')
  );
  assert.equal(
    Object.keys(pkg.exports ?? {}).some((x) => x.includes('criteria-revision')),
    false
  );
});

test('canonical dependency fixture includes a natively valid active grant', () => {
  const f = makeCanonicalRevisionFixture();
  const result = resolveCoordinatorAuthority({
    issueHierarchy: [{ issue: 124, parentIssue: null }],
    grants: [f.nativeGrant],
    revocations: [],
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: f.nativeGrant.grantId,
      epoch: 1,
      adoptionState: 'adopted',
    },
    now: '2026-10-01T00:00:00.000Z',
  });
  assert.equal(result.status, 'active');
});

test('current and old approval fixtures bind all Plan sources and target contract epochs', () => {
  const f = makeCanonicalRevisionFixture(),
    target = JSON.parse(
      f.proposal.writeSet.find((x) => x.resource === 'delivery-contract').afterBytes
    );
  assert.equal(f.currentApproval.contractEpoch, target.contractEpoch);
  assert.deepEqual(
    f.currentApproval.sourceBindings.map((x) => x.identity),
    ['user-story', 'story-intent', 'linked-plan']
  );
  assert.equal(f.currentApproval.provenance.mode, 'full-auto');
  assert.equal(f.oldApproval.contractEpoch, f.contract.contractEpoch);
  assert.notEqual(f.oldApproval.revisionId, f.currentApproval.revisionId);
});
