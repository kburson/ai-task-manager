import assert from 'node:assert/strict';
import { buildRow } from '../gh-timing-comment.mjs';

// Pause row carries free-text reason in description column.
{
  const row = buildRow({
    ts: new Date().toISOString(),
    event: 'pause',
    activeMin: 5,
    idleMin: 0,
    deltaWords: 1200,
    wordMarker: 5000,
    description: 'pause for question',
  });
  assert.match(row, /\| pause \|/);
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
    event: 'pause',
    activeMin: 1,
    idleMin: 0,
    deltaWords: 0,
    wordMarker: 0,
    description: '',
  });
  assert.match(row, /\| {2}\|$/);
}

console.log('pause-resume-reason.test.mjs: all passed');
