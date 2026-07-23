#!/usr/bin/env node
// @story #113
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const root = path.resolve(__dir, '..', '../../..');

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
    /aitm-verified cmd="…"/,
    `${rel} documents consolidated aitm-verified cmd="…" markers`
  );
  assert.match(body, /Verification\s+Commands/, `${rel} mentions Verification Commands`);
}

// #491 relocated the verbose AC↔Verification-Commands guidance out of the
// resident core into the JIT rationale (it is loaded on pickup, just not on
// the persistent token floor). The contract is unchanged — only its file moved.
for (const rel of ['templates/references/pickup-directive-rationale.md']) {
  const body = readFileSync(path.join(root, rel), 'utf8');
  assert.match(
    body,
    /Acceptance Criteria[\s\S]+aitm-verified cmd="…"[\s\S]+Verification Commands/i,
    `${rel} links AC evidence markers to Verification Commands`
  );
  assert.match(
    body,
    /standard or non-standard.*must appear.*Verification Commands/is,
    `${rel} requires every command — standard or non-standard — in issue-specific Verification Commands (#326 / #231)`
  );
}

console.log('evidence-marker-guidance.test.mjs: all passed');
