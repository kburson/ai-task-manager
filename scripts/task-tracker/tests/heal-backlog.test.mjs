// @story #87
import assert from 'node:assert/strict';
import {
  healIssue,
  diffSchema,
  renderHealComment,
  isHealComment,
  stripVestigialAcBullets,
} from '../heal-backlog.mjs';
import {
  FIELD_DB_START,
  FIELD_DB_END,
  FIELDS_COMMENT_PREFIX,
  parseIssueFieldDb,
} from '../issue-field-db.mjs';

const fieldDefs = [
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
    options: [{ name: 'XS' }, { name: 'S' }, { name: 'M' }, { name: 'L' }, { name: 'XL' }],
  },
  { key: 'estimate', name: 'Estimate', type: 'number' },
  { key: 'sequence', name: 'Sequence', type: 'number' },
  { key: 'engagedTime', name: 'Engaged Time', type: 'number' },
  { key: 'sessionTime', name: 'Session Time', type: 'number' },
  { key: 'reviewTime', name: 'Review Time', type: 'number' },
  { key: 'startTime', name: 'Start time', type: 'text' },
];

const TIMING_LOG_3_ROWS = [
  '⏱ Timing Log',
  '',
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
  '|---|---|---|---|---|---|---|',
  '| 2026-05-11 08:00 -05:00 | start | 0 | 0 | 0 | 0 | solo |',
  '| 2026-05-11 08:30 -05:00 | update | 30 | 0 | 200 | 200 | checkpoint |',
  '| 2026-05-11 09:15 -05:00 | update | 45 | 0 | 300 | 500 | checkpoint |',
].join('\n');

// ---------- 1. Encoding migration on mixed legacy + visible approval body ----------

