// @story #1341
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  stampRefinementSnapshot,
  verifyRefinementSnapshot,
  verifyLegacyRefinementSnapshotForBlockerRefresh,
} from '../../../../task-tracker/lib/refinement-snapshot.mjs';
import {
  appendRefinementHistory,
  buildRefinementHistoryRecord,
  parseRefinementHistory,
  refinementHistoryMatchesSource,
} from '../../../../task-tracker/lib/refinement-history.mjs';

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

const HISTORY_SOURCE = {
  title: 'Refresh stale blocker evidence',
  fields: { priority: 'P1', size: 'M', estimate: 8, rank: 4 },
  labels: ['BLOCKED', 'enhancement'],
  previousOwner: 'alice',
  sourceState: 'ready-for-plan',
};

function migrationHistoryRecord(overrides = {}) {
  return buildRefinementHistoryRecord({
    tx: 'tx-1341-migration',
    issueNumber: 1341,
    body: legacySnapshot({ liveBlockers: [1212, 1213] }),
    reason: 'Refresh stale blocker evidence',
    baseSha: '1341abc000000000000000000000000000000000',
    createdAt: TS,
    migration: 'legacy-blocker-refresh',
    liveBlockedBy: [1212, 1213],
    ...HISTORY_SOURCE,
    ...overrides,
  });
}

function sealedHistoryBody(record, rewrite) {
  const changed = rewrite({
    ...record,
    liveBlockedBy: record.liveBlockedBy && [...record.liveBlockedBy],
  });
  const { digest: _digest, ...payload } = changed;
  const digest = sha256(JSON.stringify(payload));
  const sealed = { ...payload, digest };
  return historyBodyWithDigest(sealed, digest);
}

function historyBodyWithDigest(record, digest = record.digest) {
  const sealed = { ...record, digest };
  const encoded = Buffer.from(JSON.stringify(sealed), 'utf8').toString('base64url');
  return `<!-- aitm-refinement-history schema="1" tx="${sealed.tx}" digest="${digest}" payload="${encoded}" -->`;
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

test('refuses schema-1 snapshot marker field tampering', () => {
  const legacy = legacySnapshot({ liveBlockers: [1212] });

  for (const tampered of [
    legacy.replace('priority="P1"', 'priority="P2"'),
    legacy.replace('size="M"', 'size="L"'),
    legacy.replace('estimate="8"', 'estimate="13"'),
    legacy.replace('rank="4"', 'rank="5"'),
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

test('migration history records explicitly authenticate the legacy blocker refresh and canonical live blockers', () => {
  const record = migrationHistoryRecord();

  assert.equal(record.migration, 'legacy-blocker-refresh');
  assert.deepEqual(record.liveBlockedBy, [1212, 1213]);
  assert.deepEqual(parseRefinementHistory(appendRefinementHistory('', record)), [record]);
});

test('migration history refuses missing, malformed, duplicate, or non-canonical live blocker evidence', () => {
  for (const overrides of [
    { liveBlockedBy: undefined },
    { liveBlockedBy: [] },
    { liveBlockedBy: ['1212'] },
    { liveBlockedBy: [0] },
    { liveBlockedBy: [1212, 1212] },
    { liveBlockedBy: [1213, 1212] },
  ]) {
    assert.throws(
      () => migrationHistoryRecord(overrides),
      /migration.*liveBlockedBy|liveBlockedBy.*migration/i
    );
  }

  const record = migrationHistoryRecord();
  for (const rewrite of [
    (candidate) => ({ ...candidate, migration: 'other-refresh' }),
    (candidate) => {
      delete candidate.liveBlockedBy;
      return candidate;
    },
    (candidate) => ({ ...candidate, liveBlockedBy: [1212, 1212] }),
  ]) {
    assert.throws(
      () => parseRefinementHistory(sealedHistoryBody(record, rewrite)),
      /migration evidence|liveBlockedBy/i
    );
  }
});

test('migration blocker evidence is digest-authenticated and source-matched', () => {
  const record = migrationHistoryRecord();
  const altered = { ...record, liveBlockedBy: [1212, 1214] };

  assert.throws(() => parseRefinementHistory(historyBodyWithDigest(altered)), /digest/i);
  const [resealed] = parseRefinementHistory(sealedHistoryBody(record, () => altered));
  assert.equal(
    refinementHistoryMatchesSource(record, {
      ...HISTORY_SOURCE,
      body: legacySnapshot({ liveBlockers: [1212, 1213] }),
      liveBlockedBy: [1212, 1213],
    }),
    true
  );
  assert.equal(
    refinementHistoryMatchesSource(resealed, {
      ...HISTORY_SOURCE,
      body: legacySnapshot({ liveBlockers: [1212, 1213] }),
      liveBlockedBy: [1212, 1213],
    }),
    false
  );
  assert.equal(
    refinementHistoryMatchesSource(resealed, {
      ...HISTORY_SOURCE,
      body: legacySnapshot({ liveBlockers: [1212, 1214] }),
      liveBlockedBy: [1212, 1214],
    }),
    false
  );
});
