import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateConfig } from '../../src/config/load.mjs';
import { resolveSelection } from '../../src/startup/selection.mjs';
import { selectRuntime } from '../../src/startup/runtime.mjs';

const FAMILIES = Object.freeze({
  codex: { provider: 'openai', host: 'codex' },
  claude: { provider: 'anthropic', host: 'claude-code' },
  grok: { provider: 'xai', host: 'grok' },
});

function author(selector, source = 'runtime') {
  const family = FAMILIES[selector];
  return { ...family, identity_source: source, session_fingerprint: `sha256:${selector}` };
}

function adapters({ resolveModel } = {}) {
  return Object.fromEntries(
    Object.keys(FAMILIES).map((selector) => [
      selector,
      {
        resolveModel:
          resolveModel ??
          (async ({ model, effort }) => ({
            model_id: model,
            model_display: `${selector}:${model}`,
            effort,
          })),
      },
    ])
  );
}

test('selection classifies every closed selector against every provider family', async () => {
  for (const [selector, selected] of Object.entries(FAMILIES)) {
    for (const [authorSelector, current] of Object.entries(FAMILIES)) {
      const resolved = await resolveSelection(
        { author: author(authorSelector), selector, model: `${selector}-model`, effort: 'high' },
        adapters()
      );
      assert.deepEqual(resolved, {
        selector,
        provider: selected.provider,
        host: selected.host,
        model_id: `${selector}-model`,
        model_display: `${selector}:${selector}-model`,
        effort: 'high',
        classification: current.provider === selected.provider ? 'SPR' : 'XPR',
      });
    }
  }
});

test('selection refuses unsupported families, unsupported model resolution, incomplete identity, and adapter substitution', async () => {
  for (const input of [
    { author: author('codex'), selector: 'other', model: 'm' },
    { author: { provider: 'other', host: 'other' }, selector: 'codex', model: 'm' },
    { author: null, selector: 'claude', model: 'm' },
    { author: author('codex'), selector: 'google', model: 'm' },
    { author: { provider: 'openai', host: 'codex' }, selector: 'codex', model: 'm' },
    {
      author: { provider: 'openai', host: 'codex', identity_source: 'runtime' },
      selector: 'codex',
      model: 'm',
    },
    {
      author: { provider: 'openai', host: 'codex', session_fingerprint: 'sha256:codex' },
      selector: 'codex',
      model: 'm',
    },
    {
      author: {
        provider: 'openai',
        host: 'codex',
        identity_source: 'unrecognized',
        session_fingerprint: 'sha256:codex',
      },
      selector: 'codex',
      model: 'm',
    },
  ]) {
    await assert.rejects(
      resolveSelection(input, adapters()),
      (error) => error.code === 'APR_REVIEWER_SELECTION_UNSUPPORTED'
    );
  }
  await assert.rejects(
    resolveSelection(
      { author: author('codex'), selector: 'claude', model: 'unsupported', effort: 'medium' },
      adapters({
        resolveModel: async () => {
          throw new Error('unsupported model');
        },
      })
    ),
    (error) => error.code === 'APR_REVIEWER_SELECTION_UNSUPPORTED'
  );
  await assert.rejects(
    resolveSelection(
      { author: author('codex'), selector: 'claude', model: 'opus', effort: 'high' },
      adapters({
        resolveModel: async () => ({ model_id: 'opus', model_display: 'Opus', effort: 'low' }),
      })
    ),
    (error) => error.code === 'APR_REVIEWER_SELECTION_UNSUPPORTED'
  );
});

test('runtime refuses XPR native ownership and unproven same-family native ownership', () => {
  const nativeCapability = {
    provider: 'openai',
    host: 'codex',
    exact_session: true,
    transport_mode: 'resume-only',
    adapter_version: 'native/1',
  };
  assert.throws(
    () =>
      selectRuntime({
        selection: { selector: 'codex', provider: 'openai', host: 'codex', classification: 'XPR' },
        author: author('claude'),
        requestedTransport: 'resume-only',
        policy: {},
        capabilities: { native: [nativeCapability] },
      }),
    (error) => error.code === 'APR_TRANSPORT_UNAVAILABLE'
  );
  assert.deepEqual(
    selectRuntime({
      selection: { selector: 'codex', provider: 'openai', host: 'codex', classification: 'XPR' },
      author: author('claude'),
      requestedTransport: 'resume-only',
      policy: {},
      capabilities: {
        native: [nativeCapability],
        broker: [{ transport_mode: 'resume-only', adapter_version: 'broker/1' }],
      },
    }),
    { ownership: 'broker', transport_mode: 'resume-only', adapter_version: 'broker/1' }
  );
  assert.throws(
    () =>
      selectRuntime({
        selection: { selector: 'codex', provider: 'openai', host: 'codex', classification: 'SPR' },
        author: author('codex'),
        requestedTransport: 'resume-only',
        policy: {},
        capabilities: { native: [{ ...nativeCapability, exact_session: false }] },
      }),
    (error) => error.code === 'APR_TRANSPORT_UNAVAILABLE'
  );
});

