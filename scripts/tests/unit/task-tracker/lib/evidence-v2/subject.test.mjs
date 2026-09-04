// @story #1497
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectRequirements,
  validateInputs,
} from '../../../../../task-tracker/lib/evidence-v2/subject-inputs.mjs';
import { logicalRecordFixture } from '../../../../helpers/evidence-v2/logical-records.mjs';
test('requirements normalizer excludes progress proof but retains executable declarations and mappings', () => {
  const initial =
    '## Acceptance Criteria\n\n- [ ] Preserve raw bytes <!-- aitm-verified vc-list="vc:1" -->\n\n## Verification Commands\n\n- [ ] `node --test` <!-- id=1 -->\n';
  const progressed = initial
    .replaceAll('[ ]', '[x]')
    .replace(
      'Preserve raw bytes',
      'Preserve raw bytes <!-- aitm-ac-evidence key="x" sha="abc" -->'
    );
  assert.deepEqual(
    projectRequirements({
      body: initial,
      target: { ref: 'trunk' },
      policy: { id: 'p', version: '1' },
    }),
    projectRequirements({
      body: progressed,
      target: { ref: 'trunk' },
      policy: { id: 'p', version: '1' },
    })
  );
  assert.notDeepEqual(
    projectRequirements({
      body: initial,
      target: { ref: 'trunk' },
      policy: { id: 'p', version: '1' },
    }),
    projectRequirements({
      body: initial.replace('--test', '--test different'),
      target: { ref: 'trunk' },
      policy: { id: 'p', version: '1' },
    })
  );
});

test('every requirement and verifier line participates in the canonical projection', () => {
  const body =
    '## Acceptance Criteria\n\n- [ ] First <!-- aitm-verified vc-list="vc:1" -->\n- [ ] Second <!-- aitm-verified vc-list="vc:2" -->\n\n## Verification Commands\n\n- [ ] `node first` <!-- id=1 -->\n- [ ] `node second` <!-- id=2 -->\n\n## Definition of Done\n';
  const p = projectRequirements({
    body,
    target: { ref: 'trunk' },
    policy: { id: 'p', version: '1' },
  });
  assert.equal(p.acceptanceCriteria.length, 2);
  assert.equal(p.verificationCommands.length, 2);
  assert.equal(p.verificationCommands[1].command, 'node second');
});

test('input declarations default to history sensitivity and reject incomplete secret-bearing environment', () => {
  const f = logicalRecordFixture();
  const input = structuredClone(f.input);
  delete input.recipe.sensitivity;
  delete input.recipe.review;
  assert.equal(validateInputs(input).sensitivity, 'history-sensitive');
  assert.throws(
    () => validateInputs({ ...input, environment: { ...input.environment, complete: false } }),
    /inputs-incomplete/
  );
  assert.throws(
    () =>
      validateInputs({
        ...input,
        environment: { ...input.environment, variables: { ACCESS_TOKEN: 'secret' } },
      }),
    /secret/
  );
});
