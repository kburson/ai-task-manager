// @story #892
// Covers the one-shot migration that separates create-time Story Origin
// provenance from planning-time Plan Metadata.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPlanMetadataBackfill } from '../../../backfill-plan-metadata.mjs';

describe('buildPlanMetadataBackfill Story Origin migration (#892)', () => {
  it('moves legacy provenance into Story Origin and preserves planning fields and markers', () => {
    const legacy = [
      '## Scope',
      '',
      'Split the metadata.',
      '',
      '## Plan Metadata',
      '',
      '- kind: code',
      '- discovered-during: #883',
      '- related: #891',
      '- blocks: #860',
      '- parent: #883',
      '- size-note: L',
      '- size: M',
      '- estimate: 8',
      '- custom-planning: keep',
      '',
      '## Pickup Directive — MANDATORY, DO NOT SKIP',
      '',
      '> Follow the directive.',
      '',
      '<!-- aitm-fields: {"schema":1,"values":{}} -->',
    ].join('\n');

    const result = buildPlanMetadataBackfill(legacy);

    assert.equal(result.status, 'healed');
    assert.deepEqual(result.changed, [
      'kind',
      'discovered-during',
      'related',
      'blocks',
      'parent',
      'size-guess',
      'size',
      'estimate',
      'custom-planning',
    ]);
    assert.match(
      result.body,
      /## Story Origin\n\n- \*\*kind\*\*: code\n- \*\*discovered-during\*\*: #883\n- \*\*related\*\*: #891\n- \*\*blocks\*\*: #860\n- \*\*parent\*\*: #883\n- \*\*size-guess\*\*: L\n\n## Plan Metadata/
    );
    assert.match(
      result.body,
      /## Plan Metadata\n\n- \*\*size\*\*: M\n- \*\*estimate\*\*: 8\n- \*\*custom-planning\*\*: keep/
    );
    assert.doesNotMatch(result.body, /size-note/);
    assert.match(result.body, /<!-- aitm-fields: \{"schema":1,"values":\{\}\} -->/);
    assert.ok(result.body.indexOf('## Story Origin') < result.body.indexOf('## Plan Metadata'));
  });

  it('merges missing provenance into an existing Story Origin without overriding it', () => {
    const body = [
      '## Story Origin',
      '',
      '- **kind**: docs',
      '- **related**: #700',
      '',
      '## Plan Metadata',
      '',
      '- kind: code',
      '- related: #701',
      '- blocks: #702',
      '- size: S',
    ].join('\n');

    const result = buildPlanMetadataBackfill(body);

    assert.equal(result.status, 'healed');
    assert.equal(result.body.match(/\*\*kind\*\*:/g)?.length, 1);
    assert.equal(result.body.match(/\*\*related\*\*:/g)?.length, 1);
    assert.match(result.body, /- \*\*kind\*\*: docs/);
    assert.match(result.body, /- \*\*related\*\*: #700/);
    assert.match(result.body, /- \*\*blocks\*\*: #702/);
    assert.match(result.body, /## Plan Metadata\n\n- \*\*size\*\*: S/);
    assert.doesNotMatch(
      result.body.slice(result.body.indexOf('## Plan Metadata')),
      /\*\*(?:kind|related|blocks)\*\*:/
    );
  });

  it('skips a clean split body byte-for-byte', () => {
    const body = [
      '## Story Origin',
      '',
      '- **kind**: code',
      '',
      '## Plan Metadata',
      '',
      '- **size**: M',
      '- **estimate**: 8',
    ].join('\n');

    assert.deepEqual(buildPlanMetadataBackfill(body), { status: 'skip' });
  });

  it('skips a body without Plan Metadata', () => {
    const body = ['## Story Origin', '', '- kind: code', '', '## Scope', '', 'x'].join('\n');
    assert.deepEqual(buildPlanMetadataBackfill(body), { status: 'skip' });
  });

  it('is idempotent after relocating legacy provenance', () => {
    const body = ['## Plan Metadata', '', '- kind: code', '- size-note: M', '- estimate: 5'].join(
      '\n'
    );
    const once = buildPlanMetadataBackfill(body);

    assert.equal(once.status, 'healed');
    assert.deepEqual(buildPlanMetadataBackfill(once.body), { status: 'skip' });
  });

  it('preserves values from legacy colon-inside-bold provenance labels', () => {
    const body = [
      '## Plan Metadata',
      '',
      '- **Kind:** code',
      '- **Parent:** #883',
      '- **Size:** S',
    ].join('\n');
    const result = buildPlanMetadataBackfill(body);

    assert.equal(result.status, 'healed');
    assert.match(result.body, /- \*\*kind\*\*: code/);
    assert.match(result.body, /- \*\*parent\*\*: #883/);
    assert.doesNotMatch(result.body, /\*\* code|\*\* #883/);
  });

  it('inserts a populated Story Origin when legacy Plan Metadata has no provenance', () => {
    const body = [
      '## Scope',
      '',
      'Legacy planned issue.',
      '',
      '## Plan Metadata',
      '',
      '- **Size:** S',
      '- **Estimate:** 2',
    ].join('\n');
    const result = buildPlanMetadataBackfill(body);

    assert.equal(result.status, 'healed');
    assert.match(result.body, /## Story Origin\n\n- \*\*kind\*\*: code\n\n## Plan Metadata/);
    assert.match(result.body, /- \*\*Size:\*\* S/);
  });

  it('derives a missing Story Origin kind from the authoritative issue-kind marker', () => {
    const body = [
      '## Scope',
      '',
      'Investigate the behavior.',
      '',
      '## Plan Metadata',
      '',
      '- **size**: S',
      '',
      '## AITM Progress Markers',
      '',
      '<!-- aitm-issue-kind kind="research" -->',
    ].join('\n');

    const result = buildPlanMetadataBackfill(body);

    assert.equal(result.status, 'healed');
    assert.match(result.body, /## Story Origin\n\n- \*\*kind\*\*: research\n\n## Plan Metadata/);
    assert.doesNotMatch(result.body, /\*\*kind\*\*: code/);
  });

  it('relocates an existing Story Origin immediately before Plan Metadata', () => {
    const body = [
      '## Scope',
      '',
      'Partially migrated issue.',
      '',
      '## Plan Metadata',
      '',
      '- **size**: S',
      '',
      '## Acceptance Criteria',
      '',
      '- [ ] The migration converges.',
      '',
      '## Story Origin',
      '',
      '- **kind**: spike',
    ].join('\n');

    const once = buildPlanMetadataBackfill(body);

    assert.equal(once.status, 'healed');
    assert.match(
      once.body,
      /## Scope[\s\S]*## Story Origin\n\n- \*\*kind\*\*: spike\n\n## Plan Metadata\n\n- \*\*size\*\*: S\n\n## Acceptance Criteria/
    );
    assert.deepEqual(buildPlanMetadataBackfill(once.body), { status: 'skip' });
  });
});
