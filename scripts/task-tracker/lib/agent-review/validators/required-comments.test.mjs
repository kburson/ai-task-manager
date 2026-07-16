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

// --- #835: kind-aware skipping of code-only rows -------------------------------
// The `Commits` and `New Automated Tests` rows are report comments only a
// code-kind deliverable produces. No-commit kinds (epic/audit/spike/research)
// never emit them, so V2 must skip those two rows for such bodies while still
// enforcing the three always-required rows.
const EPIC_BODY = 'Some epic.\n<!-- aitm-issue-kind kind="epic" -->\n';
const ALWAYS_REQUIRED = ['Timing Log', 'Refine Estimate', 'Full-Auto plan-approval audit'];

test('#835 no-commit body: missing all five reports only the three always-required', () => {
  const res = validate({ comments: [], body: EPIC_BODY });
  assert.equal(res.pass, false);
  assert.equal(res.failures.length, ALWAYS_REQUIRED.length, JSON.stringify(res.failures));
  for (const label of ALWAYS_REQUIRED) {
    assert.ok(
      res.failures.some((f) => f.includes(label)),
      `always-required '${label}' not reported: ${JSON.stringify(res.failures)}`
    );
  }
  assert.ok(
    !res.failures.some((f) => /Commits|New Automated Tests/.test(f)),
    `code-only rows must not be reported for a no-commit body: ${JSON.stringify(res.failures)}`
  );
});

test('#835 code-kind body (no marker): missing all five still reports all five', () => {
  const res = validate({ comments: [], body: 'A plain code issue with no kind marker.' });
  assert.equal(res.pass, false);
  assert.equal(res.failures.length, REQUIRED_COMMENTS.length, JSON.stringify(res.failures));
});

test('#835 no-commit body missing one always-required still reports it', () => {
  const comments = ALWAYS_REQUIRED.filter((l) => l !== 'Timing Log').map((l) => ({
    body: SAMPLES[l],
  }));
  const res = validate({ comments, body: EPIC_BODY });
  assert.equal(res.pass, false);
  assert.deepEqual(
    res.failures.map((f) => f),
    ["required comment 'Timing Log' is missing"],
    JSON.stringify(res.failures)
  );
});

test('#835 no-commit body with all three always-required present passes', () => {
  const comments = ALWAYS_REQUIRED.map((l) => ({ body: SAMPLES[l] }));
  const res = validate({ comments, body: EPIC_BODY });
  assert.equal(res.pass, true, JSON.stringify(res.failures));
  assert.deepEqual(res.failures, []);
});

test('bootstrap registers the validator on the shared singleton', async () => {
  await import('../bootstrap.mjs');
  const { registry } = await import('../registry.mjs');
  assert.ok(
    registry.validators().some((v) => v.id === 'required-comments'),
    'required-comments not registered'
  );
});
