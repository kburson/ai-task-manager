// Tests for the V3 timing-log-sequence validator (#812).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, extractDataRows, findTimingLogBody } from './timing-log-sequence.mjs';

// Build a ⏱ Timing Log comment body from `[ts, event, desc?]` rows, mirroring
// the live 8-column table shape. Returns a review-context object.
const HEADER = '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |';
const SEP = '|---|---|---|---|---|---|---|';

function logCtx(rows, enteredStages = []) {
  const body = [
    '## ⏱ Timing Log',
    '',
    HEADER,
    SEP,
    ...rows.map(([ts, ev, desc = '']) => `| ${ts} | ${ev} |  |  |  | 0 | ${desc} |`),
    '',
    '<sub>auto-logged</sub>',
  ].join('\n');
  return { comments: [{ body }], markers: { enteredStages } };
}

// Monotonic non-decreasing table timestamps.
const T = (n) => `2026-07-14 03:${String(n).padStart(2, '0')}:00 -05:00`;

// A well-formed, sequential log: engage → phase → pause → resume → phase.
const GOOD_ROWS = [
  [T(0), 'start', 'bound'],
  [T(1), 'develop:started', 'entered develop'],
  [T(2), 'pause', 'question'],
  [T(3), 'resumed', 'answered'],
  [T(4), 'develop:completed', 'done'],
];
const GOOD_STAGES = [{ stage: 'develop' }];

test('passes a well-formed sequential log', () => {
  const res = validate(logCtx(GOOD_ROWS, GOOD_STAGES));
  assert.equal(res.pass, true, JSON.stringify(res.failures));
  assert.deepEqual(res.failures, []);
});

test('a leading reengagement (resumed at row 1) is legal, not an orphan close', () => {
  const res = validate(
    logCtx(
      [
        [T(0), 'resumed'],
        [T(1), 'develop:started'],
      ],
      GOOD_STAGES
    )
  );
  assert.equal(res.pass, true, JSON.stringify(res.failures));
});

test('accepts the ad-hoc review-verb rows the review gate emits (#812)', () => {
  // The `review` verb appends bare `review` + `review-ready` rows on entry; V3
  // must walk them as neutral phase rows, not flag them as unknown slugs — else
  // every log fails the moment it reaches Review.
  const res = validate(
    logCtx(
      [
        [T(0), 'start', 'bound'],
        [T(1), 'test:passed', 'testing complete'],
        [T(2), 'review:started', 'waiting in review'],
        [T(3), 'review', 'starting review'],
        [T(4), 'review-ready', 'task is now in Review'],
      ],
      [{ stage: 'test' }, { stage: 'review' }]
    )
  );
  assert.equal(res.pass, true, JSON.stringify(res.failures));
  assert.deepEqual(res.failures, []);
});

// --- Format schema -----------------------------------------------------------

