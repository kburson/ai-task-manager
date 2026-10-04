// @story #1857
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);
import test from 'node:test';
import assert from 'node:assert/strict';
import { timingActorKey, timingActorMarker } from '../../../../task-tracker/lib/timing-actor.mjs';
import { deriveActorEngagement } from '../../../../task-tracker/lib/timing-engagement.mjs';
import { readOutcomeTimingRows } from '../../../../task-tracker/lib/estimation/outcome-record.mjs';
import { reconcileRuntimeMigrationTiming } from '../../../../task-tracker/lib/runtime-migration-timing.mjs';

const owner = {
  provider: 'codex',
  sid: 'fixture-migrator',
  pid: 42,
  processToken: 'fixture-token',
};
const other = { ...owner, sid: 'fixture-other' };
const at = (seconds) => new Date(Date.parse('2026-10-01T00:00:00Z') + seconds * 1000).toISOString();
const row = (seconds, event, actor) =>
  '| ' +
  at(seconds).replace('T', ' ').replace('.000Z', ' +00:00') +
  ' | ' +
  event +
  ' | 0 | 0 | 0 | fixture |' +
  timingActorMarker(actor) +
  ' <!-- row-sec: a=0 i=0 -->';
const body =
  [
    row(0, 'start', owner),
    row(10, 'start', other),
    row(30, 'pause:blocked', other),
    row(40, 'pause:blocked', owner),
  ].join('\n') + '\n';
const plan = {
  writerObservation: {
    complete: true,
    claims: [
      { ...owner, issue: '1857', entryStartTs: at(0), reason: 'session-binding' },
      { ...other, issue: '1857', entryStartTs: at(10), reason: 'session-binding' },
    ],
  },
};
const intervals = [
  { owner, startedAt: at(10), endedAt: at(30), durationMs: 20000, basis: 'process-engagement' },
];
const source = {
  status: 'found',
  source: { repository: 'o/r', issue: 1857, commentNodeId: 'IC_fixture', body },
};
const run = (extra = {}) =>
  reconcileRuntimeMigrationTiming({
    plan,
    intervals,
    repository: 'o/r',
    transactionId: 'migration-fixture',
    idempotencyKey: 'migration-fixture:engagement',
    readTimingSource: async () => source,
    ...extra,
  });

test('migration coverage reuses the genuine same-actor span without adding or posting work', async () => {
  const result = await run();
  assert.equal(result.status, 'confirmed');
  assert.equal(result.coverage[0].coveredMs, 20000);
  assert.equal(result.coverage[0].addedMs, 0);
  assert.equal(result.coverage[0].actorKey, timingActorKey(owner));
  assert.match(result.coverage[0].sourceDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(deriveActorEngagement(readOutcomeTimingRows(body), at(40)).engagedMs, 60000);
  assert.deepEqual(await run(), result, 'exact retry is observation-only and deterministic');
  assert.equal(
    JSON.stringify(result).includes(owner.sid),
    false,
    'public coverage uses opaque actors'
  );
});

test('a different actor cannot cover migration and an open ordinary span remains pending', async () => {
  const foreignOnly = {
    ...source,
    source: {
      ...source.source,
      body: row(0, 'start', other) + '\n' + row(40, 'pause:blocked', other) + '\n',
    },
  };
  assert.equal(
    (await run({ readTimingSource: async () => foreignOnly })).reason,
    'ordinary-engagement-not-yet-covered'
  );
  const open = { ...source, source: { ...source.source, body: row(0, 'start', owner) + '\n' } };
  assert.equal((await run({ readTimingSource: async () => open })).status, 'pending');
});

test('unknown interruption, absent original attribution and conflicting issue claims never become zero or confirmed', async () => {
  assert.equal(
    (await run({ intervals: [{ ...intervals[0], endedAt: null, durationMs: null }] })).reason,
    'migration-interval-incomplete'
  );
  assert.equal(
    (await run({ plan: { writerObservation: { complete: true, claims: [] } } })).reason,
    'migration-attribution-unavailable'
  );
  const ambiguous = structuredClone(plan);
  ambiguous.writerObservation.claims.push({
    ...ambiguous.writerObservation.claims[0],
    issue: '1858',
  });
  assert.equal((await run({ plan: ambiguous })).reason, 'migration-attribution-unavailable');
});

test('canonical unavailable, wrong-issue and malformed timing evidence stay pending with explicit reasons', async () => {
  assert.equal(
    (await run({ readTimingSource: async () => ({ status: 'error' }) })).reason,
    'canonical-timing-unavailable'
  );
  assert.equal(
    (
      await run({
        readTimingSource: async () => ({ ...source, source: { ...source.source, issue: 1858 } }),
      })
    ).reason,
    'canonical-timing-unavailable'
  );
  assert.equal(
    (
      await run({
        readTimingSource: async () => ({
          ...source,
          source: { ...source.source, body: body + '| invalid | pause |\n' },
        }),
      })
    ).reason,
    'canonical-timing-invalid'
  );
});
