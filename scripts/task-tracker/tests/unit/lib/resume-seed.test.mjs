#!/usr/bin/env node
// @story #251
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { verbResume } from '../../../verbs/resume.mjs';

// Task 5A removed the second, legacy resume implementation. Runtime projection
// behavior is exercised through the production coordinator integration suite;
// this architecture guard keeps the original cache-seeding regression attached
// to the one shipped bind path.
const source = readFileSync(
  new URL('../../../lib/work-lease/bind-orchestration.mjs', import.meta.url),
  'utf8'
);
assert.equal(typeof verbResume, 'function');
assert.match(
  source,
  /plan\.projectionInputs\.session\.kanbanState = eligibility\.kanbanState \?\? null/
);
assert.match(source, /persisted\?\.kanbanState !== input\.kanbanState/);
assert.doesNotMatch(source, /verbResumeLegacy|seedSessionKanbanFromBody/);
console.log('resume-seed.test.mjs: all passed');
