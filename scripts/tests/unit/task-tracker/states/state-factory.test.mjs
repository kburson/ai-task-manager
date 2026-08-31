#!/usr/bin/env node
// @story #1117 #1450

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as lifecyclePolicy from '../../../../task-tracker/lib/lifecycle-policy/index.mjs';
import {
  InvalidStateDefinitionError,
  buildMethodIndex,
  createStateMachine,
  validateStateMethod,
} from '../../../../task-tracker/lib/state-factory.mjs';

const sharedGuard = Object.freeze({
  id: 'shared-guard',
  run: async () => ({ ok: true }),
});
const sharedAction = Object.freeze({
  id: 'shared-action',
  serialization: 'correlation',
  verify: async () => ({ status: 'incomplete', reason: 'missing' }),
  run: async () => ({ status: 'paused', reason: 'test-yield' }),
});

function definitionsUsing(guard = sharedGuard, action = sharedAction) {
  return lifecyclePolicy.stateIds().map((id) => ({
    id,
    entryGuards: id === 'test' ? [guard] : [],
    residentActions: id === 'test' ? [action] : [],
    exitGuards: id === 'review' ? [guard] : [],
  }));
}

function replaceDefinition(definitions, stateId, mutate) {
  return definitions.map((definition) =>
    definition.id === stateId ? mutate({ ...definition }) : { ...definition }
  );
}

function expectCode(code, operation) {
  assert.throws(
    operation,
    (error) =>
      error instanceof InvalidStateDefinitionError &&
      error.code === code &&
      Object.isFrozen(error.details)
  );
}

describe('state factory', () => {
  it('freezes copied containers while preserving direct method references', () => {
    const machine = createStateMachine({
      definitions: definitionsUsing(),
      policy: lifecyclePolicy,
    });

    assert.deepEqual(machine.order, lifecyclePolicy.stateIds());
    assert.equal(machine.get('test').entryGuards[0], sharedGuard);
    assert.equal(machine.get('test').residentActions[0], sharedAction);
    assert.equal(machine.get('review').exitGuards[0], sharedGuard);
    assert.equal(machine.methodById['shared-guard'], sharedGuard);
    assert.equal(machine.methodById['shared-action'], sharedAction);
    assert.equal(machine.get('ready for planning').id, 'ready-for-plan');
    assert.equal(machine.previous('ready-for-plan'), 'refine');
    assert.equal(machine.next('test'), lifecyclePolicy.forwardTarget('test'));
    assert.deepEqual(machine.backwardTargets('review'), lifecyclePolicy.backwardTargets('review'));

    for (const value of [
      machine,
      machine.order,
      machine.byId,
      machine.methodById,
      machine.get('test'),
      machine.get('test').entryGuards,
      machine.get('test').residentActions,
      machine.get('review').exitGuards,
    ]) {
      assert.equal(Object.isFrozen(value), true);
    }
    assert.throws(() => machine.get('test').residentActions.push(sharedAction), TypeError);
    assert.throws(() => machine.order.reverse(), TypeError);
    assert.throws(() => machine.get('missing'), /unknown state/);
  });

  it('validates guard and resident-action contracts', () => {
    assert.equal(validateStateMethod(sharedGuard, 'guard'), sharedGuard);
    assert.equal(validateStateMethod(sharedAction, 'resident-action'), sharedAction);

    expectCode('unknown-method-contract', () =>
      validateStateMethod({ id: 'guard-without-run' }, 'guard')
    );
    expectCode('unknown-method-contract', () =>
      validateStateMethod(
        { id: 'action', serialization: 'correlation', run() {} },
        'resident-action'
      )
    );
    expectCode('resident-action-serialization', () =>
      validateStateMethod(
        { id: 'action', serialization: 'global', verify() {}, run() {} },
        'resident-action'
      )
    );
    expectCode('resident-action-id', () =>
      validateStateMethod(
        { id: 'UPPER', serialization: 'issue-lock', verify() {}, run() {} },
        'resident-action'
      )
    );
    expectCode('guard-id', () =>
      validateStateMethod({ id: `a${'b'.repeat(96)}`, run() {} }, 'guard')
    );
  });

  it('rejects duplicate, drifted, malformed, and oversized definitions', () => {
    const base = definitionsUsing();

    expectCode('duplicate-state-id', () =>
      createStateMachine({
        definitions: base
          .map((definition, index) =>
            index === 2 ? { ...definition, id: 'Ready For Planning' } : definition
          )
          .concat({ ...base[2], id: '  READY FOR PLANNING  ' }),
        policy: lifecyclePolicy,
      })
    );
    expectCode('state-order-mismatch', () =>
      createStateMachine({ definitions: [...base].reverse(), policy: lifecyclePolicy })
    );
    expectCode('duplicate-method-id', () =>
      createStateMachine({
        definitions: replaceDefinition(base, 'test', (definition) => ({
          ...definition,
          residentActions: [sharedAction, sharedAction],
        })),
        policy: lifecyclePolicy,
      })
    );
    expectCode('unknown-method-contract', () =>
      createStateMachine({
        definitions: replaceDefinition(base, 'test', (definition) => ({
          ...definition,
          residentActions: [{ id: 'broken', serialization: 'correlation', run() {} }],
        })),
        policy: lifecyclePolicy,
      })
    );
    expectCode('resident-action-definition-cap', () =>
      createStateMachine({
        definitions: replaceDefinition(base, 'test', (definition) => ({
          ...definition,
          residentActions: Array.from({ length: 97 }, (_, index) => ({
            id: `action-${index}`,
            serialization: 'correlation',
            verify() {},
            run() {},
          })),
        })),
        policy: lifecyclePolicy,
      })
    );
  });

  it('rejects one diagnostic method ID bound to different references', () => {
    const first = Object.freeze({ id: 'conflict', run() {} });
    const second = Object.freeze({ id: 'conflict', run() {} });
    const definitions = replaceDefinition(definitionsUsing(), 'test', (definition) => ({
      ...definition,
      entryGuards: [first],
      exitGuards: [second],
    }));
    expectCode('method-id-reference-conflict', () => buildMethodIndex(definitions));
    expectCode('method-id-reference-conflict', () =>
      createStateMachine({ definitions, policy: lifecyclePolicy })
    );
  });

  it('validates every policy edge before exposing the machine', () => {
    const rejectingPolicy = {
      ...lifecyclePolicy,
      validateExecutableTransition(from, to) {
        if (from === 'plan' && to === 'develop') return { ok: false, reason: 'test refusal' };
        return lifecyclePolicy.validateExecutableTransition(from, to);
      },
    };
    expectCode('policy-edge-invalid', () =>
      createStateMachine({ definitions: definitionsUsing(), policy: rejectingPolicy })
    );
  });
});
