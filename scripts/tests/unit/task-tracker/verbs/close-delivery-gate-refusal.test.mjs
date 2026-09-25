// @story #1562
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  buildDeliveryGateRefusal,
  formatCloseDeliveryDisclosure,
} from '../../../../task-tracker/verbs/close.mjs';

test('names the reconciliation lane so it is discoverable from the refusal', () => {
  const message = buildDeliveryGateRefusal('#680', 'delivery-verification:merge-method');
  assert.match(message, /--reconcile-merge-method/);
  assert.match(message, /--reason/);
  assert.match(message, /delivery-verification:merge-method/);
});

test('pending intent guidance points to waiver preparation without advertising reconciliation', () => {
  const message = buildDeliveryGateRefusal('#680', 'close-delivery-receipt:missing');
  assert.match(message, /workflow-exception prepare/);
  assert.doesNotMatch(message, /--reconcile-merge-method/);
});

test('still carries the original deliver-then-retry guidance', () => {
  const message = buildDeliveryGateRefusal('#680', 'close-delivery-receipt:missing');
  assert.match(message, /verified exact-head receipt/);
});

test('surfaces the close target and the underlying reason verbatim', () => {
  const message = buildDeliveryGateRefusal('#1562', 'some-underlying:reason');
  assert.match(message, /#1562/);
  assert.match(message, /some-underlying:reason/);
});

test('does not advertise --force as an escape from this gate', () => {
  // `--force` does not reach `refuseDeliveryGate`; suggesting it would send an
  // operator down the dead end that stranded #680.
  const message = buildDeliveryGateRefusal('#680', 'close-delivery-receipt:missing');
  assert.equal(/--force/.test(message), false);
});

test('close success distinguishes generic and attribution waivers from ordinary delivery', () => {
  assert.equal(
    formatCloseDeliveryDisclosure({ schema: 'aitm.delivery-receipt/v1', result: 'delivered' }),
    ''
  );
  assert.match(
    formatCloseDeliveryDisclosure({
      schema: 'aitm.delivery-receipt/v3',
      attributionDisposition: 'waived',
    }),
    /attribution waived/
  );
  assert.match(
    formatCloseDeliveryDisclosure({
      schema: 'aitm.delivery-receipt/v4',
      result: 'waived',
      observedFailureCategory: 'merge-method',
      waivedRequirementId: 'delivery.verification.merge-method',
    }),
    /merge-method.*delivery\.verification\.merge-method/
  );
});
