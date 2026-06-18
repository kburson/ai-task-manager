// @story #310
import assert from 'node:assert/strict';
import {
  healIssue,
  diffSchema,
  renderHealComment,
  isHealComment,
  stripVestigialAcBullets,
} from '../../heal-backlog.mjs';
import {
  FIELD_DB_START,
  FIELD_DB_END,
  FIELDS_COMMENT_PREFIX,
  parseIssueFieldDb,
} from '../../issue-field-db.mjs';

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
  { key: 'rank', name: 'Rank', type: 'number' },
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
    '{"schema":1,"values":{"priority":"P1","size":"S","estimate":2,"engagedTime":1,"sessionTime":1,"reviewTime":0,"rank":3,"startTime":"stale"}}',
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
