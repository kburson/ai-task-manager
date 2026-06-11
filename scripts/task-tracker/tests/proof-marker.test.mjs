// Unit tests for the consolidated proof-marker helper (#368).
import assert from 'node:assert/strict';
import {
  serializeProofMarker,
  parseProofMarker,
  hasExecutionProof,
  resolveVerifiedBy,
  stripProofMarkers,
  escapeValue,
  unescapeValue,
} from '../lib/proof-marker.mjs';

// --- round-trip: spaces, backticks, embedded double-quote -------------------
{
  const props = {
    'verified-by': 'npm run test:all',
    'verified-at': '17a7a37:2026-06-10T17:00:00Z',
    cmd: '`npm test` `npm run lint`',
    evidence: 'failed on "weird" input',
  };
  const line = serializeProofMarker(props);
  const parsed = parseProofMarker(line);
  assert.deepEqual(parsed, props, 'serialize→parse round-trips the original map');
  assert.ok(line.includes('&quot;weird&quot;'), 'embedded double-quote escaped as &quot;');
}

// --- escape/unescape are inverse -------------------------------------------
{
  const raw = 'a "b" c "d"';
  assert.equal(unescapeValue(escapeValue(raw)), raw, 'escape then unescape is identity');
  assert.equal(escapeValue(raw), 'a &quot;b&quot; c &quot;d&quot;', 'each quote escaped');
}

// --- empty props ------------------------------------------------------------
{
  assert.equal(serializeProofMarker({}), '<!-- aitm-verified -->', 'empty props → bare marker');
  assert.equal(serializeProofMarker(), '<!-- aitm-verified -->', 'no arg → bare marker');
}

// --- key order preserved ----------------------------------------------------
{
  const line = serializeProofMarker({ b: '2', a: '1', c: '3' });
  assert.equal(line, '<!-- aitm-verified b="2" a="1" c="3" -->', 'insertion order preserved');
}

// --- legacy verified-at PROOF stamp read path -------------------------------
{
  const legacy =
    '- [x] `npm test` <!-- aitm-verified-at: 2026-06-10T17:00:00Z evidence:"sandbox exit 0 (npm test)" sha=sandbox proof=none -->';
  const parsed = parseProofMarker(legacy);
  assert.equal(parsed['verified-at'], '2026-06-10T17:00:00Z', 'legacy verified-at parsed');
  assert.equal(parsed.evidence, 'sandbox exit 0 (npm test)', 'legacy evidence parsed');
  assert.equal(parsed.sha, 'sandbox', 'legacy sha parsed');
  assert.equal(parsed.proof, 'none', 'legacy proof parsed');
  assert.ok(hasExecutionProof(legacy), 'legacy verified-at counts as execution proof');
}

// --- legacy verified-by DECLARATION read path -------------------------------
{
  const decl = '- [ ] All tests pass <!-- aitm-verified-by: `npm run test:all` -->';
  const parsed = parseProofMarker(decl);
  assert.equal(parsed['verified-by'], '`npm run test:all`', 'legacy declaration value parsed raw');
  assert.equal(resolveVerifiedBy(decl), '`npm run test:all`', 'resolveVerifiedBy reads declaration');
  assert.ok(!hasExecutionProof(decl), 'bare declaration is NOT execution proof');
}

// --- consolidated marker is execution proof ---------------------------------
{
  const line = serializeProofMarker({
    'verified-at': '2026-06-10T17:00:00Z',
    evidence: 'sandbox exit 0 (npm test)',
    sha: 'sandbox',
    proof: 'none',
  });
  assert.ok(hasExecutionProof(line), 'consolidated aitm-verified counts as execution proof');
  // Must not be confused with the legacy hyphenated names.
  assert.ok(!hasExecutionProof('<!-- aitm-verified-by: `x` -->'), 'verified-by excluded');
}

// --- resolveVerifiedBy from consolidated form -------------------------------
{
  const line = serializeProofMarker({ 'verified-by': 'npm run lint' });
  assert.equal(resolveVerifiedBy(line), 'npm run lint', 'verified-by resolved from consolidated');
}

// --- a line with declaration AND inline proof merges ------------------------
{
  const line =
    '- [x] All tests pass <!-- aitm-verified-by: `npm run test:all` --> <!-- aitm-verified verified-at="2026-06-10T17:00:00Z" sha="sandbox" -->';
  const parsed = parseProofMarker(line);
  assert.equal(parsed['verified-by'], '`npm run test:all`', 'declaration preserved');
  assert.equal(parsed['verified-at'], '2026-06-10T17:00:00Z', 'consolidated proof field merged');
  assert.equal(parsed.sha, 'sandbox', 'consolidated sha merged');
  assert.ok(hasExecutionProof(line), 'line has execution proof');
}

// --- no marker → null -------------------------------------------------------
{
  assert.equal(parseProofMarker('- [ ] plain item'), null, 'no marker → null');
  assert.ok(!hasExecutionProof('- [ ] plain item'), 'no marker → no execution proof');
}

// --- stripProofMarkers cleans label for display -----------------------------
{
  const line =
    '`npm test` <!-- aitm-verified verified-at="x" --> <!-- aitm-verified-by: `npm test` -->';
  assert.equal(stripProofMarkers(line), '`npm test`', 'all markers stripped, label preserved');
}

console.log('proof-marker.test.mjs: all assertions passed');
