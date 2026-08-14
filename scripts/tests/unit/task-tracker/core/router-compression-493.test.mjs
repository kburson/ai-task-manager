#!/usr/bin/env node
// @story #493
// Compression + de-duplication guard for the Tier-1 router (#493).
//
// skill/shared/router.md is always-on: it loads on first `/task` invocation and
// is re-paid onto the context floor after every `/compact`. #493 compressed two
// duplicative sections into terse pointers naming their authoritative home:
//
//   ## gh issue command policy (bash-guard)  — an 11-row space-padded table that
//        merely restated the policy enforced by the bash-guard hook
//        (scripts/task-tracker/bash-guard.mjs -> lib/gh-edit-guard.mjs) and hard
//        cross-cutting rules 3-4  ->  one terse pointer paragraph.
//   ## CLI invocation  — the post-bind `gh issue view` fetch / reopen /
//        Pickup-Directive prose owned by rules/bind.md  ->  a one-line pointer.
//
// NB the real-token saving is modest (~62, cl100k_base: 1941->1879): the removed
// table was column-space-padding-heavy and cl100k collapses space runs to ~1
// token, so the chars/4 proxy (~309) overstated it. The win is de-duplication /
// single-source-of-truth, recorded honestly on the issue (AC4). This test pins
// the compression structurally so the table cannot silently reappear, proves no
// policy lost a discoverable home (AC3), and proves the router's reason-to-exist
// — the hard-rules block and the verb -> rule-file routing table — survived
// unchanged (AC2).

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url)) + '/..';
const repoRoot = join(here, '..', '..', '..', '..');
const ROUTER = 'skill/shared/router.md';
const router = readFileSync(join(repoRoot, ROUTER), 'utf8');

test('AC1: the padded gh-policy table and verbose bind-fetch prose are gone', () => {
  // The old 11-row policy table header and a representative padded row.
  assert.ok(
    !router.includes('| Command '),
    `${ROUTER} still carries the gh-policy table header — it must compress to a terse pointer.`
  );
  assert.ok(
    !/\|\s*`gh issue view`, `gh issue list`\s*\|/.test(router),
    `${ROUTER} still carries gh-policy table rows — they must compress to a terse pointer.`
  );
  // The verbose post-bind fetch command line belongs in rules/bind.md now.
  assert.ok(
    !router.includes('gh issue view <N> --json title,body,state,projectItems,parent'),
    `${ROUTER} still inlines the post-bind fetch command — it must point to rules/bind.md.`
  );
});

test('AC1: terse pointers name their authoritative home', () => {
  assert.match(
    router,
    /authoritative gh-issue policy/,
    `${ROUTER} must declare the bash-guard hook as the authoritative gh-issue policy.`
  );
  assert.ok(
    router.includes('scripts/task-tracker/bash-guard.mjs'),
    `${ROUTER} gh-policy pointer must name bash-guard.mjs.`
  );
  assert.match(
    router,
    /live in `rules\/bind\.md`/,
    `${ROUTER} CLI-invocation pointer must route the post-bind fetch detail to rules/bind.md.`
  );
});

test('AC3: no policy dropped — every gh-command policy still has a discoverable home', () => {
  for (const home of [
    'scripts/gh/create-issue.mjs --shape', // gh issue create -> sanctioned path
    '/task close', // gh issue close -> verb
    'mutateIssueBody', // --body/--body-file -> body-write route
    'rules/create-issue.md', // body-write home
    'rules/state-walk.md', // body-write home
    'gh api graphql', // exceptional-but-allowed still named
    'reopen', // session-recovery still named
  ]) {
    assert.ok(
      router.includes(home),
      `${ROUTER} compressed pointer dropped a discoverable home: "${home}".`
    );
  }
});

test('AC2: the hard cross-cutting rules block is preserved unchanged', () => {
  for (const anchor of [
    '## Hard cross-cutting rules',
    'Timer must be active before any work',
    'Never call `move-state.mjs <N> done` directly',
    'Track before you start', // rule 12
  ]) {
    assert.ok(router.includes(anchor), `${ROUTER} lost hard-rules anchor: "${anchor}".`);
  }
});

test('AC2: the verb -> rule-file routing table is preserved unchanged', () => {
  for (const anchor of [
    '## Verb → rule-file routing',
    '`rules/bind.md`',
    '`rules/review.md`',
    '`rules/create-issue.md`',
    '`rules/state-walk.md`',
  ]) {
    assert.ok(router.includes(anchor), `${ROUTER} lost verb-routing anchor: "${anchor}".`);
  }
});

test('AC4: router stays compressed (chars/4 proxy regression guard)', () => {
  // After #493 the router proxy is ~2061. Guard against silent re-growth toward
  // the pre-#493 ~2370. This proxy is a coarse CI guard only — the honest
  // real-token figure (~1879, cl100k_base) lives in the issue's AC4 evidence.
  const proxyTokens = Math.round(router.length / 4);
  assert.ok(
    proxyTokens <= 2150,
    `${ROUTER} proxy tokens ${proxyTokens} exceed the post-#493 ceiling of 2150 — ` +
      'compress duplicative reference prose into a pointer rather than re-growing the router.'
  );
});
