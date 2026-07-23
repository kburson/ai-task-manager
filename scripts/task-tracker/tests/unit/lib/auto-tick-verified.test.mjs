// @story #255
import assert from 'node:assert/strict';

import { autoTickVerified } from '../../../lib/auto-tick-verified.mjs';
import { parseVerificationCommands } from '../../../lib/verification-commands.mjs';

// ---------------------------------------------------------------------------
// Fixture: an issue body with a Verification Commands section and a DoD whose
// Functional items carry `aitm-verified cmd="..."` markers (command-backed) plus one
// judgment item with no marker, and a Lifecycle section that must never be
// touched here. (#468 retired the legacy `aitm-verified-by:` form.)
// ---------------------------------------------------------------------------
function fixtureBody() {
  return [
    '## Verification Commands',
    '',
    '- [ ] `npm test`',
    '- [ ] `npm run lint`',
    '- [ ] `npm run format:check`',
    '',
    '## Definition of Done',
    '',
    '#### Functional (verified at Test)',
    '',
    '- [ ] All automated tests pass <!-- aitm-verified cmd="`npm test`" -->',
    '- [ ] Lint/format pass <!-- aitm-verified cmd="`npm run lint` `npm run format:check`" -->',
    '- [ ] Acceptance criteria met',
    '',
    '#### Lifecycle (auto-ticked at Review/Close)',
    '',
    '- [ ] Passed final human review',
    '- [ ] Story closed',
    '',
  ].join('\n');
}

const ALL_GREEN = [
  { command: 'npm test', passed: true, exit: 0 },
  { command: 'npm run lint', passed: true, exit: 0 },
  { command: 'npm run format:check', passed: true, exit: 0 },
];

// --- all-green: VC boxes + command-backed Functional items ticked -----------
{
  const { body, tickedVc, tickedFunctional } = autoTickVerified(fixtureBody(), ALL_GREEN);
  assert.ok(body.includes('- [x] `npm test`'), 'npm test VC ticked');
  assert.ok(body.includes('- [x] `npm run lint`'), 'lint VC ticked');
  assert.ok(body.includes('- [x] `npm run format:check`'), 'format VC ticked');
  assert.ok(
    body.includes('- [x] All automated tests pass'),
    'npm test-backed Functional item ticked'
  );
  assert.ok(body.includes('- [x] Lint/format pass'), 'lint+format-backed Functional item ticked');
  assert.deepEqual(
    tickedVc.slice().sort(),
    ['npm run format:check', 'npm run lint', 'npm test'],
    'tickedVc reported'
  );
  assert.equal(tickedFunctional.length, 2, 'two Functional items reported');

  // #481 — VC entries have no declaration, so the upsert seeds cmd and records
  // the run in ONE consolidated marker: cmd → exit → sha → ts → evidence.
  assert.ok(
    body.includes('aitm-verified cmd="npm test" exit="0" sha="sandbox" ts='),
    'VC proof marker emits cmd/exit/sha/ts in canonical order'
  );
  assert.ok(!body.includes('verified-at='), 'no legacy verified-at key in stamped markers');
  assert.ok(!body.includes('proof="none"'), 'vestigial proof="none" sentinel dropped');
  // The Functional item already carried a `cmd` declaration; the upsert PRESERVES
  // it (backtick form) rather than re-seeding a bare joined cmd, and appends
  // run-props. No second aitm-verified marker on the line.
  assert.ok(
    body.includes('cmd="`npm run lint` `npm run format:check`" exit="0" sha="sandbox" ts='),
    'multi-command Functional declaration cmd preserved, run-props appended in place'
  );
  const lintLine = body.split('\n').find((l) => l.includes('Lint/format pass'));
  assert.equal(
    (lintLine.match(/aitm-verified/g) || []).length,
    1,
    'Functional line carries exactly one aitm-verified marker'
  );
}

// --- #382: stamped marker timestamp is the injected `now` -------------------
{
  const { body } = autoTickVerified(fixtureBody(), ALL_GREEN, '2026-06-12T17:30:00.000Z');
  assert.ok(
    body.includes('ts="2026-06-12T17:30:00.000Z"'),
    'ts carries the injected now timestamp'
  );
}

// --- judgment item (no marker) left unticked on green -----------------------
{
  const { body } = autoTickVerified(fixtureBody(), ALL_GREEN);
  assert.ok(
    body.includes('- [ ] Acceptance criteria met'),
    'judgment item with no command marker stays unticked'
  );
}

// --- Lifecycle section never touched ----------------------------------------
{
  const { body } = autoTickVerified(fixtureBody(), ALL_GREEN);
  assert.ok(body.includes('- [ ] Passed final human review'), 'lifecycle item untouched');
  assert.ok(body.includes('- [ ] Story closed'), 'lifecycle item untouched');
}

