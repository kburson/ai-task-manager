// #928 — AC-citation emitter serializes into the canonical `vc-list` attribute.
//
// Regression guard for the producer/gate mismatch: `buildEvidenceBackfill` cites
// AC verifiers through `citeCommands`, which always yields a `vc:<n>` id-run.
// That run must be serialized into the `vc-list` attribute, NOT the deprecated
// ordinal `cmd` attribute — the shape the Refine→Plan exit gate
// (`findAcsWithLegacyVerificationForm`, `ordinal-cmd-citation`) and the V5
// review validator (#814) reject. Emitting `cmd="vc:N"` forced every freshly
// backfilled AC through a `heal-vc-refs` pass before it could advance.
//
// The legacy literal backtick-embedded command form (emitted only when no VC
// context is available to cite into) keeps the `cmd` attribute, and the
// Functional-DoD literal `cmd="`…`"` declarations (a different role, #903) are
// untouched by this emitter.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildEvidenceBackfill } from './evidence-markers.mjs';
import { serializeProofMarker } from './proof-marker.mjs';
import { findAcsWithLegacyVerificationForm } from './body-invariants.mjs';

const BODY = [
  '## Acceptance Criteria',
  '',
  '- [ ] First criterion',
  '- [ ] Second criterion',
  '',
  '## Verification Commands',
  '',
  '- [ ] `node --test existing.test.mjs`',
  '',
].join('\n');

const MAPPINGS = {
  'First criterion': ['node --test existing.test.mjs'], // already listed → cite vc:1
  'Second criterion': ['node --test new.test.mjs'], // absent → append + cite vc:2
};

function acLine(body, prefix) {
  return body.split('\n').find((l) => l.startsWith(`- [ ] ${prefix}`));
}

test('AC1/AC5: a vc:<n> citation emits into the vc-list attribute, never cmd', () => {
  const r = buildEvidenceBackfill(BODY, { mappings: MAPPINGS });
  assert.equal(r.ok, true);

  const ac1 = acLine(r.body, 'First criterion');
  const ac2 = acLine(r.body, 'Second criterion');

  assert.match(ac1, /aitm-verified vc-list="vc:1"/);
  assert.match(ac2, /aitm-verified vc-list="vc:2"/);

  // The regression floor: the deprecated ordinal `cmd="vc:N"` shape must never
  // be re-introduced by the emitter.
  const acSection = r.body.split('## Verification Commands')[0];
  assert.doesNotMatch(acSection, /aitm-verified cmd="vc:/);
});

test('AC2: emitter output passes the Refine→Plan legacy-form gate with zero offenders', () => {
  const r = buildEvidenceBackfill(BODY, { mappings: MAPPINGS });
  assert.deepEqual(findAcsWithLegacyVerificationForm(r.body), []);
});

test('AC3: a literal command with no citable VC context keeps the cmd attribute', () => {
  // A body with NO `## Verification Commands` section: `citeCommands` still
  // assigns vc:<n> positions (it appends), so the canonical path is vc-list.
  // The literal-`cmd` compat path is exercised at the serializer boundary:
  // buildMarker only rewrites a *pure* vc:<n> run; a backtick-embedded literal
  // string is left on the `cmd` attribute untouched.
  const literal = serializeProofMarker({ cmd: '`node --test legacy.test.mjs`' });
  assert.match(literal, /cmd="`node --test legacy\.test\.mjs`"/);
  assert.doesNotMatch(literal, /vc-list=/);
});

test('AC4: Functional-DoD literal cmd declarations are left untouched by the emitter', () => {
  const dodLine =
    '- [ ] All automated tests pass <!-- aitm-verified cmd="`npm run test:all`" --> <!-- dod:functional:tests -->';
  const body = [
    '## Acceptance Criteria',
    '',
    '- [ ] First criterion',
    '',
    '## Verification Commands',
    '',
    '- [ ] `node --test existing.test.mjs`',
    '',
    '## Definition of Done',
    '',
    dodLine,
    '',
  ].join('\n');

  const r = buildEvidenceBackfill(body, {
    mappings: { 'First criterion': ['node --test existing.test.mjs'] },
  });
  assert.equal(r.ok, true);
  // The DoD literal declaration survives byte-for-byte.
  assert.ok(r.body.includes(dodLine), 'DoD literal cmd declaration must be untouched');
});
