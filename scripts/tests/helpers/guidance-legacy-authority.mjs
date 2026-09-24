// @story #1655
import { createHash } from 'node:crypto';

function clone(value) {
  return structuredClone(value);
}

function merge(target, patch) {
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = merge({ ...(target[key] ?? {}) }, value);
    } else {
      target[key] = clone(value);
    }
  }
  return target;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])])
  );
}

function digest(value) {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex')}`;
}

function accessIdentity(access) {
  return {
    id: access.id,
    resource: access.resource,
    subject: access.subject,
    page: access.page ?? 1,
    attempt: access.attempt ?? 1,
  };
}

function assertIdentity(kind, expected, actual) {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(
      `${kind} mismatch; expected ${JSON.stringify(expected)}, observed ${JSON.stringify(actual)}`
    );
  }
}

function authorityValue(state, access) {
  switch (access.resource) {
    case 'issue':
      return state.issue;
    case 'board':
      return state.board;
    case 'approval':
      return state.approvals;
    case 'pull-request':
      return state.pullRequest;
    case 'provider':
      return state.provider;
    case 'verification':
      return state.verification;
    case 'dependency':
      return state.dependencies;
    default:
      throw new Error(`unknown authority resource: ${access.resource}`);
  }
}

export function createLegacyAuthorityStore({ fixture, scenario }) {
  if (fixture.schema !== 'aitm.guidance-legacy-authority-store/v1') {
    throw new Error(`unsupported authority fixture schema: ${fixture.schema}`);
  }
  if (!scenario?.action || !scenario?.outcome) throw new Error('invalid lifecycle scenario');
  const initialState = merge(clone(fixture.initialState), scenario.initialStatePatch);
  merge(initialState, scenario.authorityPatch);
  const state = clone(initialState);
  const authorityAccesses = [];
  const transports = [];
  const effects = [];
  const expectedAccesses = scenario.expectedAuthorityAccesses ?? [];
  const expectedTransports = scenario.expectedTransport ?? [];

  return {
    snapshot: () => clone(state),
    read(access) {
      const expected = expectedAccesses[authorityAccesses.length];
      if (!expected)
        throw new Error(`extra authority access: ${JSON.stringify(accessIdentity(access))}`);
      const expectedIdentity = accessIdentity(expected);
      const actualIdentity = accessIdentity(access);
      assertIdentity('authority access', expectedIdentity, actualIdentity);
      authorityAccesses.push({ sequence: authorityAccesses.length + 1, ...actualIdentity });
      return clone(authorityValue(state, access));
    },
    observeTransport(transport) {
      const expected = expectedTransports[transports.length];
      if (!expected) throw new Error(`extra transport request: ${transport.id}`);
      assertIdentity('transport request', { id: expected.id }, { id: transport.id });
      transports.push({ sequence: transports.length + 1, requestId: expected.id });
      if (!expected.mutation) return;
      if (authorityAccesses.length !== expectedAccesses.length) {
        throw new Error(
          `mutation transport ${expected.id} arrived before authority reads reconciled`
        );
      }
      if (scenario.outcome !== 'success') {
        throw new Error(`refusal scenario ${scenario.id} declared a mutation`);
      }
      const beforeDigest = digest(state);
      merge(state, expected.mutation);
      effects.push({
        sequence: effects.length + 1,
        action: scenario.action,
        transportRequestId: expected.id,
        beforeDigest,
        afterDigest: digest(state),
        patch: clone(expected.mutation),
      });
    },
    finish() {
      if (authorityAccesses.length !== expectedAccesses.length) {
        throw new Error(
          `authority accesses do not reconcile; expected ${expectedAccesses.length}, observed ${authorityAccesses.length}`
        );
      }
      if (transports.length !== expectedTransports.length) {
        throw new Error(
          `transport ledger does not reconcile; expected ${expectedTransports.length}, observed ${transports.length}`
        );
      }
      if (effects.length !== (scenario.expectedEffects ?? 0)) {
        throw new Error(
          `effect ledger does not reconcile; expected ${scenario.expectedEffects ?? 0}, observed ${effects.length}`
        );
      }
      if (scenario.outcome === 'refusal' && digest(state) !== digest(initialState)) {
        throw new Error(`refused action ${scenario.id} changed authority state`);
      }
      return {
        initialState: clone(initialState),
        finalState: clone(state),
        initialDigest: digest(initialState),
        finalDigest: digest(state),
        authorityAccesses: clone(authorityAccesses),
        transports: clone(transports),
        effects: clone(effects),
      };
    },
  };
}

export function replayLegacyAuthorityCapture({
  fixture,
  scenario,
  transportLedger,
  authorityAccesses = scenario.expectedAuthorityAccesses,
}) {
  const expectedIds = (scenario.expectedTransport ?? []).map(({ id }) => id);
  const observedIds = transportLedger.map(({ requestId }) => requestId);
  if (JSON.stringify(expectedIds) !== JSON.stringify(observedIds)) {
    throw new Error(
      `transport ledger does not reconcile; expected ${expectedIds.join(', ')}, observed ${observedIds.join(', ')}`
    );
  }
  const store = createLegacyAuthorityStore({ fixture, scenario });
  for (const access of authorityAccesses ?? []) store.read(access);
  for (const expected of scenario.expectedTransport ?? []) store.observeTransport(expected);
  return store.finish();
}

export function attachLegacyAuthorityCapture({
  capture,
  fixture,
  authorityScenario,
  requestDeclarations,
}) {
  if (!fixture || !authorityScenario) return capture;
  const observedAuthorityAccesses = capture.transportLedger.flatMap((row) => {
    const declaration = requestDeclarations.find(({ id }) => id === row.requestId);
    if (!declaration) throw new Error(`missing request declaration for ${row.requestId}`);
    return declaration.authorityAccesses ?? [];
  });
  const authority = replayLegacyAuthorityCapture({
    fixture,
    scenario: authorityScenario,
    transportLedger: capture.transportLedger,
    authorityAccesses: observedAuthorityAccesses,
  });
  return {
    ...capture,
    initialAuthorityState: authority.initialState,
    finalAuthorityState: authority.finalState,
    authorityAccesses: authority.authorityAccesses,
    authorityEffects: authority.effects,
    authorityDigests: {
      initial: authority.initialDigest,
      final: authority.finalDigest,
    },
  };
}
