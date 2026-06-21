// @story #396
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { parseProofMarker, hasExecutionProof } from '../../lib/proof-marker.mjs';
import { parseEvidenceChecklist } from '../../lib/evidence-markers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reviewVerbPath = path.resolve(__dirname, '..', '..', 'verbs', 'review.mjs');
const reviewSource = readFileSync(reviewVerbPath, 'utf8');

// ---------------------------------------------------------------------------
// #396: review.mjs's private AC checkbox parser must recognize the consolidated
// `aitm-verified cmd="..."` verifier declaration, not only the legacy
// `aitm-verified-by:` marker.
//
// #481: the verifier declaration and its run-props (`exit`/`sha`/`ts`) now live
// in ONE `aitm-verified` marker (single-expandable form). `cmd` is the
// persistent declaration component — it must be read REGARDLESS of run-props.
// The pre-#481 `!hasExecutionProof(label)` guard hid the declaration once
// `ac-stamp`/`dod-stamp` stamped a passing run onto the same marker, so review
// false-bounced the very markers `ac-stamp` produces ("missing automated
// evidence"). The guard is removed; a marker whose run-props show `exit="0"` is
// itself the passing sandbox evidence (`proofPassed`).
// ---------------------------------------------------------------------------

// Source-level pin: the consolidated-declaration extraction is NO LONGER gated
// by hasExecutionProof, and the exit="0" run-props seed passing evidence.
{
  assert.match(
    reviewSource,
    /import\s+\{\s*parseProofMarker,\s*hasExecutionProof\s*\}\s+from\s+['"]\.\.\/lib\/proof-marker\.mjs['"]/,
    'review.mjs imports parseProofMarker + hasExecutionProof from lib/proof-marker.mjs'
  );
  assert.doesNotMatch(
    reviewSource,
    /!cmdMatch && !hasExecutionProof\(label\)/,
    'review.mjs no longer gates cmd extraction on hasExecutionProof (#481)'
  );
  assert.match(
    reviewSource,
    /parseProofMarker\(label\)/,
    'review.mjs reads the consolidated declaration via parseProofMarker'
  );
  assert.match(
    reviewSource,
    /String\(props\.exit\) === '0'/,
    'review.mjs derives proofPassed from the marker exit="0" run-prop (#481)'
  );
  console.log('PASS: review.mjs single-marker extraction + proofPassed present (source pin)');
}

// Behavioral replication of review.mjs's exact AC command-extraction. Kept
// byte-faithful to the verb so this test fails if the verb's extraction drifts.
function extractAcCommands(label) {
  const cmdMatch = label.match(/^`([^`]+)`/); // canRunCommand=false for AC prose
  let evidenceCommands = [];
  if (!cmdMatch) {
    const props = parseProofMarker(label);
    if (props && typeof props.cmd === 'string') {
      evidenceCommands = [...props.cmd.matchAll(/`([^`]+)`/g)].map((cmd) => cmd[1]);
    }
  }
  return evidenceCommands;
}
// Replication of the verb's proofPassed derivation (single-marker run-props).
function proofPassedFor(label) {
  const cmdMatch = label.match(/^`([^`]+)`/);
  if (cmdMatch) return false;
  const props = parseProofMarker(label);
  if (props && hasExecutionProof(label)) return String(props.exit) === '0';
  return false;
}

// AC #1 — a consolidated-only declaration yields a non-empty command list (no
// false "missing automated evidence" regression downstream).
{
  const label = 'Help text renders <!-- aitm-verified cmd="`npm run test:all`" -->';
  assert.deepEqual(
    extractAcCommands(label),
    ['npm run test:all'],
    'consolidated-only AC declaration parses its command'
  );
  console.log('PASS: consolidated-only AC declaration parses a non-empty command list');
}

// AC #2 — after #468, a legacy aitm-verified-by: declaration is no longer recognized.
{
  const label = 'Help text renders <!-- aitm-verified-by: `npm test` -->';
  assert.deepEqual(extractAcCommands(label), [], 'legacy AC declaration ignored after #468');
  console.log('PASS: legacy AC declaration ignored after #468');
}

// AC #3 (#481) — a single-marker line carrying cmd + run-props (the form
// `ac-stamp` stamps) now yields the declared command. `cmd` is the persistent
// declaration component, read regardless of run-props.
{
  const label =
    'Flag intercepted ' +
    '<!-- aitm-verified cmd="`npm test`" exit="0" sha="78912dd" ts="2026-06-13T00:00:00Z" -->';
  assert.equal(hasExecutionProof(label), true, 'cmd + run-props line carries execution proof');
  assert.deepEqual(
    extractAcCommands(label),
    ['npm test'],
    'single-marker (cmd + run-props) still yields its declared command (#481)'
  );
  assert.equal(
    proofPassedFor(label),
    true,
    'exit="0" run-props mark the single marker as passing sandbox evidence (#481)'
  );
  console.log('PASS: single-marker cmd + exit="0" run-props read as passing evidence (#481)');
}

// AC #3b (#481) — a single-marker line with a NON-zero exit is not passing.
{
  const label =
    'Broken behavior ' +
    '<!-- aitm-verified cmd="`npm test`" exit="1" sha="78912dd" ts="2026-06-13T00:00:00Z" -->';
  assert.deepEqual(extractAcCommands(label), ['npm test'], 'declared command still read');
  assert.equal(proofPassedFor(label), false, 'exit="1" run-props are not passing evidence (#481)');
  console.log('PASS: single-marker with exit="1" is not treated as passing (#481)');
}

// AC #4 — review.mjs's extraction and the shared evidence-markers reader agree
// on the command set for the same AC line (no parser drift). Both read cmd
// regardless of run-props after #481.
{
  const body = [
    '## Acceptance Criteria',
    '',
    '- [x] Help text renders <!-- aitm-verified cmd="`npm run test:all`" -->',
    '- [x] Flag is global <!-- aitm-verified cmd="`npm test`" exit="0" sha="abc1234" ts="2026-06-13T00:00:00Z" -->',
  ].join('\n');
  const { acceptanceCriteria } = parseEvidenceChecklist(body);
  assert.equal(acceptanceCriteria.length, 2, 'both ACs parsed by shared reader');
  const rawLines = body
    .split('\n')
    .filter((l) => /^- \[[ x]\] /.test(l))
    .map((l) => l.replace(/^- \[[ x]\] /, ''));
  rawLines.forEach((raw, i) => {
    const mine = extractAcCommands(raw);
    const shared = parseEvidenceChecklist(`## Acceptance Criteria\n\n- [ ] ${raw}`)
      .acceptanceCriteria[0].evidenceCommands;
    assert.deepEqual(mine, shared, `parser parity on AC line ${i}: ${raw}`);
  });
  console.log('PASS: review.mjs extraction matches shared evidence-markers reader (no drift)');
}

// AC #5 — regression scenario: a consolidated-only AC that is checked must NOT
// be demoted. With a non-empty command list the regression branch is not taken.
{
  const label = 'Help text renders <!-- aitm-verified cmd="`npm run test:all`" -->';
  const evidenceCommands = extractAcCommands(label);
  const wouldRegress = evidenceCommands.length === 0;
  assert.equal(wouldRegress, false, 'consolidated-only checked AC is not false-regressed');
  console.log('PASS: consolidated-only AC survives verbReview without false regression');
}

console.log('\nAll review-verb consolidated-declaration tests passed.');
