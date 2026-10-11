// @story #1954
import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { EventEmitter } from 'node:events';
import {
  deps,
  projectItemForIssue,
  projectValuesForIssue,
} from '../../../../../gh/lib/github-projects.mjs';
import {
  defaultGetLiveState,
  assertVerifierStateAllowed,
} from '../../../../../task-tracker/lib/verifier-state-gate.mjs';
import { fetchLiveKanbanState } from '../../../../../gh/lib/live-state.mjs';
import { buildContext } from '../../../../../task-tracker/runtime.mjs';
import { runStatusWrite } from '../../../../../task-tracker/lib/move-state/github-mutation.mjs';

afterEach(() => mock.restoreAll());

const cfg = { repo: 'owner/repo', projectId: 'P' };
const target = { id: 'TARGET', project: { id: 'P' }, fieldValueByName: { name: 'Develop' } };
const foreign = { id: 'FOREIGN', project: { id: 'OTHER' }, fieldValueByName: { name: 'Review' } };
const page = (nodes, hasNextPage = false, endCursor = null, id = 'ISSUE') => ({
  repository: {
    issue: { id, number: 12, projectItems: { nodes, pageInfo: { hasNextPage, endCursor } } },
  },
});

function transport(pages) {
  const requests = [];
  mock.method(deps, 'spawn', () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = new EventEmitter();
    child.stdin.end = (input) => {
      requests.push(JSON.parse(input));
      const response =
        typeof pages === 'function' ? pages(requests.at(-1)) : pages[requests.length - 1];
      queueMicrotask(() => {
        child.stdout.emit('data', JSON.stringify({ data: response }));
        child.emit('close', 0);
      });
    };
    return child;
  });
  return requests;
}

test('item lookup finds configured membership on a later page', async () => {
  const calls = transport([page([foreign], true, 'NEXT'), page([target])]);
  assert.deepEqual(await projectItemForIssue({ ...cfg, issueNumber: 12 }), {
    issueId: 'ISSUE',
    itemId: 'TARGET',
  });
  assert.equal(calls[1].variables.after, 'NEXT');
});

test('restricted verifier cannot borrow a foreign project Review state', async () => {
  transport([page([foreign])]);
  const result = await assertVerifierStateAllowed({
    issueNumber: 12,
    cfg,
    commands: ['npm run test:slow'],
  });
  assert.equal(result.allowed, false);
});

test('state lookup finds configured Develop beyond a foreign Review page', async () => {
  transport([page([foreign], true, 'NEXT'), page([target])]);
  assert.equal(await defaultGetLiveState({ issueNumber: 12, cfg }), 'develop');
});

test('live state does not return absence from an incomplete first page', async () => {
  transport([page([foreign], true, 'NEXT'), page([target])]);
  assert.equal(await fetchLiveKanbanState({ ...cfg, issueNumber: 12 }), 'develop');
});

test('lookup scans beyond an early match and rejects later ambiguity', async () => {
  transport([page([target], true, 'NEXT'), page([{ ...target, id: 'SECOND' }])]);
  await assert.rejects(
    () => projectItemForIssue({ ...cfg, issueNumber: 12 }),
    /membership.*ambiguous/
  );
});

for (const [name, pages] of [
  ['missing continuation cursor', [page([foreign], true)]],
  ['repeated continuation cursor', [page([foreign], true, 'NEXT'), page([], true, 'NEXT')]],
  [
    'changed issue identity',
    [page([foreign], true, 'NEXT'), page([target], false, null, 'CHANGED')],
  ],
  ['duplicate item identity', [page([foreign], true, 'NEXT'), page([foreign])]],
  [
    'missing page information',
    [{ repository: { issue: { id: 'ISSUE', projectItems: { nodes: [target] } } } }],
  ],
  [
    'unreadable later page after match',
    [page([target], true, 'NEXT'), { repository: { issue: { id: 'ISSUE', projectItems: null } } }],
  ],
  ['redacted item', [page([null])]],
]) {
  test(`lookup refuses ${name}`, async () => {
    transport(pages);
    await assert.rejects(() => projectItemForIssue({ ...cfg, issueNumber: 12 }), /membership/);
  });
}

test('field value lookup resolves configured item on a later membership page', async () => {
  const item = {
    ...target,
    fieldValues: { nodes: [{ number: 4, field: { id: 'EST' } }], pageInfo: { hasNextPage: false } },
  };
  transport([page([foreign], true, 'NEXT'), page([item])]);
  assert.deepEqual(
    await projectValuesForIssue({
      cfg: { ...cfg, fieldEstimate: 'EST' },
      fieldDefs: [{ key: 'estimate' }],
      issueNumber: 12,
    }),
    { estimate: 4 }
  );
});

test('field values refuse an incomplete configured-item field scan', async () => {
  const item = {
    ...target,
    fieldValues: { nodes: [], pageInfo: { hasNextPage: true, endCursor: 'MORE' } },
  };
  transport([page([item])]);
  await assert.rejects(
    () =>
      projectValuesForIssue({
        cfg: { ...cfg, fieldEstimate: 'EST' },
        fieldDefs: [{ key: 'estimate' }],
        issueNumber: 12,
      }),
    /field values/
  );
});

test('runtime board state completes membership pages before resolving Status', async () => {
  const ctx = buildContext(['board', '12']);
  const item = {
    ...target,
    project: { id: ctx.cfg.projectId },
    fieldValueByName: { optionId: ctx.cfg.kanbanOptionDevelop },
  };
  transport([page([foreign], true, 'NEXT'), page([item])]);
  assert.equal(await ctx.getIssueBoardState(12), 'develop');
});

test('status write readback finds configured item beyond the first page', async () => {
  const item = { ...target, fieldValueByName: { optionId: 'DEVELOP' } };
  transport(({ variables }) =>
    variables.after === 'NEXT' ? page([item]) : page([foreign], true, 'NEXT')
  );
  const result = await runStatusWrite({
    cfg: { ...cfg, kanbanFieldId: 'STATUS' },
    issueArg: 12,
    stateArg: 'develop',
    optionId: 'DEVELOP',
    SKIP_NETWORK: false,
    itemIdOverride: 'TARGET',
    gh: async () => {},
  });
  assert.equal(result.exit, null);
});