// --- Functional item whose command is NOT in results -> unticked ------------
{
  const onlyLint = [{ command: 'npm run lint', passed: true, exit: 0 }];
  const { body } = autoTickVerified(fixtureBody(), onlyLint);
  assert.ok(body.includes('- [x] `npm run lint`'), 'lint VC ticked');
  assert.ok(body.includes('- [ ] `npm test`'), 'absent-result VC stays unticked');
  assert.ok(
    body.includes('- [ ] All automated tests pass'),
    'item needing npm test (no result) stays unticked'
  );
  // Lint/format item needs BOTH lint AND format:check; format absent -> unticked.
  assert.ok(
    body.includes('- [ ] Lint/format pass'),
    'item needing all of multiple commands stays unticked when one is absent'
  );
}

// --- mixed/red: only passing VC boxes tick ----------------------------------
{
  const mixed = [
    { command: 'npm test', passed: false, exit: 1 },
    { command: 'npm run lint', passed: true, exit: 0 },
    { command: 'npm run format:check', passed: true, exit: 0 },
  ];
  const { body } = autoTickVerified(fixtureBody(), mixed);
  assert.ok(body.includes('- [ ] `npm test`'), 'failed VC box stays unticked');
  assert.ok(body.includes('- [x] `npm run lint`'), 'passing VC box ticked');
  assert.ok(body.includes('- [x] `npm run format:check`'), 'passing VC box ticked');
  assert.ok(
    body.includes('- [ ] All automated tests pass'),
    'item depending on failed command stays unticked'
  );
  assert.ok(
    body.includes('- [x] Lint/format pass'),
    'item whose commands all passed is ticked even amid other failures'
  );
}

// --- idempotent: second pass over an already-ticked body is a no-op ---------
{
  const once = autoTickVerified(fixtureBody(), ALL_GREEN);
  const twice = autoTickVerified(once.body, ALL_GREEN);
  assert.equal(twice.body, once.body, 'second pass leaves body unchanged');
  assert.equal(twice.tickedVc.length, 0, 'nothing newly ticked on second pass');
  assert.equal(twice.tickedFunctional.length, 0, 'no Functional newly ticked on second pass');
}

// --- empty results -> no ticks ----------------------------------------------
{
  const { body, tickedVc, tickedFunctional } = autoTickVerified(fixtureBody(), []);
  assert.equal(body, fixtureBody(), 'empty results leave body unchanged');
  assert.equal(tickedVc.length, 0, 'no VC ticked');
  assert.equal(tickedFunctional.length, 0, 'no Functional ticked');
}

// --- #481: a KEYED Functional line records run-props on its SINGLE
// aitm-verified marker — no sibling aitm-dod-evidence, no second aitm-verified.
{
  const keyedBody = [
    '## Verification Commands',
    '',
    '- [ ] `npm test`',
    '',
    '## Definition of Done',
    '',
    '### Functional (verified at Test)',
    '',
    '- [ ] All automated tests pass <!-- aitm-verified cmd="`npm test`" --> <!-- dod:functional:tests -->',
    '',
    '### Lifecycle (auto-ticked at Review/Close)',
    '',
    '- [ ] Passed final human review',
    '',
  ].join('\n');
  const greenTests = [{ command: 'npm test', passed: true, exit: 0 }];
  const { body } = autoTickVerified(keyedBody, greenTests, '2026-06-20T00:00:00Z');

  assert.ok(body.includes('- [x] All automated tests pass'), 'keyed Functional item ticked');

  // No sibling evidence marker anywhere — the form #481 collapsed.
  assert.equal(
    (body.match(/aitm-dod-evidence\b/g) || []).length,
    0,
    'no aitm-dod-evidence sibling marker emitted'
  );

  const funcLine = body.split('\n').find((l) => l.includes('All automated tests pass'));
  assert.ok(funcLine, 'functional line present');
  // Exactly one aitm-verified marker, carrying the declaration cmd AND run-props.
  assert.equal(
    (funcLine.match(/aitm-verified/g) || []).length,
    1,
    'keyed line carries exactly one aitm-verified marker'
  );
  assert.match(funcLine, /aitm-verified cmd="`npm test`"/, 'declaration cmd retained');
  assert.match(
    funcLine,
    /exit="0"[^>]*sha="sandbox"[^>]*ts="2026-06-20T00:00:00Z"/,
    'run-props recorded'
  );
  // The dod:functional tag stays separate (the key is NOT folded into the marker).
  assert.match(funcLine, /<!-- dod:functional:tests -->/, 'dod:functional locator tag untouched');
  assert.doesNotMatch(
    funcLine,
    /aitm-verified[^>]*key=/,
    'no functional key folded into the marker'
  );
}

