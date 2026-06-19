#!/usr/bin/env node
// @story #427
// #427 — buildVcBackfill: VC-section back-fill for the pre-#410 corpus.
import { strict as assert } from 'node:assert';
import { buildVcBackfill, DEFAULT_VC_COMMANDS } from '../../backfill-vc-sections.mjs';
import { parseVerificationCommands } from '../../lib/verification-commands.mjs';

const PICKUP = '## Pickup Directive — MANDATORY, DO NOT SKIP';

// Idempotency: a body that already has a VC section is skipped.
{
  const body = ['## Verification Commands', '', '- [ ] `npm run test:all`', '', PICKUP].join('\n');
  const r = buildVcBackfill(body);
  assert.equal(r.status, 'skip', 'existing VC section must skip');
}

// Derived path: an AC-declared command surfaces into the seeded section.
{
  const cmd = 'node scripts/task-tracker/tests/new.test.mjs';
  const body = [
    '## Acceptance Criteria',
    `- [ ] Some AC <!-- aitm-verified cmd="\`${cmd}\`" -->`,
    '',
    PICKUP,
  ].join('\n');
  const r = buildVcBackfill(body);
  assert.equal(r.status, 'healed');
  assert.equal(r.mode, 'derived');
  assert.deepEqual(r.commands, [cmd]);
  assert.deepEqual(
    parseVerificationCommands(r.body).map((v) => v.command),
    [cmd]
  );
}

// Default path: a body with no declared commands seeds the four standard ones.
{
  const body = ['## Summary', 'Sparse body, no DoD.', '', PICKUP].join('\n');
  const r = buildVcBackfill(body);
  assert.equal(r.status, 'healed');
  assert.equal(r.mode, 'default');
  assert.deepEqual(r.commands, DEFAULT_VC_COMMANDS);
  assert.deepEqual(
    parseVerificationCommands(r.body).map((v) => v.command),
    DEFAULT_VC_COMMANDS
  );
}

// Placement: section is inserted immediately BEFORE the Pickup Directive anchor.
{
  const body = ['## Summary', 'x', '', PICKUP, 'directive text'].join('\n');
  const r = buildVcBackfill(body);
  const vcIdx = r.body.indexOf('## Verification Commands');
  const pickupIdx = r.body.indexOf(PICKUP);
  assert.ok(vcIdx >= 0 && pickupIdx >= 0);
  assert.ok(vcIdx < pickupIdx, 'VC section must precede Pickup Directive');
}

// Append-when-anchor-absent: no Pickup Directive → section appended at end.
{
  const body = ['## Summary', 'no anchor here'].join('\n');
  const r = buildVcBackfill(body);
  assert.equal(r.status, 'healed');
  const vcIdx = r.body.indexOf('## Verification Commands');
  assert.ok(vcIdx > r.body.indexOf('no anchor here'), 'VC appended after body content');
  assert.equal(parseVerificationCommands(r.body).length, DEFAULT_VC_COMMANDS.length);
}

// Idempotency, end-to-end: re-running on a healed body is a no-op (skip).
{
  const body = ['## Summary', 'x', '', PICKUP].join('\n');
  const once = buildVcBackfill(body);
  const twice = buildVcBackfill(once.body);
  assert.equal(twice.status, 'skip', 'second pass must skip');
}

console.log('backfill-vc-sections.test.mjs: ok');
