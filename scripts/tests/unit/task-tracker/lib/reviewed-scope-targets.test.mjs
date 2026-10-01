// @story #1859
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scanScope,
  resolveScopeTarget,
  isVerifierBearingScopeTarget,
} from '../../../../task-tracker/lib/reviewed-scope/targets.mjs';
test('Scope scanner ignores fenced and HTML-comment examples and keeps nested narrative headings', () => {
  const body = [
    '## Scope',
    '```md',
    '## Scope',
    '- [ ] Example',
    '```',
    '<!--',
    '## Scope',
    '- [ ] Hidden',
    '-->',
    '### Nested',
    '- [ ] Real',
    '## Acceptance Criteria',
    '- [ ] AC',
  ].join('\n');
  assert.deepEqual(
    scanScope(body).targets.map((x) => x.label),
    ['Real']
  );
  assert.equal(resolveScopeTarget(body, 'Real').checked, false);
});
test('duplicate Scope and duplicate live labels fail closed', () => {
  assert.throws(() => scanScope('## Scope\n- [ ] A\n## Scope\n- [ ] B'));
  assert.throws(() => resolveScopeTarget('## Scope\n- [ ] A\n## Other\n- [ ] A', 'A'));
  assert.throws(() => resolveScopeTarget('## Scope\n  - [ ] Indented', 'Indented'));
});
test('policy adoption is explicit and fenced policy examples stay legacy', () => {
  assert.equal(
    scanScope('## Scope\n```md\n<!-- aitm-scope-evidence-policy:v1 -->\n```\n- [ ] A').policy,
    'legacy'
  );
  assert.equal(scanScope('## Scope\n<!-- aitm-scope-evidence-policy:v1 -->\n- [ ] A').policy, 'v1');
  assert.throws(() =>
    scanScope(
      '## Scope\n<!-- aitm-scope-evidence-policy:v1 -->\n<!-- aitm-scope-evidence-policy:v1 -->'
    )
  );
});
test('every recognized verifier form stays on its existing execution-proof route', () => {
  for (const marker of [
    '<!-- aitm-verified cmd="x" -->',
    '<!-- aitm-verified-by: actor -->',
    '<!-- aitm-verified-at: time -->',
    '<!-- aitm-ac-evidence broken -->',
    '<!-- aitm-dod-evidence broken -->',
    'vc-list="vc:2"',
    '`vc:3`',
    '<!-- aitm-verified malformed',
  ])
    assert.equal(isVerifierBearingScopeTarget('- [ ] Verify ' + marker), true, marker);
  for (const label of ['Read the `npm test` example', 'Review vc:0', 'Review abcvc:1xyz'])
    assert.equal(isVerifierBearingScopeTarget('- [ ] ' + label), false, label);
});
test('target digest survives glyph and reviewed pointer changes but stales on other markers', () => {
  const base = '## Scope\n- [ ] A';
  const original = resolveScopeTarget(base, 'A');
  const pointer =
    '<!-- aitm-reviewed-scope-evidence comment="1" sha256="' +
    'a'.repeat(64) +
    '" lineage="' +
    'b'.repeat(64) +
    '" -->';
  assert.equal(
    resolveScopeTarget('## Scope\n- [x] A ' + pointer, 'A').contentDigest,
    original.contentDigest
  );
  assert.notEqual(
    resolveScopeTarget(base + ' <!-- other -->', 'A').contentDigest,
    original.contentDigest
  );
});

test('a duplicate unsupported checkbox cannot make an eligible label unique', () => {
  assert.throws(() => resolveScopeTarget('## Scope\n- [ ] A\n  - [X] A', 'A'));
});

test('policy-name prose does not adopt legacy Scope', () =>
  assert.equal(
    scanScope('## Scope\nUse `aitm-scope-evidence-policy:v1` for newly generated issues.\n- [ ] A')
      .policy,
    'legacy'
  ));

test('content identity keeps original trailing bytes while removing only pointer separator', () => {
  const body = '## Scope\n- [ ] A ';
  const pointer =
    '<!-- aitm-reviewed-scope-evidence comment="1" sha256="' +
    'a'.repeat(64) +
    '" lineage="' +
    'b'.repeat(64) +
    '" -->';
  const original = resolveScopeTarget(body, 'A');
  assert.notEqual(
    original.contentDigest,
    resolveScopeTarget('## Scope\n- [ ] A', 'A').contentDigest
  );
  assert.equal(original.contentDigest, resolveScopeTarget(body + ' ' + pointer, 'A').contentDigest);
});
