// @story #488
// Covers the shared Plan Metadata core (lib/plan-metadata.mjs): the
// section-scoped normalizer and the unbold-label lint that backs the
// enforcement warning and the back-fill audit.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePlanMetadataLine,
  normalizePlanMetadataValue,
  normalizePlanMetadataSection,
  findUnboldPlanMetadataLabels,
} from '../../../../task-tracker/lib/plan-metadata.mjs';

describe('normalizePlanMetadataLine (#488)', () => {
  it('bolds a bulleted label and preserves the bullet', () => {
    assert.equal(normalizePlanMetadataLine('- domain: x'), '- **domain**: x');
  });
  it('bolds a bare label', () => {
    assert.equal(normalizePlanMetadataLine('domain: x'), '**domain**: x');
  });
  it('is idempotent on bulleted + bare already-bold', () => {
    assert.equal(normalizePlanMetadataLine('- **domain**: x'), '- **domain**: x');
    assert.equal(normalizePlanMetadataLine('**domain**: x'), '**domain**: x');
  });
  it('leaves non-label lines untouched', () => {
    assert.equal(normalizePlanMetadataLine('just prose'), 'just prose');
  });
});

const BODY = [
  '## User Story',
  '',
  'As a maintainer',
  'note: this colon line is OUTSIDE the section and must stay plain',
  '',
  '## Plan Metadata',
  '',
  '- domain: tooling',
  '- root-cause: regex',
  '- **risk**: low',
  '',
  '## Acceptance Criteria',
  '',
  '- [ ] something: not a metadata label',
].join('\n');

describe('normalizePlanMetadataSection (#488)', () => {
  it('bolds only labels inside the Plan Metadata section', () => {
    const out = normalizePlanMetadataSection(BODY);
    assert.match(out, /- \*\*domain\*\*: tooling/);
    assert.match(out, /- \*\*root-cause\*\*: regex/);
    // Outside-section colon line and AC line untouched.
    assert.match(out, /\nnote: this colon line is OUTSIDE the section/);
    assert.match(out, /- \[ \] something: not a metadata label/);
  });
  it('is a no-op when the section is already fully bold', () => {
    const once = normalizePlanMetadataSection(BODY);
    assert.equal(normalizePlanMetadataSection(once), once);
  });
  it('returns the body unchanged when there is no Plan Metadata section', () => {
    const b = '## User Story\n\nfoo: bar';
    assert.equal(normalizePlanMetadataSection(b), b);
  });
});

describe('findUnboldPlanMetadataLabels (#488)', () => {
  it('returns the unbold labels in the section', () => {
    const found = findUnboldPlanMetadataLabels(BODY);
    assert.deepEqual(
      found.map((f) => f.label),
      ['domain', 'root-cause']
    );
  });
  it('returns [] when the section is fully bold', () => {
    assert.deepEqual(findUnboldPlanMetadataLabels(normalizePlanMetadataSection(BODY)), []);
  });
  it('returns [] when there is no section', () => {
    assert.deepEqual(findUnboldPlanMetadataLabels('## User Story\n\nfoo: bar'), []);
  });
});

describe('normalizePlanMetadataValue (#488)', () => {
  it('bolds every label line in a raw value (no heading scoping)', () => {
    assert.equal(
      normalizePlanMetadataValue('- domain: x\nprose\n- risk: low'),
      '- **domain**: x\nprose\n- **risk**: low'
    );
  });
});
