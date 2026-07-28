// @story #38 (extended #475 AC2)
import assert from 'node:assert/strict';
import { buildRow } from '../../../gh-timing-comment.mjs';
import { computePauseIdleSec } from '../../../verbs/resume.mjs';

// Pause row carries free-text reason in description column.
{
  const row = buildRow({
    ts: new Date().toISOString(),
    event: 'pause:other',
    activeMin: 5,
    idleMin: 0,
    deltaWords: 1200,
    wordMarker: 5000,
    description: 'pause for question',
  });
  assert.match(row, /\| pause:other \|/);
  assert.match(row, /\| pause for question \|$/);
}

// Resume row carries the answered-question reason.
{
  const row = buildRow({
    ts: new Date(Date.now() - 5000).toISOString(),
    event: 'resumed',
    activeMin: 0,
    idleMin: 0,
    deltaWords: 0,
    wordMarker: 5000,
    description: 'question answered',
  });
  assert.match(row, /\| resumed \|/);
  assert.match(row, /\| question answered \|$/);
}

// Empty description yields blank-but-present description column (not "task resumed" fallback —
// the verb layer is responsible for choosing fallback strings; buildRow itself just renders).
{
  const row = buildRow({
    ts: new Date(Date.now() - 10000).toISOString(),
    event: 'pause:other',
    activeMin: 1,
    idleMin: 0,
    deltaWords: 0,
    wordMarker: 0,
    description: '',
  });
  assert.match(row, /\| {2}\|$/);
}

// #475 AC2 — computePauseIdleSec turns a pausedAtTs / resumeTs pair into the
// idle span (whole seconds) that resume stamps on the `resumed` row.
{
  // 7-minute pause window => 420 idle seconds.
  assert.equal(
    computePauseIdleSec('2026-06-20T10:00:00Z', '2026-06-20T10:07:00Z'),
    420,
    '7-minute pause window = 420 idle seconds'
  );
  // No pausedAtTs (resume after a stop, or legacy state) => 0, never throws.
  assert.equal(computePauseIdleSec(null, '2026-06-20T10:07:00Z'), 0, 'missing pausedAtTs => 0');
  assert.equal(
    computePauseIdleSec(undefined, '2026-06-20T10:07:00Z'),
    0,
    'undefined pausedAtTs => 0'
  );
  // Clock skew (resume before pause) clamps to 0 rather than going negative.
  assert.equal(
    computePauseIdleSec('2026-06-20T10:07:00Z', '2026-06-20T10:00:00Z'),
    0,
    'negative span clamps to 0'
  );
  // Unparseable timestamps => 0.
  assert.equal(computePauseIdleSec('not-a-date', '2026-06-20T10:07:00Z'), 0, 'bad pausedAtTs => 0');
  // Sub-second rounding.
  assert.equal(
    computePauseIdleSec('2026-06-20T10:00:00.000Z', '2026-06-20T10:00:01.600Z'),
    2,
    'rounds 1.6s to 2'
  );
}

console.log('pause-resume-reason.test.mjs: all passed');
