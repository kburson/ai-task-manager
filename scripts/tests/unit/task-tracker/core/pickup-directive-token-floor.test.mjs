#!/usr/bin/env node
// @story #491
// Token-floor regression guard for the tiered pickup-directive (#491).
//
// The resident pickup-directive.md is re-paid verbatim onto the context floor
// after every `/compact` (boot-index Tier-1). #491 tiered its occasionally-
// consulted prose (Checkpoint-Pause detail, Rank rules, worked examples) into
// the JIT rationale reference so the always-on core stays small. AC1 caps the
// core at ≤ 1,400 real tokens (gpt-tokenizer / cl100k_base, the #485
// methodology). gpt-tokenizer is not a committed dependency, so CI guards the
// budget with the repo's chars/4 proxy — at lock time the proxy (1,394) and the
// real-token count (1,399) agreed within 5 tokens. If this test fails, the
// directive has regained mass: relocate prose into
// templates/references/pickup-directive-rationale.md rather than raising the cap.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url)) + '/..';
const repoRoot = join(here, '..', '..', '..', '..');

const CORE = 'templates/pickup-directive.md';
const TOKEN_BUDGET = 1400; // AC1 ceiling, real tokens (cl100k_base)

test('pickup-directive core stays within the AC1 token budget', () => {
  const core = readFileSync(join(repoRoot, CORE), 'utf8');
  const proxyTokens = Math.round(core.length / 4);
  assert.ok(
    proxyTokens <= TOKEN_BUDGET,
    `${CORE} proxy tokens ${proxyTokens} exceed the AC1 budget of ${TOKEN_BUDGET}; ` +
      'relocate prose into templates/references/pickup-directive-rationale.md instead of growing the resident core.'
  );
});
