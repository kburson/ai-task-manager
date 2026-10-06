// @story #1904
// Catch source headings shadowing the governed root checklist, not text changes.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveAcsStatus,
  parseFunctionalDodKeys,
} from '../../../../task-tracker/lib/functional-dod-evidence.mjs';
import { projectFunctionalDod } from '../../../../task-tracker/lib/functional-dod-project.mjs';
import {
  findAcsWithoutVerifierOrInvalidTag,
  findAcsWithLegacyVerificationForm,
} from '../../../../task-tracker/lib/body-invariants.mjs';
import { parseEvidenceAcs } from '../../../../task-tracker/lib/ac-evidence.mjs';
import { validate } from '../../../../task-tracker/lib/agent-review/validators/body-sections.mjs';

const SCOPE =
  '## Scope\n\nAccepted source bytes stay exact.\n#### Acceptance Criteria\nSource requirements are prose, not the governed checklist.\n#### Verification Commands\nSource verifier description.\n\n';
const COMMAND = 'node --test scripts/tests/unit/task-tracker/lib/root-ac-consumers.test.mjs';
const marker = '<!-- aitm-verified vc-list="vc:1" -->';
function body(ac, scope = SCOPE) {
  return (
    scope +
    '## Acceptance Criteria\n\n' +
    ac +
    '\n\n## Verification Commands\n\n- [ ] `' +
    COMMAND +
    '` <!-- id=1 -->\n\n## Definition of Done\n\n### Functional (verified at Test)\n\n- [ ] Acceptance criteria met <!-- dod:functional:acs -->\n'
  );
}
function project(input) {
  return projectFunctionalDod({
    body: input,
    head: 'a'.repeat(40),
    evaluatedAt: '2026-10-06T15:00:00Z',
  });
}

test('functional derivation reads the checked formal root after embedded source headings', () => {
  const input = body('- [x] Actual delivery ' + marker);
  assert.deepEqual(deriveAcsStatus(input), {
    total: 1,
    ticked: 1,
    allTicked: true,
    sectionPresent: true,
  });
  const output = project(input);
  assert.equal(
    parseFunctionalDodKeys(output.body).find((item) => item.key === 'acs').checked,
    true
  );
  assert.equal(output.body.slice(0, SCOPE.length), SCOPE);
  assert.match(output.body, /cmd="derive:all-acceptance-criteria-ticked"/);
});

test('a checked embedded source example cannot hide an unchecked formal root AC', () => {
  const source = '## Scope\n\n#### Acceptance Criteria\n- [x] Source example\n\n';
  const input = body('- [ ] Actual delivery ' + marker, source);
  assert.deepEqual(deriveAcsStatus(input), {
    total: 1,
    ticked: 0,
    allTicked: false,
    sectionPresent: true,
  });
  assert.equal(project(input).normalization, null);
  assert.equal(project(input).body, input);
});

test('root verifier offenders remain visible at their actual source line', () => {
  const input = body('- [ ] Root missing verifier');
  const line = input.split('\n').indexOf('- [ ] Root missing verifier');
  assert.deepEqual(findAcsWithoutVerifierOrInvalidTag(input), [
    { lineIndex: line, label: 'Root missing verifier', reason: 'no-verifier' },
  ]);
});

test('root legacy citation offenders cannot be hidden by an embedded heading', () => {
  const ac = '- [ ] Root legacy declaration <!-- aitm-verified cmd="vc:1" -->';
  const input = body(ac);
  assert.deepEqual(findAcsWithLegacyVerificationForm(input), [
    {
      lineIndex: input.split('\n').indexOf(ac),
      label: 'Root legacy declaration',
      reason: 'ordinal-cmd-citation',
    },
  ]);
});

test('functional and native AC evidence traversal agree on the same formal root', () => {
  const input = body('- [x] Actual delivery ' + marker);
  assert.deepEqual(
    parseEvidenceAcs(input).map((item) => ({
      label: item.label,
      checked: item.checked,
      evidenceCommands: item.evidenceCommands,
    })),
    [{ label: 'Actual delivery', checked: true, evidenceCommands: [COMMAND] }]
  );
  assert.equal(deriveAcsStatus(input).allTicked, true);
  assert.deepEqual(findAcsWithoutVerifierOrInvalidTag(input), []);
  assert.deepEqual(findAcsWithLegacyVerificationForm(input), []);
});

for (const [name, literal] of [
  ['backtick fence', '```markdown\n## Acceptance Criteria\n- [x] Literal example\n```'],
  ['tilde fence', '~~~markdown\n## Acceptance Criteria\n- [x] Literal example\n~~~'],
  ['multiline comment', '<!--\n## Acceptance Criteria\n- [x] Literal example\n-->'],
]) {
  test(name + ' root examples do not select or conceal the live formal checklist', () => {
    const scope = '## Scope\n\n' + literal + '\n\n';
    const input = body('- [ ] Actual delivery ' + marker, scope);
    assert.deepEqual(deriveAcsStatus(input), {
      total: 1,
      ticked: 0,
      allTicked: false,
      sectionPresent: true,
    });
    assert.equal(project(input).normalization, null);
    assert.equal(project(input).body, input);
  });
}

for (const heading of [
  '# Acceptance Criteria',
  '### Acceptance Criteria',
  '#### Acceptance Criteria',
]) {
  test('supported legacy ' + heading + ' remains evaluable without a canonical root', () => {
    const input =
      heading +
      '\n- [x] Legacy delivery ' +
      marker +
      '\n## Verification Commands\n- [ ] `' +
      COMMAND +
      '` <!-- id=1 -->\n';
    assert.deepEqual(deriveAcsStatus(input), {
      total: 1,
      ticked: 1,
      allTicked: true,
      sectionPresent: true,
    });
    assert.deepEqual(findAcsWithoutVerifierOrInvalidTag(input), []);
    assert.deepEqual(findAcsWithLegacyVerificationForm(input), []);
  });
}

test('duplicate live root headings refuse derivation and both verifier guards', () => {
  const input =
    body('- [x] Favorable delivery ' + marker) +
    '\n## Acceptance Criteria\n- [ ] Unfinished delivery\n';
  for (const read of [
    deriveAcsStatus,
    findAcsWithoutVerifierOrInvalidTag,
    findAcsWithLegacyVerificationForm,
    project,
  ]) {
    assert.throws(() => read(input), /ambiguous.*Acceptance Criteria/i);
  }
});

test('missing or malformed root heading cannot become derived completion', () => {
  for (const input of ['', '## Acceptance Criterion\n- [x] Misnamed checklist\n']) {
    assert.deepEqual(deriveAcsStatus(input), {
      total: 0,
      ticked: 0,
      allTicked: false,
      sectionPresent: false,
    });
    const structural = validate({ body: input });
    assert.equal(structural.pass, false);
    assert.ok(structural.failures.some((f) => /Acceptance Criteria.*missing/.test(f)));
  }
});
