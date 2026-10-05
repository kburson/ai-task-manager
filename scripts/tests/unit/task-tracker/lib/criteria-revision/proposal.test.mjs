// @story #1851
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { parseAcceptanceCriteria } from '../../../../../task-tracker/lib/acceptance-criteria.mjs';
import { parseVerificationCommands } from '../../../../../task-tracker/lib/verification-commands.mjs';
import {
  makeLegacyRevisionFixture,
  makeCanonicalRevisionFixture,
} from '../../../../fixtures/criteria-revision.mjs';
import {
  deriveProposal,
  hashSemanticContract,
  renderApprovalStatement,
} from '../../../../../task-tracker/lib/criteria-revision/proposal.mjs';
const hash = (s) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
test('legacy proposal archives complete identities and retires shared-VC dependencies and approvals', () => {
  const p = makeLegacyRevisionFixture().proposal;
  assert.equal(p.observedResourceVector, null);
  assert.equal(p.archive.definitions.length, 9);
  assert.equal(p.identityMap.length, 9);
  assert.ok(p.invalidation.some((x) => x.kind === 'plan-approval' && x.disposition === 'retired'));
  for (const text of ['Old model hooks', 'Shared model guard', 'Shared DoD']) {
    const d = p.archive.definitions.find((x) => x.text === text);
    assert.equal(
      p.invalidation.find((x) => x.criterionIdentity === d.identity)?.disposition,
      'retired',
      text
    );
  }
  for (const text of ['Independent requirement', 'Independent DoD']) {
    const d = p.archive.definitions.find((x) => x.text === text),
      v = p.invalidation.find((x) => x.criterionIdentity === d.identity);
    assert.equal(v.disposition, 'preserved-individual');
    assert.equal(v.bytesHash, hash(d.proof.bytes));
    assert.equal(v.destinationRevision, 'tx-1');
    assert.match(v.dependencyHash, /^sha256:/);
  }
  const replacement = p.after.definitions.find((x) => x.text === 'Supported model hooks');
  assert.equal(replacement.checked, false);
  assert.equal(replacement.proof, null);
  assert.ok(p.writeSet[0].afterBytes.includes('aitm-timing-log synthetic="yes"'));
  assert.equal(p.writeSet[0].afterBytes.includes('aitm-plan-approved'), false);
});
test('canonical revisions reset unchanged current proof and change replaced AC IDs', () => {
  const p = makeCanonicalRevisionFixture().proposal;
  assert.equal(
    p.invalidation.some((x) => x.disposition === 'preserved-individual'),
    false
  );
  assert.equal(
    p.invalidation.find((x) => x.identity === 'canonical-independent-proof').disposition,
    'retired'
  );
  assert.equal(
    p.after.definitions.find((x) => x.text === 'Independent requirement').identity,
    'ac-independent'
  );
  assert.notEqual(
    p.after.definitions.find((x) => x.text === 'Supported model hooks').identity,
    'ac-hook'
  );
  assert.equal(p.after.definitions.find((x) => x.rootId === 'vc-hook').identity, 'vc-hook');
  assert.ok(p.after.definitions.every((x) => !x.checked && x.proof === null));
});
test('semantic digests ignore execution and checkbox bytes while binding whitespace and commands', () => {
  const d = structuredClone(makeLegacyRevisionFixture().proposal.archive.definitions),
    before = hashSemanticContract(d);
  for (const x of d) {
    x.checked = !x.checked;
    x.originalBytes += ' stamped';
    if (x.proof) x.proof.bytes += ' old';
  }
  assert.equal(hashSemanticContract(d), before);
  d[0].text += ' ';
  assert.notEqual(hashSemanticContract(d), before);
  d[0].text = d[0].text.slice(0, -1);
  d[0].commands[0] += ' ';
  assert.notEqual(hashSemanticContract(d), before);
  assert.equal(
    hashSemanticContract([]),
    'sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'
  );
});
test('replacement IDs derive from transaction and ordinal rather than normalized labels', () => {
  const f = makeLegacyRevisionFixture(),
    id = f.proposal.after.definitions.find((x) => x.text === 'Supported model hooks').identity,
    c = structuredClone(f.context);
  c.edits.acceptanceCriteria[0].replacements[0].text = 'Different hooks';
  assert.equal(
    deriveProposal(c).after.definitions.find((x) => x.text === 'Different hooks').identity,
    id
  );
  c.transactionId = 'tx-2';
  assert.notEqual(
    deriveProposal(c).after.definitions.find((x) => x.text === 'Different hooks').identity,
    id
  );
});
for (const [name, mutate] of [
  [
    'duplicate headings',
    (c) => (c.observation.body.bytes += '\n## Acceptance Criteria\n- [ ] duplicate'),
  ],
  [
    'ambiguous occurrence',
    (c) => c.edits.acceptanceCriteria.push(structuredClone(c.edits.acceptanceCriteria[0])),
  ],
  [
    'missing root VC',
    (c) => (c.edits.acceptanceCriteria[0].replacements[0].declaration.vcIds = ['99']),
  ],
  [
    'duplicate VC IDs',
    (c) =>
      (c.observation.body.bytes = c.observation.body.bytes.replace(
        '<!-- id=2 -->',
        '<!-- id=1 -->'
      )),
  ],
  [
    'malformed declaration',
    (c) =>
      (c.observation.body.bytes = c.observation.body.bytes.replace('vc-list="vc:2"', 'vc-list=""')),
  ],
  [
    'supplied proof',
    (c) => (c.edits.acceptanceCriteria[0].replacements[0].declaration.sha = 'fake'),
  ],
  ['foreign executor', (c) => (c.executor.sessionId = 'foreign')],
  ['unknown authority', (c) => (c.observation.sourceKind = 'unknown')],
  ['partial pagination', (c) => (c.observation.revisionRecords.complete = false)],
  [
    'reused transaction',
    (c) =>
      c.observation.revisionRecords.records.push({
        eventId: 'event-1',
        transactionId: 'tx-1',
        operationId: 'older-op',
        proposalDigest: hash('old'),
        bytes: 'old event',
      }),
  ],
  ['stale bytes', (c) => (c.edits.acceptanceCriteria[0].oldBytes += ' stale')],
  ['unneeded VC change', (c) => (c.edits.verificationCommands[0].id = '2')],
])
  test(`refuses ${name}`, () => {
    const c = structuredClone(makeLegacyRevisionFixture().context);
    mutate(c);
    assert.throws(() => deriveProposal(c));
  });
