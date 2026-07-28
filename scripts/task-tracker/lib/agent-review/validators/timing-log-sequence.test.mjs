// Tests for the V3 timing-log-sequence validator (#812, rewritten for the
// timing model v2 grammar under #828).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, extractDataRows, findTimingLogBody } from './timing-log-sequence.mjs';

// Build a ⏱ Timing Log comment body from `[ts, event, desc?]` rows, mirroring
// the live table shape. Returns a review-context object.
const HEADER =
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |';
const SEP = '|---|---|---|---|---|---|---|---|';

function logCtx(rows, enteredStages = [], issueBody = '') {
  const body = [
    '## ⏱ Timing Log',
    '',
    HEADER,
    SEP,
    ...rows.map(
      ([ts, ev, desc = '', rowSec = '']) =>
        `| ${ts} | ${ev} |  |  |  | 0 | ${desc} |  |${rowSec ? ` ${rowSec}` : ''}`
    ),
    '',
    '<sub>auto-logged</sub>',
  ].join('\n');
  return { comments: [{ body }], markers: { enteredStages }, body: issueBody };
}

// `stages` → enteredStages marker list.
const entered = (...stages) => stages.map((stage) => ({ stage }));

// Monotonic non-decreasing table timestamps.
const T = (n) => `2026-07-14 03:${String(n).padStart(2, '0')}:00 -05:00`;

function sentinelRevertMarker({
  ts = '2026-07-14T08:03:30.000Z',
  from = 'develop',
  recorded = from,
  to = 'plan',
} = {}) {
  return (
    `<!-- aitm-reverted ts="${ts}" detail="revert-to-sentinel: ` +
    `board &quot;${from}&quot;, recorded &quot;${recorded}&quot; ` +
    `→ sentinel &quot;${to}&quot;" -->`
  );
}

// A well-formed, sequential log: engage → phase → pause → resume → phase.
const GOOD_ROWS = [
  [T(0), 'start', 'bound'],
  [T(1), 'develop:started', 'entered develop'],
  [T(2), 'pause', 'question'],
  [T(3), 'resumed', 'answered'],
  [T(4), 'develop:completed', 'done'],
];
const GOOD_STAGES = entered('develop');

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

test('passes a full healed v2 log including the review→develop rework path', () => {
  // The real shape of a healed v2 log (from #834): a single leading `resumed`,
  // the forward ladder walk, one failed-review rework rewind
  // (review:started → review:failed → demoted:develop → develop:started), then a
  // clean second pass to review:approved and close. Exercises every concern at
  // once: no retired rows, balanced bracket, legal stage walk (including the
  // sanctioned review→develop reverse), and the `:failed` reconciliation exempt.
  const rows = [
    [T(0), 'resumed'],
    [T(1), 'on-deck:started'],
    [T(2), 'refine:started'],
    [T(3), 'refine:completed'],
    [T(4), 'plan:started'],
    [T(5), 'plan:completed'],
    [T(6), 'develop:started'],
    [T(7), 'develop:completed'],
    [T(8), 'test:started'],
    [T(9), 'test:passed'],
    [T(10), 'review:started'],
    [T(11), 'review:failed'],
    [T(12), 'demoted:develop'],
    [T(13), 'develop:started'],
    [T(14), 'develop:completed'],
    [T(15), 'test:started'],
    [T(16), 'test:passed'],
    [T(17), 'review:started'],
    [T(18), 'review:approved'],
    [T(19), 'issue:wrap'],
    [T(20), 'issue:closed'],
  ];
  const res = validate(
    logCtx(rows, entered('on-deck', 'refine', 'plan', 'develop', 'test', 'review'))
  );
  assert.equal(res.pass, true, JSON.stringify(res.failures));
  assert.deepEqual(res.failures, []);
});

// --- Retired v2 vocabulary (AC1) ---------------------------------------------

test('fails a bare `idle` row as retired vocabulary, naming the row', () => {
  const res = validate(
    logCtx(
      [
        [T(0), 'start'],
        [T(1), 'idle'],
      ],
      GOOD_STAGES
    )
  );
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /row 2\b/.test(f) && /retired vocabulary/.test(f) && /idle/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('fails a bare `active-work` row as retired vocabulary', () => {
  const res = validate(
    logCtx(
      [
        [T(0), 'start'],
        [T(1), 'active-work'],
      ],
      GOOD_STAGES
    )
  );
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /retired vocabulary/.test(f) && /active-work/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('a qualified idle slug (idle:whatever) is also rejected by its base', () => {
  const res = validate(
    logCtx(
      [
        [T(0), 'start'],
        [T(1), 'idle:auto'],
      ],
      GOOD_STAGES
    )
  );
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /retired vocabulary/.test(f) && /idle/.test(f)),
    JSON.stringify(res.failures)
  );
});

// --- Kanban stage-transition walk --------------------------------------------

test('fails a forward-skip stage transition (develop → review, skipping test)', () => {
  const res = validate(
    logCtx(
      [
        [T(0), 'start'],
        [T(1), 'develop:started'],
        [T(2), 'review:started'],
      ],
      entered('develop', 'review')
    )
  );
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some(
      (f) => /illegal stage transition/.test(f) && /forward skip/.test(f) && /row 3\b/.test(f)
    ),
    JSON.stringify(res.failures)
  );
});

test('fails an unsanctioned reverse stage transition (develop → refine)', () => {
  const res = validate(
    logCtx(
      [
        [T(0), 'start'],
        [T(1), 'develop:started'],
        [T(2), 'refine:started'],
      ],
      entered('develop', 'refine')
    )
  );
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some(
      (f) => /illegal stage transition/.test(f) && /reverse/.test(f) && /sanctioned/.test(f)
    ),
    JSON.stringify(res.failures)
  );
});

