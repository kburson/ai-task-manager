#!/usr/bin/env node
// @story #636 — coverage lift for scripts/task-tracker/heal-backlog.mjs (part 1).
// Exercises the pure transforms (healIssue across its rich-backfill/strip/
// converge/timing-delta path plus the two skip branches and the plan-approved
// migration branch; diffSchema no-drift + every drift kind; renderHealComment;
// isHealComment; stripVestigialAcBullets; normalizeMarkerTs) and the light,
// GraphQL-only fetch seams (parseArgs, printUsage, fetchProjectFields,
// fetchAllIssueNumbers) fully offline via injected fake gql + out/err streams.
// The heavier IO/CLI seams (fetchIssueBundle, writeIssueBody, postHealComment,
// runTimingSlugRename, main) live in coverage-heal-backlog-cli.test.mjs.
import { strict as assert } from 'node:assert';
import {
  stripVestigialAcBullets,
  healIssue,
  normalizeMarkerTs,
  diffSchema,
  renderHealComment,
  isHealComment,
  parseArgs,
  printUsage,
  fetchProjectFields,
  fetchAllIssueNumbers,
} from '../../heal-backlog.mjs';
import { formatIssueFieldDb } from '../../issue-field-db.mjs';

// ---- helpers ---------------------------------------------------------------
function sink() {
  const chunks = [];
  return { chunks, write: (s) => chunks.push(String(s)), text: () => chunks.join('') };
}

// ---- fixtures --------------------------------------------------------------
const FIELD_DEFS = [
  {
    key: 'priority',
    name: 'Priority',
    type: 'single_select',
    options: [{ name: 'P0' }, { name: 'P1' }, { name: 'P2' }],
  },
  {
    key: 'size',
    name: 'Size',
    type: 'single_select',
    options: [{ name: 'S' }, { name: 'M' }, { name: 'L' }],
  },
  { key: 'estimate', name: 'Estimate', type: 'number' },
  { key: 'rank', name: 'Rank', type: 'number' },
  { key: 'engagedTime', name: 'Engaged Time', type: 'number' },
  { key: 'sessionTime', name: 'Session Time', type: 'number' },
  { key: 'reviewTime', name: 'Review Time', type: 'number' },
  { key: 'startTime', name: 'Start Time', type: 'text' },
];

const TIMING_LOG = [
  '⏱ Timing Log',
  '',
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
  '|---|---|---|---|---|---|---|',
  '| 2026-06-24 09:00 -05:00 | refine:started | 30 | 0 | 0 | 100 | first |',
  '| 2026-06-24 10:00 -05:00 | review:started | 15 | 0 | 0 | 150 | rev |',
].join('\n');

const STALE_FIELDS = formatIssueFieldDb({
  engagedTime: 12345,
  sessionTime: 0,
  reviewTime: 0,
  startTime: null,
  priority: 'P1',
  size: 'M',
  estimate: 3,
  rank: 1,
});

// Rich body that trips every optional heal branch at once: a bare `{discuss}`
// token (converge), a `## Deep-Dive Analysis` heading with no complete/posted
// markers (both backfills), a vestigial `approved by Human` bullet gated by a
// present plan-approved marker (strip), and a stale field-DB (timing delta).
const RICH_BODY = [
  '## Some Issue',
  '',
  '{discuss}',
  '',
  '- [ ] approved by Human',
  '',
  '## Deep-Dive Analysis',
  '',
  'Prose about the deep dive.',
  '',
  '<!-- aitm-plan-approved ts="2026-06-01T00:00:00Z" -->',
  '',
  STALE_FIELDS,
  '',
].join('\n');

const BACKFILL_TS = '2026-06-01T00:00:00Z';

// ---- stripVestigialAcBullets ------------------------------------------------
{
  // marker present → the approved-by-Human bullet is stripped.
  const withMarker = ['- [ ] approved by Human', '<!-- aitm-plan-approved ts="x" -->'].join('\n');
  assert.doesNotMatch(stripVestigialAcBullets(withMarker), /approved by Human/);
  // no marker → left intact.
  const noMarker = '- [ ] approved by Human\n';
  assert.match(stripVestigialAcBullets(noMarker), /approved by Human/);
  assert.equal(stripVestigialAcBullets(null), '');
}

// ---- normalizeMarkerTs ------------------------------------------------------
assert.equal(normalizeMarkerTs('2026-06-01T00:00:00.123Z'), '2026-06-01T00:00:00Z');
assert.equal(normalizeMarkerTs('2026-06-01T00:00:00Z'), '2026-06-01T00:00:00Z');
assert.equal(normalizeMarkerTs(null), null);

