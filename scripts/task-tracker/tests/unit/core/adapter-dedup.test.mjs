#!/usr/bin/env node
// @story #557
// Proves shared policy is de-duplicated: each cross-cutting rule lives ONCE in a
// Tier-2 rule file (or templates/pickup-directive.md) and the platform adapter
// SKILL.md files only point to it — they no longer restate its prose.
//
// The assertions are content-preserving by construction. We never assert that
// content disappeared; we assert (a) the canonical prose still lives at its
// authoritative home, and (b) the verbatim duplicate no longer appears in any
// adapter. Delete canonical content and test (b)'s home check fails; leave a
// stale duplicate in an adapter and test (c) fails. The Review gate catches any
// accidental deletion the home check would miss.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)) + '/..', '..', '..', '..', '..');
const read = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');

const ADAPTERS = ['skill/adapters/claude/SKILL.md', 'skill/adapters/codex/SKILL.md'];

// Each shared rule file declares a stable rule-id anchor so a reviewer can name
// the single authoritative file for the rule (AC3) and AC2's
// `grep -rq issue-create skill/shared/rules` has a token to find.
const RULE_IDS = [
  { id: 'issue-create', file: 'skill/shared/rules/create-issue.md' },
  { id: 'review', file: 'skill/shared/rules/review.md' },
  { id: 'state-movement', file: 'skill/shared/rules/state-walk.md' },
  { id: 'project-preferences', file: 'skill/shared/rules/preferences.md' },
];

// Cross-cutting rules: `home` is the single authoritative file; `homeAnchor`
// must appear there (canonical prose preserved); `duped` is the verbatim phrase
// that must NOT appear in any adapter SKILL.md (de-duplicated).
const SHARED_RULES = [
  {
    name: 'issue-create',
    home: 'skill/shared/rules/create-issue.md',
    homeAnchor: 'is the only sanctioned path',
    duped: 'is the only sanctioned path',
  },
  {
    name: 'field-units',
    home: 'skill/shared/rules/review.md',
    homeAnchor: 'compare them raw',
    duped: 'compare them raw',
  },
  {
    name: 'full-auto-footnote',
    home: 'skill/shared/rules/review.md',
    homeAnchor: 'aitm-full-auto-footnote:start',
    duped: 'aitm-full-auto-footnote:start',
  },
  {
    name: 'review-notes',
    home: 'skill/shared/rules/review.md',
    homeAnchor: 'aitm-review-notes-source: auto',
    duped: 'aitm-review-notes-source: auto',
  },
  {
    // The full Rank prose lives in the JIT rationale; the adapters only NAME the
    // `child-cannot-lead-epic` invariant (a reference #162 requires), so `duped`
    // is the canonical prose sentence, NOT the invariant name.
    name: 'rank',
    home: 'templates/references/pickup-directive-rationale.md',
    homeAnchor: 'Refine is a single-item-in-flight column',
    duped: 'Refine is a single-item-in-flight column',
  },
  {
    name: 'checkpoint',
    home: 'templates/pickup-directive.md',
    homeAnchor: 'Checkpoint Pause',
    duped: 're-read the most recent user messages',
  },
  {
    name: 'project-preferences',
    home: 'skill/shared/rules/preferences.md',
    homeAnchor: 'getPreferences()',
    duped: 'Honor each key by name',
  },
];

// --- AC2 + AC3: each shared rule declares a stable rule-id anchor. ----------
test('each shared rule file declares its aitm-rule-id anchor', () => {
  for (const { id, file } of RULE_IDS) {
    const body = read(file);
    assert.ok(
      body.includes(`<!-- aitm-rule-id: ${id} -->`),
      `${file} must declare the single authoritative anchor <!-- aitm-rule-id: ${id} -->`
    );
  }
});

// --- AC1 + AC4: canonical prose lives at its home and nowhere in adapters. ---
test('canonical prose lives once at its authoritative home', () => {
  for (const rule of SHARED_RULES) {
    const home = read(rule.home);
    assert.ok(
      home.includes(rule.homeAnchor),
      `${rule.name}: authoritative prose must live in ${rule.home} (missing "${rule.homeAnchor}")`
    );
  }
});

test('adapters do not restate shared-rule prose (point to it instead)', () => {
  for (const adapterPath of ADAPTERS) {
    const adapter = read(adapterPath);
    for (const rule of SHARED_RULES) {
      assert.ok(
        !adapter.includes(rule.duped),
        `${adapterPath} restates the ${rule.name} rule verbatim ("${rule.duped}") — replace with a pointer to ${rule.home}`
      );
    }
  }
});

// --- AC1: adapters still carry their platform-specific bootstrap. -----------
test('adapters retain platform bootstrap and a pointer to the shared router', () => {
  for (const adapterPath of ADAPTERS) {
    const adapter = read(adapterPath);
    assert.ok(
      adapter.includes('skill/shared/router.md'),
      `${adapterPath} must point at the shared router`
    );
    assert.ok(
      /aitm-skill-version|Load-once|load-once|sentinel/i.test(adapter),
      `${adapterPath} must retain its load-once bootstrap`
    );
  }
});
