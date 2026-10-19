// @story #1855
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBlocker } from '../../../../task-tracker/lib/action-decision/contract.mjs';
import { withMemoryInterlock } from '../../../../task-tracker/lib/criteria-revision/store.mjs';
import { withRevisionConsumer } from '../../../../task-tracker/lib/criteria-revision/policy.mjs';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';
import { fixture } from '../../../helpers/criteria-revision-consumers.mjs';

function refused(error) {
  assert.equal(error.code, 'revision-authority-unavailable');
  assert.equal(error.status, 'indeterminate');
  assert.deepEqual(validateBlocker(error.blocker, { status: error.status }), error.blocker);
  return true;
}
// Direct public root under a genuine held stage frame; no original checkpoint
// operation is fabricated by this fixture.
for (const shape of ['own', 'inherited', 'nested-identity', 'nested-state']) {
  test(`native actor state root refuses ${shape} getters before record construction`, async () => {
    const { writeNativeStageActorTiming } =
      await import('../../../../task-tracker/lib/actor-timing-state.mjs');
    const sandbox = createSandbox();
    try {
      const { backend, context } = await fixture('empty', { worktree: sandbox.context.sourceRoot });
      await withMemoryInterlock(backend, context, (capability) =>
        withRevisionConsumer(
          {
            repository: context.repository,
            issue: context.issue,
            activity: 'stage-write',
            backend,
            capability,
          },
          async () => {
            const gets = [],
              identity = { provider: 'claude', sid: 'fixture-actor-root' },
              state = {};
            let operation = {
              kind: 'write-actor',
              identity,
              state,
              projDir: context.executor.worktree,
            };
            if (shape === 'own' || shape === 'inherited') {
              const target = shape === 'own' ? operation : {};
              if (shape === 'inherited') operation = Object.create(target);
              Object.defineProperties(target, {
                identity: {
                  enumerable: true,
                  configurable: true,
                  get() {
                    gets.push('identity');
                    return identity;
                  },
                },
                state: {
                  enumerable: true,
                  configurable: true,
                  get() {
                    gets.push('state');
                    return state;
                  },
                },
              });
            } else if (shape === 'nested-identity') {
              Object.defineProperty(identity, 'provider', {
                enumerable: true,
                configurable: true,
                get() {
                  gets.push('provider');
                  return 'claude';
                },
              });
            } else {
              Object.defineProperty(state, 'active', {
                enumerable: true,
                configurable: true,
                get() {
                  gets.push('active');
                  return '#124';
                },
              });
            }
            const snapshot = backend.snapshot,
              effects = structuredClone(backend.effects);
            let caught;
            try {
              await writeNativeStageActorTiming(Object.freeze({}), operation);
            } catch (error) {
              caught = error;
            }
            assert.deepEqual(backend.snapshot, snapshot);
            assert.deepEqual(backend.effects, effects);
            assert.deepEqual(gets, []);
            assert.ok(caught);
            refused(caught);
            assert.equal(caught.preparationReason, 'original-checkpoint-invocation');
          }
        )
      );
    } finally {
      sandbox.dispose();
    }
  });
}

// Direct exports are independent roots: the sequencer's fence cannot protect
// a caller that reaches an original leaf without the sequencer invocation.
for (const name of [
  'dispatchOnEnterActions',
  'refreshKanbanStateCache',
  'emitFullAutoReviewAudit',
  'unparkDoneDependents',
  'emitOutOfBandAudit',
  'syncTrackerState',
  'syncEventFields',
  'endTaskTracking',
]) {
  test(`actual tail leaf ${name} refuses public getters before selecting any callback`, async () => {
    const cache = await import('../../../../task-tracker/lib/move-state/cache-unpark.mjs');
    const audit = await import('../../../../task-tracker/lib/move-state/audit-timing.mjs');
    const original = cache[name] ?? audit[name];
    assert.equal(typeof original, 'function');
    const sandbox = createSandbox();
    try {
      const { backend, context } = await fixture('empty', { worktree: sandbox.context.sourceRoot });
      await withMemoryInterlock(backend, context, (capability) =>
        withRevisionConsumer(
          {
            repository: context.repository,
            issue: context.issue,
            activity: 'stage-write',
            backend,
            capability,
          },
          async () => {
            const gets = [],
              ctx = {};
            for (const key of [
              'issueArg',
              'stateArg',
              'resolvedFromState',
              'cfg',
              'SKIP_NETWORK',
              'deps',
              'outOfBandReason',
              'gh',
              'pexec',
              '__dir',
              'itemId',
              'reviewAuthority',
            ])
              Object.defineProperty(ctx, key, {
                enumerable: true,
                get() {
                  gets.push(key);
                  throw new Error('public tail getter');
                },
              });
            const snapshot = backend.snapshot,
              effects = structuredClone(backend.effects);
            let caught, result;
            try {
              result = await original(ctx);
            } catch (error) {
              caught = error;
            }
            assert.deepEqual(backend.snapshot, snapshot);
            assert.deepEqual(backend.effects, effects);
            assert.deepEqual(gets, []);
            assert.equal(result, undefined);
            assert.ok(caught);
            refused(caught);
          }
        )
      );
    } finally {
      sandbox.dispose();
    }
  });
}

// #1855: the compensation writer is independently callable; its parameter
// destructuring must not run before the governed stage root refuses the call.
for (const shape of ['own', 'inherited', 'plain-callback']) {
  test(`original state recording refuses ${shape} before getters or legacy writes`, async () => {
    const { writeIssueBodyWithRetry } =
      await import('../../../../task-tracker/lib/state-recording.mjs');
    const sandbox = createSandbox();
    try {
      const { backend, context } = await fixture('empty', { worktree: sandbox.context.sourceRoot });
      await withMemoryInterlock(backend, context, (capability) =>
        withRevisionConsumer(
          {
            repository: context.repository,
            issue: context.issue,
            activity: 'stage-write',
            backend,
            capability,
          },
          async () => {
            const gets = [],
              calls = [];
            const values = {
              issueNumber: 124,
              repo: context.repository,
              body: 'BODY',
              target: 'develop',
              writeIssueBody: async () => calls.push('write'),
              postComment: async () => calls.push('post'),
            };
            let input = values;
            if (shape !== 'plain-callback') {
              const properties = {};
              for (const key of Object.keys(values))
                Object.defineProperty(properties, key, {
                  enumerable: true,
                  get() {
                    gets.push(key);
                    return values[key];
                  },
                });
              input = shape === 'inherited' ? Object.create(properties) : properties;
            }
            const snapshot = backend.snapshot,
              effects = structuredClone(backend.effects);
            let caught, result;
            try {
              result = await writeIssueBodyWithRetry(input);
            } catch (error) {
              caught = error;
            }
            assert.deepEqual(backend.snapshot, snapshot);
            assert.deepEqual(backend.effects, effects);
            assert.deepEqual(gets, []);
            assert.deepEqual(calls, []);
            assert.equal(result, undefined);
            assert.ok(caught);
            refused(caught);
          }
        )
      );
    } finally {
      sandbox.dispose();
    }
  });
}
