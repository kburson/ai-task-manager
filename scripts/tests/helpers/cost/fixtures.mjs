// @story #1733

const FIXED_INSTANT = '2026-09-21T00:00:00.000Z';

function withOverrides(base, overrides) {
  return { ...base, ...overrides };
}

export function observationFixture(overrides = {}) {
  return withOverrides(
    {
      schema: 'aitm.cost-observation/v1',
      observationId: 'obs-openai-usage-001',
      sourceId: 'src-codex-rollout',
      eventId: 'cost-event-develop-started',
      observedAt: FIXED_INSTANT,
      provider: 'openai',
      adapter: 'codex-rollout-jsonl',
      status: 'available',
      native: [
        { category: 'input_tokens', quantity: '1234' },
        { category: 'cache_read_input_tokens', quantity: '120' },
        { category: 'cache_creation_input_tokens', quantity: '12' },
        { category: 'output_tokens', quantity: '321' },
        { category: 'reasoning_output_tokens', quantity: '45' },
      ],
      capability: { accessMode: 'local-file', runRef: 'rollout-2026-09-21-cost' },
      diagnostics: [],
    },
    overrides
  );
}

export function lineFixture(overrides = {}) {
  return withOverrides(
    {
      schema: 'aitm.cost-line/v1',
      lineId: 'line-input-tokens-001',
      eventId: 'cost-event-develop-started',
      observationId: 'obs-openai-usage-001',
      sourceId: 'src-codex-rollout',
      kind: 'measured-consumption',
      category: 'input',
      quantity: '1234',
      unit: 'tokens',
      pricing: {
        status: 'unavailable',
        currency: null,
        unitPrice: null,
        amount: null,
        rateCardRef: null,
      },
      diagnostics: [],
    },
    overrides
  );
}

export function eventFixture(overrides = {}) {
  return withOverrides(
    {
      schema: 'aitm.agent-cost-event/v1',
      policyId: 'cost-policy-v1',
      eventId: 'cost-event-develop-started',
      operationId: 'operation-develop-started',
      issue: 1719,
      occurredAt: FIXED_INSTANT,
      lifecycle: {
        transition: 'develop:started',
        stage: 'develop',
        visit: 1,
        role: 'opening',
      },
      sources: [
        {
          sourceId: 'src-codex-rollout',
          kind: 'codex-rollout-jsonl',
          label: 'Codex rollout transcript',
          accessMode: 'local-file',
          runRef: 'rollout-2026-09-21-cost',
        },
      ],
      observations: [observationFixture()],
      spans: [],
      money: [],
      diagnostics: [],
    },
    overrides
  );
}
