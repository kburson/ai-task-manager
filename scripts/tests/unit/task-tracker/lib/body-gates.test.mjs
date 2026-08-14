#!/usr/bin/env node
// @story #32 #1183
// Tests for scripts/task-tracker/lib/body-gates.mjs
//   - ticked-without-section refuses
//   - unticked is allowed
//   - ticked-with-section passes
//   - section below minimum line count refuses
//   - multi-rule refusal lists every failing rule, not just the first
//   - verification-commands rule: vacuous when heading absent; fails when any unchecked under heading

import { strict as assert } from 'node:assert';
import { validateBody, DEFAULT_GATES } from '../../../../task-tracker/lib/body-gates.mjs';
import { repairDeepDivePlacementBody } from '../../../../task-tracker/lib/deep-dive.mjs';

// #325 — body-gates `deep-dive-complete` rule changed from
// `minNonEmptyLines: 20` to `minSectionChars: 2000`. Each generated line
// carries ~100 chars of substantive prose so 25 lines clears the threshold
// (~2500 chars) and 5 lines stays well below it (~500 chars).
function deepDiveSection(lines = 25) {
  const body = ['## Deep-Dive Analysis (2026-05-08)', ''];
  const filler =
    'of substantive analysis content describing how the proposed change interacts with the surrounding subsystem and its callers';
  for (let i = 0; i < lines; i++) body.push(`line ${i + 1} ${filler}.`);
  return body.join('\n');
}

// 1. deep-dive-complete marker without section refuses
{
  const body = [
    '## Acceptance Criteria',
    '<!-- aitm-deep-dive-complete: 2026-05-11T00:00:00Z -->',
    '- [ ] Implement thing',
  ].join('\n');
  const r = validateBody(body, { gates: DEFAULT_GATES });
  assert.equal(r.ok, false);
  const names = r.refusedRules.map((x) => x.rule);
  assert.ok(
    names.includes('deep-dive-complete'),
    `expected deep-dive-complete refusal, got: ${names.join(',')}`
  );
}

// 2. unticked Deep dive is allowed (gate doesn't fire)
{
  const body = ['## Acceptance Criteria', '- [ ] Deep dive complete'].join('\n');
  const r = validateBody(body, { gates: DEFAULT_GATES });
  assert.equal(r.ok, true, JSON.stringify(r));
}

// 3. ticked Deep dive with adequate section passes
{
  const body = [
    '## Acceptance Criteria',
    '- [x] Deep dive complete',
    '',
    '## Pickup Directive',
    '- [ ] Deep dive complete',
    '',
    deepDiveSection(25),
    '',
    '<!-- ai-task-manager:fields:start -->',
    '<!-- ai-task-manager:fields:end -->',
  ].join('\n');
  const r = validateBody(body, { gates: DEFAULT_GATES });
  assert.equal(r.ok, true, `expected ok, refused: ${JSON.stringify(r.refusedRules)}`);
}

// 3b. new-encoding marker also satisfies the deep-dive-placement boundary
{
  const body = [
    '## Acceptance Criteria',
    '- [x] Deep dive complete',
    '',
    '## Pickup Directive',
    '- [ ] Deep dive complete',
    '',
    deepDiveSection(25),
    '',
    '<!-- aitm-fields: {"schema":1,"values":{"size":"S"}} -->',
  ].join('\n');
  const r = validateBody(body, { gates: DEFAULT_GATES });
  assert.equal(
    r.ok,
    true,
    `expected ok with new encoding, refused: ${JSON.stringify(r.refusedRules)}`
  );
}

// 4. deep-dive-complete marker with section below minimum char threshold refuses
//    (#325 — was `line`, now `char(s) of substantive content`)
{
  const body = [
    '## Acceptance Criteria',
    '<!-- aitm-deep-dive-complete: 2026-05-11T00:00:00Z -->',
    '',
    deepDiveSection(5),
  ].join('\n');
  const r = validateBody(body, { gates: DEFAULT_GATES });
  assert.equal(r.ok, false);
  const dd = r.refusedRules.find((x) => x.rule === 'deep-dive-complete');
  assert.ok(dd, 'expected deep-dive-complete refusal');
  assert.match(dd.reason, /char/i);
}

// 5. multi-rule refusal lists every failing rule
{
  const body = [
    '## Acceptance Criteria',
    '<!-- aitm-deep-dive-complete: 2026-05-11T00:00:00Z -->',
    '- [x] Dependency Map',
  ].join('\n');
  const r = validateBody(body, { gates: DEFAULT_GATES });
  assert.equal(r.ok, false);
  const names = r.refusedRules.map((x) => x.rule);
  assert.ok(names.includes('deep-dive-complete'));
  assert.ok(names.includes('dependency-map'));
}

