// @story #1341
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  stampRefinementSnapshot,
  verifyRefinementSnapshot,
  verifyLegacyRefinementSnapshotForBlockerRefresh,
} from '../../../../task-tracker/lib/refinement-snapshot.mjs';

const TS = '2026-08-20T12:00:00.000Z';
const RATIONALE = {
  size: 'M',
  estimate: '8',
  priority: 'p1',
  rank: 4,
  rationale: 'historical refinement evidence',
};

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function refinedBody({ blockers = [], priority = 'P1', size = 'M', estimate = 8, rank = 4 } = {}) {
  const refs = blockers.map((blocker) => `#${blocker}`).join(',');
  return `<!-- aitm-refinement-rationale: ${JSON.stringify(RATIONALE)} -->

## Scope

Refresh only a blocked legacy refinement snapshot.

## Plan Metadata

- **Depends On**: #1212

## Acceptance Criteria

- [ ] Historical evidence remains authentic.

## Definition of Done

- [ ] Migration boundary is fail-closed.

${refs ? `<!-- aitm-blocked-by refs="${refs}" -->\n` : ''}<!-- aitm-fields: {"schema":1,"values":{"priority":"${priority}","size":"${size}","estimate":${estimate},"rank":${rank},"blockedBy":null}} -->
`;
}

function legacySnapshot({ liveBlockers = [], snapshotBlockedBy = '' } = {}) {
  const body = refinedBody({ blockers: liveBlockers });
  const provenance = sha256(JSON.stringify(RATIONALE));
  const digest = sha256(
    JSON.stringify({
      scope: 'Refresh only a blocked legacy refinement snapshot.',
      acceptanceCriteria: '- [ ] Historical evidence remains authentic.',
      fields: { priority: 'P1', size: 'M', estimate: 8, rank: 4, blockedBy: null },
      dependencies: '- **Depends On**: #1212',
      labels: ['enhancement'],
      provenance,
    })
  );
  return `${body.trimEnd()}\n<!-- aitm-refinement-snapshot schema="1" digest="${digest}" provenance="${provenance}" priority="P1" size="M" estimate="8" rank="4" blocked-by="${snapshotBlockedBy}" ts="${TS}" -->\n`;
}

test('accepts valid schema-1 core evidence whose only mismatch is a non-empty live blocker marker', () => {
  const body = legacySnapshot({ liveBlockers: [1212] });
  const labels = ['BLOCKED', 'enhancement'];
  const verified = verifyLegacyRefinementSnapshotForBlockerRefresh(body, {
    labels,
  });

  assert.equal(verified.ok, true, verified.reason);
  assert.equal(verified.snapshot.schema, '1');
  assert.equal(verified.legacyCoreValid, true);
  assert.equal(verified.blockerOnlyMismatch, true);
  assert.deepEqual(verified.liveBlockers, [1212]);
  assert.equal(verifyRefinementSnapshot(body, { labels }).ok, false);
});

test('refuses a legacy snapshot that was already serialized as blocked', () => {
  const verified = verifyLegacyRefinementSnapshotForBlockerRefresh(
    legacySnapshot({ liveBlockers: [1212], snapshotBlockedBy: '#1212' }),
    { labels: ['BLOCKED', 'enhancement'] }
  );

  assert.equal(verified.ok, false);
  assert.equal(verified.legacyCoreValid, true);
  assert.equal(verified.blockerOnlyMismatch, false);
  assert.match(verified.reason, /unblocked schema-1 snapshot/i);
});

test('refuses schema-2 snapshots for the legacy blocker refresh', () => {
  const schema2 = stampRefinementSnapshot(refinedBody({ blockers: [1212] }), {
    labels: ['BLOCKED', 'enhancement'],
    ts: TS,
  });
  const verified = verifyLegacyRefinementSnapshotForBlockerRefresh(schema2, {
    labels: ['BLOCKED', 'enhancement'],
  });

  assert.equal(verified.ok, false);
  assert.match(verified.reason, /schema-1/i);
});

test('refuses tampered schema-1 digest or provenance as unrelated staleness', () => {
  const legacy = legacySnapshot({ liveBlockers: [1212] });

  for (const tampered of [
    legacy.replace(/digest="[0-9a-f]{64}"/, `digest="${'d'.repeat(64)}"`),
    legacy.replace(/provenance="[0-9a-f]{64}"/, `provenance="${'e'.repeat(64)}"`),
  ]) {
    const verified = verifyLegacyRefinementSnapshotForBlockerRefresh(tampered, {
      labels: ['BLOCKED', 'enhancement'],
    });
    assert.equal(verified.ok, false);
    assert.equal(verified.legacyCoreValid, false);
    assert.equal(verified.blockerOnlyMismatch, false);
    assert.match(verified.reason, /stale refinement snapshot/i);
  }
});

test('refuses changed active refinement fields as unrelated staleness', () => {
  const changed = legacySnapshot({ liveBlockers: [1212] }).replace('"rank":4', '"rank":5');
  const verified = verifyLegacyRefinementSnapshotForBlockerRefresh(changed, {
    labels: ['BLOCKED', 'enhancement'],
  });

  assert.equal(verified.ok, false);
  assert.equal(verified.legacyCoreValid, false);
  assert.equal(verified.blockerOnlyMismatch, false);
  assert.match(verified.reason, /stale refinement snapshot/i);
});

test('refuses malformed or duplicate live blocker markers', () => {
  const legacy = legacySnapshot({ liveBlockers: [1212] });
  const duplicate = legacy.replace(
    '<!-- aitm-blocked-by refs="#1212" -->',
    '<!-- aitm-blocked-by refs="#1212" -->\n<!-- aitm-blocked-by refs="#1213" -->'
  );
  const malformed = legacy.replace('refs="#1212"', 'refs="#1212,garbage"');

  for (const body of [duplicate, malformed]) {
    const verified = verifyLegacyRefinementSnapshotForBlockerRefresh(body, {
      labels: ['BLOCKED', 'enhancement'],
    });
    assert.equal(verified.ok, false);
    assert.equal(verified.legacyCoreValid, true);
    assert.equal(verified.blockerOnlyMismatch, false);
    assert.match(verified.reason, /blocked marker/i);
  }
});

test('refuses an empty live blocker set', () => {
  const verified = verifyLegacyRefinementSnapshotForBlockerRefresh(legacySnapshot(), {
    labels: ['enhancement'],
  });

  assert.equal(verified.ok, false);
  assert.equal(verified.legacyCoreValid, true);
  assert.equal(verified.blockerOnlyMismatch, false);
  assert.match(verified.reason, /non-empty/i);
});
