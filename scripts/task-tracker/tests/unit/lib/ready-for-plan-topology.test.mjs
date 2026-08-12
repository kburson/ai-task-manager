// @story #1211
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  stateIds,
  stateConfigKey,
  normalizeStateId,
  forwardTarget,
  backwardTargets,
} from '../../../lib/lifecycle-policy/index.mjs';
import { PHASE_EVENTS } from '../../../phase-events.mjs';
import {
  STAGES,
  OPTIONAL_CONTIGUITY_STAGES,
  markerStagePattern,
  parseEntryMarkers,
} from '../../../lib/stage-entry-markers.mjs';
import { STATES } from '../../../states/index.mjs';

const EXPECTED = [
  'backlog',
  'refine',
  'ready-for-plan',
  'plan',
  'develop',
  'test',
  'review',
  'done',
];

test('canonical lifecycle places Ready for Planning between Refine and Plan', () => {
  assert.deepEqual([...stateIds()], EXPECTED);
  assert.deepEqual(STAGES, EXPECTED);
  assert.deepEqual(Object.keys(STATES), EXPECTED);
  assert.equal(STATES['ready-for-plan'].name, 'ready-for-plan');
  assert.equal(forwardTarget('refine'), 'ready-for-plan');
  assert.equal(forwardTarget('ready-for-plan'), 'plan');
  assert.deepEqual([...backwardTargets('ready-for-plan')], ['backlog']);
});

test('canonical state and config serialization use only Ready for Planning vocabulary', () => {
  assert.equal(stateConfigKey('ready-for-plan'), 'kanbanOptionReadyForPlan');
  assert.equal(stateConfigKey('assigned'), undefined);
  assert.equal(PHASE_EVENTS['ready-for-plan'].enter.event, 'ready-for-plan:started');
  assert.equal(PHASE_EVENTS.assigned, undefined);
  assert.deepEqual([...OPTIONAL_CONTIGUITY_STAGES], ['ready-for-plan']);
  assert.equal(markerStagePattern('ready-for-plan'), '(?:ready-for-plan|assigned|on-deck)');
});

test('historical Assigned and On Deck values normalize and parse without rewriting bytes', () => {
  assert.equal(normalizeStateId('Assigned'), 'ready-for-plan');
  assert.equal(normalizeStateId('On Deck'), 'ready-for-plan');
  assert.equal(normalizeStateId('ready-for-plan'), 'ready-for-plan');
  const source = [
    '<!-- aitm-entered-assigned ts="2026-08-01T00:00:00Z" -->',
    '<!-- aitm-entered-on-deck ts="2026-08-02T00:00:00Z" -->',
  ].join('\n');
  assert.deepEqual(
    parseEntryMarkers(source).map(({ stage }) => stage),
    ['ready-for-plan', 'ready-for-plan']
  );
  assert.match(source, /entered-assigned/);
  assert.match(source, /entered-on-deck/);
});

test('packaged configuration authors the canonical R4P key and retains the existing option id', () => {
  const cfg = JSON.parse(readFileSync('.ai-task-manager/task-tracker.json', 'utf8'));
  assert.equal(cfg.kanbanOptionReadyForPlan, 'f627e155');
  assert.equal(Object.hasOwn(cfg, 'kanbanOptionAssigned'), false);
});

test('this topology child contains no live board migration execution', () => {
  const plan = readFileSync(
    'docs/superpowers/plans/2026-08-11-ready-for-planning-ownership-lifecycle.md',
    'utf8'
  );
  assert.match(plan, /final migration child owns those writes|Live Board Migration/i);
  assert.doesNotMatch(
    readFileSync('scripts/task-tracker/lib/lifecycle-policy/states.mjs', 'utf8'),
    /updateProjectV2ItemFieldValue|updateProjectV2Field/
  );
});

test('the named eight-state integration flow consumes canonical lifecycle authority', () => {
  const source = readFileSync(
    'scripts/task-tracker/tests/integration/gh/lib/eight-state-flow.test.mjs',
    'utf8'
  );
  assert.match(source, /import \{ stateIds \}/);
  assert.match(source, /const STATES = \[\.\.\.stateIds\(\)\]/);
  assert.doesNotMatch(source, /Backlog → Assigned → Refine/);
  assert.doesNotMatch(source, /p\.move\([^\n]+, 'assigned'\)/);
});