// 6. verification-commands: vacuous-pass when no heading
{
  const body = ['## Acceptance Criteria', '- [ ] Implement thing'].join('\n');
  const r = validateBody(body, { gates: DEFAULT_GATES });
  assert.equal(r.ok, true);
}

// 7. verification-commands: fails when any box unchecked under heading
{
  const body = [
    '## Verification Commands',
    '',
    '- [x] `node test1.mjs`',
    '- [ ] `node test2.mjs`',
    '',
    '## Other',
  ].join('\n');
  const r = validateBody(body, { gates: DEFAULT_GATES });
  assert.equal(r.ok, false);
  const vc = r.refusedRules.find((x) => x.rule === 'verification-commands');
  assert.ok(vc, 'expected verification-commands refusal');
}

// 8. verification-commands: passes when all checked under heading
{
  const body = [
    '## Verification Commands',
    '',
    '- [x] `node test1.mjs`',
    '- [x] `node test2.mjs`',
  ].join('\n');
  const r = validateBody(body, { gates: DEFAULT_GATES });
  assert.equal(r.ok, true, JSON.stringify(r));
}

// 8b. verification-commands: ignores lifecycle labels swept in from the
// sibling `### Definition of Done` → `#### Lifecycle` subsection (#195).
// `nextSectionEnd` stops only at `##`, so `### Verification Commands` scope
// overruns sibling `###` headings; the rule must filter `LIFECYCLE_LABEL_SET`.
{
  const body = [
    '### Verification Commands',
    '',
    '- [x] `npm test`',
    '- [x] `npm run lint`',
    '- [x] `npm run format:check`',
    '',
    '### Definition of Done',
    '',
    '#### Functional (verified at Test)',
    '',
    '- [x] All automated tests pass',
    '',
    '#### Lifecycle (auto-ticked at Review/Close)',
    '',
    '- [ ] Passed final human review',
    '- [ ] Story closed and moved to Done',
    '- [ ] Timing data flushed to issue',
  ].join('\n');
  const r = validateBody(body, { gates: DEFAULT_GATES });
  assert.equal(r.ok, true, JSON.stringify(r));
}

// 9. dependency-map: ticked with section passes
{
  const body = [
    '- [x] Dependency Map',
    '',
    '## Dependency Map',
    'Depends on: none',
    'Blocks: none',
  ].join('\n');
  const r = validateBody(body, { gates: DEFAULT_GATES });
  assert.equal(r.ok, true, JSON.stringify(r));
}

// 10. deep-dive-placement: correctly-ordered body (Pickup → Deep-Dive → fields-block) passes
{
  const body = [
    '## Scope',
    'stuff',
    '',
    '## Pickup Directive',
    '- [ ] Deep dive complete',
    '',
    deepDiveSection(25),
    '',
    '<!-- ai-task-manager:fields:start -->',
    '<!-- ai-task-manager:fields:end -->',
  ].join('\n');
  const r = validateBody(body, { gates: DEFAULT_GATES });
  assert.equal(r.ok, true, `expected ok, refused: ${JSON.stringify(r.refusedRules)}`);
}

// 11. deep-dive-placement: Deep-Dive heading BEFORE Pickup Directive refuses
{
  const body = [
    '## Scope',
    'stuff',
    '',
    deepDiveSection(25),
    '',
    '## Pickup Directive',
    '- [ ] Deep dive complete',
    '',
    '<!-- ai-task-manager:fields:start -->',
    '<!-- ai-task-manager:fields:end -->',
  ].join('\n');
  const r = validateBody(body, { gates: DEFAULT_GATES });
  assert.equal(r.ok, false);
  const dp = r.refusedRules.find((x) => x.rule === 'deep-dive-placement');
  assert.ok(
    dp,
    `expected deep-dive-placement refusal, got: ${r.refusedRules.map((x) => x.rule).join(',')}`
  );
  assert.match(dp.reason, /AFTER/);
}

