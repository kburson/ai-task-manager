#!/usr/bin/env node
// cspell:ignore rescan
// Unit tests for the residual-detector documentation redaction (#392/C6).
//
// The --rescan residual detectors must not flag legacy marker grammar that
// appears purely as DOCUMENTATION — inside fenced code blocks, inline-code
// spans, or angle-bracket placeholders. The regression half asserts a real
// bare marker (outside any code context, with a concrete value) is STILL
// detected, so true-positive detection is not weakened.

import { strict as assert } from 'node:assert';
import { redactDocContexts, residualFamilies } from '../../maintenance/migrate-markers-corpus.mjs';

// 1. Fenced code block — a legacy marker inside ``` is documentation.
{
  const body = ['Here is the format:', '```', '<!-- aitm-body-version: 7 -->', '```'].join('\n');
  assert.equal(redactDocContexts(body).includes('aitm-body-version'), false, 'fence redacted');
  assert.deepEqual(residualFamilies(body), [], 'fenced marker not flagged');
}

// 2. Inline-code span — a legacy marker in `backticks` is documentation.
{
  const body = 'The detector matches `<!-- aitm-dod-evidence:KEY cmd="x" -->` literally.';
  assert.equal(redactDocContexts(body).includes('aitm-dod-evidence'), false, 'inline redacted');
  assert.deepEqual(residualFamilies(body), [], 'inline-code marker not flagged');
}

// 3. Angle-bracket placeholder — a marker whose value is `<iso-ts>`/`<ts>`/`<N>`
//    is a template, never a real marker (#90 line 20 bare comment).
{
  const body = '<!-- aitm-deep-dive-complete: <iso-ts> -->';
  assert.equal(redactDocContexts(body).includes('aitm-deep-dive-complete'), false, 'placeholder');
  assert.deepEqual(residualFamilies(body), [], 'placeholder marker not flagged');
}
{
  const body = '<!-- aitm-body-version: <N> -->';
  assert.deepEqual(residualFamilies(body), [], 'numeric placeholder not flagged');
}

// 4. REGRESSION — a real bare legacy marker (concrete value, no code context)
//    is STILL flagged. Redaction must not hide true positives.
{
  const body = '## Issue\n<!-- aitm-body-version: 7 -->\nbody text';
  assert.equal(redactDocContexts(body).includes('aitm-body-version: 7'), true, 'real marker kept');
  assert.deepEqual(residualFamilies(body), ['body-version'], 'real marker flagged');
}
{
  // A real lifecycle marker with a concrete ISO timestamp survives redaction.
  const body = '<!-- aitm-deep-dive-complete: 2026-06-01T00:00:00.000Z -->';
  assert.deepEqual(residualFamilies(body), ['lifecycle'], 'concrete lifecycle marker flagged');
}

// 5. The deep-dive-complete JSON-payload relic is still NOT residual after
//    redaction (its angle-bracket-free `{` payload is intentionally untouched).
//    The machine-emitted relic packs the JSON immediately after the colon.
{
  const body = '<!-- aitm-deep-dive-complete:{"verdict":"ok"} -->';
  assert.deepEqual(residualFamilies(body), [], 'JSON relic not flagged');
}

// 6. Mixed body — documented example in a fence PLUS a real marker outside it.
//    Only the real one is flagged.
{
  const body = [
    'Example usage:',
    '```',
    '<!-- aitm-commits: abc,def -->',
    '```',
    '<!-- aitm-body-version: 3 -->',
  ].join('\n');
  assert.deepEqual(residualFamilies(body), ['body-version'], 'only the real marker flagged');
}

console.log('migrate-markers-corpus-redaction.test.mjs: all passed');
