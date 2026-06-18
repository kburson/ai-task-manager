// @story #368
// #368 AC9 — the two `## Verification Commands` label parsers must still parse
// an entry whose backtick command carries a trailing inline proof marker (the
// `aitm-verified` comment that `auto-tick-verified` stamps on a green test).
// Before this fix, the trailing comment defeated both parsers and every VC
// entry dropped to zero — the regression that blocked #230's re-test/review.
import assert from 'node:assert/strict';
import { parseVerificationCommands } from '../../lib/verification-commands.mjs';
import { parseEvidenceChecklist } from '../../lib/evidence-markers.mjs';
import { autoTickVerified } from '../../lib/auto-tick-verified.mjs';

const BODY = ['## Verification Commands', '', '- [ ] `npm test`', '- [ ] `npm run lint`', ''].join(
  '\n'
);

// Produce a realistic auto-ticked body (each VC line now carries an inline
// consolidated `aitm-verified` proof marker).
const { body: ticked } = autoTickVerified(
  BODY,
  [
    { command: 'npm test', passed: true, exit: 0 },
    { command: 'npm run lint', passed: true, exit: 0 },
  ],
  '2026-06-10T17:00:00Z'
);

// Sanity: the ticked lines really do carry a trailing marker.
assert.ok(
  /- \[x\] `npm test` <!-- aitm-verified /.test(ticked),
  'auto-tick stamped consolidated marker'
);

// parseVerificationCommands tolerates the trailing marker.
{
  const items = parseVerificationCommands(ticked);
  assert.equal(items.length, 2, 'both VC entries parsed despite trailing marker');
  assert.deepEqual(
    items.map((i) => i.command).sort(),
    ['npm run lint', 'npm test'],
    'commands extracted from auto-ticked labels'
  );
  assert.ok(
    items.every((i) => i.checked),
    'both entries reported as checked'
  );
}

// parseEvidenceChecklist VC branch tolerates the trailing marker.
{
  const { verificationCommands } = parseEvidenceChecklist(ticked);
  assert.deepEqual(
    verificationCommands.slice().sort(),
    ['npm run lint', 'npm test'],
    'evidence-checklist VC branch extracted commands from auto-ticked labels'
  );
}

// A plain (un-ticked) entry still parses, and a non-command label still does not.
{
  const plain = parseVerificationCommands(BODY);
  assert.equal(plain.length, 2, 'plain VC entries still parse');
  const noCmd = parseVerificationCommands(
    ['## Verification Commands', '', '- [ ] not a backtick command', ''].join('\n')
  );
  assert.equal(noCmd.length, 0, 'non-command label still yields no VC entry');
}

console.log('vc-parser-trailing-marker.test.mjs: all assertions passed');
