// @story #1217
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { SELF_DOC } from '../../../../lib/self-doc.mjs';
import { EXECUTABLE_ENTRYPOINTS } from '../../../../task-tracker/lib/command-surface/entrypoints.mjs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import {
  applyReadyForPlanMigration,
  inspectReadyForPlanMigration,
} from '../../../../task-tracker/lib/ready-for-plan-migration.mjs';

test('assigned-to-ready-for-plan migration CLI exposes dry-run and explicit apply contracts', () => {
  const help = spawnSync(
    process.execPath,
    ['scripts/migrate/assigned-to-ready-for-plan.mjs', '--help'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    }
  );
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /dry-run/i);
  assert.match(help.stdout, /--apply/);
  assert.match(help.stdout, /journal/i);
  assert.match(help.stdout, /Ready for Planning/);
  for (const heading of [
    'Purpose:',
    'Usage:',
    'Arguments:',
    'Preconditions:',
    'Effects:',
    'Output:',
    'Exit codes:',
    'Examples:',
    'Related:',
  ]) {
    assert.match(help.stdout, new RegExp(heading, 'i'));
  }
  assert.equal(
    SELF_DOC['assigned-to-ready-for-plan']?.path,
    'scripts/migrate/assigned-to-ready-for-plan.mjs'
  );
  assert.deepEqual(
    EXECUTABLE_ENTRYPOINTS.find(
      ({ path }) => path === 'scripts/migrate/assigned-to-ready-for-plan.mjs'
    ),
    {
      path: 'scripts/migrate/assigned-to-ready-for-plan.mjs',
      classification: 'live-maintenance-or-migration',
      command: null,
      reason: 'Operator-run repair, audit, backfill, or migration with live repository effects.',
    }
  );
});

test('migration command rejects unknown arguments before any GitHub access', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/migrate/assigned-to-ready-for-plan.mjs', '--unknown'],
    { cwd: process.cwd(), encoding: 'utf8' }
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unrecognized argument/);
});

test('production GraphQL and filesystem adapters resume a landed response and verify the full cutover', async () => {
  const sandbox = mkdtempProjectIsolated('r4p-live-');
  try {
    const cfg = {
      projectId: 'P1',
      kanbanFieldId: 'F1',
      kanbanOptionBacklog: 'O_BACKLOG',
      kanbanOptionAssigned: 'O_ASSIGNED',
    };
    const configDir = path.join(sandbox, '.ai-task-manager');
    const journalPath = path.join(sandbox, '.db', 'aitm', 'ready-for-plan-migration.json');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'task-tracker.json'), `${JSON.stringify(cfg, null, 2)}\n`);

    const order = [
      ['O_BACKLOG', 'Backlog'],
      ['O_ASSIGNED', 'Assigned'],
      ['O_REFINE', 'Refine'],
      ['O_PLAN', 'Plan'],
      ['O_DEVELOP', 'Develop'],
      ['O_TEST', 'Test'],
      ['O_REVIEW', 'Review'],
      ['O_DONE', 'Done'],
    ];
    let options = order.map(([id, name]) => ({ id, name, color: 'GRAY', description: '' }));
    const items = new Map([
      ['PVTI_1', { issueId: 'I_1', number: 1, status: 'Assigned', optionId: 'O_ASSIGNED' }],
      ['PVTI_2', { issueId: 'I_2', number: 2, status: 'Assigned', optionId: 'O_ASSIGNED' }],
    ]);
    const mutationCounts = { item: 0, field: 0 };
    let loseFirstItemResponse = true;
    const gql = async (query, variables) => {
      if (query.includes('query($field: ID!)')) {
        assert.equal(variables.field, 'F1');
        return { node: { id: 'F1', name: 'Status', options } };
      }
      if (query.includes('items(first: 50')) {
        return {
          node: {
            items: {
              totalCount: items.size,
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [...items].map(([itemId, value]) => ({
                id: itemId,
                content: {
                  id: value.issueId,
                  number: value.number,
                  repository: { nameWithOwner: 'kburson/ai-task-manager' },
                  assignees: {
                    totalCount: 1,
                    pageInfo: { hasNextPage: false, endCursor: null },
                    nodes: [{ login: 'kburson' }],
                  },
                },
                fieldValueByName: { name: value.status, optionId: value.optionId },
              })),
            },
          },
        };
      }
      if (query.includes('updateProjectV2ItemFieldValue')) {
        mutationCounts.item += 1;
        const value = items.get(variables.item);
        value.status = 'Backlog';
        value.optionId = 'O_BACKLOG';
        if (loseFirstItemResponse) {
          loseFirstItemResponse = false;
          throw new Error('response lost after item mutation landed');
        }
        return { updateProjectV2ItemFieldValue: { projectV2Item: { id: variables.item } } };
      }
      if (query.includes('... on ProjectV2Item')) {
        const value = items.get(variables.item);
        return {
          node: {
            fieldValueByName: { name: value.status, optionId: value.optionId },
            content: {
              assignees: {
                totalCount: 1,
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [{ login: 'kburson' }],
              },
            },
          },
        };
      }
      if (query.includes('updateProjectV2Field')) {
        mutationCounts.field += 1;
        options = variables.options.map((option) => ({ ...option }));
        return { updateProjectV2Field: { projectV2Field: { id: 'F1' } } };
      }
      if (query.includes('views(first: 50')) {
        return {
          node: {
            views: {
              totalCount: 2,
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                { id: 'V1', name: 'Assigned', layout: 'TABLE_LAYOUT', filter: 'has:assignee' },
                { id: 'V2', name: 'Kanban', layout: 'BOARD_LAYOUT', filter: 'is:issue' },
              ],
            },
          },
        };
      }
      throw new Error(`unexpected GraphQL operation: ${query.slice(0, 80)}`);
    };

    const plan = await inspectReadyForPlanMigration({ cfg, deps: { gql } });
    const result = await applyReadyForPlanMigration({
      plan,
      cfg,
      projectDir: sandbox,
      deps: { gql, journalPath },
    });
    assert.equal(result.verified, true);
    assert.deepEqual(mutationCounts, { item: 2, field: 1 });
    assert.equal(options.find(({ id }) => id === 'O_ASSIGNED').name, 'Ready for Planning');
    const writtenConfig = JSON.parse(
      readFileSync(path.join(configDir, 'task-tracker.json'), 'utf8')
    );
    assert.equal(writtenConfig.kanbanOptionReadyForPlan, 'O_ASSIGNED');
    assert.equal('kanbanOptionAssigned' in writtenConfig, false);
    assert.equal(JSON.parse(readFileSync(journalPath, 'utf8')).phase, 'final-verification');

    const retry = await applyReadyForPlanMigration({
      plan,
      cfg,
      projectDir: sandbox,
      deps: { gql, journalPath },
    });
    assert.equal(retry.migratedItems, 2);
    assert.deepEqual(mutationCounts, { item: 2, field: 1 });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
