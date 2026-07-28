// @story #1039

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const HOOK = 'scripts/task-tracker/hook-handler.mjs';
const HOOK_TEST = 'scripts/task-tracker/tests/unit/lib/hook-session-start.test.mjs';
const VALIDATOR = 'scripts/task-tracker/lib/agent-review/validators/timing-log-sequence.mjs';

test('runtime recovery consumers import suspicious-gap policy from the operational leaf', () => {
  for (const file of [HOOK, HOOK_TEST]) {
    const source = readFileSync(file, 'utf8');
    assert.match(
      source,
      /import\s*\{\s*SUSPICIOUS_GAP_SEC\s*\}\s*from\s*['"].*lib\/bind-event\.mjs['"]/,
      `${file} must import recovery policy from bind-event.mjs`
    );
    assert.doesNotMatch(
      source,
      /SUSPICIOUS_GAP_SEC[\s\S]*?from\s*['"].*agent-review\/validators\//,
      `${file} must not reach recovery policy through an Agent Review validator`
    );
  }
});

test('the timing-log validator consumes but does not re-export recovery policy', () => {
  const source = readFileSync(VALIDATOR, 'utf8');
  assert.match(
    source,
    /import\s*\{\s*SUSPICIOUS_GAP_SEC\s*\}\s*from\s*['"]\.\.\/\.\.\/bind-event\.mjs['"]/,
    'validator must consume recovery policy from bind-event.mjs'
  );
  assert.doesNotMatch(
    source,
    /export\s*\{\s*SUSPICIOUS_GAP_SEC\s*\}/,
    'validator must not re-export operational recovery policy'
  );
});
