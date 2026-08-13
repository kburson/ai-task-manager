// @story #1217
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  EXPECTED_STATUS_ORDER,
  MIGRATION_OPERATION_STATES,
  MIGRATION_PHASES,
  applyReadyForPlanMigration,
  collectAssignedInventory,
  inspectReadyForPlanMigration,
  migrationRecoveryAction,
  resolveMigrationPlan,
  verifyReadyForPlanViews,
} from '../../../lib/ready-for-plan-migration.mjs';

const cfg = {
  projectId: 'P1',
  kanbanFieldId: 'F1',
  kanbanOptionBacklog: 'O_BACKLOG',
  kanbanOptionAssigned: 'O_ASSIGNED',
};

const field = {
  id: 'F1',
  options: [
    { id: 'O_BACKLOG', name: 'Backlog', color: 'GRAY', description: '' },
    { id: 'O_ASSIGNED', name: 'Assigned', color: 'GRAY', description: '' },
    { id: 'O_REFINE', name: 'Refine', color: 'GREEN', description: '' },
    { id: 'O_PLAN', name: 'Plan', color: 'BLUE', description: '' },
    { id: 'O_DEVELOP', name: 'Develop', color: 'YELLOW', description: '' },
    { id: 'O_TEST', name: 'Test', color: 'ORANGE', description: '' },
    { id: 'O_REVIEW', name: 'Review', color: 'BLUE', description: '' },
    { id: 'O_DONE', name: 'Done', color: 'PURPLE', description: '' },
  ],
};

