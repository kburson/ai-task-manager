// @story #1213 #1339
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  stampRefinementSnapshot,
  verifyRefinementSnapshot,
} from '../../../../task-tracker/lib/refinement-snapshot.mjs';

const TS = '2026-08-12T12:00:00.000Z';
const RATIONALE = {
  size: 'M',
  estimate: '8',
  priority: 'p1',
  rank: 4,
  rationale: 'current architecture',
};

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function refinedBody({ blocker = null, blockedField = null } = {}) {
  return `<!-- aitm-refinement-rationale: ${JSON.stringify(RATIONALE)} -->

## Scope

Implement the governed R4P boundary.

## Plan Metadata

- **Depends On**: #1212

## Acceptance Criteria

- [ ] Snapshot is current.
- [ ] Plan cancellation is recoverable.

## Definition of Done

- [ ] Acceptance criteria met.

${blocker ? `<!-- aitm-blocked-by refs="#${blocker}" -->\n` : ''}<!-- aitm-fields: {"schema":1,"values":{"priority":"P1","size":"M","estimate":8,"rank":4,"blockedBy":${JSON.stringify(blockedField)}}} -->
`;
}

function legacySnapshot({ blocker = null } = {}) {
  const blockedBy = blocker ? `#${blocker}` : null;
  const body = refinedBody({ blocker, blockedField: blockedBy });
  const provenance = sha256(JSON.stringify(RATIONALE));
  const digest = sha256(
    JSON.stringify({
      scope: 'Implement the governed R4P boundary.',
      acceptanceCriteria: '- [ ] Snapshot is current.\n- [ ] Plan cancellation is recoverable.',
      fields: { priority: 'P1', size: 'M', estimate: 8, rank: 4, blockedBy },
      dependencies: '- **Depends On**: #1212',
      labels: blocker ? ['blocked', 'enhancement'] : ['enhancement'],
      provenance,
    })
  );
  return `${body.trimEnd()}\n<!-- aitm-refinement-snapshot schema="1" digest="${digest}" provenance="${provenance}" priority="P1" size="M" estimate="8" rank="4" blocked-by="${blockedBy ?? ''}" ts="${TS}" -->\n`;
}

test('schema-1 unblocked snapshots retain their original dependency digest semantics', () => {
  const verified = verifyRefinementSnapshot(legacySnapshot(), { labels: ['enhancement'] });
  assert.equal(verified.ok, true, verified.reason);
  assert.equal(verified.snapshot.schema, '1');
});

test('schema-1 blocked snapshots require matching live protected-marker evidence', () => {
  const legacy = legacySnapshot({ blocker: 1212 });
  assert.equal(verifyRefinementSnapshot(legacy, { labels: ['BLOCKED', 'enhancement'] }).ok, true);
  assert.equal(
    verifyRefinementSnapshot(legacy.replace('refs="#1212"', 'refs="#1213"'), {
      labels: ['BLOCKED', 'enhancement'],
    }).ok,
    false
  );
});

test('schema-2 snapshots use only the protected blocker marker as dependency authority', () => {
  const stamped = stampRefinementSnapshot(refinedBody({ blocker: 1212 }), {
    labels: ['BLOCKED', 'enhancement'],
    ts: TS,
  });
  assert.match(stamped, /aitm-refinement-snapshot schema="2"/);
  const proseOnlyChange = stamped.replace('**Depends On**: #1212', '**Depends On**: #9999');
  assert.equal(
    verifyRefinementSnapshot(proseOnlyChange, { labels: ['BLOCKED', 'enhancement'] }).ok,
    true
  );
});

test('refinement snapshots reject malformed and duplicate protected blocker markers', () => {
  const stamped = stampRefinementSnapshot(refinedBody({ blocker: 1212 }), {
    labels: ['BLOCKED', 'enhancement'],
    ts: TS,
  });
  const malformed = stamped.replace('refs="#1212"', 'refs="#1212,garbage"');
  const duplicate = stamped.replace(
    '<!-- aitm-blocked-by refs="#1212" -->',
    '<!-- aitm-blocked-by refs="#1212" -->\n<!-- aitm-blocked-by refs="#1213" -->'
  );

  for (const body of [malformed, duplicate]) {
    const verified = verifyRefinementSnapshot(body, { labels: ['BLOCKED', 'enhancement'] });
    assert.equal(verified.ok, false);
    assert.match(verified.reason, /blocked marker/i);
  }
});
