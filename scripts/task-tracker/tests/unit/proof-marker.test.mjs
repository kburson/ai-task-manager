// @story #368
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
  validateDeclarationCmd,
  collectDeclarationCmds,
} from '../../lib/proof-marker.mjs';

// --- round-trip: spaces, backticks, embedded double-quote -------------------
// The round-trip identity holds for a canonical new-form map (cmd/sha/ts/...).
// Legacy `verified-at` (proof stamp) is still normalized on read; `verified-by`
// (declaration) is retired as of #468 and no longer recognized.
{
  const props = {
    cmd: '`npm test` `npm run lint`',
    sha: 'sandbox',
    ts: '2026-06-10T17:00:00Z',
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

// --- consolidated cmd-only marker is a DECLARATION, not execution proof -----
{
  const decl = '- [ ] All tests pass <!-- aitm-verified cmd="`npm run test:all`" -->';
  const parsed = parseProofMarker(decl);
  assert.equal(parsed.cmd, '`npm run test:all`', 'consolidated declaration cmd parsed');
  assert.equal(
    resolveVerifiedBy(decl),
    '`npm run test:all`',
    'resolveVerifiedBy reads cmd from consolidated declaration'
  );
  assert.ok(!hasExecutionProof(decl), 'bare cmd-only declaration is NOT execution proof');
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
  const line = serializeProofMarker({ cmd: 'npm run lint' });
  assert.equal(resolveVerifiedBy(line), 'npm run lint', 'cmd resolved from consolidated form');
}

// --- a line with consolidated declaration AND inline proof merges -----------
{
  const line =
    '- [x] All tests pass <!-- aitm-verified cmd="`npm run test:all`" --> <!-- aitm-verified verified-at="2026-06-10T17:00:00Z" sha="sandbox" -->';
  const parsed = parseProofMarker(line);
  assert.equal(parsed.cmd, '`npm run test:all`', 'cmd from declaration preserved');
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
  const line = '`npm test` <!-- aitm-verified verified-at="x" -->';
  assert.equal(
    stripProofMarkers(line),
    '`npm test`',
    'consolidated marker stripped, label preserved'
  );
}

// --- #382: new key set (cmd/sha/ts/evidence/proof) round-trips --------------
{
  const line = serializeProofMarker({
    cmd: 'npm run test:all',
    sha: 'sandbox',
    ts: '2026-06-12T17:00:00.000Z',
    evidence: 'sandbox exit 0 (npm run test:all)',
    proof: 'none',
  });
  assert.equal(
    line,
    '<!-- aitm-verified cmd="npm run test:all" sha="sandbox" ts="2026-06-12T17:00:00.000Z" evidence="sandbox exit 0 (npm run test:all)" proof="none" -->',
    'new key set serializes with no packed value and no duplicate sha'
  );
  const parsed = parseProofMarker(line);
  assert.equal(parsed.cmd, 'npm run test:all', 'cmd parsed');
  assert.equal(parsed.sha, 'sandbox', 'sha parsed');
  assert.equal(parsed.ts, '2026-06-12T17:00:00.000Z', 'ts parsed');
  assert.equal(parsed.evidence, 'sandbox exit 0 (npm run test:all)', 'evidence parsed');
  assert.equal(parsed.proof, 'none', 'proof parsed');
  assert.ok(!('verified-at' in parsed), 'no legacy verified-at on a new-form marker');
  assert.ok(hasExecutionProof(line), 'new cmd/sha/ts form counts as execution proof');
}

// --- #382: packed legacy verified-at="<sha>:<iso>" splits into sha + ts ------
{
  const packed =
    '- [x] `npm test` <!-- aitm-verified verified-at="0ee05d4:2026-06-11T14:45:00.000Z" evidence="x" proof="none" -->';
  const parsed = parseProofMarker(packed);
  assert.equal(parsed.sha, '0ee05d4', 'packed sha split out');
  assert.equal(parsed.ts, '2026-06-11T14:45:00.000Z', 'packed iso split into ts');
  assert.equal(parsed['verified-at'], '0ee05d4:2026-06-11T14:45:00.000Z', 'legacy key retained');
  assert.ok(hasExecutionProof(packed), 'packed legacy form still counts as execution proof');
}

// --- #382: consolidated cmd declaration + proof stamp on same line ----------
{
  // After #468: only the consolidated form is recognized.
  // A cmd-only declaration and a proof stamp on the same line both parse and merge.
  const combined =
    '- [x] All tests pass <!-- aitm-verified cmd="`npm run test:all`" --> <!-- aitm-verified verified-at="2026-06-11T14:45:00.000Z" sha="sandbox" proof="none" -->';
  const parsed = parseProofMarker(combined);
  assert.equal(parsed.ts, '2026-06-11T14:45:00.000Z', 'verified-at normalized to ts');
  assert.equal(parsed.cmd, '`npm run test:all`', 'cmd from consolidated declaration');
  assert.equal(parsed['verified-at'], '2026-06-11T14:45:00.000Z', 'verified-at retained');
  assert.ok(hasExecutionProof(combined), 'combined line has execution proof');
  assert.equal(resolveVerifiedBy(combined), '`npm run test:all`', 'resolveVerifiedBy reads cmd');
}

// --- #382: resolveVerifiedBy falls back to cmd ------------------------------
{
  const line = serializeProofMarker({ cmd: '`npm run lint`', sha: 'sandbox' });
  assert.equal(resolveVerifiedBy(line), '`npm run lint`', 'resolveVerifiedBy falls back to cmd');
}

// --- #391: a cmd-only consolidated marker is a DECLARATION, not proof -------
// After the #369 corpus migration a verifier declaration becomes
// `<!-- aitm-verified cmd="`cmd`" -->` — name-indistinguishable from a proof
// stamp. Recognition must be content-based: a marker carrying only `cmd`
// (intent) and no `ts`/`sha`/`evidence` (record-of-run) is NOT execution proof.
{
  const decl = serializeProofMarker({ cmd: '`npm test`' });
  assert.equal(decl, '<!-- aitm-verified cmd="`npm test`" -->', 'cmd-only consolidated form');
  const parsed = parseProofMarker(decl);
  assert.equal(parsed.cmd, '`npm test`', 'cmd parsed off the consolidated declaration');
  assert.ok(
    !hasExecutionProof(decl),
    'cmd-only consolidated aitm-verified is a declaration, not execution proof'
  );
  // A consolidated marker that DOES carry a record-of-run key still counts.
  assert.ok(
    hasExecutionProof(serializeProofMarker({ cmd: '`npm test`', ts: '2026-06-12T00:00:00Z' })),
    'cmd + ts consolidated marker is execution proof'
  );
  assert.ok(
    hasExecutionProof(serializeProofMarker({ cmd: '`npm test`', sha: 'abc1234' })),
    'cmd + sha consolidated marker is execution proof'
  );
}

// --- #423: validateDeclarationCmd rejects placeholders/prose, accepts commands
{
  // Malformed: unsubstituted placeholder.
  assert.ok(
    validateDeclarationCmd('`gh issue view <child> --json state`'),
    'rejects a cmd carrying an unsubstituted <…> placeholder'
  );
  // Malformed: prose outside backtick spans (the #328 corruption shape).
  assert.ok(
    validateDeclarationCmd('`gh issue view 328 --json state` returned CLOSED'),
    'rejects a cmd carrying trailing prose outside backticks'
  );
  // Well-formed: single backtick-wrapped command.
  assert.equal(
    validateDeclarationCmd('`node scripts/task-tracker/tests/check.test.mjs`'),
    null,
    'accepts a single backtick-wrapped command (buildMarker output)'
  );
  // Well-formed: space-separated backtick groups (buildMarker multi-command).
  assert.equal(
    validateDeclarationCmd('`npm run lint` `npm run format:check`'),
    null,
    'accepts space-separated backtick command groups'
  );
  // Well-formed: bare comma-joined list (auto-tick Functional cmd).
  assert.equal(
    validateDeclarationCmd('npm run lint, npm run format:check'),
    null,
    'accepts a bare comma-joined command list (auto-tick output)'
  );
  // Well-formed: bare single command (auto-tick VC cmd) and derive: form.
  assert.equal(validateDeclarationCmd('npm run lint'), null, 'accepts a bare single command');
  assert.equal(
    validateDeclarationCmd('derive:functional:lint'),
    null,
    'accepts a derive: pseudo-command'
  );
  // A real shell redirection is not a placeholder (no word-char after `<`).
  assert.equal(
    validateDeclarationCmd('`sort < a.txt > b.txt`'),
    null,
    'a shell redirection inside backticks is not mistaken for a placeholder'
  );
}

// --- #423: collectDeclarationCmds returns only cmd-bearing consolidated markers
{
  const body = [
    '- [x] alpha <!-- aitm-verified cmd="`npm run lint`" -->',
    '- [x] beta <!-- aitm-verified ts="2026-06-16T00:00:00Z" sha="abc1234" -->',
    '- [x] gamma <!-- aitm-verified cmd="`npm test` <leftover>" -->',
  ].join('\n');
  const decls = collectDeclarationCmds(body);
  assert.equal(decls.length, 2, 'only the two cmd-bearing declarations are collected');
  assert.deepEqual(
    decls.map((d) => d.cmd),
    ['`npm run lint`', '`npm test` <leftover>'],
    'decoded cmd values returned in document order'
  );
}

console.log('proof-marker.test.mjs: all assertions passed');