function item(number, assignees = ['alice']) {
  return {
    itemId: `PVTI_${number}`,
    issueId: `I_${number}`,
    repository: 'kburson/ai-task-manager',
    issueNumber: number,
    status: { optionId: 'O_ASSIGNED', name: 'Assigned' },
    assignees: {
      nodes: assignees.map((login) => ({ login })),
      totalCount: assignees.length,
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  };
}

test('collectAssignedInventory exhaustively pages and rejects a repeated cursor', async () => {
  const pages = [
    {
      nodes: [item(1)],
      totalCount: 2,
      pageInfo: { hasNextPage: true, endCursor: 'next' },
    },
    {
      nodes: [item(2)],
      totalCount: 2,
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  ];
  const inventory = await collectAssignedInventory({
    assignedOptionId: 'O_ASSIGNED',
    fetchPage: async ({ cursor }) => pages[cursor ? 1 : 0],
  });
  assert.deepEqual(
    inventory.map(({ repository, issueNumber, assignees }) => ({
      repository,
      issueNumber,
      assignees,
    })),
    [
      { repository: 'kburson/ai-task-manager', issueNumber: 1, assignees: ['alice'] },
      { repository: 'kburson/ai-task-manager', issueNumber: 2, assignees: ['alice'] },
    ]
  );

  await assert.rejects(
    collectAssignedInventory({
      assignedOptionId: 'O_ASSIGNED',
      fetchPage: async () => ({
        nodes: [],
        totalCount: 1,
        pageInfo: { hasNextPage: true, endCursor: 'same' },
      }),
    }),
    /cursor repeated|count mismatch/
  );
});

test('collectAssignedInventory fails closed on malformed pagination and ambiguous identities', async (t) => {
  const cases = [
    {
      name: 'missing next cursor',
      connection: {
        nodes: [],
        totalCount: 1,
        pageInfo: { hasNextPage: true, endCursor: null },
      },
      expected: /next cursor is missing/,
    },
    {
      name: 'changing total count',
      pages: [
        {
          nodes: [item(1)],
          totalCount: 2,
          pageInfo: { hasNextPage: true, endCursor: 'next' },
        },
        {
          nodes: [item(2)],
          totalCount: 3,
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      ],
      expected: /totalCount changed/,
    },
    {
      name: 'duplicate repository issue identity',
      connection: {
        nodes: [item(1), { ...item(1), itemId: 'PVTI_other', issueId: 'I_other' }],
        totalCount: 2,
        pageInfo: { hasNextPage: false, endCursor: null },
      },
      expected: /duplicate inventory identity/,
    },
    {
      name: 'incomplete assignee page',
      connection: {
        nodes: [
          {
            ...item(1),
            assignees: {
              nodes: [{ login: 'alice' }],
              totalCount: 2,
              pageInfo: { hasNextPage: true, endCursor: 'assignee-next' },
            },
          },
        ],
        totalCount: 1,
        pageInfo: { hasNextPage: false, endCursor: null },
      },
      expected: /assignee pagination is incomplete/,
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, async () => {
      await assert.rejects(
        collectAssignedInventory({
          assignedOptionId: 'O_ASSIGNED',
          fetchPage: async ({ cursor }) =>
            entry.pages ? entry.pages[cursor ? 1 : 0] : entry.connection,
        }),
        entry.expected
      );
    });
  }

  await t.test('pagination safety limit', async () => {
    let page = 0;
    await assert.rejects(
      collectAssignedInventory({
        assignedOptionId: 'O_ASSIGNED',
        safetyLimit: 2,
        fetchPage: async () => ({
          nodes: [],
          totalCount: 1,
          pageInfo: { hasNextPage: true, endCursor: `cursor-${++page}` },
        }),
      }),
      /safety limit 2 exceeded/
    );
  });
});

test('inspectReadyForPlanMigration is zero-write and rejects a mixed two-scan identity set', async () => {
  let scan = 0;
  let writes = 0;
  const plan = await inspectReadyForPlanMigration({
    cfg,
    deps: {
      fetchStatusField: async () => field,
      collectInventory: async () => {
        scan += 1;
        return [item(1), item(2)].map((entry) => ({
          ...entry,
          assignees: entry.assignees.nodes.map(({ login }) => login),
        }));
      },
      write: async () => {
        writes += 1;
      },
    },
  });
  assert.equal(scan, 2);
  assert.equal(writes, 0);
  assert.equal(plan.writes, 0);
  assert.deepEqual(
    plan.items.map(({ issueNumber }) => issueNumber),
    [1, 2]
  );
  assert.equal(plan.option.id, 'O_ASSIGNED');
  assert.equal(plan.option.afterName, 'Ready for Planning');
  assert.deepEqual(plan.option.order, EXPECTED_STATUS_ORDER);
  assert.match(plan.views.assignedWork, /has:assignee/);

  let unstable = 0;
  await assert.rejects(
    inspectReadyForPlanMigration({
      cfg,
      deps: {
        fetchStatusField: async () => field,
        collectInventory: async () =>
          [item(++unstable)].map((entry) => ({
            ...entry,
            assignees: ['alice'],
          })),
      },
    }),
    /inventory changed between authoritative scans/
  );

  let assigneeScan = 0;
  await assert.rejects(
    inspectReadyForPlanMigration({
      cfg,
      deps: {
        fetchStatusField: async () => field,
        collectInventory: async () => [
          {
            ...item(1),
            assignees: [++assigneeScan === 1 ? 'alice' : 'bob'],
          },
        ],
      },
    }),
    /inventory changed between authoritative scans/
  );
});

test('inspectReadyForPlanMigration rejects unexpected or identity-conflicting Status options', async () => {
  await assert.rejects(
    inspectReadyForPlanMigration({
      cfg,
      deps: {
        fetchStatusField: async () => ({
          ...field,
          options: [...field.options, { id: 'O_EXTRA', name: 'Parking Lot' }],
        }),
        collectInventory: async () => [],
      },
    }),
    /unexpected Status option Parking Lot/
  );

  await assert.rejects(
    inspectReadyForPlanMigration({
      cfg,
      deps: {
        fetchStatusField: async () => ({
          ...field,
          options: field.options.map((option) =>
            option.name === 'Assigned' ? { ...option, id: 'O_WRONG' } : option
          ),
        }),
        collectInventory: async () => [],
      },
    }),
    /configured Assigned option id mismatches live/
  );
});

test('applyReadyForPlanMigration journals read-back before option/config cutover and resumes', async () => {
  const plan = await inspectReadyForPlanMigration({
    cfg,
    deps: {
      fetchStatusField: async () => field,
      collectInventory: async () =>
        [item(1), item(2)].map((entry) => ({ ...entry, assignees: ['alice'] })),
    },
  });
  const live = new Map(
    plan.items.map((entry) => [entry.itemId, { status: 'Assigned', assignees: ['alice'] }])
  );
  let journal = null;
  const events = [];
  let throwAfterLanding = true;
  let optionRenamed = false;
  const deps = {
    loadJournal: async () => journal,
    saveJournal: async (next) => {
      journal = structuredClone(next);
      events.push(`journal:${next.phase}`);
    },
    moveItemToBacklog: async ({ item }) => {
      live.get(item.itemId).status = 'Backlog';
      events.push(`move:${item.itemId}`);
      if (throwAfterLanding) {
        throwAfterLanding = false;
        throw new Error('transport lost after apply');
      }
    },
    fetchItemSnapshot: async ({ item }) => ({
      status: live.get(item.itemId).status,
      assignees: live.get(item.itemId).assignees,
    }),
    collectInventory: async () => [],
    updateStatusOptions: async () => {
      events.push('rename');
      optionRenamed = true;
    },
    fetchStatusField: async () =>
      optionRenamed
        ? {
            ...field,
            options: field.options
              .filter(({ name }) => name !== 'Assigned')
              .map((option) => ({ ...option }))
              .concat({
                id: 'O_ASSIGNED',
                name: 'Ready for Planning',
                color: 'GRAY',
                description: '',
              })
              .sort(
                (a, b) =>
                  EXPECTED_STATUS_ORDER.indexOf(a.name) - EXPECTED_STATUS_ORDER.indexOf(b.name)
              ),
          }
        : field,
    cutoverConfig: async () => ({ verified: true, optionId: 'O_ASSIGNED' }),
    verifyViews: async () => ({ verified: true, mode: 'operator-confirmed' }),
  };

  const result = await applyReadyForPlanMigration({ plan, cfg, deps });
  assert.equal(result.verified, true);
  assert.equal(journal.phase, 'final-verification');
  assert.deepEqual(MIGRATION_PHASES.at(-1), 'final-verification');
  assert.deepEqual(MIGRATION_OPERATION_STATES, ['observed', 'applied', 'verified', 'rolled-back']);
  assert.equal(journal.items.PVTI_1.mutation, 'observed');
  assert.equal(journal.items.PVTI_1.verification, 'verified');
  assert.equal(journal.items.PVTI_2.mutation, 'applied');
  assert.equal(journal.items.PVTI_2.verification, 'verified');
  assert.ok(events.indexOf('rename') > events.lastIndexOf('journal:items-verified'));
  const retry = await applyReadyForPlanMigration({ plan, cfg, deps });
  assert.equal(retry.verified, true);
  assert.equal(events.filter((entry) => entry === 'rename').length, 1);
});

test('apply refuses assignee drift before option rename', async () => {
  const plan = await inspectReadyForPlanMigration({
    cfg,
    deps: {
      fetchStatusField: async () => field,
      collectInventory: async () => [{ ...item(1), assignees: ['alice'] }],
    },
  });
  let renamed = false;
  await assert.rejects(
    applyReadyForPlanMigration({
      plan,
      cfg,
      deps: {
        loadJournal: async () => null,
        saveJournal: async () => {},
        moveItemToBacklog: async () => {},
        fetchItemSnapshot: async () => ({ status: 'Backlog', assignees: ['bob'] }),
        collectInventory: async () => [],
        updateStatusOptions: async () => {
          renamed = true;
        },
      },
    }),
    /assignee read-back mismatch/
  );
  assert.equal(renamed, false);
});

test('apply requires the configured Backlog option id in item read-back', async () => {
  const plan = await inspectReadyForPlanMigration({
    cfg,
    deps: {
      fetchStatusField: async () => field,
      collectInventory: async () => [{ ...item(1), assignees: ['alice'] }],
    },
  });
  let renamed = false;
  await assert.rejects(
    applyReadyForPlanMigration({
      plan,
      cfg,
      deps: {
        loadJournal: async () => null,
        saveJournal: async () => {},
        moveItemToBacklog: async () => {},
        fetchItemSnapshot: async () => ({
          status: 'Backlog',
          statusOptionId: 'O_SAME_NAME_BUT_WRONG_ID',
          assignees: ['alice'],
        }),
        collectInventory: async () => [],
        updateStatusOptions: async () => {
          renamed = true;
        },
      },
    }),
    /Status read-back mismatch/
  );
  assert.equal(renamed, false);
});

test('saved-view verification requires assigned filters and a Status board', () => {
  assert.deepEqual(
    verifyReadyForPlanViews([
      { name: 'Assigned', layout: 'TABLE_LAYOUT', filter: 'has:assignee -status:done' },
      { name: 'Kanban', layout: 'BOARD_LAYOUT', filter: 'is:issue' },
    ]),
    { verified: true, mode: 'github-read-back' }
  );
  assert.throws(
    () => verifyReadyForPlanViews([{ name: 'Kanban', layout: 'BOARD_LAYOUT', filter: 'is:issue' }]),
    /assigned-work view/i
  );
  assert.throws(
    () =>
      verifyReadyForPlanViews([
        { name: 'Assigned', layout: 'TABLE_LAYOUT', filter: 'has:assignee' },
      ]),
    /Status board view/i
  );
});

test('new journal stores the immutable plan for post-rename resume', async () => {
  const plan = await inspectReadyForPlanMigration({
    cfg,
    deps: {
      fetchStatusField: async () => field,
      collectInventory: async () => [],
    },
  });
  let journal = null;
  await assert.rejects(
    applyReadyForPlanMigration({
      plan,
      cfg,
      deps: {
        loadJournal: async () => journal,
        saveJournal: async (next) => {
          journal = structuredClone(next);
        },
        fetchStatusField: async () => field,
        updateStatusOptions: async () => {
          throw new Error('stop after journal');
        },
      },
    }),
    /stop after journal/
  );
  assert.deepEqual(journal.plan, plan);
});

test('a completed journal returns a complete idempotent result', async () => {
  const plan = await inspectReadyForPlanMigration({
    cfg,
    deps: {
      fetchStatusField: async () => field,
      collectInventory: async () => [],
    },
  });
  const journal = {
    planDigest: plan.digest,
    plan,
    phase: 'final-verification',
    items: {},
  };
  const result = await applyReadyForPlanMigration({
    plan,
    cfg,
    deps: { loadJournal: async () => journal },
  });
  assert.deepEqual(
    {
      verified: result.verified,
      migratedItems: result.migratedItems,
      optionId: result.optionId,
    },
    { verified: true, migratedItems: 0, optionId: 'O_ASSIGNED' }
  );
});

test('operator migration documentation records the exact cutover and saved-view contracts', () => {
  const history = readFileSync(
    new URL('../../../../../docs/migration-history.md', import.meta.url),
    'utf8'
  );
  const guide = readFileSync(
    new URL('../../../../../docs/guides/ready-for-planning-migration.md', import.meta.url),
    'utf8'
  );
  for (const text of [history, guide]) {
    assert.match(text, /assigned-to-ready-for-plan\.mjs/);
    assert.match(text, /has:assignee/);
    assert.match(text, /Ready for Planning/);
    assert.match(text, /durable journal/i);
  }
  assert.match(guide, /dry run/i);
  assert.match(guide, /--apply --yes/);
  assert.match(guide, /preserve assignees|preserves assignees/i);
});

test('recovery reporting names the exact durable phase and retry command', () => {
  assert.equal(
    migrationRecoveryAction({ phase: 'items-moved-to-backlog' }),
    'Recovery: journal phase=items-moved-to-backlog; resolve any reported drift, then re-run `node scripts/migrate/assigned-to-ready-for-plan.mjs --apply --yes`.'
  );
  assert.equal(
    migrationRecoveryAction(null),
    'Recovery: no durable migration journal exists; fix the reported inspection error and repeat the dry run.'
  );
});

test('dry run always inspects live inventory while apply resumes the durable plan', async () => {
  const durable = { digest: 'durable-plan' };
  const current = { digest: 'fresh-live-plan' };
  let inspections = 0;
  const inspect = async () => {
    inspections += 1;
    return current;
  };

  assert.equal(
    await resolveMigrationPlan({ apply: false, journal: { plan: durable }, inspect }),
    current
  );
  assert.equal(
    await resolveMigrationPlan({ apply: true, journal: { plan: durable }, inspect }),
    durable
  );
  assert.equal(inspections, 1);
});