// 12. deep-dive-placement: Deep-Dive heading AFTER fields-block start marker refuses
{
  const body = [
    '## Pickup Directive',
    '- [ ] Deep dive complete',
    '',
    '<!-- ai-task-manager:fields:start -->',
    '<!-- ai-task-manager:fields:end -->',
    '',
    deepDiveSection(25),
  ].join('\n');
  const r = validateBody(body, { gates: DEFAULT_GATES });
  assert.equal(r.ok, false);
  const dp = r.refusedRules.find((x) => x.rule === 'deep-dive-placement');
  assert.ok(
    dp,
    `expected deep-dive-placement refusal, got: ${r.refusedRules.map((x) => x.rule).join(',')}`
  );
  assert.match(dp.reason, /BEFORE/);
}

// 13. deep-dive-placement: vacuous pass when no Deep-Dive heading present
{
  const body = [
    '## Scope',
    'stuff',
    '',
    '## Pickup Directive',
    '- [ ] Deep dive complete',
    '',
    '<!-- ai-task-manager:fields:start -->',
    '<!-- ai-task-manager:fields:end -->',
  ].join('\n');
  const r = validateBody(body, { gates: DEFAULT_GATES });
  assert.equal(r.ok, true, `expected ok, refused: ${JSON.stringify(r.refusedRules)}`);
}

// 13b. #1183 repair output satisfies the existing placement gate without
// weakening or replacing that gate.
{
  const legacy = [
    '## Scope',
    'stuff',
    '',
    '<details>',
    '<summary>Legacy Deep-Dive</summary>',
    '',
    deepDiveSection(25),
    '',
    '</details>',
    '',
    '## Pickup Directive',
    '- [ ] Deep dive complete',
    '',
    '<!-- aitm-fields: {"schema":1,"values":{"size":"M"}} -->',
  ].join('\n');
  const repaired = repairDeepDivePlacementBody(legacy);
  const r = validateBody(repaired, { gates: DEFAULT_GATES });
  assert.equal(r.ok, true, `expected repaired body to pass: ${JSON.stringify(r.refusedRules)}`);
}

// 14. deep-dive-complete: size-bucketed floor — XS body with ~1400 chars passes
//     because XS floor is 1200, but the same body fails when size=M (floor 2400).
{
  // ~1400-char deep-dive section. deepDiveSection(13) → ~1400 chars (13 * ~108).
  const ddBody = deepDiveSection(13);
  const xsBody = [
    '## Pickup Directive',
    '',
    ddBody,
    '',
    '<!-- aitm-deep-dive-complete: 2026-06-06T00:00:00Z -->',
    '<!-- aitm-fields: {"schema":1,"values":{"size":"XS"}} -->',
  ].join('\n');
  const rXs = validateBody(xsBody, { gates: DEFAULT_GATES });
  assert.equal(rXs.ok, true, `XS should pass at ~1400 chars: ${JSON.stringify(rXs.refusedRules)}`);

  const mBody = xsBody.replace('"size":"XS"', '"size":"M"');
  const rM = validateBody(mBody, { gates: DEFAULT_GATES });
  assert.equal(rM.ok, false, 'M should refuse at ~1400 chars (floor 2400)');
  const dd = rM.refusedRules.find((x) => x.rule === 'deep-dive-complete');
  assert.ok(dd, 'expected deep-dive-complete refusal under M');
  assert.match(dd.reason, /minimum 2400/);
}

// 15. deep-dive-complete: missing size falls back to 2000 floor
{
  const body = [
    '## Pickup Directive',
    '',
    deepDiveSection(13),
    '',
    '<!-- aitm-deep-dive-complete: 2026-06-06T00:00:00Z -->',
    '<!-- aitm-fields: {"schema":1,"values":{}} -->',
  ].join('\n');
  const r = validateBody(body, { gates: DEFAULT_GATES });
  assert.equal(r.ok, false);
  const dd = r.refusedRules.find((x) => x.rule === 'deep-dive-complete');
  assert.match(dd.reason, /minimum 2000/);
}

// 16. verification-commands: a supplied normalized contract is authoritative
// even when the embedded legacy body reports every command checked.
{
  const body = ['## Verification Commands', '', '- [x] `npm test`'].join('\n');
  const contractSource = {
    contract: {
      verificationCommands: [
        { logicalId: 'vc-tests', command: 'npm test', checked: false },
        { logicalId: 'vc-lint', command: 'npm run lint', checked: true },
      ],
    },
  };
  const r = validateBody(body, { gates: DEFAULT_GATES, contractSource });
  assert.deepEqual(r, {
    ok: false,
    refusedRules: [
      {
        rule: 'verification-commands',
        reason: '1 unchecked item(s) under heading: npm test',
      },
    ],
  });
}

console.log('body-gates.test.mjs: all passed');
