#!/usr/bin/env node
// @story #153
// Source-level lock: the resident pickup-directive.md and the Claude adapter
// SKILL.md must both name the Checkpoint Pause rule. The four trigger bullets
// are tiered into the JIT rationale reference (#491), so they are asserted
// there. This is what downstream users get when they install the package — the
// rule has to ride along in the shipped artifacts.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url)) + '/..';
const repoRoot = join(here, '..', '..', '..', '..');

const pickup = readFileSync(join(repoRoot, 'templates/pickup-directive.md'), 'utf8');
const skill = readFileSync(join(repoRoot, 'skill/adapters/claude/SKILL.md'), 'utf8');
const rationale = readFileSync(
  join(repoRoot, 'templates/references/pickup-directive-rationale.md'),
  'utf8'
);

assert.ok(
  /Checkpoint Pause/.test(pickup),
  'templates/pickup-directive.md must contain "Checkpoint Pause"'
);
assert.ok(
  /Checkpoint Pause/.test(skill),
  'skill/adapters/claude/SKILL.md must contain "Checkpoint Pause"'
);

const triggers = [
  /Before `\/task` state moves/,
  /Before switching active issue/,
  /Before closing an issue/,
  /Before parallel-agent fan-out/,
];

for (const re of triggers) {
  assert.ok(
    re.test(rationale),
    `templates/references/pickup-directive-rationale.md missing trigger bullet: ${re}`
  );
}

console.log('pickup-directive-has-checkpoint: PASS');