test('VC deletion refuses surviving references; AC deletion and splitting stay explicit', () => {
  const c = structuredClone(makeLegacyRevisionFixture().context);
  c.edits.verificationCommands[0] = {
    operation: 'delete',
    id: '1',
    oldCommand: 'node --test old-hook.test.mjs',
    oldHash: hash('node --test old-hook.test.mjs'),
  };
  assert.throws(() => deriveProposal(c), /VC|vc|reference/);
  const s = structuredClone(makeLegacyRevisionFixture().context);
  s.edits.acceptanceCriteria[0].operation = 'split';
  s.edits.acceptanceCriteria[0].replacements.push({
    text: 'Additional hook',
    declaration: { kind: 'vc-list', vcIds: ['1'] },
  });
  assert.equal(deriveProposal(s).identityMap[0].afterIdentities.length, 2);
  const d = structuredClone(makeLegacyRevisionFixture().context);
  d.edits.acceptanceCriteria[0].operation = 'delete';
  d.edits.acceptanceCriteria[0].replacements = [];
  assert.equal(deriveProposal(d).identityMap[0].afterIdentities.length, 0);
});
test('frozen surviving identities withstand proof and checkbox/version stamping', () => {
  const f = makeLegacyRevisionFixture(),
    c = structuredClone(f.context);
  c.observation.identities = f.proposal.archive.definitions.map((d) => ({
    identity: d.identity,
    section: d.section,
    rootId: d.rootId,
    definitionHash: hashSemanticContract([{ ...d, identity: 'unbound' }]),
  }));
  c.observation.body.bytes = c.observation.body.bytes
    .replace('- [x] Independent requirement', '- [ ] Independent requirement')
    .replace('version="1"', 'version="2"');
  c.observation.body.version = 2;
  const p = deriveProposal(c);
  assert.equal(
    p.archive.definitions.find((x) => x.text === 'Independent requirement').identity,
    f.proposal.archive.definitions.find((x) => x.text === 'Independent requirement').identity
  );
  assert.equal(
    hashSemanticContract(p.archive.definitions),
    hashSemanticContract(f.proposal.archive.definitions)
  );
  c.observation.identities[0].definitionHash = hash('unmappable');
  assert.throws(() => deriveProposal(c), /survivor/);
});
test('approval statements bind exact mode and executor with no newline', () => {
  const f = makeLegacyRevisionFixture();
  assert.equal(
    renderApprovalStatement(f.proposal),
    `Approve criteria-revise revision for example/criteria#124, transaction tx-1, proposal ${f.proposal.proposalDigest}, executor synthetic-session.`
  );
  assert.match(renderApprovalStatement(f.resumeProposal), /^Approve criteria-revise resume /);
});

