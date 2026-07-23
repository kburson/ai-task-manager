#!/usr/bin/env node
// @story #492
// Relocation guard for the Claude-adapter slimming done in #492 (AC2/AC3/AC4).
//
// #492 demoted four verb-scoped prose blocks off the always-on Claude adapter
// (skill/adapters/claude/SKILL.md) into the Tier-2 rule files that load JIT with
// each verb, so the resident token floor shrinks with no guidance lost:
//
//   ## Creating issues (create-path, Stub shape, refusal contracts, chip rule)
//                                       -> skill/shared/rules/create-issue.md (NEW)
//   ## Field units / ## Full-Auto footnote / ## Review Notes -> Drivers
//                                       -> skill/shared/rules/review.md
//
// This test pins the relocation structurally so a future adapter edit cannot
// silently re-absorb the prose (AC2), proves each block now lives behind its
// verb's JIT rule file and is routed there (AC3), and proves no guidance was
// lost in the move (AC4). The token-floor cap itself is guarded separately by
// adapter-token-floor.test.mjs (AC1/AC5).

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url)) + '/..';
const repoRoot = join(here, '..', '..', '..', '..');
const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8');

const ADAPTER = 'skill/adapters/claude/SKILL.md';
const CREATE_ISSUE = 'skill/shared/rules/create-issue.md';
const REVIEW = 'skill/shared/rules/review.md';
const ROUTER = 'skill/shared/router.md';

test('AC2: relocated prose is no longer resident in the adapter', () => {
  const adapter = read(ADAPTER);
  // The full section bodies must be gone from the always-on adapter. A terse
  // one-line pointer may remain, so assert on the heavy prose, not the headings.
  // NB: the terse adapter pointers deliberately retain a few contract LITERALS
  // (`priority-required-at-groom`, `aitm-verified cmd=`, `### Verification
  // Commands`, `aitm-full-auto-approved`) so the evidence-marker-guidance pins
  // stay satisfied — so assert on body prose that is genuinely gone, not those.
  for (const gone of [
    'Stub shape', // create-issue body
    'spawn_task', // chip-rule body
    '## Full-Auto footnote', // review.md block heading
    '## Review Notes → Drivers', // review.md block heading
    'engagedTime', // field-units body detail
  ]) {
    assert.ok(
      !adapter.includes(gone),
      `${ADAPTER} still carries relocated prose "${gone}" — it must live only in its Tier-2 rule file.`
    );
  }
});

test('AC2/AC4: create-issue prose is fully present in rules/create-issue.md', () => {
  const ci = read(CREATE_ISSUE);
  assert.match(ci, /aitm-skill-loaded:rules\/create-issue:\d+\.\d+\.\d+/);
  for (const kept of [
    'scripts/gh/create-issue.mjs --shape',
    'Stub shape',
    'assignee-required',
    'priority-required-at-groom',
    'aitm-verified cmd=', // AC↔evidence binding guidance
    '### Verification', // Verification Commands reference
    'spawn_task', // never-promote-a-chip rule
  ]) {
    assert.ok(ci.includes(kept), `${CREATE_ISSUE} is missing relocated guidance "${kept}".`);
  }
});

test('AC2/AC4: field-units, full-auto, and review-notes prose is present in rules/review.md', () => {
  const review = read(REVIEW);
  for (const kept of [
    '## Field units',
    'engagedTime',
    '## Full-Auto footnote',
    'aitm-full-auto-approved',
    '## Review Notes → Drivers',
    'Review delta',
  ]) {
    assert.ok(review.includes(kept), `${REVIEW} is missing relocated guidance "${kept}".`);
  }
});

test('AC3: the router routes /task new to the JIT create-issue rule file', () => {
  const router = read(ROUTER);
  assert.match(
    router,
    /\/task new\b[^\n]*\|\s*`rules\/create-issue\.md`/,
    'router.md must route `/task new` to `rules/create-issue.md` so the create prose loads JIT, not always-on.'
  );
});
