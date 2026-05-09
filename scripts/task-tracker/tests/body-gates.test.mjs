#!/usr/bin/env node
// Tests for scripts/task-tracker/lib/body-gates.mjs
//   - ticked-without-section refuses
//   - unticked is allowed
//   - ticked-with-section passes
//   - section below minimum line count refuses
//   - multi-rule refusal lists every failing rule, not just the first
//   - verification-commands rule: vacuous when heading absent; fails when any unchecked under heading

import { strict as assert } from 'node:assert';
import { validateBody, DEFAULT_GATES } from '../lib/body-gates.mjs';

function deepDiveSection(lines = 25) {
  const body = ['## Deep-Dive Analysis (2026-05-08)', ''];
  for (let i = 0; i < lines; i++) body.push(`line ${i + 1} of analysis content`);
  return body.join('\n');
}

// 1. ticked Deep dive without section refuses
{
  const body = [
    '## Acceptance Criteria',
    '- [x] Deep dive complete',
    '- [ ] Implement thing',
  ].join('\n');
  const r = validateBody(body, { gates: DEFAULT_GATES });
  assert.equal(r.ok, false);
  const names = r.refusedRules.map(x => x.rule);
  assert.ok(names.includes('deep-dive-complete'), `expected deep-dive-complete refusal, got: ${names.join(',')}`);
}

// 2. unticked Deep dive is allowed (gate doesn't fire)
{
  const body = [
    '## Acceptance Criteria',
    '- [ ] Deep dive complete',
  ].join('\n');
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

// 4. ticked Deep dive with section below minimum lines refuses
{
  const body = [
    '## Acceptance Criteria',
    '- [x] Deep dive complete',
    '',
    deepDiveSection(5),
  ].join('\n');
  const r = validateBody(body, { gates: DEFAULT_GATES });
  assert.equal(r.ok, false);
  const dd = r.refusedRules.find(x => x.rule === 'deep-dive-complete');
  assert.ok(dd, 'expected deep-dive-complete refusal');
  assert.match(dd.reason, /line/i);
}

// 5. multi-rule refusal lists every failing rule
{
  const body = [
    '## Acceptance Criteria',
    '- [x] Deep dive complete',
    '- [x] Dependency Map',
  ].join('\n');
  const r = validateBody(body, { gates: DEFAULT_GATES });
  assert.equal(r.ok, false);
  const names = r.refusedRules.map(x => x.rule);
  assert.ok(names.includes('deep-dive-complete'));
  assert.ok(names.includes('dependency-map'));
}

// 6. verification-commands: vacuous-pass when no heading
{
  const body = [
    '## Acceptance Criteria',
    '- [ ] Implement thing',
  ].join('\n');
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
  const vc = r.refusedRules.find(x => x.rule === 'verification-commands');
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
  const dp = r.refusedRules.find(x => x.rule === 'deep-dive-placement');
  assert.ok(dp, `expected deep-dive-placement refusal, got: ${r.refusedRules.map(x => x.rule).join(',')}`);
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
  const dp = r.refusedRules.find(x => x.rule === 'deep-dive-placement');
  assert.ok(dp, `expected deep-dive-placement refusal, got: ${r.refusedRules.map(x => x.rule).join(',')}`);
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

console.log('body-gates.test.mjs: all passed');