test('runtime fails closed when author assurance is missing or unsupported', () => {
  const selection = { selector: 'codex', provider: 'openai', host: 'codex', classification: 'SPR' };
  for (const incompleteAuthor of [
    { provider: 'openai', host: 'codex' },
    { provider: 'openai', host: 'codex', identity_source: 'runtime' },
    { provider: 'openai', host: 'codex', session_fingerprint: 'sha256:codex' },
    {
      provider: 'openai',
      host: 'codex',
      identity_source: 'unrecognized',
      session_fingerprint: 'sha256:codex',
    },
  ]) {
    assert.throws(
      () =>
        selectRuntime({
          selection,
          author: incompleteAuthor,
          requestedTransport: 'manual',
          policy: {},
          capabilities: { broker: [{ transport_mode: 'manual', adapter_version: 'broker/1' }] },
        }),
      (error) => error.code === 'APR_TRANSPORT_UNAVAILABLE'
    );
  }
});

test('runtime chooses only observed native or broker control in precedence order', () => {
  const selection = {
    selector: 'codex',
    provider: 'openai',
    host: 'codex',
    classification: 'SPR',
  };
  const native = selectRuntime({
    selection,
    author: author('codex'),
    requestedTransport: null,
    policy: { transport_mode: 'resume-only', startup_transport_preference: ['manual'] },
    capabilities: {
      native: [
        {
          provider: 'openai',
          host: 'codex',
          exact_session: true,
          transport_mode: 'resume-only',
          adapter_version: 'native/1',
        },
      ],
      broker: [{ transport_mode: 'manual', adapter_version: 'broker/1' }],
    },
  });
  assert.deepEqual(native, {
    ownership: 'native',
    transport_mode: 'resume-only',
    adapter_version: 'native/1',
  });

  const broker = selectRuntime({
    selection,
    author: author('codex'),
    requestedTransport: 'resume-only',
    policy: { transport_mode: 'manual' },
    capabilities: { broker: [{ transport_mode: 'resume-only', adapter_version: 'broker/2' }] },
  });
  assert.deepEqual(broker, {
    ownership: 'broker',
    transport_mode: 'resume-only',
    adapter_version: 'broker/2',
  });
});

test('runtime refuses unavailable automatic control and limits declared identity to manual broker control', () => {
  const selection = {
    selector: 'claude',
    provider: 'anthropic',
    host: 'claude-code',
    classification: 'SPR',
  };
  assert.throws(
    () =>
      selectRuntime({
        selection,
        author: author('claude', 'declared'),
        requestedTransport: 'automatic-required',
        policy: {},
        capabilities: {
          broker: [{ transport_mode: 'automatic-required', adapter_version: 'broker/1' }],
        },
      }),
    (error) => error.code === 'APR_TRANSPORT_UNAVAILABLE'
  );
  assert.deepEqual(
    selectRuntime({
      selection,
      author: author('claude', 'declared'),
      requestedTransport: null,
      policy: { startup_transport_preference: ['manual'] },
      capabilities: { broker: [{ transport_mode: 'manual', adapter_version: 'broker/1' }] },
    }),
    { ownership: 'broker', transport_mode: 'manual', adapter_version: 'broker/1' }
  );
});

test('startup transport preference is a closed ordered unique config list', () => {
  const config = validateConfig({
    schema: 'ai-peer-review.config/v1',
    review: { startup_transport_preference: ['resume-only', 'manual'] },
  });
  assert.deepEqual(config.review.startup_transport_preference, ['resume-only', 'manual']);
  for (const preference of [[], ['manual', 'manual'], ['manual', 'automatic']]) {
    assert.throws(
      () =>
        validateConfig({
          schema: 'ai-peer-review.config/v1',
          review: { startup_transport_preference: preference },
        }),
      (error) => error.code === 'APR_CONFIG_INVALID'
    );
  }
});
