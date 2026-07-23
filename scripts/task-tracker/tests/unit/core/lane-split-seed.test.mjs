#!/usr/bin/env node
// @story #934
// AC1 — the DoD-template seed, the VC back-fill default, and
// heal-functional-dod's canonical `tests` line all emit the two-lane split
// (`npm test` + `npm run test:slow`), never the single `npm run test:all`.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { healFunctionalSection } from '../../../heal-functional-dod.mjs';
import { DEFAULT_VC_COMMANDS } from '../../../backfill-vc-sections.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const ROOT = path.resolve(HERE, '../../../..');

test('DoD template seeds the two-lane tests command', () => {
  const tpl = readFileSync(path.join(ROOT, 'templates/definition-of-done.md'), 'utf8');
  const testsLine = tpl.split('\n').find((l) => /dod:functional:tests/.test(l));
  assert.ok(testsLine, 'template has a Functional-DoD tests line');
  assert.match(testsLine, /cmd="`npm test` `npm run test:slow`"/);
  assert.doesNotMatch(testsLine, /`npm run test:all`/);
});

test('VC back-fill default seeds both lanes, not test:all', () => {
  assert.ok(DEFAULT_VC_COMMANDS.includes('npm test'));
  assert.ok(DEFAULT_VC_COMMANDS.includes('npm run test:slow'));
  assert.ok(!DEFAULT_VC_COMMANDS.includes('npm run test:all'));
});

test('heal-functional-dod rebuilds the tests line to the two-lane form', () => {
  // A pre-#303 (unkeyed) Functional section: heal rebuilds it to canonical.
  const body = [
    '## Definition of Done',
    '',
    '#### Functional (verified at Test)',
    '',
    '- [ ] All automated tests pass',
    '- [ ] Lint and format checks pass',
    '- [ ] All changes committed; commit messages follow project convention',
    '- [ ] Acceptance criteria met',
    '- [ ] Issue body checkboxes ticked',
    '',
    '#### Lifecycle (auto-ticked at Review/Close)',
    '',
    '- [ ] Story closed and moved to Done',
    '',
  ].join('\n');
  const { body: healed, changed } = healFunctionalSection(body);
  assert.ok(changed, 'unkeyed section is healed');
  const testsLine = healed.split('\n').find((l) => /dod:functional:tests/.test(l));
  assert.ok(testsLine, 'healed section has a keyed tests line');
  assert.match(testsLine, /cmd="`npm test` `npm run test:slow`"/);
  assert.doesNotMatch(testsLine, /`npm run test:all`/);
});
