// @story #545 — CLI create path stamps the kind prefix (AC2).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildIssueTitle } from '../../../gh/create-issue.mjs';

test('buildIssueTitle stamps each kind prefix from --label (AC2)', () => {
  assert.equal(
    buildIssueTitle({ title: 'login crashes', label: ['bug'] }),
    '🐞 [BUG] login crashes'
  );
  assert.equal(
    buildIssueTitle({ title: 'export fails', label: ['beta-defect'] }),
    '🐞 [Defect] export fails'
  );
  assert.equal(
    buildIssueTitle({ title: 'dark mode', label: ['beta-feature'] }),
    '🙏 [Feature Request] dark mode'
  );
  assert.equal(buildIssueTitle({ title: 'what if', label: ['idea'] }), '🤓 [Idea] what if');
});

test('buildIssueTitle leaves a non-kind title untouched (AC2)', () => {
  assert.equal(
    buildIssueTitle({ title: 'add export button', label: ['enhancement'] }),
    'add export button'
  );
  assert.equal(buildIssueTitle({ title: 'add export button', label: [] }), 'add export button');
});

test('buildIssueTitle is idempotent on the create path (AC2)', () => {
  const once = buildIssueTitle({ title: 'login crashes', label: ['bug'] });
  assert.equal(buildIssueTitle({ title: once, label: ['bug'] }), '🐞 [BUG] login crashes');
});
