#!/usr/bin/env node
// @story #190
// Asserts that .ai-task-manager/templates/session-state-template.md (and its template
// source) exists and contains the 9 required field headings in order.

import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

const TEMPLATE = path.join(repoRoot, 'templates', 'session-state-template.md');

const REQUIRED_FIELDS_IN_ORDER = [
  'Goal',
  'Non-Negotiable Rules',
  'Active Files',
  'Decisions',
  'Plan',
  'Completed',
  'Remaining',
  'Verification',
  'Risks',
];

test('session-state-template.md template exists', () => {
  assert.ok(existsSync(TEMPLATE), `missing template: ${TEMPLATE}`);
});

test('session-state-template.md has all 9 required field headings in order', () => {
  const body = readFileSync(TEMPLATE, 'utf8');
  const headingRegex = /^##\s+(.+?)\s*$/gm;
  const headings = [];
  let m;
  while ((m = headingRegex.exec(body)) !== null) headings.push(m[1].trim());

  let searchFrom = 0;
  for (const field of REQUIRED_FIELDS_IN_ORDER) {
    const idx = headings.indexOf(field, searchFrom);
    assert.notEqual(
      idx,
      -1,
      `field "${field}" missing or out of order in session-state-template.md (got headings: ${JSON.stringify(headings)})`
    );
    searchFrom = idx + 1;
  }
});
