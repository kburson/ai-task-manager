// @story #1207
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { EXIT_ASSIGNED_REQUIRES_ASSIGNEE } from '../../../lib/assigned-assignee-invariant.mjs';

const files = ['docs/guides/workflow.md', 'CLAUDE.md', 'skill/shared/rules/state-walk.md'];

test('authoritative workflow surfaces document the Assigned assignee invariant', () => {
  assert.equal(EXIT_ASSIGNED_REQUIRES_ASSIGNEE, 11);
  for (const file of files) {
    const body = readFileSync(file, 'utf8');
    assert.match(body, /Assigned requires at least one (?:live GitHub )?assignee/i, file);
    assert.match(body, /Refine through Done.*never/i, file);
    assert.match(body, /\/task assign #?N/i, file);
    assert.match(body, /reconcile assigned-invariant #?N --apply/i, file);
    assert.match(body, /exit (?:code )?11/i, file);
  }
});
