#!/usr/bin/env node
// @story #1897
// Canonical H2 AC precedence, with existing legacy locator/declaration behavior.
import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  parseEvidenceAcs,
  findEvidenceAc,
  findAcSectionCheckbox,
  stampAcEvidenceMarker,
  stampAcEvidenceAndReconcile,
} from '../../../../task-tracker/lib/ac-evidence.mjs';
import { gateEvidenceTick } from '../../../../task-tracker/verbs/check.mjs';

const label = 'Canonical criterion resolves its exact commands';
const sourceLabel = 'Embedded source criterion remains source content';
const plainLabel = 'Canonical criterion without a verifier';
const commands = ['node --test canonical.test.mjs', 'npm run lint'];
// Inert unit-fixture proof fields exercise grammar; these are not native receipts.
const fixtureEvidence = {
  cmd: commands[0],
  sha: 'fixture1897',
  ts: '2026-10-05T00:00:00.000Z',
  exit: 0,
};
const verification = [
  '## Verification Commands',
  '',
  '- [ ] `node --test canonical.test.mjs` <!-- id=1 -->',
  '- [ ] `npm run lint` <!-- id=3 -->',
  '',
].join('\n');

function downstreamBody(level, heading = '## Acceptance Criteria') {
  return [
    '## Scope',
    '',
    'Approved source requirements retain these exact spaces.  ',
    '#'.repeat(level) + ' Acceptance Criteria',
    '',
    '- [ ] ' + sourceLabel + ' <!-- aitm-verified cmd="`source-command`" -->',
    '',
    heading,
    '',
    '- [ ] ' + label + ' <!-- aitm-verified vc-list="vc:1 vc:3" -->',
    '- [ ] ' + plainLabel,
    '',
    verification,
    '## Definition of Done',
    '- [ ] Outside criterion',
    '',
  ].join('\n');
}

for (const level of [1, 3, 4]) {
  test('canonical H2 precedes embedded H' + level + ' for parser and checkbox lookup', () => {
    const body = downstreamBody(level);
    const acs = parseEvidenceAcs(body);
    assert.deepEqual(
      acs.map((ac) => ac.label),
      [label]
    );
    assert.deepEqual(acs[0].evidenceCommands, commands);
    assert.equal(
      findEvidenceAc(body, label)?.lineIndex,
      body.split('\n').findIndex((line) => line.includes(label))
    );
    assert.equal(findEvidenceAc(body, sourceLabel), null);
    assert.equal(findAcSectionCheckbox(body, plainLabel)?.label, plainLabel);
    assert.equal(findAcSectionCheckbox(body, sourceLabel), null);
    assert.equal(findAcSectionCheckbox(body, 'Outside criterion'), null);
  });

  test('canonical unstamped AC remains gated after embedded H' + level, () => {
    const gate = gateEvidenceTick(downstreamBody(level), label);
    assert.equal(gate.kind, 'refuse-ac-evidence');
    assert.equal(gate.label, label);
    assert.deepEqual(gate.commands, commands);
  });

  test(
    'canonical stamp after embedded H' + level + ' preserves every other line and citations',
    () => {
      const body = downstreamBody(level);
      const stamped = stampAcEvidenceMarker(body, label, fixtureEvidence);
      const targetIndex = body.split('\n').findIndex((line) => line.includes(label));
      const before = body.split('\n');
      const after = stamped.split('\n');
      assert.equal(after.length, before.length);
      assert.deepEqual(
        after.filter((_, index) => index !== targetIndex),
        before.filter((_, index) => index !== targetIndex)
      );
      assert.ok(after[targetIndex].includes('vc-list="vc:1 vc:3"'));
      assert.ok(!after[targetIndex].includes('cmd='));
      assert.equal(findEvidenceAc(stamped, label)?.evidenceMarker.sha, fixtureEvidence.sha);
      assert.equal(gateEvidenceTick(stamped, label).kind, 'pass');
      assert.equal(stampAcEvidenceMarker(stamped, label, fixtureEvidence), stamped);
      assert.equal(stampAcEvidenceAndReconcile(body, label, fixtureEvidence), stamped);
    }
  );
}

const declarations = [
  ['literal', 'cmd="`node --test canonical.test.mjs`"'],
  ['by-id', 'vc-list="vc:1"'],
];
for (const level of [1, 2, 3, 4]) {
  for (const [name, declaration] of declarations) {
    test(
      'supported H' +
        level +
        ' with ' +
        name +
        ' declaration is preserved without another canonical H2',
      () => {
        const body = [
          '#'.repeat(level) + ' Acceptance Criteria',
          '',
          '- [ ] ' + label + ' <!-- aitm-verified ' + declaration + ' -->',
          '',
          verification,
          '## Definition of Done',
        ].join('\n');
        assert.deepEqual(
          parseEvidenceAcs(body).map((ac) => ac.label),
          [label]
        );
        assert.deepEqual(findEvidenceAc(body, label)?.evidenceCommands, [commands[0]]);
        assert.equal(findAcSectionCheckbox(body, label)?.checked, false);
        assert.equal(gateEvidenceTick(body, label).kind, 'refuse-ac-evidence');
        const stamped = stampAcEvidenceMarker(body, label, fixtureEvidence);
        assert.ok(stamped.includes(declaration));
        assert.equal(gateEvidenceTick(stamped, label).kind, 'pass');
      }
    );
  }
}

for (const level of [1, 2, 3, 4]) {
  test('retired ordinal declaration remains unresolved under H' + level, () => {
    const body =
      '#'.repeat(level) +
      ' Acceptance Criteria\n- [ ] ' +
      label +
      ' <!-- aitm-verified cmd="vc:1" -->\n' +
      verification;
    assert.deepEqual(parseEvidenceAcs(body), []);
    assert.equal(findEvidenceAc(body, label), null);
    assert.equal(findAcSectionCheckbox(body, label)?.label, label);
    assert.throws(
      () => stampAcEvidenceMarker(body, label, fixtureEvidence),
      /no evidence-bearing AC line/
    );
  });
}

test('canonical heading retains existing case-insensitive suffix behavior', () => {
  assert.deepEqual(
    parseEvidenceAcs(downstreamBody(4, '## acceptance criteria — current')).map((ac) => ac.label),
    [label]
  );
});

test('missing AC heading keeps empty lookup and stamping refusal', () => {
  const body =
    '## Scope\n- [ ] ' + label + ' <!-- aitm-verified vc-list="vc:1" -->\n' + verification;
  assert.deepEqual(parseEvidenceAcs(body), []);
  assert.equal(findEvidenceAc(body, label), null);
  assert.equal(findAcSectionCheckbox(body, label), null);
  assert.throws(
    () => stampAcEvidenceMarker(body, label, fixtureEvidence),
    /no evidence-bearing AC line/
  );
});
