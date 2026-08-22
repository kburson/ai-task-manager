#!/usr/bin/env node
// @story #113
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const root = path.resolve(__dir, '../../../..');

const docs = [
  'templates/pickup-directive.md',
  '.ai-task-manager/templates/pickup-directive.md',
  'skill/adapters/codex/SKILL.md',
  'skill/adapters/claude/SKILL.md',
];

for (const rel of docs) {
  const abs = path.join(root, rel);
  assert.ok(existsSync(abs), `${rel} exists`);
  const body = readFileSync(abs, 'utf8');
  assert.match(
    body,
    /aitm-verified vc-list="vc:N"/,
    `${rel} documents current aitm-verified vc-list="vc:N" citations`
  );
  assert.match(
    body,
    /Verification\s+Commands|root commands/,
    `${rel} identifies the root Verification Commands contract`
  );
}

// #491 relocated the verbose AC↔Verification-Commands guidance out of the
// resident core into the JIT rationale (it is loaded on pickup, just not on
// the persistent token floor). The contract is unchanged — only its file moved.
for (const rel of ['templates/references/pickup-directive-rationale.md']) {
  const body = readFileSync(path.join(root, rel), 'utf8');
  assert.match(
    body,
    /Acceptance Criteria[\s\S]+aitm-verified vc-list="vc:N"[\s\S]+Verification Commands/i,
    `${rel} links AC evidence citations to Verification Commands`
  );
  assert.match(
    body,
    /cited ID must[\s\S]+root[\s\S]+Verification Commands/is,
    `${rel} requires every cited ID to resolve in root Verification Commands`
  );
}

console.log('evidence-marker-guidance.test.mjs: all passed');
