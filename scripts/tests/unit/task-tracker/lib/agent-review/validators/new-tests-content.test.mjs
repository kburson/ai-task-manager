// @story #813
// Tests for the V4 new-tests-content validator (#813).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../../../../../../task-tracker/lib/agent-review/validators/new-tests-content.mjs';
import {
  buildNewAutomatedTestsComment,
  NEW_TESTS_HEADING,
  NEW_TESTS_FOOTER,
} from '../../../../../../task-tracker/lib/new-automated-tests-comment.mjs';

// A well-formed report built by the REAL generator — guards self-consistency:
// whatever the generator emits must pass V4.
const WELL_FORMED = buildNewAutomatedTestsComment([
  {
    file: 'scripts/tests/unit/task-tracker/lib/agent-review/validators/new-tests-content.test.mjs',
    name: 'passes a well-formed comment',
  },
  {
    file: 'scripts/tests/unit/task-tracker/lib/agent-review/validators/new-tests-content.test.mjs',
    name: 'fails a heading-only comment',
  },
  { file: 'scripts/task-tracker/lib/other.test.mjs', name: 'does a second-file thing' },
]);

test('passes a well-formed generator-built comment (files + nested names)', () => {
  const res = validate({ comments: [{ body: WELL_FORMED }] });
  assert.equal(res.pass, true, JSON.stringify(res.failures));
  assert.deepEqual(res.failures, []);
});

test('fails a heading-only comment — lists no test files', () => {
  const res = validate({ comments: [{ body: NEW_TESTS_HEADING }] });
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /no test files/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('fails a heading + footer with no bullets — lists no test files', () => {
  const body = `${NEW_TESTS_HEADING}\n\n${NEW_TESTS_FOOTER}`;
  const res = validate({ comments: [{ body }] });
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /no test files/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('fails a placeholder `- none` body — not a backtick-wrapped file bullet', () => {
  const body = `${NEW_TESTS_HEADING}\n\n- none\n`;
  const res = validate({ comments: [{ body }] });
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /no test files/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('fails a placeholder `_No new tests_` italic body', () => {
  const body = `${NEW_TESTS_HEADING}\n\n_No new tests_\n`;
  const res = validate({ comments: [{ body }] });
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /no test files/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('fails a file bullet with zero nested test names — lists files but no test names', () => {
  const body = `${NEW_TESTS_HEADING}\n\n- \`foo.test.mjs\`\n- \`bar.test.mjs\`\n`;
  const res = validate({ comments: [{ body }] });
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /files but no test names/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('absence of the comment defers to V2 → passes', () => {
  const res = validate({ comments: [{ body: '### 🔗 Commits\n\n- abc did a thing' }] });
  assert.equal(res.pass, true, JSON.stringify(res.failures));
  assert.deepEqual(res.failures, []);
});

test('tolerates a missing / non-array comments context (defers to V2)', () => {
  for (const comments of [[], undefined, null, 'not-an-array']) {
    const res = validate({ comments });
    assert.equal(res.pass, true, JSON.stringify({ comments, res }));
  }
});

test('a single well-formed file with one nested name passes', () => {
  const body = `${NEW_TESTS_HEADING}\n\n- \`x.test.mjs\`\n  - only test\n`;
  const res = validate({ comments: [{ body }] });
  assert.equal(res.pass, true, JSON.stringify(res.failures));
});

test('bootstrap registers the validator on the shared singleton', async () => {
  await import('../../../../../../task-tracker/lib/agent-review/bootstrap.mjs');
  const { registry } = await import('../../../../../../task-tracker/lib/agent-review/registry.mjs');
  assert.ok(
    registry.validators().some((v) => v.id === 'new-tests-content'),
    'new-tests-content not registered'
  );
});
