#!/usr/bin/env node
// @story #190
// Asserts that the pickup-directive template references session-boot.md and
// contains a Post-Compact/Clear Recovery section in the "Required steps before
// writing any code" block. Source-of-truth is templates/pickup-directive.md.

import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

const TEMPLATE = path.join(repoRoot, 'templates', 'pickup-directive.md');

test('pickup-directive template exists', () => {
  assert.ok(existsSync(TEMPLATE), `missing template: ${TEMPLATE}`);
});

test('pickup-directive references session-boot.md', () => {
  const body = readFileSync(TEMPLATE, 'utf8');
  assert.match(
    body,
    /session-boot\.md/,
    'pickup-directive.md must reference session-boot.md (the boot index)'
  );
});

test('pickup-directive contains a Post-Compact/Clear Recovery section', () => {
  const body = readFileSync(TEMPLATE, 'utf8');
  assert.match(
    body,
    /Post-Compact\/Clear Recovery/,
    'pickup-directive.md must have a "Post-Compact/Clear Recovery" section'
  );
});

test('pickup-directive recovery section appears inside "Required steps before writing any code"', () => {
  const body = readFileSync(TEMPLATE, 'utf8');
  const requiredStepsIdx = body.indexOf('## Required steps before writing any code');
  assert.notEqual(requiredStepsIdx, -1, 'Required steps header missing');
  const tail = body.slice(requiredStepsIdx);
  assert.match(
    tail,
    /Post-Compact\/Clear Recovery/,
    'Post-Compact/Clear Recovery must appear inside the "Required steps before writing any code" section'
  );
});

test('pickup-directive recovery instruction mentions the aitm-boot-recovered sentinel', () => {
  const body = readFileSync(TEMPLATE, 'utf8');
  assert.match(
    body,
    /aitm-boot-recovered/,
    'recovery section must mention the aitm-boot-recovered sentinel'
  );
});
