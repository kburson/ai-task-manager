#!/usr/bin/env node
// @story #458
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const root = path.resolve(__dir, '..', '../../..');
const body = readFileSync(path.join(root, 'docs', 'guides', 'codex-support-matrix.md'), 'utf8');
const installBody = readFileSync(
  path.join(root, 'docs', 'introduction', 'install-and-setup.md'),
  'utf8'
);

assert.match(body, /Backlog → Assigned → Refine → Plan → Develop → Test → Review → Done/);
assert.match(body, /State Transition Verb Map \(8-state model\)/);
assert.match(body, /\/task plan #N/);
assert.match(body, /\/task test #N/);
assert.match(body, /Hook Capability/);
assert.match(body, /`hookCapability: true`/);
assert.match(body, /`UserPromptSubmit` adds timestamp context/);
assert.match(body, /Project-local Codex hooks require the project to be trusted/);
assert.match(body, /Operational-lessons memory index/);
assert.match(body, /SessionStart.*PostCompact.*MEMORY\.md/);
assert.match(body, /neither provider injects the full corpus automatically/);
assert.match(body, /Remaining Differences/);

assert.match(installBody, /Run `install` and `init` once in a maintainer environment/);
assert.match(installBody, /Ephemeral cloud environments should clone the repository/);
assert.match(installBody, /\.codex\/hooks\.json/);
assert.match(installBody, /\.agents\/skills\/task\/SKILL\.md/);

console.log('codex-support-matrix.test.mjs: all assertions passed');