test('passes the sanctioned reverse edge test→develop (failed sandbox rework)', () => {
  const res = validate(
    logCtx(
      [
        [T(0), 'develop:started'],
        [T(1), 'test:started'],
        [T(2), 'develop:started'],
      ],
      entered('develop', 'test')
    )
  );
  assert.equal(res.pass, true, JSON.stringify(res.failures));
});

test('passes the sanctioned reverse edge review→test', () => {
  const res = validate(
    logCtx(
      [
        [T(0), 'test:started'],
        [T(1), 'review:started'],
        [T(2), 'test:started'],
      ],
      entered('test', 'review')
    )
  );
  assert.equal(res.pass, true, JSON.stringify(res.failures));
});

test('passes the sanctioned reverse edge done→test (reopened issue re-verifies)', () => {
  const res = validate(
    logCtx(
      [
        [T(0), 'review:started'],
        [T(1), 'done:started'],
        [T(2), 'test:started'],
      ],
      entered('review', 'done', 'test')
    )
  );
  assert.equal(res.pass, true, JSON.stringify(res.failures));
});

test('applies a timestamped sentinel-revert audit before the next stage row', () => {
  const rows = [
    [T(0), 'plan:started'],
    [T(1), 'plan:completed'],
    [T(2), 'develop:started'],
    [T(4), 'plan:completed'],
    [T(5), 'develop:started'],
  ];
  const res = validate(logCtx(rows, entered('plan', 'develop'), sentinelRevertMarker()));
  assert.equal(res.pass, true, JSON.stringify(res.failures));
});

test('compares sentinel audits at the Timing Log row precision within the same second', () => {
  const rows = [
    [T(0), 'plan:started'],
    [T(1), 'develop:started'],
    [T(4), 'plan:completed'],
  ];
  const res = validate(
    logCtx(
      rows,
      entered('plan', 'develop'),
      sentinelRevertMarker({ ts: '2026-07-14T08:04:00.500Z' })
    )
  );
  assert.equal(res.pass, true, JSON.stringify(res.failures));
});

test('a sentinel-revert audit after the reverse row cannot authorize it', () => {
  const rows = [
    [T(0), 'plan:started'],
    [T(1), 'develop:started'],
    [T(4), 'plan:completed'],
  ];
  const res = validate(
    logCtx(
      rows,
      entered('plan', 'develop'),
      sentinelRevertMarker({ ts: '2026-07-14T08:05:00.000Z' })
    )
  );
  assert.equal(res.pass, false);
  assert.ok(res.failures.some((failure) => /reverse develop→plan/.test(failure)));
});

test('malformed or source-mismatched sentinel audits do not open a reverse edge', () => {
  const rows = [
    [T(0), 'develop:started'],
    [T(4), 'plan:completed'],
  ];
  const malformed = validate(
    logCtx(
      rows,
      entered('plan', 'develop'),
      '<!-- aitm-reverted ts="2026-07-14T08:03:30.000Z" detail="manual rewind" -->'
    )
  );
  const mismatched = validate(
    logCtx(rows, entered('plan', 'develop'), sentinelRevertMarker({ from: 'test' }))
  );
  for (const result of [malformed, mismatched]) {
    assert.equal(result.pass, false);
    assert.ok(result.failures.some((failure) => /reverse develop→plan/.test(failure)));
  }
});

