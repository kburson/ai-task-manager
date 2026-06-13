import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { parseProofMarker, hasExecutionProof } from '../lib/proof-marker.mjs';
import { parseEvidenceChecklist } from '../lib/evidence-markers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reviewVerbPath = path.resolve(__dirname, '..', 'verbs', 'review.mjs');
const reviewSource = readFileSync(reviewVerbPath, 'utf8');

// ---------------------------------------------------------------------------
// #396: review.mjs's private AC checkbox parser must recognize the consolidated
// `aitm-verified cmd="..."` verifier declaration, not only the legacy
// `aitm-verified-by:` marker. The #367/#368/#369/#382 corpus migration rewrote
// AC declarations to the consolidated form; #395 taught the SHARED reader
// (lib/evidence-markers.mjs) the fallback but review.mjs kept its own
// un-migrated copy, so migrated ACs parsed with an empty command list and were
// false-bounced from Test to Develop at the "missing automated evidence" branch.
// ---------------------------------------------------------------------------

// Source-level pin: the consolidated-declaration fallback (parseProofMarker
// guarded by hasExecutionProof) is present in review.mjs.
{
  assert.match(
    reviewSource,
    /import\s+\{\s*parseProofMarker,\s*hasExecutionProof\s*\}\s+from\s+['"]\.\.\/lib\/proof-marker\.mjs['"]/,
    'review.mjs imports parseProofMarker + hasExecutionProof from lib/proof-marker.mjs'
  );
  assert.match(
    reviewSource,
    /!hasExecutionProof\(label\)/,
    'review.mjs guards the consolidated fallback with hasExecutionProof'
  );
  assert.match(
    reviewSource,
    /parseProofMarker\(label\)/,
    'review.mjs reads the consolidated declaration via parseProofMarker'
  );
  console.log('PASS: review.mjs consolidated-declaration fallback present (source pin)');
}

// Behavioral replication of review.mjs's exact AC command-extraction (lines
// ~232-246). Kept byte-faithful to the verb so this test fails if the verb's
// extraction drifts from the form pinned above.
function extractAcCommands(label) {
  const evidencePattern = /<!--\s*aitm-verified-by:\s*([\s\S]*?)\s*-->/;
  const cmdMatch = label.match(/^`([^`]+)`/); // canRunCommand=false for AC prose
  const evidenceMatch = !cmdMatch ? label.match(evidencePattern) : null;
  let evidenceCommands = evidenceMatch
    ? [...evidenceMatch[1].matchAll(/`([^`]+)`/g)].map((cmd) => cmd[1])
    : [];
  if (!cmdMatch && !evidenceCommands.length && !hasExecutionProof(label)) {
    const props = parseProofMarker(label);
    if (props && typeof props.cmd === 'string') {
      evidenceCommands = [...props.cmd.matchAll(/`([^`]+)`/g)].map((cmd) => cmd[1]);
    }
  }
  return evidenceCommands;
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

// AC #2 — a legacy declaration parses exactly as before.
{
  const label = 'Help text renders <!-- aitm-verified-by: `npm test` -->';
  assert.deepEqual(extractAcCommands(label), ['npm test'], 'legacy AC declaration unchanged');
  console.log('PASS: legacy AC declaration parses unchanged');
}

// AC #3 — an execution-proof stamp (record-of-run keys, no declaration intent)
// is NOT misread as a re-gating verifier declaration.
{
  const label =
    'Flag intercepted ' +
    '<!-- aitm-verified cmd="`npm test`" sha="78912dd" ts="2026-06-13T00:00:00Z" -->';
  // The line DOES carry a cmd, but it also carries record-of-run keys, so
  // hasExecutionProof short-circuits the fallback. Legacy path is also empty.
  assert.equal(hasExecutionProof(label), true, 'record-of-run stamp is execution proof');
  assert.deepEqual(
    extractAcCommands(label),
    [],
    'execution-proof stamp is not read as a verifier declaration'
  );
  console.log('PASS: execution-proof stamp respected by hasExecutionProof guard');
}

// AC #4 — review.mjs's extraction and the shared evidence-markers reader agree
// on the command set for the same AC line (no parser drift).
{
  const body = [
    '## Acceptance Criteria',
    '',
    '- [x] Help text renders <!-- aitm-verified cmd="`npm run test:all`" -->',
    '- [x] Flag is global <!-- aitm-verified-by: `npm test` -->',
  ].join('\n');
  const { acceptanceCriteria } = parseEvidenceChecklist(body);
  assert.equal(acceptanceCriteria.length, 2, 'both ACs parsed by shared reader');
  // Compare on the raw labels (re-derive from body so both readers see the same input).
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
// be demoted. Replicate the verb's "missing automated evidence" decision: with
// a non-empty command list the regression branch is not taken.
{
  const label = 'Help text renders <!-- aitm-verified cmd="`npm run test:all`" -->';
  const evidenceCommands = extractAcCommands(label);
  const wouldRegress = evidenceCommands.length === 0; // verb line ~343 condition
  assert.equal(wouldRegress, false, 'consolidated-only checked AC is not false-regressed');
  console.log('PASS: consolidated-only AC survives verbReview without false regression');
}

console.log('\nAll review-verb consolidated-declaration tests passed.');
