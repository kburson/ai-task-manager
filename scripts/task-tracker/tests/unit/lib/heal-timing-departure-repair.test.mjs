// @story #1107
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  findUnpairedReengagements,
  repairMissingDeparture,
} from '../../../lib/heal-timing-departure.mjs';
import { runHealDeparture } from '../../../heal-timing-departure.mjs';

const fixture = readFileSync(
  new URL('../../../tests/fixtures/timing-departure-gap-1099.txt', import.meta.url),
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
  /\| 2026-08-04 21:35:23 -05:00 \| pause:question \| {2}\| {2}\| {2}\| 10,900 \| repaired missing departure \| <!-- row-sec: a=0 i=0 -->/
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

console.log('heal-timing-departure-repair.test.mjs: all passed');
