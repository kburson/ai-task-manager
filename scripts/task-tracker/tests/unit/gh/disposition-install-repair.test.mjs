// @story #1035
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ensureDispositionField, persistDispositionField } from '../../../../gh/init-repair.mjs';

const definition = {
  key: 'disposition',
  name: 'Disposition',
  type: 'single_select',
  aliases: [],
  options: [
    { name: 'Delivered', color: 'GREEN', description: 'Work shipped to trunk' },
    { name: 'Replaced', color: 'PURPLE', description: 'Work was superseded by another issue' },
    { name: 'Discarded', color: 'GRAY', description: 'Closed without retained delivery' },
    { name: 'Duplicate', color: 'YELLOW', description: 'Duplicates another issue' },
  ],
};

function gqlHarness(fields = []) {
  const calls = [];
  const gql = async (query, variables) => {
    calls.push({ query, variables });
    if (query.includes('fields(first: 100)')) {
      return { node: { fields: { nodes: fields } } };
    }
    if (query.includes('createProjectV2Field')) {
      return { createProjectV2Field: { projectV2Field: { id: 'F_CREATED' } } };
    }
    if (query.includes('updateProjectV2Field')) {
      return { updateProjectV2Field: { projectV2Field: { id: variables.field } } };
    }
    throw new Error(`unexpected gql: ${query}`);
  };
  return { gql, calls };
}

test('repair reuses an existing complete Disposition field without mutation', async () => {
  const field = { id: 'F_EXISTING', name: 'Disposition', options: definition.options };
  const h = gqlHarness([field]);
  const result = await ensureDispositionField({
    projectId: 'P',
    definition,
    gqlFn: h.gql,
  });
  assert.deepEqual(result, {
    fieldId: 'F_EXISTING',
    created: false,
    optionsUpdated: false,
  });
  assert.equal(h.calls.length, 1);
});

test('repair creates a missing Disposition field with the canonical options', async () => {
  const h = gqlHarness([]);
  const result = await ensureDispositionField({
    projectId: 'P',
    definition,
    gqlFn: h.gql,
  });
  assert.equal(result.fieldId, 'F_CREATED');
  assert.equal(result.created, true);
  const create = h.calls.find((call) => call.query.includes('createProjectV2Field'));
  assert.deepEqual(create.variables.options, definition.options);
});

test('repair appends missing canonical options while preserving existing option ids', async () => {
  const field = {
    id: 'F_EXISTING',
    name: 'Disposition',
    options: [{ id: 'O_DELIVERED', ...definition.options[0] }],
  };
  const h = gqlHarness([field]);
  const result = await ensureDispositionField({
    projectId: 'P',
    definition,
    gqlFn: h.gql,
  });
  assert.equal(result.optionsUpdated, true);
  const update = h.calls.find((call) => call.query.includes('updateProjectV2Field'));
  assert.deepEqual(update.variables.options[0], {
    id: 'O_DELIVERED',
    ...definition.options[0],
  });
  assert.deepEqual(
    update.variables.options.slice(1).map((option) => option.name),
    ['Replaced', 'Discarded', 'Duplicate']
  );
});

test('persistDispositionField writes both compatibility and generic projections idempotently', () => {
  const cfg = { fieldIds: { priority: 'F_PRIORITY' } };
  assert.equal(persistDispositionField(cfg, 'F_DISPOSITION'), true);
  assert.equal(cfg.fieldDisposition, 'F_DISPOSITION');
  assert.deepEqual(cfg.fieldIds, {
    priority: 'F_PRIORITY',
    disposition: 'F_DISPOSITION',
  });
  assert.equal(persistDispositionField(cfg, 'F_DISPOSITION'), false);
});
