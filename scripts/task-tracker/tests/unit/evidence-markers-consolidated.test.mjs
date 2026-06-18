#!/usr/bin/env node
// @story #395
// #395 — the third verifier-declaration reader. `lib/evidence-markers.mjs`
// (`evidenceCommands`, surfaced through `parseEvidenceChecklist` and
// `auditEvidenceMarkers`, which back the review-preflight evidence audit) must
// recognize the consolidated `aitm-verified cmd="..."` declaration form, not
// just the legacy `aitm-verified-by:` marker. #391 (C5) and #393 (C7) hardened
// the AC and Functional-DoD readers; this reader was missed in EPIC #367 AC#4,
// which surfaced as a review-preflight regression on #394.
import { strict as assert } from 'node:assert';
import { parseEvidenceChecklist, auditEvidenceMarkers } from '../../lib/evidence-markers.mjs';
import { serializeMarker } from '../../lib/marker-grammar.mjs';

const CMD = 'node scripts/task-tracker/tests/evidence-markers-consolidated.test.mjs';
const consolidatedDecl = serializeMarker('verified', { cmd: `\`${CMD}\`` });
const legacyDecl = `<!-- aitm-verified-by: \`${CMD}\` -->`;
const proofStamp = serializeMarker('verified', {
  cmd: `\`${CMD}\``,
  sha: '0123abc',
  ts: '2026-01-01T00:00:00Z',
});

// Helper: build a single-AC body and return that AC's parsed evidence commands.
function acCommands(label) {
  const body = ['## Acceptance Criteria', '', `- [ ] ${label}`, ''].join('\n');
  const { acceptanceCriteria } = parseEvidenceChecklist(body);
  assert.equal(acceptanceCriteria.length, 1, 'exactly one AC parsed');
  return acceptanceCriteria[0].evidenceCommands;
}

// 1. Consolidated-only declaration yields the declared command.
assert.deepEqual(
  acCommands(`consolidated only ${consolidatedDecl}`),
  [CMD],
  'consolidated-only line yields the declared command'
);

// 2. Dual-marker line reads the legacy marker only — no double-count.
assert.deepEqual(
  acCommands(`dual ${legacyDecl} ${consolidatedDecl}`),
  [CMD],
  'dual-marker line reads legacy only, command not double-counted'
);

// 3. Legacy-only line is unchanged by the new fallback.
assert.deepEqual(
  acCommands(`legacy ${legacyDecl}`),
  [CMD],
  'legacy-only line still reads from the legacy marker'
);

// 4. `hasExecutionProof` guard: a record-of-run proof stamp (ts/sha) is NOT a
//    re-gating verifier declaration, so it yields no command.
assert.deepEqual(
  acCommands(`record of run ${proofStamp}`),
  [],
  'proof stamp (ts/sha) is not a declaration — yields no command'
);

// 5. `auditEvidenceMarkers` reports ok for an AC + Verification-Commands body
//    whose verifier is declared in consolidated form only (the #394 regression).
const body = [
  '## Acceptance Criteria',
  '',
  `- [ ] the behavior holds ${consolidatedDecl}`,
  '',
  '## Verification Commands',
  '',
  `- [ ] \`${CMD}\``,
  '',
].join('\n');
const audit = auditEvidenceMarkers(body);
assert.equal(audit.ok, true, 'consolidated-only AC passes the evidence audit');
assert.deepEqual(audit.missingEvidence, [], 'no AC reported as missing evidence');
assert.deepEqual(
  audit.missingVerificationCommands,
  [],
  'declared command is recognized as present in Verification Commands'
);

console.log('evidence-markers-consolidated.test.mjs: OK');
