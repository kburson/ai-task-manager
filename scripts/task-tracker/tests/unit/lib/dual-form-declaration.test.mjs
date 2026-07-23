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
} from '../../../lib/proof-marker.mjs';
import { autoTickVerified } from '../../../lib/auto-tick-verified.mjs';
import { detectFunctionalPretick } from '../../../lib/lifecycle-dod.mjs';
import { lintChecklistCommands } from '../../../lib/checklist-command-lint.mjs';

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

// --- #468 retired the legacy colon-form: only consolidated form recognized ---
// After #468, extractVerifiedCommands and hasVerifiedDeclaration ignore the
// `aitm-verified-by:` colon-form; only `aitm-verified cmd="..."` is canonical.
{
  assert.deepEqual(
    extractVerifiedCommands(`item ${LEGACY}`),
    [],
    'legacy colon-form (retired by #468) yields no commands'
  );
  assert.deepEqual(
    extractVerifiedCommands(`item ${CONSOLIDATED}`),
    ['npm test'],
    'consolidated declaration extracts command'
  );
  assert.ok(
    !hasVerifiedDeclaration(`item ${LEGACY}`),
    'legacy form is not a recognized declaration after #468'
  );
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

// --- #481: a combined marker (cmd + run-props) still yields its declaration ---
// `cmd` is the PERSISTENT declaration component, read regardless of any run-props
// (`ts`/`sha`/`evidence`) on the same marker. The single-expandable marker carries
// declaration AND proof in one comment, so the declared command must remain
// readable for re-verification — the pre-#481 `hasExecutionProof` gate hid it.
{
  assert.deepEqual(
    extractVerifiedCommands(`item ${PROOF}`),
    ['npm test'],
    'combined marker (cmd + run-props) still yields the declared command (#481)'
  );
  assert.equal(
    hasVerifiedDeclaration(`item ${PROOF}`),
    true,
    'combined marker (cmd + run-props) is still a declaration (#481)'
  );
}

// --- dual-marker line: consolidated is the only source after #468 -----------
{
  assert.deepEqual(
    extractVerifiedCommands(`item ${LEGACY} ${CONSOLIDATED}`),
    ['npm test'],
    'legacy+consolidated on one line: consolidated is the source, no double-count'
  );
}

// --- auto-tick: only consolidated-declared Functional item ticks after #468 --
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

  // After #468, legacy form is not recognized — item stays unticked.
  assert.ok(
    !legacy.body.includes('- [x] All automated tests pass'),
    'legacy-declared Functional item NOT ticked after #468 (form retired)'
  );
  assert.ok(
    consolidated.body.includes('- [x] All automated tests pass'),
    'consolidated-declared Functional item ticks on green'
  );
  assert.equal(
    consolidated.tickedFunctional.length,
    1,
    'consolidated-declared Functional item reported as ticked'
  );
}

// --- pre-tick guard: only consolidated-declared pre-tick caught after #468 ---
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

  // After #468, legacy form is not recognized — pre-tick not caught.
  assert.equal(
    legacy.regressions.length,
    0,
    'legacy pre-tick NOT caught after #468 (form retired)'
  );
  assert.equal(consolidated.regressions.length, 1, 'consolidated-declared pre-tick caught');
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

// --- bare-marker lint: only consolidated cmd without backticks warns after #468
{
  function lintBody(acMarker) {
    return ['## Acceptance Criteria', '', `- [ ] criterion ${acMarker}`, ''].join('\n');
  }
  // After #468, legacy colon-form is not recognized by the linter — no warning.
  const legacyBare = lintChecklistCommands(lintBody('<!-- aitm-verified-by: npm test -->'));
  const consolidatedBare = lintChecklistCommands(lintBody('<!-- aitm-verified cmd="npm test" -->'));

  assert.ok(
    !legacyBare.violations.some((v) => v.rule === 'missing-backticks'),
    'legacy bare colon-form is not linted after #468 (form retired)'
  );
  assert.ok(
    consolidatedBare.violations.some((v) => v.rule === 'missing-backticks'),
    'consolidated bare cmd warns missing-backticks'
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
