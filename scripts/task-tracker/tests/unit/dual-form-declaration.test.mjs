// @story #418
// cspell:ignore preticked backticked
import assert from 'node:assert/strict';

// #418 (epic #417, C1) — every declaration-gating reader must recognize a
// consolidated `aitm-verified cmd="..."` declaration identically to the legacy
// `aitm-verified-by` form, BEFORE the writers (C2 #419) flip. Each block below
// asserts the consolidated form gates the same as legacy, and that a
// record-of-run proof stamp (ts/sha) is NOT mistaken for a declaration. The
// assertions fail against the pre-#418 legacy-only readers and pass after.

import {
  extractVerifiedCommands,
  hasVerifiedDeclaration,
  serializeProofMarker,
} from '../../lib/proof-marker.mjs';
import { autoTickVerified } from '../../lib/auto-tick-verified.mjs';
import { detectFunctionalPretick } from '../../lib/lifecycle-dod.mjs';
import { lintChecklistCommands } from '../../lib/checklist-command-lint.mjs';

const LEGACY = '<!-- aitm-verified-by: `npm test` -->';
const CONSOLIDATED = '<!-- aitm-verified cmd="`npm test`" -->';
// A record-of-run proof stamp: carries ts/sha, so it is NOT a declaration.
const PROOF = serializeProofMarker({
  cmd: '`npm test`',
  sha: 'sandbox',
  ts: '2026-06-15T00:00:00.000Z',
  evidence: 'sandbox exit 0',
  proof: 'none',
});

// --- shared extractor: both forms yield identical commands ------------------
{
  assert.deepEqual(
    extractVerifiedCommands(`item ${LEGACY}`),
    ['npm test'],
    'legacy declaration extracts command'
  );
  assert.deepEqual(
    extractVerifiedCommands(`item ${CONSOLIDATED}`),
    ['npm test'],
    'consolidated declaration extracts command identically'
  );
  assert.deepEqual(
    extractVerifiedCommands(`item ${LEGACY}`),
    extractVerifiedCommands(`item ${CONSOLIDATED}`),
    'legacy and consolidated declarations extract equal command lists'
  );
  assert.ok(hasVerifiedDeclaration(`item ${LEGACY}`), 'legacy is a declaration');
  assert.ok(hasVerifiedDeclaration(`item ${CONSOLIDATED}`), 'consolidated is a declaration');
}

// --- multi-command consolidated declaration --------------------------------
{
  const multi = '<!-- aitm-verified cmd="`npm run lint` `npm run format:check`" -->';
  assert.deepEqual(
    extractVerifiedCommands(`item ${multi}`),
    ['npm run lint', 'npm run format:check'],
    'consolidated multi-command declaration preserves document order'
  );
}

// --- proof stamp is NOT a declaration (discrimination via hasExecutionProof)
{
  assert.deepEqual(
    extractVerifiedCommands(`item ${PROOF}`),
    [],
    'a ts/sha proof stamp yields no declaration commands'
  );
  assert.equal(
    hasVerifiedDeclaration(`item ${PROOF}`),
    false,
    'a ts/sha proof stamp is not a declaration'
  );
}

// --- dual-marker line not double-counted -----------------------------------
{
  assert.deepEqual(
    extractVerifiedCommands(`item ${LEGACY} ${CONSOLIDATED}`),
    ['npm test'],
    'legacy+consolidated on one line counts the command once (legacy wins)'
  );
}

// --- auto-tick: consolidated-declared Functional item ticks like legacy -----
{
  function body(marker) {
    return [
      '## Verification Commands',
      '',
      '- [ ] `npm test`',
      '',
      '## Definition of Done',
      '',
      '#### Functional (verified at Test)',
      '',
      `- [ ] All automated tests pass ${marker}`,
      '',
    ].join('\n');
  }
  const green = [{ command: 'npm test', passed: true, exit: 0 }];
  const now = '2026-06-15T00:00:00.000Z';

  const legacy = autoTickVerified(body(LEGACY), green, now);
  const consolidated = autoTickVerified(body(CONSOLIDATED), green, now);

  assert.ok(
    legacy.body.includes('- [x] All automated tests pass'),
    'legacy-declared Functional item ticks on green'
  );
  assert.ok(
    consolidated.body.includes('- [x] All automated tests pass'),
    'consolidated-declared Functional item ticks on green identically'
  );
  assert.equal(
    consolidated.tickedFunctional.length,
    1,
    'consolidated-declared Functional item reported as ticked'
  );
}

// --- pre-tick guard: consolidated-declared pre-tick is un-ticked ------------
{
  function preticked(marker) {
    return [
      '#### Functional (verified at Test)',
      '',
      `- [x] All automated tests pass ${marker}`,
      '',
    ].join('\n');
  }
  const legacy = detectFunctionalPretick(preticked(LEGACY));
  const consolidated = detectFunctionalPretick(preticked(CONSOLIDATED));

  assert.equal(legacy.regressions.length, 1, 'legacy pre-tick caught');
  assert.equal(
    consolidated.regressions.length,
    1,
    'consolidated-declared pre-tick caught identically'
  );
  assert.ok(
    consolidated.body.includes('- [ ] All automated tests pass'),
    'consolidated-declared pre-tick un-ticked'
  );

  // A consolidated PROOF stamp on a ticked item is the legitimate green path —
  // the pre-tick guard must leave it alone.
  const proofTicked = detectFunctionalPretick(preticked(PROOF));
  assert.equal(
    proofTicked.regressions.length,
    0,
    'a ts/sha proof stamp on a ticked item is not a pre-tick regression'
  );
}

// --- bare-marker lint: consolidated cmd without backticks warns -------------
{
  function lintBody(acMarker) {
    return ['## Acceptance Criteria', '', `- [ ] criterion ${acMarker}`, ''].join('\n');
  }
  // Bare (no backticks) in both forms must warn 'missing-backticks'.
  const legacyBare = lintChecklistCommands(lintBody('<!-- aitm-verified-by: npm test -->'));
  const consolidatedBare = lintChecklistCommands(lintBody('<!-- aitm-verified cmd="npm test" -->'));

  assert.ok(
    legacyBare.violations.some((v) => v.rule === 'missing-backticks'),
    'legacy bare marker warns missing-backticks'
  );
  assert.ok(
    consolidatedBare.violations.some((v) => v.rule === 'missing-backticks'),
    'consolidated bare cmd warns missing-backticks identically'
  );

  // Properly backticked consolidated cmd must NOT warn.
  const consolidatedOk = lintChecklistCommands(lintBody(CONSOLIDATED));
  assert.ok(
    !consolidatedOk.violations.some((v) => v.rule === 'missing-backticks'),
    'consolidated cmd with backticks does not warn'
  );

  // A consolidated proof stamp (ts/sha) is not a declaration → no bare warning.
  const proofLint = lintChecklistCommands(lintBody(PROOF));
  assert.ok(
    !proofLint.violations.some((v) => v.rule === 'missing-backticks'),
    'a proof stamp is not treated as a bare declaration'
  );
}
