#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dir, '../../..');
const body = readFileSync(path.join(root, 'templates', 'definition-of-done.md'), 'utf8');

for (const line of [
  '- [ ] Acceptance criteria met (including test additions from deep dive)',
  '- [ ] Tests pass; new coverage committed',
  '- [ ] Pre-commit hooks pass',
  '- [ ] Issue body checkboxes ticked',
]) {
  assert.ok(body.includes(line), `template includes ${line}`);
}

assert.ok(!body.includes('Issue moved to Done'), 'template does not include close-action Done checkbox');
assert.ok(!body.includes('/task close` run'), 'template does not include close-action task close checkbox');
assert.ok(!body.includes('close parent if all siblings Done'), 'template does not include automatic parent close checkbox');

console.log('templates.test.mjs: all passed');