test('canonical planned projection preserves separately governed issue sections', () => {
  const f = makeCanonicalRevisionFixture();
  assert.ok(
    f.proposal.writeSet
      .find((x) => x.resource === 'issue-body')
      .afterBytes.includes('## Scope\nSynthetic scope\n')
  );
});
test('abort seals unchanged semantic authority and only its event record', () => {
  const f = makeLegacyRevisionFixture(),
    c = structuredClone(f.resumeContext);
  c.mode = 'abort';
  c.operationId = 'abort-1';
  const p = deriveProposal(c);
  assert.equal(p.after.semanticContractDigest, hashSemanticContract(p.archive.definitions));
  assert.deepEqual(p.invalidation, []);
  assert.ok(p.writeSet.every((x) => x.resource === 'revision-record'));
});

test('partial legacy execution proof is retired instead of carried as eligible', () => {
  const c = structuredClone(makeLegacyRevisionFixture().context);
  c.observation.body.bytes = c.observation.body.bytes.replace(
    /(Independent requirement <!-- aitm-verified vc-list="vc:2") [^>]+ -->/,
    '$1 sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" -->'
  );
  const p = deriveProposal(c),
    d = p.archive.definitions.find((x) => x.text === 'Independent requirement');
  assert.equal(
    p.invalidation.find((x) => x.criterionIdentity === d.identity).disposition,
    'retired'
  );
  assert.equal(p.after.definitions.find((x) => x.identity === d.identity).checked, false);
});
test('canonical raw grant bytes agree with the archived authority summary', () => {
  const c = structuredClone(makeCanonicalRevisionFixture().context),
    g = JSON.parse(c.observation.grant.bytes);
  g.coordinator.session = 'foreign-session';
  c.observation.grant.bytes = JSON.stringify(g);
  assert.throws(() => deriveProposal(c), /canonical-authority/);
});

test('historical timing and lifecycle entries receive separate historical dispositions', () => {
  const p = makeLegacyRevisionFixture().proposal;
  const historical = p.invalidation.filter((x) => x.kind === 'historical');
  assert.equal(historical.length, 2);
  assert.ok(historical.every((x) => x.disposition === 'historical'));
});
test('duplicate surviving identities and retired replacement identities refuse', () => {
  const f = makeLegacyRevisionFixture(),
    c = structuredClone(f.context);
  c.observation.identities = f.proposal.archive.definitions.map((d) => ({
    identity: d.identity,
    section: d.section,
    rootId: d.rootId,
    definitionHash: hashSemanticContract([{ ...d, identity: 'unbound' }]),
  }));
  c.observation.identities[1].identity = c.observation.identities[0].identity;
  assert.throws(() => deriveProposal(c), /duplicate-identity/);
  const retired = structuredClone(f.context);
  retired.observation.retiredIdentities = [
    f.proposal.after.definitions.find((x) => x.text === 'Supported model hooks').identity,
  ];
  assert.throws(() => deriveProposal(retired), /retired-identity/);
});

