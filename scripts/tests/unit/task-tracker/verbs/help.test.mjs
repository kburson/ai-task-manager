// @story #1381
import assert from 'node:assert/strict';
import test from 'node:test';

import { VERB_REFERENCE } from '../../../../task-tracker/verbs/help-data.mjs';
import { VERB_CONTRACTS } from '../../../../task-tracker/lib/command-surface/catalog.mjs';

test('deliver help and catalog describe current-head and historical recovery modes exactly', () => {
  const summary = VERB_REFERENCE.deliver.summary;
  const effects = VERB_CONTRACTS.deliver.effects.join(' ');
  assert.match(summary, /accepted SHA/i);
  assert.match(summary, /open current-head provider handoff/i);
  assert.match(summary, /already-merged current-head external recovery/i);
  assert.match(summary, /advanced-head historical receipt recovery/i);
  assert.match(summary, /recovery emits no provider action/i);
  assert.match(VERB_CONTRACTS.deliver.preconditions.join(' '), /exact accepted-head/i);
  assert.match(effects, /open current-head pull request[\s\S]*sanctioned provider action/i);
  assert.match(
    effects,
    /already-merged current-head pull request[\s\S]*external intent and receipt[\s\S]*no provider action/i
  );
  assert.match(
    effects,
    /advanced local head[\s\S]*historical receipt recovery[\s\S]*prior accepted-SHA intent[\s\S]*no provider action/i
  );
  assert.match(VERB_CONTRACTS.deliver.output.join(' '), /AITM_DELIVERY_RESULT/);
});

test('close help distinguishes Incorporated owner assertion from duplicate and incident-epic use', () => {
  assert.match(VERB_REFERENCE.close.usage, /incorporated/);
  const asFlag = VERB_REFERENCE.close.flags.find(({ flag }) => flag.startsWith('--as'));
  const ofFlag = VERB_REFERENCE.close.flags.find(({ flag }) => flag === '--of <N>');
  assert.match(asFlag.desc, /Incorporated/);
  assert.match(ofFlag.desc, /incident owner/);
  assert.ok(VERB_REFERENCE.close.examples.includes('/task close 1403 --as incorporated --of 1381'));
  assert.ok(VERB_REFERENCE.close.examples.includes('/task close 939 --of 1381'));
  assert.match(VERB_REFERENCE.close.summary, /already-closed/i);
  assert.match(VERB_CONTRACTS.close.preconditions.join(' '), /approved incident ledger/i);
  assert.match(VERB_CONTRACTS.close.effects.join(' '), /partial terminal recovery/i);
  assert.match(VERB_CONTRACTS.close.effects.join(' '), /already-closed[\s\S]*read-only/i);
});

test('close help exposes the audited stale pre-terminal transaction restart contract', () => {
  assert.match(VERB_REFERENCE.close.usage, /--restart-stale-transaction/);
  const restart = VERB_REFERENCE.close.flags.find(
    ({ flag }) => flag === '--restart-stale-transaction'
  );
  assert.match(restart.desc, /stale pre-terminal/i);
  assert.match(restart.desc, /fresh exact-SHA Test, Review, delivery/i);
  assert.match(restart.desc, /immutable supersession evidence/i);
  assert.ok(VERB_REFERENCE.close.examples.includes('/task close 1461 --restart-stale-transaction'));
  assert.match(VERB_CONTRACTS.close.preconditions.join(' '), /clean worktree/i);
  assert.match(VERB_CONTRACTS.close.effects.join(' '), /audit.*before.*protected marker/i);
  assert.match(
    VERB_CONTRACTS.close.effects.join(' '),
    /terminal-boundary or conflicting evidence.*refuses before mutation/i
  );
});

test('incident-ledger help requires executable Incorporated carrier authority', () => {
  const preconditions = VERB_CONTRACTS['incident-ledger'].preconditions.join(' ');
  const effects = VERB_CONTRACTS['incident-ledger'].effects.join(' ');
  assert.match(preconditions, /Incorporated row[\s\S]*carrier pull request[\s\S]*on-trunk/i);
  assert.match(effects, /human ledger approval[\s\S]*Incorporated terminal disposition/i);
  assert.match(effects, /durable issue-local authority[\s\S]*retries/i);
});
