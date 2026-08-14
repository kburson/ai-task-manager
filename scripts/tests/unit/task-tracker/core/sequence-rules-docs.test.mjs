#!/usr/bin/env node
// @story #162
// Verifies that the "Rank rules" subsection is present in both the pickup
// rationale reference and the Claude adapter SKILL.md so agents can reach the
// child-cannot-lead-epic invariant on pickup (#162). The full Rank-rules prose
// was tiered out of the resident directive into the JIT rationale by #491.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const FILES = [
  'templates/references/pickup-directive-rationale.md',
  'skill/adapters/claude/SKILL.md',
];

for (const file of FILES) {
  test(`${file} contains a Rank rules subsection`, () => {
    const body = readFileSync(file, 'utf8');
    assert.match(body, /Rank rules/, `${file} must mention "Rank rules"`);
    assert.match(
      body,
      /child-cannot-lead-epic|child sub-issues may not lead/i,
      `${file} must reference the gate by name or rule`
    );
    // No env override exists — the prior TASK_TRACKER_FORCE_PROMOTE bypass was
    // removed. Docs must not advertise a non-existent escape hatch.
    assert.doesNotMatch(
      body,
      /TASK_TRACKER_FORCE_PROMOTE/,
      `${file} must NOT reference the removed FORCE_PROMOTE override`
    );
  });
}
