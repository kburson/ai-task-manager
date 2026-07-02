// @story #674
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseTestEntriesFromDiff,
  collectTestDiffEntries,
  buildNewAutomatedTestsComment,
  postNewAutomatedTestsComment,
  NEW_TESTS_HEADING,
  NEW_TESTS_FOOTER,
} from '../../lib/new-automated-tests-comment.mjs';

test('parseTestEntriesFromDiff: new test addition', () => {
  const diff = [
    'diff --git a/foo.test.mjs b/foo.test.mjs',
    '--- a/foo.test.mjs',
    '+++ b/foo.test.mjs',
    "+test('adds two numbers', () => {});",
  ].join('\n');
  assert.deepEqual(parseTestEntriesFromDiff(diff), [
    { file: 'foo.test.mjs', name: 'adds two numbers' },
  ]);
});

test('parseTestEntriesFromDiff: modified existing test re-emits its declaration line as an addition', () => {
  const diff = [
    '+++ b/foo.test.mjs',
    "-test('old behavior', () => { assert.ok(false); });",
    "+test('old behavior', () => { assert.ok(true); });",
  ].join('\n');
  assert.deepEqual(parseTestEntriesFromDiff(diff), [
    { file: 'foo.test.mjs', name: 'old behavior' },
  ]);
});

test('parseTestEntriesFromDiff: test.skip declaration', () => {
  const diff = ['+++ b/foo.test.mjs', "+test.skip('not ready yet', () => {});"].join('\n');
  assert.deepEqual(parseTestEntriesFromDiff(diff), [
    { file: 'foo.test.mjs', name: 'not ready yet' },
  ]);
});

test('parseTestEntriesFromDiff: multiple files in one diff', () => {
  const diff = [
    '+++ b/a.test.mjs',
    "+test('a case', () => {});",
    '+++ b/b.test.mjs',
    "+test('b case', () => {});",
  ].join('\n');
  assert.deepEqual(parseTestEntriesFromDiff(diff), [
    { file: 'a.test.mjs', name: 'a case' },
    { file: 'b.test.mjs', name: 'b case' },
  ]);
});

test('parseTestEntriesFromDiff: empty/non-matching diff produces zero entries', () => {
  const diff = ['+++ b/foo.test.mjs', '+const x = 1;'].join('\n');
  assert.deepEqual(parseTestEntriesFromDiff(diff), []);
});

test('collectTestDiffEntries: dedupes across SHAs and skips failing SHAs', async () => {
  const showShaTestDiff = async (sha) => {
    if (sha === 'bad') throw new Error('unreachable');
    if (sha === 'sha1') return "+++ b/foo.test.mjs\n+test('case one', () => {});";
    if (sha === 'sha2') return "+++ b/foo.test.mjs\n+test('case one', () => {});";
    return '';
  };
  const entries = await collectTestDiffEntries({
    shas: ['sha1', 'bad', 'sha2'],
    deps: { showShaTestDiff },
  });
  assert.deepEqual(entries, [{ file: 'foo.test.mjs', name: 'case one' }]);
});

test('buildNewAutomatedTestsComment: returns null on empty input', () => {
  assert.equal(buildNewAutomatedTestsComment([]), null);
  assert.equal(buildNewAutomatedTestsComment(null), null);
});

test('buildNewAutomatedTestsComment: groups entries by file under the heading', () => {
  const body = buildNewAutomatedTestsComment([
    { file: 'a.test.mjs', name: 'case one' },
    { file: 'a.test.mjs', name: 'case two' },
    { file: 'b.test.mjs', name: 'case three' },
  ]);
  assert.ok(body.startsWith(NEW_TESTS_HEADING));
  assert.match(body, /`a\.test\.mjs`/);
  assert.match(body, /case one/);
  assert.match(body, /case two/);
  assert.match(body, /`b\.test\.mjs`/);
  assert.match(body, /case three/);
});

// #684 — legend footer
test('buildNewAutomatedTestsComment: appends the explanatory footer when entries exist', () => {
  const body = buildNewAutomatedTestsComment([{ file: 'a.test.mjs', name: 'case one' }]);
  assert.ok(body.includes(NEW_TESTS_FOOTER), 'footer substring present in a built comment');
});

test('buildNewAutomatedTestsComment: empty input returns null with no footer', () => {
  assert.equal(buildNewAutomatedTestsComment([]), null);
  assert.equal(buildNewAutomatedTestsComment(null), null);
});

test('buildNewAutomatedTestsComment: body with footer still satisfies the dedupe startsWith predicate', () => {
  const body = buildNewAutomatedTestsComment([{ file: 'a.test.mjs', name: 'case one' }]);
  // postNewAutomatedTestsComment dedupes on c.body.startsWith(NEW_TESTS_HEADING);
  // the footer is appended at the END, so this must remain true.
  assert.ok(body.startsWith(NEW_TESTS_HEADING));
});

test('postNewAutomatedTestsComment: posts a dedicated comment when entries are found', async () => {
  const created = [];
  const result = await postNewAutomatedTestsComment({
    cfg: { repo: 'kburson/ai-task-manager' },
    issueNumber: 674,
    deps: {
      listComments: async () => [{ body: '### 🔗 Commits\n<!-- aitm-commits shas="sha1" -->' }],
      showShaTestDiff: async () => "+++ b/foo.test.mjs\n+test('case one', () => {});",
      createComment: async ({ body }) => created.push(body),
    },
  });
  assert.equal(result.status, 'posted');
  assert.equal(created.length, 1);
  assert.ok(created[0].startsWith(NEW_TESTS_HEADING));
  assert.ok(!created[0].includes('CODE_COMPLETE'));
});

test('postNewAutomatedTestsComment: no test files changed means no comment posted', async () => {
  let createCalled = false;
  const result = await postNewAutomatedTestsComment({
    cfg: { repo: 'kburson/ai-task-manager' },
    issueNumber: 674,
    deps: {
      listComments: async () => [{ body: '### 🔗 Commits\n<!-- aitm-commits shas="sha1" -->' }],
      showShaTestDiff: async () => '+++ b/foo.mjs\n+const x = 1;',
      createComment: async () => {
        createCalled = true;
      },
    },
  });
  assert.equal(result.status, 'no-tests');
  assert.equal(createCalled, false);
});

test('postNewAutomatedTestsComment: no commit trail comment is a no-op', async () => {
  const result = await postNewAutomatedTestsComment({
    cfg: { repo: 'kburson/ai-task-manager' },
    issueNumber: 674,
    deps: {
      listComments: async () => [],
      createComment: async () => {
        throw new Error('should not be called');
      },
    },
  });
  assert.equal(result.status, 'no-commits');
});

test('postNewAutomatedTestsComment: skips if a New Automated Tests comment already exists', async () => {
  let createCalled = false;
  const result = await postNewAutomatedTestsComment({
    cfg: { repo: 'kburson/ai-task-manager' },
    issueNumber: 674,
    deps: {
      listComments: async () => [
        { body: '### 🔗 Commits\n<!-- aitm-commits shas="sha1" -->' },
        { body: `${NEW_TESTS_HEADING}\n\n- \`foo.test.mjs\`\n  - case one` },
      ],
      createComment: async () => {
        createCalled = true;
      },
    },
  });
  assert.equal(result.status, 'duplicate');
  assert.equal(createCalled, false);
});
