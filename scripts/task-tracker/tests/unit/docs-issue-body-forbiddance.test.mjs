#!/usr/bin/env node
// @story #171
// #171 AC3: the prohibition on hand-rolled issue bodies must be documented
// in both CLAUDE.md and the pickup-directive (source template + deployed copy)
// so agents see it on every pickup. The hand-rolled `--body`/`--body-file`
// path is what shipped #169/#170 without a Definition of Done.

import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

test('CLAUDE.md documents the route-through-scripts rule', () => {
  const body = readFileSync('CLAUDE.md', 'utf8');
  assert.match(
    body,
    /Route issue bodies through scripts/,
    'CLAUDE.md must carry the "Route issue bodies through scripts" section'
  );
  assert.match(
    body,
    /mutateIssueBody/,
    'CLAUDE.md must name mutateIssueBody as the sanctioned edit path'
  );
  assert.match(
    body,
    /never write them with `gh issue edit --body`/i,
    'CLAUDE.md must explicitly forbid hand-rolled gh issue edit --body writes'
  );
});

// The runtime copy is deployed on install; the template is the source of truth.
// Only assert on copies that exist in this checkout.
const PICKUP_FILES = [
  'templates/pickup-directive.md',
  '.ai-task-manager/templates/pickup-directive.md',
].filter((f) => existsSync(f));

for (const file of PICKUP_FILES) {
  test(`${file} forbids hand-rolled issue bodies`, () => {
    const body = readFileSync(file, 'utf8');
    assert.match(
      body,
      /Never hand-roll an issue body/i,
      `${file} must carry the "Never hand-roll an issue body" rule`
    );
    assert.match(
      body,
      /gh issue create.*--body/s,
      `${file} must name the forbidden hand-rolled create path`
    );
    assert.match(
      body,
      /mutateIssueBody/,
      `${file} must point at mutateIssueBody as the sanctioned edit path`
    );
  });
}

test('at least one pickup-directive copy was asserted', () => {
  assert.ok(
    PICKUP_FILES.length >= 1,
    'expected templates/pickup-directive.md (and/or the deployed copy) to exist'
  );
});
