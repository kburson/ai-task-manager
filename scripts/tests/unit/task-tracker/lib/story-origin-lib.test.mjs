// @story #892
// Story Origin and Plan Metadata are adjacent flat-label sections with
// independent bounds. Story Origin remains amendable after creation.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  findUnboldStoryOriginLabels,
  hasStoryOriginFields,
  normalizeStoryOriginSection,
  normalizeStoryOriginValue,
  upsertStoryOriginField,
} from '../../../../task-tracker/lib/story-origin.mjs';
import {
  findUnboldPlanMetadataLabels,
  normalizePlanMetadataSection,
} from '../../../../task-tracker/lib/plan-metadata.mjs';

const ADJACENT = [
  '## Scope',
  '',
  'kind: prose outside both metadata sections',
  '',
  '## Story Origin',
  '',
  '- kind: code',
  '- discovered-during: #883',
  '',
  '## Plan Metadata',
  '',
  '- size: M',
  '- estimate: 8',
  '',
  '## Acceptance Criteria',
  '',
  '- [ ] metadata: labels outside both sections stay unchanged',
  '',
  '<!-- aitm-body-version version="7" -->',
].join('\n');

describe('Story Origin section bounds (#892)', () => {
  it('normalizes Story Origin without crossing into adjacent Plan Metadata', () => {
    const out = normalizeStoryOriginSection(ADJACENT);
    assert.match(out, /- \*\*kind\*\*: code/);
    assert.match(out, /- \*\*discovered-during\*\*: #883/);
    assert.match(out, /\n- size: M\n- estimate: 8\n/);
    assert.match(out, /\nkind: prose outside both metadata sections\n/);
  });

  it('normalizes Plan Metadata without crossing backward into Story Origin', () => {
    const out = normalizePlanMetadataSection(ADJACENT);
    assert.match(out, /\n- kind: code\n- discovered-during: #883\n/);
    assert.match(out, /- \*\*size\*\*: M/);
    assert.match(out, /- \*\*estimate\*\*: 8/);
  });

  it('reports unbold labels from each bounded section independently', () => {
    assert.deepEqual(
      findUnboldStoryOriginLabels(ADJACENT).map((entry) => entry.label),
      ['kind', 'discovered-during']
    );
    assert.deepEqual(
      findUnboldPlanMetadataLabels(ADJACENT).map((entry) => entry.label),
      ['size', 'estimate']
    );
  });

  it('requires a flat metadata field rather than comments or prose', () => {
    assert.equal(hasStoryOriginFields('## Story Origin\n\n<!-- marker -->\nplain prose\n'), false);
    assert.equal(hasStoryOriginFields('## Story Origin\n\n- **kind**: <!-- TODO -->\n'), false);
    assert.equal(hasStoryOriginFields('## Story Origin\n\n- **kind**: <!--\nTODO\n-->\n'), false);
    assert.equal(hasStoryOriginFields('## Story Origin\n\n- **kind**: code\n'), true);
  });

  it('accepts the legacy sanctioned colon-inside-bold field spelling', () => {
    assert.equal(hasStoryOriginFields('## Story Origin\n\n- **Kind:** code\n'), true);
    assert.equal(
      normalizeStoryOriginValue('- **Kind:** code\n- **Parent:** #883'),
      '- **Kind:** code\n- **Parent:** #883'
    );
  });
});

describe('Story Origin value normalization and amendment (#892)', () => {
  it('normalizes a raw create-time fragment', () => {
    assert.equal(
      normalizeStoryOriginValue('- kind: code\n- size-guess: M'),
      '- **kind**: code\n- **size-guess**: M'
    );
  });

  it('adds parent and later replaces it without disturbing markers', () => {
    const added = upsertStoryOriginField(ADJACENT, 'parent', '#883');
    assert.match(added, /- \*\*parent\*\*: #883/);
    assert.match(added, /<!-- aitm-body-version version="7" -->/);

    const amended = upsertStoryOriginField(added, 'parent', '#900');
    assert.match(amended, /- \*\*parent\*\*: #900/);
    assert.doesNotMatch(amended, /- \*\*parent\*\*: #883/);
    assert.equal((amended.match(/\*\*parent\*\*/g) || []).length, 1);
    assert.match(amended, /<!-- aitm-body-version version="7" -->/);
  });

  it('amends blocks while preserving the adjacent Plan Metadata bytes', () => {
    const out = upsertStoryOriginField(ADJACENT, 'blocks', '#860, #885');
    assert.match(out, /- \*\*blocks\*\*: #860, #885/);
    assert.match(out, /## Plan Metadata\n\n- size: M\n- estimate: 8/);
  });

  it('rejects invalid field keys', () => {
    assert.throws(() => upsertStoryOriginField(ADJACENT, 'not a key', 'value'), /metadata key/);
  });
});
