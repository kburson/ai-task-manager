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
const WORKFLOW = resolve(HERE, '../../../../docs/guides/workflow.md');
const ARCHITECTURE = resolve(HERE, '../../../../docs/guides/architecture-overview.md');
const SETTINGS = resolve(HERE, '../../../../docs/guides/settings-guide.md');
const DELIVER_IMPL = resolve(HERE, '../../../task-tracker/verbs/deliver.mjs');
const DELIVERY_PREFLIGHT = resolve(HERE, '../../../task-tracker/lib/delivery-preflight.mjs');

const doc = readFileSync(DELIVERY, 'utf8');
const impl = readFileSync(IMPL, 'utf8');
const workflow = readFileSync(WORKFLOW, 'utf8');
const architecture = readFileSync(ARCHITECTURE, 'utf8');
const settings = readFileSync(SETTINGS, 'utf8');
const deliverImpl = readFileSync(DELIVER_IMPL, 'utf8');
const deliveryPreflight = readFileSync(DELIVERY_PREFLIGHT, 'utf8');

function markdownSection(md, heading) {
  const start = md.indexOf(heading);
  assert.notEqual(start, -1, `missing section: ${heading}`);
  const rest = md.slice(start + heading.length);
  const nextHeading = rest.search(/\n###? /);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

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

test('#1381: workflow documents exact-head delivery, recovery, terminal modes, and retries', () => {
  const convergence = markdownSection(workflow, '### Governed delivery convergence');
  for (const anchor of [
    /Review → deliver → receipt → close/,
    /accepted SHA/i,
    /historical receipt recovery/i,
    /no\s+provider\s+action/i,
    /Incorporated/,
    /approved incident ledger/i,
    /concrete carrier[\s\S]*verified on-trunk/i,
    /human approval[\s\S]*fresh terminal authorization/i,
    /durable\s+issue-local authorization[\s\S]*retries/i,
    /--of/,
    /already-closed/i,
    /partial terminal recovery/i,
  ]) {
    assert.match(convergence, anchor);
  }
  assert.match(
    workflow,
    /Delivered[\s\S]*Incorporated[\s\S]*Replaced[\s\S]*Discarded[\s\S]*Duplicate/
  );
  assert.match(
    workflow,
    /cumulative inclusion[\s\S]{0,160}(?:not|never)[\s\S]{0,120}delivery receipt/i
  );
});

test('#1381: delivery guide matches all three executable operational cases', () => {
  const convergence = markdownSection(workflow, '### Governed delivery convergence');
  assert.match(convergence, /open current-head provider action/i);
  assert.match(
    convergence,
    /already-merged current-head external recovery[\s\S]{0,180}mode="current-head"[\s\S]{0,120}no action/i
  );
  assert.match(
    convergence,
    /advanced-head historical receipt recovery[\s\S]{0,220}mode="historical-recovery"[\s\S]{0,120}no\s+provider\s+action/i
  );
  const historical = convergence.slice(convergence.indexOf('**Advanced-head historical'));
  const historicalCase = historical.slice(0, historical.indexOf('\n\nBranch reuse'));
  assert.doesNotMatch(historicalCase, /proves?[\s\S]*required checks/i);
  assert.match(historicalCase, /does not reapply[\s\S]*required-check gate/i);

  const advancedBranch = deliverImpl.slice(
    deliverImpl.indexOf("if (authority.headRelation === 'advanced')"),
    deliverImpl.indexOf('const checks = await fetchRequiredChecks')
  );
  assert.match(advancedBranch, /mode: 'historical-recovery'/);
  assert.doesNotMatch(advancedBranch, /fetchRequiredChecks/);
  const mergedCurrentHead = deliverImpl.slice(
    deliverImpl.indexOf('if (mergedPullRequest) {'),
    deliverImpl.indexOf('if (initial.projection.matchingReceipt !== null)')
  );
  assert.match(mergedCurrentHead, /buildExternalIntentInput/);
  assert.match(mergedCurrentHead, /mode: 'current-head'/);
  assert.match(deliverImpl, /status: 'delivered'[\s\S]{0,160}action: null/);
});

test('#1381: architecture separates immutable authority, adapter time, and strict core time', () => {
  const authority = markdownSection(
    architecture,
    '### Delivery authority and incident reconciliation'
  );
  assert.match(authority, /accepted SHA/i);
  assert.match(authority, /exact accepted-head/i);
  assert.match(authority, /open current-head[\s\S]{0,120}provider action/i);
  assert.match(
    authority,
    /already-merged current-head[\s\S]{0,160}`current-head` receipt[\s\S]{0,80}no action/i
  );
  assert.match(
    authority,
    /advanced-head prior intent[\s\S]{0,160}`historical-recovery` receipt[\s\S]{0,80}no action/i
  );
  assert.match(authority, /approval provenance/i);
  assert.match(authority, /Full-Auto[\s\S]{0,180}(?:revalidated|revalidation|standing policy)/i);
  assert.match(authority, /adapter[\s\S]{0,120}timestamp normalization/i);
  assert.match(authority, /strict core parsing/i);
  assert.match(authority, /record readback/i);
  assert.match(authority, /reconciliation/i);
});

test('#1381: settings guide documents provider-action and incident-ledger authority', () => {
  const fullAuto = markdownSection(settings, '### `fullAutoMerge`');
  assert.match(fullAuto, /"mechanism": "provider-action"/);
  assert.match(fullAuto, /gh-auto-merge` is retired/i);
  assert.doesNotMatch(fullAuto, /"mechanism": "gh-auto-merge"/);
  assert.match(settings, /current-head provider action/i);
  assert.match(settings, /historical[\s\S]{0,100}no provider action/i);
  assert.match(settings, /approved incident ledger/i);
  assert.match(settings, /ledger ID/i);
  assert.match(settings, /canonical digest/i);
  assert.match(settings, /Full-Auto[\s\S]{0,180}(?:cannot|does not)[\s\S]{0,120}approve/i);
  assert.match(fullAuto, /provider-action only: merge \| squash/);
  assert.doesNotMatch(fullAuto, /provider-action only:[^\n]*rebase/);
  assert.match(fullAuto, /rebase[\s\S]{0,120}merge-method-unverifiable/i);
  assert.match(
    deliveryPreflight,
    /resolved\.mergeMethod === 'rebase'[\s\S]{0,80}merge-method-unverifiable/
  );
});
