// @story #1562
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { buildDeliveryGateRefusal } from '../../../../task-tracker/verbs/close.mjs';

test('names the reconciliation lane so it is discoverable from the refusal', () => {
  const message = buildDeliveryGateRefusal('#680', 'close-delivery-receipt:missing');
  assert.match(message, /--reconcile-merge-method/);
  assert.match(message, /--reason/);
  assert.match(message, /delivery-verification:merge-method/);
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