// --- #719: a VC line carrying a trailing HTML comment must still auto-tick ---
// Regression: `parseVerificationCommands` (BACKTICK_CMD_RE, #368) extracts and
// runs a VC line that carries a trailing `<!-- ... -->` declaration, but the
// stricter `VC_LABEL_RE` in autoTickVerified failed to match it back, leaving a
// green command's box unticked. The two sites must agree on the same line shape.
{
  const cmd = 'node --test scripts/task-tracker/tests/unit/auto-tick-verified.test.mjs';
  const body = [
    '## Verification Commands',
    '',
    `- [ ] \`${cmd}\` <!-- aitm-verified cmd="\`${cmd}\`" exit="0" sha="sandbox" ts="2026-07-06T00:00:00Z" -->`,
    '',
  ].join('\n');

  // Precondition: the runner-side parser extracts the command from this line.
  const parsed = parseVerificationCommands(body);
  assert.equal(parsed.length, 1, 'parseVerificationCommands extracts the trailing-comment VC line');
  assert.equal(parsed[0].command, cmd, 'parser command matches');

  // AC1/AC2: autoTickVerified must extract the SAME command and flip the box.
  const { body: out, tickedVc } = autoTickVerified(
    body,
    [{ command: cmd, passed: true, exit: 0 }],
    '2026-07-06T00:00:00Z'
  );
  assert.deepEqual(tickedVc, [cmd], 'trailing-comment VC command ticked back');
  const line = out.split('\n').find((l) => l.includes(cmd));
  assert.ok(line.startsWith('- [x] '), 'trailing-comment VC box flipped to [x]');
}

// --- #719 AC3: the bare canonical VC form still auto-ticks (no regression) ---
{
  const body = ['## Verification Commands', '', '- [ ] `npm test`', ''].join('\n');
  const { body: out, tickedVc } = autoTickVerified(
    body,
    [{ command: 'npm test', passed: true, exit: 0 }],
    '2026-07-06T00:00:00Z'
  );
  assert.deepEqual(tickedVc, ['npm test'], 'bare VC command still ticked');
  assert.ok(out.includes('- [x] `npm test`'), 'bare VC box still flips to [x]');
}

// ---------------------------------------------------------------------------
// @story #803 — the AC auto-tick must honor the canonical `vc-list="vc:N"`
// citation (#774), not only the legacy `cmd="vc:N"` attribute. Before #803 the
// AC branch read only `props.cmd`, so a `vc-list`-cited AC was never ticked by a
// green sandbox and Develop→Test then refused with `code-complete-ac-unticked`.
// ---------------------------------------------------------------------------

// A shared body with two VCs and three ACs: one cites vc:1 via `vc-list`, one
// cites vc:2 via `vc-list`, and one cites vc:1 via the legacy `cmd` attribute.
function vcListFixture() {
  return [
    '## Verification Commands',
    '',
    '- [ ] `npm test` <!-- id=1 -->',
    '- [ ] `npm run lint` <!-- id=2 -->',
    '',
    '## Acceptance Criteria',
    '',
    '- [ ] vc-list-cited AC one <!-- aitm-verified vc-list="vc:1" -->',
    '- [ ] vc-list-cited AC two <!-- aitm-verified vc-list="vc:2" -->',
    '- [ ] cmd-cited AC three <!-- aitm-verified cmd="vc:1" -->',
    '',
  ].join('\n');
}

// AC1 — a `vc-list`-cited AC is auto-ticked when its referenced VC passed.
{
  const { body, tickedAc } = autoTickVerified(
    vcListFixture(),
    [
      { command: 'npm test', passed: true, exit: 0 },
      { command: 'npm run lint', passed: true, exit: 0 },
    ],
    '2026-07-13T00:00:00Z'
  );
  assert.ok(body.includes('- [x] vc-list-cited AC one'), 'vc-list AC (vc:1) ticked');
  assert.ok(body.includes('- [x] vc-list-cited AC two'), 'vc-list AC (vc:2) ticked');
  assert.ok(
    tickedAc.some((t) => t.includes('vc-list-cited AC one')),
    'tickedAc reports the vc-list AC'
  );
}

// AC2 — a `vc-list`-cited AC whose VC FAILED is left unticked (parity with the
// `cmd`-path negative case): vc:2 (lint) fails, so AC two stays `- [ ]`.
{
  const { body } = autoTickVerified(
    vcListFixture(),
    [
      { command: 'npm test', passed: true, exit: 0 },
      { command: 'npm run lint', passed: false, exit: 1 },
    ],
    '2026-07-13T00:00:00Z'
  );
  assert.ok(body.includes('- [x] vc-list-cited AC one'), 'passing vc-list AC (vc:1) ticked');
  assert.ok(body.includes('- [ ] vc-list-cited AC two'), 'failing vc-list AC (vc:2) left unticked');
}

// #804 — the ordinal `cmd="vc:N"` citation fallback is RETIRED. An AC that cites
// verification through the deprecated `cmd` attribute no longer resolves to a
// command, so a green sandbox does NOT auto-tick it (the canonical `vc-list`
// form is the only citation path). This AC would also be refused at the
// Refine→Plan gate — it must never reach a green-sandbox auto-tick in practice.
{
  const { body } = autoTickVerified(
    vcListFixture(),
    [
      { command: 'npm test', passed: true, exit: 0 },
      { command: 'npm run lint', passed: true, exit: 0 },
    ],
    '2026-07-13T00:00:00Z'
  );
  assert.ok(
    body.includes('- [ ] cmd-cited AC three'),
    'ordinal cmd="vc:1" AC no longer auto-ticks (fallback retired #804)'
  );
}

console.log('auto-tick-verified.test.mjs: all assertions passed');
