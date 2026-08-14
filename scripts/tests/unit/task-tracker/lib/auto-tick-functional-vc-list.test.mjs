#!/usr/bin/env node
// @story #806
// #806 — the Functional branch of `autoTickVerified` (lib/auto-tick-verified.mjs)
// now resolves a Functional DoD line's `vc-list="vc:<n>"` citation against the
// issue's own `## Verification Commands` list before applying its AND-fan-in tick
// rule (parity with the AC branch, #803). A keyed Functional line ticks only once
// every resolved command has a passing sandbox result, and its `aitm-verified`
// marker is upserted in place with the run-props — the vc-list declaration is
// preserved, no sibling evidence marker is emitted.

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { autoTickVerified } from '../../../../task-tracker/lib/auto-tick-verified.mjs';
import { renderVcSection } from '../../../../task-tracker/lib/vc-emit.mjs';

const NOW = '2026-07-14T00:00:00.000Z';

// VC ids 1,2,3. A Functional subsection whose `tests` line cites a single id and
// whose `lint` line cites a two-id run.
function body() {
  const vc = renderVcSection(['node --test a.test.mjs', 'npm run lint', 'npm run format:check']);
  return [
    vc,
    '',
    '#### Functional (verified at Test)',
    '',
    '- [ ] tests green <!-- dod:functional:tests --> <!-- aitm-verified vc-list="vc:1" -->',
    '- [ ] lint + format clean <!-- dod:functional:lint --> <!-- aitm-verified vc-list="vc:2 vc:3" -->',
    '',
  ].join('\n');
}

test('#806 auto-tick flips a single-id vc-list Functional line on a passing sandbox (AC2)', () => {
  const results = [
    { command: 'node --test a.test.mjs', passed: true, exit: 0 },
    { command: 'npm run lint', passed: true, exit: 0 },
    { command: 'npm run format:check', passed: true, exit: 0 },
  ];
  const out = autoTickVerified(body(), results, NOW);

  const testsLine = out.body.split('\n').find((l) => l.includes('dod:functional:tests'));
  assert.match(testsLine, /^- \[x\]/, 'the tests DoD box is flipped to checked');
  // Execution proof upserted into the SAME marker; the vc-list declaration survives.
  assert.match(testsLine, /vc-list="vc:1"/, 'the vc-list declaration is preserved');
  assert.match(testsLine, /sha="sandbox"/, 'run-props record the sandbox sentinel');
  assert.match(testsLine, /exit="0"/, 'the passing exit code is recorded');
  assert.ok(
    out.tickedFunctional.some((t) => /tests green/.test(t)),
    'the tests line is reported as ticked'
  );
});

test('#806 auto-tick ticks a multi-id vc-list line only when every cited command passes (AC2/AC4)', () => {
  // vc:2 passes, vc:3 does NOT — the two-id line must stay unticked (AND-fan-in).
  const partial = [
    { command: 'node --test a.test.mjs', passed: true, exit: 0 },
    { command: 'npm run lint', passed: true, exit: 0 },
    // 'npm run format:check' absent / failing
  ];
  const out = autoTickVerified(body(), partial, NOW);
  const lintLine = out.body.split('\n').find((l) => l.includes('dod:functional:lint'));
  assert.match(lintLine, /^- \[ \]/, 'a partial pass leaves the multi-id line unchecked');

  // Now both pass — the line flips.
  const full = [...partial, { command: 'npm run format:check', passed: true, exit: 0 }];
  const out2 = autoTickVerified(body(), full, NOW);
  const lintLine2 = out2.body.split('\n').find((l) => l.includes('dod:functional:lint'));
  assert.match(lintLine2, /^- \[x\]/, 'both cited commands passing flips the line');
  assert.match(lintLine2, /vc-list="vc:2 vc:3"/, 'the multi-id declaration is preserved');
});

test('#806 auto-tick leaves a Functional line citing a nonexistent id untouched (malformed body, not evidence)', () => {
  const vc = renderVcSection(['node --test a.test.mjs']); // only id 1 exists
  const b = [
    vc,
    '',
    '#### Functional (verified at Test)',
    '',
    '- [ ] stale <!-- dod:functional:tests --> <!-- aitm-verified vc-list="vc:9" -->',
    '',
  ].join('\n');
  // Even with a fully-green result set, an unresolvable citation is caught and
  // treated as "no commands" — the box stays unchecked rather than crashing.
  const out = autoTickVerified(
    b,
    [{ command: 'node --test a.test.mjs', passed: true, exit: 0 }],
    NOW
  );
  const line = out.body.split('\n').find((l) => l.includes('dod:functional:tests'));
  assert.match(line, /^- \[ \]/, 'an unresolvable vc-list citation ticks nothing');
});
