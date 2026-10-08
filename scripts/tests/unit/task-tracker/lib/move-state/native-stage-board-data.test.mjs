// @story #1855
// Shared native board request/parser DATA; no stage or transport authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as board from '../../../../../task-tracker/lib/move-state/github-mutation.mjs';
import * as projects from '../../../../../gh/lib/github-projects.mjs';

test('native board argv is shared with the ordinary actual status loop', async () => {
  assert.equal(typeof board.statusWriteArgs, 'function');
  const intent = {
    projectId: 'PVT_subject',
    itemId: 'PVTI_subject',
    fieldId: 'PVTF_status',
    optionId: 'OPTION_test',
  };
  const expected = [
    'project',
    'item-edit',
    '--project-id',
    intent.projectId,
    '--id',
    intent.itemId,
    '--field-id',
    intent.fieldId,
    '--single-select-option-id',
    intent.optionId,
  ];
  assert.deepEqual(board.statusWriteArgs(intent), expected);
  const writes = [];
  const result = await board.runStatusWrite({
    issueArg: '124',
    stateArg: 'test',
    optionId: intent.optionId,
    cfg: { repo: 'example/criteria', projectId: intent.projectId, kanbanFieldId: intent.fieldId },
    itemIdOverride: intent.itemId,
    gh: async (args) => {
      writes.push(args);
    },
    readBackStatusOptionId: async () => intent.optionId,
  });
  assert.deepEqual(result, { itemId: intent.itemId, exit: null });
  assert.deepEqual(writes, [expected]);
});

test('native item parser retains actual node ID and configured membership semantics', () => {
  assert.equal(typeof projects.projectItemFromData, 'function');
  const raw = {
    repository: {
      issue: {
        id: 'I_subject',
        projectItems: {
          nodes: [
            { id: 'PVTI_other', project: { id: 'PVT_other' } },
            { id: 'PVTI_subject', project: { id: 'PVT_subject' } },
          ],
        },
      },
    },
  };
  assert.deepEqual(projects.projectItemFromData(raw, 'PVT_subject'), {
    issueId: 'I_subject',
    itemId: 'PVTI_subject',
  });
  assert.deepEqual(projects.projectItemFromData(raw, 'PVT_missing'), {
    issueId: 'I_subject',
    itemId: '',
  });
  assert.throws(() => projects.projectItemFromData({}, 'PVT_subject'), TypeError);
});

test('native Status parser preserves exact first configured item and empty fallback', () => {
  assert.equal(typeof board.statusOptionFromData, 'function');
  const raw = {
    repository: {
      issue: {
        projectItems: {
          nodes: [
            { project: { id: 'PVT_other' }, fieldValueByName: { optionId: 'other' } },
            { project: { id: 'PVT_subject' }, fieldValueByName: { optionId: 'OPTION_test' } },
          ],
        },
      },
    },
  };
  assert.equal(board.statusOptionFromData(raw, 'PVT_subject'), 'OPTION_test');
  assert.equal(board.statusOptionFromData(raw, 'missing'), '');
  assert.equal(board.statusOptionFromData(null, 'PVT_subject'), '');
});

test('original raw Status custody refuses public copied foreign and getter inputs without evaluation', async () => {
  const core = await import('../../../../../task-tracker/lib/move-state/move-state-core.mjs');
  assert.equal(typeof core.readNativeStageStatusSourceResponse, 'function');
  assert.equal(typeof board.readOriginalNativeBoardStatus, 'function');
  let accessed = 0;
  const getter = {
    get cfg() {
      accessed++;
      throw new Error('caller getter');
    },
  };
  for (const input of [{}, { cfg: { projectId: 'foreign' }, issueNumber: 999 }, getter]) {
    assert.throws(() => core.readNativeStageStatusSourceResponse(input, {}));
    assert.throws(() => board.readOriginalNativeBoardStatus(input, {}));
  }
  assert.equal(accessed, 0);
});

test('raw Status recording refuses caller authority getters before evaluation', async () => {
  const { recordMemoryNativeStageBoardStatusSource } =
    await import('../../../../../task-tracker/lib/criteria-revision/store.mjs');
  let accessed = 0;
  for (const key of ['backend', 'capability', 'context', 'token', 'invocation']) {
    const input = { backend: {}, capability: {}, context: {}, token: {}, invocation: {} };
    Object.defineProperty(input, key, {
      enumerable: true,
      get() {
        accessed++;
        throw new Error('caller authority getter');
      },
    });
    await assert.rejects(recordMemoryNativeStageBoardStatusSource(input));
  }
  assert.equal(accessed, 0);
});

test('raw Status recording closes inherited null-prototype symbol and hidden authority fields', async () => {
  const { recordMemoryNativeStageBoardStatusSource } =
    await import('../../../../../task-tracker/lib/criteria-revision/store.mjs');
  const base = { backend: {}, capability: {}, context: {}, token: {}, invocation: {} };
  let accessed = 0;
  const inherited = Object.create({
    get backend() {
      accessed++;
      throw new Error('inherited authority getter');
    },
  });
  Object.assign(inherited, { capability: {}, context: {}, token: {}, invocation: {} });
  const nullPrototype = Object.assign(Object.create(null), base);
  const symbol = { ...base, [Symbol('authority')]: true };
  const hidden = { ...base };
  Object.defineProperty(hidden, 'context', { enumerable: false, value: {} });
  for (const input of [inherited, nullPrototype, symbol, hidden])
    await assert.rejects(
      recordMemoryNativeStageBoardStatusSource(input),
      (error) => error.message === 'criteria-revision:native-stage-board-input'
    );
  for (const input of [
    base,
    structuredClone(base),
    { ...base, context: { repository: 'foreign/repo', issue: 999 } },
  ])
    await assert.rejects(recordMemoryNativeStageBoardStatusSource(input));
  assert.equal(accessed, 0);
});
