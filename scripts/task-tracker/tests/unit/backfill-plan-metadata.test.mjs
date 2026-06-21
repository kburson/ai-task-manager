// @story #488
// Covers the pure core of the Plan Metadata back-fill: buildPlanMetadataBackfill
// skips clean bodies, heals unbold ones (reporting the changed labels), and is
// idempotent under re-run.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPlanMetadataBackfill } from '../../backfill-plan-metadata.mjs';

const UNBOLD = [
  '## Plan Metadata',
  '',
  '- domain: tooling',
  '- root-cause: regex',
  '- **risk**: low',
  '',
  '## Acceptance Criteria',
].join('\n');

describe('buildPlanMetadataBackfill (#488)', () => {
  it('skips a body with no Plan Metadata section', () => {
    assert.deepEqual(buildPlanMetadataBackfill('## User Story\n\nfoo: bar'), {
      status: 'skip',
    });
  });

  it('skips a body whose section is already fully bold', () => {
    const bold = [
      '## Plan Metadata',
      '',
      '- **domain**: tooling',
      '',
      '## Acceptance Criteria',
    ].join('\n');
    assert.deepEqual(buildPlanMetadataBackfill(bold), { status: 'skip' });
  });

  it('heals an unbold section and reports the changed labels', () => {
    const res = buildPlanMetadataBackfill(UNBOLD);
    assert.equal(res.status, 'healed');
    assert.deepEqual(res.changed, ['domain', 'root-cause']);
    assert.match(res.body, /- \*\*domain\*\*: tooling/);
    assert.match(res.body, /- \*\*root-cause\*\*: regex/);
    // Already-bold label and the next section heading are preserved.
    assert.match(res.body, /- \*\*risk\*\*: low/);
    assert.match(res.body, /## Acceptance Criteria/);
  });

  it('is idempotent — healing the healed body is a skip', () => {
    const once = buildPlanMetadataBackfill(UNBOLD);
    assert.deepEqual(buildPlanMetadataBackfill(once.body), { status: 'skip' });
  });
});
