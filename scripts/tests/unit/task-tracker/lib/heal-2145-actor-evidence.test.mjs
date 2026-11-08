// @story #2145
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planActorEvidenceRecovery } from '../../../../task-tracker/lib/heal-actor-evidence-recovery.mjs';
import { parseTimingRow } from '../../../../task-tracker/lib/timing-row-reader.mjs';
import { deriveActorEngagement } from '../../../../task-tracker/lib/timing-engagement.mjs';
const original = JSON.parse(
  readFileSync(new URL('../../../fixtures/2026/aitm-2145-timing.json', import.meta.url), 'utf8')
).body;
const options = {
  profile: 'aitm-2145-2026-11-03',
  repo: 'kburson/ai-task-manager',
  issueNumber: 2145,
  commentId: 'IC_kwDOSU6LgM8AAAABicpVmw',
  now: Date.parse('2026-11-08T06:00:00.123Z'),
};
const actor = 'v1:68e116fec85fd2f53872162c7ebac004f3d5b9195bb3ef056617cef6e90848a1';
const plan = (body = original, extra = {}) =>
  planActorEvidenceRecovery(body, { ...options, ...extra });
test('2145 recovery retains every original byte, word marker and observed duration with Unknown endpoint', () => {
  const result = plan();
  assert.equal(result.inserted, 1);
  assert.ok(result.candidate.startsWith(original));
  const added = result.candidate.slice(original.length).trim();
  assert.equal(added.split('\n').length, 1);
  const row = parseTimingRow(added);
  assert.equal(row.ts, '2026-11-08 06:00:00 +00:00');
  assert.equal(row.actorKey, actor);
  assert.equal(row.event, 'session-end-recovery');
  assert.deepEqual(row.cells.slice(3, 7), ['Unknown', 'Unknown', '0', '32']);
  assert.equal(row.cells[8], '2,602');
  assert.equal(row.engagement, undefined);
  const before = deriveActorEngagement(
    original
      .split('\n')
      .map(parseTimingRow)
      .filter((x) => x?.actorKey),
    options.now
  );
  assert.equal(result.accounting.engagedMs, before.engagedMs);
  assert.deepEqual(result.accounting.incompleteActors, []);
  assert.equal(result.accounting.complete, false);
});
for (const extra of [
  { profile: 'other' },
  { repo: 'other/repo' },
  { issueNumber: 2055 },
  { commentId: 'IC_wrong' },
])
  test('2145 exact immutable profile identity refuses ' + JSON.stringify(extra), () => {
    assert.throws(() => plan(original, extra), new RegExp('profile-identity'));
  });
for (const [from, to] of [
  ['08:39:32', '08:39:33'],
  ['key=68e116', 'key=78e116'],
  ['| 32 | orchestrator', '| 33 | orchestrator'],
])
  test('2145 altered historical prefix refuses ' + from, () => {
    assert.throws(() => plan(original.replace(from, to)), new RegExp('historical-source-mismatch'));
  });
for (const now of [
  NaN,
  Infinity,
  -1,
  '2026-11-08',
  options.now + 0.5,
  Date.parse('2026-11-08T04:00:00Z'),
])
  test('2145 invalid or retroactive recording time refuses ' + now, () => {
    assert.throws(() => plan(original, { now }), new RegExp('recording-time'));
  });
test('2145 recovery is idempotent and conflicting or duplicate actor evidence refuses', () => {
  const first = plan();
  assert.equal(plan(first.candidate).inserted, 0);
  assert.equal(plan(first.candidate).candidate, first.candidate);
  const row = first.candidate.slice(original.length);
  assert.throws(() => plan(first.candidate + row), new RegExp('duplicate-recovery'));
  assert.throws(
    () => plan(first.candidate.replace('| 0 | 32 | prior', '| 1 | 32 | prior')),
    new RegExp('conflicting-recovery')
  );
  assert.throws(
    () => plan(original + row.replace('session-end-recovery', 'pause')),
    new RegExp('conflicting-evidence')
  );
});
