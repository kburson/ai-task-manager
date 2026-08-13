// #1217 — fail-closed live ProjectV2 cutover from Assigned to Ready for Planning.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { gql as defaultGql } from '../../gh/lib/github-projects.mjs';
import {
  loadReadyForPlanMigrationJournal,
  readyForPlanMigrationJournalPath,
} from './ready-for-plan-migration-freeze.mjs';

export const EXPECTED_STATUS_ORDER = Object.freeze([
  'Backlog',
  'Refine',
  'Ready for Planning',
  'Plan',
  'Develop',
  'Test',
  'Review',
  'Done',
]);

export const MIGRATION_PHASES = Object.freeze([
  'inventory-complete',
  'items-moved-to-backlog',
  'items-verified',
  'option-renamed',
  'option-reordered',
  'config-cutover',
  'final-verification',
]);

export const MIGRATION_OPERATION_STATES = Object.freeze([
  'observed',
  'applied',
  'verified',
  'rolled-back',
]);

export function migrationRecoveryAction(journal) {
  if (!journal?.phase) {
    return 'Recovery: no durable migration journal exists; fix the reported inspection error and repeat the dry run.';
  }
  return (
    `Recovery: journal phase=${journal.phase}; resolve any reported drift, then re-run ` +
    '`node scripts/migrate/assigned-to-ready-for-plan.mjs --apply --yes`.'
  );
}

export async function resolveMigrationPlan({ apply, journal, inspect }) {
  if (apply && journal?.plan) return journal.plan;
  return inspect();
}

function fail(message) {
  const error = new Error(`Ready for Planning migration: ${message}`);
  error.name = 'ReadyForPlanMigrationError';
  throw error;
}