test('seeds the walk on the first stage row (a log starting mid-ladder is legal)', () => {
  // No backlog/on-deck rows; walk seeds at refine and never trips a phantom
  // forward-skip against a backlog it never recorded.
  const res = validate(
    logCtx(
      [
        [T(0), 'resumed'],
        [T(1), 'refine:started'],
        [T(2), 'plan:started'],
      ],
      entered('refine', 'plan')
    )
  );
  assert.equal(res.pass, true, JSON.stringify(res.failures));
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

test('fails malformed colon-qualified events that match no canonical family', () => {
  for (const event of ['demoted:not-a-state', 'pause:two words', 'switch-out:#abc']) {
    const res = validate(logCtx([[T(0), event]], GOOD_STAGES));
    assert.equal(res.pass, false, event);
    assert.ok(
      res.failures.some((failure) => /malformed/.test(failure) && failure.includes(`"${event}"`)),
      `${event}: ${JSON.stringify(res.failures)}`
    );
  }
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
    [T(1), 'develop:started'],
    [T(2), 'test:started'],
  ];
  const res = validate(logCtx(rows, entered('develop')));
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /stage "test"/.test(f) && /aitm-entered-test/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('a review:failed audit row is exempt from entered-marker reconciliation (#829)', () => {
  // review:failed records a rejected attempt; the gate demotes without stamping
  // aitm-entered-review, so it must not demand that marker.
  const rows = [
    [T(0), 'test:started'],
    [T(1), 'review:started'],
    [T(2), 'review:failed'],
    [T(3), 'demoted:develop'],
    [T(4), 'develop:started'],
  ];
  const res = validate(logCtx(rows, entered('test', 'review', 'develop')));
  assert.equal(res.pass, true, JSON.stringify(res.failures));
});

test('a test:failed sandbox audit row permits canonical test→develop demotion', () => {
  const rows = [
    [T(0), 'develop:started'],
    [T(1), 'develop:completed'],
    [T(2), 'test:started'],
    [T(3), 'test:failed'],
    [T(4), 'demoted:develop'],
    [T(5), 'develop:started'],
  ];
  const res = validate(logCtx(rows, entered('develop', 'test')));
  assert.equal(res.pass, true, JSON.stringify(res.failures));
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

// --- Forensic suspicious-gap detection (#984) -------------------------------

test('fails a #899-shaped many-hour active lifecycle row with session-log remediation', () => {
  const rows = [
    [T(0), 'develop:started'],
    [
      '2026-07-25 19:33:17 -05:00',
      'develop:completed',
      'development complete',
      '<!-- row-sec: a=139826 i=0 -->',
    ],
  ];
  const res = validate(logCtx(rows, GOOD_STAGES));
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some(
      (f) =>
        /suspicious active duration/.test(f) &&
        /row 2\b/.test(f) &&
        /session logs/.test(f) &&
        /heal/.test(f)
    ),
    JSON.stringify(res.failures)
  );
});

test('fails a long unexplained wall-clock gap without a departure boundary', () => {
  const rows = [
    [T(0), 'develop:started'],
    ['2026-07-14 17:00:00 -05:00', 'develop:completed', 'development complete'],
  ];
  const res = validate(logCtx(rows, GOOD_STAGES));
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /suspicious wall-clock gap/.test(f) && /row 1→2/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('passes a long pause/resume gap because the idle boundary is explicit', () => {
  const rows = [
    [T(0), 'develop:started'],
    [T(1), 'pause'],
    ['2026-07-14 17:00:00 -05:00', 'resumed'],
    ['2026-07-14 17:01:00 -05:00', 'develop:completed'],
  ];
  const res = validate(logCtx(rows, GOOD_STAGES));
  assert.equal(res.pass, true, JSON.stringify(res.failures));
});

test('passes a long switch-out/resume gap because issue focus changed explicitly', () => {
  const rows = [
    [T(0), 'develop:started'],
    [T(1), 'switch-out:#899'],
    ['2026-07-14 17:00:00 -05:00', 'resumed'],
    ['2026-07-14 17:01:00 -05:00', 'develop:completed'],
  ];
  const res = validate(logCtx(rows, GOOD_STAGES));
  assert.equal(res.pass, true, JSON.stringify(res.failures));
});

// #983 — reproduces the #899 timeline shape (background worker terminates
// minutes after `develop:started`, the multi-hour gap goes unlogged until a
// later session), but bracketed by the new orphan-recovery honest departure
// pair (`hook-handler.mjs`'s `buildOrphanRecoveryRowSpecs`) instead of a
// single row fabricating the whole gap as active. The explicit idle boundary
// makes this pass the sequence validator exactly like any other pause/resume
// gap (mirrors the `passes a long pause/resume gap` case above) — no false
// multi-hour active duration is asserted anywhere in the log.
test('passes the #899 timeline shape once bracketed by the orphan-recovery pause/resumed pair', () => {
  const rows = [
    [T(0), 'develop:started'],
    [T(1), 'pause:orphan-recovery'],
    ['2026-07-25 19:33:00 -05:00', 'resumed'],
    ['2026-07-25 19:33:17 -05:00', 'develop:completed', 'development complete'],
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
  const body = `## ⏱ Timing Log\n\n${HEADER}\n${SEP}\n| ${T(0)} | start |  |  |  | 0 | x |  |\n\nafter table`;
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
