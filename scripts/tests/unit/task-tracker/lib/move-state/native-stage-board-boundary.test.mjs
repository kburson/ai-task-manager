// @story #1855
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runStatusWrite,
  postStampFailureAudit,
  rollbackRecordedState,
  assertBoardMarkerConsistent,
} from '../../../../../task-tracker/lib/move-state/github-mutation.mjs';
import { withMemoryStageEffectQuarantine } from '../../../../../task-tracker/lib/criteria-revision/transport-quarantine.mjs';

test('stage-only board denial precedes public context access and project callbacks', async () => {
  const effects = [];
  await assert.rejects(
    withMemoryStageEffectQuarantine(() =>
      runStatusWrite({
        issueArg: 124,
        stateArg: 'test',
        optionId: 'test-option',
        cfg: { repo: 'example/criteria', projectId: 'PVT_fixture' },
        projectItemForIssue: async () => {
          effects.push('item');
          return { itemId: '' };
        },
      })
    ),
    (error) => error.code === 'revision-authority-unavailable'
  );
  assert.deepEqual(effects, []);
  await assert.rejects(
    withMemoryStageEffectQuarantine(() =>
      runStatusWrite({
        get issueArg() {
          effects.push('getter');
          return 124;
        },
      })
    ),
    (error) => error.code === 'revision-authority-unavailable'
  );
  assert.deepEqual(effects, []);
});

test('stage-only failure audit refuses before public input getters or comment callback', async () => {
  const effects = [];
  await assert.rejects(
    withMemoryStageEffectQuarantine(() =>
      postStampFailureAudit({
        get issueNumber() {
          effects.push('getter');
          return 124;
        },
        repo: 'example/criteria',
        stage: 'test',
        error: 'original failure',
        postComment: async () => {
          effects.push('comment');
        },
      })
    ),
    (error) => error.code === 'revision-authority-unavailable'
  );
  assert.deepEqual(effects, []);
});

import * as nativeProjects from '../../../../../gh/lib/github-projects.mjs';
test('stage-only native gh root denies before options getters and injectable transport', async () => {
  const calls = [],
    original = nativeProjects.deps.execFile;
  nativeProjects.deps.execFile = (...args) => {
    calls.push('transport');
    args.at(-1)(null, 'fixture', '');
  };
  try {
    await assert.rejects(
      withMemoryStageEffectQuarantine(() =>
        nativeProjects.gh(['project', 'item-edit'], {
          get input() {
            calls.push('getter');
            return undefined;
          },
        })
      ),
      (error) => error.code === 'revision-authority-unavailable'
    );
    assert.deepEqual(calls, []);
  } finally {
    nativeProjects.deps.execFile = original;
  }
});
test('stage-only native item root denies before public getters', async () => {
  const calls = [];
  await assert.rejects(
    withMemoryStageEffectQuarantine(() =>
      nativeProjects.projectItemForIssue({
        get repo() {
          calls.push('item getter');
          throw new Error('must not run');
        },
      })
    ),
    (error) => error.code === 'revision-authority-unavailable'
  );
  assert.deepEqual(calls, []);
});
test('stage-only native gql root denies before public getters', async () => {
  const calls = [];
  await assert.rejects(
    withMemoryStageEffectQuarantine(() =>
      nativeProjects.gql(
        'query {}',
        {},
        {
          get env() {
            calls.push('gql getter');
            throw new Error('must not run');
          },
        }
      )
    ),
    (error) => error.code === 'revision-authority-unavailable'
  );
  assert.deepEqual(calls, []);
});

import { defaultWriteSentinel } from '../../../../../task-tracker/lib/move-state/move-state-core.mjs';
test('stage-only sentinel denies before public context getter', async () => {
  const calls = [];
  await assert.rejects(
    withMemoryStageEffectQuarantine(() =>
      defaultWriteSentinel({
        get issueArg() {
          calls.push('getter');
          throw new Error('caller getter');
        },
      })
    ),
    (error) => error.code === 'revision-authority-unavailable'
  );
  assert.deepEqual(calls, []);
});
test('stage-only sentinel denies before injected body callback', async () => {
  const calls = [];
  await assert.rejects(
    withMemoryStageEffectQuarantine(() =>
      defaultWriteSentinel({
        issueArg: 124,
        stateArg: 'test',
        transitionId: 'fixture',
        cfg: { repo: 'example/criteria' },
        SKIP_NETWORK: false,
        _mutateBody: async () => {
          calls.push('body');
          throw new Error('caller body');
        },
      })
    ),
    (error) => error.code === 'revision-authority-unavailable'
  );
  assert.deepEqual(calls, []);
});

import { readOriginalNativeBoardFailure } from '../../../../../task-tracker/lib/move-state/github-mutation.mjs';
test('foreign copied and accessor error DATA cannot enter original board failure custody', () => {
  const calls = [],
    error = new Error('ordinary datum');
  const accessor = {};
  Object.defineProperty(accessor, 'message', {
    get() {
      calls.push('message');
      return 'forged';
    },
  });
  Object.defineProperty(accessor, 'name', {
    get() {
      calls.push('name');
      return 'Error';
    },
  });
  for (const value of [
    error,
    { ...error, message: error.message },
    Object.create(error),
    accessor,
    'failure',
    null,
  ])
    assert.throws(
      () => readOriginalNativeBoardFailure({}, Object.freeze({}), value),
      (caught) => caught.message === 'native-board-failure'
    );
  assert.deepEqual(calls, []);
});
test('ordinary native loop rethrows the identical write error and never reads status afterward', async () => {
  const error = new Error('original ordinary write error'),
    calls = [];
  await assert.rejects(
    runStatusWrite({
      issueArg: 124,
      stateArg: 'test',
      optionId: 'test-option',
      SKIP_NETWORK: false,
      cfg: { repo: 'example/criteria', projectId: 'PVT_fixture', kanbanFieldId: 'PVTF_status' },
      projectItemForIssue: async () => ({ issueId: 'I_fixture', itemId: 'PVTI_fixture' }),
      gh: async () => {
        calls.push('write');
        throw error;
      },
      readBackStatusOptionId: async () => {
        calls.push('read');
        return 'test-option';
      },
    }),
    (caught) => caught === error
  );
  assert.deepEqual(calls, ['write']);
});

for (const [name, invoke] of [
  ['rollback', (ctx) => rollbackRecordedState(ctx, 'develop')],
  ['consistency', (ctx) => assertBoardMarkerConsistent(ctx, 'test')],
]) {
  test(`stage-only ${name} denies before public context getter`, async () => {
    const calls = [];
    await assert.rejects(
      withMemoryStageEffectQuarantine(() =>
        invoke({
          get issueArg() {
            calls.push('getter');
            throw new Error('caller getter');
          },
        })
      ),
      (error) => error.code === 'revision-authority-unavailable'
    );
    assert.deepEqual(calls, []);
  });
  test(`stage-only ${name} denies before injected read callback`, async () => {
    const calls = [];
    await assert.rejects(
      withMemoryStageEffectQuarantine(() =>
        invoke({
          issueArg: '124',
          cfg: { repo: 'example/criteria' },
          pexec: async () => {
            calls.push('read');
            throw new Error('caller read');
          },
          gh: async () => {
            calls.push('write');
            throw new Error('caller write');
          },
        })
      ),
      (error) => error.code === 'revision-authority-unavailable'
    );
    assert.deepEqual(calls, []);
  });
}
