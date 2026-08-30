// @story #1107
// @story #1187
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  findUnpairedReengagements,
  repairMissingDeparture,
} from '../../../../task-tracker/lib/heal-timing-departure.mjs';
import { runHealDeparture } from '../../../../task-tracker/heal-timing-departure.mjs';
import { validate as validateTimingSequence } from '../../../../task-tracker/lib/agent-review/validators/timing-log-sequence.mjs';

const repairModule = await import('../../../../task-tracker/lib/heal-timing-departure.mjs');

const fixture = readFileSync(
  new URL('../../../fixtures/timing-departure-gap-1099.txt', import.meta.url),
  'utf8'
);

const candidates = findUnpairedReengagements(fixture);
assert.equal(candidates.length, 1, 'the #1099 fixture contains one missing departure');
assert.equal(candidates[0].rowIndex, 1, 'rowIndex is the zero-based timing-row index');
assert.equal(candidates[0].event, 'resume:question');

const repaired = repairMissingDeparture(fixture, {
  event: 'pause:question',
  description: 'repaired missing departure',
});
assert.match(
  repaired,
  /\| 2026-08-04 21:35:23 -05:00 \| pause:question \| {2}\| {2}\| {2}\| 10,900 \| repaired missing departure \| — \| <!-- row-sec: a=0 i=0 -->/
);
assert.equal(findUnpairedReengagements(repaired).length, 0, 'the repaired log is paired');
assert.throws(
  () => repairMissingDeparture(repaired, { rowIndex: 2, event: 'pause:question' }),
  /departure already present/i,
  'a second repair must refuse an already-paired reengagement'
);

const ambiguous = fixture.replace(
  '| 2026-08-04 21:40:00 -05:00 | pause:question',
  '| 2026-08-04 21:40:00 -05:00 | develop:started'
);
assert.equal(findUnpairedReengagements(ambiguous).length, 2);
assert.throws(
  () => repairMissingDeparture(ambiguous, { event: 'pause:question' }),
  /ambiguous.*2 unpaired reengagements/i
);
const targeted = repairMissingDeparture(ambiguous, {
  rowIndex: 3,
  event: 'pause:question',
  description: 'selected second gap',
});
assert.match(targeted, /selected second gap/);
assert.equal(findUnpairedReengagements(targeted).length, 1, 'only the selected gap is repaired');

assert.throws(
  () =>
    repairMissingDeparture(fixture.replace('resume:question', 'develop:completed'), {
      event: 'pause:question',
    }),
  /no unpaired reengagement/i
);

function fakeDeps(body) {
  const updates = [];
  return {
    updates,
    findTimingComment: async () => ({ id: 'IC_1099', body }),
    updateTimingComment: async (id, repo, nextBody) => updates.push({ id, repo, body: nextBody }),
  };
}

{
  const deps = fakeDeps(fixture);
  const result = await runHealDeparture({
    issueNumber: 1099,
    repo: 'kburson/ai-task-manager',
    apply: false,
    event: 'pause:question',
    description: 'repaired missing departure',
    deps,
  });
  assert.equal(result.status, 'dry-run');
  assert.equal(result.candidatesBefore, 1);
  assert.equal(result.candidatesAfter, 0);
  assert.equal(deps.updates.length, 0, 'dry-run must not mutate GitHub');
}

{
  const deps = fakeDeps(fixture);
  const result = await runHealDeparture({
    issueNumber: 1099,
    repo: 'kburson/ai-task-manager',
    apply: true,
    event: 'pause:question',
    description: 'repaired missing departure',
    deps,
  });
  assert.equal(result.status, 'healed');
  assert.equal(deps.updates.length, 1, 'apply writes exactly once');
  assert.equal(findUnpairedReengagements(deps.updates[0].body).length, 0);
}

// #1187 — an explicit departure timestamp.
{
  const placed = repairMissingDeparture(fixture, {
    event: 'pause:question',
    description: 'left for a sibling issue',
    ts: '2026-08-04 21:33:00 -05:00',
  });
  assert.match(
    placed,
    /\| 2026-08-04 21:33:00 -05:00 \| pause:question \|/,
    '--at lands the departure at exactly the supplied timestamp'
  );
  assert.equal(findUnpairedReengagements(placed).length, 0, 'the placed departure still pairs');
}

