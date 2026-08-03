// @story #788
// #788 — Section-order contract for the value report.
//
// buildHtml is pure string assembly, so source order == render order. This test
// renders the report from a small synthetic fixture and asserts the byte-offset
// order of the section headings after the #788 reorder:
//
//   Daily Work Activity  <  Timeline Analysis  <  Engineering Cost by US Region
//   Engineering Cost by US Region  <  Appendix A — Product Backlog  <  Appendix B — Backlog Engagement Timeline
//
// It also asserts no content was dropped when the two big tables moved to the
// appendices (both still emit their table markup and fixture rows), and that the
// Daily Work Activity chart rendered its real chart (not the empty placeholder).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHtml } from '../generate-value-report.mjs';

// A ⏱ Timing Log with two same-day rows an hour apart. bucketRowsByDay windows
// consecutive row pairs; the second row carries 3600 active seconds, so the day
// gets nonzero duration and renderDailyChart emits the real chart + heading
// (an empty log would omit the "Daily Work Activity" heading entirely).
const timingBody = [
  '## ⏱ Timing Log',
  '',
  '| Timestamp | Event | Active | Word Marker |',
  '| --- | --- | --- | --- |',
  '| 2026-07-01 09:00:00 -07:00 | started | 0 | 100 |',
  '| 2026-07-01 10:00:00 -07:00 | paused | 60 | 600 | <!-- row-sec: a=3600 i=0 --> |',
  '',
].join('\n');

function fixture() {
  const project = { title: 'Test Report' };
  const items = [
    {
      number: 101,
      title: 'First backlog issue',
      url: 'https://example.test/101',
      status: 'Done',
      estimate: 4,
      sessionMin: 90,
      contextWords: 1200,
      role: 'solo',
      parentNumber: null,
      createdAt: new Date('2026-06-28T00:00:00Z'),
      startedAt: new Date('2026-07-01T09:00:00Z'),
      closedAt: new Date('2026-07-01T17:00:00Z'),
      timingBody,
    },
    {
      number: 102,
      title: 'Second backlog issue',
      url: 'https://example.test/102',
      status: 'Done',
      estimate: 2,
      sessionMin: 45,
      contextWords: 600,
      role: 'agent',
      parentNumber: null,
      createdAt: new Date('2026-06-30T00:00:00Z'),
      startedAt: new Date('2026-07-01T11:00:00Z'),
      closedAt: new Date('2026-07-01T15:00:00Z'),
      timingBody: '',
    },
  ];
  const s = {
    totalEst: 6,
    totalEngaged: 3.5,
    totalSessionMin: 135,
    totalContextWords: 1800,
    accel: 1.7,
  };
  return buildHtml(project, items, s);
}

const DAILY = '<h3 class="tl-heading">Daily Work Activity</h3>';
const TIMELINE = '<h2>Timeline Analysis</h2>';
const ENG_COST = '<h2>Engineering Cost by US Region</h2>';
const BACKLOG = '<h2>Appendix A — Product Backlog</h2>';
const ENGAGEMENT = '<h2>Appendix B — Backlog Engagement Timeline</h2>';

test('all section headings are present exactly once', () => {
  const html = fixture();
  for (const [label, needle] of [
    ['Daily Work Activity', DAILY],
    ['Timeline Analysis', TIMELINE],
    ['Engineering Cost by US Region', ENG_COST],
    ['Appendix A — Product Backlog', BACKLOG],
    ['Appendix B — Backlog Engagement Timeline', ENGAGEMENT],
  ]) {
    const first = html.indexOf(needle);
    assert.notEqual(first, -1, `${label} heading missing`);
    assert.equal(html.indexOf(needle, first + 1), -1, `${label} heading duplicated`);
  }
});

test('Daily Work Activity renders before the Product Backlog appendix', () => {
  const html = fixture();
  assert.ok(
    html.indexOf(DAILY) < html.indexOf(BACKLOG),
    'Daily Work Activity should appear before Product Backlog',
  );
  // Daily Work Activity is no longer nested inside Timeline Analysis.
  assert.ok(
    html.indexOf(DAILY) < html.indexOf(TIMELINE),
    'Daily Work Activity should appear before Timeline Analysis',
  );
});

test('Product Backlog and Backlog Engagement Timeline are appendices after Engineering Cost', () => {
  const html = fixture();
  const eng = html.indexOf(ENG_COST);
  const backlog = html.indexOf(BACKLOG);
  const engagement = html.indexOf(ENGAGEMENT);
  assert.ok(eng < backlog, 'Engineering Cost should precede Product Backlog');
  assert.ok(backlog < engagement, 'Product Backlog should precede Backlog Engagement Timeline');
});

test('Timeline Analysis retains only the Estimated/Measured effort cards', () => {
  const html = fixture();
  const start = html.indexOf(TIMELINE);
  const end = html.indexOf(ENG_COST);
  const section = html.slice(start, end);
  assert.ok(section.includes('Estimated Effort'), 'Estimated Effort card missing from Timeline Analysis');
  assert.ok(section.includes('Measured / Engaged'), 'Measured / Engaged card missing from Timeline Analysis');
  // The daily chart heading must NOT live inside Timeline Analysis anymore.
  assert.ok(!section.includes(DAILY), 'Daily Work Activity should not be inside Timeline Analysis');
});