test('legacy AC projection preserves identical separately governed Scope bytes', () => {
  const c = structuredClone(makeLegacyRevisionFixture().context),
    old = c.edits.acceptanceCriteria[0].oldBytes;
  c.observation.body.bytes = c.observation.body.bytes.replace(
    'Synthetic scope',
    'Synthetic scope\n' + old
  );
  const beforeScope = c.observation.body.bytes.split('## Acceptance Criteria')[0],
    p = deriveProposal(c),
    body = p.writeSet.find((x) => x.resource === 'issue-body').afterBytes;
  assert.equal(body.split('## Acceptance Criteria')[0], beforeScope);
  assert.ok(parseAcceptanceCriteria(body).some((x) => x.label.includes('Supported model hooks')));
});
test('legacy AC projection selects the declared occurrence among identical criterion lines', () => {
  const c = structuredClone(makeLegacyRevisionFixture().context),
    old = c.edits.acceptanceCriteria[0].oldBytes;
  c.observation.body.bytes = c.observation.body.bytes.replace(/^.*Shared model guard.*$/m, old);
  c.edits.acceptanceCriteria[0].occurrence = 2;
  c.edits.verificationCommands = [];
  const body = deriveProposal(c).writeSet.find((x) => x.resource === 'issue-body').afterBytes;
  const acSection = body.split('## Acceptance Criteria\n')[1].split('## Verification Commands')[0];
  assert.equal(acSection.split('\n')[0], old);
  assert.match(acSection.split('\n')[1], /Supported model hooks/);
});
test('legacy VC insertion preserves a matching root line quoted in Scope', () => {
  const c = structuredClone(makeLegacyRevisionFixture().context),
    last = c.observation.body.bytes.split('\n').find((x) => x.includes('<!-- id=2 -->'));
  c.observation.body.bytes = c.observation.body.bytes.replace(
    'Synthetic scope',
    'Synthetic scope\n' + last
  );
  c.edits.acceptanceCriteria[0].replacements[0].declaration.vcIds = ['3'];
  c.edits.verificationCommands = [
    { operation: 'add', id: '3', command: 'node --test new-root.test.mjs' },
  ];
  const beforeScope = c.observation.body.bytes.split('## Acceptance Criteria')[0],
    body = deriveProposal(c).writeSet.find((x) => x.resource === 'issue-body').afterBytes;
  assert.equal(body.split('## Acceptance Criteria')[0], beforeScope);
  assert.ok(
    parseVerificationCommands(body).some(
      (x) => x.id === 3 && x.command === 'node --test new-root.test.mjs'
    )
  );
});
function addingRootContext(make, id) {
  const c = structuredClone(make().context);
  c.edits.acceptanceCriteria[0].replacements[0].declaration.vcIds = [id];
  c.edits.verificationCommands = [
    { operation: 'add', id, command: 'node --test new-root.test.mjs' },
  ];
  return c;
}
test('new canonical VC identity resolves every approved declaration in the planned contract', () => {
  const p = deriveProposal(addingRootContext(makeCanonicalRevisionFixture, 'vc-new')),
    contract = JSON.parse(p.writeSet.find((x) => x.resource === 'delivery-contract').afterBytes),
    root = p.after.definitions.find(
      (x) => x.section === 'vc' && x.text === 'node --test new-root.test.mjs'
    );
  assert.equal(root.rootId, root.identity);
  assert.match(root.identity, /^cr-/);
  for (const d of p.after.definitions.filter((x) => x.declaration.kind === 'vc-list')) {
    for (const id of d.declaration.vcIds)
      assert.ok(contract.verificationCommands.some((x) => x.logicalId === id));
  }
});
for (const [name, make, id] of [
  ['legacy add', makeLegacyRevisionFixture, '3'],
  ['canonical add', makeCanonicalRevisionFixture, 'vc-new'],
])
  test(`retired generated root refuses ${name}`, () => {
    const c = addingRootContext(make, id),
      p = deriveProposal(c),
      root = p.after.definitions.find(
        (x) => x.section === 'vc' && x.text === 'node --test new-root.test.mjs'
      );
    c.observation.retiredIdentities = [root.identity];
    assert.throws(() => deriveProposal(c), /retired-identity/);
  });
test('retired generated identity refuses legacy VC replacement', () => {
  const c = structuredClone(makeLegacyRevisionFixture().context),
    p = deriveProposal(c),
    root = p.after.definitions.find((x) => x.section === 'vc' && x.rootId === '1');
  c.observation.retiredIdentities = [root.identity];
  assert.throws(() => deriveProposal(c), /retired-identity/);
});