(function encodingMigration() {
  const body = [
    '# A work item',
    '',
    '## Scope',
    '',
    'Some scope text.',
    '',
    '- [x] Plan approved by human',
    '',
    'More body text.',
    '',
    FIELD_DB_START,
    '```json',
    '{"schema":1,"values":{"priority":"P0","size":"M","estimate":4,"engagedTime":99,"sessionTime":80,"reviewTime":19,"sequence":1,"startTime":"2026-05-10 09:00 -05:00"}}',
    '```',
    FIELD_DB_END,
  ].join('\n');

  const r = healIssue({
    body,
    timingCommentBody: TIMING_LOG_3_ROWS,
    fieldDefs,
    now: () => '2026-05-11T13:00:00.000Z',
  });

  assert.equal(r.changedBody, true, 'body must change');
  assert.equal(r.body.includes(FIELD_DB_START), false, 'no legacy fenced block remains');
  assert.equal(r.body.includes(FIELDS_COMMENT_PREFIX), true, 'new encoding present');
  // Static fields preserved
  assert.equal(r.values.priority, 'P0');
  assert.equal(r.values.size, 'M');
  assert.equal(r.values.estimate, 4);
  assert.equal(r.values.sequence, 1);
  // Timing reconciled from log (3 rows: 0 + 30 + 45 = 75 active min)
  assert.equal(r.values.sessionTime, 75);
  assert.equal(r.values.engagedTime, 75); // no pauses → reviewMin = 0
  assert.equal(r.values.reviewTime, 0);
  // Plan-approved migration ran (legacy checkbox was checked → marker)
  assert.match(r.body, /<!--\s*aitm-plan-approved(?: ts="|:)/);
  assert.equal(r.body.includes('- [x] Plan approved by human'), false);
  // Deltas surfaced for changed timing fields
  const keys = r.deltas.map((d) => d.key).sort();
  assert.deepEqual(keys, ['engagedTime', 'reviewTime', 'sessionTime', 'startTime'].sort());
  // Re-parse the new body to confirm it round-trips
  const reparsed = parseIssueFieldDb(r.body);
  assert.equal(reparsed.ok, true);
  assert.equal(reparsed.values.size, 'M');
})();

// ---------- 2. Timing reconciliation when fields disagree ----------

(function reconciliation() {
  const body = [
    '# Item',
    '',
    'Body.',
    '',
    `${FIELDS_COMMENT_PREFIX} {"schema":1,"values":{"priority":"P0","size":"L","estimate":8,"engagedTime":9999,"sessionTime":9999,"reviewTime":9999,"sequence":2,"startTime":"old-value"}} -->`,
  ].join('\n');

  const r = healIssue({
    body,
    timingCommentBody: TIMING_LOG_3_ROWS,
    fieldDefs,
  });

  assert.equal(r.values.sessionTime, 75, 'sessionTime recomputed');
  assert.equal(r.values.engagedTime, 75, 'engagedTime recomputed');
  assert.equal(r.values.reviewTime, 0, 'reviewTime recomputed');
  // Static fields untouched
  assert.equal(r.values.priority, 'P0');
  assert.equal(r.values.size, 'L');
  assert.equal(r.values.estimate, 8);
  assert.equal(r.values.sequence, 2);
  // Deltas list shows the four changed fields
  const changedKeys = new Set(r.deltas.map((d) => d.key));
  assert.ok(changedKeys.has('engagedTime'));
  assert.ok(changedKeys.has('sessionTime'));
  assert.ok(changedKeys.has('reviewTime'));
  assert.ok(changedKeys.has('startTime'));
  // No delta for any static key
  for (const k of ['priority', 'size', 'estimate', 'sequence']) {
    assert.ok(!changedKeys.has(k), `static key ${k} must not be in deltas`);
  }
})();

// ---------- 3. Idempotent re-run ----------

(function idempotent() {
  const body = ['# Item', '', 'Body.', ''].join('\n');

  const first = healIssue({
    body,
    timingCommentBody: TIMING_LOG_3_ROWS,
    fieldDefs,
  });
  // After first heal, re-feed the new body through the healer with same timing log.
  const second = healIssue({
    body: first.body,
    timingCommentBody: TIMING_LOG_3_ROWS,
    fieldDefs,
  });
  assert.equal(second.changedBody, false, 're-run on already-healed body must be a no-op');
  assert.equal(second.deltas.length, 0, 'no deltas on idempotent re-run');
})();

// ---------- 4. Missing timing log → skip reconciliation, no body churn on static-only body ----------

(function noTimingLogSkip() {
  const body = [
    '# Item',
    '',
    `${FIELDS_COMMENT_PREFIX} {"schema":1,"values":{"priority":"P0","size":"S","estimate":3,"engagedTime":null,"sessionTime":null,"reviewTime":null,"sequence":1,"startTime":null}} -->`,
  ].join('\n');

  const r = healIssue({
    body,
    timingCommentBody: null,
    fieldDefs,
  });
  assert.equal(r.skipped, true, 'should mark skipped');
  assert.equal(r.skipReason, 'no-timing-log');
  // Static fields preserved
  assert.equal(r.values.priority, 'P0');
  assert.equal(r.values.size, 'S');
  assert.equal(r.values.estimate, 3);
  // Deltas should be empty (we never recompute timing when no log)
  assert.equal(r.deltas.length, 0);
})();

// ---------- 5. Schema drift detection ----------

(function schemaDriftDetected() {
  // Synthesize a project that's missing Estimate, has an extra "Foo" field, and is missing the "L" Size option.
  const projectFields = [
    {
      name: 'Priority',
      dataType: 'SINGLE_SELECT',
      options: [{ name: 'P0' }, { name: 'P1' }, { name: 'P2' }],
    },
    {
      name: 'Size',
      dataType: 'SINGLE_SELECT',
      options: [{ name: 'XS' }, { name: 'S' }, { name: 'M' }, { name: 'XL' }],
    }, // missing L
    // missing Estimate
    { name: 'Sequence', dataType: 'NUMBER' },
    { name: 'Engaged Time', dataType: 'NUMBER' },
    { name: 'Session Time', dataType: 'NUMBER' },
    { name: 'Review Time', dataType: 'NUMBER' },
    { name: 'Start time', dataType: 'TEXT' },
    {
      name: 'Status',
      dataType: 'SINGLE_SELECT',
      options: [
        { name: 'Backlog' },
        { name: 'Refine' },
        { name: 'Plan' },
        { name: 'Develop' },
        { name: 'Test' },
        { name: 'Review' },
        { name: 'Done' },
      ],
    },
    { name: 'Foo', dataType: 'TEXT' }, // extra
    { name: 'Title', dataType: 'TITLE' }, // built-in, ignored
  ];
  const drift = diffSchema(projectFields, fieldDefs);
  assert.equal(drift.hasDrift, true);
  assert.deepEqual(
    drift.missing.map((d) => d.name),
    ['Estimate']
  );
  assert.deepEqual(
    drift.extra.map((d) => d.name),
    ['Foo']
  );
  assert.equal(drift.optionDrift.length, 1);
  assert.equal(drift.optionDrift[0].name, 'Size');
  assert.deepEqual(drift.optionDrift[0].missing, ['L']);
  assert.deepEqual(drift.optionDrift[0].extra, []);
})();

(function schemaCleanNoDrift() {
  const projectFields = [
    {
      name: 'Priority',
      dataType: 'SINGLE_SELECT',
      options: [{ name: 'P0' }, { name: 'P1' }, { name: 'P2' }],
    },
    {
      name: 'Size',
      dataType: 'SINGLE_SELECT',
      options: [{ name: 'XS' }, { name: 'S' }, { name: 'M' }, { name: 'L' }, { name: 'XL' }],
    },
    { name: 'Estimate', dataType: 'NUMBER' },
    { name: 'Sequence', dataType: 'NUMBER' },
    { name: 'Engaged Time', dataType: 'NUMBER' },
    { name: 'Session Time', dataType: 'NUMBER' },
    { name: 'Review Time', dataType: 'NUMBER' },
    { name: 'Start time', dataType: 'TEXT' },
    {
      name: 'Status',
      dataType: 'SINGLE_SELECT',
      options: [
        { name: 'Backlog' },
        { name: 'Refine' },
        { name: 'Plan' },
        { name: 'Develop' },
        { name: 'Test' },
        { name: 'Review' },
        { name: 'Done' },
      ],
    },
    { name: 'Title', dataType: 'TITLE' },
    { name: 'Assignees', dataType: 'ASSIGNEES' },
  ];
  const drift = diffSchema(projectFields, fieldDefs);
  assert.equal(drift.hasDrift, false);
})();

// ---------- 5b. Closed-issue heal — pure function is state-agnostic, body changes without touching state ----------

(function closedIssueHeal() {
  // healIssue is a pure body transform — it does not know or care whether the issue is open/closed.
  // The CLI uses `gh issue edit` to write body and `gh issue comment` to post the heal comment;
  // neither reopens a closed issue. Verifying body transform proceeds normally regardless.
  const body = [
    '# Closed item',
    '',
    'Done long ago.',
    '',
    FIELD_DB_START,
    '```json',
    '{"schema":1,"values":{"priority":"P1","size":"S","estimate":2,"engagedTime":1,"sessionTime":1,"reviewTime":0,"sequence":3,"startTime":"stale"}}',
    '```',
    FIELD_DB_END,
  ].join('\n');

  const r = healIssue({
    body,
    timingCommentBody: TIMING_LOG_3_ROWS,
    fieldDefs,
  });
  assert.equal(r.changedBody, true);
  assert.equal(r.body.includes(FIELD_DB_START), false, 'legacy block migrated');
  assert.equal(r.body.includes(FIELDS_COMMENT_PREFIX), true);
  assert.equal(r.values.sessionTime, 75);
  // No state field exists on healIssue input/output — confirming purity.
  assert.equal('state' in r, false);
})();

// ---------- 6. Heal-comment marker round-trips ----------

(function healCommentMarker() {
  const comment = renderHealComment({
    deltas: [{ key: 'engagedTime', before: 9999, after: 75 }],
    now: '2026-05-11T13:00:00.000Z',
  });
  assert.match(comment, /### 🛠 Backlog heal/);
  assert.match(comment, /<!--\s*aitm-heal:/);
  assert.equal(isHealComment(comment), true);
  assert.equal(isHealComment('### Some other comment'), false);
})();

// ---------- 7. stripVestigialAcBullets — marker-gated ----------

(function vestigialStrip() {
  // Plan-approved variant: marker present → bullet stripped.
  const withPlan = [
    '## Acceptance Criteria',
    '- [ ] AC item',
    '- [x] approved by Human',
    '',
    '<!-- aitm-plan-approved: 2026-05-11T00:00:00Z -->',
    '',
  ].join('\n');
  const outPlan = stripVestigialAcBullets(withPlan);
  assert.equal(outPlan.includes('approved by Human'), false, 'bullet stripped when marker present');
  assert.match(outPlan, /<!-- aitm-plan-approved:/, 'marker preserved');

  // Deep-dive variant: marker present → bullet stripped.
  const withDeep = [
    '## Acceptance Criteria',
    '- [ ] AC item',
    '- [x] Deep dive complete',
    '',
    '<!-- aitm-deep-dive-complete: 2026-05-11T00:00:00Z -->',
    '',
  ].join('\n');
  const outDeep = stripVestigialAcBullets(withDeep);
  assert.equal(
    outDeep.includes('Deep dive complete'),
    false,
    'deep-dive bullet stripped when marker present'
  );

  // No marker → bullet preserved (don't forge history).
  const noMarker = [
    '## Acceptance Criteria',
    '- [ ] AC item',
    '- [x] approved by Human',
    '- [x] Deep dive complete',
    '',
  ].join('\n');
  const outNone = stripVestigialAcBullets(noMarker);
  assert.match(outNone, /approved by Human/, 'plan bullet preserved when marker absent');
  assert.match(outNone, /Deep dive complete/, 'deep-dive bullet preserved when marker absent');
})();

// ---------- 8. Deep-dive marker backfill (legacy-issue fallback) ----------

(function deepDiveBackfill() {
  // Heading present + no marker + ts provided → marker inserted.
  const legacy = [
    '## Acceptance Criteria',
    '- [ ] AC',
    '',
    '## Deep-Dive Analysis',
    '',
    'historical notes',
    '',
  ].join('\n');
  const r = healIssue({
    body: legacy,
    timingCommentBody: null,
    fieldDefs,
    deepDiveBackfillTs: '2026-01-15T00:00:00Z',
  });
  assert.match(r.body, /<!--\s*aitm-deep-dive-complete ts="2026-01-15T00:00:00Z" -->/);
  assert.ok(r.action.includes('backfill-deep-dive-marker'));

  // No heading → no backfill, no action.
  const plain = '## AC\n- [ ] AC\n';
  const r2 = healIssue({
    body: plain,
    timingCommentBody: null,
    fieldDefs,
    deepDiveBackfillTs: '2026-01-15T00:00:00Z',
  });
  assert.doesNotMatch(r2.body, /aitm-deep-dive-complete/);
  assert.ok(!r2.action.includes('backfill-deep-dive-marker'));

  // Heading + ts omitted → no backfill (default behavior unchanged).
  const r3 = healIssue({
    body: legacy,
    timingCommentBody: null,
    fieldDefs,
  });
  assert.doesNotMatch(r3.body, /aitm-deep-dive-complete/);

  // Already-marked body → idempotent (no second marker).
  const marked = legacy + '\n<!-- aitm-deep-dive-complete: 2025-12-01T00:00:00Z -->\n';
  const r4 = healIssue({
    body: marked,
    timingCommentBody: null,
    fieldDefs,
    deepDiveBackfillTs: '2026-01-15T00:00:00Z',
  });
  const count = (r4.body.match(/aitm-deep-dive-complete/g) || []).length;
  assert.equal(count, 1, 'no duplicate marker');
  assert.match(r4.body, /2025-12-01T00:00:00Z/, 'original ts preserved');
})();

console.log('ok: heal-backlog.test.mjs');
