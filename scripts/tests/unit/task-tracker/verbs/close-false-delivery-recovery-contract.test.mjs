#!/usr/bin/env node
// @story #1635

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  parseFalseDeliveryCloseRecoveryArgs,
  resolveFalseDeliveryActor,
} from '../../../../task-tracker/verbs/close.mjs';

test('production actor resolution dereferences @me through GitHub', async () => {
  assert.equal(
    await resolveFalseDeliveryActor({
      cfg: { assignee: '@me' },
      pexec: async () => ({ stdout: 'kburson\n' }),
    }),
    'kburson'
  );
  assert.equal(
    await resolveFalseDeliveryActor({ cfg: { assignee: 'maintainer' }, pexec: async () => null }),
    'maintainer'
  );
});

test('requires the complete false-delivery flag group and rejects incompatible close modes', () => {
  assert.deepEqual(
    parseFalseDeliveryCloseRecoveryArgs([
      '#1624',
      '--restart-false-delivery-transaction',
      '--audit-issue',
      '1633',
      '--recovery-issue',
      '1635',
    ]),
    { enabled: true, auditIssueNumber: 1633, recoveryIssueNumber: 1635 }
  );
  assert.deepEqual(parseFalseDeliveryCloseRecoveryArgs(['#1624']), {
    enabled: false,
    auditIssueNumber: null,
    recoveryIssueNumber: null,
  });
  for (const rest of [
    ['#1624', '--restart-false-delivery-transaction'],
    ['#1624', '--restart-false-delivery-transaction', '--audit-issue', '1633'],
    [
      '#1624',
      '--restart-false-delivery-transaction',
      '--audit-issue',
      '1633',
      '--recovery-issue',
      '1635',
      '--force',
    ],
    [
      '#1624',
      '--restart-false-delivery-transaction',
      '--audit-issue',
      '1633',
      '--recovery-issue',
      '1635',
      '--restart-reopened-transaction',
    ],
  ]) {
    assert.throws(
      () => parseFalseDeliveryCloseRecoveryArgs(rest),
      /false-delivery-close-recovery:incompatible-flags/
    );
  }
});
