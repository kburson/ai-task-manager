// @story #1839
import test from 'node:test';
import assert from 'node:assert/strict';
const collectionUrl = new URL(
  '../../../task-tracker/lib/graphql-usage/collection.mjs',
  import.meta.url
);

test('scoped dispatch context refuses conflicting targets and malformed metadata', async () => {
  const { dispatchContext, readDispatchContext } = await import(collectionUrl);
  const scope = {
    repository: 'owner/scratch',
    issueNumber: 42,
    lifecycleState: 'plan',
    stateSource: 'argument',
  };
  assert.deepEqual(readDispatchContext('{broken'), {});
  assert.deepEqual(readDispatchContext(JSON.stringify({ ...scope, body: 'secret' })), {});
  assert.deepEqual(
    readDispatchContext(JSON.stringify({ ...scope, lifecycleState: 'made-up' })),
    {}
  );
  assert.equal(
    dispatchContext({ ...scope, args: ['issue', 'view', '43'] }).lifecycleState,
    'unknown'
  );
  assert.equal(
    dispatchContext({ ...scope, args: ['issue', 'view', '42', '--repo', 'other/repo'] })
      .lifecycleState,
    'unknown'
  );
  assert.equal(
    dispatchContext({ ...scope, draftId: 'draft', variables: { issues: [42, 43] } }).draftId,
    null
  );
  assert.equal(
    dispatchContext({
      ...scope,
      args: ['issue', 'view', 'https://github.com/other/repo/issues/42'],
    }).lifecycleState,
    'unknown'
  );
  assert.equal(
    dispatchContext({
      ...scope,
      args: ['issue', 'edit', '42', '--body', 'https://github.com/other/repo/issues/99'],
    }).lifecycleState,
    'plan'
  );

  assert.equal(
    dispatchContext({ draftId: 'secret with spaces', lifecycleState: 'backlog' }).draftId,
    null
  );
});

test('native body-read short jq flag preserves attribution and board edit stays opaque', async () => {
  const { dispatchContext } = await import(collectionUrl);
  const { classifyGhUsage } = await import('../../../task-tracker/lib/action-capture.mjs');
  const scope = { repository: 'owner/scratch', issueNumber: 42, lifecycleState: 'refine' };
  assert.equal(
    dispatchContext({
      ...scope,
      args: ['issue', 'view', '42', '-R', 'owner/scratch', '--json', 'body', '-q', '.body'],
    }).lifecycleState,
    'refine'
  );
  assert.equal(
    dispatchContext({ ...scope, args: ['issue', 'view', '42', '--unsupported', 'secret'] })
      .lifecycleState,
    'unknown'
  );
  const classified = classifyGhUsage([
    'project',
    'item-edit',
    '--project-id',
    'PVT_target',
    '--id',
    'PVTI_item',
    '--field-id',
    'field',
    '--single-select-option-id',
    'option',
  ]);
  assert.equal(classified.operation, 'gh.project.item-edit');
  assert.equal(classified.kind, 'mutation');
  assert.equal(classified.queryFingerprint, null);
});
