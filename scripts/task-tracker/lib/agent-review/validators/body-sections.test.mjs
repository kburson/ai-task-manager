// @story #810
// Tests for the V1 body-sections validator (#810).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from './body-sections.mjs';

// A well-formed body: all ten canonical sections, in order, each non-empty.
const WELL_FORMED = [
  '## User Story',
  'As a maintainer\nI want a gate\nSo that bodies stay well-formed',
  '## Scope',
  'Ship V1.',
  '## Story Origin',
  '- **kind**: code',
  '## Plan Metadata',
  '- **Size:** S',
  '## Pickup Directive — MANDATORY, DO NOT SKIP',
  '> Follow the directive.',
  '## Deep-Dive Analysis (2026-07-14)',
  'Design prose.',
  '## Acceptance Criteria',
  '- [ ] Does the thing.',
  '## Verification Commands',
  '- [ ] `node --test x.test.mjs` <!-- id=1 -->',
  '## Definition of Done',
  '- [ ] All tests pass',
  '## AITM Progress Markers',
  '<!-- aitm-entered-develop ts="2026-07-14T00:00:00Z" -->',
].join('\n\n');

test('passes a well-formed body with all ten sections in order', () => {
  const res = validate({ body: WELL_FORMED });
  assert.equal(res.pass, true, JSON.stringify(res.failures));
  assert.deepEqual(res.failures, []);
});

test('fails when Story Origin or Plan Metadata contains a nested heading', () => {
  for (const [needle, replacement, section] of [
    ['- **kind**: code', '- **kind**: code\n### Relationships\n- **parent**: #1', 'Story Origin'],
    ['- **Size:** S', '- **Size:** S\n#### Delivery\n- **wave**: 1', 'Plan Metadata'],
  ]) {
    const res = validate({ body: WELL_FORMED.replace(needle, replacement) });
    assert.equal(res.pass, false, section);
    assert.ok(res.failures.some((failure) => failure.includes(`${section}' must be flat`)));
  }
});

test('an all-HTML-comment section counts as non-empty', () => {
  // The AITM Progress Markers section is only markers — must still pass.
  const res = validate({ body: WELL_FORMED });
  assert.equal(res.pass, true);
});

test('fails and names a missing section', () => {
  const body = WELL_FORMED.replace(
    /## Deep-Dive Analysis \(2026-07-14\)\n\nDesign prose\.\n\n/,
    ''
  );
  const res = validate({ body });
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /Deep Dive.*missing/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('fails and names an empty section', () => {
  // Blank out the Scope section content.
  const body = WELL_FORMED.replace('## Scope\n\nShip V1.', '## Scope\n\n   ');
  const res = validate({ body });
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /Scope.*empty/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('fails and names an out-of-order pair', () => {
  // Swap Acceptance Criteria and Verification Commands blocks.
  const body = [
    '## User Story',
    'As a\nI want\nSo that',
    '## Scope',
    'x',
    '## Story Origin',
    '- **kind**: code',
    '## Plan Metadata',
    'x',
    '## Pickup Directive — MANDATORY, DO NOT SKIP',
    'x',
    '## Deep-Dive Analysis (2026-07-14)',
    'x',
    '## Verification Commands', // out of order: before Acceptance Criteria
    '- [ ] `cmd` <!-- id=1 -->',
    '## Acceptance Criteria',
    '- [ ] thing',
    '## Definition of Done',
    'x',
    '## AITM Progress Markers',
    '<!-- m -->',
  ].join('\n\n');
  const res = validate({ body });
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /Verification Commands.*before.*Acceptance Criteria/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('a `###` sub-heading does not delimit or satisfy a section', () => {
  // A body missing Scope but with a `### Scope` sub-heading must still fail —
  // only exactly-`##` headings count.
  const body = WELL_FORMED.replace('## Scope\n\nShip V1.', '### Scope\n\nShip V1.');
  const res = validate({ body });
  assert.equal(res.pass, false);
  assert.ok(res.failures.some((f) => /Scope.*missing/.test(f)));
});

test('fails when canonical checkbox sections are hidden inside a details block', () => {
  const body = [
    '## User Story',
    'As a maintainer\nI want a gate\nSo that bodies stay well-formed',
    '## Scope',
    'Ship V1.',
    '## Story Origin',
    '- **kind**: code',
    '## Plan Metadata',
    '- **Size:** S',
    '## Pickup Directive — MANDATORY, DO NOT SKIP',
    '> Follow the directive.',
    '## Deep-Dive Analysis (2026-07-14)',
    '<details>',
    '<summary>Deep dive</summary>',
    '',
    '## Acceptance Criteria',
    '- [x] Hidden criterion.',
    '## Verification Commands',
    '- [x] `node --test hidden.test.mjs` <!-- id=1 -->',
    '## Definition of Done',
    '- [x] Hidden DoD',
    '</details>',
    '## AITM Progress Markers',
    '<!-- aitm-entered-develop ts="2026-07-14T00:00:00Z" -->',
  ].join('\n\n');

  const res = validate({ body });
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /Acceptance Criteria/.test(f) && /inside.*details/i.test(f)),
    JSON.stringify(res.failures)
  );
});

test('fails when an unclosed deep-dive details block swallows root checkbox sections', () => {
  const body = WELL_FORMED.replace(
    '## Deep-Dive Analysis (2026-07-14)\n\nDesign prose.',
    [
      '## Deep-Dive Analysis (2026-07-14)',
      '',
      '<details>',
      '<summary>Deep dive</summary>',
      '',
      'Design prose.',
      '',
    ].join('\n')
  );

  const res = validate({ body });
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /details block opened before.*Acceptance Criteria/i.test(f)),
    JSON.stringify(res.failures)
  );
});

test('passes when a collapsed deep dive closes before root checkbox sections', () => {
  const body = WELL_FORMED.replace(
    '## Deep-Dive Analysis (2026-07-14)\n\nDesign prose.',
    [
      '## Deep-Dive Analysis (2026-07-14)',
      '',
      '<details>',
      '<summary>Deep dive</summary>',
      '',
      'Design prose.',
      '',
      '</details>',
    ].join('\n')
  );

  const res = validate({ body });
  assert.equal(res.pass, true, JSON.stringify(res.failures));
});

test('fails when Story Origin is missing', () => {
  const body = WELL_FORMED.replace('## Story Origin\n\n- **kind**: code\n\n', '');
  const res = validate({ body });
  assert.equal(res.pass, false);
  assert.ok(res.failures.some((f) => /Story Origin.*missing/.test(f)));
});

test('fails when Story Origin follows Plan Metadata', () => {
  const body = WELL_FORMED.replace(
    ['## Story Origin', '', '- **kind**: code', '', '## Plan Metadata', '', '- **Size:** S'].join(
      '\n'
    ),
    ['## Plan Metadata', '', '- **Size:** S', '', '## Story Origin', '', '- **kind**: code'].join(
      '\n'
    )
  );
  const res = validate({ body });
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /Plan Metadata.*before.*Story Origin/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('bootstrap registers the validator on the shared singleton', async () => {
  await import('../bootstrap.mjs');
  const { registry } = await import('../registry.mjs');
  assert.ok(
    registry.validators().some((v) => v.id === 'body-sections'),
    'body-sections not registered'
  );
});
