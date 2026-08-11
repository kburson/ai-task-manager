// @story #1206
import test from 'node:test';
import assert from 'node:assert/strict';
import { statusForIssue } from '../../../../maintenance/bind-issues-to-new-project.mjs';

let migration;
let importError;
try {
  migration = await import('../../../lib/assigned-status-migration.mjs');
} catch (error) {
  importError = error;
}

test('the Assigned status migration module exists', () => {
  assert.ifError(importError);
  assert.equal(typeof migration?.runAssignedStatusMigration, 'function');
});

function statusField(targetName = 'On Deck') {
  return {
    id: 'STATUS_FIELD',
    name: 'Status',
    options: [
      { id: 'OPT_BACKLOG', name: 'Backlog', color: 'GRAY', description: 'Unvetted' },
      { id: 'OPT_ASSIGNED', name: targetName, color: 'BLUE', description: 'Ready' },
      { id: 'OPT_REFINE', name: 'Refine', color: 'PURPLE', description: 'Refine' },
    ],
  };
}

function makeHarness({ before = statusField(), after = statusField('Assigned') } = {}) {
  const calls = [];
  let reads = 0;
  const gql = async (query, variables) => {
    calls.push({ query, variables });
    if (query.includes('updateProjectV2Field')) {
      return { updateProjectV2Field: { projectV2Field: { id: 'STATUS_FIELD' } } };
    }
    reads += 1;
    const field = reads === 1 ? before : after;
    return { node: { fields: { nodes: [field] } } };
  };
  return { gql, calls };
}

test(
  'dry-run is the default and plans an in-place rename with every option id retained',
  { skip: !migration },
  async () => {
    const harness = makeHarness();
    const result = await migration.runAssignedStatusMigration({
      projectId: 'PROJECT',
      kanbanFieldId: 'STATUS_FIELD',
      configuredOptionId: 'OPT_ASSIGNED',
      gql: harness.gql,
    });

    assert.equal(result.applied, false);
    assert.equal(result.changed, true);
    assert.equal(result.optionId, 'OPT_ASSIGNED');
    assert.equal(result.itemRetention, 'preserved-by-option-id');
    assert.deepEqual(
      result.options.map(({ id, name }) => ({ id, name })),
      [
        { id: 'OPT_BACKLOG', name: 'Backlog' },
        { id: 'OPT_ASSIGNED', name: 'Assigned' },
        { id: 'OPT_REFINE', name: 'Refine' },
      ]
    );
    assert.equal(harness.calls.length, 1);
    assert.ok(harness.calls.every(({ query }) => !query.includes('mutation')));
  }
);

test(
  '--apply uses updateProjectV2Field, preserves option ids, and verifies the rename',
  { skip: !migration },
  async () => {
    const harness = makeHarness();
    const result = await migration.runAssignedStatusMigration({
      projectId: 'PROJECT',
      kanbanFieldId: 'STATUS_FIELD',
      configuredOptionId: 'OPT_ASSIGNED',
      apply: true,
      gql: harness.gql,
    });

    assert.equal(result.applied, true);
    assert.equal(result.verified, true);
    assert.equal(result.optionId, 'OPT_ASSIGNED');
    const mutation = harness.calls.find(({ query }) => query.includes('updateProjectV2Field'));
    assert.ok(mutation, 'apply must update the existing field in place');
    assert.equal(mutation.variables.field, 'STATUS_FIELD');
    assert.deepEqual(
      mutation.variables.options.map(({ id, name }) => ({ id, name })),
      [
        { id: 'OPT_BACKLOG', name: 'Backlog' },
        { id: 'OPT_ASSIGNED', name: 'Assigned' },
        { id: 'OPT_REFINE', name: 'Refine' },
      ]
    );
    assert.ok(
      harness.calls.every(({ query }) => !query.includes('updateProjectV2ItemFieldValue')),
      'renaming an option must not rewrite or drop any project item'
    );
  }
);

test('the migration is idempotent once Assigned exists', { skip: !migration }, async () => {
  const harness = makeHarness({ before: statusField('Assigned') });
  const result = await migration.runAssignedStatusMigration({
    projectId: 'PROJECT',
    kanbanFieldId: 'STATUS_FIELD',
    configuredOptionId: 'OPT_ASSIGNED',
    apply: true,
    gql: harness.gql,
  });
  assert.equal(result.changed, false);
  assert.equal(result.applied, false);
  assert.equal(harness.calls.length, 1);
});

test('ambiguous or mismatched live-board state fails closed', { skip: !migration }, async () => {
  const ambiguous = statusField();
  ambiguous.options.push({
    id: 'OPT_DUPLICATE',
    name: 'Assigned',
    color: 'BLUE',
    description: '',
  });
  await assert.rejects(
    () =>
      migration.runAssignedStatusMigration({
        projectId: 'PROJECT',
        kanbanFieldId: 'STATUS_FIELD',
        configuredOptionId: 'OPT_ASSIGNED',
        gql: makeHarness({ before: ambiguous }).gql,
      }),
    /both On Deck and Assigned/i
  );
  await assert.rejects(
    () =>
      migration.runAssignedStatusMigration({
        projectId: 'PROJECT',
        kanbanFieldId: 'STATUS_FIELD',
        configuredOptionId: 'WRONG_ID',
        gql: makeHarness().gql,
      }),
    /configured option id/i
  );
});

test('maintenance board rebinding projects canonical and historical second-state markers to Assigned', () => {
  assert.equal(statusForIssue('<!-- aitm-last-known-state: on-deck -->', 'open'), 'Assigned');
  assert.equal(
    statusForIssue(
      '<!-- aitm-last-known-state state="assigned" ts="2026-08-11T00:00:00.000Z" -->',
      'open'
    ),
    'Assigned'
  );
  assert.equal(statusForIssue('no marker', 'open'), null);
  assert.equal(statusForIssue('<!-- aitm-last-known-state: unknown -->', 'open'), null);
  assert.equal(statusForIssue('no marker', 'CLOSED'), 'Done');
});