test('fails a malformed row with an unknown event slug, naming the row', () => {
  const res = validate(
    logCtx(
      [
        [T(0), 'start'],
        [T(1), 'foobar'],
      ],
      GOOD_STAGES
    )
  );
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /row 2\b/.test(f) && /malformed/.test(f) && /foobar/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('fails a malformed row with an unparseable timestamp, naming the row', () => {
  const res = validate(
    logCtx(
      [
        [T(0), 'start'],
        ['not-a-date', 'pause'],
      ],
      GOOD_STAGES
    )
  );
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /row 2\b/.test(f) && /malformed/.test(f) && /timestamp/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('fails an out-of-order timestamp, naming both rows', () => {
  const res = validate(
    logCtx(
      [
        [T(5), 'start'],
        [T(2), 'develop:started'],
      ],
      GOOD_STAGES
    )
  );
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /out-of-order/.test(f) && /row 2\b/.test(f) && /row 1\b/.test(f)),
    JSON.stringify(res.failures)
  );
});

// --- Doubled steps -----------------------------------------------------------

test('fails a doubled departure (two pauses, no resume between), naming the pair', () => {
  const rows = [
    [T(0), 'start'],
    [T(1), 'pause'],
    [T(2), 'pause'],
  ];
  const res = validate(logCtx(rows, GOOD_STAGES));
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /doubled step/.test(f) && /row 3\b/.test(f) && /row 2\b/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('fails an orphan reengagement (two starts / resume with nothing open)', () => {
  const rows = [
    [T(0), 'start'],
    [T(1), 'start'],
  ];
  const res = validate(logCtx(rows, GOOD_STAGES));
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some(
      (f) => /doubled step/.test(f) && /no open interruption/.test(f) && /row 2\b/.test(f)
    ),
    JSON.stringify(res.failures)
  );
});

// --- Skipped steps -----------------------------------------------------------

test('fails a skipped step (interruption opened but never closed / log ends idle)', () => {
  const rows = [
    [T(0), 'start'],
    [T(1), 'develop:started'],
    [T(2), 'pause'],
  ];
  const res = validate(logCtx(rows, GOOD_STAGES));
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /skipped step/.test(f) && /never closed/.test(f) && /row 3\b/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('fails a leading departure with no active work to interrupt', () => {
  const res = validate(logCtx([[T(0), 'pause']], GOOD_STAGES));
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /skipped step/.test(f) && /no active work/.test(f)),
    JSON.stringify(res.failures)
  );
});

// --- Reconciliation vs aitm-entered markers ----------------------------------

test('fails when a timing phase row names a stage the body never entered', () => {
  // Log records test:started but enteredStages only has develop.
  const rows = [
    [T(0), 'start'],
    [T(1), 'test:started'],
  ];
  const res = validate(logCtx(rows, [{ stage: 'develop' }]));
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /stage "test"/.test(f) && /aitm-entered-test/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('non-lifecycle qualified slugs (switch-out:#N, issue:wrap) are not reconciled', () => {
  const rows = [
    [T(0), 'start'],
    [T(1), 'switch-out:#813'],
    [T(2), 'resumed'],
    [T(3), 'issue:wrap'],
  ];
  const res = validate(logCtx(rows, GOOD_STAGES));
  assert.equal(res.pass, true, JSON.stringify(res.failures));
});

// --- Absence / degenerate inputs ---------------------------------------------

test('fails when there is no ⏱ Timing Log comment', () => {
  const res = validate({ comments: [{ body: 'just a normal comment' }], markers: {} });
  assert.equal(res.pass, false);
  assert.ok(res.failures.some((f) => /no ⏱ Timing Log/.test(f)));
});

test('fails when the timing log has no data rows', () => {
  const res = validate({
    comments: [{ body: `## ⏱ Timing Log\n\n${HEADER}\n${SEP}\n` }],
    markers: {},
  });
  assert.equal(res.pass, false);
  assert.ok(res.failures.some((f) => /no data rows/.test(f)));
});

// --- Helper units ------------------------------------------------------------

test('extractDataRows bounds the scan to the table and skips the separator', () => {
  const body = `## ⏱ Timing Log\n\n${HEADER}\n${SEP}\n| ${T(0)} | start |  |  |  | 0 | x |\n\nafter table`;
  const rows = extractDataRows(body);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].index, 1);
  assert.equal(rows[0].event, 'start');
});

test('findTimingLogBody returns the matching comment body', () => {
  const found = findTimingLogBody([{ body: 'nope' }, { body: '## ⏱ Timing Log\nx' }]);
  assert.match(found, /⏱ Timing Log/);
  assert.equal(findTimingLogBody([{ body: 'nope' }]), null);
});

// --- Registration ------------------------------------------------------------

test('bootstrap registers the validator on the shared singleton', async () => {
  await import('../bootstrap.mjs');
  const { registry } = await import('../registry.mjs');
  assert.ok(
    registry.validators().some((v) => v.id === 'timing-log-sequence'),
    'timing-log-sequence not registered'
  );
});

// Run order (V1 → V2 → V3) is owned by bootstrap.mjs import-line order, not the
// singleton (which this test file pollutes by importing the validator directly).
// Assert the source contract instead.
test('bootstrap imports V3 after V1 and V2', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../bootstrap.mjs', import.meta.url), 'utf8');
  const iV1 = src.indexOf('validators/body-sections.mjs');
  const iV2 = src.indexOf('validators/required-comments.mjs');
  const iV3 = src.indexOf('validators/timing-log-sequence.mjs');
  assert.ok(iV1 >= 0 && iV2 >= 0 && iV3 >= 0, 'all three validator imports present');
  assert.ok(iV3 > iV2 && iV2 > iV1, 'V3 import must follow V2 which follows V1');
});
