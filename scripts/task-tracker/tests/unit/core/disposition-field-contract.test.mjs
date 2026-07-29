// @story #1035
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULTS, TYPES } from '../../../config.mjs';
import { buildUpdates } from '../../../lib/config-init/config-authoring.mjs';
import { fieldIdFor } from '../../../project-fields.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../../..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));

const expectedDisposition = {
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

test('default and tracked field schemas share the terminal Disposition contract', () => {
  const defaults = json('config/project-fields.default.json');
  const tracked = json('.ai-task-manager/project-fields.json');
  assert.deepEqual(
    defaults.find((field) => field.key === 'disposition'),
    expectedDisposition
  );
  assert.deepEqual(tracked, defaults);
});

test('config loader and authoring preserve fieldDisposition compatibility projection', () => {
  assert.equal(DEFAULTS.fieldDisposition, '');
  assert.equal(TYPES.fieldDisposition, 'string');
  assert.equal(fieldIdFor({ fieldDisposition: 'F_DIRECT' }, 'disposition'), 'F_DIRECT');
  assert.equal(fieldIdFor({ fieldIds: { disposition: 'F_MAP' } }, 'disposition'), 'F_MAP');

  const updates = buildUpdates({
    FIELD_DISPOSITION: 'F_DISPOSITION',
    FIELD_IDS_JSON: '{"disposition":"F_DISPOSITION"}',
  });
  assert.equal(updates.fieldDisposition, 'F_DISPOSITION');
  assert.equal(updates.fieldIds.disposition, 'F_DISPOSITION');
});

test('fresh-init shell projects the generic disposition field into task-tracker config', () => {
  const source = read('scripts/gh/init-project-config.sh');
  assert.match(source, /FIELD_DISPOSITION=""/);
  assert.match(source, /disposition\)\s+FIELD_DISPOSITION="\$RESULT_FIELD_ID"/);
  assert.match(source, /FIELD_DISPOSITION="\$FIELD_DISPOSITION"\s+\\/);
});

test('workflow guide documents the positive delivered-only query', () => {
  const workflow = read('docs/guides/workflow.md');
  assert.match(workflow, /is:closed Disposition:Delivered/);
  assert.match(workflow, /Delivered.*Replaced.*Discarded.*Duplicate/s);
});
