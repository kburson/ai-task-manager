#!/usr/bin/env node
// @story #138
// Unit tests for lib/lifecycle-dod.mjs (#138).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  parseLifecycleItems,
  parseFunctionalItems,
  tickLifecycleItem,
  untickLifecycleItem,
  detectLifecyclePretick,
  locateFunctionalSection,
  lifecycleItemState,
  LIFECYCLE_LABELS,
  LIFECYCLE_LABEL_SET,
  locateHousekeepingSection,
  locateLifecycleSection,
} from '../../../../task-tracker/lib/lifecycle-dod.mjs';

const TEMPLATE = [
  '## DoD',
  '',
  '#### Functional (verified at Test)',
  '- [x] All automated tests pass',
  '- [x] Acceptance criteria met',
  '',
  '#### Lifecycle (auto-ticked at Review/Close)',
  '- [ ] Passed final human review',
  '- [ ] Story closed and moved to Done',
  '- [ ] Timing data flushed to issue',
  '',
  '## Pickup Directive',
].join('\n');

const CANONICAL_TEMPLATE = [
  '## Definition of Done',
  '',
  '### Functional (verified at Test)',
  '',
  '- [ ] Acceptance criteria met',
  '',
  '### Lifecycle (verified at Review)',
  '',
  '- [ ] Agent Review Passed',
  '- [ ] Final Review Passed',
  '',
  '### Housekeeping (verified at Close)',
  '',
  '- [ ] Story closed and moved to Done',
  '- [ ] Timing data flushed to issue',
].join('\n');

// @story #982
test('#982 canonical sections expose all owned keys in document order', () => {
  assert.deepEqual(
    parseLifecycleItems(CANONICAL_TEMPLATE).map(({ key }) => key),
    ['agent-review-passed', 'passed-final-review', 'story-closed', 'timing-flushed']
  );
  assert.match(locateLifecycleSection(CANONICAL_TEMPLATE).section, /Agent Review Passed/);
  assert.doesNotMatch(locateLifecycleSection(CANONICAL_TEMPLATE).section, /Story closed/);
  assert.match(locateHousekeepingSection(CANONICAL_TEMPLATE).section, /Story closed/);
});

test('#982 canonical locators ignore descriptive lifecycle and housekeeping headings', () => {
  const body = [
    '## Deep-Dive Analysis',
    '### Lifecycle and operational boundaries',
    'Review prose.',
    '### Housekeeping notes',
    'Close prose.',
    CANONICAL_TEMPLATE,
  ].join('\n\n');

  assert.match(locateLifecycleSection(body).section, /Agent Review Passed/);
  assert.doesNotMatch(locateLifecycleSection(body).section, /Review prose/);
  assert.match(locateHousekeepingSection(body).section, /Story closed/);
  assert.doesNotMatch(locateHousekeepingSection(body).section, /Close prose/);
});

