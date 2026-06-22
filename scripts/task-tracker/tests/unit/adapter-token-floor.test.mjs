#!/usr/bin/env node
// @story #492
// Token-floor regression guard for the Claude adapter SKILL (#492).
//
// skill/adapters/claude/SKILL.md is re-paid verbatim onto the context floor
// whenever the /task skill is invoked (Tier-1 adapter). #492 relocated its
// verb-scoped prose (Creating-issues + refusal contracts → rules/create-issue.md;
// Field-units, Full-Auto footnote, Review-Notes→Drivers → rules/review.md) into
// the JIT Tier-2 rule files so the always-on adapter stays small. AC1 caps the
// adapter at ≤ 1,400 real tokens (gpt-tokenizer / cl100k_base, the #485
// methodology). gpt-tokenizer is not a committed dependency, so CI guards the
// budget with the repo's chars/4 proxy — at lock time the proxy (1,343) and the
// real-token count (1,315) agreed within ~30 tokens. If this test fails, the
// adapter has regained mass: relocate prose into a skill/shared/rules/*.md file
// (and route the verb to it in skill/shared/router.md) rather than raising the cap.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');

const ADAPTER = 'skill/adapters/claude/SKILL.md';
const TOKEN_BUDGET = 1400; // AC1 ceiling, real tokens (cl100k_base)

test('claude adapter stays within the AC1 token budget', () => {
  const adapter = readFileSync(join(repoRoot, ADAPTER), 'utf8');
  const proxyTokens = Math.round(adapter.length / 4);
  assert.ok(
    proxyTokens <= TOKEN_BUDGET,
    `${ADAPTER} proxy tokens ${proxyTokens} exceed the AC1 budget of ${TOKEN_BUDGET}; ` +
      'relocate prose into a skill/shared/rules/*.md file (routed from skill/shared/router.md) ' +
      'instead of growing the resident adapter.'
  );
});