// ---- healIssue: rich path (all optional branches + timing delta) -----------
{
  const res = healIssue({
    body: RICH_BODY,
    timingCommentBody: TIMING_LOG,
    fieldDefs: FIELD_DEFS,
    deepDiveBackfillTs: BACKFILL_TS,
  });
  assert.equal(res.changedBody, true);
  assert.equal(res.skipped, false);
  assert.ok(res.deltas.length > 0, 'expected timing deltas');
  assert.equal(res.discussPending, true);
  for (const a of [
    'backfill-deep-dive-marker',
    'backfill-deep-dive-posted',
    'strip-vestigial-ac',
    'converge-discuss',
  ]) {
    assert.ok(res.action.includes(a), `expected action ${a} in ${res.action.join(',')}`);
  }
  // reassembled body carries a single field-DB block and no visible {discuss}.
  assert.match(res.body, /aitm-fields:/);
  assert.doesNotMatch(res.body, /^\{discuss\}$/m);
}

// ---- healIssue: no timing rows → skip:no-timing-rows -----------------------
{
  const res = healIssue({
    body: `Body\n\n${STALE_FIELDS}\n`,
    timingCommentBody: 'a comment with no table',
    fieldDefs: FIELD_DEFS,
  });
  assert.equal(res.skipped, true);
  assert.equal(res.skipReason, 'no-timing-rows');
  assert.equal(res.deltas.length, 0);
}

// ---- healIssue: no timing log → skip:no-timing-log -------------------------
{
  const res = healIssue({
    body: `Body\n\n${STALE_FIELDS}\n`,
    timingCommentBody: null,
    fieldDefs: FIELD_DEFS,
  });
  assert.equal(res.skipped, true);
  assert.equal(res.skipReason, 'no-timing-log');
}

// ---- healIssue: legacy plan-approved checkbox migration branch -------------
{
  const res = healIssue({
    body: '## X\n\n- [x] Plan approved by human\n',
    timingCommentBody: null,
    fieldDefs: FIELD_DEFS,
  });
  assert.ok(res.action.includes('stripped-and-marker-added'));
  assert.match(res.body, /aitm-plan-approved/);
}

// ---- diffSchema: no drift ---------------------------------------------------
const STATUS_OK = {
  name: 'Status',
  options: ['Backlog', 'On Deck', 'Refine', 'Plan', 'Develop', 'Test', 'Review', 'Done'].map(
    (n) => ({ name: n })
  ),
};
{
  const projectFields = [
    { name: 'Priority', options: [{ name: 'P0' }, { name: 'P1' }, { name: 'P2' }] },
    { name: 'Size', options: [{ name: 'S' }, { name: 'M' }, { name: 'L' }] },
    { name: 'Estimate' },
    { name: 'Rank' },
    { name: 'Engaged Time' },
    { name: 'Session Time' },
    { name: 'Review Time' },
    { name: 'Start Time' },
    STATUS_OK,
    { name: 'Title' }, // built-in → ignored
  ];
  assert.equal(diffSchema(projectFields, FIELD_DEFS).hasDrift, false);
}

// ---- diffSchema: every drift kind ------------------------------------------
{
  const projectFields = [
    { name: 'Priority', options: [{ name: 'P0' }] }, // option drift (missing P1,P2)
    { name: 'Size', options: [{ name: 'S' }, { name: 'M' }, { name: 'L' }] },
    { name: 'Estimate' },
    // Rank omitted → missing
    { name: 'Engaged Time' },
    { name: 'Session Time' },
    { name: 'Review Time' },
    { name: 'Start Time' },
    { name: 'Bogus Field' }, // extra
    {
      name: 'Status',
      options: ['Backlog', 'Refine', 'Plan', 'Develop', 'Test', 'Review'].map((n) => ({ name: n })), // missing Done
    },
  ];
  const drift = diffSchema(projectFields, FIELD_DEFS);
  assert.equal(drift.hasDrift, true);
  assert.ok(drift.missing.some((m) => m.key === 'rank'));
  assert.ok(drift.extra.some((e) => e.name === 'Bogus Field'));
  assert.ok(drift.optionDrift.some((d) => d.name === 'Priority'));
  assert.ok(drift.statusOptionDrift.length > 0);
}

// ---- diffSchema: Status field entirely absent → missing status -------------
{
  const drift = diffSchema(
    [{ name: 'Priority', options: [{ name: 'P0' }, { name: 'P1' }, { name: 'P2' }] }],
    [FIELD_DEFS[0]]
  );
  assert.ok(drift.missing.some((m) => m.key === 'status'));
}

