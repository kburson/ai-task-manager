// @story #310
// Unit tests for scripts/maintenance/lib/corpus-marker-transforms.mjs (#389/C3).
//
// Per-family: (a) legacy → canonical conversion; (b) idempotency — a second
// pass is a byte-for-byte no-op; (c) the deep-dive-complete JSON-payload guard
// leaves structured relics untouched; (d) out-of-scope families never match.

import { strict as assert } from 'node:assert';
import {
  migrateStageEntry,
  migrateReentryAudit,
  migrateBackfill,
  migrateLifecycleTs,
  migrateBodyVersion,
  migrateShaTsPair,
  migrateLastKnownState,
  migrateEvidence,
  migrateBlockedBy,
  migrateCommits,
  migrateFullAutoApproved,
  migrateHumanReviewer,
  migrateProofMarkers,
  stripSpuriousProseMarkers,
  migrateBody,
  migrateBodyWithFamilies,
} from '../../../maintenance/lib/corpus-marker-transforms.mjs';

// Assert: transform converts `legacy` to something containing each of `expects`,
// the converted body still contains no legacy colon residue matching `legacyRe`,
// and a second pass is identical (idempotent).
function roundtrip(fn, legacy, expects, legacyRe) {
  const once = fn(legacy);
  for (const e of expects) assert.match(once, e, `expected ${e} in:\n${once}`);
  if (legacyRe) assert.doesNotMatch(once, legacyRe, `legacy residue left:\n${once}`);
  const twice = fn(once);
  assert.equal(twice, once, `not idempotent:\n--1--\n${once}\n--2--\n${twice}`);
  return once;
}

// ---------------------------------------------------------------------------
// 19. stripSpuriousProseMarkers (#421) — remediate pre-#420 prose corruption:
//     spurious consolidated `aitm-verified` markers appended to prose lines.
// ---------------------------------------------------------------------------
{
  // 19a. a corrupted prose line — documentation sentence with a single spurious
  //      appended consolidated marker → marker removed, prose restored.
  const prose =
    'Writers emit the consolidated marker form. <!-- aitm-verified cmd="`npm test`" -->';
  const out = stripSpuriousProseMarkers(prose);
  assert.equal(out, 'Writers emit the consolidated marker form.', '19a spurious marker stripped');
  assert.equal(stripSpuriousProseMarkers(out), out, '19a idempotent');
}
{
  // 19b. multiple appended markers (non-idempotent #390 damage) → all removed.
  const prose =
    'Documents the grammar. <!-- aitm-verified cmd="`a`" --> <!-- aitm-verified cmd="`b`" -->';
  const out = stripSpuriousProseMarkers(prose);
  assert.equal(out, 'Documents the grammar.', '19b all spurious markers stripped');
  assert.equal(stripSpuriousProseMarkers(out), out, '19b idempotent');
}
{
  // 19c. placeholder-valued appended marker (e.g. #362/#367) is corruption here
  //      and must be stripped (unlike the residual scan, which hides placeholders).
  const prose = 'See the marker grammar. <!-- aitm-verified cmd="<short>" -->';
  const out = stripSpuriousProseMarkers(prose);
  assert.equal(out, 'See the marker grammar.', '19c placeholder-valued spurious marker stripped');
}
{
  // 19d. a genuine checklist DECLARATION/proof line must be byte-identical.
  const line =
    '- [x] All automated tests pass <!-- aitm-verified cmd="`npm run test:all`" --> <!-- dod:functional:tests -->';
  assert.equal(stripSpuriousProseMarkers(line), line, '19d genuine checklist line untouched');
}
{
  // 19e. an unchecked genuine checklist line is likewise untouched.
  const line =
    '- [ ] AC met <!-- aitm-verified cmd="`node x.mjs`" --> <!-- aitm-ac-evidence:ac1 -->';
  assert.equal(stripSpuriousProseMarkers(line), line, '19e unchecked checklist line untouched');
}
{
  // 19f. a marker quoted INSIDE an inline-code span on prose is documentation,
  //      not corruption — preserved verbatim.
  const prose = 'The marker looks like `<!-- aitm-verified cmd="x" -->` in the body.';
  assert.equal(stripSpuriousProseMarkers(prose), prose, '19f inline-code mention preserved');
}
{
  // 19g. a marker inside a fenced code block is documentation — preserved.
  const fenced = ['Example:', '```', '<!-- aitm-verified cmd="x" -->', '```', 'End.'].join('\n');
  assert.equal(stripSpuriousProseMarkers(fenced), fenced, '19g fenced mention preserved');
  assert.equal(stripSpuriousProseMarkers(fenced), fenced, '19g idempotent');
}
{
  // 19h. a prose line that is ONLY a spurious appended marker collapses to
  //      nothing and the line is dropped; pre-existing blank lines are kept.
  const body = ['Heading', '', '<!-- aitm-verified cmd="`x`" -->', 'Tail'].join('\n');
  const out = stripSpuriousProseMarkers(body);
  assert.equal(out, ['Heading', '', 'Tail'].join('\n'), '19h marker-only line dropped, blank kept');
  assert.equal(stripSpuriousProseMarkers(out), out, '19h idempotent');
}
{
  // 19i. legacy colon-form documentation TEXT (`aitm-verified-by`) is never
  //      matched — the `\s` boundary after `aitm-verified` protects it.
  const prose = 'The legacy marker was named `aitm-verified-by:` before #382.';
  assert.equal(stripSpuriousProseMarkers(prose), prose, '19i legacy-name prose untouched');
}
{
  // 19j. mixed body: corrupted prose cleaned, genuine checklist preserved, in a
  //      single pass — and the whole pass is idempotent.
  const body = [
    '## Scope',
    'Writers emit consolidated markers. <!-- aitm-verified cmd="`a`" -->',
    '',
    '- [x] tests pass <!-- aitm-verified cmd="`npm test`" --> <!-- dod:functional:tests -->',
  ].join('\n');
  const out = stripSpuriousProseMarkers(body);
  assert.match(out, /Writers emit consolidated markers\.$/m, '19j prose restored');
  assert.match(out, /- \[x\] tests pass <!-- aitm-verified/, '19j checklist preserved');
  assert.equal(
    (out.match(/<!--\s*aitm-verified\s/g) || []).length,
    1,
    '19j exactly the genuine marker remains'
  );
  assert.equal(stripSpuriousProseMarkers(out), out, '19j idempotent');
}

console.log('corpus-marker-transforms.test.mjs: all passed');