{
  const defaulted = repairMissingDeparture(fixture, { event: 'pause:question' });
  assert.match(
    defaulted,
    /\| 2026-08-04 21:35:23 -05:00 \| pause:question \|/,
    'omitting ts keeps the historical reengagement-minus-one-second default'
  );
}

// #1442 — whole-second logs can have no representable timestamp between the
// preceding row and the reengagement. The historical minus-one-second default
// must refuse instead of manufacturing an out-of-order departure.
{
  const sameSecond = fixture.replace(
    '2026-08-04 21:32:10 -05:00 | issue:wrap',
    '2026-08-04 21:35:24 -05:00 | issue:wrap'
  );
  assert.throws(
    () => repairMissingDeparture(sameSecond, { event: 'pause:question' }),
    /no timestamp falls strictly between/i,
    'the default repair fails before mutation when the interval has no whole second'
  );
}

for (const [ts, label] of [
  ['2026-08-04 21:32:10 -05:00', 'equal to the preceding row'],
  ['2026-08-04 21:35:24 -05:00', 'equal to the reengagement'],
  ['2026-08-04 21:30:00 -05:00', 'before the preceding row'],
  ['2026-08-04 21:44:00 -05:00', 'after the reengagement'],
]) {
  const before = fixture;
  assert.throws(
    () => repairMissingDeparture(fixture, { event: 'pause:question', ts }),
    /must fall strictly between/i,
    `a departure timestamp ${label} is rejected, not clamped`
  );
  assert.equal(fixture, before, 'a rejected repair leaves the body byte-identical');
}

assert.throws(
  () => repairMissingDeparture(fixture, { event: 'pause:question', ts: 'not-a-timestamp' }),
  /not readable/i,
  'an unparseable timestamp is rejected'
);