test('no content dropped: moved tables still emit their markup and rows', () => {
  const html = fixture();
  // Daily chart rendered the real chart, not the empty-range placeholder.
  assert.ok(!html.includes('No timing-log activity in range.'), 'daily chart fell back to placeholder');
  // Product Backlog table still present with fixture rows.
  const backlogSection = html.slice(html.indexOf(BACKLOG), html.indexOf(ENGAGEMENT));
  assert.ok(backlogSection.includes('<table'), 'Product Backlog table markup missing');
  assert.ok(backlogSection.includes('#101'), 'Product Backlog row for #101 missing');
  assert.ok(backlogSection.includes('#102'), 'Product Backlog row for #102 missing');
  // Backlog Engagement Timeline table still present.
  const engagementSection = html.slice(html.indexOf(ENGAGEMENT));
  assert.ok(engagementSection.includes('<table'), 'Backlog Engagement Timeline table markup missing');
  assert.ok(engagementSection.includes('#101'), 'Backlog Engagement row for #101 missing');
});

test('estimation footer renders validated zero waste as zero rather than missing evidence', () => {
  const project = { title: 'Zero Waste' };
  const items = [
    {
      number: 101,
      title: 'Zero-waste issue',
      url: 'https://example.test/101',
      status: 'Done',
      parentNumber: null,
      timingBody: '',
    },
  ];
  const row = {
    humanPlanHours: 1,
    aiP50Hours: 1,
    aiP80Hours: 1.2,
    actualEngagedHours: 1,
    varianceVsAiP50Hours: 0,
    refineAccuracy: 1,
    aiP50Accuracy: 1,
    avoidableWasteHours: 0,
    acceleration: 1,
    accelerationLabel: '1.00×',
    evidenceGaps: [],
  };
  const html = buildHtml(
    project,
    items,
    { totalEst: 1, totalEngaged: 60, totalSessionMin: 60, totalContextWords: 0, accel: 1 },
    { rowsByIssue: new Map([[101, row]]), methodology: {} }
  );
  const footer = html.slice(html.indexOf('<tfoot>'), html.indexOf('</tfoot>'));
  assert.match(footer, /<td class="num">0 (?:min|h)<\/td>/);
});

test('executive metrics use adaptive Human Plan and actuals instead of legacy board/session totals', () => {
  const items = [
    {
      number: 1091,
      title: 'Adaptive issue',
      url: 'https://example.test/1091',
      status: 'Done',
      estimate: 100,
      engagedMin: 6_000,
      parentNumber: null,
      timingBody: '',
    },
  ];
  const row = {
    adaptiveClaim: true,
    humanPlanHours: 8,
    aiP50Hours: 3,
    aiP80Hours: 5,
    actualEngagedHours: 4,
    varianceVsAiP50Hours: 1,
    refineAccuracy: 1,
    aiP50Accuracy: 0.75,
    avoidableWasteHours: 0,
    acceleration: 2,
    accelerationLabel: '2.00×',
    evidenceGaps: [],
  };
  const html = buildHtml(
    { title: 'Adaptive totals' },
    items,
    { totalEst: 100, totalEngaged: 100, totalSessionMin: 6_000, totalContextWords: 0 },
    { rowsByIssue: new Map([[1091, row]]), methodology: {} }
  );

  const accelerator = html.slice(
    html.indexOf('<h2>Agentic AI Accelerator</h2>'),
    html.indexOf('<h3 class="tl-heading">Daily Work Activity</h3>')
  );
  assert.match(accelerator, />8h @/);
  assert.match(accelerator, /<div class="ac-num">2×<\/div>/);
  assert.doesNotMatch(accelerator, />100h @/);
});

test('legacy rows fall back to board Estimate and Engaged only without an adaptive claim', () => {
  const item = {
    number: 101,
    title: 'Legacy issue',
    url: 'https://example.test/101',
    status: 'Done',
    estimate: 4,
    engagedMin: 120,
    parentNumber: null,
    timingBody: '',
  };
  const legacyRow = {
    adaptiveClaim: false,
    humanPlanHours: null,
    actualEngagedHours: null,
    evidenceGaps: ['missing-forecast', 'missing-outcome'],
  };
  const html = buildHtml(
    { title: 'Legacy fallback' },
    [item],
    { totalEst: 4, totalEngaged: 2, totalSessionMin: 120, totalContextWords: 0 },
    { rowsByIssue: new Map([[101, legacyRow]]), methodology: {} }
  );
  const backlog = html.slice(html.indexOf('Appendix A — Product Backlog'), html.indexOf('Appendix B'));

  assert.match(backlog, /<td class="num">4h<\/td>/);
  assert.match(backlog, /<td class="num">2h<\/td>/);
  assert.match(backlog, />2\.00×<\/td>/);

  legacyRow.evidenceGaps.push('malformed-record-evidence');
  const malformed = buildHtml(
    { title: 'Malformed adaptive evidence' },
    [item],
    { totalEst: 4, totalEngaged: 2, totalSessionMin: 120, totalContextWords: 0 },
    { rowsByIssue: new Map([[101, legacyRow]]), methodology: {} }
  );
  const malformedBacklog = malformed.slice(
    malformed.indexOf('Appendix A — Product Backlog'),
    malformed.indexOf('Appendix B')
  );
  assert.doesNotMatch(malformedBacklog, /<td class="num">4h<\/td>/);
});
