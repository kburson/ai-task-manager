// @story #793
// resolveAssignee is the seam that makes new issues default to UNASSIGNED:
// explicit --assignee <login> → login; absent/empty → null (no assignee). The
// config `assignee` is intentionally NOT a fallback — honoring it would defeat
// the default-unassigned behavior, since it ships as `@me`.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { resolveAssignee } from '../../../gh/create-issue.mjs';

test('resolveAssignee: explicit --assignee returns the login', () => {
  assert.equal(resolveAssignee({ assignee: 'octocat' }), 'octocat');
  assert.equal(resolveAssignee({ assignee: '@me' }), '@me');
});

test('resolveAssignee: no/empty --assignee returns null (unassigned)', () => {
  assert.equal(resolveAssignee({}), null);
  assert.equal(resolveAssignee({ assignee: '' }), null);
  assert.equal(resolveAssignee({ assignee: true }), null);
});