// #1442 — recover the exact malformed pair already written by the old healer.
{
  assert.equal(
    typeof repairModule.recoverRedundantSameSecondPair,
    'function',
    'the pure recovery transform is exported'
  );
  const malformed = [
    '⏱ Timing Log',
    '',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Full Word Marker |',
    '|---|---|---|---|---|---|---|---|',
    '| 2026-08-30 11:50:39 -05:00 | start |  |  | 0 | 22,701 | agent | 545,320 | <!-- row-sec: a=0 i=0 -->',
    '| 2026-08-30 11:53:54 -05:00 | plan:started |  |  | 1 | 22,752 | plan started | 552,835 | <!-- row-sec: a=0 i=0 -->',
    '| 2026-08-30 11:57:32 -05:00 | pause:other |  |  | 46 | 22,798 | handoff | 559,132 | <!-- row-sec: a=0 i=0 -->',
    '| 2026-08-30 11:57:51 -05:00 | plan:completed | 0h 03m 38s | 0h 00m 19s | 53,605 | 76,403 | plan completed | 1,905,053 | <!-- row-sec: a=218 i=19 -->',
    '| 2026-08-30 11:57:50 -05:00 | pause:other |  |  |  | 76,403 | repaired handoff | 1,905,053 | <!-- row-sec: a=0 i=0 -->',
    '| 2026-08-30 11:57:51 -05:00 | resumed |  |  | 0 | 76,403 | resumed | 1,905,053 | <!-- row-sec: a=0 i=0 -->',
    '| 2026-08-30 11:57:51 -05:00 | develop:started |  |  | 0 | 76,403 | start development | 1,905,053 | <!-- row-sec: a=0 i=0 -->',
    '',
  ].join('\n');
  const context = (body) => ({
    comments: [{ body }],
    markers: { enteredStages: [{ stage: 'plan' }, { stage: 'develop' }] },
    body: '',
  });
  const before = validateTimingSequence(context(malformed));
  assert.equal(before.pass, false, 'the #1296-shaped malformed log fails Review validation');
  assert.ok(before.failures.some((failure) => /out-of-order/.test(failure)));

  const recovered = repairModule.recoverRedundantSameSecondPair(malformed, { rowIndex: 5 });
  assert.doesNotMatch(recovered, /repaired handoff/);
  assert.equal((recovered.match(/\| resumed \|/g) || []).length, 0);
  assert.match(recovered, /\| 2026-08-30 11:57:51 -05:00 \| plan:completed \|/);
  assert.match(recovered, /\| 2026-08-30 11:57:51 -05:00 \| develop:started \|/);
  assert.deepEqual(validateTimingSequence(context(recovered)), { pass: true, failures: [] });
  assert.throws(
    () => repairModule.recoverRedundantSameSecondPair(recovered, { rowIndex: 5 }),
    /does not identify|not a reengagement/i,
    'a second recovery refuses rather than deleting another pair'
  );
  assert.throws(
    () =>
      repairModule.recoverRedundantSameSecondPair(
        malformed.replace(
          'row-sec: a=0 i=0 -->\n| 2026-08-30 11:57:51 -05:00 | resumed',
          'row-sec: a=1 i=0 -->\n| 2026-08-30 11:57:51 -05:00 | resumed'
        ),
        { rowIndex: 5 }
      ),
    /zero-duration/i,
    'recovery refuses to erase a pair carrying recorded duration'
  );
  assert.throws(
    () =>
      repairModule.recoverRedundantSameSecondPair(
        malformed.replace('11:57:50 -05:00 | pause:other', '11:47:51 -05:00 | pause:other'),
        { rowIndex: 5 }
      ),
    /exactly one second/i,
    'recovery refuses an older departure that the historical default could not have written'
  );

  const dryDeps = fakeDeps(malformed);
  const dry = await runHealDeparture({
    issueNumber: 1296,
    repo: 'kburson/ai-task-manager',
    apply: false,
    rowIndex: 5,
    recoverRedundantSameSecondPair: true,
    deps: dryDeps,
  });
  assert.equal(dry.status, 'dry-run');
  assert.equal(dry.recoveredRows, 2);
  assert.equal(dryDeps.updates.length, 0, 'recovery remains dry-run-first');

  const applyDeps = fakeDeps(malformed);
  const applied = await runHealDeparture({
    issueNumber: 1296,
    repo: 'kburson/ai-task-manager',
    apply: true,
    rowIndex: 5,
    recoverRedundantSameSecondPair: true,
    deps: applyDeps,
  });
  assert.equal(applied.status, 'recovered');
  assert.equal(applyDeps.updates.length, 1, 'apply writes the exact recovery once');
  assert.deepEqual(validateTimingSequence(context(applyDeps.updates[0].body)), {
    pass: true,
    failures: [],
  });
}

// #1187 — the predecessor-less `start` row is never a repair candidate.
{
  const startLog = [
    '⏱ Timing Log',
    '',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
    '|---|---|---|---|---|---|---|',
    '| 2026-08-04 09:00:00 -05:00 | start |  |  |  | 100 | bound | <!-- row-sec: a=0 i=0 -->',
    '| 2026-08-04 09:10:00 -05:00 | develop:started | 10m 00s |  |  | 200 | develop | <!-- row-sec: a=600 i=0 -->',
    '| 2026-08-04 18:00:00 -05:00 | resumed | 8h 50m |  |  | 200 | back | <!-- row-sec: a=31800 i=0 -->',
    '',
  ].join('\n');
  const found = findUnpairedReengagements(startLog);
  assert.equal(found.length, 1, 'only the genuinely repairable reengagement is reported');
  assert.equal(found[0].rowIndex, 2, 'rowIndex 0 (the start row) is not offered as a target');
  const healedStart = repairMissingDeparture(startLog, {
    event: 'switch-out:#1151',
    ts: '2026-08-04 09:20:00 -05:00',
  });
  assert.match(
    healedStart,
    /\| 2026-08-04 09:20:00 -05:00 \| switch-out:#1151 \|/,
    'the single candidate resolves without --row-index'
  );
  assert.throws(
    () => repairMissingDeparture(startLog, { rowIndex: 0, event: 'pause:other' }),
    /no preceding Timing Log row/i,
    'selecting the start row explicitly still refuses — it was never repairable'
  );
}

console.log('heal-timing-departure-repair.test.mjs: all passed');
