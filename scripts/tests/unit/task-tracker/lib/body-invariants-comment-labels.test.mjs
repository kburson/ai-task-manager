// @story #2085
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findAcsWithoutVerifierOrInvalidTag,
  findAcsWithLegacyVerificationForm,
} from '../../../../task-tracker/lib/body-invariants.mjs';

const finders = [
  { name: 'missing verifier', find: findAcsWithoutVerifierOrInvalidTag, reason: 'no-verifier' },
  { name: 'legacy proof', find: findAcsWithLegacyVerificationForm, reason: 'missing-vc-list' },
];
const labels = [
  {
    name: 'reformed comment opener',
    raw: 'Prefix <!-<!--hidden-->- concealed --> suffix',
    want: 'Prefix <!- - concealed --> suffix',
  },
  { name: 'embedded comment', raw: 'pre<!--hidden-->fix', want: 'pre fix' },
  { name: 'adjacent comments', raw: 'pre<!--one--><!--two-->fix', want: 'pre fix' },
  {
    name: 'opener fragments across comment',
    raw: '<<!--hidden-->!-- concealed -->',
    want: '< !-- concealed -->',
  },
  { name: 'ordinary label', raw: 'Ordinary label', want: 'Ordinary label' },
  { name: 'spaced comment', raw: 'Ordinary <!--hidden--> label', want: 'Ordinary label' },
  { name: 'whitespace collapse', raw: '  Ordinary\t label  ', want: 'Ordinary label' },
  { name: 'incomplete opener', raw: 'Prefix <!-- unfinished', want: 'Prefix <!-- unfinished' },
  { name: 'stray closer', raw: 'Prefix --> suffix', want: 'Prefix --> suffix' },
  { name: 'empty display label', raw: '<!--hidden-->', want: '' },
];

for (const { name, find, reason } of finders) {
  for (const label of labels) {
    test(`${name}: ${label.name} keeps diagnostic boundaries and location`, () => {
      const body = [
        '# Diagnostic',
        '',
        '## Acceptance Criteria',
        `- [ ] <!-- aitm-verified --> ${label.raw}`,
        '',
        '## Verification Commands',
      ].join('\n');
      assert.deepEqual(find(body), [{ lineIndex: 3, label: label.want, reason }]);
    });
  }

  test(`${name}: proof citations still resolve from raw input`, () => {
    const body = [
      '## Acceptance Criteria',
      '- [ ] pre<!--hidden-->fix <!-- aitm-verified vc-list="vc:1" -->',
      '',
      '## Verification Commands',
      '- [ ] `node verify.mjs` <!-- id=1 -->',
    ].join('\n');
    assert.deepEqual(find(body), []);
  });
}