// ---- renderHealComment + isHealComment -------------------------------------
{
  const comment = renderHealComment({
    deltas: [
      { key: 'engagedTime', before: null, after: 42 },
      { key: 'startTime', before: 'old', after: 'new' },
    ],
    now: '2026-07-03T00:00:00Z',
  });
  assert.match(comment, /Backlog heal/);
  assert.match(comment, /aitm-heal:/);
  assert.match(comment, /engagedTime/);
  assert.match(comment, /—/); // null before → em dash
  assert.equal(isHealComment(comment), true);
  assert.equal(isHealComment('no marker here'), false);
  assert.equal(isHealComment(null), false);
}

// ---- parseArgs --------------------------------------------------------------
{
  const a = parseArgs([
    '--apply',
    '--no-schema-check',
    '--ignore-schema-drift',
    '--rename-timing-slugs',
  ]);
  assert.equal(a.apply, true);
  assert.equal(a.schemaCheck, false);
  assert.equal(a.ignoreSchemaDrift, true);
  assert.equal(a.renameTimingSlugs, true);
  assert.equal(a.state, 'all');
}
assert.deepEqual(parseArgs(['--state', 'closed']).state, 'closed');
assert.deepEqual(parseArgs(['--state=open']).state, 'open');
assert.deepEqual(parseArgs(['--scope', '1,#2,x,3']).scope, [1, 2, 3]);
assert.deepEqual(parseArgs(['--scope=4,5']).scope, [4, 5]);
// --help routes through printUsage + exit(0).
{
  const out = sink();
  let code = null;
  parseArgs(['--help'], { out, exit: (c) => (code = c) });
  assert.equal(code, 0);
  assert.match(out.text(), /Usage:/);
}
{
  let code = null;
  parseArgs(['-h'], { out: sink(), exit: (c) => (code = c) });
  assert.equal(code, 0);
}
// invalid --state routes through err + exit(2).
{
  const err = sink();
  let code = null;
  parseArgs(['--state', 'bogus'], { err, exit: (c) => (code = c) });
  assert.equal(code, 2);
  assert.match(err.text(), /invalid --state bogus/);
}

// ---- printUsage -------------------------------------------------------------
{
  const out = sink();
  printUsage(out);
  assert.match(out.text(), /Usage: heal-backlog\.mjs/);
}

// ---- fetchProjectFields with a fake gql ------------------------------------
{
  const gqlFn = async () => ({ node: { fields: { nodes: [{ name: 'Priority' }] } } });
  assert.deepEqual(await fetchProjectFields('P', gqlFn), [{ name: 'Priority' }]);
  const emptyGql = async () => ({ node: null });
  assert.deepEqual(await fetchProjectFields('P', emptyGql), []);
}

// ---- fetchAllIssueNumbers with a fake gql (pagination + filters) -----------
function pageResponse(nodes, hasNextPage, endCursor = null) {
  return { repository: { issues: { pageInfo: { hasNextPage, endCursor }, nodes } } };
}
const PID = 'PVT_target';
{
  const pages = [
    pageResponse(
      [
        { number: 1, state: 'OPEN', projectItems: { nodes: [{ project: { id: PID } }] } },
        { number: 2, state: 'CLOSED', projectItems: { nodes: [{ project: { id: PID } }] } },
        { number: 3, state: 'OPEN', projectItems: { nodes: [{ project: { id: 'other' } }] } },
      ],
      true,
      'CUR'
    ),
    pageResponse(
      [{ number: 4, state: 'OPEN', projectItems: { nodes: [{ project: { id: PID } }] } }],
      false
    ),
  ];
  let call = 0;
  const gqlFn = async () => pages[call++];
  const open = await fetchAllIssueNumbers({ repo: 'o/r', state: 'open', projectId: PID }, gqlFn);
  assert.deepEqual(open, [1, 4]); // #2 closed filtered, #3 off-project filtered
}
{
  const nodes = [
    { number: 7, state: 'CLOSED', projectItems: { nodes: [{ project: { id: PID } }] } },
    { number: 8, state: 'OPEN', projectItems: { nodes: [{ project: { id: PID } }] } },
  ];
  const gqlFn = async () => pageResponse(nodes, false);
  assert.deepEqual(
    await fetchAllIssueNumbers({ repo: 'o/r', state: 'closed', projectId: PID }, gqlFn),
    [7]
  );
  assert.deepEqual(
    await fetchAllIssueNumbers({ repo: 'o/r', state: 'all', projectId: PID }, gqlFn),
    [7, 8]
  );
}

console.log('coverage-heal-backlog.test.mjs: ok');
