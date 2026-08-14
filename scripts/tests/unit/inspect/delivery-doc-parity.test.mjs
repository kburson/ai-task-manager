// @story #781
// Doc-parity guard for docs/ai-memory/DELIVERY.md step 2.
//
// #781: DELIVERY.md's "Freshness workflow (maintainer)" step 2 formerly claimed
// `--mode rebase` "copies net-new and content-drifted durable facts into
// docs/ai-memory/ and refreshes the seed MEMORY.md index." The implementation
// (`modeRebase()` in scripts/inspect/ai-memory-parity.mjs) does no such thing:
// it only runs `git rev-list --left-right --count trunk...ai-memory`, a branch-
// linearity check that copies zero files. These assertions pin the corrected
// doc so the false promise cannot silently return, and so the doc keeps
// describing `--mode rebase` as the git-linearity check it actually is.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DELIVERY = resolve(HERE, '../../../../docs/ai-memory/DELIVERY.md');
const IMPL = resolve(HERE, '../../../inspect/ai-memory-parity.mjs');

const doc = readFileSync(DELIVERY, 'utf8');
const impl = readFileSync(IMPL, 'utf8');

// Isolate the maintainer freshness workflow so assertions target the right prose.
function freshnessWorkflow(md) {
  const start = md.indexOf('## Freshness workflow (maintainer)');
  assert.notEqual(start, -1, 'DELIVERY.md must have a "Freshness workflow (maintainer)" section');
  const rest = md.slice(start + '## Freshness workflow (maintainer)'.length);
  const nextHeading = rest.search(/\n## /);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

test('AC1: DELIVERY.md no longer claims --mode rebase copies durable facts into the seed', () => {
  const wf = freshnessWorkflow(doc);
  // The exact false promise from the pre-#781 text.
  assert.ok(
    !/copies net-new and content-drifted durable facts into/i.test(wf),
    'DELIVERY.md still carries the false "copies net-new and content-drifted durable facts" claim about --mode rebase'
  );
  // No runnable instruction to invoke --mode rebase as the seed-sync step.
  assert.ok(
    !/node scripts\/inspect\/ai-memory-parity\.mjs --mode rebase/.test(wf),
    'DELIVERY.md still presents `node ... --mode rebase` as a runnable seed-sync step'
  );
});

test('AC1: DELIVERY.md describes --mode rebase as the git branch-linearity check it is', () => {
  const wf = freshnessWorkflow(doc);
  assert.ok(
    /--mode rebase/.test(wf) && /branch-linearity|not behind `?trunk`?|git rev-list/i.test(wf),
    'DELIVERY.md must describe --mode rebase as a git branch-linearity / not-behind-trunk check'
  );
  // Description must match the real implementation: modeRebase runs exactly this.
  assert.ok(
    /git rev-list --left-right --count trunk\.\.\.ai-memory/.test(wf),
    'DELIVERY.md must cite the actual git rev-list command --mode rebase runs'
  );
  assert.ok(
    /rev-list.*--left-right.*--count.*trunk\.\.\.ai-memory/s.test(impl),
    'guard invariant: modeRebase() must still run the cited git rev-list command'
  );
});

test('AC2: the workflow documents the real manual live→seed catch-up + AT PARITY end-state', () => {
  const wf = freshnessWorkflow(doc);
  // The catch-up is explicitly manual ("by hand" copy).
  assert.ok(
    /by hand|manual/i.test(wf),
    'DELIVERY.md must document the seed catch-up as a manual copy'
  );
  // The documented end-state check is the real command, and it is --mode diff.
  assert.ok(
    /--mode diff[\s\S]{0,80}AT PARITY|AT PARITY[\s\S]{0,80}--mode diff|confirm `?=> AT PARITY`?/i.test(
      wf
    ),
    'DELIVERY.md must document re-running --mode diff to confirm => AT PARITY as the end state'
  );
});
