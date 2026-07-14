// Tests for the V2 required-comments validator (#811).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, REQUIRED_COMMENTS } from './required-comments.mjs';

// One satisfying comment body per required row. Signals mirror the live
// #810 comment stream.
const SAMPLES = {
  'Timing Log': '⏱ Timing Log\n\n| Row | ... |',
  'Refine Estimate':
    '<!-- aitm-refined-estimate: 811 -->\n### 🛠 Refine estimate\n\n### Planned Estimate\n\n| Field | ... |',
  'Full-Auto plan-approval audit': '### Full-Auto Plan-Approval Audit — #811\n\nNo human reviewer.',
  Commits: '### 🔗 Commits\n\n- abc1234 did a thing',
  'New Automated Tests': '## New Automated Tests\n\n- `foo.test.mjs`',
};

// Build a `comments` array (raw gh shape) covering every label except `omit`.
function commentsExcept(omit) {
  return REQUIRED_COMMENTS.filter((r) => r.label !== omit).map((r) => ({ body: SAMPLES[r.label] }));
}

test('passes when all five required comments are present', () => {
  const comments = REQUIRED_COMMENTS.map((r) => ({ body: SAMPLES[r.label] }));
  const res = validate({ comments });
  assert.equal(res.pass, true, JSON.stringify(res.failures));
  assert.deepEqual(res.failures, []);
});

// Table-driven: dropping any one required comment fails and names it.
for (const row of REQUIRED_COMMENTS) {
  test(`fails and names the missing '${row.label}' comment`, () => {
    const res = validate({ comments: commentsExcept(row.label) });
    assert.equal(res.pass, false);
    assert.ok(
      res.failures.some((f) => f.includes(row.label) && /missing/.test(f)),
      JSON.stringify(res.failures)
    );
  });
}

test('Refine Estimate marker WITHOUT a Planned Estimate block still fails', () => {
  const comments = REQUIRED_COMMENTS.map((r) => ({ body: SAMPLES[r.label] }));
  // Strip the Planned Estimate block from the refine-estimate comment.
  const idx = comments.findIndex((c) => /aitm-refined-estimate/.test(c.body));
  comments[idx] = {
    body: '<!-- aitm-refined-estimate: 811 -->\n### 🛠 Refine estimate\n\n(no plan)',
  };
  const res = validate({ comments });
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /Refine Estimate.*missing/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('empty / absent comments context fails and names all five', () => {
  for (const comments of [[], undefined, null, 'not-an-array']) {
    const res = validate({ comments });
    assert.equal(res.pass, false);
    assert.equal(res.failures.length, REQUIRED_COMMENTS.length);
  }
});

test('a comment with no body string is tolerated (treated as empty)', () => {
  const res = validate({ comments: [{ author: 'x' }, {}, { body: null }] });
  assert.equal(res.pass, false);
  assert.equal(res.failures.length, REQUIRED_COMMENTS.length);
});

test('bootstrap registers the validator on the shared singleton', async () => {
  await import('../bootstrap.mjs');
  const { registry } = await import('../registry.mjs');
  assert.ok(
    registry.validators().some((v) => v.id === 'required-comments'),
    'required-comments not registered'
  );
});
