#!/usr/bin/env node
// @story #458
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dir, '..', '../../..');
const body = readFileSync(path.join(root, 'docs', 'guides', 'codex-support-matrix.md'), 'utf8');

assert.match(body, /Backlog → On Deck → Refine → Plan → Develop → Test → Review → Done/);
assert.match(body, /State Transition Verb Map \(8-state model\)/);
assert.match(body, /\/task plan #N/);
assert.match(body, /\/task test #N/);
assert.match(body, /Manual Codex steps/);
assert.match(body, /manual `\/task start` \/ `\/task pause` \/ `\/task resume` discipline/);
assert.match(body, /Prompt-only \(cannot block at tool level\)/);

console.log('codex-support-matrix.test.mjs: all assertions passed');