test('#982 ticks each key only in its owning canonical section', () => {
  const reviewed = tickLifecycleItem(CANONICAL_TEMPLATE, 'agent-review-passed');
  assert.match(reviewed, /### Lifecycle[\s\S]*- \[x\] Agent Review Passed/);
  assert.match(reviewed, /### Housekeeping[\s\S]*- \[ \] Story closed/);

  const closed = tickLifecycleItem(reviewed, 'story-closed');
  assert.match(closed, /### Housekeeping[\s\S]*- \[x\] Story closed and moved to Done/);
  assert.equal(lifecycleItemState({ body: closed, key: 'story-closed' }).alreadyTicked, true);
  assert.match(untickLifecycleItem(closed, 'story-closed'), /- \[ \] Story closed/);
});

test('#982 pre-tick detection scans Lifecycle and Housekeeping', () => {
  const body = tickLifecycleItem(
    tickLifecycleItem(CANONICAL_TEMPLATE, 'agent-review-passed'),
    'timing-flushed'
  );
  const result = detectLifecyclePretick(body);
  assert.deepEqual(
    result.regressions.map(({ key }) => key),
    ['agent-review-passed', 'timing-flushed']
  );
  assert.equal(result.body, CANONICAL_TEMPLATE);
});

test('#982 canonical sections take precedence over a duplicate legacy section', () => {
  const body = [
    '### Lifecycle (auto-ticked at Review/Close)',
    '- [ ] Agent Review Passed',
    '- [ ] Story closed and moved to Done',
    '',
    CANONICAL_TEMPLATE,
  ].join('\n');

  assert.equal(parseLifecycleItems(body).length, 4);
  const ticked = tickLifecycleItem(body, 'story-closed');
  const legacy = ticked.slice(0, ticked.indexOf('## Definition of Done'));
  assert.match(legacy, /- \[ \] Story closed and moved to Done/);
  assert.match(ticked.slice(ticked.indexOf('## Definition of Done')), /- \[x\] Story closed/);
});

test('parseLifecycleItems: returns three keys in order', () => {
  const items = parseLifecycleItems(TEMPLATE);
  assert.equal(items.length, 3);
  assert.deepEqual(
    items.map((i) => i.key),
    ['passed-final-review', 'story-closed', 'timing-flushed']
  );
  assert.ok(items.every((i) => !i.checked));
});

test('parseLifecycleItems: no Lifecycle section → empty array', () => {
  assert.deepEqual(parseLifecycleItems('## Scope\n\nno lifecycle here'), []);
});

test('tickLifecycleItem: ticks story-closed and leaves others alone', () => {
  const out = tickLifecycleItem(TEMPLATE, 'story-closed');
  assert.match(out, /- \[x\] Story closed and moved to Done/);
  assert.match(out, /- \[ \] Passed final human review/);
  assert.match(out, /- \[ \] Timing data flushed to issue/);
});

test('tickLifecycleItem: idempotent (already ticked → unchanged)', () => {
  const ticked = tickLifecycleItem(TEMPLATE, 'story-closed');
  const again = tickLifecycleItem(ticked, 'story-closed');
  assert.equal(again, ticked);
});

test('tickLifecycleItem: missing section → returns body unchanged', () => {
  const body = '## Scope\n\nno lifecycle here.';
  assert.equal(tickLifecycleItem(body, 'story-closed'), body);
});

test('tickLifecycleItem: unknown key → throws', () => {
  assert.throws(() => tickLifecycleItem(TEMPLATE, 'nope'), /unknown lifecycle key/);
});

test('parseFunctionalItems: extracts Functional sub-block items', () => {
  const items = parseFunctionalItems(TEMPLATE);
  assert.equal(items.length, 2);
  assert.equal(items[0].label, 'All automated tests pass');
  assert.ok(items.every((i) => i.checked));
});

test('parseFunctionalItems: no Functional section → empty array', () => {
  assert.deepEqual(parseFunctionalItems('## Scope\n\nno functional here'), []);
});

test('locateFunctionalSection: bounds end at next heading', () => {
  const loc = locateFunctionalSection(TEMPLATE);
  assert.ok(loc);
  assert.ok(loc.section.includes('All automated tests pass'));
  assert.ok(!loc.section.includes('Passed final human review'));
});

test('#1036 locateLifecycleSection ignores descriptive lifecycle headings', () => {
  const body = [
    '## Deep-Dive Analysis',
    '',
    '### Lifecycle and operational boundaries',
    '',
    'This prose section describes runtime boundaries.',
    '',
    TEMPLATE,
  ].join('\n');
  const loc = locateLifecycleSection(body);
  assert.ok(loc);
  assert.match(loc.section, /Passed final human review/);
  assert.doesNotMatch(loc.section, /runtime boundaries/);
});

test('untickLifecycleItem: reverses a tick (idempotent)', () => {
  const ticked = tickLifecycleItem(TEMPLATE, 'story-closed');
  const reverted = untickLifecycleItem(ticked, 'story-closed');
  assert.match(reverted, /- \[ \] Story closed and moved to Done/);
  const again = untickLifecycleItem(reverted, 'story-closed');
  assert.equal(again, reverted);
});

test('detectLifecyclePretick: ticked items → un-ticked + regressions reported', () => {
  let body = tickLifecycleItem(TEMPLATE, 'story-closed');
  body = tickLifecycleItem(body, 'timing-flushed');
  const r = detectLifecyclePretick(body);
  assert.equal(r.regressions.length, 2);
  assert.deepEqual(r.regressions.map((x) => x.key).sort(), ['story-closed', 'timing-flushed']);
  assert.match(r.body, /- \[ \] Story closed and moved to Done/);
  assert.match(r.body, /- \[ \] Timing data flushed to issue/);
});

test('detectLifecyclePretick: no ticks → empty regressions, body unchanged', () => {
  const r = detectLifecyclePretick(TEMPLATE);
  assert.equal(r.regressions.length, 0);
  assert.equal(r.body, TEMPLATE);
});

test('detectLifecyclePretick: no Lifecycle section (back-compat flat DoD) → no regressions', () => {
  const flat = '## DoD\n\n- [x] All tests pass\n- [x] Lint clean\n';
  const r = detectLifecyclePretick(flat);
  assert.equal(r.regressions.length, 0);
  assert.equal(r.body, flat);
});

test('LIFECYCLE_LABEL_SET: contains every canonical label and back-compat alias', () => {
  // #809 — four canonical labels (agent-review-passed, passed-final-review,
  // story-closed, timing-flushed) plus the one back-compat alias ("Passed final
  // human review") for the relabeled passed-final-review key.
  assert.equal(LIFECYCLE_LABEL_SET.size, 5);
  for (const label of Object.values(LIFECYCLE_LABELS)) {
    assert.ok(LIFECYCLE_LABEL_SET.has(label));
  }
  assert.ok(LIFECYCLE_LABEL_SET.has('Passed final human review'));
});

// #302 — lifecycleItemState: structural inspection without mutation. Lets
// `approve.mjs` distinguish "label genuinely missing" from "box already
// ticked" — both produce a no-op write in tickLifecycleItem.

test('lifecycleItemState: no Lifecycle section → sectionPresent=false', () => {
  const s = lifecycleItemState({ body: '## DoD\n', key: 'passed-final-review' });
  assert.deepEqual(s, { sectionPresent: false, labelFound: false, alreadyTicked: false });
});

test('lifecycleItemState: heading present but label absent (customized DoD)', () => {
  const body = [
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [ ] Story closed and moved to Done',
    '- [ ] Timing data flushed to issue',
    '',
    '## Pickup Directive',
  ].join('\n');
  const s = lifecycleItemState({ body, key: 'passed-final-review' });
  assert.deepEqual(s, { sectionPresent: true, labelFound: false, alreadyTicked: false });
});

test('lifecycleItemState: label present and unticked', () => {
  const s = lifecycleItemState({ body: TEMPLATE, key: 'passed-final-review' });
  assert.deepEqual(s, { sectionPresent: true, labelFound: true, alreadyTicked: false });
});

test('lifecycleItemState: label present and already ticked', () => {
  const ticked = tickLifecycleItem(TEMPLATE, 'passed-final-review');
  const s = lifecycleItemState({ body: ticked, key: 'passed-final-review' });
  assert.deepEqual(s, { sectionPresent: true, labelFound: true, alreadyTicked: true });
});

test('lifecycleItemState: unknown key → throws', () => {
  assert.throws(() => lifecycleItemState({ body: TEMPLATE, key: 'nope' }), /unknown lifecycle key/);
});

// #933 — the tick primitive must toggle a lifecycle box even when the line
// carries a trailing HTML-comment marker. The pre-#933 regex anchored the label
// to end-of-line (`\s*$`), so a marker-bearing line silently no-op'd every
// toggle after the first — reproduced live on #908 where "Agent Review Passed"
// stayed `[ ]` across two `/task review` runs despite a fresh `result="pass"`
// marker.
const AGENT_REVIEW_MARKER =
  '<!-- aitm-verified gate="agent-review" ts="2026-07-22T13:56:18.000Z" sha="sandbox" result="pass" -->';
const MARKER_TEMPLATE = [
  '## DoD',
  '',
  '#### Lifecycle (auto-ticked at Review/Close)',
  `- [ ] Agent Review Passed ${AGENT_REVIEW_MARKER}`,
  '- [ ] Final Review Passed',
  '- [ ] Story closed and moved to Done',
  '- [ ] Timing data flushed to issue',
  '',
  '## Pickup Directive',
].join('\n');

test('#933 tickLifecycleItem: ticks a marker-bearing line, marker preserved byte-for-byte', () => {
  const out = tickLifecycleItem(MARKER_TEMPLATE, 'agent-review-passed');
  assert.equal(out.includes(`- [x] Agent Review Passed ${AGENT_REVIEW_MARKER}`), true);
  // the marker (and all trailing content) survives unchanged
  assert.equal(out.includes(AGENT_REVIEW_MARKER), true);
  // only the one box flipped — the other three stay unticked
  assert.equal(out.includes('- [ ] Final Review Passed'), true);
  assert.equal(out.includes('- [ ] Story closed and moved to Done'), true);
});

test('#933 tickLifecycleItem: marker-bearing tick is idempotent', () => {
  const once = tickLifecycleItem(MARKER_TEMPLATE, 'agent-review-passed');
  const twice = tickLifecycleItem(once, 'agent-review-passed');
  assert.equal(twice, once);
});

test('#933 untickLifecycleItem: un-ticks a marker-bearing ticked line (demote/pretick path)', () => {
  const ticked = tickLifecycleItem(MARKER_TEMPLATE, 'agent-review-passed');
  const reverted = untickLifecycleItem(ticked, 'agent-review-passed');
  assert.equal(reverted.includes(`- [ ] Agent Review Passed ${AGENT_REVIEW_MARKER}`), true);
  assert.equal(reverted, MARKER_TEMPLATE);
});

test('#933 detectLifecyclePretick: catches a marker-bearing pre-tick and un-ticks it', () => {
  const preTicked = tickLifecycleItem(MARKER_TEMPLATE, 'agent-review-passed');
  const { body, regressions } = detectLifecyclePretick(preTicked);
  assert.deepEqual(
    regressions.map((r) => r.key),
    ['agent-review-passed']
  );
  assert.equal(body, MARKER_TEMPLATE);
});

test('#933 no regression: first-tick on a no-marker line still works', () => {
  const out = tickLifecycleItem(TEMPLATE, 'story-closed');
  assert.equal(out.includes('- [x] Story closed and moved to Done'), true);
});

test('#933 no regression: unknown key still throws on both toggles', () => {
  assert.throws(() => tickLifecycleItem(MARKER_TEMPLATE, 'nope'), /unknown lifecycle key/);
  assert.throws(() => untickLifecycleItem(MARKER_TEMPLATE, 'nope'), /unknown lifecycle key/);
});
