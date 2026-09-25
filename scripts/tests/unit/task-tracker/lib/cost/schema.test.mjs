// @story #1733

import assert from 'node:assert/strict';
import test from 'node:test';

import { makeDiagnostic } from '../../../../../task-tracker/lib/cost/diagnostics.mjs';
import { validateCostPayload } from '../../../../../task-tracker/lib/cost/schema.mjs';
import {
  eventFixture,
  lineFixture,
  observationFixture,
} from '../../../../helpers/cost/fixtures.mjs';

test('baseline fixtures satisfy the closed cost payload contracts', () => {
  const payload = eventFixture();

  assert.equal(payload.issue, 1719);
  assert.equal(payload.occurredAt, '2026-09-21T00:00:00.000Z');
  assert.deepEqual(payload.lifecycle, {
    transition: 'develop:started',
    stage: 'develop',
    visit: 1,
    role: 'opening',
  });
  assert.deepEqual(payload.spans, []);
  assert.deepEqual(payload.money, []);
  assert.deepEqual(payload.diagnostics, []);
  assert.deepEqual(validateCostPayload('agent-cost-event', payload), payload);
  assert.deepEqual(
    validateCostPayload('source-observation', observationFixture()),
    observationFixture()
  );
  assert.deepEqual(validateCostPayload('cost-line', lineFixture()), lineFixture());
});

test('validation rejects unknown payload families, missing fields, unknown keys, and invalid counters', () => {
  const payload = eventFixture();

  assert.throws(
    () => validateCostPayload('agent-cost-event', { ...payload, authMode: 'local' }),
    /cost-schema:keys/
  );
  assert.throws(() => validateCostPayload('lifecycle-transition', payload), /cost-schema:kind/);
  assert.throws(() => {
    const { eventId: _eventId, ...missingEventId } = payload;
    return validateCostPayload('agent-cost-event', missingEventId);
  }, /cost-schema:keys/);
  assert.throws(
    () =>
      validateCostPayload(
        'source-observation',
        observationFixture({ native: [{ category: 'input_tokens', quantity: '-1' }] })
      ),
    /cost-schema:quantity/
  );
  assert.throws(
    () =>
      validateCostPayload(
        'source-observation',
        observationFixture({ native: [{ category: 'input_token', quantity: '1' }] })
      ),
    /cost-schema:native-category/
  );
});

test('safe native vocabulary and safe capability keys pass the unchanged secret policy', () => {
  assert.deepEqual(
    validateCostPayload(
      'source-observation',
      observationFixture({
        native: [
          { category: 'input_tokens', quantity: '1' },
          { category: 'cache_read_input_tokens', quantity: '0' },
          { category: 'cache_creation_input_tokens', quantity: '0' },
          { category: 'output_tokens', quantity: '2' },
          { category: 'reasoning_output_tokens', quantity: '3' },
        ],
        capability: { accessMode: 'local-file', runRef: 'safe-run-ref' },
      })
    ),
    observationFixture({
      native: [
        { category: 'input_tokens', quantity: '1' },
        { category: 'cache_read_input_tokens', quantity: '0' },
        { category: 'cache_creation_input_tokens', quantity: '0' },
        { category: 'output_tokens', quantity: '2' },
        { category: 'reasoning_output_tokens', quantity: '3' },
      ],
      capability: { accessMode: 'local-file', runRef: 'safe-run-ref' },
    })
  );

  assert.throws(
    () =>
      validateCostPayload(
        'source-observation',
        observationFixture({ capability: { dispatchRef: 'worker-1' } })
      ),
    /record-envelope:secret/
  );
});

test('canonical integer, decimal, zero, null, and unavailable states are distinct', () => {
  assert.deepEqual(
    validateCostPayload(
      'cost-line',
      lineFixture({
        quantity: '0',
        pricing: {
          status: 'available',
          currency: 'USD',
          unitPrice: '0.000001',
          amount: '0',
          rateCardRef: 'openai-2026-09-01',
        },
      })
    ),
    lineFixture({
      quantity: '0',
      pricing: {
        status: 'available',
        currency: 'USD',
        unitPrice: '0.000001',
        amount: '0',
        rateCardRef: 'openai-2026-09-01',
      },
    })
  );
  assert.deepEqual(validateCostPayload('cost-line', lineFixture()), lineFixture());

  assert.throws(
    () =>
      validateCostPayload(
        'cost-line',
        lineFixture({
          pricing: {
            status: 'available',
            currency: 'USD',
            unitPrice: null,
            amount: '0',
            rateCardRef: 'openai-2026-09-01',
          },
        })
      ),
    /cost-schema:decimal/
  );
  assert.throws(
    () => validateCostPayload('cost-line', lineFixture({ quantity: '01' })),
    /cost-schema:quantity/
  );
});

test('diagnostics are bounded references and rejected values are not echoed', () => {
  assert.deepEqual(makeDiagnostic({ code: 'native-category' }), {
    code: 'native-category',
    sourceId: null,
    eventId: null,
    recordRef: null,
  });
  assert.deepEqual(
    validateCostPayload(
      'source-observation',
      observationFixture({
        diagnostics: [
          makeDiagnostic({
            code: 'native-category',
            sourceId: 'src-codex-rollout',
            eventId: 'cost-event-develop-started',
            recordRef: 'obs-openai-usage-001',
          }),
        ],
      })
    ).diagnostics,
    [
      {
        code: 'native-category',
        sourceId: 'src-codex-rollout',
        eventId: 'cost-event-develop-started',
        recordRef: 'obs-openai-usage-001',
      },
    ]
  );

  assert.throws(
    () =>
      validateCostPayload(
        'source-observation',
        observationFixture({ native: [{ category: 'credential_dump', quantity: '1' }] })
      ),
    (error) => {
      assert.match(error.message, /cost-schema:native-category/);
      assert.doesNotMatch(error.message, /credential_dump/);
      return true;
    }
  );
});