function normalizedLogins(value) {
  const list = Array.isArray(value) ? value : [];
  const out = list.map((entry) => String(entry?.login ?? entry).trim()).filter(Boolean);
  const lower = out.map((login) => login.toLowerCase());
  if (new Set(lower).size !== lower.length) fail('duplicate assignee identity');
  return out.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

function sameLogins(left, right) {
  const a = normalizedLogins(left).map((login) => login.toLowerCase());
  const b = normalizedLogins(right).map((login) => login.toLowerCase());
  return a.length === b.length && a.every((login, index) => login === b[index]);
}

function normalizeInventoryItem(entry, assignedOptionId) {
  if (
    !entry?.itemId ||
    !entry.issueId ||
    !entry.repository ||
    !Number.isInteger(entry.issueNumber)
  ) {
    fail('inventory item lacks repository-qualified issue identity');
  }
  if (entry.status?.optionId !== assignedOptionId && entry.status?.name !== 'Assigned') {
    fail(`inventory item ${entry.itemId} is not Assigned`);
  }
  const assigneesConnection = entry.assignees;
  if (assigneesConnection && !Array.isArray(assigneesConnection)) {
    const nodes = assigneesConnection.nodes;
    if (!Array.isArray(nodes)) fail(`item ${entry.itemId} assignees are unreadable`);
    if (assigneesConnection.pageInfo?.hasNextPage) {
      fail(`item ${entry.itemId} assignee pagination is incomplete`);
    }
    if (
      Number.isInteger(assigneesConnection.totalCount) &&
      assigneesConnection.totalCount !== nodes.length
    ) {
      fail(`item ${entry.itemId} assignee count mismatch`);
    }
    return { ...entry, assignees: normalizedLogins(nodes) };
  }
  return { ...entry, assignees: normalizedLogins(assigneesConnection) };
}

function inventoryFingerprint(items) {
  return items
    .map(({ itemId, issueId, repository, issueNumber, assignees }) =>
      [
        itemId,
        issueId,
        repository.toLowerCase(),
        issueNumber,
        normalizedLogins(assignees)
          .map((login) => login.toLowerCase())
          .join(','),
      ].join(':')
    )
    .sort();
}

function assertUniqueInventory(items, totalCount) {
  const itemIds = new Set();
  const issueIds = new Set();
  const repoNumbers = new Set();
  for (const item of items) {
    const repoNumber = `${item.repository.toLowerCase()}#${item.issueNumber}`;
    if (itemIds.has(item.itemId) || issueIds.has(item.issueId) || repoNumbers.has(repoNumber)) {
      fail(`duplicate inventory identity ${repoNumber}`);
    }
    itemIds.add(item.itemId);
    issueIds.add(item.issueId);
    repoNumbers.add(repoNumber);
  }
  if (Number.isInteger(totalCount) && totalCount !== items.length) {
    fail(`inventory count mismatch: expected ${totalCount}, observed ${items.length}`);
  }
}

export async function collectAssignedInventory({
  assignedOptionId,
  fetchPage,
  safetyLimit = 1000,
} = {}) {
  if (!assignedOptionId) fail('assigned option id is required');
  if (typeof fetchPage !== 'function') fail('fetchPage is required');
  const items = [];
  const cursors = new Set();
  let cursor = null;
  let totalCount = null;
  for (let page = 0; page < safetyLimit; page += 1) {
    const connection = await fetchPage({ cursor });
    if (!connection || !Array.isArray(connection.nodes) || !connection.pageInfo) {
      fail('inventory page is malformed');
    }
    if (!Number.isInteger(connection.totalCount) || connection.totalCount < 0) {
      fail('inventory totalCount is missing');
    }
    if (totalCount === null) totalCount = connection.totalCount;
    if (connection.totalCount !== totalCount) fail('inventory totalCount changed during scan');
    for (const entry of connection.nodes) {
      if (entry?.status?.optionId === assignedOptionId || entry?.status?.name === 'Assigned') {
        items.push(normalizeInventoryItem(entry, assignedOptionId));
      }
    }
    if (!connection.pageInfo.hasNextPage) {
      assertUniqueInventory(items);
      return items;
    }
    const next = connection.pageInfo.endCursor;
    if (!next) fail('inventory next cursor is missing');
    if (cursors.has(next) || next === cursor) fail(`inventory cursor repeated: ${next}`);
    cursors.add(next);
    cursor = next;
  }
  fail(`inventory pagination safety limit ${safetyLimit} exceeded`);
}

function inspectField(field, cfg) {
  if (!field || field.id !== cfg.kanbanFieldId || !Array.isArray(field.options)) {
    fail(`configured Status field ${cfg.kanbanFieldId} was not found`);
  }
  const assigned = field.options.filter(
    (option) => option.id === cfg.kanbanOptionAssigned || option.name === 'Assigned'
  );
  if (assigned.length !== 1) fail('Assigned option is missing or ambiguous');
  if (assigned[0].id !== cfg.kanbanOptionAssigned)
    fail('configured Assigned option id mismatches live');
  const names = field.options.map(({ name }) =>
    name === 'Assigned' ? 'Ready for Planning' : name
  );
  if (new Set(names).size !== names.length) fail('Ready for Planning option name is ambiguous');
  for (const name of names) {
    if (!EXPECTED_STATUS_ORDER.includes(name)) fail(`unexpected Status option ${name}`);
  }
  for (const required of EXPECTED_STATUS_ORDER) {
    if (!names.includes(required)) fail(`required Status option ${required} is missing`);
  }
  const byName = new Map(field.options.map((option) => [option.name, option]));
  const options = EXPECTED_STATUS_ORDER.map((name) => {
    const source = name === 'Ready for Planning' ? assigned[0] : byName.get(name);
    return { ...source, name };
  });
  return { target: assigned[0], options };
}

function digestPlan(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function fetchStatusFieldProduction({ cfg, gql = defaultGql }) {
  const data = await gql(
    `query($field: ID!) { node(id: $field) { ... on ProjectV2SingleSelectField { id name options { id name color description } } } }`,
    { field: cfg.kanbanFieldId }
  );
  return data?.node;
}

async function fetchInventoryPageProduction({ cfg, cursor, gql = defaultGql }) {
  const data = await gql(
    `query($project: ID!, $cursor: String) { node(id: $project) { ... on ProjectV2 { items(first: 50, after: $cursor) { totalCount pageInfo { hasNextPage endCursor } nodes { id content { ... on Issue { id number repository { nameWithOwner } assignees(first: 100) { totalCount pageInfo { hasNextPage endCursor } nodes { login } } } } fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name optionId } } } } } } }`,
    { project: cfg.projectId, cursor }
  );
  const connection = data?.node?.items;
  return {
    ...connection,
    nodes: (connection?.nodes || []).map((node) => ({
      itemId: node.id,
      issueId: node.content?.id,
      repository: node.content?.repository?.nameWithOwner,
      issueNumber: node.content?.number,
      status: node.fieldValueByName,
      assignees: node.content?.assignees,
    })),
  };
}

export async function inspectReadyForPlanMigration({ cfg, deps = {} } = {}) {
  if (!cfg?.projectId || !cfg.kanbanFieldId || !cfg.kanbanOptionBacklog) fail('config incomplete');
  const assignedOptionId = cfg.kanbanOptionAssigned || cfg.kanbanOptionReadyForPlan;
  if (!assignedOptionId) fail('Assigned compatibility option id is missing');
  const fetchStatusField =
    deps.fetchStatusField || (() => fetchStatusFieldProduction({ cfg, gql: deps.gql }));
  const collectInventory =
    deps.collectInventory ||
    (() =>
      collectAssignedInventory({
        assignedOptionId,
        fetchPage: ({ cursor }) => fetchInventoryPageProduction({ cfg, cursor, gql: deps.gql }),
      }));
  const field = await fetchStatusField();
  const option = inspectField(field, { ...cfg, kanbanOptionAssigned: assignedOptionId });
  const first = await collectInventory();
  const second = await collectInventory();
  assertUniqueInventory(first);
  assertUniqueInventory(second);
  if (
    JSON.stringify(inventoryFingerprint(first)) !== JSON.stringify(inventoryFingerprint(second))
  ) {
    fail('inventory changed between authoritative scans');
  }
  const items = first
    .map((entry) => normalizeInventoryItem(entry, assignedOptionId))
    .sort((a, b) => a.repository.localeCompare(b.repository) || a.issueNumber - b.issueNumber);
  const stable = {
    schema: 'aitm.ready-for-plan-migration-plan/v1',
    projectId: cfg.projectId,
    statusFieldId: cfg.kanbanFieldId,
    backlogOptionId: cfg.kanbanOptionBacklog,
    assignedOptionId,
    items,
    option: {
      id: option.target.id,
      beforeName: 'Assigned',
      afterName: 'Ready for Planning',
      order: [...EXPECTED_STATUS_ORDER],
      options: option.options,
    },
    views: {
      assignedWork: 'is:issue has:assignee',
      owner: 'is:issue assignee:<github-login>',
      unownedBacklog: 'is:issue no:assignee status:Backlog',
      refineWip: 'is:issue status:Refine',
      readyForPlanning: 'is:issue status:"Ready for Planning"',
      verification: 'operator-confirmed read-back when no supported saved-view API is available',
    },
  };
  return Object.freeze({ ...stable, digest: digestPlan(stable), writes: 0 });
}

function defaultJournalPath(projectDir) {
  return readyForPlanMigrationJournalPath(projectDir);
}

function journalDeps({ projectDir, journalPath } = {}) {
  const target = journalPath || defaultJournalPath(projectDir);
  return {
    loadJournal: async () => loadReadyForPlanMigrationJournal({ journalPath: target }),
    saveJournal: async (journal) => {
      mkdirSync(path.dirname(target), { recursive: true });
      const scratch = `${target}.next`;
      writeFileSync(scratch, `${JSON.stringify(journal, null, 2)}\n`);
      renameSync(scratch, target);
    },
  };
}

function assertJournal(journal, plan) {
  if (journal.planDigest !== plan.digest) fail('journal belongs to a different inventory plan');
  if (!MIGRATION_PHASES.includes(journal.phase)) fail('journal phase is malformed');
  for (const [itemId, evidence] of Object.entries(journal.items || {})) {
    for (const key of ['mutation', 'verification']) {
      if (evidence[key] && !MIGRATION_OPERATION_STATES.includes(evidence[key])) {
        fail(`journal item ${itemId} ${key} state is malformed`);
      }
    }
    if (evidence.rollback && evidence.rollback !== 'rolled-back') {
      fail(`journal item ${itemId} rollback state is malformed`);
    }
  }
}

async function moveItemProduction({ item, cfg, gql = defaultGql }) {
  await gql(
    `mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) { updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }) { projectV2Item { id } } }`,
    {
      project: cfg.projectId,
      item: item.itemId,
      field: cfg.kanbanFieldId,
      option: cfg.kanbanOptionBacklog,
    }
  );
}

async function fetchItemSnapshotProduction({ item, gql = defaultGql }) {
  const data = await gql(
    `query($item: ID!) { node(id: $item) { ... on ProjectV2Item { fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name optionId } } content { ... on Issue { assignees(first: 100) { totalCount pageInfo { hasNextPage endCursor } nodes { login } } } } } } }`,
    { item: item.itemId }
  );
  const node = data?.node;
  if (!node || node.content?.assignees?.pageInfo?.hasNextPage)
    fail(`item ${item.itemId} snapshot incomplete`);
  return {
    status: node.fieldValueByName?.name,
    statusOptionId: node.fieldValueByName?.optionId,
    assignees: normalizedLogins(node.content?.assignees?.nodes),
  };
}

async function updateStatusOptionsProduction({ plan, cfg, gql = defaultGql }) {
  await gql(
    `mutation($field: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) { updateProjectV2Field(input: { fieldId: $field, singleSelectOptions: $options }) { projectV2Field { ... on ProjectV2SingleSelectField { id } } } }`,
    { field: cfg.kanbanFieldId, options: plan.option.options }
  );
}

async function fetchProjectViewsProduction({ cfg, gql = defaultGql }) {
  const views = [];
  const cursors = new Set();
  let cursor = null;
  let totalCount = null;
  for (let page = 0; page < 1000; page += 1) {
    const data = await gql(
      `query($project: ID!, $cursor: String) { node(id: $project) { ... on ProjectV2 { views(first: 50, after: $cursor) { totalCount pageInfo { hasNextPage endCursor } nodes { id name layout filter } } } } }`,
      { project: cfg.projectId, cursor }
    );
    const connection = data?.node?.views;
    if (
      !connection ||
      !Array.isArray(connection.nodes) ||
      !Number.isInteger(connection.totalCount)
    ) {
      fail('saved-view connection is malformed');
    }
    if (totalCount === null) totalCount = connection.totalCount;
    if (totalCount !== connection.totalCount) fail('saved-view count changed during scan');
    views.push(...connection.nodes);
    if (!connection.pageInfo?.hasNextPage) {
      if (views.length !== totalCount) fail('saved-view count mismatch');
      return views;
    }
    const next = connection.pageInfo.endCursor;
    if (!next || cursors.has(next) || next === cursor)
      fail('saved-view cursor missing or repeated');
    cursors.add(next);
    cursor = next;
  }
  fail('saved-view pagination safety limit exceeded');
}

export function verifyReadyForPlanViews(views) {
  if (!Array.isArray(views)) fail('saved-view read-back is malformed');
  const assigned = views.find(({ filter }) => /(?:^|\s)has:assignee(?:\s|$)/i.test(filter || ''));
  if (!assigned) fail('assigned-work view with has:assignee filter is missing');
  const board = views.find(({ layout }) => layout === 'BOARD_LAYOUT');
  if (!board) fail('Status board view for Ready for Planning is missing');
  return { verified: true, mode: 'github-read-back' };
}

function verifyRenamedField(field, plan) {
  const options = field?.options || [];
  const names = options.map(({ name }) => name);
  if (JSON.stringify(names) !== JSON.stringify(EXPECTED_STATUS_ORDER))
    fail('Status order read-back mismatch');
  const target = options.find(({ id }) => id === plan.assignedOptionId);
  if (target?.name !== 'Ready for Planning') fail('Assigned option rename read-back mismatch');
  const expectedIds = new Set(plan.option.options.map(({ id }) => id));
  if (options.length !== expectedIds.size || options.some(({ id }) => !expectedIds.has(id))) {
    fail('Status option identity changed during cutover');
  }
}

function cutoverConfigProduction({ cfg, projectDir }) {
  const target = path.join(projectDir || process.cwd(), '.ai-task-manager', 'task-tracker.json');
  const raw = JSON.parse(readFileSync(target, 'utf8'));
  const ids = [
    raw.kanbanOptionReadyForPlan,
    raw.kanbanOptionAssigned,
    raw.kanbanOptionOnDeck,
  ].filter(Boolean);
  if (new Set(ids).size > 1) fail('configuration compatibility option ids conflict');
  raw.kanbanOptionReadyForPlan = cfg.kanbanOptionAssigned || cfg.kanbanOptionReadyForPlan;
  delete raw.kanbanOptionAssigned;
  delete raw.kanbanOptionOnDeck;
  writeFileSync(target, `${JSON.stringify(raw, null, 2)}\n`);
  const verify = JSON.parse(readFileSync(target, 'utf8'));
  return {
    verified:
      verify.kanbanOptionReadyForPlan === raw.kanbanOptionReadyForPlan &&
      !('kanbanOptionAssigned' in verify) &&
      !('kanbanOptionOnDeck' in verify),
    optionId: verify.kanbanOptionReadyForPlan,
  };
}

async function advance(saveJournal, journal, phase, extra = {}) {
  const next = { ...journal, ...extra, phase, updatedAt: new Date().toISOString() };
  await saveJournal(next);
  return next;
}

function isBacklogSnapshot(snapshot, backlogOptionId) {
  return (
    snapshot?.status === 'Backlog' &&
    (!Object.hasOwn(snapshot, 'statusOptionId') || snapshot.statusOptionId === backlogOptionId)
  );
}

export async function applyReadyForPlanMigration({ plan, cfg, deps = {}, projectDir } = {}) {
  if (
    plan?.schema !== 'aitm.ready-for-plan-migration-plan/v1' ||
    plan.digest !==
      digestPlan({
        schema: plan.schema,
        projectId: plan.projectId,
        statusFieldId: plan.statusFieldId,
        backlogOptionId: plan.backlogOptionId,
        assignedOptionId: plan.assignedOptionId,
        items: plan.items,
        option: plan.option,
        views: plan.views,
      })
  )
    fail('plan digest mismatch');
  const storage = journalDeps({ projectDir, journalPath: deps.journalPath });
  const loadJournal = deps.loadJournal || storage.loadJournal;
  const saveJournal = deps.saveJournal || storage.saveJournal;
  const moveItemToBacklog =
    deps.moveItemToBacklog || ((args) => moveItemProduction({ ...args, cfg, gql: deps.gql }));
  const fetchItemSnapshot =
    deps.fetchItemSnapshot || ((args) => fetchItemSnapshotProduction({ ...args, gql: deps.gql }));
  const fetchStatusField =
    deps.fetchStatusField || (() => fetchStatusFieldProduction({ cfg, gql: deps.gql }));
  const updateStatusOptions =
    deps.updateStatusOptions || (() => updateStatusOptionsProduction({ plan, cfg, gql: deps.gql }));
  const collectInventory =
    deps.collectInventory ||
    (() =>
      collectAssignedInventory({
        assignedOptionId: plan.assignedOptionId,
        fetchPage: ({ cursor }) => fetchInventoryPageProduction({ cfg, cursor, gql: deps.gql }),
      }));
  const cutoverConfig = deps.cutoverConfig || (() => cutoverConfigProduction({ cfg, projectDir }));
  const verifyViews =
    deps.verifyViews ||
    (async () =>
      verifyReadyForPlanViews(await fetchProjectViewsProduction({ cfg, gql: deps.gql })));

  let journal = await loadJournal();
  if (!journal) {
    journal = await advance(
      saveJournal,
      { planDigest: plan.digest, plan: structuredClone(plan), items: {} },
      'inventory-complete'
    );
  } else {
    assertJournal(journal, plan);
    if (journal.phase === 'final-verification') {
      return {
        verified: true,
        journal,
        migratedItems: plan.items.length,
        optionId: plan.assignedOptionId,
      };
    }
  }

  const itemState = { ...(journal.items || {}) };
  for (const item of plan.items) {
    let snapshot = await fetchItemSnapshot({ item });
    let mutation = itemState[item.itemId]?.mutation || 'observed';
    if (!isBacklogSnapshot(snapshot, plan.backlogOptionId)) {
      try {
        await moveItemToBacklog({ item });
        mutation = 'applied';
      } catch (error) {
        snapshot = await fetchItemSnapshot({ item });
        if (!isBacklogSnapshot(snapshot, plan.backlogOptionId)) throw error;
        mutation = 'observed';
      }
      snapshot = await fetchItemSnapshot({ item });
    }
    if (!isBacklogSnapshot(snapshot, plan.backlogOptionId)) {
      fail(`item ${item.itemId} Status read-back mismatch`);
    }
    if (!sameLogins(snapshot.assignees, item.assignees)) {
      fail(`item ${item.itemId} assignee read-back mismatch`);
    }
    itemState[item.itemId] = {
      status: 'Backlog',
      assignees: normalizedLogins(snapshot.assignees),
      mutation,
      verification: 'verified',
      rollback: null,
    };
    journal = await advance(saveJournal, journal, journal.phase, { items: itemState });
  }
  journal = await advance(saveJournal, journal, 'items-moved-to-backlog', { items: itemState });
  for (const item of plan.items) {
    const snapshot = await fetchItemSnapshot({ item });
    if (
      !isBacklogSnapshot(snapshot, plan.backlogOptionId) ||
      !sameLogins(snapshot.assignees, item.assignees)
    ) {
      fail(`item ${item.itemId} final read-back mismatch`);
    }
  }
  journal = await advance(saveJournal, journal, 'items-verified');

  let liveField = await fetchStatusField();
  const alreadyRenamed = liveField?.options?.some(
    ({ id, name }) => id === plan.assignedOptionId && name === 'Ready for Planning'
  );
  if (!alreadyRenamed) await updateStatusOptions({ plan });
  liveField = await fetchStatusField();
  verifyRenamedField(liveField, plan);
  journal = await advance(saveJournal, journal, 'option-renamed');
  journal = await advance(saveJournal, journal, 'option-reordered');

  const configResult = await cutoverConfig({ plan, cfg });
  if (!configResult?.verified || configResult.optionId !== plan.assignedOptionId) {
    fail('configuration cutover read-back mismatch');
  }
  journal = await advance(saveJournal, journal, 'config-cutover');

  const remaining = await collectInventory();
  if (remaining.length !== 0)
    fail(`final inventory still contains ${remaining.length} Assigned item(s)`);
  const views = await verifyViews({ plan });
  if (!views?.verified)
    fail('saved-view verification is pending; follow the emitted operator steps');
  journal = await advance(saveJournal, journal, 'final-verification', { views });
  return {
    verified: true,
    journal,
    migratedItems: plan.items.length,
    optionId: plan.assignedOptionId,
  };
}
